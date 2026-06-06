import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadJobHistory,
  restoreInterruptedJobs,
  saveJobHistory,
} from "../server/job-store.mjs";

test("job store marks interrupted work as an explicit recoverable error", () => {
  const [queued, done] = restoreInterruptedJobs([
    { id: "queued", status: "queued", message: "Na fila" },
    { id: "done", status: "done", message: "Pronto" },
  ]);

  assert.equal(queued.status, "error");
  assert.equal(queued.errorCode, "server-restart");
  assert.match(queued.errorDetail, /servidor local foi encerrado/);
  assert.match(queued.message, /reinicializacao do servidor local/);
  assert.equal(done.status, "done");
  assert.equal(done.message, "Pronto");
});

test("job store preserves requested cancellation across restart", () => {
  const [job] = restoreInterruptedJobs([
    {
      id: "canceling",
      status: "running",
      cancelRequested: true,
      message: "Cancelando",
    },
  ]);

  assert.equal(job.status, "canceled");
  assert.equal(job.cancelRequested, true);
  assert.match(job.message, /cancelado antes da reinicializacao/);
});

test("job store closes the active stage when work is restored after restart", () => {
  const [job] = restoreInterruptedJobs(
    [
      {
        id: "rendering",
        message: "Renderizando cena",
        stage: "webgl-render",
        stageStartedAt: "2026-06-06T06:00:00.000Z",
        status: "running",
      },
    ],
    new Date("2026-06-06T06:00:03.250Z"),
  );

  assert.equal(job.status, "error");
  assert.equal(job.stageStartedAt, null);
  assert.deepEqual(job.stageTimings, [
    {
      durationMs: 3250,
      endedAt: "2026-06-06T06:00:03.250Z",
      interrupted: true,
      label: "Renderizando cena",
      stage: "webgl-render",
      startedAt: "2026-06-06T06:00:00.000Z",
    },
  ]);
});

test("job store requeues interrupted work when a retry payload exists", () => {
  const [job] = restoreInterruptedJobs(
    [
      {
        id: "retryable",
        attempt: 1,
        maxAttempts: 2,
        message: "Renderizando cena",
        payloadRef: "payload.json",
        stage: "webgl-render",
        stageStartedAt: "2026-06-06T06:00:00.000Z",
        status: "running",
      },
    ],
    new Date("2026-06-06T06:00:03.250Z"),
    { existingPayloadRefs: new Set(["payload.json"]) },
  );

  assert.equal(job.status, "queued");
  assert.equal(job.recovered, true);
  assert.equal(job.stageStartedAt, null);
  assert.equal(job.stageTimings[0].interrupted, true);
});

test("job store marks interrupted work with missing payload as terminal", () => {
  const [job] = restoreInterruptedJobs(
    [
      {
        id: "missing-payload",
        attempt: 0,
        maxAttempts: 2,
        payloadRef: "missing.json",
        status: "running",
      },
    ],
    new Date("2026-06-06T06:00:03.250Z"),
    { existingPayloadRefs: new Set() },
  );

  assert.equal(job.status, "error");
  assert.equal(job.errorCode, "JOB_PAYLOAD_MISSING");
});

test("job store writes atomically and keeps only recent jobs", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-jobs-"));
  const filePath = path.join(root, "data", "jobs.local.json");
  await saveJobHistory(
    filePath,
    [
      { id: "old", status: "done" },
      { id: "recent", status: "done" },
    ],
    1,
  );

  assert.deepEqual(await loadJobHistory(filePath), [
    { id: "recent", status: "done" },
  ]);
  await fs.rm(root, { recursive: true, force: true });
});
