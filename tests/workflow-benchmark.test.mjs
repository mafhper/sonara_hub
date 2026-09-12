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
    job("podcast-a", "podcast-feed", "done", [timing("feed-manifest", 50)]),
  ]);

  assert.equal(report.enabled, true);
  assert.equal(report.sampleCount, 4);
  assert.deepEqual(
    report.pipelines.map((item) => item.pipeline),
    ["render-export", "publication-assets", "audio-processing", "podcast-feed"],
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
  assert.equal(
    report.stages.find((item) => item.stage === "feed-manifest").domain,
    "podcast",
  );
  assert.deepEqual(
    report.samples.map((item) => item.jobId),
    ["podcast-a", "asset-a", "video-a", "audio-a"],
  );
});

test("F4.6 — benchmark anexa recursos por estágio e saúde por amostra", () => {
  const report = summarizeWorkflowBenchmark([
    job(
      "video-a",
      "video-render",
      "done",
      [timing("webgl-render", 800), timing("ffmpeg-mux", 300)],
      [
        stageResources("webgl-render", 4, {
          cpuAvg: 40,
          cpuPeak: 70,
          ramFreeMin: 3,
          vramPctAvg: 22,
          vramPctPeak: 30,
        }),
        stageResources("ffmpeg-mux", 2, {
          cpuAvg: 12,
          cpuPeak: 18,
          ramFreeMin: 6,
          vramPctAvg: 4,
          vramPctPeak: 8,
        }),
      ],
      {
        contextLostCount: 1,
        captureFrameCount: {
          capturedFrames: 95,
          expectedFrames: 100,
          ok: false,
          ratio: 0.95,
        },
      },
    ),
    job(
      "video-b",
      "video-render",
      "done",
      [timing("webgl-render", 900)],
      [
        stageResources("webgl-render", 3, {
          cpuAvg: 30,
          cpuPeak: 50,
          ramFreeMin: 4,
          vramPctAvg: 18,
          vramPctPeak: 26,
        }),
      ],
      {
        contextLostCount: 0,
        captureFrameCount: {
          capturedFrames: 100,
          expectedFrames: 100,
          ok: true,
          ratio: 1,
        },
      },
    ),
  ]);

  const webglStage = report.stages.find(
    (item) => item.stage === "webgl-render",
  );
  assert.equal(webglStage.resource.jobs, 2);
  assert.equal(webglStage.resource.samples, 7);
  assert.equal(webglStage.resource.cpuAvg, 30);
  assert.equal(webglStage.resource.vramUsedPctPeakMax, 30);
  const muxStage = report.stages.find((item) => item.stage === "ffmpeg-mux");
  assert.equal(muxStage.resource.jobs, 1);
  assert.equal(muxStage.resource.vramUsedPctAvg, 4);

  assert.deepEqual(report.health, {
    sampleCount: 2,
    contextLostJobs: 1,
    captureFrameRatio: { samples: 2, okRatio: 0.5, medianRatio: 0.95 },
  });
  const compact = report.samples.find((item) => item.jobId === "video-a");
  assert.deepEqual(compact.health, {
    contextLostCount: 1,
    captureFrameCount: {
      capturedFrames: 95,
      expectedFrames: 100,
      ok: false,
      ratio: 0.95,
    },
  });
  assert.equal(compact.stageResources[0].label, undefined);
});

function job(id, kind, status, stageTimings, stageResources, renderHealth) {
  return {
    id,
    kind,
    status,
    message: id,
    createdAt: "2026-06-07T10:00:00.000Z",
    updatedAt: "2026-06-07T10:01:00.000Z",
    stageTimings,
    ...(stageResources ? { stageResources } : {}),
    ...(renderHealth ? { renderHealth } : {}),
  };
}

function stageResources(stage, sampleCount, values) {
  return {
    stage,
    label: stage,
    sampleCount,
    durationMs: 0,
    cpu: { avg: values.cpuAvg, peak: values.cpuPeak },
    gpu3d: { avg: 0 },
    ramFree: { min: values.ramFreeMin, avg: values.ramFreeMin },
    rss: { avg: 0 },
    vramUsedBytes: { avg: 0 },
    vramUsedPct: {
      avg: values.vramPctAvg,
      peak: values.vramPctPeak,
    },
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
