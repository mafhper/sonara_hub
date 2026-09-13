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

test("F4.1 — runner reconstrói timestamp→jobId→stage→recursos no processo principal", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-worker-f41-"));
  const samplePayload = (t, stage, overrides = {}) => ({
    t,
    stage,
    cpu: 10,
    rss: 200 * 1024 * 1024,
    ramFree: 8 * 1024 ** 3,
    gpu3d: 0,
    gpuCopy: 0,
    vcn: 0,
    vramUsedBytes: 0,
    vramTotalBytes: 8 * 1024 ** 3,
    vramUsedPct: 0,
    ...overrides,
  });
  const makeWorker = (samples) => `
process.on("message", (message) => {
  if (message.type !== "run") return;
  const samples = ${JSON.stringify(samples)};
  for (const sample of samples) {
    if (sample.kind === "stage") {
      process.send({ type: "stage", patch: { stage: sample.stage, progress: 4 } });
    } else {
      process.send({ type: "resource-sample", jobId: "job-a", sample: sample.payload });
    }
  }
  process.send({ type: "result", patch: { status: "done", progress: 100 } });
});
`;

  const samplesA = [
    { kind: "stage", stage: "webgl-render" },
    {
      kind: "sample",
      payload: samplePayload(1000, "webgl-render", { cpu: 41 }),
    },
    {
      kind: "sample",
      payload: samplePayload(2000, "webgl-render", { cpu: 52 }),
    },
    { kind: "stage", stage: "ffmpeg-mux" },
    { kind: "sample", payload: samplePayload(3000, "ffmpeg-mux", { cpu: 18 }) },
  ];
  const workerPathA = path.join(root, "worker-a.mjs");
  await fs.writeFile(workerPathA, makeWorker(samplesA), "utf8");
  const workerPathB = path.join(root, "worker-b.mjs");
  await fs.writeFile(
    workerPathB,
    `
process.on("message", (message) => {
  if (message.type !== "run") return;
  process.send({
    type: "resource-sample",
    jobId: "job-b",
    sample: ${JSON.stringify(samplePayload(4000, "webgl-render", { cpu: 77 }))},
  });
  process.send({ type: "result", patch: { status: "done", progress: 100 } });
});
`,
    "utf8",
  );

  const byJob = new Map();
  const collect = (jobId, sample) => {
    if (!byJob.has(jobId)) byJob.set(jobId, []);
    byJob.get(jobId).push(sample);
  };

  await runRenderWorkerJob({
    jobId: "job-a",
    kind: "video-render",
    payload: {},
    updateJob: () => {},
    onResourceSample: collect,
    workerPath: workerPathA,
  });
  await runRenderWorkerJob({
    jobId: "job-b",
    kind: "video-render",
    payload: {},
    updateJob: () => {},
    onResourceSample: collect,
    workerPath: workerPathB,
  });

  const sequence = (jobId) =>
    (byJob.get(jobId) ?? [])
      .map(({ t, stage, cpu }) => ({ t, stage, cpu }))
      .sort((a, b) => a.t - b.t);
  assert.deepEqual(sequence("job-a"), [
    { t: 1000, stage: "webgl-render", cpu: 41 },
    { t: 2000, stage: "webgl-render", cpu: 52 },
    { t: 3000, stage: "ffmpeg-mux", cpu: 18 },
  ]);
  assert.deepEqual(sequence("job-b"), [
    { t: 4000, stage: "webgl-render", cpu: 77 },
  ]);
  assert.equal(byJob.size, 2);
  await fs.rm(root, { recursive: true, force: true });
});

test("F4.5 — eventos de saúde do render chegam intactos ao processo principal", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-worker-f45-"));
  const workerPath = path.join(root, "worker.mjs");
  await fs.writeFile(
    workerPath,
    `
process.on("message", (message) => {
  if (message.type !== "run") return;
  process.send({
    type: "render-health",
    jobId: "job-h",
    event: { type: "context-lost", reason: "WEBGL_CONTEXT_LOST" },
  });
  process.send({
    type: "render-health",
    jobId: "job-h",
    event: {
      type: "capture-frame-count",
      expectedFrames: 100,
      capturedFrames: 95,
      ratio: 0.95,
      ok: true,
    },
  });
  process.send({ type: "result", patch: { status: "done", progress: 100 } });
});
`,
    "utf8",
  );
  const events = [];

  await runRenderWorkerJob({
    jobId: "job-h",
    kind: "video-render",
    payload: {},
    updateJob: () => {},
    onRenderHealth: (jobId, event) => events.push({ jobId, event }),
    workerPath,
  });

  assert.deepEqual(events, [
    {
      jobId: "job-h",
      event: { type: "context-lost", reason: "WEBGL_CONTEXT_LOST" },
    },
    {
      jobId: "job-h",
      event: {
        type: "capture-frame-count",
        expectedFrames: 100,
        capturedFrames: 95,
        ratio: 0.95,
        ok: true,
      },
    },
  ]);
  await fs.rm(root, { recursive: true, force: true });
});
