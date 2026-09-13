import { parseFile } from "music-metadata";

// Semântica das métricas de duração (PR1 — duração de exportação explícita):
//
//   requestedDurationSeconds      — duração RESOLVIDA para execução, derivada do
//                                   áudio/metadados/preset (não é a solicitação
//                                   bruta do cliente, e não existe no enqueue —
//                                   só no worker após analyzeAudio).
//   actualCaptureDurationSeconds  — duração ESTIMADA do material capturado no
//                                   WebGL/WebM via frames/WebGLFPS. É evidência
//                                   de frame count; pacing/composição podem
//                                   divergir do tempo real (não é "duração real").
//   actualMuxDurationSeconds      — duração lida do artefato final
//                                   (format.duration via music-metadata). Fonte
//                                   mais confiável.
//   captureRatio                  — capturado / solicitado (diagnóstico).
//   captureToMuxDeltaSeconds      — mux − capture (diagnóstico pós-captura;
//                                   mismatch não é falha — aponta problema).
//
// Contrato de agrupamento: durationMetrics só carrega métricas temporais do
// CONTEÚDO produzido; tempos de execução dos stages vivem em stageTimings.

const DURATION_METRIC_KEYS = [
  "requestedDurationSeconds",
  "actualCaptureDurationSeconds",
  "actualMuxDurationSeconds",
];

export function captureDurationSeconds(capturedFrames, webglFps) {
  const frames = Number(capturedFrames);
  const fps = Number(webglFps);
  if (!Number.isFinite(frames) || frames < 0) return null;
  if (!Number.isFinite(fps) || fps <= 0) return null;
  return roundSeconds(frames / fps);
}

export function mergeDurationMetrics(current, patch) {
  const next = { ...(current ?? {}) };
  if (patch == null || typeof patch !== "object") return next;
  for (const key of DURATION_METRIC_KEYS) {
    const value = patch[key];
    if (value == null) continue;
    const numeric = Number(value);
    next[key] = Number.isFinite(numeric) ? roundSeconds(numeric) : null;
  }
  const requested = Number(next.requestedDurationSeconds);
  const captured =
    next.actualCaptureDurationSeconds == null
      ? null
      : Number(next.actualCaptureDurationSeconds);
  next.captureRatio =
    captured != null && Number.isFinite(requested) && requested > 0
      ? roundSeconds(captured / requested)
      : null;
  const muxed =
    next.actualMuxDurationSeconds == null
      ? null
      : Number(next.actualMuxDurationSeconds);
  next.captureToMuxDeltaSeconds =
    captured != null && muxed != null ? roundSeconds(muxed - captured) : null;
  return next;
}

export function mergeCaptureDurationMetrics(current, event, webglFps) {
  if (event?.type !== "capture-frame-count") return { ...(current ?? {}) };
  return mergeDurationMetrics(current, {
    actualCaptureDurationSeconds: captureDurationSeconds(
      event.capturedFrames,
      webglFps,
    ),
  });
}

export async function readOutputDurationSeconds(filePath) {
  try {
    const metadata = await parseFile(filePath, { skipCovers: true });
    const seconds = Number(metadata.format?.duration);
    return Number.isFinite(seconds) && seconds >= 0
      ? roundSeconds(seconds)
      : null;
  } catch {
    return null;
  }
}

function roundSeconds(value) {
  return Math.round(value * 10000) / 10000;
}
