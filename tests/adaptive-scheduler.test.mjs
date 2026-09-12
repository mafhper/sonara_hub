import assert from "node:assert/strict";
import test from "node:test";
import {
  clampConcurrency,
  initialState,
  sanitizeSignal,
  stepAdaptiveScheduler,
} from "../server/adaptive-scheduler.mjs";

const T0 = 1_000_000_000;

test("initialState clampa current entre min e max", () => {
  assert.equal(initialState({ current: 2, min: 1, max: 2 }).concurrency, 2);
  assert.equal(initialState({ current: 5, min: 1, max: 2 }).concurrency, 2);
  assert.equal(initialState({ current: 0, min: 1, max: 2 }).concurrency, 1);
  assert.equal(initialState({ current: 2 }).concurrency, 2);
  assert.equal(initialState({ current: 3, min: 2 }).concurrency, 3);
});

test("sanitizeSignal rejeita sinal sem sysCpu finito", () => {
  assert.equal(sanitizeSignal(null), null);
  assert.equal(sanitizeSignal({}), null);
  assert.equal(sanitizeSignal({ sysCpu: "abc" }), null);
  assert.deepEqual(sanitizeSignal({ sysCpu: 50, freeMemBytes: 8e9 }), {
    sysCpu: 50,
    freeMemBytes: 8e9,
    vramUsedBytes: null,
    vramTotalBytes: null,
  });
});

test("sanitizeSignal normaliza VRAM (negativo/total zerado → null)", () => {
  assert.deepEqual(
    sanitizeSignal({ sysCpu: 50, vramUsedBytes: -1, vramTotalBytes: 8e9 }),
    {
      sysCpu: 50,
      freeMemBytes: null,
      vramUsedBytes: null,
      vramTotalBytes: 8e9,
    },
  );
  assert.deepEqual(
    sanitizeSignal({ sysCpu: 50, vramUsedBytes: 4e9, vramTotalBytes: 0 }),
    {
      sysCpu: 50,
      freeMemBytes: null,
      vramUsedBytes: 4e9,
      vramTotalBytes: null,
    },
  );
});

test("banda 65-85 mantém concurrency", () => {
  const state = initialState({ current: 2, min: 1, max: 2 });
  const { decision } = stepAdaptiveScheduler(state, {
    signal: { sysCpu: 70 },
    now: T0,
  });
  assert.equal(decision.action, "hold");
  assert.equal(decision.next, 2);
});

test("sysCpu alto por fallSamples reduz 2→1", () => {
  let state = initialState({ current: 2, min: 1, max: 2 });
  let result = stepAdaptiveScheduler(state, {
    signal: { sysCpu: 88 },
    now: T0,
  });
  assert.equal(result.decision.action, "decrease");
  assert.equal(result.decision.next, 1);
  state = result.state;
  assert.equal(state.concurrency, 1);
  assert.equal(state.downStreak, 0, "streak zerada após ação");
});

test("sysCpu baixo exige streak de riseSamples para subir", () => {
  let state = initialState({ current: 1, min: 1, max: 2 });
  let result = stepAdaptiveScheduler(state, {
    signal: { sysCpu: 40 },
    now: T0,
  });
  assert.equal(result.decision.action, "hold");
  assert.equal(result.decision.reason.includes("streak"), true);
  state = result.state;
  assert.equal(state.upStreak, 1);
  result = stepAdaptiveScheduler(state, {
    signal: { sysCpu: 40 },
    now: T0 + 1000,
  });
  assert.equal(result.decision.action, "increase");
  assert.equal(result.decision.next, 2);
});

test("concurrency já máximo não sobe acima de max", () => {
  let state = initialState({ current: 2, min: 1, max: 2 });
  for (let i = 0; i < 3; i++) {
    const result = stepAdaptiveScheduler(state, {
      signal: { sysCpu: 40 },
      now: T0 + i * 1000,
    });
    state = result.state;
  }
  assert.equal(state.concurrency, 2);
  assert.notEqual(
    stepAdaptiveScheduler(state, {
      signal: { sysCpu: 40 },
      now: T0 + 100000,
    }).decision.action,
    "increase",
  );
});

test("concurrency já mínimo não reduz abaixo de min", () => {
  let state = initialState({ current: 1, min: 1, max: 2 });
  for (let i = 0; i < 2; i++) {
    const result = stepAdaptiveScheduler(state, {
      signal: { sysCpu: 95 },
      now: T0 + i * 1000,
    });
    state = result.state;
  }
  assert.equal(state.concurrency, 1);
});

test("cooldown impede decisão imediata após ajuste", () => {
  let state = initialState({
    current: 2,
    min: 1,
    max: 2,
    cooldownMs: 30000,
  });
  const first = stepAdaptiveScheduler(state, {
    signal: { sysCpu: 95 },
    now: T0,
  });
  assert.equal(first.decision.action, "decrease");
  state = first.state;
  assert.equal(state.concurrency, 1);
  const second = stepAdaptiveScheduler(
    { ...state, upStreak: 1 },
    { signal: { sysCpu: 45, riseSamples: 1 }, now: T0 + 5000 },
  );
  assert.equal(second.decision.action, "hold");
  assert.equal(second.decision.reason, "cooldown");
  const third = stepAdaptiveScheduler(
    { ...state, upStreak: 1 },
    {
      signal: { sysCpu: 45, riseSamples: 1 },
      now: T0 + 60000,
    },
  );
  assert.equal(third.decision.action, "increase");
});

test("memory-guard: memória baixa impede aumento mesmo com cpu baixa", () => {
  let state = initialState({ current: 1, min: 1, max: 2 });
  state.upStreak = 2;
  const result = stepAdaptiveScheduler(state, {
    signal: { sysCpu: 40, freeMemBytes: 1.5 * 1024 ** 3 },
    now: T0,
  });
  assert.equal(result.decision.action, "hold");
  assert.equal(result.decision.reason, "memória-guard (não sobe)");
  assert.equal(result.state.upStreak, 0);
});

test("memory-guard + cpu alta reduz mesmo sem streak", () => {
  let state = initialState({ current: 2, min: 1, max: 2 });
  const result = stepAdaptiveScheduler(state, {
    signal: { sysCpu: 92, freeMemBytes: 1 * 1024 ** 3 },
    now: T0,
  });
  assert.equal(result.decision.action, "decrease");
  assert.equal(result.decision.next, 1);
});

test("vram-guard: water-mark alto + cpu alta reduz e marca pressão", () => {
  let state = initialState({ current: 2, min: 1, max: 2 });
  const result = stepAdaptiveScheduler(state, {
    signal: {
      sysCpu: 95,
      vramUsedBytes: 7.5 * 1024 ** 3,
      vramTotalBytes: 8 * 1024 ** 3,
      fallSamples: 1,
    },
    now: T0,
  });
  assert.equal(result.decision.action, "decrease");
  assert.equal(result.decision.next, 1);
  assert.equal(
    result.state.lastPressureAt,
    T0,
    "decrease por pressão registra lastPressureAt",
  );
});

test("vram-guard: water-mark alto bloqueia subida mesmo com cpu baixa", () => {
  let state = initialState({ current: 1, min: 1, max: 2 });
  state.upStreak = 3;
  const result = stepAdaptiveScheduler(state, {
    signal: {
      sysCpu: 20,
      vramUsedBytes: 7 * 1024 ** 3,
      vramTotalBytes: 8 * 1024 ** 3,
      riseSamples: 1,
    },
    now: T0,
  });
  assert.equal(result.decision.action, "hold");
  assert.equal(result.decision.reason, "vram-guard (não sobe)");
  assert.equal(result.state.upStreak, 0);
});

test("vram-pressure média bloqueia subida mas não a redução", () => {
  let state = initialState({ current: 1, min: 1, max: 2 });
  state.upStreak = 2;
  const blocked = stepAdaptiveScheduler(state, {
    signal: {
      sysCpu: 20,
      vramUsedBytes: 6 * 1024 ** 3,
      vramTotalBytes: 8 * 1024 ** 3,
    },
    now: T0,
  });
  assert.equal(blocked.decision.action, "hold");
  assert.equal(blocked.decision.reason.includes("vram-pressure"), true);
  assert.equal(blocked.state.upStreak, 0);

  const high = initialState({ current: 2, min: 1, max: 2 });
  const fall = stepAdaptiveScheduler(high, {
    signal: {
      sysCpu: 95,
      vramUsedBytes: 6 * 1024 ** 3,
      vramTotalBytes: 8 * 1024 ** 3,
      fallSamples: 1,
    },
    now: T0,
  });
  assert.equal(fall.decision.action, "decrease");
  assert.equal(fall.decision.next, 1);
});

test("vram neutro sem total → não bloqueia; subida normal", () => {
  let state = initialState({ current: 1, min: 1, max: 2 });
  state.upStreak = 1;
  const result = stepAdaptiveScheduler(state, {
    signal: { sysCpu: 20, vramUsedBytes: 7 * 1024 ** 3, riseSamples: 1 },
    now: T0,
  });
  assert.equal(result.decision.action, "increase");
  assert.equal(result.decision.next, 2);
});

test("recovery: após decrease por pressão, subida trava pela histerese", () => {
  let state = initialState({ current: 2, min: 1, max: 2 });
  const first = stepAdaptiveScheduler(state, {
    signal: {
      sysCpu: 95,
      vramUsedBytes: 7.5 * 1024 ** 3,
      vramTotalBytes: 8 * 1024 ** 3,
      fallSamples: 1,
      recoveryCooldownMs: 90000,
    },
    now: T0,
  });
  assert.equal(first.decision.action, "decrease");
  state = first.state;
  assert.equal(state.lastPressureAt, T0);

  const lowSignal = {
    sysCpu: 20,
    vramUsedBytes: 4 * 1024 ** 3,
    vramTotalBytes: 8 * 1024 ** 3,
    riseSamples: 1,
    recoveryCooldownMs: 90000,
  };
  const duringCooldown = stepAdaptiveScheduler(
    { ...state, upStreak: 1 },
    { signal: lowSignal, now: T0 + 5000 },
  );
  assert.equal(duringCooldown.decision.action, "hold");
  assert.equal(
    duringCooldown.decision.reason.includes("recovery"),
    true,
    `reason=${duringCooldown.decision.reason}`,
  );

  const duringRecovery = stepAdaptiveScheduler(
    { ...state, upStreak: 1 },
    { signal: lowSignal, now: T0 + 35000 },
  );
  assert.equal(duringRecovery.decision.action, "hold");
  assert.equal(
    duringRecovery.decision.reason.includes("recovery"),
    true,
    `reason=${duringRecovery.decision.reason}`,
  );

  const afterRecovery = stepAdaptiveScheduler(
    { ...state, upStreak: 1 },
    { signal: lowSignal, now: T0 + 100000 },
  );
  assert.equal(afterRecovery.decision.action, "increase");
  assert.equal(afterRecovery.decision.next, 2);
});

test("sem sinal → hold sem quebrar estado", () => {
  const state = initialState({ current: 2, min: 1, max: 2 });
  const { decision } = stepAdaptiveScheduler(state, { now: T0 });
  assert.equal(decision.action, "hold");
  assert.equal(decision.reason, "no-signal");
});

test("clampConcurrency respeita limites", () => {
  assert.equal(clampConcurrency(1, 1, 2), 1);
  assert.equal(clampConcurrency(3, 1, 2), 2);
  assert.equal(clampConcurrency(Number.NaN, 1, 2), 1);
});
