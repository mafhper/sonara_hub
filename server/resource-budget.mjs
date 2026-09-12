// CPU budget central para consumidores do FFmpeg (#78).
//
// Modelo (determinístico por processo — decisão em
// .dev/tasks/gpu-plus/docs/2026-09-11-nota-cpu-budget.md e evidência em
// docs/performance/compare-2026-09-11-baseline-vs-78.md):
//   capacidade = availableParallelism()  (8)
//   reserve    = 1                         (margem do sistema)
//   usable     = capacidade - reserve      (7)
//
// Alocação por operação via operationPolicy (tabela central, sem exceções
// espalhadas nos módulos consumidores):
//   base  = max(1, floor(usable / overlapFactor))
//   threads = min(base, maxThreads)
//   overlapFactor  → sobreposição possível DENTRO do worker (Promise.all).
//   maxThreads     → teto da operação (elasticidade controlada para etapas
//                    curtas e isoladas que sofrem com o cap genérico).
//
// A evidência do benchmark #78 mostrou regressão concentrada em
// output-validation (decode curto): teto elevado para 6, enquanto as demais
// operações mantêm o cap conservador. Sumários de pior caso por estágio:
//   ffmpeg-mux 3×2 = 6 ≤ usable · validation 6×2 usa slack (decode curto) ·
//   análise/env 1×4 = 4 ≤ usable
//
// Env overrides (instrumentos A/B, não defaults de produção):
//   SONARA_CPU_AVAILABLE, SONARA_CPU_RESERVE, SONARA_RENDER_CONCURRENCY,
//   SONARA_CPU_THREADS (todas as operações) e
//   SONARA_CPU_THREADS_<OPERACAO> (ex.: SONARA_CPU_THREADS_OUTPUT_VALIDATION).
import os from "node:os";

const operationPolicy = Object.freeze({
  "audio-analysis": { overlapFactor: 2, maxThreads: 1, filterHeavy: true },
  "audio-envelope": { overlapFactor: 2, maxThreads: 1, filterHeavy: false },
  "ffmpeg-mux": { overlapFactor: 1, maxThreads: 3, filterHeavy: true },
  "output-validation": { overlapFactor: 1, maxThreads: 6, filterHeavy: false },
});

let overrideLogged = false;

function envNumber(name, fallback, environment) {
  const source = environment ?? process.env;
  const value = Number(source[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envKey(operation) {
  return `SONARA_CPU_THREADS_${operation.toUpperCase().replaceAll("-", "_")}`;
}

export function createCpuBudget({ available, reserve, activeWorkers } = {}) {
  const safeAvailable = Math.max(
    1,
    Math.floor(
      Number(available) || os.availableParallelism?.() || os.cpus().length,
    ),
  );
  const safeReserve = Math.max(
    0,
    Math.min(safeAvailable - 1, Math.floor(Number(reserve) || 0)),
  );
  const safeActive = Math.max(1, Math.floor(Number(activeWorkers) || 2));
  const usable = Math.max(1, safeAvailable - safeReserve);
  return {
    available: safeAvailable,
    reserve: safeReserve,
    usable,
    activeWorkers: safeActive,
    snapshot() {
      return {
        available: safeAvailable,
        reserve: safeReserve,
        usable,
        activeWorkers: safeActive,
      };
    },
  };
}

export function createCpuBudgetFromEnv(environment = process.env) {
  return createCpuBudget({
    available: envNumber("SONARA_CPU_AVAILABLE", undefined, environment),
    reserve: envNumber("SONARA_CPU_RESERVE", 1, environment),
    activeWorkers: envNumber("SONARA_RENDER_CONCURRENCY", 2, environment),
  });
}

export function resolveFfmpegThreads({
  operation = "ffmpeg-mux",
  budget,
  environment = process.env,
} = {}) {
  const effectiveBudget = budget ?? createCpuBudgetFromEnv(environment);
  const policy = operationPolicy[operation] ?? {
    overlapFactor: 1,
    maxThreads: 3,
    filterHeavy: false,
  };
  const base = Math.max(
    1,
    Math.floor(effectiveBudget.usable / policy.overlapFactor),
  );
  const perOpOverride = envNumber(envKey(operation), NaN, environment);
  const globalOverride = envNumber("SONARA_CPU_THREADS", NaN, environment);
  const effectiveOverride = Number.isFinite(perOpOverride)
    ? perOpOverride
    : globalOverride;
  const cap = Number.isFinite(effectiveOverride)
    ? Math.max(1, Math.floor(effectiveOverride))
    : policy.maxThreads;
  const threads = Math.min(base, cap);
  const filterThreads = policy.filterHeavy
    ? Math.max(1, Math.floor(threads / 2))
    : null;
  if (Number.isFinite(effectiveOverride) && !overrideLogged) {
    overrideLogged = true;
    console.info(
      `[cpu-budget] override ${effectiveOverride === perOpOverride ? envKey(operation) : "SONARA_CPU_THREADS"}` +
        `=${effectiveOverride} (default per op: ${policy.maxThreads}, base: ${base}); ` +
        `available=${effectiveBudget.available} reserve=${effectiveBudget.reserve} ` +
        `usable=${effectiveBudget.usable}`,
    );
  }
  return {
    threads,
    filterThreads,
    overrideActive: Number.isFinite(effectiveOverride),
    operation,
    budget: effectiveBudget.snapshot(),
  };
}

export function ffmpegThreadArgs(allocation) {
  const args = [];
  if (allocation?.threads != null && allocation.threads >= 1) {
    args.push("-threads", String(allocation.threads));
  }
  if (allocation?.filterThreads != null && allocation.filterThreads >= 1) {
    args.push("-filter_threads", String(allocation.filterThreads));
  }
  return args;
}
