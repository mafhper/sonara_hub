import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyWorkflowBenchmark,
  summarizeWorkflowBenchmark,
} from "../server/workflow-benchmark.mjs";

test("workflow benchmark stays empty when opt-in is disabled", () => {
  const report = emptyWorkflowBenchmark();

  assert.equal(report.enabled, false);
  assert.equal(report.sampleCount, 0);
  assert.deepEqual(report.pipelines, []);
});

test("workflow benchmark summarizes completed job timings by pipeline and stage", () => {
  const report = summarizeWorkflowBenchmark([
    job("active", "video-render", "running", [timing("webgl-render", 999)]),
    job("audio-a", "audio-process", "done", [
      timing("audio-prepare", 100),
      timing("audio-tags", 200),
    ]),
    job("video-a", "video-render", "done", [
      timing("webgl-render", 800),
      timing("ffmpeg-mux", 300),
    ]),
    job("asset-a", "publication-asset", "error", [
      timing("asset-prepare", 150),
      timing("poster-render", 250),
    ]),
  ]);

  assert.equal(report.enabled, true);
  assert.equal(report.sampleCount, 3);
  assert.deepEqual(
    report.pipelines.map((item) => item.pipeline),
    ["render-export", "publication-assets", "audio-processing"],
  );
  assert.equal(
    report.pipelines.find((item) => item.pipeline === "render-export")
      .statusCounts.done,
    1,
  );
  assert.equal(
    report.stages.find((item) => item.stage === "ffmpeg-mux").domain,
    "video",
  );
  assert.equal(
    report.stages.find((item) => item.stage === "asset-prepare").domain,
    "asset",
  );
  assert.deepEqual(
    report.samples.map((item) => item.jobId),
    ["asset-a", "video-a", "audio-a"],
  );
});

function job(id, kind, status, stageTimings) {
  return {
    id,
    kind,
    status,
    message: id,
    createdAt: "2026-06-07T10:00:00.000Z",
    updatedAt: "2026-06-07T10:01:00.000Z",
    stageTimings,
  };
}

function timing(stage, durationMs) {
  return {
    durationMs,
    endedAt: "2026-06-07T10:01:00.000Z",
    label: stage,
    stage,
    startedAt: "2026-06-07T10:00:00.000Z",
  };
}
