import fs from "node:fs/promises";
import path from "node:path";

export const renderBenchmarkMetrics = [
  { key: "totalMs", label: "Tempo total", unit: "ms" },
  { key: "audioProcessMs", label: "Processamento de audio", unit: "ms" },
  { key: "videoRenderMs", label: "Render de video", unit: "ms" },
  { key: "publicationAssetMs", label: "Asset de publicacao", unit: "ms" },
  { key: "webmStageMs", label: "WebM/Chromium", unit: "ms" },
  { key: "webglPrepareMs", label: "Prepare", unit: "ms" },
  { key: "canvasCaptureMs", label: "Captura", unit: "ms" },
  { key: "frameRenderMs", label: "Render frames", unit: "ms" },
  { key: "mediaRecorderMs", label: "MediaRecorder", unit: "ms" },
  { key: "muxMs", label: "Mux FFmpeg", unit: "ms" },
  { key: "validationMs", label: "Validacao MP4", unit: "ms" },
  { key: "peakRssMb", label: "Pico de memoria (RSS)", unit: "MB" },
  { key: "mp4Bytes", label: "MP4", unit: "bytes" },
  { key: "jobCount", label: "Jobs", unit: "count" },
  { key: "artifactBytes", label: "Artefatos", unit: "bytes" },
  { key: "webglRetryCount", label: "Retries WebGL", unit: "count" },
];

export const defaultBenchmarkCleanupPolicy = {
  enabled: false,
  maxAgeDays: 30,
  maxRuns: 100,
  removeArtifacts: true,
};

const metricKeys = new Set(renderBenchmarkMetrics.map((item) => item.key));
const comparisonMetricKeys = [
  "totalMs",
  "audioProcessMs",
  "videoRenderMs",
  "publicationAssetMs",
  "webmStageMs",
  "frameRenderMs",
  "mediaRecorderMs",
  "muxMs",
  "validationMs",
  "peakRssMb",
  "jobCount",
  "artifactBytes",
  "webglRetryCount",
];
const baselineSlots = ["stable", "beta", "experimental"];
const stableDeltaPercent = 3;
export const benchmarkScoreTests = [
  {
    key: "render.quick",
    label: "Render quick",
    domain: "video",
    pipeline: "render-export",
  },
  {
    key: "render.full",
    label: "Render full",
    domain: "video",
    pipeline: "render-export",
  },
  {
    key: "render.audio",
    label: "Render com audio real",
    domain: "audio",
    pipeline: "render-export",
  },
];
const benchmarkScoreTestKeys = new Set(
  benchmarkScoreTests.map((item) => item.key),
);

export async function loadRenderBenchmarkReport(
  historyPath,
  {
    activeBaseline = "stable",
    baselinePath = "",
    cleanupPolicyPath = "",
    currentGit = null,
    limit = 250,
  } = {},
) {
  const { lines, missing } = await readHistoryLines(historyPath);
  const baselineConfig = await readJsonFile(baselinePath, {});
  const cleanupPolicy = await loadBenchmarkCleanupPolicy(cleanupPolicyPath);
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
  const baselines = summarizeBaselines(baselineConfig, runs);
  const latestRun = returnedRuns.at(-1) ?? null;
  const latestComparison = compareRuns(
    latestRun,
    findPreviousCompatibleRun(runs, latestRun),
    "previous",
  );
  const selectedBaseline =
    baselines.find((item) => item.slot === activeBaseline) ?? baselines[0];
  const baselineComparison = compareRuns(
    latestRun,
    selectedBaseline?.fullRun ?? null,
    "baseline",
  );
  const normalizedCurrentGit = normalizeCurrentGit(currentGit);
  const scoreComposition = buildScoreComposition(runs, normalizedCurrentGit);
  const currentScoreRun = scoreComposition.complete
    ? scoreComposition.fullRun
    : null;
  const previousScoreComposition = currentScoreRun
    ? findPreviousScoreComposition(runs, scoreComposition.commit)
    : null;
  const scoreComparison = currentScoreRun
    ? compareRuns(
        currentScoreRun,
        previousScoreComposition?.fullRun,
        "previous",
      )
    : (baselineComparison ?? latestComparison);
  const usesCommitScore = Boolean(normalizedCurrentGit.commit);
  const score = usesCommitScore
    ? calculatePerformanceScore(currentScoreRun, scoreComparison, {
        composition: scoreComposition,
      })
    : calculatePerformanceScore(latestRun, scoreComparison);
  const releaseGate = usesCommitScore
    ? calculateReleaseGate(currentScoreRun, score, scoreComparison, {
        composition: scoreComposition,
      })
    : calculateReleaseGate(latestRun, score, scoreComparison);

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
    currentGit: normalizedCurrentGit,
    latestRun,
    profiles: [...new Set(returnedRuns.map((run) => run.profile))].filter(
      Boolean,
    ),
    audioKinds: [
      ...new Set(returnedRuns.map((run) => run.audioSource?.kind)),
    ].filter(Boolean),
    cases,
    baselines: baselines.map(({ fullRun: _fullRun, ...item }) => item),
    activeBaseline: selectedBaseline?.slot ?? "stable",
    latestComparison,
    baselineComparison,
    scoreComparison: usesCommitScore ? scoreComparison : null,
    scoreComposition: publicScoreComposition(scoreComposition),
    score,
    releaseGate,
    cleanupPolicy,
    runs: returnedRuns,
  };
}

export async function loadBenchmarkCleanupPolicy(policyPath) {
  return normalizeCleanupPolicy(await readJsonFile(policyPath, {}));
}

export async function saveBenchmarkCleanupPolicy(policyPath, policy) {
  const normalized = normalizeCleanupPolicy(policy);
  await fs.mkdir(path.dirname(policyPath), { recursive: true });
  await fs.writeFile(policyPath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

export async function cleanupRenderBenchmarkData({
  historyPath,
  mode,
  policy = defaultBenchmarkCleanupPolicy,
  runId = "",
  runsDir = "",
}) {
  const { lines } = await readHistoryLines(historyPath);
  const entries = [];
  const parseErrors = [];
  for (const [index, line] of lines.entries()) {
    try {
      entries.push({ line, run: compactRun(JSON.parse(line)) });
    } catch (error) {
      parseErrors.push({
        line: index + 1,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let kept = entries;
  let removed = [];
  if (mode === "all") {
    kept = [];
    removed = entries;
  } else if (mode === "run") {
    const target = String(runId);
    kept = entries.filter((entry) => entry.run.runId !== target);
    removed = entries.filter((entry) => entry.run.runId === target);
  } else if (mode === "policy" || mode === "old") {
    const normalized = normalizeCleanupPolicy(policy);
    const cutoff = Date.now() - normalized.maxAgeDays * 24 * 60 * 60 * 1000;
    const newestAllowedIds = new Set(
      entries.slice(-normalized.maxRuns).map((entry) => entry.run.runId),
    );
    kept = entries.filter((entry) => {
      const createdAt = new Date(entry.run.createdAt).getTime();
      const oldByAge =
        Number.isFinite(createdAt) && createdAt > 0 && createdAt < cutoff;
      const overLimit = !newestAllowedIds.has(entry.run.runId);
      return !oldByAge && !overLimit;
    });
    removed = entries.filter(
      (entry) =>
        !kept.some((keptEntry) => keptEntry.run.runId === entry.run.runId),
    );
  } else {
    throw new Error(`Modo de limpeza desconhecido: ${mode}`);
  }

  await writeHistoryEntries(historyPath, kept);
  const removedRunIds = removed.map((entry) => entry.run.runId).filter(Boolean);
  const shouldRemoveArtifacts =
    mode === "all" || normalizeCleanupPolicy(policy).removeArtifacts;
  const removedArtifacts = shouldRemoveArtifacts
    ? await removeRunArtifacts(runsDir, removedRunIds)
    : 0;

  return {
    mode,
    removedRuns: removedRunIds.length,
    removedRunIds,
    removedArtifacts,
    remainingRuns: kept.length,
    parseErrors,
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

async function readJsonFile(filePath, fallback) {
  if (!filePath) return fallback;
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeHistoryEntries(historyPath, entries) {
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  const text = entries.length
    ? `${entries.map((entry) => entry.line).join("\n")}\n`
    : "";
  await fs.writeFile(historyPath, text);
}

async function removeRunArtifacts(runsDir, runIds) {
  if (!runsDir || !runIds.length) return 0;
  let removed = 0;
  const root = path.resolve(runsDir);
  for (const runId of runIds) {
    let entries = [];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return removed;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(`${runId}-`)) continue;
      const target = path.resolve(root, entry.name);
      if (!target.startsWith(`${root}${path.sep}`)) continue;
      try {
        await fs.rm(target, { force: true, recursive: true });
        removed += 1;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  return removed;
}

function compactRun(run) {
  const cases = Array.isArray(run.cases) ? run.cases.map(compactCase) : [];
  const testKey = normalizeBenchmarkTestKey(run);
  const definition = benchmarkScoreTests.find((item) => item.key === testKey);
  return {
    runId: String(run.runId ?? run.createdAt ?? ""),
    kind: String(run.kind ?? "render-benchmark"),
    profile: String(run.profile ?? "unknown"),
    testKey,
    testLabel: String(run.testLabel ?? definition?.label ?? testKey),
    domain: String(run.domain ?? definition?.domain ?? "video"),
    pipeline: String(run.pipeline ?? definition?.pipeline ?? "render-export"),
    suiteId: String(run.suiteId ?? ""),
    suiteKind: String(run.suiteKind ?? "individual"),
    repeat: finiteNumber(run.repeat, 1),
    createdAt: String(run.createdAt ?? ""),
    git: {
      branch: String(run.git?.branch ?? ""),
      commit: String(run.git?.commit ?? "").slice(0, 12),
      dirty: Boolean(run.git?.dirty ?? String(run.git?.status ?? "").trim()),
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
    domain: String(item.domain ?? inferCaseDomain(item.category)),
    pipeline: String(item.pipeline ?? "render-export"),
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

function normalizeBenchmarkTestKey(run) {
  const explicit = String(run.testKey ?? "").trim();
  if (explicit) return explicit;
  const profile = String(run.profile ?? "").toLowerCase();
  const audioKind = String(run.audioSource?.kind ?? "").toLowerCase();
  if (audioKind === "input") return "render.audio";
  if (profile === "full") return "render.full";
  return "render.quick";
}

function inferCaseDomain(category) {
  const value = String(category ?? "").toLowerCase();
  if (/workflow|e2e/u.test(value)) return "workflow";
  if (/audio|waveform/u.test(value)) return "audio";
  if (/asset|cover|layer/u.test(value)) return "asset";
  return "video";
}

function normalizeCurrentGit(git) {
  return {
    branch: String(git?.branch ?? ""),
    commit: String(git?.commit ?? "").slice(0, 12),
    dirty: Boolean(git?.dirty),
  };
}

function buildScoreComposition(runs, currentGit) {
  const commit = currentGit.commit || latestCleanCommit(runs);
  const latestByTest = latestCleanRunsByTest(runs, commit);
  const components = benchmarkScoreTests.map((definition) => {
    const run = latestByTest.get(definition.key) ?? null;
    return {
      ...definition,
      status: run ? "available" : "missing",
      run: run ? compactRunReference(run) : null,
      summary: run?.summary ?? null,
    };
  });
  const missingTests = components
    .filter((item) => !item.run)
    .map(({ key, label, domain, pipeline }) => ({
      key,
      label,
      domain,
      pipeline,
    }));
  const complete = Boolean(commit) && missingTests.length === 0;
  const provisionalRuns = runs
    .filter((run) => run.git.commit === commit && run.git.dirty)
    .slice(-12)
    .map(compactRunReference);
  const fullRun = complete ? composeScoreRun(commit, latestByTest) : null;

  return {
    commit,
    dirty: currentGit.dirty,
    complete,
    requiredTests: benchmarkScoreTests,
    missingTests,
    components,
    provisionalRuns,
    fullRun,
  };
}

function publicScoreComposition(composition) {
  const { fullRun, ...publicComposition } = composition;
  return {
    ...publicComposition,
    run: fullRun ? compactRunReference(fullRun) : null,
  };
}

function latestCleanCommit(runs) {
  for (const run of [...runs].reverse()) {
    if (run.git.commit && !run.git.dirty) return run.git.commit;
  }
  return "";
}

function latestCleanRunsByTest(runs, commit) {
  const latestByTest = new Map();
  if (!commit) return latestByTest;
  for (const run of runs) {
    if (
      run.git.commit !== commit ||
      run.git.dirty ||
      !benchmarkScoreTestKeys.has(run.testKey)
    ) {
      continue;
    }
    latestByTest.set(run.testKey, run);
  }
  return latestByTest;
}

function composeScoreRun(commit, latestByTest) {
  const selectedRuns = benchmarkScoreTests
    .map((definition) => latestByTest.get(definition.key))
    .filter(Boolean);
  const latestCreatedAt =
    selectedRuns
      .map((run) => run.createdAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? "";
  const firstRun = selectedRuns[0] ?? null;
  const cases = selectedRuns.flatMap((run) =>
    run.cases.map((item) => ({
      ...item,
      id: `${run.testKey}:${item.id}`,
      outputId: `${run.testKey}:${item.outputId}`,
      sourceCaseId: item.id,
      testKey: run.testKey,
      testLabel: run.testLabel,
      domain: item.domain || run.domain,
      pipeline: run.pipeline,
    })),
  );
  const warnings = selectedRuns.flatMap((run) =>
    run.warnings.map((warning) => `${run.testKey}: ${warning}`),
  );
  return {
    runId: `score:${commit}:${selectedRuns.map((run) => run.runId).join("+")}`,
    kind: "benchmark-score-suite",
    profile: "score-suite",
    testKey: "score.canonical",
    testLabel: "Score canonico",
    domain: "system",
    pipeline: "benchmark-score",
    suiteId: "",
    suiteKind: "canonical",
    repeat: 1,
    createdAt: latestCreatedAt,
    git: {
      branch: firstRun?.git.branch ?? "",
      commit,
      dirty: false,
    },
    environment: firstRun?.environment ?? {},
    audioSource: {
      kind: "mixed",
      label: "Suite canonica quick + full + audio",
    },
    warningCount: warnings.length,
    warnings,
    medians: [],
    cases,
    summary: summarizeRunCases(cases),
    componentRuns: selectedRuns.map(compactRunReference),
  };
}

function findPreviousScoreComposition(runs, currentCommit) {
  if (!currentCommit) return null;
  const seen = new Set();
  for (const run of [...runs].reverse()) {
    const commit = run.git.commit;
    if (
      !commit ||
      run.git.dirty ||
      commit === currentCommit ||
      seen.has(commit)
    ) {
      continue;
    }
    seen.add(commit);
    const composition = buildScoreComposition(runs, {
      branch: run.git.branch,
      commit,
      dirty: false,
    });
    if (composition.complete) return composition;
  }
  return null;
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

function summarizeBaselines(config, runs) {
  const byRunId = new Map(runs.map((run) => [run.runId, run]));
  return baselineSlots.map((slot) => {
    const entry = config?.[slot];
    const runId = String(
      typeof entry === "string" ? entry : (entry?.runId ?? ""),
    );
    const fullRun = byRunId.get(runId) ?? null;
    return {
      slot,
      label: baselineLabel(slot),
      runId,
      found: Boolean(fullRun),
      run: fullRun ? compactRunReference(fullRun) : null,
      fullRun,
    };
  });
}

function compareRuns(currentRun, referenceRun, mode) {
  if (!currentRun || !referenceRun || currentRun.runId === referenceRun.runId) {
    return null;
  }
  const referenceCases = new Map(
    referenceRun.cases.map((item) => [item.id, item]),
  );
  const caseDeltas = currentRun.cases
    .map((currentCase) => {
      const referenceCase = referenceCases.get(currentCase.id);
      if (!referenceCase) return null;
      const metricDeltas = comparisonMetricKeys.map((key) =>
        metricDelta(currentCase, referenceCase, key),
      );
      return {
        id: currentCase.id,
        rendererId: currentCase.rendererId,
        metricDeltas,
        worstRegressionPercent: round(
          Math.max(
            0,
            ...metricDeltas.map((item) =>
              item.direction === "regressed" ? item.deltaPercent : 0,
            ),
          ),
        ),
      };
    })
    .filter(Boolean);
  if (!caseDeltas.length) return null;
  return {
    mode,
    referenceRun: compactRunReference(referenceRun),
    currentRun: compactRunReference(currentRun),
    summaryDeltas: comparisonMetricKeys.map((key) =>
      metricDelta(
        aggregateCases(currentRun.cases, key),
        aggregateCases(referenceRun.cases, key),
        "value",
        key,
      ),
    ),
    caseDeltas,
    worstRegressionPercent: round(
      Math.max(0, ...caseDeltas.map((item) => item.worstRegressionPercent)),
    ),
  };
}

function metricDelta(current, reference, key, labelKey = key) {
  const currentValue = finiteNumber(current[key]);
  const referenceValue = finiteNumber(reference[key]);
  const delta = round(currentValue - referenceValue);
  const deltaPercent =
    referenceValue > 0 ? round((delta / referenceValue) * 100) : 0;
  return {
    key: labelKey,
    label: metricLabel(labelKey),
    unit: metricUnit(labelKey),
    current: currentValue,
    reference: referenceValue,
    delta,
    deltaPercent,
    direction: deltaDirection(deltaPercent),
  };
}

function aggregateCases(cases, key) {
  const values = cases
    .map((item) => finiteNumber(item[key], Number.NaN))
    .filter(Number.isFinite);
  const value =
    key === "peakRssMb"
      ? Math.max(0, ...values)
      : values.reduce((total, item) => total + item, 0);
  return { value: round(value) };
}

function calculatePerformanceScore(latestRun, comparison, options = {}) {
  const composition = options.composition ?? null;
  if (composition && !composition.complete) {
    return {
      value: 0,
      reference: "none",
      complete: false,
      commit: composition.commit,
      missingTests: composition.missingTests,
      categories: scoreCategories(0, 0, 0, 0),
    };
  }
  if (!latestRun) {
    return {
      value: 0,
      reference: "none",
      complete: false,
      commit: composition?.commit ?? "",
      missingTests: composition?.missingTests ?? [],
      categories: scoreCategories(0, 0, 0, 0),
    };
  }
  const performance = categoryScore(comparison, ["totalMs", "frameRenderMs"]);
  const memory = categoryScore(comparison, ["peakRssMb"]);
  const exportScore = categoryScore(comparison, [
    "mediaRecorderMs",
    "muxMs",
    "validationMs",
  ]);
  const stability = stabilityScore(latestRun, comparison);
  const value = round(
    performance * 0.4 + memory * 0.25 + exportScore * 0.2 + stability * 0.15,
  );
  return {
    value,
    reference: comparison?.mode ?? "none",
    complete: true,
    commit: composition?.commit ?? latestRun.git?.commit ?? "",
    missingTests: [],
    categories: scoreCategories(performance, memory, exportScore, stability),
  };
}

function calculateReleaseGate(latestRun, score, comparison, options = {}) {
  const composition = options.composition ?? null;
  if (composition && !composition.complete) {
    const reasons = [];
    if (composition.commit) {
      reasons.push(
        `Score final indefinido para ${composition.commit}; rode a serie completa.`,
      );
    } else {
      reasons.push("Commit atual nao identificado; score final indefinido.");
    }
    if (composition.missingTests.length) {
      reasons.push(
        `Faltam: ${composition.missingTests
          .map((item) => item.label)
          .join(", ")}.`,
      );
    }
    if (composition.provisionalRuns.length) {
      reasons.push(
        "Runs com worktree dirty foram mantidos como parciais e nao entram na nota final.",
      );
    }
    return {
      status: "warn",
      reasons,
    };
  }
  if (!latestRun) {
    return {
      status: "warn",
      reasons: ["Nenhum benchmark local encontrado."],
    };
  }
  const reasons = [];
  if (!comparison) reasons.push("Baseline insuficiente para comparacao.");
  if (score.value < 70) reasons.push(`Score abaixo de 70: ${score.value}.`);
  if (score.categories.memory.value < 70) {
    reasons.push("Regressao relevante de memoria.");
  }
  if (score.categories.performance.value < 70) {
    reasons.push("Regressao relevante de render.");
  }
  if (score.categories.stability.value < 70) {
    reasons.push("Alertas ou retries degradaram estabilidade.");
  }
  if (latestRun.summary.warningCount > 0) {
    reasons.push(`${latestRun.summary.warningCount} alerta(s) no ultimo run.`);
  }
  const status =
    score.value < 70 ||
    score.categories.memory.value < 65 ||
    score.categories.performance.value < 65
      ? "blocked"
      : reasons.length || score.value < 90
        ? "warn"
        : "pass";
  return {
    status,
    reasons: reasons.length ? reasons : ["Ultimo run dentro da baseline."],
  };
}

function categoryScore(comparison, keys) {
  if (!comparison) return 100;
  const worstRegression = Math.max(
    0,
    ...comparison.summaryDeltas
      .filter((item) => keys.includes(item.key))
      .map((item) => (item.direction === "regressed" ? item.deltaPercent : 0)),
  );
  return round(Math.max(0, 100 - Math.max(0, worstRegression - 3) * 2.4));
}

function stabilityScore(latestRun, comparison) {
  const retryDelta =
    comparison?.summaryDeltas.find((item) => item.key === "webglRetryCount")
      ?.delta ?? 0;
  return round(
    Math.max(
      0,
      100 -
        latestRun.summary.warningCount * 8 -
        Math.max(0, retryDelta) * 18 -
        latestRun.summary.retryCount * 8,
    ),
  );
}

function scoreCategories(performance, memory, exportScore, stability) {
  return {
    performance: { label: "Performance", value: round(performance) },
    memory: { label: "Memory", value: round(memory) },
    export: { label: "Exportacao", value: round(exportScore) },
    stability: { label: "Stability", value: round(stability) },
  };
}

function normalizeCleanupPolicy(policy) {
  return {
    enabled: Boolean(policy?.enabled),
    maxAgeDays: clampNumber(policy?.maxAgeDays, 1, 365, 30),
    maxRuns: clampNumber(policy?.maxRuns, 5, 1000, 100),
    removeArtifacts: policy?.removeArtifacts !== false,
  };
}

function findPreviousCompatibleRun(runs, latestRun) {
  if (!latestRun) return null;
  const latestCases = new Set(latestRun.cases.map((item) => item.id));
  return (
    [...runs]
      .reverse()
      .find(
        (run) =>
          run.runId !== latestRun.runId &&
          run.profile === latestRun.profile &&
          run.cases.some((item) => latestCases.has(item.id)),
      ) ?? null
  );
}

function compactRunReference(run) {
  return {
    runId: run.runId,
    profile: run.profile,
    testKey: run.testKey,
    testLabel: run.testLabel,
    domain: run.domain,
    pipeline: run.pipeline,
    suiteKind: run.suiteKind,
    createdAt: run.createdAt,
    git: run.git,
    summary: run.summary,
  };
}

function deltaDirection(deltaPercent) {
  if (deltaPercent > stableDeltaPercent) return "regressed";
  if (deltaPercent < -stableDeltaPercent) return "improved";
  return "stable";
}

function metricLabel(key) {
  return renderBenchmarkMetrics.find((item) => item.key === key)?.label ?? key;
}

function metricUnit(key) {
  return renderBenchmarkMetrics.find((item) => item.key === key)?.unit ?? "";
}

function baselineLabel(slot) {
  return {
    beta: "Baseline Beta",
    experimental: "Baseline Experimental",
    stable: "Baseline Stable",
  }[slot];
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

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
