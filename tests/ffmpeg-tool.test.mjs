import assert from "node:assert/strict";
import fssync from "node:fs";
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

test("SONARA_FFMPEG_PATH takes precedence and explicit candidates still win", () => {
  const currentFile = fileURLToPath(import.meta.url);
  const previous = process.env.SONARA_FFMPEG_PATH;
  try {
    process.env.SONARA_FFMPEG_PATH = currentFile;
    assert.equal(resolveFfmpegPath(), currentFile);

    process.env.SONARA_FFMPEG_PATH = "Z:/sonara-hub/missing/ffmpeg.exe";
    assert.throws(
      () => resolveFfmpegPath(),
      (error) => error.code === FFMPEG_MISSING_CODE,
    );

    delete process.env.SONARA_FFMPEG_PATH;
    const resolved = resolveFfmpegPath();
    assert.equal(typeof resolved, "string");
    assert.ok(fssync.existsSync(resolved));
  } finally {
    if (previous === undefined) delete process.env.SONARA_FFMPEG_PATH;
    else process.env.SONARA_FFMPEG_PATH = previous;
  }
});

test("explicit candidates ignore a broken SONARA_FFMPEG_PATH", () => {
  const currentFile = fileURLToPath(import.meta.url);
  const previous = process.env.SONARA_FFMPEG_PATH;
  try {
    process.env.SONARA_FFMPEG_PATH = "Z:/sonara-hub/missing/ffmpeg.exe";
    assert.equal(resolveFfmpegPath(currentFile), currentFile);
  } finally {
    if (previous === undefined) delete process.env.SONARA_FFMPEG_PATH;
    else process.env.SONARA_FFMPEG_PATH = previous;
  }
});
