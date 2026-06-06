import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadRenderBenchmarkReport } from "../server/benchmark-report.mjs";

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
});

function run(runId, profile, totalMs, muxMs, peakRssMb) {
  return {
    runId,
    kind: "render-benchmark",
    profile,
    createdAt: `2026-06-06T12:0${runId.endsWith("a") ? 1 : 2}:00.000Z`,
    git: { branch: "main", commit: "abcdef1234567890", status: "" },
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
        muxMs,
        peakRssMb,
        warnings: [],
      },
    ],
  };
}
