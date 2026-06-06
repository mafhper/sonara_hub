import {
  JOB_WORKER_CANCELED_CODE,
  JOB_WORKER_EXIT_CODE,
} from "./job-worker.mjs";
import {
  renderPublicationAssetJob,
  renderVideoJob,
} from "./render-job-core.mjs";

let cancelRequested = false;

process.on("message", async (message) => {
  if (!message || typeof message !== "object") return;
  if (message.type === "cancel") {
    cancelRequested = true;
    return;
  }
  if (message.type !== "run") return;
  await runWorkerMessage(message);
});

async function runWorkerMessage({ kind, jobId, payload }) {
  let finalPatch = null;
  const updateJob = (_jobId, patch) => {
    if (patch.status === "done") {
      finalPatch = patch;
    }
    if (
      patch.stage ||
      patch.stageTimings ||
      patch.stageStartedAt !== undefined
    ) {
      send({
        type: "stage",
        jobId,
        stage: patch.stage,
        stageStartedAt: patch.stageStartedAt,
        stageTimings: patch.stageTimings,
        progress: patch.progress,
        message: patch.message,
        patch,
      });
      return;
    }
    send({
      type: "progress",
      jobId,
      progress: patch.progress,
      message: patch.message,
      patch,
    });
  };

  try {
    if (kind === "video-render") {
      await renderVideoJob({
        ...payload,
        jobId,
        updateJob,
        shouldCancel: () => cancelRequested,
      });
    } else if (kind === "publication-asset") {
      await renderPublicationAssetJob({
        ...payload,
        jobId,
        updateJob,
        shouldCancel: () => cancelRequested,
      });
    } else {
      throw workerError(`Tipo de job não suportado pelo worker: ${kind}`);
    }
    send({ type: "result", jobId, patch: finalPatch ?? {} });
    scheduleExit(0);
  } catch (error) {
    send({
      type: "error",
      jobId,
      message:
        cancelRequested || error?.code === "JOB_CANCELED"
          ? "Worker de render/export cancelado."
          : error instanceof Error
            ? error.message
            : String(error),
      errorCode:
        cancelRequested || error?.code === "JOB_CANCELED"
          ? JOB_WORKER_CANCELED_CODE
          : String(error?.code || JOB_WORKER_EXIT_CODE),
      errorDetail:
        error?.detail ??
        (error instanceof Error ? error.stack || error.message : String(error)),
    });
    scheduleExit(cancelRequested || error?.code === "JOB_CANCELED" ? 0 : 1);
  }
}

function send(message) {
  if (process.send) {
    process.send(message);
  }
}

function workerError(message) {
  const error = new Error(message);
  error.code = JOB_WORKER_EXIT_CODE;
  return error;
}

function scheduleExit(code) {
  setImmediate(() => {
    process.exit(code);
  });
}
