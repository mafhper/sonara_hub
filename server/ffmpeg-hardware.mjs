import { spawnSync } from "node:child_process";
import { resolveFfmpegPath } from "./ffmpeg-tool.mjs";

export const supportedHardwareH264Encoders = Object.freeze([
  "h264_amf",
  "h264_qsv",
  "h264_nvenc",
  "h264_videotoolbox",
]);

const preferenceByPlatform = Object.freeze({
  win32: ["h264_amf", "h264_qsv", "h264_nvenc"],
  darwin: ["h264_videotoolbox", "h264_amf", "h264_nvenc"],
  linux: ["h264_qsv", "h264_nvenc", "h264_amf"],
});

const detectionCache = new Map();

export function clearHardwareEncoderCache() {
  detectionCache.clear();
}

export function hardwareEncoderPreference(platform = process.platform) {
  return [
    ...(preferenceByPlatform[platform] ?? preferenceByPlatform.linux),
    ...supportedHardwareH264Encoders.filter(
      (name) =>
        !(
          preferenceByPlatform[platform] ?? preferenceByPlatform.linux
        ).includes(name),
    ),
  ];
}

export function detectHardwareEncoders({
  ffmpegPath,
  platform = process.platform,
  runner = runEncoderProbe,
} = {}) {
  let resolvedPath = ffmpegPath ?? null;
  if (!resolvedPath) {
    try {
      resolvedPath = resolveFfmpegPath();
    } catch (error) {
      return createDetectionResult({
        ffmpegPath: null,
        platform,
        errorCode: error?.code ?? "FFMPEG_MISSING",
        probeError: error?.message ?? String(error),
      });
    }
  }

  const cacheKey = `${platform}:${resolvedPath}`;
  if (runner === runEncoderProbe && detectionCache.has(cacheKey)) {
    return detectionCache.get(cacheKey);
  }

  const probe = runner(resolvedPath);
  const result = createDetectionResult({
    ffmpegPath: resolvedPath,
    platform,
    output: probe.output,
    errorCode: probe.errorCode,
    probeError: probe.probeError,
    exitCode: probe.exitCode,
  });
  if (runner === runEncoderProbe) detectionCache.set(cacheKey, result);
  return result;
}

export function selectHardwareH264Encoder({
  available = [],
  requestedName,
  platform = process.platform,
} = {}) {
  const availableSet = new Set(
    available.map((value) => String(value).trim().toLowerCase()),
  );
  const requested = String(requestedName ?? "")
    .trim()
    .toLowerCase();
  if (requested) {
    return availableSet.has(requested) ? requested : null;
  }
  return (
    hardwareEncoderPreference(platform).find((name) =>
      availableSet.has(name),
    ) ?? null
  );
}

function createDetectionResult({
  ffmpegPath,
  platform,
  output = "",
  errorCode = null,
  probeError = null,
  exitCode = null,
}) {
  const available = supportedHardwareH264Encoders.filter((name) =>
    new RegExp(`\\b${name}\\b`, "u").test(output),
  );
  return {
    ffmpegPath,
    platform,
    available,
    h264: selectHardwareH264Encoder({ available, platform }),
    errorCode,
    probeError,
    exitCode,
  };
}

function runEncoderProbe(ffmpegPath) {
  try {
    const result = spawnSync(ffmpegPath, ["-hide_banner", "-encoders"], {
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    return {
      output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      errorCode:
        result.error?.code ??
        (result.status === 0 ? null : "FFMPEG_PROBE_FAILED"),
      probeError: result.error?.message ?? null,
      exitCode: result.status,
    };
  } catch (error) {
    return {
      output: "",
      errorCode: error?.code ?? "FFMPEG_PROBE_FAILED",
      probeError: error?.message ?? String(error),
      exitCode: null,
    };
  }
}
