// F4.2 — Correlação worker/job ↔ sample (jobId + timestamp + stage).
//
// Liga os dois canais que chegam ao processo principal:
//   - `stageTimings` (persistidos por job): timeline de estágios com
//     `startedAt`/`endedAt` ISO → intervalos [startMs, endMs).
//   - `resource-sample` (F4.1, buffer `resourceSampleStore`): amostras com `t`
//     (ms) e o `stage` RELATADO pelo worker no momento da amostra.
//
// Contrato de semântica (crítico para a calibração do F4.6): o `stage`
// relatado na amostra significa "o job foi identificado como `stage` quando a
// amostra foi produzida" — NÃO prova que todo o intervalo de amostragem
// pertenceu àquele estágio. A correlação cruza o relatado com a timeline real:
// cada amostra recebe o `stage` do intervalo que contém seu `t` e um flag
// `matches` (relatado == intervalar). Divergências nas bordas (latência de IPC,
// amostra que cruza a transição) ficam visíveis, não escondidas.
//
// F4.3/F4.4: a partir da correlação, agrupa (`groupSamplesByStage`) e agrega
// (`aggregateStageResources`) recursos por estágio — ainda SEM pesos: médias,
// picos e p95 por estágio, por job, prontos para o relatório observacional do
// F4.6. O módulo não toma decisão de scheduling.
import { p95 } from "./resource-sampler.mjs";

export function stageTimingIntervals(stageTimings) {
  if (!Array.isArray(stageTimings)) return [];
  const intervals = [];
  for (const entry of stageTimings) {
    if (!entry || typeof entry !== "object") continue;
    const startMs = toMiliseconds(entry.startedAt);
    if (startMs === null) continue;
    const endMs = toMiliseconds(entry.endedAt);
    const stage =
      entry.stage === undefined || entry.stage === null
        ? "unknown"
        : String(entry.stage);
    intervals.push({
      stage,
      label:
        entry.label === undefined || entry.label === null
          ? stage
          : String(entry.label),
      startMs,
      endMs,
      durationMs:
        Number.isFinite(Number(entry.durationMs)) &&
        Number(entry.durationMs) >= 0
          ? Math.round(Number(entry.durationMs))
          : endMs !== null
            ? Math.max(0, endMs - startMs)
            : null,
    });
  }
  return intervals.sort((a, b) => a.startMs - b.startMs);
}

function toMiliseconds(value) {
  if (value === undefined || value === null) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

// Classificação half-open: a amostra pertence ao intervalo com
// startMs <= t < endMs. Fora de qualquer intervalo (antes do primeiro estágio,
// após o último, ou numa lacuna) vira um "intervalo de borda" com `stage: null`
// no lugar certo da ordem — o dado nunca é descartado.
function classifyByIntervals(intervals, t) {
  if (!Number.isFinite(t) || intervals.length === 0) {
    return { stage: null, reason: "no-intervals" };
  }
  for (const interval of intervals) {
    if (t < interval.startMs) {
      return {
        stage: null,
        reason: "before-first-stage",
        nextStart: interval.startMs,
      };
    }
    if (interval.endMs === null || t < interval.endMs) {
      return {
        stage: interval.stage,
        label: interval.label,
        startMs: interval.startMs,
        endMs: interval.endMs,
      };
    }
  }
  const last = intervals[intervals.length - 1];
  return { stage: null, reason: "after-last-stage", lastEnd: last.endMs };
}

export function correlateSamplesWithStageTimings({ stageTimings, samples }) {
  const intervals = stageTimingIntervals(stageTimings);
  const correlated = [];
  const outside = [];
  const list = Array.isArray(samples) ? samples : [];
  for (const sample of list) {
    if (!sample || typeof sample !== "object") continue;
    const t = Number(sample.t);
    if (!Number.isFinite(t)) continue;
    const reported =
      sample.stage === undefined || sample.stage === null
        ? null
        : String(sample.stage);
    const match = classifyByIntervals(intervals, t);
    if (match.stage === null) {
      outside.push({ sample, t, reason: match.reason });
      continue;
    }
    correlated.push({
      t,
      reportedStage: reported,
      timelineStage: match.stage,
      label: match.label,
      startMs: match.startMs,
      endMs: match.endMs,
      matches: reported === match.stage,
      resources: resourceFields(sample),
    });
  }
  correlated.sort((a, b) => a.t - b.t);
  outside.sort((a, b) => a.t - b.t);
  return { intervals, correlated, outside };
}

function resourceFields(sample) {
  const fields = {
    cpu: firstFinite(sample, ["cpu", "workerCpu"]),
    rss: firstFinite(sample, ["rss", "rssBytes"]),
    ramFree: firstFinite(sample, ["ramFree", "freeMemBytes"]),
    gpu3d: firstFinite(sample, ["gpu3d"]),
    gpuCopy: firstFinite(sample, ["gpuCopy"]),
    vcn: firstFinite(sample, ["vcn"]),
    vramUsedBytes: firstFinite(sample, ["vramUsedBytes"]),
    vramTotalBytes: firstFinite(sample, ["vramTotalBytes"]),
    vramUsedPct: firstFinite(sample, ["vramUsedPct"]),
  };
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null) out[key] = value;
  }
  return out;
}

function firstFinite(sample, keys) {
  for (const key of keys) {
    const value = sample?.[key];
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

export function stageSampleCorrelationReport({
  correlated = [],
  outside = [],
} = {}) {
  const samplesByStage = {};
  let matching = 0;
  for (const entry of correlated) {
    samplesByStage[entry.timelineStage] =
      (samplesByStage[entry.timelineStage] ?? 0) + 1;
    if (entry.matches) matching += 1;
  }
  const reasons = {};
  for (const entry of outside) {
    reasons[entry.reason] = (reasons[entry.reason] ?? 0) + 1;
  }
  return {
    sampleCount: correlated.length + outside.length,
    matched: correlated.length,
    matchingReportedStage: matching,
    mismatchedReportedStage: correlated.length - matching,
    outsideCount: outside.length,
    samplesByStage,
    outsideReasons: reasons,
  };
}

// F4.3 — Agrupa os samples correlacionados por estágio, na ordem da timeline.
// Estágios repetidos na timeline (re-executados) entram no mesmo bucket; o
// `sampleCount` deixa visível quantas amostras sustentam cada agrupamento.
export function groupSamplesByStage({ intervals, correlated } = {}) {
  const list = Array.isArray(correlated) ? correlated : [];
  const groups = [];
  for (const interval of normalizeGroupOrder(intervals)) {
    const samples = list.filter(
      (entry) => entry.timelineStage === interval.stage,
    );
    if (samples.length === 0) continue;
    groups.push({
      stage: interval.stage,
      label: interval.label,
      startMs: interval.startMs,
      endMs: interval.endMs,
      durationMs: interval.durationMs,
      sampleCount: samples.length,
      samples,
    });
  }
  return groups;
}

function normalizeGroupOrder(intervals) {
  const list = Array.isArray(intervals) ? intervals : [];
  const byStage = new Map();
  for (const interval of list) {
    const stage = String(interval?.stage ?? "unknown");
    const existing = byStage.get(stage);
    if (!existing) {
      byStage.set(stage, {
        stage,
        label: interval.label ? String(interval.label) : stage,
        startMs: interval.startMs ?? null,
        endMs: interval.endMs ?? null,
        durationMs: interval.durationMs ?? null,
      });
      continue;
    }
    if (
      interval.startMs !== null &&
      (existing.startMs === null || interval.startMs < existing.startMs)
    ) {
      existing.startMs = interval.startMs;
    }
    if (
      interval.endMs !== null &&
      (existing.endMs === null || interval.endMs > existing.endMs)
    ) {
      existing.endMs = interval.endMs;
    }
  }
  return [...byStage.values()].sort(
    (a, b) => (a.startMs ?? 0) - (b.startMs ?? 0),
  );
}

// F4.4 — Agregação de recurso por estágio (média/pico/p95; RAM casa min/avg).
// Sem pesos e sem atribuição de causalidade o relatório fica factual.
export function aggregateStageResources(stageGroups) {
  const groups = Array.isArray(stageGroups) ? stageGroups : [];
  return groups.map((group) => {
    const series = (key) =>
      group.samples
        .map((entry) => entry.resources?.[key])
        .filter((value) => Number.isFinite(value));
    const cpu = series("cpu");
    const gpu3d = series("gpu3d");
    const gpuCopy = series("gpuCopy");
    const vcn = series("vcn");
    const vramUsed = series("vramUsedBytes");
    const vramPct = series("vramUsedPct");
    const rss = series("rss");
    const ramFree = series("ramFree");
    return {
      stage: group.stage,
      label: group.label,
      durationMs: group.durationMs ?? null,
      sampleCount: group.sampleCount,
      cpu: summary(cpu),
      gpu3d: summary(gpu3d),
      gpuCopy: summary(gpuCopy),
      vcn: summary(vcn),
      vramUsedBytes: summary(vramUsed),
      vramUsedPct: summary(vramPct),
      rss: { avg: avg(rss), peak: peak(rss) },
      ramFree: { min: min(ramFree), avg: avg(ramFree) },
    };
  });
}

function summary(values) {
  return { avg: avg(values), peak: peak(values), p95: p95(values) };
}

function avg(values) {
  return round(
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
  );
}

function peak(values) {
  return values.length ? round(Math.max(...values)) : 0;
}

function min(values) {
  return values.length ? round(Math.min(...values)) : 0;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
