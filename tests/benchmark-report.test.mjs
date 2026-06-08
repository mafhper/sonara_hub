import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cleanupRenderBenchmarkData,
  loadRenderBenchmarkReport,
  saveBenchmarkBaseline,
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

test("benchmark baseline helper persists a selected run slot", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  const baselinePath = path.join(directory, "baselines.json");
  await writeHistory(historyPath, [
    run("run-stable", "quick", 1000, 10, 110),
    run("run-current", "quick", 900, 10, 100),
  ]);

  const result = await saveBenchmarkBaseline(baselinePath, {
    historyPath,
    runId: "run-stable",
    slot: "beta",
  });
  const config = JSON.parse(await fs.readFile(baselinePath, "utf8"));
  const report = await loadRenderBenchmarkReport(historyPath, {
    activeBaseline: "beta",
    baselinePath,
  });

  assert.equal(config.beta.runId, "run-stable");
  assert.equal(result.baseline.slot, "beta");
  assert.equal(result.baseline.found, true);
  assert.equal(report.activeBaseline, "beta");
  assert.equal(report.baselineComparison.referenceRun.runId, "run-stable");
});

test("benchmark baseline helper rejects missing runs", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  const baselinePath = path.join(directory, "baselines.json");
  await writeHistory(historyPath, [run("run-a", "quick", 1000, 10, 110)]);

  await assert.rejects(
    () =>
      saveBenchmarkBaseline(baselinePath, {
        historyPath,
        runId: "missing-run",
        slot: "stable",
      }),
    {
      code: "BENCHMARK_BASELINE_RUN_NOT_FOUND",
      name: "BenchmarkBaselineError",
    },
  );
});

test("render benchmark score composes latest clean required tests for current commit", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  const previousCommit = "aaaabbbbcccc";
  const currentCommit = "ddddeeeeffff";
  await writeHistory(historyPath, [
    scoreRun("prev-quick", "render.quick", 1000, previousCommit, 1),
    scoreRun("prev-full", "render.full", 1800, previousCommit, 2),
    scoreRun("prev-audio", "render.audio", 1200, previousCommit, 3),
    scoreRun("cur-quick", "render.quick", 950, currentCommit, 4),
    scoreRun("cur-full", "render.full", 1700, currentCommit, 5),
    scoreRun("cur-audio", "render.audio", 1100, currentCommit, 6),
    scoreRun("cur-quick-rerun", "render.quick", 900, currentCommit, 7),
  ]);

  const report = await loadRenderBenchmarkReport(historyPath, {
    currentGit: { branch: "main", commit: currentCommit, dirty: false },
  });

  assert.equal(report.score.complete, true);
  assert.equal(report.score.reference, "previous");
  assert.equal(report.scoreComposition.complete, true);
  assert.equal(report.scoreComposition.commit, currentCommit);
  assert.equal(report.scoreComposition.missingTests.length, 0);
  assert.equal(
    report.scoreComposition.components.find(
      (item) => item.key === "render.quick",
    ).run.runId,
    "cur-quick-rerun",
  );
  assert.equal(report.scoreComposition.run.git.commit, currentCommit);
  assert.match(
    report.scoreComparison.referenceRun.runId,
    /^score:aaaabbbbcccc/u,
  );
});

test("render benchmark score is undefined until current commit has every required test", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  const currentCommit = "111122223333";
  await writeHistory(historyPath, [
    scoreRun("cur-quick", "render.quick", 900, currentCommit, 1),
    scoreRun("cur-full", "render.full", 1700, currentCommit, 2),
  ]);

  const report = await loadRenderBenchmarkReport(historyPath, {
    currentGit: { branch: "main", commit: currentCommit, dirty: false },
  });

  assert.equal(report.score.complete, false);
  assert.equal(report.score.reference, "none");
  assert.equal(report.releaseGate.status, "warn");
  assert.deepEqual(
    report.scoreComposition.missingTests.map((item) => item.key),
    ["render.audio"],
  );
});

test("workflow E2E keeps explicit test key and does not complete canonical score", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  const currentCommit = "111122223333";
  await writeHistory(historyPath, [
    scoreRun("cur-quick", "render.quick", 900, currentCommit, 1),
    scoreRun("cur-full", "render.full", 1700, currentCommit, 2),
    workflowRun("cur-workflow", 4200, currentCommit, 3),
  ]);

  const report = await loadRenderBenchmarkReport(historyPath, {
    currentGit: { branch: "main", commit: currentCommit, dirty: false },
  });
  const workflow = report.runs.find((item) => item.runId === "cur-workflow");

  assert.equal(workflow.testKey, "workflow.e2e");
  assert.equal(workflow.profile, "workflow-e2e");
  assert.equal(workflow.domain, "workflow");
  assert.equal(report.score.complete, false);
  assert.deepEqual(
    report.scoreComposition.missingTests.map((item) => item.key),
    ["render.audio"],
  );
});

test("workflow E2E compares synthetic and input cases by case id", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  const commit = "aaaabbbbcccc";
  await writeHistory(historyPath, [
    workflowRun("workflow-a", 4400, commit, 1),
    workflowRun("workflow-b", 4000, commit, 2),
  ]);

  const report = await loadRenderBenchmarkReport(historyPath, {
    currentGit: { branch: "main", commit, dirty: false },
  });

  assert.equal(report.latestComparison.referenceRun.runId, "workflow-a");
  assert.equal(report.latestComparison.currentRun.runId, "workflow-b");
  assert.deepEqual(
    report.latestComparison.caseDeltas.map((item) => item.id),
    ["workflow-e2e.synthetic", "workflow-e2e.input"],
  );
  assert.equal(report.latestComparison.summaryDeltas[0].key, "totalMs");
  assert.equal(
    report.latestRun.cases.find((item) => item.id === "workflow-e2e.input")
      .publicationAssetMs,
    640,
  );
});

test("render benchmark score invalidates when HEAD moves to a new commit", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  await writeHistory(historyPath, [
    scoreRun("old-quick", "render.quick", 900, "aaaabbbbcccc", 1),
    scoreRun("old-full", "render.full", 1700, "aaaabbbbcccc", 2),
    scoreRun("old-audio", "render.audio", 1100, "aaaabbbbcccc", 3),
  ]);

  const report = await loadRenderBenchmarkReport(historyPath, {
    currentGit: { branch: "main", commit: "ffffeeeedddd", dirty: false },
  });

  assert.equal(report.score.complete, false);
  assert.deepEqual(
    report.scoreComposition.missingTests.map((item) => item.key),
    ["render.quick", "render.full", "render.audio"],
  );
});

test("render benchmark score keeps dirty runs provisional", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-bench-"));
  const historyPath = path.join(directory, "render-history.jsonl");
  const currentCommit = "999988887777";
  await writeHistory(historyPath, [
    scoreRun("cur-quick", "render.quick", 900, currentCommit, 1),
    scoreRun("cur-full", "render.full", 1700, currentCommit, 2),
    scoreRun("cur-audio", "render.audio", 1100, currentCommit, 3),
    scoreRun("dirty-audio", "render.audio", 600, currentCommit, 4, {
      status: " M server/index.mjs",
    }),
  ]);

  const report = await loadRenderBenchmarkReport(historyPath, {
    currentGit: { branch: "main", commit: currentCommit, dirty: true },
  });

  assert.equal(report.score.complete, true);
  assert.equal(
    report.scoreComposition.components.find(
      (item) => item.key === "render.audio",
    ).run.runId,
    "cur-audio",
  );
  assert.deepEqual(
    report.scoreComposition.provisionalRuns.map((item) => item.runId),
    ["dirty-audio"],
  );
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

function scoreRun(runId, testKey, totalMs, commit, order, options = {}) {
  const profile = testKey === "render.full" ? "full" : "quick";
  const audioKind = testKey === "render.audio" ? "input" : "synthetic";
  return run(
    runId,
    profile,
    totalMs,
    Math.round(totalMs * 0.08),
    Math.round(totalMs * 0.12),
    `2026-06-06T12:${String(order).padStart(2, "0")}:00.000Z`,
    {
      ...options,
      audioKind,
      commit,
      testKey,
    },
  );
}

function workflowRun(runId, totalMs, commit, order) {
  return {
    runId,
    kind: "workflow-e2e-benchmark",
    profile: "workflow-e2e",
    testKey: "workflow.e2e",
    testLabel: "Workflow E2E",
    domain: "workflow",
    pipeline: "full-workflow",
    suiteKind: "separate",
    repeat: 1,
    createdAt: `2026-06-06T13:${String(order).padStart(2, "0")}:00.000Z`,
    git: {
      branch: "main",
      commit,
      status: "",
    },
    environment: {
      platform: "win32",
      node: "v24.0.0",
      cpus: 4,
      totalMemoryMb: 16000,
    },
    audioSource: {
      kind: "synthetic+input",
      label: "synthetic + input/Jardim dos Ventos/Lado A",
    },
    warnings: [],
    cases: [
      workflowCase("workflow-e2e.synthetic", totalMs, 420),
      workflowCase("workflow-e2e.input", totalMs + 320, 640),
    ],
  };
}

function workflowCase(id, totalMs, publicationAssetMs) {
  return {
    id,
    outputId: id,
    rendererId: "workflow-e2e",
    category: id.endsWith("input") ? "input" : "synthetic",
    domain: "workflow",
    pipeline: "full-workflow",
    qualityProfile: "fast",
    duration: 2,
    outputSize: { width: 1280, height: 720 },
    totalMs,
    audioProcessMs: Math.round(totalMs * 0.2),
    videoRenderMs: Math.round(totalMs * 0.5),
    publicationAssetMs,
    jobCount: 3,
    artifactBytes: 2048,
    mp4Bytes: 1024,
    webglRetryCount: 0,
    warnings: [],
  };
}

function run(
  runId,
  profile,
  totalMs,
  muxMs,
  peakRssMb,
  createdAt = `2026-06-06T12:0${runId.endsWith("a") ? 1 : 2}:00.000Z`,
  options = {},
) {
  return {
    runId,
    kind: "render-benchmark",
    profile,
    testKey: options.testKey,
    createdAt,
    git: {
      branch: "main",
      commit: options.commit ?? `${runId}abcdef1234567890`,
      status: options.status ?? "",
    },
    environment: {
      platform: "win32",
      node: "v24.0.0",
      cpus: 4,
      totalMemoryMb: 16000,
    },
    audioSource: {
      kind: options.audioKind ?? "synthetic",
      label:
        options.audioKind === "input" ? "input/test.mp3" : "synthetic sine",
    },
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
