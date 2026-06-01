import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cleanupOwnedStorage,
  summarizeOwnedStorage,
} from "../server/storage-cleanup.mjs";

test("storage cleanup removes only selected app-owned files and recreates directories", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-storage-"));
  const uploadDir = path.join(root, ".dev", "uploads");
  const workDir = path.join(root, ".dev", "work");
  const artworkPreviewDir = path.join(root, ".dev", "artwork-previews");
  const outputDir = path.join(root, "outputs");
  const treatedOutputDir = path.join(outputDir, "audio");
  const externalDir = path.join(root, "external-treated");
  await Promise.all([
    fs.mkdir(uploadDir, { recursive: true }),
    fs.mkdir(path.join(workDir, "job"), { recursive: true }),
    fs.mkdir(artworkPreviewDir, { recursive: true }),
    fs.mkdir(treatedOutputDir, { recursive: true }),
    fs.mkdir(externalDir, { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(path.join(uploadDir, "upload.tmp"), "upload"),
    fs.writeFile(path.join(workDir, "job", "capture.webm"), "capture"),
    fs.writeFile(path.join(artworkPreviewDir, "preview.jpg"), "preview"),
    fs.writeFile(path.join(treatedOutputDir, "treated.mp3"), "treated"),
    fs.writeFile(path.join(outputDir, "video.mp4"), "video"),
    fs.writeFile(path.join(externalDir, "keep.mp3"), "keep"),
  ]);

  assert.deepEqual(
    await summarizeOwnedStorage({
      uploadDir,
      workDir,
      artworkPreviewDir,
      outputDir,
    }),
    {
      temporary: { files: 3, bytes: 20 },
      generated: { files: 2, bytes: 12 },
    },
  );

  await cleanupOwnedStorage({
    scope: "temporary",
    uploadDir,
    workDir,
    artworkPreviewDir,
    outputDir,
    treatedOutputDir,
  });
  assert.deepEqual(await fs.readdir(uploadDir), []);
  assert.deepEqual(await fs.readdir(workDir), []);
  assert.deepEqual(await fs.readdir(artworkPreviewDir), []);
  assert.deepEqual(await fs.readdir(outputDir), ["audio", "video.mp4"]);

  await cleanupOwnedStorage({
    scope: "generated",
    uploadDir,
    workDir,
    artworkPreviewDir,
    outputDir,
    treatedOutputDir,
  });
  assert.deepEqual(await fs.readdir(outputDir), ["audio"]);
  assert.equal(
    await fs.readFile(path.join(externalDir, "keep.mp3"), "utf8"),
    "keep",
  );

  await fs.rm(root, { recursive: true, force: true });
});

test("storage cleanup rejects unknown scopes", async () => {
  await assert.rejects(
    () =>
      cleanupOwnedStorage({
        scope: "external",
        uploadDir: "uploads",
        workDir: "work",
        artworkPreviewDir: "artwork",
        outputDir: "outputs",
        treatedOutputDir: "outputs/audio",
      }),
    /Escopo de limpeza inválido/,
  );
});
