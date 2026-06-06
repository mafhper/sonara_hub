import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cleanupRenderBenchmarkData,
  loadRenderBenchmarkReport,
  saveBenchmarkCleanupPolicy,
} from "../server/benchmark-report.mjs";

test("render benchmark report compacts history and keeps latest runs", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  await fs.writeFile(
    historyPath,
    [
      JSON.stringify(run("run-a", "quick", 1000, 10, 110)),
      "{ invalid json",
      JSON.stringify(run("run-b", "full", 1500, 20, 125)),
    ].join("\n"),
  );

  const report = await loadRenderBenchmarkReport(historyPath, { limit: 1 });

  assert.equal(report.runCount, 2);
  assert.equal(report.returnedRunCount, 1);
  assert.equal(report.latestRun.runId, "run-b");
  assert.equal(report.latestRun.summary.caseCount, 1);
  assert.equal(report.latestRun.summary.totalMs, 1500);
  assert.equal(report.cases[0].sampleCount, 1);
  assert.equal(report.source.parseErrors.length, 1);
  assert.equal(
    report.metrics.some((metric) => metric.key === "totalMs"),
    true,
  );
});

test("render benchmark report tolerates missing history", async () => {
  const report = await loadRenderBenchmarkReport(
    path.join(os.tmpdir(), "missing-render-history.jsonl"),
  );

  assert.equal(report.runCount, 0);
  assert.equal(report.latestRun, null);
  assert.equal(report.source.missing, true);
  assert.equal(report.releaseGate.status, "warn");
});

test("render benchmark report compares latest run with previous compatible run", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  await writeHistory(historyPath, [
    run("run-a", "quick", 1000, 10, 110),
    run("run-b", "quick", 1200, 10, 110),
  ]);

  const report = await loadRenderBenchmarkReport(historyPath);

  assert.equal(report.latestComparison.referenceRun.runId, "run-a");
  assert.equal(report.latestComparison.currentRun.runId, "run-b");
  assert.equal(report.latestComparison.summaryDeltas[0].key, "totalMs");
  assert.equal(report.latestComparison.summaryDeltas[0].deltaPercent, 20);
  assert.equal(report.latestComparison.summaryDeltas[0].direction, "regressed");
  assert.equal(report.score.reference, "previous");
  assert.equal(report.releaseGate.status, "blocked");
});

test("render benchmark report compares latest run with stable baseline", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  const baselinePath = path.join(directory, "baselines.json");
  await writeHistory(historyPath, [
    run("run-stable", "quick", 1000, 10, 110),
    run("run-current", "quick", 900, 10, 100),
  ]);
  await fs.writeFile(
    baselinePath,
    JSON.stringify({ stable: { runId: "run-stable" } }),
  );

  const report = await loadRenderBenchmarkReport(historyPath, {
    baselinePath,
  });

  assert.equal(report.baselines[0].slot, "stable");
  assert.equal(report.baselines[0].found, true);
  assert.equal(report.baselineComparison.referenceRun.runId, "run-stable");
  assert.equal(
    report.baselineComparison.summaryDeltas[0].direction,
    "improved",
  );
  assert.equal(report.score.reference, "baseline");
  assert.equal(report.releaseGate.status, "pass");
});

test("render benchmark report tolerates baseline pointing to a missing run", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  const baselinePath = path.join(directory, "baselines.json");
  await writeHistory(historyPath, [
    run("run-a", "quick", 1000, 10, 110),
    run("run-b", "quick", 980, 10, 108),
  ]);
  await fs.writeFile(baselinePath, JSON.stringify({ stable: "missing-run" }));

  const report = await loadRenderBenchmarkReport(historyPath, {
    baselinePath,
  });

  assert.equal(report.baselines[0].found, false);
  assert.equal(report.baselineComparison, null);
  assert.equal(report.latestComparison.referenceRun.runId, "run-a");
});

test("cleanup policy is normalized and persisted", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const policyPath = path.join(directory, "cleanup-policy.json");

  const policy = await saveBenchmarkCleanupPolicy(policyPath, {
    enabled: true,
    maxAgeDays: 9999,
    maxRuns: 2,
    removeArtifacts: false,
  });

  assert.deepEqual(policy, {
    enabled: true,
    maxAgeDays: 365,
    maxRuns: 5,
    removeArtifacts: false,
  });
});

test("benchmark cleanup removes one selected run", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  const runsDir = path.join(directory, "runs");
  await writeHistory(historyPath, [
    run("run-a", "quick", 1000, 10, 110),
    run("run-b", "quick", 980, 10, 108),
  ]);
  await fs.mkdir(path.join(runsDir, "run-a-render"), { recursive: true });

  const cleanup = await cleanupRenderBenchmarkData({
    historyPath,
    mode: "run",
    runId: "run-a",
    runsDir,
  });
  const report = await loadRenderBenchmarkReport(historyPath);

  assert.equal(cleanup.removedRuns, 1);
  assert.deepEqual(cleanup.removedRunIds, ["run-a"]);
  assert.equal(report.runCount, 1);
  await assert.rejects(fs.stat(path.join(runsDir, "run-a-render")));
});

test("benchmark cleanup applies retention policy", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  await writeHistory(historyPath, [
    run("run-a", "quick", 1000, 10, 110, "2026-01-01T12:00:00.000Z"),
    run("run-b", "quick", 980, 10, 108, "2026-01-02T12:00:00.000Z"),
    run("run-c", "quick", 970, 10, 107, "2026-01-03T12:00:00.000Z"),
    run("run-d", "quick", 960, 10, 106, "2026-01-04T12:00:00.000Z"),
    run("run-e", "quick", 950, 10, 105, "2026-01-05T12:00:00.000Z"),
    run("run-f", "quick", 940, 10, 104, "2026-01-06T12:00:00.000Z"),
  ]);

  const cleanup = await cleanupRenderBenchmarkData({
    historyPath,
    mode: "policy",
    policy: { maxAgeDays: 365, maxRuns: 5 },
  });
  const report = await loadRenderBenchmarkReport(historyPath);

  assert.equal(cleanup.removedRuns, 1);
  assert.deepEqual(cleanup.removedRunIds, ["run-a"]);
  assert.equal(report.runCount, 5);
});

test("benchmark cleanup clears all runs", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  await writeHistory(historyPath, [
    run("run-a", "quick", 1000, 10, 110),
    run("run-b", "quick", 980, 10, 108),
  ]);

  const cleanup = await cleanupRenderBenchmarkData({
    historyPath,
    mode: "all",
  });
  const report = await loadRenderBenchmarkReport(historyPath);

  assert.equal(cleanup.removedRuns, 2);
  assert.equal(report.runCount, 0);
});

async function writeHistory(historyPath, runs) {
  await fs.writeFile(
    historyPath,
    `${runs.map((item) => JSON.stringify(item)).join("\n")}\n`,
  );
}

function run(
  runId,
  profile,
  totalMs,
  muxMs,
  peakRssMb,
  createdAt = `2026-06-06T12:0${runId.endsWith("a") ? 1 : 2}:00.000Z`,
) {
  return {
    runId,
    kind: "render-benchmark",
    profile,
    createdAt,
    git: { branch: "main", commit: `${runId}abcdef1234567890`, status: "" },
    environment: {
      platform: "win32",
      node: "v24.0.0",
      cpus: 4,
      totalMemoryMb: 16000,
    },
    audioSource: { kind: "synthetic", label: "synthetic sine" },
    warnings: [],
    cases: [
      {
        id: "audio-dark-720p-fast",
        rendererId: "audio-dark",
        category: "baseline",
        qualityProfile: "fast",
        duration: 2,
        outputSize: { width: 1280, height: 720 },
        totalMs,
        webmStageMs: totalMs - muxMs,
        frameRenderMs: 40,
        mediaRecorderMs: Math.round(totalMs * 0.5),
        muxMs,
        validationMs: 20,
        peakRssMb,
        webglRetryCount: 0,
        warnings: [],
      },
    ],
  };
}
