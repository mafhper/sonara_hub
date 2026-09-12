import assert from "node:assert/strict";
import test from "node:test";
import { createResourceSampleStore } from "../server/resource-sample-store.mjs";

function sample(overrides = {}) {
  return {
    t: 1000,
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

test("store adiciona amostras por job e preserva ordem", () => {
  const store = createResourceSampleStore();
  assert.equal(store.add("job-a", sample({ t: 1 })), true);
  assert.equal(store.add("job-a", sample({ t: 2 })), true);
  assert.equal(store.add("job-b", sample({ t: 3 })), true);
  const a = store.byJob("job-a");
  assert.equal(a.length, 2);
  assert.equal(a[0].t, 1);
  assert.equal(a[1].t, 2);
  assert.equal(a[0].jobId, "job-a");
  assert.equal(store.sampleCount(), 3);
  assert.deepEqual(store.jobIds(), ["job-a", "job-b"]);
  assert.equal(store.size(), 2);
});

test("store ignora job vazio ou amostra inválida", () => {
  const store = createResourceSampleStore();
  assert.equal(store.add("", sample()), false);
  assert.equal(store.add("job-a", null), false);
  assert.equal(store.add("job-a", "nope"), false);
  assert.equal(store.sampleCount(), 0);
  assert.equal(store.byJob("job-a").length, 0);
});

test("store corta amostras mais antigas por job e jobs mais antigos", () => {
  const store = createResourceSampleStore({
    maxSamplesPerJob: 3,
    maxJobs: 2,
  });
  for (let t = 1; t <= 5; t += 1) store.add("job-a", sample({ t }));
  assert.equal(store.byJob("job-a").length, 3);
  assert.equal(store.byJob("job-a")[0].t, 3, "descartou t=1 e t=2");
  store.add("job-b", sample({ t: 30 }));
  store.add("job-c", sample({ t: 40 }));
  assert.equal(store.size(), 2);
  assert.deepEqual(store.jobIds(), ["job-b", "job-c"]);
  assert.equal(store.byJob("job-a").length, 0, "job-a foi o mais antigo");
});

test("store snapshot congela cópias (mutação externa não vaza)", () => {
  const store = createResourceSampleStore();
  store.add("job-a", sample({ t: 1 }));
  const snap = store.snapshot();
  snap["job-a"][0].t = 999;
  assert.equal(store.byJob("job-a")[0].t, 1);
  store.clear();
  assert.equal(store.size(), 0);
  assert.equal(store.sampleCount(), 0);
});
