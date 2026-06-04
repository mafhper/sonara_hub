export function renderCanvasSize(outputSize, settings = {}) {
  if (settings.qualityProfile === "final") return outputSize;

  const limit =
    settings.qualityProfile === "fast" || settings.renderMode === "batch"
      ? { width: 1280, height: 720 }
      : { width: 1920, height: 1080 };
  const scale = Math.min(
    1,
    limit.width / outputSize.width,
    limit.height / outputSize.height,
  );
  return {
    width: Math.round(outputSize.width * scale),
    height: Math.round(outputSize.height * scale),
  };
}

export function renderTiming(settings = {}) {
  if (settings.qualityProfile === "final") {
    return { webglFps: 30, outputFps: 30, encoderPreset: "medium" };
  }
  if (settings.qualityProfile === "fast" || settings.renderMode === "batch") {
    return { webglFps: 15, outputFps: 24, encoderPreset: "veryfast" };
  }
  // "auto" is the default path. Crispness now comes from the VP9 high-bitrate
  // intermediate + CRF (see webgl-export/index), so we keep the cheaper 24 fps /
  // veryfast here to stay fast on CPU/SwiftShader; "final" carries 30 fps/medium.
  return { webglFps: 24, outputFps: 24, encoderPreset: "veryfast" };
}
