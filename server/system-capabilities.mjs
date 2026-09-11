import os from "node:os";
import { availableParallelism } from "node:os";
import { detectHardwareEncoders } from "./ffmpeg-hardware.mjs";
import {
  isHardwareWebglRenderer,
  normalizeGpuInfo,
  probeWebglCapabilities,
} from "./webgl-export.mjs";

let cache = null;

export function clearSystemCapabilitiesCache() {
  cache = null;
}

// Sensible opt-in defaults derived from what the machine actually has:
// dedicated WebGL GPU -> hardware mode; AMF/QSV/NVENC present -> auto encoder;
// adaptive pacing whenever the frame loop can benefit from it.
export function computeRenderRecommendations(capabilities = {}) {
  const gpuIsHardware = Boolean(capabilities.gpu?.isHardware);
  const hardwareEncoderAvailable = Boolean(capabilities.ffmpeg?.preferred);
  return Object.freeze({
    gpuMode: gpuIsHardware ? "hardware" : "software",
    capturePacing: "adaptive",
    encoderMode: hardwareEncoderAvailable ? "auto" : "software",
  });
}

export async function readSystemCapabilities({
  platform = process.platform,
  parallelism = Math.max(1, availableParallelism()),
  cpuModel,
  renderConcurrency = null,
  audioConcurrency = null,
  forceRefresh = false,
  probeGpu = () => probeWebglCapabilities("hardware"),
  detectEncoders = detectHardwareEncoders,
} = {}) {
  if (!forceRefresh && cache) return cache;

  let resolvedCpuModel = cpuModel;
  if (resolvedCpuModel === undefined) {
    resolvedCpuModel = os.cpus()[0]?.model?.trim() || null;
  }

  const [gpu, encoders] = await Promise.all([
    Promise.resolve()
      .then(probeGpu)
      .catch((error) => ({
        ...normalizeGpuInfo({}),
        probeError: error?.message ?? String(error),
      })),
    Promise.resolve()
      .then(() => detectEncoders())
      .catch((error) => ({
        available: [],
        h264: null,
        errorCode: error?.code ?? "FFMPEG_PROBE_FAILED",
        probeError: error?.message ?? String(error),
      })),
  ]);

  const normalizedGpu = {
    ...normalizeGpuInfo(gpu),
    isHardware: isHardwareWebglRenderer(gpu),
    ...(gpu?.probeError ? { probeError: String(gpu.probeError) } : {}),
  };
  const ffmpeg = {
    available: !encoders?.errorCode,
    preferred: encoders?.h264 ?? null,
    hardwareEncoders: Array.isArray(encoders?.available)
      ? encoders.available
      : [],
    errorCode: encoders?.errorCode ?? null,
  };

  const capabilities = {
    detectedAt: new Date().toISOString(),
    platform,
    cpu: { cores: parallelism, model: resolvedCpuModel },
    gpu: normalizedGpu,
    ffmpeg,
    concurrency: {
      render: renderConcurrency ?? null,
      audio: audioConcurrency ?? null,
    },
    recommendations: computeRenderRecommendations({
      gpu: normalizedGpu,
      ffmpeg,
    }),
  };
  cache = capabilities;
  return capabilities;
}
