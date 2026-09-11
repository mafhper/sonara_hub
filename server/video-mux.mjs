import {
  detectHardwareEncoders,
  selectHardwareH264Encoder,
} from "./ffmpeg-hardware.mjs";

export const videoEncoderModes = Object.freeze([
  "auto",
  "hardware",
  "software",
]);

export function normalizeEncoderMode(value, fallback = "software") {
  const safeFallback = videoEncoderModes.includes(fallback)
    ? fallback
    : "software";
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return videoEncoderModes.includes(normalized) ? normalized : safeFallback;
}

export function resolveEncoderMode(environment = process.env) {
  return normalizeEncoderMode(environment.SONARA_ENCODER_MODE, "software");
}

export function normalizeHardwareQuality(value, fallback = "balanced") {
  const allowed = ["draft", "balanced", "quality"];
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

export function resolveVideoEncoder({
  environment = process.env,
  detector = detectHardwareEncoders,
  settings = {},
} = {}) {
  const modeRequested = resolveEncoderMode(environment);
  const quality = normalizeHardwareQuality(
    environment.SONARA_HARDWARE_QUALITY ?? environment.SONARA_ENCODER_QUALITY,
  );
  if (modeRequested === "software") {
    return softwareEncoderSelection(modeRequested);
  }

  const detection = detector({ platform: process.platform });
  const requestedName = String(environment.SONARA_ENCODER_NAME ?? "")
    .trim()
    .toLowerCase();
  const encoder = selectHardwareH264Encoder({
    available: detection.available,
    platform: detection.platform ?? process.platform,
    requestedName,
  });
  if (!encoder) {
    if (modeRequested === "hardware") {
      throw createHardwareEncoderUnavailableError({
        detection,
        requestedName,
      });
    }
    return {
      ...softwareEncoderSelection(modeRequested),
      fallbackReason: requestedName
        ? "requested-hardware-encoder-unavailable"
        : detection.errorCode
          ? "hardware-encoder-probe-failed"
          : "no-hardware-h264-encoder",
      availableEncoders: detection.available,
    };
  }
  return {
    modeRequested,
    modeResolved: "hardware",
    encoder,
    profile: quality,
    fallbackReason: null,
    availableEncoders: detection.available,
    crf: Number(settings.crf),
  };
}

export function createHardwareEncoderUnavailableError({
  detection = {},
  requestedName = "",
} = {}) {
  const requested = requestedName ? ` solicitado: ${requestedName}.` : "";
  const error = new Error(
    [
      `FFMPEG_HARDWARE_ENCODER_UNAVAILABLE: nenhum encoder H.264 de hardware está disponível${requested}`,
      detection.probeError ? `Probe: ${detection.probeError}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
  error.code = "FFMPEG_HARDWARE_ENCODER_UNAVAILABLE";
  error.details = {
    availableEncoders: detection.available ?? [],
    ffmpegPath: detection.ffmpegPath ?? null,
    requestedName: requestedName || null,
  };
  return error;
}

export function buildWebglMuxArgs({
  audioPath,
  audioStartSeconds = 0,
  duration,
  metadata,
  outputPath,
  outputSize,
  settings,
  subtitlePath,
  webglVideoPath,
  encoderSelection,
}) {
  return buildWebglMuxPlan({
    audioPath,
    audioStartSeconds,
    duration,
    metadata,
    outputPath,
    outputSize,
    settings,
    subtitlePath,
    webglVideoPath,
    encoderSelection,
  }).args;
}

export function buildWebglMuxPlan({
  audioPath,
  audioStartSeconds = 0,
  duration,
  metadata,
  outputPath,
  outputSize,
  settings,
  subtitlePath,
  webglVideoPath,
  encoderSelection,
}) {
  const filters = [
    `setpts=N/(${settings.webglFps}*TB)`,
    `fps=${settings.outputFps ?? settings.webglFps}`,
    `scale=${outputSize.width}:${outputSize.height}:flags=lanczos`,
  ];
  if (subtitlePath)
    filters.push(`subtitles='${escapeFilterPath(subtitlePath)}'`);
  filters.push("format=yuv420p");

  const encoder =
    encoderSelection ??
    resolveVideoEncoder({
      settings,
    });

  return {
    encoder,
    args: [
      "-y",
      "-i",
      webglVideoPath,
      ...(Number(audioStartSeconds) > 0
        ? ["-ss", String(Math.max(0, Number(audioStartSeconds)))]
        : []),
      "-i",
      audioPath,
      "-t",
      String(duration),
      "-vf",
      filters.join(","),
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      ...videoEncoderArgs(encoder, settings),
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      "-metadata",
      `title=${metadata.title}`,
      "-metadata",
      `artist=${metadata.artist}`,
      "-metadata",
      `genre=${metadata.genre}`,
      "-metadata",
      `album=${metadata.album}`,
      outputPath,
    ],
  };
}

function softwareEncoderSelection(modeRequested = "software") {
  return {
    modeRequested,
    modeResolved: "software",
    encoder: "libx264",
    profile: null,
    fallbackReason: null,
    availableEncoders: [],
  };
}

function videoEncoderArgs(selection, settings) {
  if (selection.modeResolved !== "hardware") {
    return [
      "-c:v",
      "libx264",
      "-preset",
      settings.encoderPreset ?? "veryfast",
      ...videoRateArgs(settings),
    ];
  }

  const args = ["-c:v", selection.encoder];
  if (selection.encoder === "h264_amf") {
    args.push("-quality", selection.profile ?? "balanced");
  } else if (selection.encoder === "h264_nvenc") {
    args.push("-preset", settings.encoderPreset ?? "p4");
  } else if (selection.encoder === "h264_qsv") {
    args.push("-preset", settings.encoderPreset ?? "veryfast");
  }
  args.push(...hardwareRateArgs(selection.encoder, settings));
  return args;
}

function hardwareRateArgs(encoder, settings) {
  const bitrate = Number(settings.videoBitrateKbps);
  if (Number.isFinite(bitrate) && bitrate > 0) {
    return constrainedBitrateArgs(bitrate);
  }
  const qp = clampQp(settings.crf);
  if (encoder === "h264_amf") {
    return [
      "-rc",
      "cqp",
      "-qp_i",
      String(qp),
      "-qp_p",
      String(Math.min(51, qp + 2)),
    ];
  }
  if (encoder === "h264_nvenc") {
    return ["-rc", "constqp", "-qp", String(qp)];
  }
  if (encoder === "h264_qsv") {
    return ["-global_quality", String(qp)];
  }
  return ["-b:v", `${Math.max(1000, (51 - qp) * 500)}k`];
}

function constrainedBitrateArgs(bitrate) {
  const safeBitrate = Math.max(250, Math.round(bitrate));
  return [
    "-b:v",
    `${safeBitrate}k`,
    "-maxrate",
    `${safeBitrate}k`,
    "-bufsize",
    `${safeBitrate * 2}k`,
  ];
}

function clampQp(value) {
  const qp = Number(value);
  if (!Number.isFinite(qp)) return 22;
  return Math.min(51, Math.max(0, Math.round(qp)));
}

function videoRateArgs(settings) {
  const bitrate = Number(settings.videoBitrateKbps);
  if (Number.isFinite(bitrate) && bitrate > 0) {
    return constrainedBitrateArgs(bitrate);
  }
  return ["-crf", String(settings.crf)];
}

function escapeFilterPath(filePath) {
  return filePath
    .replaceAll("\\", "/")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'");
}
