import assert from "node:assert/strict";
import test from "node:test";
import {
  createCpuBudget,
  createCpuBudgetFromEnv,
  ffmpegThreadArgs,
  resolveFfmpegThreads,
} from "../server/resource-budget.mjs";

const env = (extra = {}) => ({
  SONARA_CPU_AVAILABLE: "8",
  SONARA_CPU_RESERVE: "1",
  SONARA_RENDER_CONCURRENCY: "2",
  ...extra,
});

test("createCpuBudget derives usable from available minus reserve", () => {
  const budget = createCpuBudget({
    available: 8,
    reserve: 1,
    activeWorkers: 2,
  });
  assert.equal(budget.available, 8);
  assert.equal(budget.reserve, 1);
  assert.equal(budget.usable, 7);
  assert.equal(budget.activeWorkers, 2);
  assert.deepEqual(budget.snapshot(), {
    available: 8,
    reserve: 1,
    usable: 7,
    activeWorkers: 2,
  });
});

test("property 1 — ops que compartilham a janela não excedem o usable", () => {
  const budget = createCpuBudget({
    available: 8,
    reserve: 1,
    activeWorkers: 2,
  });
  assert.equal(
    resolveFfmpegThreads({ operation: "ffmpeg-mux", budget }).threads,
    3,
  );
  assert.equal(
    resolveFfmpegThreads({ operation: "audio-analysis", budget }).threads,
    1,
  );
  assert.equal(
    resolveFfmpegThreads({ operation: "audio-envelope", budget }).threads,
    1,
  );
  const worstCases = [
    ["ffmpeg-mux", 2],
    ["audio-analysis", 4],
    ["audio-envelope", 4],
  ];
  for (const [operation, procs] of worstCases) {
    const allocation = resolveFfmpegThreads({ operation, budget });
    assert.ok(
      allocation.threads * procs <= budget.usable,
      `op=${operation} worst-case ${allocation.threads}x${procs} ultrapassa usable=${budget.usable}`,
    );
  }
});

test("property 1b — output-validation sobe elasticamente por política", () => {
  const budget = createCpuBudget({
    available: 8,
    reserve: 1,
    activeWorkers: 2,
  });
  const allocation = resolveFfmpegThreads({
    operation: "output-validation",
    budget,
  });
  assert.equal(allocation.threads, 6);
  assert.match(JSON.stringify(allocation), /"threads":6/);
});

test("property 2 — mínima operacional: threads >= 1 com capacidade mínima", () => {
  const budget = createCpuBudget({
    available: 2,
    reserve: 1,
    activeWorkers: 2,
  });
  for (const operation of [
    "ffmpeg-mux",
    "output-validation",
    "audio-analysis",
    "audio-envelope",
  ]) {
    const threads = resolveFfmpegThreads({ operation, budget }).threads;
    assert.ok(threads >= 1, `op=${operation} produziu threads=${threads}`);
  }
});

test("property 3 — determinístico mesmo com activeWorkers > usable", () => {
  const budget = createCpuBudget({
    available: 2,
    reserve: 1,
    activeWorkers: 8,
  });
  const allocation = resolveFfmpegThreads({ operation: "ffmpeg-mux", budget });
  assert.ok(allocation.threads === 1, `threads=${allocation.threads}`);
  assert.ok(allocation.threads >= 1);
});

test("property 4 — repetibilidade: mesma entrada, mesmo resultado", () => {
  const budget = createCpuBudget({
    available: 8,
    reserve: 1,
    activeWorkers: 2,
  });
  const first = resolveFfmpegThreads({ operation: "ffmpeg-mux", budget });
  const second = resolveFfmpegThreads({ operation: "ffmpeg-mux", budget });
  assert.deepEqual(first, second);
});

test("alocação de referência: mux 3, validation 6 (elástica), análise/env 1", () => {
  const budget = createCpuBudget({
    available: 8,
    reserve: 1,
    activeWorkers: 2,
  });
  assert.equal(
    resolveFfmpegThreads({ operation: "ffmpeg-mux", budget }).threads,
    3,
  );
  assert.equal(
    resolveFfmpegThreads({ operation: "output-validation", budget }).threads,
    6,
  );
  assert.equal(
    resolveFfmpegThreads({ operation: "audio-analysis", budget }).threads,
    1,
  );
  assert.equal(
    resolveFfmpegThreads({ operation: "audio-envelope", budget }).threads,
    1,
  );
});

test("filterThreads só para operações filter-heavy e nunca maior que threads", () => {
  const budget = createCpuBudget({
    available: 8,
    reserve: 1,
    activeWorkers: 2,
  });
  const mux = resolveFfmpegThreads({ operation: "ffmpeg-mux", budget });
  assert.equal(mux.filterThreads, 1);
  const validation = resolveFfmpegThreads({
    operation: "output-validation",
    budget,
  });
  assert.equal(validation.filterThreads, null);
  const analysis = resolveFfmpegThreads({
    operation: "audio-analysis",
    budget,
  });
  assert.ok(
    analysis.filterThreads === null ||
      analysis.filterThreads <= analysis.threads,
  );
});

test("override SONARA_CPU_THREADS força o mesmo valor para toda operação", () => {
  const environment = env({ SONARA_CPU_THREADS: "1" });
  const budget = createCpuBudgetFromEnv(environment);
  for (const operation of [
    "ffmpeg-mux",
    "output-validation",
    "audio-analysis",
    "audio-envelope",
  ]) {
    const allocation = resolveFfmpegThreads({ operation, budget, environment });
    assert.equal(allocation.threads, 1, `op=${operation}`);
    assert.equal(allocation.overrideActive, true);
  }
});

test("override SONARA_CPU_THREADS_OUTPUT_VALIDATION afeta só a operação", () => {
  const environment = env({ SONARA_CPU_THREADS_OUTPUT_VALIDATION: "3" });
  const budget = createCpuBudgetFromEnv(environment);
  const validation = resolveFfmpegThreads({
    operation: "output-validation",
    budget,
    environment,
  });
  assert.equal(validation.threads, 3);
  assert.equal(validation.overrideActive, true);
  for (const operation of ["ffmpeg-mux", "audio-analysis", "audio-envelope"]) {
    const allocation = resolveFfmpegThreads({ operation, budget, environment });
    assert.equal(allocation.overrideActive, false, `op=${operation}`);
  }
});

test("ffmpegThreadArgs serializa apenas valores válidos", () => {
  assert.deepEqual(ffmpegThreadArgs({ threads: 3, filterThreads: 1 }), [
    "-threads",
    "3",
    "-filter_threads",
    "1",
  ]);
  assert.deepEqual(ffmpegThreadArgs({ threads: 3, filterThreads: null }), [
    "-threads",
    "3",
  ]);
  assert.deepEqual(ffmpegThreadArgs({}), []);
});
