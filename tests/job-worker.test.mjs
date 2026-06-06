import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  JOB_WORKER_CANCELED_CODE,
  JOB_WORKER_EXIT_CODE,
  runRenderWorkerJob,
} from "../server/job-worker.mjs";

test("render worker runner applies stage/progress patches and resolves result", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-worker-ok-"));
  const workerPath = path.join(root, "worker.mjs");
  await fs.writeFile(
    workerPath,
    `
process.on("message", (message) => {
  if (message.type !== "run") return;
  process.send({ type: "stage", patch: { stage: "webgl-render", progress: 4, message: "Renderizando" } });
  process.send({ type: "progress", patch: { progress: 42, message: "Metade" } });
  process.send({ type: "result", patch: { status: "done", progress: 100, outputUrl: "/outputs/ok.mp4" } });
});
`,
    "utf8",
  );
  const updates = [];

  const result = await runRenderWorkerJob({
    jobId: "ok",
    kind: "video-render",
    payload: {},
    updateJob: (jobId, patch) => updates.push({ jobId, patch }),
    workerPath,
  });

  assert.deepEqual(updates, [
    {
      jobId: "ok",
      patch: { stage: "webgl-render", progress: 4, message: "Renderizando" },
    },
    { jobId: "ok", patch: { progress: 42, message: "Metade" } },
    {
      jobId: "ok",
      patch: { status: "done", progress: 100, outputUrl: "/outputs/ok.mp4" },
    },
  ]);
  assert.equal(result.outputUrl, "/outputs/ok.mp4");
  await fs.rm(root, { recursive: true, force: true });
});

test("render worker runner preserves inner worker error codes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-worker-error-"));
  const workerPath = path.join(root, "worker.mjs");
  await fs.writeFile(
    workerPath,
    `
process.on("message", (message) => {
  if (message.type !== "run") return;
  process.send({
    type: "error",
    message: "Falha WebGL",
    errorCode: "WEBGL_CONTEXT_LOST",
    errorDetail: "context lost",
  });
});
`,
    "utf8",
  );

  await assert.rejects(
    runRenderWorkerJob({
      jobId: "bad",
      kind: "video-render",
      payload: {},
      updateJob: () => {},
      workerPath,
    }),
    {
      code: "WEBGL_CONTEXT_LOST",
      detail: "context lost",
    },
  );
  await fs.rm(root, { recursive: true, force: true });
});

test("render worker runner reports premature process exit", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-worker-exit-"));
  const workerPath = path.join(root, "worker.mjs");
  await fs.writeFile(workerPath, "process.exit(7);\n", "utf8");

  await assert.rejects(
    runRenderWorkerJob({
      jobId: "exit",
      kind: "video-render",
      payload: {},
      updateJob: () => {},
      workerPath,
    }),
    {
      code: JOB_WORKER_EXIT_CODE,
    },
  );
  await fs.rm(root, { recursive: true, force: true });
});

test("render worker runner cancels active workers and marks job canceled", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "sonara-worker-cancel-"),
  );
  const workerPath = path.join(root, "worker.mjs");
  await fs.writeFile(
    workerPath,
    `
process.on("message", (message) => {
  if (message.type === "run") {
    setInterval(() => {}, 1000);
  }
});
`,
    "utf8",
  );
  const updates = [];

  await assert.rejects(
    runRenderWorkerJob({
      jobId: "cancel",
      kind: "video-render",
      payload: {},
      updateJob: (jobId, patch) => updates.push({ jobId, patch }),
      workerPath,
      onWorkerStart: (controller) => setTimeout(() => controller.cancel(), 20),
    }),
    {
      code: JOB_WORKER_CANCELED_CODE,
    },
  );
  assert.equal(updates.at(-1).jobId, "cancel");
  assert.equal(updates.at(-1).patch.status, "canceled");
  assert.equal(updates.at(-1).patch.errorCode, JOB_WORKER_CANCELED_CODE);
  await fs.rm(root, { recursive: true, force: true });
});
