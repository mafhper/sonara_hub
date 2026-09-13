import {
  JOB_WORKER_CANCELED_CODE,
  JOB_WORKER_EXIT_CODE,
} from "./job-worker.mjs";
import {
  renderPublicationAssetJob,
  renderVideoJob,
} from "./render-job-core.mjs";
import {
  createResourceSampler,
  createSampleStreamThrottle,
  createWindowsGpuDedicatedUsageReader,
  createWindowsGpuEngineUsageReader,
  samplerIntervalFromEnv,
  vramReaderOptionsFromEnv,
} from "./resource-sampler.mjs";

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
  const stageState = { current: undefined };
  const gpuReaderEnabled =
    process.platform === "win32" &&
    process.env.SONARA_RESOURCE_SAMPLER_DISABLED !== "1" &&
    (process.env.SONARA_ADAPTIVE_SCHEDULER === "1" ||
      process.env.SONARA_VRAM_READER_ENABLED === "1");
  const additionalReaders = gpuReaderEnabled
    ? [
        createWindowsGpuDedicatedUsageReader(vramReaderOptionsFromEnv()),
        createWindowsGpuEngineUsageReader(),
      ]
    : [];
  const sampleIpc = createSampleStreamThrottle({
    intervalMs: resourceSampleIpcMsFromEnv(),
  });
  const sampler = createResourceSampler({
    intervalMs: samplerIntervalFromEnv(),
    getStage: () => stageState.current,
    enabled: process.env.SONARA_RESOURCE_SAMPLER_DISABLED !== "1",
    additionalReaders,
    onSample: (sample) => {
      const forwarded = sampleIpc(sample);
      if (forwarded) {
        send({
          type: "resource-sample",
          jobId,
          sample: resourceSamplePayload(forwarded),
        });
      }
    },
  });
  sampler.start();
  const updateJob = (_jobId, patch) => {
    if (patch.stage) {
      stageState.current = patch.stage;
    }
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
    const onGpuTelemetryLine = (line, level) =>
      send({ type: "gpu-log", jobId, line, level });
    const onRenderHealth = (event) =>
      send({ type: "render-health", jobId, event });
    if (kind === "video-render") {
      await renderVideoJob({
        ...payload,
        jobId,
        updateJob,
        shouldCancel: () => cancelRequested,
        onGpuTelemetryLine,
        onRenderHealth,
      });
    } else if (kind === "publication-asset") {
      await renderPublicationAssetJob({
        ...payload,
        jobId,
        updateJob,
        shouldCancel: () => cancelRequested,
        onGpuTelemetryLine,
        onRenderHealth,
      });
    } else {
      throw workerError(`Tipo de job não suportado pelo worker: ${kind}`);
    }
    const report = sampler.stop();
    send({
      type: "result",
      jobId,
      patch: { ...(finalPatch ?? {}), ...resourcePatch(report) },
    });
    scheduleExit(0);
  } catch (error) {
    sampler.stop();
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

function resourcePatch(report) {
  if (!report || !report.aggregate || report.samples.length === 0) return {};
  return {
    resourceMetrics: report.aggregate,
    resourceSamples: report.samples,
  };
}

// F4.1 — Projeção mínima do sample sanitizado para o payload de correlação do
// processo principal: só os campos acordados (jobId vai no envelope da mensagem;
// `cpu` é o workerCpu observado). `stage` significa "o job estava identificado
// como `stage` quando a amostra foi produzida" — não prova a pertença de todo o
// intervalo àquele stage (calibração é papel do F4.2+).
function resourceSamplePayload(sample) {
  const vramTotal = sample.vramTotalBytes > 0 ? sample.vramTotalBytes : null;
  return {
    t: sample.t,
    stage: sample.stage,
    cpu: sample.workerCpu,
    rss: sample.rssBytes,
    ramFree: sample.freeMemBytes,
    gpu3d: sample.gpu3d,
    gpuCopy: sample.gpuCopy,
    vcn: sample.vcn,
    vramUsedBytes: sample.vramUsedBytes,
    vramTotalBytes: vramTotal,
    vramUsedPct:
      vramTotal !== null ? (sample.vramUsedBytes / vramTotal) * 100 : 0,
  };
}

function resourceSampleIpcMsFromEnv() {
  const value = Number(process.env.SONARA_RESOURCE_SAMPLE_IPC_MS);
  return Number.isFinite(value) && value >= 50 ? Math.floor(value) : 5000;
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
