import fs from "node:fs/promises";
import path from "node:path";

const activeStatuses = new Set(["queued", "paused", "running"]);

export async function loadJobHistory(filePath) {
  try {
    const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (!Array.isArray(payload)) return [];
    return restoreInterruptedJobs(payload, new Date(), {
      existingPayloadRefs: await existingPayloadRefs(payload),
    });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveJobHistory(filePath, jobs, limit = 50) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const tempPath = `${filePath}.tmp`;
  const recent = [...jobs].slice(-limit);
  await fs.writeFile(tempPath, `${JSON.stringify(recent, null, 2)}\n`, "utf8");
  try {
    await fs.rename(tempPath, filePath);
  } catch (err) {
    // On Windows, rename can fail with EPERM when the destination is locked by
    // another process (antivirus, OneDrive sync, etc.). Fall back to copyFile +
    // unlink which works even when the destination is open.
    if (err?.code !== "EPERM" && err?.code !== "EBUSY") throw err;
    await fs.copyFile(tempPath, filePath);
    await fs.unlink(tempPath).catch(() => undefined);
  }
}

export function restoreInterruptedJobs(jobs, now = new Date(), options = {}) {
  const restoredAt = new Date(now);
  return jobs.map((job) => {
    if (!activeStatuses.has(job.status)) return job;
    const stagePatch = closeInterruptedStage(job, restoredAt);
    if (job.cancelRequested) {
      return {
        ...job,
        ...stagePatch,
        status: "canceled",
        message:
          "Processamento cancelado antes da reinicializacao do servidor local",
        updatedAt: restoredAt.toISOString(),
      };
    }
    const canRetry = canRetryInterruptedJob(job, options.existingPayloadRefs);
    if (canRetry) {
      return {
        ...job,
        ...stagePatch,
        recovered: true,
        status: "queued",
        message:
          "Job recuperado após reinicialização; aguardando nova tentativa",
        nextAttemptAt: null,
        updatedAt: restoredAt.toISOString(),
      };
    }
    return {
      ...job,
      ...stagePatch,
      status: "error",
      errorCode: job.payloadRef ? "JOB_PAYLOAD_MISSING" : "server-restart",
      errorDetail:
        job.errorDetail ??
        (job.payloadRef
          ? "O payload persistente do job não foi encontrado para retomar a execução."
          : "O servidor local foi encerrado antes de concluir este job."),
      message: job.payloadRef
        ? "Processamento interrompido e payload de retomada ausente"
        : "Processamento interrompido pela reinicializacao do servidor local",
      updatedAt: restoredAt.toISOString(),
    };
  });
}

async function existingPayloadRefs(jobs) {
  const refs = jobs
    .filter((job) => activeStatuses.has(job.status) && job.payloadRef)
    .map((job) => job.payloadRef);
  const found = new Set();
  await Promise.all(
    refs.map(async (payloadRef) => {
      try {
        const stat = await fs.stat(payloadRef);
        if (stat.isFile()) found.add(payloadRef);
      } catch {
        // Missing payload is handled during restore.
      }
    }),
  );
  return found;
}

function canRetryInterruptedJob(job, existingRefs) {
  if (!job.payloadRef) return false;
  if (existingRefs && !existingRefs.has(job.payloadRef)) return false;
  const attempt = Math.max(0, Number(job.attempt ?? 0));
  const maxAttempts = Math.max(1, Number(job.maxAttempts ?? 1));
  return attempt < maxAttempts;
}

function closeInterruptedStage(job, restoredAt) {
  if (!job.stage || !job.stageStartedAt) {
    return { stageStartedAt: null };
  }
  const startedAt = new Date(job.stageStartedAt);
  const durationMs = Number.isNaN(startedAt.getTime())
    ? 0
    : Math.max(0, Math.round(restoredAt.getTime() - startedAt.getTime()));
  return {
    stageStartedAt: null,
    stageTimings: [
      ...(Array.isArray(job.stageTimings) ? job.stageTimings : []),
      {
        durationMs,
        endedAt: restoredAt.toISOString(),
        interrupted: true,
        label: job.message || job.stage,
        stage: job.stage,
        startedAt: job.stageStartedAt,
      },
    ],
  };
}
