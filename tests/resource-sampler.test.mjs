import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  aggregateResourceSamples,
  clampPct,
  createResourceSampler,
  createSampleStreamThrottle,
  createSystemCpuMeter,
  createWindowsGpuDedicatedUsageReader,
  createWindowsGpuEngineUsageReader,
  p95,
  sanitizeResourceSample,
  vramReaderOptionsFromEnv,
} from "../server/resource-sampler.mjs";

const baseSample = (overrides = {}) => ({
  t: 1000,
  pid: 42,
  stage: "webgl-render",
  sysCpu: 50,
  workerCpu: 10,
  rssBytes: 200 * 1024 * 1024,
  heapUsedBytes: 80 * 1024 * 1024,
  freeMemBytes: 8 * 1024 * 1024 * 1024,
  totalMemBytes: 16 * 1024 * 1024 * 1024,
  ...overrides,
});

test("clampPct normaliza e não deixa percentual fora de 0..100", () => {
  assert.equal(clampPct(50), 50);
  assert.equal(clampPct(150), 100);
  assert.equal(clampPct(-5), 0);
  assert.equal(clampPct(Number.NaN), 0);
  assert.equal(clampPct(Number("abc")), 0);
  assert.equal(clampPct("70"), 70);
});

test("sanitizeResourceSample clampa percentuais e zera não-finitos", () => {
  const sample = sanitizeResourceSample(
    baseSample({ sysCpu: 421, workerCpu: Number.NaN, rssBytes: -5 }),
  );
  assert.equal(sample.sysCpu, 100);
  assert.equal(sample.workerCpu, 0);
  assert.equal(sample.rssBytes, 0);
  assert.equal(sample.stage, "webgl-render");
  assert.equal(sample.pid, 42);
});

test("sanitizeResourceSample normaliza VRAM (não-finito/negativo → 0)", () => {
  const sample = sanitizeResourceSample(
    baseSample({
      vramUsedBytes: -1,
      vramTotalBytes: Number.NaN,
    }),
  );
  assert.equal(sample.vramUsedBytes, 0);
  assert.equal(sample.vramTotalBytes, 0);
  const ok = sanitizeResourceSample(
    baseSample({
      vramUsedBytes: 2 * 1024 ** 3,
      vramTotalBytes: 8 * 1024 ** 3,
    }),
  );
  assert.equal(ok.vramUsedBytes, 2 * 1024 ** 3);
  assert.equal(ok.vramTotalBytes, 8 * 1024 ** 3);
});

test("sanitizeResourceSample normaliza GPU Engine (fora de 0..100 → clamp)", () => {
  const sample = sanitizeResourceSample(
    baseSample({ gpu3d: -3, gpuCopy: 150, vcn: Number.NaN }),
  );
  assert.equal(sample.gpu3d, 0);
  assert.equal(sample.gpuCopy, 100);
  assert.equal(sample.vcn, 0);
  const ok = sanitizeResourceSample(
    baseSample({ gpu3d: 42.5, gpuCopy: 0, vcn: 57 }),
  );
  assert.equal(ok.gpu3d, 42.5);
  assert.equal(ok.gpuCopy, 0);
  assert.equal(ok.vcn, 57);
});

test("p95 de série conhecida", () => {
  assert.equal(p95([]), 0);
  assert.equal(p95([5]), 5);
  assert.equal(p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 10);
  assert.equal(p95([1, 2, 3, 4, 5, 6, 7, 8, 9]), 9);
});

test("aggregateResourceSamples vazio → windows [] e summary null", () => {
  const report = aggregateResourceSamples([], { windowMs: 60000 });
  assert.deepEqual(report.windows, []);
  assert.equal(report.summary, null);
  const reportNonArray = aggregateResourceSamples(null);
  assert.deepEqual(reportNonArray.windows, []);
  assert.equal(reportNonArray.summary, null);
});

test("aggregateResourceSamples calcula média/pico/p95 e memória por janela", () => {
  const samples = [
    baseSample({
      t: 1000,
      sysCpu: 10,
      workerCpu: 2,
      freeMemBytes: 6 * 1024 ** 3,
    }),
    baseSample({
      t: 11000,
      sysCpu: 20,
      workerCpu: 4,
      rssBytes: 260 * 1024 ** 2,
      freeMemBytes: 5 * 1024 ** 3,
    }),
    baseSample({ t: 21000, sysCpu: 90, workerCpu: 15 }),
  ];
  const report = aggregateResourceSamples(samples, { windowMs: 60000 });
  assert.equal(report.windows.length, 1);
  const window = report.windows[0];
  assert.equal(window.sampleCount, 3);
  assert.equal(window.sysCpu.avg, 40);
  assert.equal(window.sysCpu.peak, 90);
  assert.equal(window.sysCpu.p95, 90);
  assert.equal(window.workerCpu.peak, 15);
  assert.equal(window.peakRssBytes, 260 * 1024 ** 2);
  assert.equal(window.freeMemBytes, 5 * 1024 ** 3);
  const summary = report.summary;
  assert.equal(summary.sysCpu.avg, 40);
  assert.equal(summary.sysCpu.peak, 90);
  assert.equal(summary.wallMs, 20000);
});

test("aggregateResourceSamples separa janelas fixas por timestamp", () => {
  const samples = [
    baseSample({ t: 1000, sysCpu: 70 }),
    baseSample({ t: 61000, sysCpu: 30 }),
    baseSample({ t: 121000, sysCpu: 80 }),
  ];
  const report = aggregateResourceSamples(samples, { windowMs: 60000 });
  assert.equal(report.windows.length, 3);
  assert.equal(report.windows[0].sysCpu.avg, 70);
  assert.equal(report.windows[1].sysCpu.avg, 30);
  assert.equal(report.windows[2].sysCpu.avg, 80);
});

test("aggregateResourceSamples sanitiza entradas corrompidas antes de agregar", () => {
  const samples = [
    baseSample({ t: 1000, sysCpu: 721968832546981 }),
    baseSample({ t: 11000, sysCpu: 50 }),
  ];
  const report = aggregateResourceSamples(samples, { windowMs: 60000 });
  assert.equal(report.summary.sysCpu.peak, 100);
  assert.equal(report.summary.sysCpu.avg, 75);
});

test("aggregateResourceSamples agrega VRAM por janela (pct = peak/total)", () => {
  const samples = [
    baseSample({
      t: 1000,
      vramUsedBytes: 1 * 1024 ** 3,
      vramTotalBytes: 8 * 1024 ** 3,
    }),
    baseSample({
      t: 11000,
      vramUsedBytes: 3 * 1024 ** 3,
      vramTotalBytes: 8 * 1024 ** 3,
    }),
    baseSample({
      t: 21000,
      vramUsedBytes: 5 * 1024 ** 3,
      vramTotalBytes: 8 * 1024 ** 3,
    }),
  ];
  const report = aggregateResourceSamples(samples, { windowMs: 60000 });
  const w = report.windows[0];
  assert.equal(w.vramUsedBytes.avg, 3 * 1024 ** 3);
  assert.equal(w.vramUsedBytes.peak, 5 * 1024 ** 3);
  assert.equal(w.vramUsedBytes.p95, 5 * 1024 ** 3);
  assert.equal(w.vramTotalBytes, 8 * 1024 ** 3);
  assert.equal(w.vramUsedPct, 62.5);
  const summary = report.summary;
  assert.equal(summary.vramUsedBytes.peak, 5 * 1024 ** 3);
  assert.equal(summary.vramUsedPct, 62.5);
});

test("aggregateResourceSamples sem total de VRAM → pct 0 (guard neutro)", () => {
  const report = aggregateResourceSamples(
    [baseSample({ t: 1000, vramUsedBytes: 2 * 1024 ** 3 })],
    { windowMs: 60000 },
  );
  assert.equal(report.windows[0].vramTotalBytes, 0);
  assert.equal(report.windows[0].vramUsedPct, 0);
});

test("createSampleStreamThrottle emite 1 amostra por intervalo (trailing)", () => {
  let now = 1000;
  const throttle = createSampleStreamThrottle({
    intervalMs: 5000,
    now: () => now,
  });
  const first = { t: 1 };
  assert.equal(throttle(first), first);
  now += 1000;
  assert.equal(throttle({ t: 2 }), null);
  now += 1000;
  assert.equal(throttle({ t: 3 }), null);
  now += 3000;
  const sample = { t: 4 };
  assert.equal(throttle(sample), sample);
  assert.equal(throttle({ t: 5 }), null);
});

test("createWindowsGpuEngineUsageReader maximiza por tipo e parseia JSON", async () => {
  let spawnCount = 0;
  const reader = createWindowsGpuEngineUsageReader({
    spawn: () => {
      spawnCount += 1;
      return fakeChild({
        stdoutData: '{"gpu3d":42,"gpuCopy":0,"vcn":57.5}\n',
      });
    },
  });
  const result = await reader({ t: 0, pid: 1 });
  assert.equal(spawnCount, 1);
  assert.equal(result.gpu3d, 42);
  assert.equal(result.gpuCopy, 0);
  assert.equal(result.vcn, 57.5);
});

test("createWindowsGpuEngineUsageReader lixo → null e backoff em falhas", async () => {
  let spawnCount = 0;
  const reader = createWindowsGpuEngineUsageReader({
    maxMisses: 2,
    backoffMs: 60000,
    timeoutMs: 50,
    spawn: () => {
      spawnCount += 1;
      return spawnCount === 1
        ? fakeChild({ stdoutData: "lixo\n" })
        : fakeChild({ errorOnSpawn: true });
    },
  });
  const first = await reader({ t: 0, pid: 1 });
  const second = await reader({ t: 1, pid: 1 });
  assert.equal(first.gpu3d, null);
  assert.equal(second.gpu3d, null);
  assert.equal(spawnCount, 2, "deve tentar até o limite de misses");
  const third = await reader({ t: 1, pid: 1 });
  assert.equal(third.gpu3d, null);
  assert.equal(spawnCount, 2, "em backoff não deve re-spawnar");
});

test("onSample recebe cada amostra armazenada com VRAM e GPU", async () => {
  const received = [];
  const sampler = createResourceSampler({
    intervalMs: 10,
    maxSamples: 50,
    getStage: () => "stream-stage",
    enabled: true,
    additionalReaders: [
      () => ({
        vramUsedBytes: 5 * 1024 ** 2,
        vramTotalBytes: 8 * 1024 ** 3,
        gpu3d: 33,
        gpuCopy: 10,
        vcn: 0,
      }),
    ],
    onSample: (sample) => received.push(sample),
  });
  sampler.start();
  await new Promise((resolve) => setTimeout(resolve, 30));
  sampler.stop();
  assert.ok(received.length >= 1, `onSample recebeu=${received.length}`);
  assert.ok(received.length === received.filter((s) => s.t > 0).length);
  assert.ok(
    received.every((s) => s.vramTotalBytes > 0),
    "VRAM total no sample",
  );
  assert.ok(
    received.every((s) => s.gpu3d >= 0 && s.gpuCopy >= 0 && s.vcn >= 0),
    "GPU engine sanitizado no sample",
  );
});

function fakeChild({
  stdoutData = "",
  errorOnSpawn = false,
  neverClose = false,
} = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.kill = () => {};
  if (errorOnSpawn) {
    process.nextTick(() => child.emit("error", new Error("boom")));
  } else if (neverClose) {
    process.nextTick(() => {
      if (stdoutData) child.stdout.emit("data", stdoutData);
    });
  } else {
    process.nextTick(() => {
      if (stdoutData) child.stdout.emit("data", stdoutData);
      child.emit("close");
    });
  }
  return child;
}

test("createWindowsGpuDedicatedUsageReader lê usage e passa o total", async () => {
  let spawnCount = 0;
  const reader = createWindowsGpuDedicatedUsageReader({
    totalBytes: 8 * 1024 ** 3,
    spawn: () => {
      spawnCount += 1;
      return fakeChild({ stdoutData: "2147483648\n" });
    },
  });
  const result = await reader({ t: 0, pid: 1 });
  assert.equal(spawnCount, 1);
  assert.equal(result.vramUsedBytes, 2 * 1024 ** 3);
  assert.equal(result.vramTotalBytes, 8 * 1024 ** 3);
});

test("createWindowsGpuDedicatedUsageReader rejeita saída corrompida", async () => {
  const reader = createWindowsGpuDedicatedUsageReader({
    spawn: () => fakeChild({ stdoutData: "lixo\n" }),
  });
  const result = await reader({ t: 0, pid: 1 });
  assert.equal(result.vramUsedBytes, null);
});

test("createWindowsGpuDedicatedUsageReader aplica timeout e mata o filho", async () => {
  let killed = false;
  const child = fakeChild({ neverClose: true });
  child.kill = () => {
    killed = true;
  };
  const reader = createWindowsGpuDedicatedUsageReader({
    timeoutMs: 60,
    backoffMs: 5,
    spawn: () => child,
  });
  const start = Date.now();
  const result = await reader({ t: 0, pid: 1 });
  const elapsed = Date.now() - start;
  assert.equal(result.vramUsedBytes, null);
  assert.ok(killed, "filho deve ser morto no timeout");
  assert.ok(elapsed < 500, `timeout deve ser curto, levou ${elapsed}ms`);
});

test("createWindowsGpuDedicatedUsageReader dá backoff após falhas seguidas", async () => {
  let spawnCount = 0;
  const reader = createWindowsGpuDedicatedUsageReader({
    maxMisses: 2,
    backoffMs: 60000,
    timeoutMs: 50,
    spawn: () => {
      spawnCount += 1;
      return fakeChild({ errorOnSpawn: true });
    },
  });
  const first = await reader({ t: 0, pid: 1 });
  const second = await reader({ t: 1, pid: 1 });
  assert.equal(first.vramUsedBytes, null);
  assert.equal(second.vramUsedBytes, null);
  assert.equal(spawnCount, 2, "deve tentar até o limite de misses");
  const third = await reader({ t: 1, pid: 1 });
  assert.equal(third.vramUsedBytes, null);
  assert.equal(spawnCount, 2, "em backoff não deve re-spawnar");
  assert.equal(third.vramTotalBytes, null);
});

test("readers async não travam o sampler e entram no sample", async () => {
  let samples = null;
  const asyncReader = () =>
    Promise.resolve({ vramUsedBytes: 1234, vramTotalBytes: 8192 });
  const sampler = createResourceSampler({
    intervalMs: 10,
    maxSamples: 50,
    getStage: () => "async-stage",
    enabled: true,
    additionalReaders: [asyncReader],
  });
  sampler.start();
  await new Promise((resolve) => setTimeout(resolve, 30));
  const report = sampler.stop();
  samples = report.samples;
  assert.ok(samples.length >= 1, `samples=${samples.length}`);
  const withVram = samples.filter((s) => s.vramUsedBytes > 0);
  assert.ok(withVram.length >= 1, `samples com VRAM=${withVram.length}`);
});

test("createSystemCpuMeter acompanha deltas de os.cpus injetável", () => {
  const cpus = [
    { times: { user: 1000, nice: 0, sys: 1000, idle: 8000, irq: 0 } },
  ];
  const meter = createSystemCpuMeter(() => cpus);
  assert.equal(meter(), 0);
  cpus[0].times.idle += 8000;
  cpus[0].times.user += 2000;
  const pct = meter();
  assert.ok(pct > 0 && pct <= 100, `pct=${pct}`);
});

test("createResourceSampler coleta amostras em intervalo e para no stop", async () => {
  const sampler = createResourceSampler({
    intervalMs: 15,
    maxSamples: 200,
    getStage: () => "stage-test",
    enabled: true,
  });
  sampler.start();
  await new Promise((resolve) => setTimeout(resolve, 80));
  const report = sampler.stop();
  assert.ok(report, "stop() deve retornar relatório");
  assert.ok(report.samples.length >= 1, `samples=${report.samples.length}`);
  const first = report.samples[0];
  assert.equal(first.pid, process.pid);
  assert.equal(first.stage, "stage-test");
  assert.ok(typeof first.sysCpu === "number");
  assert.ok(first.rssBytes > 0);
  assert.ok(report.aggregate.summary.sampleCount === report.samples.length);
  await new Promise((resolve) => setTimeout(resolve, 60));
  const reportAfter = sampler.stop();
  assert.equal(reportAfter, null, "stop após parado deve ser no-op");
});

test("createResourceSampler desabilitado → start é no-op e stop retorna null", () => {
  const sampler = createResourceSampler({ intervalMs: 15, enabled: false });
  sampler.start();
  const report = sampler.stop();
  assert.equal(report, null);
});

test("window() filtra pela janela rolante com now injetável", async () => {
  const sampler = createResourceSampler({
    intervalMs: 50,
    enabled: true,
    getStage: () => "stage-window",
  });
  sampler.start();
  await new Promise((resolve) => setTimeout(resolve, 220));
  const report = sampler.stop();
  assert.ok(report.samples.length >= 3, `samples=${report.samples.length}`);
  const maxT = Math.max(...report.samples.map((s) => s.t));
  const allCount = sampler.window(1_000_000, maxT).summary.sampleCount;
  assert.ok(allCount === report.samples.length, `all=${allCount}`);
  const recentCount = sampler.window(1, maxT).summary.sampleCount;
  assert.equal(recentCount, 1, `recent=${recentCount}`);
  const emptyCount = sampler.window(1, maxT + 1_000_000).summary;
  assert.equal(emptyCount, null);
});
