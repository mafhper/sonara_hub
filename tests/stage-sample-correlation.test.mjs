import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateStageResources,
  correlateSamplesWithStageTimings,
  groupSamplesByStage,
  stageSampleCorrelationReport,
  stageTimingIntervals,
} from "../server/stage-sample-correlation.mjs";

const T0 = 1_700_000_000_000;

function timing(stage, startMs, endMs, label = stage) {
  return {
    stage,
    label,
    startedAt: new Date(startMs).toISOString(),
    endedAt: endMs === null ? undefined : new Date(endMs).toISOString(),
    durationMs: endMs === null ? null : endMs - startMs,
  };
}

function sample(t, overrides = {}) {
  return {
    jobId: "job-a",
    t,
    stage: "webgl-render",
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
  };
}

test("stageTimingIntervals normaliza ISO→ms e ordena por início", () => {
  const intervals = stageTimingIntervals([
    timing("ffmpeg-mux", T0 + 3000, T0 + 4000),
    timing("webgl-render", T0, T0 + 3000),
    timing("audio-analysis", T0 - 1000, T0),
  ]);
  assert.deepEqual(
    intervals.map((i) => i.stage),
    ["audio-analysis", "webgl-render", "ffmpeg-mux"],
  );
  assert.equal(intervals[0].startMs, T0 - 1000);
  assert.equal(intervals[1].endMs, T0 + 3000);
  assert.equal(intervals[2].durationMs, 1000);
  assert.equal(intervals[2].label, "ffmpeg-mux");
});

test("stageTimingIntervals ignora entradas inválidas e aceita ms numérico", () => {
  const intervals = stageTimingIntervals([
    null,
    { stage: "broken", startedAt: "n/a" },
    { stage: "open", startedAt: T0 },
  ]);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].stage, "open");
  assert.equal(intervals[0].endMs, null);
  assert.equal(stageTimingIntervals(undefined).length, 0);
  assert.equal(stageTimingIntervals("nope").length, 0);
});

test("F4.2 aceite — correlaciona timeline × samples do F4.1 no processo principal", () => {
  const stageTimings = [
    timing("webgl-render", T0, T0 + 3000),
    timing("ffmpeg-mux", T0 + 3000, T0 + 4000),
  ];
  const samples = [
    sample(T0 + 1000, { cpu: 41 }),
    sample(T0 + 2000, { cpu: 52 }),
    sample(T0 + 3500, { stage: "ffmpeg-mux", cpu: 18 }),
  ];
  const { correlated, outside } = correlateSamplesWithStageTimings({
    stageTimings,
    samples,
  });
  assert.equal(outside.length, 0);
  assert.equal(correlated.length, 3);
  assert.deepEqual(
    correlated.map((c) => [c.t, c.timelineStage, c.matches]),
    [
      [T0 + 1000, "webgl-render", true],
      [T0 + 2000, "webgl-render", true],
      [T0 + 3500, "ffmpeg-mux", true],
    ],
  );
  assert.equal(correlated[0].resources.cpu, 41);
  assert.equal(correlated[2].resources.cpu, 18);
  const report = stageSampleCorrelationReport({ correlated, outside });
  assert.deepEqual(report.samplesByStage, {
    "webgl-render": 2,
    "ffmpeg-mux": 1,
  });
  assert.equal(report.matchingReportedStage, 3);
  assert.equal(report.mismatchedReportedStage, 0);
  assert.equal(report.outsideCount, 0);
});

test("F4.2 — amostra que cruza a transição relata mismatch na borda", () => {
  const stageTimings = [
    timing("webgl-render", T0, T0 + 3000),
    timing("ffmpeg-mux", T0 + 3000, T0 + 4000),
  ];
  const samples = [
    sample(T0 + 2900, { stage: "ffmpeg-mux", cpu: 77 }),
    sample(T0 + 3100, { stage: "webgl-render", cpu: 55 }),
  ];
  const { correlated } = correlateSamplesWithStageTimings({
    stageTimings,
    samples,
  });
  assert.equal(correlated.length, 2);
  assert.equal(correlated[0].timelineStage, "webgl-render");
  assert.equal(correlated[0].reportedStage, "ffmpeg-mux");
  assert.equal(correlated[0].matches, false);
  assert.equal(correlated[1].timelineStage, "ffmpeg-mux");
  assert.equal(correlated[1].matches, false);
  const report = stageSampleCorrelationReport({ correlated, outside: [] });
  assert.equal(report.mismatchedReportedStage, 2);
});

test("F4.2 — borda half-open: t no fim do último estágio é outside, não mismatch", () => {
  const stageTimings = [timing("webgl-render", T0, T0 + 3000)];
  const samples = [sample(T0, { cpu: 30 }), sample(T0 + 3000, { cpu: 40 })];
  const { correlated, outside } = correlateSamplesWithStageTimings({
    stageTimings,
    samples,
  });
  assert.equal(correlated.length, 1);
  assert.equal(correlated[0].t, T0);
  assert.equal(outside.length, 1);
  assert.equal(outside[0].reason, "after-last-stage");
  const report = stageSampleCorrelationReport({ correlated, outside });
  assert.equal(report.outsideCount, 1);
  assert.deepEqual(report.outsideReasons, { "after-last-stage": 1 });
  assert.deepEqual(report.samplesByStage, { "webgl-render": 1 });
});

test("F4.2 — amostras antes do primeiro estágio e sem timeline são outside", () => {
  const stageTimings = [timing("webgl-render", T0, T0 + 3000)];
  const { outside: withTimeline } = correlateSamplesWithStageTimings({
    stageTimings,
    samples: [sample(T0 - 100, { cpu: 1 })],
  });
  assert.equal(withTimeline[0].reason, "before-first-stage");
  const empty = correlateSamplesWithStageTimings({
    stageTimings: [],
    samples: [sample(T0, { cpu: 1 })],
  });
  assert.equal(empty.correlated.length, 0);
  assert.equal(empty.outside[0].reason, "no-intervals");
});

test("F4.2 — estágio aberto (sem endedAt) recebe amostras até o fim", () => {
  const stageTimings = [timing("webgl-render", T0, null)];
  const { correlated } = correlateSamplesWithStageTimings({
    stageTimings,
    samples: [sample(T0 + 100), sample(T0 + 100_000)],
  });
  assert.equal(correlated.length, 2);
  assert.ok(correlated.every((c) => c.timelineStage === "webgl-render"));
});

test("F4.2 — report corta samples inválidos e soma counts coerentes", () => {
  const { correlated, outside } = correlateSamplesWithStageTimings({
    stageTimings: [timing("webgl-render", T0, T0 + 1000)],
    samples: [
      sample(T0 + 100),
      null,
      "lixo",
      { t: "não-numérico" },
      sample(T0 + 500, { stage: "ffmpeg-mux" }),
    ],
  });
  assert.equal(correlated.length, 2);
  const report = stageSampleCorrelationReport({ correlated, outside });
  assert.equal(report.sampleCount, 2);
  assert.equal(report.matchingReportedStage, 1);
  assert.equal(report.mismatchedReportedStage, 1);
});

test("F4.3 — agrupa samples correlacionados por estágio na ordem da timeline", () => {
  const stageTimings = [
    timing("webgl-render", T0, T0 + 3000),
    timing("ffmpeg-mux", T0 + 3000, T0 + 4000),
  ];
  const correlation = correlateSamplesWithStageTimings({
    stageTimings,
    samples: [
      sample(T0 + 500),
      sample(T0 + 2500),
      sample(T0 + 3500, { stage: "ffmpeg-mux" }),
    ],
  });
  const groups = groupSamplesByStage(correlation);
  assert.deepEqual(
    groups.map((g) => [g.stage, g.sampleCount]),
    [
      ["webgl-render", 2],
      ["ffmpeg-mux", 1],
    ],
  );
  assert.equal(groups[0].startMs, T0);
  assert.equal(groups[0].label, "webgl-render");
  assert.equal(groups[1].durationMs, 1000);
});

test("F4.3 — estágios re-executados entram no mesmo bucket com janela unificada", () => {
  const stageTimings = [
    timing("webgl-render", T0, T0 + 1000),
    timing("ffmpeg-mux", T0 + 1000, T0 + 1500),
    timing("webgl-render", T0 + 1500, T0 + 2500),
  ];
  const correlation = correlateSamplesWithStageTimings({
    stageTimings,
    samples: [
      sample(T0 + 500),
      sample(T0 + 2000),
      sample(T0 + 1200, { stage: "ffmpeg-mux" }),
    ],
  });
  const groups = groupSamplesByStage(correlation);
  assert.deepEqual(
    groups.map((g) => [g.stage, g.sampleCount]),
    [
      ["webgl-render", 2],
      ["ffmpeg-mux", 1],
    ],
  );
  assert.equal(groups[0].startMs, T0);
  assert.equal(groups[0].durationMs, 1000);
  assert.equal(groups[0].samples.length, 2);
});

test("F4.3 — estágio sem amostra não vira grupo; entrada não-array é vazia", () => {
  const stageTimings = [
    timing("webgl-render", T0, T0 + 3000),
    timing("audio-analysis", T0 + 3000, T0 + 4000),
  ];
  const correlation = correlateSamplesWithStageTimings({
    stageTimings,
    samples: [sample(T0 + 500)],
  });
  const groups = groupSamplesByStage(correlation);
  assert.deepEqual(
    groups.map((g) => g.stage),
    ["webgl-render"],
  );
  assert.deepEqual(groupSamplesByStage({}), []);
  assert.deepEqual(groupSamplesByStage(undefined), []);
});

test("F4.4 aceite — agrega recursos por estágio com avg/peak/p95 e RAM min", () => {
  const stageTimings = [
    timing("webgl-render", T0, T0 + 4000),
    timing("ffmpeg-mux", T0 + 4000, T0 + 5000),
  ];
  const samples = [
    sample(T0 + 1000, {
      cpu: 30,
      rss: 300 * 1024 * 1024,
      ramFree: 2 * 1024 ** 3,
      gpu3d: 40,
      vramUsedPct: 21,
    }),
    sample(T0 + 2000, {
      cpu: 50,
      rss: 320 * 1024 * 1024,
      ramFree: 1.5 * 1024 ** 3,
      gpu3d: 60,
      vramUsedPct: 25,
    }),
    sample(T0 + 3000, {
      cpu: 70,
      rss: 340 * 1024 * 1024,
      ramFree: 1.5 * 1024 ** 3,
      gpu3d: 80,
      vramUsedPct: 30,
    }),
    sample(T0 + 4500, {
      stage: "ffmpeg-mux",
      cpu: 15,
      gpu3d: 5,
      ramFree: 4 * 1024 ** 3,
    }),
  ];
  const correlation = correlateSamplesWithStageTimings({
    stageTimings,
    samples,
  });
  const resources = aggregateStageResources(groupSamplesByStage(correlation));
  assert.equal(resources.length, 2);
  const webgl = resources[0];
  assert.equal(webgl.sampleCount, 3);
  assert.equal(webgl.cpu.avg, 50);
  assert.equal(webgl.cpu.peak, 70);
  assert.equal(webgl.cpu.p95, 70);
  assert.equal(webgl.gpu3d.avg, 60);
  assert.equal(webgl.gpu3d.peak, 80);
  assert.equal(webgl.vramUsedPct.avg, 25.33);
  assert.equal(webgl.vramUsedPct.peak, 30);
  assert.equal(webgl.rss.avg, 335544320);
  assert.ok(webgl.ramFree.min < webgl.ramFree.avg);
  const mux = resources[1];
  assert.equal(mux.cpu.avg, 15);
  assert.equal(mux.gpu3d.avg, 5);
  assert.equal(mux.ramFree.min, 4 * 1024 ** 3);
});

test("F4.4 — séries vazias agregam zero sem estourar", () => {
  const groups = [
    {
      stage: "silent",
      label: "silent",
      durationMs: 100,
      sampleCount: 2,
      samples: [
        { timelineStage: "silent", resources: {} },
        { timelineStage: "silent", resources: { cpu: 10 } },
      ],
    },
  ];
  const resources = aggregateStageResources(groups);
  assert.equal(resources[0].cpu.avg, 10);
  assert.equal(resources[0].gpu3d.avg, 0);
  assert.equal(resources[0].vramUsedPct.p95, 0);
  assert.equal(resources[0].rss.peak, 0);
  assert.equal(resources[0].ramFree.min, 0);
  assert.deepEqual(aggregateStageResources(undefined), []);
});
