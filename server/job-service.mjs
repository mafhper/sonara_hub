import fs from "node:fs/promises";
import path from "node:path";

const canceledErrorCode = "JOB_CANCELED";
const canceledWorkerErrorCode = "JOB_WORKER_CANCELED";
const retryableErrorCodes = new Set([
  "FFMPEG_OUTPUT_INVALID",
  "FFMPEG_PROCESS_FAILED",
  "JOB_WORKER_EXIT",
  "JOB_WORKER_TIMEOUT",
  "WEBGL_CONTEXT_LOST",
]);

export function createCanceledJobError(message = "Job cancelado") {
  const error = new Error(message);
  error.code = canceledErrorCode;
  return error;
}

export function isCanceledJobError(error) {
  return (
    error?.code === canceledErrorCode || error?.code === canceledWorkerErrorCode
  );
}

export function normalizeJobError(error, fallbackCode) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    message,
    errorCode: error?.code ? String(error.code) : fallbackCode,
    errorDetail:
      error?.detail ??
      (error instanceof Error ? error.stack || error.message : String(error)),
  };
}

export function isRetryableJobError(error) {
  if (!error || isCanceledJobError(error)) return false;
  const code = error?.code ? String(error.code) : "";
  if (retryableErrorCodes.has(code)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /WebM (truncado|vazio|incompleto|invalido)|cabecalho WebM|não pode ser decodificada|nao pode ser decodificada/i.test(
    message,
  );
}

export async function runJobWithRetry({
  delay = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  getJob,
  jobId,
  maxAttempts = 2,
  retryDelayMs = 750,
  shouldRetry = isRetryableJobError,
  updateJob,
  worker,
}) {
  let attempt = Math.max(0, Number(getJob?.(jobId)?.attempt ?? 0));
  const limit = Math.max(1, Number(maxAttempts) || 1);

  while (attempt < limit) {
    attempt += 1;
    updateJob(jobId, {
      attempt,
      maxAttempts: limit,
      nextAttemptAt: null,
    });

    try {
      const result = await worker({ attempt, maxAttempts: limit });
      updateJob(jobId, {
        errorCode: undefined,
        errorDetail: undefined,
        nextAttemptAt: null,
      });
      return result;
    } catch (error) {
      if (
        isCanceledJobError(error) ||
        attempt >= limit ||
        !shouldRetry(error)
      ) {
        throw error;
      }
      const current = getJob?.(jobId) ?? {};
      const retryAt = new Date(Date.now() + retryDelayMs).toISOString();
      const normalized = normalizeJobError(error, "JOB_RETRYABLE_ERROR");
      updateJob(jobId, {
        status: "queued",
        progress: Math.min(98, Math.max(0, Number(current.progress ?? 0))),
        message: `Falha recuperável em ${stageLabel(current.stage)}; nova tentativa ${attempt + 1}/${limit}`,
        errorCode: normalized.errorCode,
        errorDetail: normalized.errorDetail,
        nextAttemptAt: retryAt,
        retryHistory: [
          ...(Array.isArray(current.retryHistory) ? current.retryHistory : []),
          {
            attempt,
            errorCode: normalized.errorCode,
            failedAt: new Date().toISOString(),
            message: normalized.message,
            retryAt,
            stage: current.stage ?? null,
          },
        ],
      });
      await delay(retryDelayMs);
    }
  }
}

export function createJobRunner({
  cleanupWorkDir,
  fallbackErrorCode,
  isCanceled = isCanceledJobError,
  releaseTempFiles,
  runQueuedJob,
  updateJob,
}) {
  return async (options, worker) => {
    try {
      await runQueuedJob(options.jobId, () => worker(options));
    } catch (error) {
      if (!isCanceled(error)) {
        updateJob(options.jobId, {
          status: "error",
          ...normalizeJobError(error, fallbackErrorCode),
        });
      }
    } finally {
      await releaseTempFiles?.();
      await cleanupWorkDir?.(options.jobId);
    }
  };
}

export function createJobQueue({ concurrency = 1, onError } = {}) {
  const limit = Math.max(1, Math.floor(Number(concurrency) || 1));
  const pending = [];
  let active = 0;

  function schedule() {
    while (active < limit && pending.length > 0) {
      const task = pending.shift();
      active += 1;
      Promise.resolve()
        .then(task)
        .catch((error) => {
          onError?.(error);
        })
        .finally(() => {
          active -= 1;
          schedule();
        });
    }
  }

  return {
    enqueue(task) {
      if (typeof task !== "function") {
        throw new TypeError("Job queue task must be a function.");
      }
      pending.push(task);
      schedule();
    },
    snapshot() {
      return {
        active,
        concurrency: limit,
        pending: pending.length,
      };
    },
  };
}

export function resolveJobConcurrency({
  configured,
  defaultConcurrency = 1,
  max = 4,
  min = 1,
} = {}) {
  const lower = Math.max(1, Math.floor(Number(min) || 1));
  const upper = Math.max(lower, Math.floor(Number(max) || lower));
  const configuredValue = Number(configured);
  if (Number.isFinite(configuredValue) && configuredValue > 0) {
    return clampConcurrency(configuredValue, lower, upper);
  }
  return clampConcurrency(defaultConcurrency, lower, upper);
}

function clampConcurrency(value, min, max) {
  const normalized = Math.floor(Number(value) || min);
  return Math.min(max, Math.max(min, normalized));
}

export function createJobStageTracker({
  clock = () => Date.now(),
  jobId,
  updateJob,
}) {
  let current = null;
  const timings = [];
  const snapshot = () => timings.map((item) => ({ ...item }));

  function closeCurrent(endedAt = clock()) {
    if (!current) return;
    timings.push({
      stage: current.stage,
      label: current.label,
      startedAt: current.startedAtIso,
      endedAt: new Date(endedAt).toISOString(),
      durationMs: Math.max(0, Math.round(endedAt - current.startedAtMs)),
    });
    current = null;
  }

  return {
    enter(stage, patch = {}) {
      const now = clock();
      closeCurrent(now);
      current = {
        label: patch.message ? String(patch.message) : stage,
        stage,
        startedAtIso: new Date(now).toISOString(),
        startedAtMs: now,
      };
      updateJob(jobId, {
        ...patch,
        stage,
        stageStartedAt: current.startedAtIso,
        stageTimings: snapshot(),
      });
    },
    finish(patch = {}) {
      closeCurrent();
      updateJob(jobId, {
        ...patch,
        stage: patch.stage ?? "complete",
        stageStartedAt: null,
        stageTimings: snapshot(),
      });
    },
    timings: snapshot,
  };
}

export async function cleanupJobWorkDir(workDir, jobId, warn = console.warn) {
  try {
    await fs.rm(path.join(workDir, jobId), {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 120,
    });
  } catch (error) {
    warn(
      `Não foi possível limpar o diretório de trabalho ${jobId}: ${error?.code ?? error}`,
    );
  }
}

function stageLabel(stage) {
  return stage ? String(stage) : "job";
}
