import fs from "node:fs/promises";

export const renderBenchmarkMetrics = [
  { key: "totalMs", label: "Tempo total", unit: "ms" },
  { key: "webmStageMs", label: "WebM/Chromium", unit: "ms" },
  { key: "webglPrepareMs", label: "Prepare", unit: "ms" },
  { key: "canvasCaptureMs", label: "Captura", unit: "ms" },
  { key: "frameRenderMs", label: "Render frames", unit: "ms" },
  { key: "mediaRecorderMs", label: "MediaRecorder", unit: "ms" },
  { key: "muxMs", label: "Mux FFmpeg", unit: "ms" },
  { key: "validationMs", label: "Validação MP4", unit: "ms" },
  { key: "peakRssMb", label: "Pico RSS", unit: "MB" },
  { key: "mp4Bytes", label: "MP4", unit: "bytes" },
  { key: "webglRetryCount", label: "Retries WebGL", unit: "count" },
];

const metricKeys = new Set(renderBenchmarkMetrics.map((item) => item.key));

export async function loadRenderBenchmarkReport(
  historyPath,
  { limit = 250 } = {},
) {
  const { lines, missing } = await readHistoryLines(historyPath);
  const parseErrors = [];
  const runs = [];

  for (const [index, line] of lines.entries()) {
    try {
      runs.push(compactRun(JSON.parse(line)));
    } catch (error) {
      parseErrors.push({
        line: index + 1,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  runs.sort((first, second) =>
    String(first.createdAt).localeCompare(String(second.createdAt)),
  );
  const safeLimit = Number.isFinite(Number(limit))
    ? Math.max(1, Math.min(1000, Number(limit)))
    : 250;
  const returnedRuns = runs.slice(-safeLimit);
  const cases = summarizeCases(returnedRuns);

  return {
    generatedAt: new Date().toISOString(),
    source: {
      path: historyPath,
      missing,
      totalLines: lines.length,
      parseErrors,
    },
    metrics: renderBenchmarkMetrics,
    runCount: runs.length,
    returnedRunCount: returnedRuns.length,
    latestRun: returnedRuns.at(-1) ?? null,
    profiles: [...new Set(returnedRuns.map((run) => run.profile))].filter(
      Boolean,
    ),
    audioKinds: [
      ...new Set(returnedRuns.map((run) => run.audioSource?.kind)),
    ].filter(Boolean),
    cases,
    runs: returnedRuns,
  };
}

async function readHistoryLines(historyPath) {
  try {
    const text = await fs.readFile(historyPath, "utf8");
    return {
      missing: false,
      lines: text.split(/\r?\n/u).filter((line) => line.trim()),
    };
  } catch (error) {
    if (error?.code === "ENOENT") return { missing: true, lines: [] };
    throw error;
  }
}

function compactRun(run) {
  const cases = Array.isArray(run.cases) ? run.cases.map(compactCase) : [];
  return {
    runId: String(run.runId ?? run.createdAt ?? ""),
    kind: String(run.kind ?? "render-benchmark"),
    profile: String(run.profile ?? "unknown"),
    repeat: finiteNumber(run.repeat, 1),
    createdAt: String(run.createdAt ?? ""),
    git: {
      branch: String(run.git?.branch ?? ""),
      commit: String(run.git?.commit ?? "").slice(0, 12),
      dirty: Boolean(String(run.git?.status ?? "").trim()),
    },
    environment: {
      platform: String(run.environment?.platform ?? ""),
      node: String(run.environment?.node ?? ""),
      cpus: finiteNumber(run.environment?.cpus),
      totalMemoryMb: round(finiteNumber(run.environment?.totalMemoryMb)),
    },
    audioSource: {
      kind: String(run.audioSource?.kind ?? "unknown"),
      label: String(run.audioSource?.label ?? ""),
    },
    warningCount: Array.isArray(run.warnings) ? run.warnings.length : 0,
    warnings: Array.isArray(run.warnings) ? run.warnings.slice(0, 20) : [],
    medians: Array.isArray(run.medians) ? run.medians.map(compactCase) : [],
    cases,
    summary: summarizeRunCases(cases),
  };
}

function compactCase(item) {
  const compact = {
    id: String(item.id ?? ""),
    outputId: String(item.outputId ?? item.id ?? ""),
    repeatIndex: finiteNumber(item.repeatIndex, 1),
    rendererId: String(item.rendererId ?? ""),
    category: String(item.category ?? ""),
    qualityProfile: String(item.qualityProfile ?? ""),
    duration: finiteNumber(item.duration),
    outputSize: {
      width: finiteNumber(item.outputSize?.width),
      height: finiteNumber(item.outputSize?.height),
    },
    warnings: Array.isArray(item.warnings) ? item.warnings : [],
    retryWebgl: Boolean(item.retryWebgl),
    outputMp4: String(item.outputMp4 ?? ""),
  };
  for (const key of metricKeys) compact[key] = round(finiteNumber(item[key]));
  return compact;
}

function summarizeRunCases(cases) {
  return {
    caseCount: cases.length,
    totalMs: round(sum(cases, "totalMs")),
    medianTotalMs: round(median(cases, "totalMs")),
    peakRssMb: round(Math.max(0, ...cases.map((item) => item.peakRssMb ?? 0))),
    retryCount: sum(cases, "webglRetryCount"),
    warningCount: cases.reduce(
      (total, item) => total + (item.warnings?.length ?? 0),
      0,
    ),
  };
}

function summarizeCases(runs) {
  const byCase = new Map();
  for (const run of runs) {
    for (const item of run.cases) {
      const current = byCase.get(item.id) ?? {
        id: item.id,
        rendererId: item.rendererId,
        category: item.category,
        sampleCount: 0,
        latest: null,
        bestTotalMs: Number.POSITIVE_INFINITY,
        worstTotalMs: 0,
      };
      current.sampleCount += 1;
      current.latest = { ...item, runId: run.runId, createdAt: run.createdAt };
      current.bestTotalMs = Math.min(current.bestTotalMs, item.totalMs);
      current.worstTotalMs = Math.max(current.worstTotalMs, item.totalMs);
      byCase.set(item.id, current);
    }
  }
  return [...byCase.values()].map((item) => ({
    ...item,
    bestTotalMs: finiteNumber(item.bestTotalMs),
    worstTotalMs: finiteNumber(item.worstTotalMs),
  }));
}

function sum(items, key) {
  return round(
    items.reduce((total, item) => total + finiteNumber(item[key]), 0),
  );
}

function median(items, key) {
  const values = items
    .map((item) => finiteNumber(item[key], Number.NaN))
    .filter(Number.isFinite)
    .sort((first, second) => first - second);
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
