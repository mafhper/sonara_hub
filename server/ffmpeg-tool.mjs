import fssync from "node:fs";
import { spawnSync } from "node:child_process";
import ffmpegStaticPath from "ffmpeg-static";

export const FFMPEG_MISSING_CODE = "FFMPEG_MISSING";
export const FFMPEG_PROCESS_FAILED_CODE = "FFMPEG_PROCESS_FAILED";
export const FFMPEG_OUTPUT_INVALID_CODE = "FFMPEG_OUTPUT_INVALID";

export function resolveFfmpegPath(candidate) {
  if (candidate === undefined) {
    const configuredPath = String(process.env.SONARA_FFMPEG_PATH ?? "").trim();
    if (configuredPath) {
      return assertFfmpegPath(configuredPath);
    }
    const systemPath = resolveSystemFfmpegPath();
    if (systemPath) return systemPath;
    return assertFfmpegPath(ffmpegStaticPath);
  }
  return assertFfmpegPath(candidate);
}

function assertFfmpegPath(candidate) {
  if (!candidate || !fssync.existsSync(candidate)) {
    throw createFfmpegMissingError(candidate);
  }
  return candidate;
}

function resolveSystemFfmpegPath() {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  try {
    const result = spawnSync(locator, ["ffmpeg"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status !== 0) return null;
    return (
      String(result.stdout ?? "")
        .split(/\r?\n/u)
        .map((value) => value.trim())
        .find((value) => value && fssync.existsSync(value)) ?? null
    );
  } catch {
    return null;
  }
}

export function createFfmpegMissingError(candidate = ffmpegStaticPath) {
  const location = candidate || "caminho não informado por ffmpeg-static";
  const error = new Error(
    [
      "FFMPEG_MISSING: ffmpeg não encontrado.",
      `Caminho esperado: ${location}.`,
      "Execute npm install ou npm rebuild ffmpeg-static e reinicie o servidor local.",
    ].join(" "),
  );
  error.code = FFMPEG_MISSING_CODE;
  error.details = { expectedPath: candidate || null };
  return error;
}

export function normalizeFfmpegSpawnError(error, candidate = ffmpegStaticPath) {
  if (error?.code === "ENOENT" || error?.code === FFMPEG_MISSING_CODE) {
    return createFfmpegMissingError(candidate);
  }
  return error instanceof Error ? error : new Error(String(error));
}

export function createFfmpegProcessError({
  code = null,
  kind = "process",
  stderr = "",
} = {}) {
  const stableCode =
    kind === "output-validation"
      ? FFMPEG_OUTPUT_INVALID_CODE
      : FFMPEG_PROCESS_FAILED_CODE;
  const detail = String(stderr || "").slice(-2000);
  const message =
    kind === "output-validation"
      ? `MP4 final inválido ou sem streams${code === null ? "" : ` (ffmpeg ${code})`}.`
      : `ffmpeg terminou com código ${code ?? "desconhecido"}.`;
  const error = new Error(detail ? `${message} ${detail}` : message);
  error.code = stableCode;
  error.detail = detail || message;
  error.details = { exitCode: code, kind };
  return error;
}
