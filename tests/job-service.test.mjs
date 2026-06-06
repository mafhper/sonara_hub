import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cleanupJobWorkDir,
  createCanceledJobError,
  createJobRunner,
  isCanceledJobError,
  normalizeJobError,
} from "../server/job-service.mjs";

test("job service normalizes worker errors with stable code and detail", () => {
  const error = new Error("Falha no mux");
  error.code = "FFMPEG_MISSING";
  error.detail = "ffmpeg-static ausente";

  assert.deepEqual(normalizeJobError(error, "VIDEO_RENDER_ERROR"), {
    message: "Falha no mux",
    errorCode: "FFMPEG_MISSING",
    errorDetail: "ffmpeg-static ausente",
  });
});

test("job service keeps cancellation out of error jobs", async () => {
  const updates = [];
  const runner = createJobRunner({
    fallbackErrorCode: "VIDEO_RENDER_ERROR",
    releaseTempFiles: async () => updates.push({ release: true }),
    runQueuedJob: async () => {
      throw createCanceledJobError();
    },
    updateJob: (jobId, patch) => updates.push({ jobId, patch }),
  });

  await runner({ jobId: "cancelled" }, async () => {});

  assert.equal(isCanceledJobError(createCanceledJobError()), true);
  assert.deepEqual(updates, [{ release: true }]);
});

test("job service records non-cancelled worker errors and releases resources", async () => {
  const updates = [];
  const cleanup = [];
  const runner = createJobRunner({
    cleanupWorkDir: async (jobId) => cleanup.push(jobId),
    fallbackErrorCode: "PUBLICATION_ASSET_ERROR",
    releaseTempFiles: async () => updates.push({ release: true }),
    runQueuedJob: async (_jobId, worker) => worker(),
    updateJob: (jobId, patch) => updates.push({ jobId, patch }),
  });

  await runner({ jobId: "asset-job" }, async () => {
    throw new Error("Poster indisponivel");
  });

  assert.equal(updates[0].jobId, "asset-job");
  assert.equal(updates[0].patch.status, "error");
  assert.equal(updates[0].patch.message, "Poster indisponivel");
  assert.equal(updates[0].patch.errorCode, "PUBLICATION_ASSET_ERROR");
  assert.match(updates[0].patch.errorDetail, /Poster indisponivel/);
  assert.deepEqual(updates[1], { release: true });
  assert.deepEqual(cleanup, ["asset-job"]);
});

test("job work dir cleanup removes files and warns instead of throwing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-job-service-"));
  await fs.mkdir(path.join(root, "ok"), { recursive: true });
  await fs.writeFile(path.join(root, "ok", "capture.webm"), "webm");

  await cleanupJobWorkDir(root, "ok");
  await assert.rejects(fs.stat(path.join(root, "ok")), { code: "ENOENT" });

  const warnings = [];
  await cleanupJobWorkDir("/root/does/not/exist", "bad", (message) =>
    warnings.push(message),
  );
  assert.deepEqual(warnings, []);

  await fs.rm(root, { recursive: true, force: true });
});
