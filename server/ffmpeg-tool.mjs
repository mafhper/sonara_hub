import fssync from "node:fs";
import ffmpegStaticPath from "ffmpeg-static";

export const FFMPEG_MISSING_CODE = "FFMPEG_MISSING";
export const FFMPEG_PROCESS_FAILED_CODE = "FFMPEG_PROCESS_FAILED";
export const FFMPEG_OUTPUT_INVALID_CODE = "FFMPEG_OUTPUT_INVALID";

export function resolveFfmpegPath(candidate = ffmpegStaticPath) {
  if (!candidate || !fssync.existsSync(candidate)) {
    throw createFfmpegMissingError(candidate);
  }
  return candidate;
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
