// Task A (pós-#79) — Resolução do total de VRAM com origem observável.
//
// Cobre as decisões: env válido tem precedência e não precisa de DXGI; env
// inválido/zero/negativo não é aceito silenciosamente (fallback DXGI); falha de
// DXGI → guard neutro (source "unavailable"), sem quebrar sampler; o resolver
// DXGI é assíncrono, não bloqueia o event loop e tem timeout; o reader WMI
// continua responsável só pelo DedicatedUsage (tota cacheado separado).
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  createWindowsDxgiTotalResolver,
  createWindowsGpuDedicatedUsageReader,
  resolveVramTotalBytes,
} from "../server/resource-sampler.mjs";

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

const HOST_TOTAL = 8546492416;

test("env válido → source env, usa override e NÃO chama DXGI", async () => {
  let resolverCalls = 0;
  const dxgiResolver = async () => {
    resolverCalls += 1;
    return 111;
  };
  const resolution = await resolveVramTotalBytes({
    environment: { SONARA_ADAPTIVE_VRAM_TOTAL_BYTES: String(HOST_TOTAL) },
    dxgiResolver,
  });
  assert.equal(resolution.source, "env");
  assert.equal(resolution.value, HOST_TOTAL);
  assert.equal(resolverCalls, 0, "override válido dispensa o DXGI");
});

test("env ausente → tenta DXGI e normaliza o total do host", async () => {
  const dxgiResolver = async () => 8546492416;
  const resolution = await resolveVramTotalBytes({
    environment: {},
    dxgiResolver,
  });
  assert.equal(resolution.source, "dxgi");
  assert.equal(resolution.value, HOST_TOTAL);
});

test("DXGI falha → guard neutro, sem quebrar a resolução", async () => {
  const dxgiResolver = async () => null;
  const resolution = await resolveVramTotalBytes({
    environment: {},
    dxgiResolver,
  });
  assert.equal(resolution.source, "unavailable");
  assert.equal(resolution.value, null);
});

test("DXGI lança erro → guard neutro (não propaga)", async () => {
  const dxgiResolver = async () => {
    throw new Error("adapter not found");
  };
  const resolution = await resolveVramTotalBytes({
    environment: {},
    dxgiResolver,
  });
  assert.equal(resolution.source, "unavailable");
  assert.equal(resolution.value, null);
});

for (const bad of ["abc", "0", "-5", "1.5.3", ""]) {
  test(`env inválido (${JSON.stringify(bad)}) → não aceito; fallback DXGI`, async () => {
    let resolverCalls = 0;
    const dxgiResolver = async () => {
      resolverCalls += 1;
      return HOST_TOTAL;
    };
    const resolution = await resolveVramTotalBytes({
      environment: { SONARA_ADAPTIVE_VRAM_TOTAL_BYTES: bad },
      dxgiResolver,
    });
    assert.equal(resolverCalls, 1, "inválido deve tentar DXGI");
    assert.equal(resolution.source, "dxgi");
    assert.equal(resolution.value, HOST_TOTAL);
  });
}

test("env inválido e sem resolver DXGI → unavailable (guard neutro)", async () => {
  const resolution = await resolveVramTotalBytes({
    environment: { SONARA_ADAPTIVE_VRAM_TOTAL_BYTES: "xpto" },
  });
  assert.equal(resolution.source, "unavailable");
  assert.equal(resolution.value, null);
});

test("sem env e sem resolver → unavailable (guard neutro)", async () => {
  const resolution = await resolveVramTotalBytes({ environment: {} });
  assert.equal(resolution.source, "unavailable");
  assert.equal(resolution.value, null);
});

test("resolveVramTotalBytes é assíncrono (awaitável, nunca chamada de execução síncrona)", async () => {
  const dxgiResolver = () => Promise.resolve(123);
  const pending = resolveVramTotalBytes({ environment: {}, dxgiResolver });
  assert.ok(
    pending && typeof pending.then === "function",
    "deve retornar promise (resolução nunca usa chamada bloquante)",
  );
  const resolution = await pending;
  assert.equal(resolution.source, "dxgi");
  assert.equal(resolution.value, 123);
});

test("resolver DXGI lê a capacidade física impressa pelo powershell", async () => {
  let spawnCount = 0;
  const resolver = createWindowsDxgiTotalResolver({
    spawn: () => {
      spawnCount += 1;
      return fakeChild({ stdoutData: "8546492416\n" });
    },
  });
  const value = await resolver();
  assert.equal(spawnCount, 1);
  assert.equal(value, HOST_TOTAL);
});

test("resolver DXGI rejeita saída corrompida → null", async () => {
  const resolver = createWindowsDxgiTotalResolver({
    spawn: () => fakeChild({ stdoutData: "DXGI_FAILED code=-2\n" }),
  });
  const value = await resolver();
  assert.equal(value, null);
});

test("resolver DXGI aplica timeout e mata o filho", async () => {
  let killed = false;
  const child = fakeChild({ neverClose: true });
  child.kill = () => {
    killed = true;
  };
  const resolver = createWindowsDxgiTotalResolver({
    timeoutMs: 60,
    spawn: () => child,
  });
  const start = Date.now();
  const value = await resolver();
  const elapsed = Date.now() - start;
  assert.equal(value, null);
  assert.ok(killed, "filho deve ser morto no timeout");
  assert.ok(elapsed < 500, `timeout deve ser curto, levou ${elapsed}ms`);
});

test("resolver DXGI pendente não bloqueia o event loop", async () => {
  const resolver = createWindowsDxgiTotalResolver({
    timeoutMs: 200,
    spawn: () => fakeChild({ neverClose: true }),
  });
  let settled = false;
  const pending = resolver().then(() => {
    settled = true;
  });
  assert.ok(pending && typeof pending.then === "function");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(
    settled,
    false,
    "child aberto → ainda pendente (nunca resolve síncrono; spawn assíncrono, não bloquante)",
  );
  await pending;
  assert.equal(settled, true, "timeout encerra a resolução");
});

test("total ausente → reader continua lendo usage com vramTotalBytes 0 (guard neutro)", async () => {
  const reader = createWindowsGpuDedicatedUsageReader({
    totalBytes: null,
    spawn: () => fakeChild({ stdoutData: "2147483648\n" }),
  });
  const result = await reader({ t: 0, pid: 1 });
  assert.equal(result.vramUsedBytes, 2 * 1024 ** 3);
  assert.equal(result.vramTotalBytes, 0, "sem total o guard permanece neutro");
});

test("total resolvido no startup → reader repassa o total cacheado em cada sample", async () => {
  let spawnCount = 0;
  const reader = createWindowsGpuDedicatedUsageReader({
    totalBytes: HOST_TOTAL,
    spawn: () => {
      spawnCount += 1;
      return fakeChild({ stdoutData: "2147483648\n" });
    },
  });
  const first = await reader({ t: 0, pid: 1 });
  const second = await reader({ t: 5000, pid: 1 });
  assert.equal(spawnCount, 2, "usage continua sendo lido por amostra");
  assert.equal(first.vramUsedBytes, 2 * 1024 ** 3);
  assert.equal(first.vramTotalBytes, HOST_TOTAL);
  assert.equal(second.vramTotalBytes, HOST_TOTAL);
});
