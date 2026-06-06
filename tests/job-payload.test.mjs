import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  JOB_PAYLOAD_MISSING_CODE,
  loadRenderJobPayload,
  persistRenderJobPayload,
} from "../server/job-payload.mjs";

test("render job payload persists copied inputs and reloads serializable state", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-payload-"));
  const source = path.join(root, "source.mp3");
  const cover = path.join(root, "cover.png");
  const layer = path.join(root, "layer.png");
  await fs.writeFile(source, "audio");
  await fs.writeFile(cover, "cover");
  await fs.writeFile(layer, "layer");

  const persisted = await persistRenderJobPayload({
    jobId: "job-1",
    kind: "video-render",
    workDir: path.join(root, "work"),
    payload: {
      audioPath: source,
      coverFile: { originalname: "cover.png", path: cover },
      mediaLayerFiles: [{ originalname: "layer.png", path: layer }],
      outputName: "out.mp4",
    },
  });
  const restored = await loadRenderJobPayload(persisted.payloadRef);

  assert.equal(restored.kind, "video-render");
  assert.equal(restored.payload.outputName, "out.mp4");
  assert.notEqual(restored.payload.audioPath, source);
  assert.notEqual(restored.payload.coverFile.path, cover);
  assert.notEqual(restored.payload.mediaLayerFiles[0].path, layer);
  assert.equal(await fs.readFile(restored.payload.audioPath, "utf8"), "audio");
  assert.equal(
    await fs.readFile(restored.payload.coverFile.path, "utf8"),
    "cover",
  );
  assert.equal(
    await fs.readFile(restored.payload.mediaLayerFiles[0].path, "utf8"),
    "layer",
  );
  await fs.rm(root, { recursive: true, force: true });
});

test("render job payload reports a stable missing-payload code", async () => {
  await assert.rejects(loadRenderJobPayload("missing-payload.json"), {
    code: JOB_PAYLOAD_MISSING_CODE,
  });
});
