import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cleanupJobWorkDir,
  createCanceledJobError,
  createJobQueue,
  createJobRunner,
  createJobStageTracker,
  isCanceledJobError,
  normalizeJobError,
  resolveJobConcurrency,
  runJobWithRetry,
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

test("job queue respects concurrency and keeps draining after task errors", async () => {
  const errors = [];
  const starts = [];
  const finishes = [];
  const gates = new Map([
    ["a", deferred()],
    ["b", deferred()],
    ["c", deferred()],
  ]);
  let active = 0;
  let maxActive = 0;
  const queue = createJobQueue({
    concurrency: 2,
    onError: (error) => errors.push(error.message),
  });
  const task = (id) => async () => {
    starts.push(id);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await gates.get(id).promise;
    active -= 1;
    finishes.push(id);
    if (id === "b") throw new Error("boom-b");
  };

  queue.enqueue(task("a"));
  queue.enqueue(task("b"));
  queue.enqueue(task("c"));

  await waitFor(() => starts.length === 2);
  assert.deepEqual(starts, ["a", "b"]);
  assert.equal(maxActive, 2);
  assert.deepEqual(queue.snapshot(), {
    active: 2,
    concurrency: 2,
    pending: 1,
  });

  gates.get("a").resolve();
  await waitFor(() => starts.includes("c"));
  assert.equal(maxActive, 2);

  gates.get("b").resolve();
  gates.get("c").resolve();
  await waitFor(() => finishes.length === 3 && errors.length === 1);
  assert.deepEqual(errors, ["boom-b"]);
  assert.deepEqual(queue.snapshot(), {
    active: 0,
    concurrency: 2,
    pending: 0,
  });
});

test("job concurrency resolver clamps configured and default values", () => {
  assert.equal(
    resolveJobConcurrency({ configured: "3", defaultConcurrency: 1, max: 4 }),
    3,
  );
  assert.equal(
    resolveJobConcurrency({ configured: "9", defaultConcurrency: 1, max: 4 }),
    4,
  );
  assert.equal(
    resolveJobConcurrency({
      configured: "invalid",
      defaultConcurrency: 0,
      max: 4,
    }),
    1,
  );
  assert.equal(
    resolveJobConcurrency({
      configured: undefined,
      defaultConcurrency: 2.8,
      max: 4,
    }),
    2,
  );
});

test("job stage tracker records ordered timings", () => {
  const updates = [];
  const ticks = [
    Date.parse("2026-06-06T06:00:00.000Z"),
    Date.parse("2026-06-06T06:00:02.500Z"),
    Date.parse("2026-06-06T06:00:04.000Z"),
  ];
  const tracker = createJobStageTracker({
    clock: () => ticks.shift(),
    jobId: "render-job",
    updateJob: (jobId, patch) => updates.push({ jobId, patch }),
  });

  tracker.enter("analyze-audio", {
    message: "Analisando áudio",
    progress: 1,
    status: "running",
  });
  tracker.enter("webgl-render", {
    message: "Renderizando cena",
    progress: 4,
  });
  tracker.finish({ message: "Concluído", progress: 100, status: "done" });

  assert.equal(updates[0].patch.stage, "analyze-audio");
  assert.equal(updates[1].patch.stage, "webgl-render");
  assert.deepEqual(updates[1].patch.stageTimings, [
    {
      durationMs: 2500,
      endedAt: "2026-06-06T06:00:02.500Z",
      label: "Analisando áudio",
      stage: "analyze-audio",
      startedAt: "2026-06-06T06:00:00.000Z",
    },
  ]);
  assert.equal(updates[2].patch.stage, "complete");
  assert.deepEqual(
    updates[2].patch.stageTimings.map(({ durationMs, stage }) => ({
      durationMs,
      stage,
    })),
    [
      { durationMs: 2500, stage: "analyze-audio" },
      { durationMs: 1500, stage: "webgl-render" },
    ],
  );
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
  assert.ok(
    warnings.every((message) =>
      message.includes("Não foi possível limpar o diretório de trabalho bad"),
    ),
  );

  await fs.rm(root, { recursive: true, force: true });
});

test("job retry repeats recoverable worker errors and records history", async () => {
  let job = {
    id: "retry-job",
    attempt: 0,
    maxAttempts: 2,
    progress: 44,
    stage: "webgl-render",
    status: "running",
  };
  let calls = 0;

  const result = await runJobWithRetry({
    delay: async () => {},
    getJob: () => job,
    jobId: job.id,
    updateJob: (_jobId, patch) => {
      job = { ...job, ...patch };
    },
    worker: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("worker encerrou");
        error.code = "JOB_WORKER_EXIT";
        throw error;
      }
      return "ok";
    },
  });

  assert.equal(result, "ok");
  assert.equal(calls, 2);
  assert.equal(job.attempt, 2);
  assert.equal(job.maxAttempts, 2);
  assert.equal(job.retryHistory.length, 1);
  assert.equal(job.retryHistory[0].errorCode, "JOB_WORKER_EXIT");
  assert.equal(job.retryHistory[0].stage, "webgl-render");
});

test("job retry does not repeat non-recoverable errors", async () => {
  let job = { id: "no-retry", attempt: 0, maxAttempts: 2 };
  let calls = 0;

  await assert.rejects(
    runJobWithRetry({
      delay: async () => {},
      getJob: () => job,
      jobId: job.id,
      updateJob: (_jobId, patch) => {
        job = { ...job, ...patch };
      },
      worker: async () => {
        calls += 1;
        const error = new Error("ffmpeg ausente");
        error.code = "FFMPEG_MISSING";
        throw error;
      },
    }),
    { code: "FFMPEG_MISSING" },
  );
  assert.equal(calls, 1);
  assert.equal(job.retryHistory, undefined);
});

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function waitFor(predicate, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
