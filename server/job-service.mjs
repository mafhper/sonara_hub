import fs from "node:fs/promises";
import path from "node:path";

const canceledErrorCode = "JOB_CANCELED";

export function createCanceledJobError(message = "Job cancelado") {
  const error = new Error(message);
  error.code = canceledErrorCode;
  return error;
}

export function isCanceledJobError(error) {
  return error?.code === canceledErrorCode;
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
