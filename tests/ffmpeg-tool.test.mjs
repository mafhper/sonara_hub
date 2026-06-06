import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createFfmpegProcessError,
  FFMPEG_OUTPUT_INVALID_CODE,
  FFMPEG_PROCESS_FAILED_CODE,
  FFMPEG_MISSING_CODE,
  normalizeFfmpegSpawnError,
  resolveFfmpegPath,
} from "../server/ffmpeg-tool.mjs";

test("resolveFfmpegPath returns an existing candidate", () => {
  const currentFile = fileURLToPath(import.meta.url);
  assert.equal(resolveFfmpegPath(currentFile), currentFile);
});

test("resolveFfmpegPath reports missing ffmpeg with a stable code", () => {
  assert.throws(
    () => resolveFfmpegPath("Z:/sonara-hub/missing/ffmpeg.exe"),
    (error) => {
      assert.equal(error.code, FFMPEG_MISSING_CODE);
      assert.match(error.message, /ffmpeg não encontrado/i);
      assert.match(error.message, /npm install/i);
      return true;
    },
  );
});

test("normalizeFfmpegSpawnError converts ENOENT into a missing ffmpeg error", () => {
  const error = new Error("spawn missing ENOENT");
  error.code = "ENOENT";

  const normalized = normalizeFfmpegSpawnError(error, "missing-ffmpeg.exe");
  assert.equal(normalized.code, FFMPEG_MISSING_CODE);
  assert.match(normalized.message, /missing-ffmpeg\.exe/);
});

test("createFfmpegProcessError exposes stable mux and validation codes", () => {
  const mux = createFfmpegProcessError({
    code: 1,
    stderr: "mux failed",
  });
  const validation = createFfmpegProcessError({
    code: 1,
    kind: "output-validation",
    stderr: "invalid mp4",
  });

  assert.equal(mux.code, FFMPEG_PROCESS_FAILED_CODE);
  assert.match(mux.detail, /mux failed/);
  assert.equal(mux.details.exitCode, 1);
  assert.equal(validation.code, FFMPEG_OUTPUT_INVALID_CODE);
  assert.match(validation.message, /MP4 final inválido/);
  assert.match(validation.detail, /invalid mp4/);
});
