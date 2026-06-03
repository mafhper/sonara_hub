import fssync from "node:fs";
import ffmpegStaticPath from "ffmpeg-static";

export const FFMPEG_MISSING_CODE = "FFMPEG_MISSING";

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
