import {
  Activity,
  ArrowLeft,
  BarChart3,
  Clock,
  Database,
  Gauge,
  RefreshCcw,
  TriangleAlert,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchJson } from "../shared/local-api.mjs";
import { useThemePreference } from "./hooks/useThemePreference";

type BenchmarkMetric = {
  key: string;
  label: string;
  unit: string;
};

type BenchmarkCase = {
  id: string;
  outputId: string;
  sourceCaseId?: string;
  repeatIndex: number;
  rendererId: string;
  category: string;
  domain: string;
  pipeline: string;
  qualityProfile: string;
  duration: number;
  outputSize: { width: number; height: number };
  warnings: string[];
  retryWebgl: boolean;
  outputMp4: string;
  totalMs: number;
  audioProcessMs: number;
  videoRenderMs: number;
  publicationAssetMs: number;
  webmStageMs: number;
  webglPrepareMs: number;
  canvasCaptureMs: number;
  frameRenderMs: number;
  frameDelayMs: number;
  mediaRecorderMs: number;
  muxMs: number;
  validationMs: number;
  peakRssMb: number;
  mp4Bytes: number;
  jobCount: number;
  artifactBytes: number;
  webglRetryCount: number;
};

type BenchmarkRun = {
  runId: string;
  profile: string;
  testKey: string;
  testLabel: string;
  domain: string;
  pipeline: string;
  suiteKind: string;
  repeat: number;
  createdAt: string;
  git: { branch: string; commit: string; dirty: boolean };
  audioSource: { kind: string; label: string };
  warningCount: number;
  warnings: string[];
  cases: BenchmarkCase[];
  summary: {
    caseCount: number;
    totalMs: number;
    medianTotalMs: number;
    peakRssMb: number;
    retryCount: number;
    warningCount: number;
  };
};

type BenchmarkBaseline = {
  slot: "stable" | "beta" | "experimental";
  label: string;
  runId: string;
  found: boolean;
  run: BenchmarkRunReference | null;
};

type BenchmarkRunReference = Pick<
  BenchmarkRun,
  | "createdAt"
  | "domain"
  | "git"
  | "pipeline"
  | "profile"
  | "runId"
  | "suiteKind"
  | "summary"
  | "testKey"
  | "testLabel"
>;

type BenchmarkMetricDelta = {
  key: string;
  label: string;
  unit: string;
  current: number;
  reference: number;
  delta: number;
  deltaPercent: number;
  direction: "improved" | "regressed" | "stable";
};

type BenchmarkComparison = {
  mode: "baseline" | "previous";
  referenceRun: BenchmarkRunReference;
  currentRun: BenchmarkRunReference;
  summaryDeltas: BenchmarkMetricDelta[];
  caseDeltas: Array<{
    id: string;
    rendererId: string;
    metricDeltas: BenchmarkMetricDelta[];
    worstRegressionPercent: number;
  }>;
  worstRegressionPercent: number;
};

type BenchmarkScore = {
  value: number;
  reference: "baseline" | "previous" | "none";
  complete?: boolean;
  commit?: string;
  missingTests?: BenchmarkRequiredTest[];
  categories: Record<
    string,
    { label: string; value: number; weightPercent?: number }
  >;
};

type BenchmarkReleaseGate = {
  status: "pass" | "warn" | "blocked";
  reasons: string[];
};

type BenchmarkCleanupPolicy = {
  enabled: boolean;
  maxAgeDays: number;
  maxRuns: number;
  removeArtifacts: boolean;
};

type BenchmarkCleanupResult = {
  mode: string;
  removedRuns: number;
  removedRunIds: string[];
  removedArtifacts: number;
  remainingRuns: number;
};

type BenchmarkExecution = {
  id: string;
  kind: "all" | "audio" | "full" | "quick" | "workflow-e2e";
  label: string;
  status: "completed" | "failed" | "queued" | "running";
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
  currentStep: string;
  logs: string[];
};

type BenchmarkRequiredTest = {
  key: string;
  label: string;
  domain: string;
  pipeline: string;
};

type BenchmarkScoreComponent = BenchmarkRequiredTest & {
  status: "available" | "missing";
  run: BenchmarkRunReference | null;
  summary: BenchmarkRun["summary"] | null;
};

type BenchmarkScoreComposition = {
  commit: string;
  suiteId: string;
  provisionalSuiteId: string;
  dirty: boolean;
  complete: boolean;
  requiredTests: BenchmarkRequiredTest[];
  missingTests: BenchmarkRequiredTest[];
  components: BenchmarkScoreComponent[];
  provisionalRuns: BenchmarkRunReference[];
  run: BenchmarkRunReference | null;
};

type WorkflowBenchmarkStage = {
  durationMs: number;
  domain: string;
  endedAt: string;
  interrupted: boolean;
  label: string;
  pipeline: string;
  stage: string;
  startedAt: string;
};

type WorkflowBenchmarkSample = {
  jobId: string;
  kind: string;
  domain: string;
  pipeline: string;
  status: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  durationMs: number;
  attempt: number;
  retryCount: number;
  stageTimings: WorkflowBenchmarkStage[];
};

type WorkflowBenchmarkGroup = {
  domain: string;
  label: string;
  pipeline: string;
  stage?: string;
  sampleCount: number;
  totalMs: number;
  averageMs: number;
  medianMs: number;
  p95Ms: number;
  statusCounts: Record<string, number>;
};

type WorkflowBenchmarkReport = {
  enabled: boolean;
  generatedAt: string;
  sampleCount: number;
  samples: WorkflowBenchmarkSample[];
  pipelines: WorkflowBenchmarkGroup[];
  stages: WorkflowBenchmarkGroup[];
};

type BenchmarkReport = {
  generatedAt: string;
  metrics: BenchmarkMetric[];
  runCount: number;
  returnedRunCount: number;
  currentGit: { branch: string; commit: string; dirty: boolean };
  latestRun: BenchmarkRun | null;
  profiles: string[];
  audioKinds: string[];
  baselines: BenchmarkBaseline[];
  activeBaseline: string;
  latestComparison: BenchmarkComparison | null;
  baselineComparison: BenchmarkComparison | null;
  scoreComparison: BenchmarkComparison | null;
  scoreComposition: BenchmarkScoreComposition;
  score: BenchmarkScore;
  releaseGate: BenchmarkReleaseGate;
  cleanupPolicy: BenchmarkCleanupPolicy;
  workflow: WorkflowBenchmarkReport;
  runs: BenchmarkRun[];
  source: {
    missing: boolean;
    totalLines: number;
    parseErrors: Array<{ line: number; message: string }>;
  };
};

const defaultMetric = "totalMs";
const workflowPreferenceStorageKey = "sonara-benchmark-workflow-enabled";
function loadWorkflowPreference() {
  const query = new URLSearchParams(window.location.search).get("workflow");
  if (query === "1" || query === "true") return true;
  if (query === "0" || query === "false") return false;
  try {
    return window.localStorage.getItem(workflowPreferenceStorageKey) === "true";
  } catch {
    return false;
  }
}

function saveWorkflowPreference(enabled: boolean) {
  try {
    window.localStorage.setItem(workflowPreferenceStorageKey, String(enabled));
  } catch {
    // Local benchmark opt-in remains usable even when browser storage is blocked.
  }
}

function syncWorkflowPreferenceUrl(enabled: boolean) {
  const url = new URL(window.location.href);
  if (enabled) {
    url.searchParams.set("workflow", "1");
  } else {
    url.searchParams.delete("workflow");
  }
  window.history.replaceState(null, "", url);
}

const phaseMetrics = [
  "webmStageMs",
  "canvasCaptureMs",
  "frameRenderMs",
  "mediaRecorderMs",
  "muxMs",
  "validationMs",
];
const benchmarkTabs = [
  { id: "render", label: "Render" },
  { id: "metrics", label: "Métricas" },
  { id: "gate", label: "Release Gate" },
  { id: "baseline", label: "Baseline" },
  { id: "workflow", label: "Workflow" },
  { id: "retention", label: "Retenção" },
  { id: "history", label: "Histórico" },
] as const;
const benchmarkExecutionOptions: Array<{
  kind: BenchmarkExecution["kind"];
  label: string;
}> = [
  { kind: "all", label: "Score - série completa quick + full + áudio" },
  { kind: "quick", label: "Vídeo - render quick" },
  { kind: "full", label: "Vídeo - render full" },
  { kind: "audio", label: "Áudio - render com input real" },
  { kind: "workflow-e2e", label: "Workflow E2E - comparável separado" },
];
const defaultCleanupPolicy: BenchmarkCleanupPolicy = {
  enabled: false,
  maxAgeDays: 30,
  maxRuns: 100,
  removeArtifacts: true,
};
type BenchmarkTab = (typeof benchmarkTabs)[number]["id"];

export default function BenchmarkDashboard() {
  useThemePreference();
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [metricKey, setMetricKey] = useState(defaultMetric);
  const [domainFilter, setDomainFilter] = useState("all");
  const [testKeyFilter, setTestKeyFilter] = useState("all");
  const [profile, setProfile] = useState("all");
  const [caseId, setCaseId] = useState("");
  const [activeTab, setActiveTab] = useState<BenchmarkTab>("render");
  const [baselineSlot, setBaselineSlot] = useState("stable");
  const [cleanupDraft, setCleanupDraft] =
    useState<BenchmarkCleanupPolicy>(defaultCleanupPolicy);
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [baselineMessage, setBaselineMessage] = useState("");
  const [baselineSaving, setBaselineSaving] = useState(false);
  const [selectedCleanupRunId, setSelectedCleanupRunId] = useState("");
  const [executionKind, setExecutionKind] =
    useState<BenchmarkExecution["kind"]>("all");
  const [execution, setExecution] = useState<BenchmarkExecution | null>(null);
  const [executionCollapsed, setExecutionCollapsed] = useState(false);
  const [includeWorkflow, setIncludeWorkflow] = useState(
    loadWorkflowPreference,
  );

  async function loadReport() {
    setLoading(true);
    setError("");
    try {
      setReport(
        await fetchJson<BenchmarkReport>(
          `/api/dev/benchmarks?baseline=${encodeURIComponent(baselineSlot)}${includeWorkflow ? "&workflow=1" : ""}`,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReport();
  }, [baselineSlot, includeWorkflow]);

  useEffect(() => {
    saveWorkflowPreference(includeWorkflow);
    syncWorkflowPreferenceUrl(includeWorkflow);
  }, [includeWorkflow]);

  useEffect(() => {
    setCleanupDraft(report?.cleanupPolicy ?? defaultCleanupPolicy);
    setSelectedCleanupRunId(report?.latestRun?.runId ?? "");
  }, [report]);

  useEffect(() => {
    if (!execution || !["queued", "running"].includes(execution.status)) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshExecution(execution.id);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [execution]);

  async function refreshExecution(id: string) {
    try {
      const response = await fetchJson<{ execution: BenchmarkExecution }>(
        `/api/dev/benchmarks/run/${id}`,
      );
      setExecution(response.execution);
      if (["completed", "failed"].includes(response.execution.status)) {
        await loadReport();
      }
    } catch (reason) {
      setExecution((current) =>
        current
          ? {
              ...current,
              logs: [
                ...current.logs,
                reason instanceof Error ? reason.message : String(reason),
              ],
              status: "failed",
            }
          : current,
      );
    }
  }

  async function startBenchmarkExecution() {
    setExecutionCollapsed(false);
    try {
      const response = await fetchJson<{ execution: BenchmarkExecution }>(
        "/api/dev/benchmarks/run",
        {
          body: JSON.stringify({ kind: executionKind }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      setExecution(response.execution);
    } catch (reason) {
      setExecution({
        currentStep: "",
        endedAt: new Date().toISOString(),
        exitCode: 1,
        id: "local-error",
        kind: executionKind,
        label: "erro ao iniciar",
        logs: [reason instanceof Error ? reason.message : String(reason)],
        startedAt: new Date().toISOString(),
        status: "failed",
      });
    }
  }

  async function saveCleanupPolicy() {
    setCleanupMessage("");
    try {
      const response = await fetchJson<{
        cleanupPolicy: BenchmarkCleanupPolicy;
      }>("/api/dev/benchmarks/cleanup-policy", {
        body: JSON.stringify(cleanupDraft),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      setCleanupDraft(response.cleanupPolicy);
      setCleanupMessage("Política de retenção salva.");
      await loadReport();
    } catch (reason) {
      setCleanupMessage(
        reason instanceof Error ? reason.message : String(reason),
      );
    }
  }

  async function saveLatestRunAsBaseline() {
    if (!report?.latestRun) return;
    setBaselineMessage("");
    setBaselineSaving(true);
    try {
      const response = await fetchJson<{
        baseline: BenchmarkBaseline;
        baselines: BenchmarkBaseline[];
      }>("/api/dev/benchmarks/baseline", {
        body: JSON.stringify({
          runId: report.latestRun.runId,
          slot: baselineSlot,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      setBaselineMessage(
        `${response.baseline.label} agora usa ${shortId(report.latestRun.runId)}.`,
      );
      await loadReport();
    } catch (reason) {
      setBaselineMessage(
        reason instanceof Error ? reason.message : String(reason),
      );
    } finally {
      setBaselineSaving(false);
    }
  }

  async function runCleanup(mode: "all" | "policy" | "run") {
    const label =
      mode === "all"
        ? "todos os dados de benchmark"
        : mode === "run"
          ? "este run"
          : "os dados fora da política";
    if (
      !window.confirm(`Remover ${label}? Esta ação não afeta seus projetos.`)
    ) {
      return;
    }
    setCleanupMessage("");
    try {
      const response = await fetchJson<{ cleanup: BenchmarkCleanupResult }>(
        "/api/dev/benchmarks/cleanup",
        {
          body: JSON.stringify({
            mode,
            policy: cleanupDraft,
            runId: selectedCleanupRunId,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      setCleanupMessage(
        `${response.cleanup.removedRuns} run(s) removido(s), ${response.cleanup.remainingRuns} restante(s).`,
      );
      await loadReport();
    } catch (reason) {
      setCleanupMessage(
        reason instanceof Error ? reason.message : String(reason),
      );
    }
  }

  const visibleRuns = useMemo(() => {
    const runs = report?.runs ?? [];
    return runs.filter((run) => {
      const matchesProfile = profile === "all" || run.profile === profile;
      const matchesTest =
        testKeyFilter === "all" || run.testKey === testKeyFilter;
      const matchesDomain =
        domainFilter === "all" ||
        run.domain === domainFilter ||
        run.cases.some((item) => item.domain === domainFilter);
      return matchesProfile && matchesTest && matchesDomain;
    });
  }, [domainFilter, profile, report, testKeyFilter]);

  const domainOptions = useMemo(() => {
    const domains = new Set<string>();
    for (const run of report?.runs ?? []) {
      if (run.domain) domains.add(run.domain);
      for (const item of run.cases) {
        if (item.domain) domains.add(item.domain);
      }
    }
    return sortDomains([...domains]);
  }, [report]);

  const testOptions = useMemo(() => {
    const byKey = new Map<string, BenchmarkRequiredTest>();
    for (const run of report?.runs ?? []) {
      if (!run.testKey) continue;
      byKey.set(run.testKey, {
        domain: run.domain,
        key: run.testKey,
        label: run.testLabel || run.testKey,
        pipeline: run.pipeline,
      });
    }
    return [...byKey.values()].sort((first, second) =>
      `${first.domain}:${first.label}`.localeCompare(
        `${second.domain}:${second.label}`,
        "pt-BR",
      ),
    );
  }, [report]);

  const caseOptions = useMemo(() => {
    const latestByCase = new Map<string, BenchmarkCase>();
    for (const run of visibleRuns) {
      for (const item of run.cases) {
        if (domainFilter !== "all" && item.domain !== domainFilter) continue;
        latestByCase.set(item.id, item);
      }
    }
    return [...latestByCase.values()].sort(
      (first, second) => second.totalMs - first.totalMs,
    );
  }, [domainFilter, visibleRuns]);

  const selectedCaseId = caseOptions.some((item) => item.id === caseId)
    ? caseId
    : (caseOptions[0]?.id ?? "");
  const selectedMetric = report?.metrics.find(
    (item) => item.key === metricKey,
  ) ??
    report?.metrics.find((item) => item.key === defaultMetric) ?? {
      key: defaultMetric,
      label: "Tempo total",
      unit: "ms",
    };
  const series = useMemo(
    () => caseSeries(visibleRuns, selectedCaseId, selectedMetric.key),
    [selectedCaseId, selectedMetric.key, visibleRuns],
  );
  const latestRun = visibleRuns.at(-1) ?? report?.latestRun ?? null;
  const latestCase = findLatestCase(visibleRuns, selectedCaseId);
  const runTotals = visibleRuns.map((run) => run.summary.totalMs);
  const runMedians = visibleRuns.map((run) => run.summary.medianTotalMs);
  const runRss = visibleRuns.map((run) => run.summary.peakRssMb);
  const runWarnings = visibleRuns.map((run) => run.summary.warningCount);
  const baselineOptions = report?.baselines ?? [];

  return (
    <main className="bench-dashboard">
      <header className="bench-hero">
        <div>
          <a className="bench-back" href="/">
            <ArrowLeft /> Sonara Hub
          </a>
          <p className="bench-kicker">Benchmarks locais</p>
          <h1>Benchmark Center</h1>
          <p>
            Histórico local lido de <code>.dev/bench</code>, com comparação por
            commit, baseline e limpeza segura dos dados coletados.
          </p>
        </div>
        <div className="bench-hero-actions">
          <button type="button" onClick={() => void loadReport()}>
            <RefreshCcw /> Atualizar
          </button>
        </div>
      </header>

      {error && (
        <div className="bench-error" role="alert">
          <TriangleAlert />
          <span>{error}</span>
        </div>
      )}

      <nav className="bench-tabs" aria-label="Benchmark Center">
        {benchmarkTabs.map((tab) => (
          <button
            className={activeTab === tab.id ? "active" : ""}
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <BenchmarkRunner
        execution={execution}
        executionCollapsed={executionCollapsed}
        executionKind={executionKind}
        onCloseExecution={() => setExecution(null)}
        onExecutionCollapsed={setExecutionCollapsed}
        onExecutionKind={setExecutionKind}
        onStart={() => void startBenchmarkExecution()}
      />

      <section className="bench-summary-grid" aria-label="Resumo do benchmark">
        <MetricCard
          icon={<Clock />}
          label="Último run"
          value={latestRun ? relativeDate(latestRun.createdAt) : "Sem dados"}
          detail={
            latestRun
              ? latestRun.testLabel || latestRun.profile
              : "Rode bench:render"
          }
          tone="warm"
          trend={runTotals}
        />
        <MetricCard
          icon={<Database />}
          label="Histórico"
          value={`${report?.returnedRunCount ?? 0}/${report?.runCount ?? 0}`}
          detail="runs carregados"
          tone="cool"
          trend={runMedians}
        />
        <MetricCard
          icon={<Gauge />}
          label="Total do último"
          value={formatMetric(latestRun?.summary.totalMs, "ms")}
          detail={`${latestRun?.summary.caseCount ?? 0} casos`}
          tone="mixed"
          trend={runTotals}
        />
        <MetricCard
          icon={<Activity />}
          label="Pico de memória"
          value={formatMetric(latestRun?.summary.peakRssMb, "MB")}
          detail={`RSS · ${latestRun?.summary.retryCount ?? 0} retries WebGL`}
          tone="ok"
          trend={runRss.length ? runRss : runWarnings}
        />
      </section>

      {activeTab === "render" && (
        <>
          <section className="bench-panel bench-controls">
            <label>
              <span>Métrica</span>
              <select
                value={selectedMetric.key}
                onChange={(event) => setMetricKey(event.target.value)}
              >
                {(report?.metrics ?? []).map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Domínio</span>
              <select
                value={domainFilter}
                onChange={(event) => setDomainFilter(event.target.value)}
              >
                <option value="all">Todos</option>
                {domainOptions.map((domain) => (
                  <option key={domain} value={domain}>
                    {domainLabel(domain)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Teste</span>
              <select
                value={testKeyFilter}
                onChange={(event) => setTestKeyFilter(event.target.value)}
              >
                <option value="all">Todos</option>
                {sortTestOptions(testOptions).map((item) => (
                  <option key={item.key} value={item.key}>
                    {domainLabel(item.domain)} - {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Perfil</span>
              <select
                value={profile}
                onChange={(event) => setProfile(event.target.value)}
              >
                <option value="all">Todos</option>
                {(report?.profiles ?? []).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Caso</span>
              <select
                value={selectedCaseId}
                onChange={(event) => setCaseId(event.target.value)}
              >
                {caseOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="bench-panel bench-main-grid">
            <div className="bench-chart-column">
              <div className="bench-panel-title">
                <BarChart3 />
                <div>
                  <strong>{selectedMetric.label}</strong>
                  <span>
                    {selectedCaseId || "Sem caso selecionado"} · {series.length}{" "}
                    ponto{series.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <MetricChart points={series} unit={selectedMetric.unit} />
            </div>

            <aside className="bench-sample-column">
              <div className="bench-panel-title">
                <Gauge />
                <div>
                  <strong>Última amostra</strong>
                  <span>{latestCase?.rendererId || "Sem dados"}</span>
                </div>
              </div>
              <PhaseBreakdown caseData={latestCase} />
            </aside>
          </section>

          <section className="bench-panel">
            <div className="bench-panel-title">
              <Database />
              <div>
                <strong>Casos do último run</strong>
                <span>
                  {latestRun
                    ? `${latestRun.testLabel || latestRun.profile} · ${domainLabel(latestRun.domain)} · ${latestRun.audioSource.label || latestRun.audioSource.kind}`
                    : loading
                      ? "Carregando"
                      : "Sem histórico"}
                </span>
              </div>
            </div>
            <LatestCasesTable domainFilter={domainFilter} run={latestRun} />
          </section>
        </>
      )}

      {activeTab === "metrics" && (
        <>
          <section className="bench-panel bench-controls bench-metric-controls">
            <label>
              <span>Métrica</span>
              <select
                value={selectedMetric.key}
                onChange={(event) => setMetricKey(event.target.value)}
              >
                {(report?.metrics ?? []).map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Domínio</span>
              <select
                value={domainFilter}
                onChange={(event) => setDomainFilter(event.target.value)}
              >
                <option value="all">Todos</option>
                {domainOptions.map((domain) => (
                  <option key={domain} value={domain}>
                    {domainLabel(domain)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Teste</span>
              <select
                value={testKeyFilter}
                onChange={(event) => setTestKeyFilter(event.target.value)}
              >
                <option value="all">Todos</option>
                {sortTestOptions(testOptions).map((item) => (
                  <option key={item.key} value={item.key}>
                    {domainLabel(item.domain)} - {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Perfil</span>
              <select
                value={profile}
                onChange={(event) => setProfile(event.target.value)}
              >
                <option value="all">Todos</option>
                {(report?.profiles ?? []).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Caso em foco</span>
              <select
                value={selectedCaseId}
                onChange={(event) => setCaseId(event.target.value)}
              >
                {caseOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <GlobalMetricPanel
            metric={selectedMetric}
            runs={visibleRuns}
            selectedCaseId={selectedCaseId}
          />
        </>
      )}

      {activeTab === "gate" && (
        <ReleaseGatePanel
          baselineComparison={report?.baselineComparison ?? null}
          latestComparison={report?.latestComparison ?? null}
          releaseGate={report?.releaseGate ?? null}
          score={report?.score ?? null}
          scoreComparison={report?.scoreComparison ?? null}
          scoreComposition={report?.scoreComposition ?? null}
        />
      )}

      {activeTab === "baseline" && (
        <BaselinePanel
          activeBaseline={report?.activeBaseline ?? baselineSlot}
          baselineComparison={report?.baselineComparison ?? null}
          baselineMessage={baselineMessage}
          baselineOptions={baselineOptions}
          baselineSaving={baselineSaving}
          baselineSlot={baselineSlot}
          latestComparison={report?.latestComparison ?? null}
          latestRun={report?.latestRun ?? null}
          onBaselineSlot={(slot) => {
            setBaselineSlot(slot);
            setBaselineMessage("");
          }}
          onRefresh={() => void loadReport()}
          onSaveLatest={() => void saveLatestRunAsBaseline()}
        />
      )}

      {activeTab === "workflow" && (
        <WorkflowBenchmarkPanel
          includeWorkflow={includeWorkflow}
          onIncludeWorkflow={setIncludeWorkflow}
          workflow={report?.workflow ?? null}
        />
      )}

      {activeTab === "retention" && (
        <CleanupPanel
          cleanupDraft={cleanupDraft}
          cleanupMessage={cleanupMessage}
          onCleanup={(mode) => void runCleanup(mode)}
          onPolicyChange={setCleanupDraft}
          onSavePolicy={() => void saveCleanupPolicy()}
          onSelectedRun={setSelectedCleanupRunId}
          runs={[...visibleRuns].reverse()}
          selectedRunId={selectedCleanupRunId}
        />
      )}

      {activeTab === "history" && (
        <section className="bench-panel">
          <div className="bench-panel-title">
            <Clock />
            <div>
              <strong>Histórico completo</strong>
              <span>Runs mais recentes primeiro</span>
            </div>
          </div>
          <RunHistory
            comparison={report?.baselineComparison ?? report?.latestComparison}
            runs={[...visibleRuns].reverse()}
          />
        </section>
      )}

      <footer className="bench-footer">
        <div>
          <strong>
            Benchmark Center é uma ferramenta local de diagnóstico.
          </strong>
          <span>
            RSS significa Resident Set Size: o pico aproximado de memória
            residente usado pelo processo durante o benchmark, em MB.
          </span>
        </div>
        <div>
          <span>Dados privados em .dev/bench</span>
          <span>Desktop empacotado exigirá um modo diagnóstico próprio</span>
        </div>
      </footer>
    </main>
  );
}

function BenchmarkRunner({
  execution,
  executionCollapsed,
  executionKind,
  onCloseExecution,
  onExecutionCollapsed,
  onExecutionKind,
  onStart,
}: {
  execution: BenchmarkExecution | null;
  executionCollapsed: boolean;
  executionKind: BenchmarkExecution["kind"];
  onCloseExecution: () => void;
  onExecutionCollapsed: (collapsed: boolean) => void;
  onExecutionKind: (kind: BenchmarkExecution["kind"]) => void;
  onStart: () => void;
}) {
  const running = execution
    ? ["queued", "running"].includes(execution.status)
    : false;
  return (
    <section className="bench-panel bench-runner">
      <div className="bench-panel-title">
        <Activity />
        <div>
          <strong>Executar benchmarks</strong>
          <span>
            Inicia scripts locais e atualiza os dados automaticamente ao
            concluir.
          </span>
        </div>
      </div>
      <div className="bench-runner-controls">
        <label>
          <span>Execução</span>
          <select
            disabled={running}
            value={executionKind}
            onChange={(event) =>
              onExecutionKind(event.target.value as BenchmarkExecution["kind"])
            }
          >
            {benchmarkExecutionOptions.map((option) => (
              <option key={option.kind} value={option.kind}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button disabled={running} type="button" onClick={onStart}>
          <BarChart3 /> {running ? "Executando" : "Iniciar"}
        </button>
      </div>
      {executionKind === "workflow-e2e" && (
        <p className="bench-diagnostic-note">
          Workflow E2E é uma métrica comparável separada. Ela aparece em
          filtros, histórico e drilldown, mas não compõe a nota canônica de
          release.
        </p>
      )}
      {execution && (
        <div
          className={`bench-terminal ${executionCollapsed ? "collapsed" : ""}`}
        >
          <header>
            <div>
              <strong>{execution.label}</strong>
              <span>
                {execution.status}
                {execution.currentStep ? ` · ${execution.currentStep}` : ""}
              </span>
            </div>
            <div>
              <button
                type="button"
                onClick={() => onExecutionCollapsed(!executionCollapsed)}
              >
                {executionCollapsed ? "Mostrar log" : "Recolher log"}
              </button>
              {!running && (
                <button type="button" onClick={onCloseExecution}>
                  Fechar
                </button>
              )}
            </div>
          </header>
          {!executionCollapsed && (
            <pre>
              {execution.logs.length
                ? execution.logs.join("\n")
                : "Aguardando saída do processo..."}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}

function MetricCard({
  detail,
  icon,
  label,
  tone = "cool",
  trend,
  value,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  tone?: "cool" | "mixed" | "ok" | "warm";
  trend?: number[];
  value: string;
}) {
  return (
    <div className={`bench-card is-${tone}`}>
      <span className="bench-card-icon">{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </div>
      <Sparkline values={trend ?? []} />
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const cleanValues = values.filter((value) => Number.isFinite(value));
  if (cleanValues.length < 2) {
    return <span className="bench-card-sparkline" aria-hidden="true" />;
  }
  const width = 104;
  const height = 42;
  const padding = 5;
  const min = Math.min(...cleanValues);
  const max = Math.max(...cleanValues);
  const range = Math.max(1, max - min);
  const xStep =
    cleanValues.length > 1
      ? (width - padding * 2) / (cleanValues.length - 1)
      : 0;
  const points = cleanValues.map((value, index) => ({
    x: padding + xStep * index,
    y: height - padding - ((value - min) / range) * (height - padding * 2),
  }));
  const line = smoothPath(points);
  const area = `${padding},${height - padding} ${points
    .map((point) => `${point.x},${point.y}`)
    .join(" ")} ${width - padding},${height - padding}`;
  const latest = points.at(-1);
  return (
    <svg
      aria-hidden="true"
      className="bench-card-sparkline"
      viewBox={`0 0 ${width} ${height}`}
    >
      <polygon points={area} />
      <path d={line} />
      {latest && <circle cx={latest.x} cy={latest.y} r="3" />}
    </svg>
  );
}

function MetricChart({
  points,
  unit,
}: {
  points: Array<{ label: string; value: number; runId: string }>;
  unit: string;
}) {
  const [chartRef, measuredWidth] = useElementWidth<HTMLDivElement>();
  if (!points.length) {
    return <div className="bench-empty">Sem dados para esta seleção.</div>;
  }
  const width = Math.round(Math.max(360, measuredWidth || 920));
  const height = width < 560 ? 320 : width > 780 ? 420 : 360;
  const compact = width < 560;
  const padding = {
    bottom: compact ? 42 : 48,
    left: compact ? 76 : 72,
    right: compact ? 22 : 34,
    top: 34,
  };
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const average =
    values.reduce((total, value) => total + value, 0) /
    Math.max(1, values.length);
  const latest = points.at(-1);
  const previous = points.at(-2);
  const delta =
    latest && previous && previous.value > 0
      ? ((latest.value - previous.value) / previous.value) * 100
      : null;
  const xStep =
    points.length > 1
      ? (width - padding.left - padding.right) / (points.length - 1)
      : 0;
  const chartBottom = height - padding.bottom;
  const chartHeight = height - padding.top - padding.bottom;
  const chartY = (value: number) =>
    chartBottom - ((value - min) / range) * chartHeight;
  const coordinates = points.map((point, index) => ({
    ...point,
    x: padding.left + xStep * index,
    y: chartY(point.value),
  }));
  const trendCoordinates = movingAverageSeries(points).map((point, index) => ({
    ...point,
    x: padding.left + xStep * index,
    y: chartY(point.value),
  }));
  const line = smoothPath(coordinates);
  const trendLine = smoothPath(trendCoordinates);
  const area = `${padding.left},${chartBottom} ${coordinates
    .map((point) => `${point.x},${point.y}`)
    .join(" ")} ${width - padding.right},${chartBottom}`;
  const averageY = chartBottom - ((average - min) / range) * chartHeight;
  const averageLabelX = compact ? padding.left + 6 : width - padding.right - 4;
  const averageLabelAnchor: "end" | "start" = compact ? "start" : "end";
  const latestCoordinate = coordinates.at(-1);
  const latestLabelToLeft =
    latestCoordinate && latestCoordinate.x > width - padding.right - 118;
  const latestLabelX = latestCoordinate
    ? latestCoordinate.x + (latestLabelToLeft ? -12 : 12)
    : 0;
  const latestLabelAnchor: "end" | "start" = latestLabelToLeft
    ? "end"
    : "start";
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = max - range * ratio;
    return {
      value,
      y: padding.top + chartHeight * ratio,
    };
  });
  const averageLabelY = Math.max(padding.top + 14, averageY - 8);
  const xLabels = labelSamples(coordinates);

  return (
    <div>
      <div className="bench-chart-stats">
        <span>
          <small>Atual</small>
          <strong>{formatMetric(latest?.value, unit)}</strong>
        </span>
        <span className={delta && delta > 0 ? "is-worse" : "is-better"}>
          <small>Última variação</small>
          <strong>
            {delta == null
              ? "—"
              : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`}
          </strong>
        </span>
        <span>
          <small>Mínimo</small>
          <strong>{formatMetric(min, unit)}</strong>
        </span>
        <span>
          <small>Máximo</small>
          <strong>{formatMetric(max, unit)}</strong>
        </span>
      </div>
      <div className="bench-chart-legend">
        <span className="is-primary">Série selecionada</span>
        <span className="is-trend">Média móvel</span>
        <span className="is-average">Média geral</span>
      </div>
      <div className="bench-chart" ref={chartRef}>
        <svg
          aria-label="Série histórica"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            <linearGradient id="benchLineFill" x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--accent-cool)"
                stopOpacity="0.34"
              />
              <stop
                offset="72%"
                stopColor="var(--accent-cool)"
                stopOpacity="0.08"
              />
              <stop
                offset="100%"
                stopColor="var(--accent-cool)"
                stopOpacity="0"
              />
            </linearGradient>
            <linearGradient id="benchLineStroke" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="var(--status-ok)" />
              <stop offset="55%" stopColor="var(--accent-cool)" />
              <stop offset="100%" stopColor="var(--accent-warm)" />
            </linearGradient>
            <linearGradient id="benchStemFill" x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--accent-cool)"
                stopOpacity="0.18"
              />
              <stop
                offset="100%"
                stopColor="var(--accent-cool)"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>
          <rect className="bench-plot-bg" height={height} width={width} />
          {coordinates
            .slice(0, -1)
            .map((point, index) =>
              index % 2 === 0 ? (
                <rect
                  className="bench-chart-band"
                  height={chartHeight}
                  key={`${point.runId}-${index}`}
                  width={coordinates[index + 1].x - point.x}
                  x={point.x}
                  y={padding.top}
                />
              ) : null,
            )}
          {coordinates.map((point) => (
            <line
              className="bench-stem-line"
              key={`${point.runId}-${point.label}-stem`}
              x1={point.x}
              x2={point.x}
              y1={point.y}
              y2={chartBottom}
            />
          ))}
          {ticks.map((tick) => (
            <g key={tick.y}>
              <line
                className="bench-grid-line"
                x1={padding.left}
                x2={width - padding.right}
                y1={tick.y}
                y2={tick.y}
              />
              <text
                className="bench-axis-label"
                textAnchor="end"
                x={padding.left - 12}
                y={tick.y + 4}
              >
                {formatMetric(tick.value, unit)}
              </text>
            </g>
          ))}
          <line
            className="bench-average-line"
            x1={padding.left}
            x2={width - padding.right}
            y1={averageY}
            y2={averageY}
          />
          <text
            className="bench-average-label"
            textAnchor={averageLabelAnchor}
            x={averageLabelX}
            y={averageLabelY}
          >
            {compact ? "média" : `média · ${formatMetric(average, unit)}`}
          </text>
          <polygon className="bench-area" points={area} />
          <path className="bench-trend-line" d={trendLine} />
          <path className="bench-line" d={line} />
          {latestCoordinate && (
            <line
              className="bench-latest-guide"
              x1={latestCoordinate.x}
              x2={latestCoordinate.x}
              y1={padding.top}
              y2={chartBottom}
            />
          )}
          {coordinates.map((point, index) => (
            <g key={`${point.runId}-${point.label}`}>
              <circle
                className={
                  index === coordinates.length - 1
                    ? "bench-dot is-latest"
                    : "bench-dot"
                }
                cx={point.x}
                cy={point.y}
                r={index === coordinates.length - 1 ? 6 : 4}
              />
              <title>
                {point.label}: {formatMetric(point.value, unit)}
              </title>
            </g>
          ))}
          {latestCoordinate && (
            <g>
              <line
                className="bench-callout-line"
                x1={latestCoordinate.x}
                x2={latestLabelX}
                y1={latestCoordinate.y}
                y2={latestCoordinate.y - 18}
              />
              <text
                className="bench-callout-text"
                textAnchor={latestLabelAnchor}
                x={latestLabelX}
                y={latestCoordinate.y - 22}
              >
                atual · {formatMetric(latestCoordinate.value, unit)}
              </text>
            </g>
          )}
          {xLabels.map((point) => (
            <text
              className="bench-axis-label"
              key={`${point.runId}-${point.x}`}
              textAnchor={point.anchor}
              x={point.x}
              y={height - 14}
            >
              {point.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

function GlobalMetricPanel({
  metric,
  runs,
  selectedCaseId,
}: {
  metric: BenchmarkMetric;
  runs: BenchmarkRun[];
  selectedCaseId: string;
}) {
  const groups = globalMetricGroups(runs, metric.key);
  const hasNonZeroValue = groups.some((group) =>
    group.points.some((point) => point.value > 0),
  );
  return (
    <section className="bench-panel bench-global-metric">
      <div className="bench-panel-title">
        <BarChart3 />
        <div>
          <strong>{metric.label} por caso</strong>
          <span>
            {groups.length} caso{groups.length === 1 ? "" : "s"} · {runs.length}{" "}
            run{runs.length === 1 ? "" : "s"} filtrado
            {runs.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      {metric.key === "webglRetryCount" && !hasNonZeroValue && (
        <p className="bench-diagnostic-note">
          Nenhuma amostra filtrada registrou retry WebGL. A métrica existe para
          capturar fallback/retry quando Chromium/WebGL falha ou precisa reabrir
          o renderer; zero em todos os casos significa que esse caminho não foi
          acionado nesta janela de dados.
        </p>
      )}
      {groups.length ? (
        <div className="bench-metric-grid">
          {groups.map((group) => {
            const latest = group.points.at(-1);
            return (
              <article
                className={`bench-metric-card ${group.caseId === selectedCaseId ? "is-focused" : ""}`}
                key={group.caseId}
              >
                <header>
                  <div>
                    <strong>{group.caseId}</strong>
                    <span>
                      {domainLabel(group.domain)} · {group.rendererId}
                    </span>
                  </div>
                  <em>{formatMetric(latest?.value, metric.unit)}</em>
                </header>
                <MetricMiniChart points={group.points} unit={metric.unit} />
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bench-empty">Sem dados para esta métrica.</div>
      )}
    </section>
  );
}

function MetricMiniChart({
  points,
  unit,
}: {
  points: Array<{ label: string; value: number; runId: string }>;
  unit: string;
}) {
  if (!points.length) return <div className="bench-empty">Sem série.</div>;
  const width = 360;
  const height = 116;
  const padding = { bottom: 20, left: 16, right: 16, top: 16 };
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const xStep =
    points.length > 1
      ? (width - padding.left - padding.right) / (points.length - 1)
      : 0;
  const chartBottom = height - padding.bottom;
  const chartHeight = height - padding.top - padding.bottom;
  const coordinates = points.map((point, index) => ({
    ...point,
    x: padding.left + xStep * index,
    y: chartBottom - ((point.value - min) / range) * chartHeight,
  }));
  const line = smoothPath(coordinates);
  const latest = points.at(-1);
  return (
    <div>
      <svg
        aria-label={`Série ${latest?.label ?? ""}: ${formatMetric(latest?.value, unit)}`}
        className="bench-mini-chart"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <rect height={height} width={width} />
        <path d={line} />
        {coordinates.map((point) => (
          <circle
            cx={point.x}
            cy={point.y}
            key={`${point.runId}-${point.label}`}
            r="3"
          />
        ))}
      </svg>
      <small>
        {points.length} ponto{points.length === 1 ? "" : "s"} · mín{" "}
        {formatMetric(min, unit)} · máx {formatMetric(max, unit)}
      </small>
    </div>
  );
}

function PhaseBreakdown({ caseData }: { caseData?: BenchmarkCase | null }) {
  if (!caseData) return <div className="bench-empty">Sem amostra.</div>;
  const phaseKeys =
    caseData.pipeline === "full-workflow"
      ? ["audioProcessMs", "videoRenderMs", "publicationAssetMs"]
      : phaseMetrics;
  const rows = phaseKeys.map((key) => ({
    key,
    label: metricLabel(key),
    value: numeric(caseData[key as keyof BenchmarkCase]),
  }));
  const fileMetric = caseData.artifactBytes || caseData.mp4Bytes;
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="bench-sample-stack">
      <div className="bench-sample-kpis">
        <span>
          <small>Total</small>
          <strong>{formatMetric(caseData.totalMs, "ms")}</strong>
        </span>
        <span>
          <small>
            {caseData.pipeline === "full-workflow" ? "Artefatos" : "Arquivo"}
          </small>
          <strong>{formatMetric(fileMetric, "bytes")}</strong>
        </span>
        <span>
          <small>
            {caseData.pipeline === "full-workflow" ? "Jobs" : "Memória"}
          </small>
          <strong>
            {caseData.pipeline === "full-workflow"
              ? formatMetric(caseData.jobCount, "count")
              : formatMetric(caseData.peakRssMb, "MB")}
          </strong>
        </span>
      </div>
      <div className="bench-bars">
        {rows.map((row) => (
          <div className="bench-bar-row" key={row.key}>
            <span>{row.label}</span>
            <div>
              <i
                style={{
                  width: `${Math.max(4, (row.value / max) * 100)}%`,
                }}
              />
            </div>
            <strong>{formatMetric(row.value, "ms")}</strong>
          </div>
        ))}
      </div>
      <div className="bench-case-meta">
        <span>
          {caseData.outputSize.width}x{caseData.outputSize.height}
        </span>
        <span>{caseData.qualityProfile}</span>
        <span>{caseData.retryWebgl ? "retry WebGL" : "sem retry WebGL"}</span>
      </div>
      {caseData.warnings.length > 0 && (
        <div className="bench-sample-warning">
          <TriangleAlert />
          <span>{caseData.warnings[0]}</span>
        </div>
      )}
    </div>
  );
}

function LatestCasesTable({
  domainFilter,
  run,
}: {
  domainFilter: string;
  run?: BenchmarkRun | null;
}) {
  if (!run) return <div className="bench-empty">Sem histórico coletado.</div>;
  const cases =
    domainFilter === "all"
      ? run.cases
      : run.cases.filter((item) => item.domain === domainFilter);
  if (!cases.length) {
    return <div className="bench-empty">Sem caso neste domínio.</div>;
  }
  return (
    <div className="bench-table-wrap">
      <table className="bench-table">
        <thead>
          <tr>
            <th>Caso</th>
            <th>Domínio</th>
            <th>Total</th>
            <th>WebM</th>
            <th>Render</th>
            <th>Mux</th>
            <th>Memória</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((item) => (
            <tr key={`${item.outputId}-${item.repeatIndex}`}>
              <td>
                <strong>{item.id}</strong>
                <span>{item.rendererId}</span>
              </td>
              <td>{domainLabel(item.domain)}</td>
              <td>{formatMetric(item.totalMs, "ms")}</td>
              <td>{formatMetric(item.webmStageMs, "ms")}</td>
              <td>{formatMetric(item.frameRenderMs, "ms")}</td>
              <td>{formatMetric(item.muxMs, "ms")}</td>
              <td>{formatMetric(item.peakRssMb, "MB")}</td>
              <td>
                <span
                  className={
                    item.warnings.length ? "bench-status warn" : "bench-status"
                  }
                >
                  {item.warnings.length ? "warning" : "ok"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BaselinePanel({
  activeBaseline,
  baselineComparison,
  baselineMessage,
  baselineOptions,
  baselineSaving,
  baselineSlot,
  latestComparison,
  latestRun,
  onBaselineSlot,
  onRefresh,
  onSaveLatest,
}: {
  activeBaseline: string;
  baselineComparison?: BenchmarkComparison | null;
  baselineMessage: string;
  baselineOptions: BenchmarkBaseline[];
  baselineSaving: boolean;
  baselineSlot: string;
  latestComparison?: BenchmarkComparison | null;
  latestRun?: BenchmarkRun | null;
  onBaselineSlot: (slot: string) => void;
  onRefresh: () => void;
  onSaveLatest: () => void;
}) {
  const selectedBaseline =
    baselineOptions.find((baseline) => baseline.slot === baselineSlot) ??
    baselineOptions[0] ??
    null;
  const comparison = baselineComparison ?? null;
  const comparisonReferenceRun = comparison?.referenceRun ?? null;
  const fallbackComparison = latestComparison ?? null;
  const canCompare = Boolean(comparisonReferenceRun);
  const sameAsLatest =
    Boolean(selectedBaseline?.runId) &&
    selectedBaseline?.runId === latestRun?.runId;

  return (
    <section className="bench-panel bench-baseline-panel">
      <div className="bench-panel-title">
        <Database />
        <div>
          <strong>Baseline</strong>
          <span>
            Referência congelada para comparar runs futuros sem depender do run
            anterior.
          </span>
        </div>
      </div>

      <div className="bench-baseline-layout">
        <div className="bench-baseline-control">
          <label className="bench-baseline-slot-label">
            <span>Slot</span>
            <select
              value={baselineSlot}
              onChange={(event) => onBaselineSlot(event.target.value)}
            >
              {baselineOptions.length ? (
                baselineOptions.map((baseline) => (
                  <option key={baseline.slot} value={baseline.slot}>
                    {baseline.label} ·{" "}
                    {baseline.found ? shortId(baseline.runId) : "vazio"}
                  </option>
                ))
              ) : (
                <option value={baselineSlot}>Carregando…</option>
              )}
            </select>
          </label>
          <div className="bench-baseline-caption">
            {selectedBaseline?.found ? (
              <>
                <strong>{shortId(selectedBaseline.runId)}</strong>
                <span>
                  {selectedBaseline.run?.profile ?? ""}
                  {" · "}
                  {relativeDate(selectedBaseline.run?.createdAt ?? "")}
                </span>
              </>
            ) : (
              <>
                <strong>Sem run</strong>
                <span>Fallback: run anterior compatível</span>
              </>
            )}
          </div>
          <div className="bench-baseline-actions">
            <button
              className="bench-baseline-action"
              disabled={!latestRun || baselineSaving}
              type="button"
              onClick={onSaveLatest}
            >
              <Database />
              {baselineSaving ? "Salvando…" : "Salvar último run"}
            </button>
            <button
              className="bench-secondary-action"
              type="button"
              onClick={onRefresh}
            >
              <RefreshCcw />
            </button>
          </div>
          {baselineMessage && (
            <small className="bench-baseline-message">{baselineMessage}</small>
          )}
        </div>

        <div className="bench-baseline-status-grid">
          <BaselineStatusCard
            label="Slot"
            value={selectedBaseline?.label ?? "—"}
            detail={
              activeBaseline === baselineSlot
                ? "Ativo"
                : `Diferente do ativo (${baselineLabel(activeBaseline)})`
            }
            tone={activeBaseline === baselineSlot ? "ok" : "warn"}
          />
          <BaselineStatusCard
            label="Run"
            value={
              selectedBaseline?.found ? shortId(selectedBaseline.runId) : "—"
            }
            detail={
              selectedBaseline?.found
                ? (selectedBaseline.run?.testLabel ??
                  selectedBaseline.run?.profile ??
                  "")
                : "Nenhum run salvo neste slot"
            }
            tone={selectedBaseline?.found ? "ok" : "warn"}
          />
          <BaselineStatusCard
            label="Último run"
            value={latestRun ? shortId(latestRun.runId) : "—"}
            detail={
              latestRun
                ? (latestRun.testLabel ?? latestRun.profile ?? "")
                : "Rode um benchmark"
            }
            tone={latestRun ? "info" : "warn"}
          />
          <BaselineStatusCard
            label="Comparação"
            value={
              canCompare
                ? "Baseline"
                : sameAsLatest
                  ? "Mesmo run"
                  : fallbackComparison
                    ? "Anterior"
                    : "—"
            }
            detail={
              canCompare
                ? `Referência ${shortId(comparisonReferenceRun?.runId ?? "")}`
                : sameAsLatest
                  ? "Rode outro run para ver deltas"
                  : fallbackComparison
                    ? `Fallback ${shortId(fallbackComparison.referenceRun.runId)}`
                    : "Sem par compatível"
            }
            tone={canCompare ? "ok" : "info"}
          />
        </div>
      </div>

      <details className="bench-baseline-details">
        <summary>Como funciona a baseline</summary>
        <p>
          Baseline é um run salvo em um slot (<code>stable</code>,{" "}
          <code>beta</code> ou <code>experimental</code>). Ela serve como
          referência fixa para comparar a evolução do benchmark ao longo do
          tempo, separada do score canônico por commit.
        </p>
        <p>
          Se o slot está vazio, o dashboard volta a comparar com o run anterior
          compatível. Quando o slot aponta para um run existente, a comparação
          de baseline usa esse run como referência.
        </p>
      </details>
    </section>
  );
}

function BaselineStatusCard({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: "info" | "ok" | "warn";
  value: string;
}) {
  return (
    <div className={`bench-baseline-status-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ReleaseGatePanel({
  baselineComparison,
  latestComparison,
  releaseGate,
  score,
  scoreComparison,
  scoreComposition,
}: {
  baselineComparison?: BenchmarkComparison | null;
  latestComparison?: BenchmarkComparison | null;
  releaseGate?: BenchmarkReleaseGate | null;
  score?: BenchmarkScore | null;
  scoreComparison?: BenchmarkComparison | null;
  scoreComposition?: BenchmarkScoreComposition | null;
}) {
  const comparison =
    scoreComparison ?? baselineComparison ?? latestComparison ?? null;
  const status = releaseGate?.status ?? "warn";
  const scoreComplete = score != null && score.complete !== false;
  return (
    <section className="bench-gate-grid">
      <div className={`bench-panel bench-score-card is-${status}`}>
        <div className="bench-panel-title">
          <Gauge />
          <div>
            <strong>Sonara Render Score</strong>
            <span>
              Referência:{" "}
              {!scoreComplete
                ? "score indefinido"
                : score?.reference === "baseline"
                  ? "baseline"
                  : score?.reference === "previous"
                    ? "run anterior"
                    : "sem comparação"}
            </span>
          </div>
        </div>
        <div className="bench-score-value">
          <strong>{scoreComplete ? Math.round(score?.value ?? 0) : "—"}</strong>
          <span>/ 100</span>
        </div>
        <div className="bench-gate-status">{statusLabel(status)}</div>
        <ul className="bench-gate-reasons">
          {(releaseGate?.reasons ?? ["Sem benchmark local."]).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>

      <div className="bench-panel bench-score-breakdown">
        <div className="bench-panel-title">
          <Activity />
          <div>
            <strong>Componentes do score</strong>
            <span>{scoreWeightSummary(score?.categories)}</span>
          </div>
        </div>
        {Object.entries(score?.categories ?? {}).map(([key, category]) => (
          <ScoreRow key={key} label={category.label} value={category.value} />
        ))}
      </div>

      <ScoreCompositionPanel composition={scoreComposition} />

      <section className="bench-panel bench-gate-comparison">
        <div className="bench-panel-title">
          <BarChart3 />
          <div>
            <strong>Comparação automática</strong>
            <span>
              {comparison
                ? `${shortCommit(comparison.referenceRun.git.commit)} → ${shortCommit(comparison.currentRun.git.commit)}`
                : "Sem referência compatível"}
            </span>
          </div>
        </div>
        <ComparisonTable comparison={comparison} />
      </section>
    </section>
  );
}

function ScoreCompositionPanel({
  composition,
}: {
  composition?: BenchmarkScoreComposition | null;
}) {
  if (!composition) {
    return (
      <div className="bench-panel bench-score-composition">
        <div className="bench-empty bench-score-composition-empty">
          <strong>Composição ainda não disponível neste carregamento.</strong>
          <span>
            A API monta esta seção a partir da série `quick/full/audio` do
            commit atual. Atualize o relatório; se continuar vazio, reinicie a
            API local para garantir que o backend novo está servindo
            `scoreComposition`.
          </span>
        </div>
      </div>
    );
  }
  const provisionalByTest = latestRunsByRequiredTest(
    composition.provisionalRuns,
    composition.requiredTests,
  );
  const displayComponents = composition.components.map((component) => {
    const provisionalRun = provisionalByTest.get(component.key) ?? null;
    return {
      ...component,
      displayRun: component.run ?? provisionalRun,
      displayStatus: component.run
        ? "available"
        : provisionalRun
          ? "provisional"
          : "missing",
    };
  });
  const provisionalComplete =
    !composition.complete &&
    composition.requiredTests.every((test) => provisionalByTest.has(test.key));
  return (
    <div className="bench-panel bench-score-composition">
      <div className="bench-panel-title">
        <Database />
        <div>
          <strong>Série do commit</strong>
          <span>
            {shortCommit(composition.commit) || "sem commit"} ·{" "}
            {composition.complete
              ? "completa"
              : provisionalComplete
                ? "provisória completa"
                : "incompleta"}
            {composition.dirty ? " · dirty" : ""}
            {composition.suiteId
              ? ` · suíte ${shortId(composition.suiteId)}`
              : ""}
          </span>
        </div>
      </div>
      <div className="bench-score-components">
        {displayComponents.map((component) => (
          <div
            className={`bench-score-component is-${component.displayStatus}`}
            key={component.key}
          >
            <span>{domainLabel(component.domain)}</span>
            <strong>{component.label}</strong>
            <small>
              {component.displayRun
                ? `${relativeDate(component.displayRun.createdAt)} · ${formatMetric(component.displayRun.summary.totalMs, "ms")}${component.displayStatus === "provisional" ? " · provisório" : ""}`
                : "pendente"}
            </small>
          </div>
        ))}
      </div>
      {provisionalComplete && (
        <p className="bench-diagnostic-note">
          A suíte completa existe para este commit, mas foi rodada com worktree
          dirty. Ela fica visível como composição provisória; a nota final só
          será definida depois de commit limpo e nova série completa.
        </p>
      )}
      {!composition.complete && !provisionalComplete && (
        <p className="bench-diagnostic-note">
          Para gerar nota final comparável, rode a execução{" "}
          <strong>Score - série completa quick + full + áudio</strong>. Faltam:{" "}
          {composition.missingTests.map((test) => test.label).join(", ")}.
        </p>
      )}
      {composition.provisionalRuns.length > 0 && (
        <div className="bench-provisional-list">
          <strong>Parciais dirty</strong>
          <span>
            {composition.provisionalRuns
              .map((run) => `${run.testLabel} ${relativeDate(run.createdAt)}`)
              .join(" · ")}
          </span>
        </div>
      )}
    </div>
  );
}

function latestRunsByRequiredTest(
  runs: BenchmarkRunReference[],
  requiredTests: BenchmarkRequiredTest[],
) {
  const requiredKeys = new Set(requiredTests.map((test) => test.key));
  const byTest = new Map<string, BenchmarkRunReference>();
  for (const run of runs) {
    if (requiredKeys.has(run.testKey)) byTest.set(run.testKey, run);
  }
  return byTest;
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="bench-score-row">
      <span>{label}</span>
      <div>
        <i style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </div>
      <strong>{Math.round(value)}</strong>
    </div>
  );
}

function scoreWeightSummary(categories?: BenchmarkScore["categories"]) {
  const fallbackWeights: Record<string, number> = {
    performance: 50,
    memory: 15,
    export: 25,
    stability: 10,
  };
  const labels: Record<string, string> = {
    performance: "render",
    memory: "memória",
    export: "exportação",
    stability: "confiabilidade",
  };
  return `Pesos: ${Object.keys(labels)
    .map((key) => {
      const weight = categories?.[key]?.weightPercent ?? fallbackWeights[key];
      return `${labels[key]} ${weight}%`;
    })
    .join(", ")}`;
}

function ComparisonTable({
  comparison,
}: {
  comparison?: BenchmarkComparison | null;
}) {
  if (!comparison) {
    return <div className="bench-empty">Sem comparação disponível.</div>;
  }
  return (
    <div className="bench-table-wrap">
      <table className="bench-table bench-comparison-table">
        <thead>
          <tr>
            <th>Métrica</th>
            <th>Referência</th>
            <th>Atual</th>
            <th>Delta</th>
            <th>Direção</th>
          </tr>
        </thead>
        <tbody>
          {comparison.summaryDeltas.map((delta) => (
            <tr key={delta.key}>
              <td>
                <strong>{delta.label}</strong>
                <span>{delta.key}</span>
              </td>
              <td>{formatMetric(delta.reference, delta.unit)}</td>
              <td>{formatMetric(delta.current, delta.unit)}</td>
              <td>{formatPercent(delta.deltaPercent)}</td>
              <td>
                <span className={`bench-direction is-${delta.direction}`}>
                  {directionLabel(delta.direction)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkflowBenchmarkPanel({
  includeWorkflow,
  onIncludeWorkflow,
  workflow,
}: {
  includeWorkflow: boolean;
  onIncludeWorkflow: (enabled: boolean) => void;
  workflow?: WorkflowBenchmarkReport | null;
}) {
  const header = (
    <section className="bench-panel bench-workflow-optin">
      <div className="bench-panel-title">
        <Activity />
        <div>
          <strong>Workflow real</strong>
          <span>
            Amostras opt-in dos jobs reais, separadas do score canônico.
          </span>
        </div>
      </div>
      <label className="bench-workflow-toggle">
        <input
          aria-label="Workflow real"
          checked={includeWorkflow}
          type="checkbox"
          onChange={(event) => onIncludeWorkflow(event.target.checked)}
        />
        <span>Considerar workflow real nesta visão</span>
      </label>
      <p>
        Quando ativo, o relatório agrega `stageTimings` dos jobs locais
        concluídos por domínio, pipeline e etapa. Esses dados ajudam a enxergar
        gargalos do uso real, mas não compõem Release Gate nem score final.
      </p>
    </section>
  );

  if (!workflow?.enabled) {
    return (
      <>
        {header}
        <section className="bench-panel bench-workflow-empty">
          <div className="bench-empty">
            Ative o opt-in acima para carregar amostras de workflow real.
          </div>
        </section>
      </>
    );
  }
  if (!workflow.sampleCount) {
    return (
      <>
        {header}
        <section className="bench-panel bench-workflow-empty">
          <div className="bench-empty">Sem jobs concluídos com tempos.</div>
        </section>
      </>
    );
  }
  return (
    <>
      {header}
      <section className="bench-workflow-grid">
        <div className="bench-panel">
          <div className="bench-panel-title">
            <BarChart3 />
            <div>
              <strong>Pipelines</strong>
              <span>{workflow.sampleCount} amostra(s)</span>
            </div>
          </div>
          <WorkflowGroupTable groups={workflow.pipelines} />
        </div>
        <div className="bench-panel">
          <div className="bench-panel-title">
            <Gauge />
            <div>
              <strong>Etapas</strong>
              <span>Ordenadas por tempo total</span>
            </div>
          </div>
          <WorkflowGroupTable groups={workflow.stages.slice(0, 12)} />
        </div>
        <div className="bench-panel bench-workflow-samples">
          <div className="bench-panel-title">
            <Clock />
            <div>
              <strong>Amostras recentes</strong>
              <span>{relativeDate(workflow.generatedAt)}</span>
            </div>
          </div>
          <div className="bench-run-list">
            {workflow.samples.map((sample) => (
              <details key={sample.jobId}>
                <summary>
                  <strong>{sample.title || sample.jobId}</strong>
                  <span>{domainLabel(sample.domain)}</span>
                  <span>{workflowPipelineLabel(sample.pipeline)}</span>
                  <span>{formatMetric(sample.durationMs, "ms")}</span>
                  <span>{sample.status}</span>
                </summary>
                <div>
                  <p>
                    <code>{sample.jobId}</code> ·{" "}
                    {relativeDate(sample.updatedAt)}
                  </p>
                  <div className="bench-stage-chip-list">
                    {sample.stageTimings.map((stage) => (
                      <span key={`${sample.jobId}-${stage.stage}`}>
                        {stage.label}: {formatMetric(stage.durationMs, "ms")}
                      </span>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function WorkflowGroupTable({ groups }: { groups: WorkflowBenchmarkGroup[] }) {
  if (!groups.length) {
    return <div className="bench-empty">Sem grupos.</div>;
  }
  return (
    <div className="bench-table-wrap">
      <table className="bench-table">
        <thead>
          <tr>
            <th>Grupo</th>
            <th>Domínio</th>
            <th>Amostras</th>
            <th>Total</th>
            <th>Mediana</th>
            <th>P95</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={`${group.pipeline}-${group.stage ?? "pipeline"}`}>
              <td>
                <strong>{group.label}</strong>
                <span>{group.stage ?? group.pipeline}</span>
              </td>
              <td>{domainLabel(group.domain)}</td>
              <td>{group.sampleCount}</td>
              <td>{formatMetric(group.totalMs, "ms")}</td>
              <td>{formatMetric(group.medianMs, "ms")}</td>
              <td>{formatMetric(group.p95Ms, "ms")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CleanupPanel({
  cleanupDraft,
  cleanupMessage,
  onCleanup,
  onPolicyChange,
  onSavePolicy,
  onSelectedRun,
  runs,
  selectedRunId,
}: {
  cleanupDraft: BenchmarkCleanupPolicy;
  cleanupMessage: string;
  onCleanup: (mode: "all" | "policy" | "run") => void;
  onPolicyChange: (policy: BenchmarkCleanupPolicy) => void;
  onSavePolicy: () => void;
  onSelectedRun: (runId: string) => void;
  runs: BenchmarkRun[];
  selectedRunId: string;
}) {
  return (
    <section className="bench-panel bench-cleanup-panel">
      <div className="bench-panel-title">
        <Database />
        <div>
          <strong>Retenção de dados</strong>
          <span>
            Controla somente histórico e artefatos locais em .dev/bench.
          </span>
        </div>
      </div>
      <div className="bench-retention-note">
        <strong>Limpeza segura</strong>
        <span>
          A política automática define quais runs são candidatos à remoção. Ela
          só é aplicada quando você salva e executa a limpeza por política.
        </span>
      </div>
      <div className="bench-cleanup-grid">
        <label className="bench-check-row bench-cleanup-wide">
          <input
            checked={cleanupDraft.enabled}
            type="checkbox"
            onChange={(event) =>
              onPolicyChange({
                ...cleanupDraft,
                enabled: event.target.checked,
              })
            }
          />
          <span>
            <strong>Ativar política automática</strong>
            <small>
              Usa os limites abaixo ao clicar em Aplicar política agora.
            </small>
          </span>
        </label>
        <label className="bench-cleanup-field">
          <span>Quantidade máxima de runs</span>
          <small>
            Mantém sempre os runs mais recentes, mesmo que sejam antigos.
          </small>
          <input
            min="5"
            type="number"
            value={cleanupDraft.maxRuns}
            onChange={(event) =>
              onPolicyChange({
                ...cleanupDraft,
                maxRuns: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="bench-cleanup-field">
          <span>Idade máxima do histórico</span>
          <small>Remove runs mais antigos que este limite de dias.</small>
          <div className="bench-number-unit">
            <input
              min="1"
              type="number"
              value={cleanupDraft.maxAgeDays}
              onChange={(event) =>
                onPolicyChange({
                  ...cleanupDraft,
                  maxAgeDays: Number(event.target.value),
                })
              }
            />
            <span>dias</span>
          </div>
        </label>
        <label className="bench-check-row bench-cleanup-wide">
          <input
            checked={cleanupDraft.removeArtifacts}
            type="checkbox"
            onChange={(event) =>
              onPolicyChange({
                ...cleanupDraft,
                removeArtifacts: event.target.checked,
              })
            }
          />
          <span>
            <strong>Remover artefatos junto com o histórico</strong>
            <small>
              Apaga pastas de render relacionadas aos runs removidos.
            </small>
          </span>
        </label>
        <label className="bench-run-select bench-cleanup-field">
          <span>Run específico</span>
          <small>Use para apagar um run isolado sem aplicar a política.</small>
          <select
            value={selectedRunId}
            onChange={(event) => onSelectedRun(event.target.value)}
          >
            {runs.map((run) => (
              <option key={run.runId} value={run.runId}>
                {relativeDate(run.createdAt)} · {shortCommit(run.git.commit)} ·{" "}
                {run.testLabel || run.profile}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="bench-cleanup-actions">
        <button
          className="bench-primary-action"
          type="button"
          onClick={onSavePolicy}
        >
          Salvar política
        </button>
        <button type="button" onClick={() => onCleanup("policy")}>
          Aplicar política agora
        </button>
        <button type="button" onClick={() => onCleanup("run")}>
          Excluir run selecionado
        </button>
        <button
          className="danger-action"
          type="button"
          onClick={() => onCleanup("all")}
        >
          Limpar tudo
        </button>
      </div>
      {cleanupMessage && (
        <p className="bench-cleanup-message">{cleanupMessage}</p>
      )}
    </section>
  );
}

function RunHistory({
  comparison,
  runs,
}: {
  comparison?: BenchmarkComparison | null;
  runs: BenchmarkRun[];
}) {
  if (!runs.length) return <div className="bench-empty">Sem runs.</div>;
  const deltaByRunId = new Map(
    comparison
      ? [[comparison.currentRun.runId, comparison.worstRegressionPercent]]
      : [],
  );
  return (
    <div className="bench-run-list">
      {runs.map((run) => (
        <details key={run.runId}>
          <summary>
            <strong>{relativeDate(run.createdAt)}</strong>
            <span>{run.testLabel || run.profile}</span>
            <span>{shortCommit(run.git.commit)}</span>
            <span>{formatMetric(run.summary.totalMs, "ms")}</span>
            <span>{formatMetric(run.summary.peakRssMb, "MB")}</span>
            <span className={run.warningCount ? "warn" : ""}>
              {run.warningCount} alertas
            </span>
          </summary>
          <div>
            <p>
              <code>{run.runId}</code> · {run.git.branch} {run.git.commit}
              {run.git.dirty ? " · dirty" : ""}
            </p>
            {deltaByRunId.has(run.runId) && (
              <p>
                Pior regressão comparada:{" "}
                {formatPercent(deltaByRunId.get(run.runId) ?? 0)}
              </p>
            )}
            {run.warnings.length > 0 && (
              <ul>
                {run.warnings.slice(0, 6).map((warning, index) => (
                  <li key={`${run.runId}-${index}`}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

function caseSeries(
  runs: BenchmarkRun[],
  selectedCaseId: string,
  metricKey: string,
) {
  return runs
    .map((run) => {
      const item = [...run.cases]
        .reverse()
        .find((candidate) => candidate.id === selectedCaseId);
      if (!item) return null;
      return {
        label: relativeDate(run.createdAt),
        runId: run.runId,
        value: numeric(item[metricKey as keyof BenchmarkCase]),
      };
    })
    .filter((item): item is { label: string; value: number; runId: string } =>
      Boolean(item),
    );
}

function findLatestCase(runs: BenchmarkRun[], selectedCaseId: string) {
  for (const run of [...runs].reverse()) {
    const found = [...run.cases]
      .reverse()
      .find((item) => item.id === selectedCaseId);
    if (found) return found;
  }
  return null;
}

function globalMetricGroups(runs: BenchmarkRun[], metricKey: string) {
  const byCase = new Map<
    string,
    {
      caseId: string;
      domain: string;
      rendererId: string;
      points: Array<{ label: string; value: number; runId: string }>;
    }
  >();
  for (const run of runs) {
    for (const item of run.cases) {
      if (!Object.prototype.hasOwnProperty.call(item, metricKey)) continue;
      const current = byCase.get(item.id) ?? {
        caseId: item.id,
        domain: item.domain,
        rendererId: item.rendererId,
        points: [],
      };
      current.domain = item.domain || current.domain;
      current.rendererId = item.rendererId || current.rendererId;
      current.points.push({
        label: relativeDate(run.createdAt),
        runId: run.runId,
        value: numeric(item[metricKey as keyof BenchmarkCase]),
      });
      byCase.set(item.id, current);
    }
  }
  return [...byCase.values()].sort((first, second) => {
    const domainOrder = sortDomains([first.domain, second.domain]);
    if (domainOrder[0] !== domainOrder[1]) {
      return domainOrder[0] === first.domain ? -1 : 1;
    }
    return first.caseId.localeCompare(second.caseId, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function sortDomains(domains: string[]) {
  const priority = ["video", "audio", "podcast", "asset", "workflow", "system"];
  return domains.sort((first, second) => {
    const firstIndex = priority.indexOf(first);
    const secondIndex = priority.indexOf(second);
    if (firstIndex !== secondIndex) {
      return (
        (firstIndex === -1 ? priority.length : firstIndex) -
        (secondIndex === -1 ? priority.length : secondIndex)
      );
    }
    return domainLabel(first).localeCompare(domainLabel(second), "pt-BR");
  });
}

function sortTestOptions<T extends { domain: string; label: string }>(
  options: T[],
) {
  return [...options].sort((first, second) => {
    const domainOrder = sortDomains([first.domain, second.domain]);
    if (domainOrder[0] !== domainOrder[1]) {
      return domainOrder[0] === first.domain ? -1 : 1;
    }
    return first.label.localeCompare(second.label, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function domainLabel(domain: string) {
  return (
    {
      asset: "Assets",
      audio: "Áudio",
      podcast: "Podcast",
      system: "Sistema",
      video: "Vídeo",
      workflow: "Workflow",
    }[domain] ?? domain
  );
}

function baselineLabel(slot: string) {
  return (
    {
      beta: "Baseline Beta",
      experimental: "Baseline Experimental",
      stable: "Baseline Stable",
    }[slot] ?? slot
  );
}

function workflowPipelineLabel(pipeline: string) {
  return (
    {
      "audio-processing": "Processamento de áudio",
      "full-workflow": "Workflow completo",
      "podcast-feed": "Feeds de podcast",
      "publication-assets": "Assets de publicação",
      "render-export": "Exportação de vídeo",
      workflow: "Workflow",
    }[pipeline] ?? pipeline
  );
}

function metricLabel(key: string) {
  const labels: Record<string, string> = {
    canvasCaptureMs: "Captura",
    artifactBytes: "Artefatos",
    audioProcessMs: "Áudio",
    frameRenderMs: "Render",
    jobCount: "Jobs",
    mediaRecorderMs: "Recorder",
    muxMs: "Mux",
    publicationAssetMs: "Asset publicação",
    validationMs: "Validação",
    videoRenderMs: "Vídeo",
    webmStageMs: "WebM",
  };
  return labels[key] ?? key;
}

function useElementWidth<T extends HTMLElement>() {
  const observerRef = useRef<ResizeObserver | null>(null);
  const [width, setWidth] = useState(0);

  const ref = useCallback((element: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!element) return;
    const updateWidth = () => {
      setWidth(Math.round(element.getBoundingClientRect().width));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    observerRef.current = observer;
  }, []);

  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  return [ref, width] as const;
}

function movingAverageSeries<T extends { value: number }>(points: T[]) {
  return points.map((point, index) => {
    const start = Math.max(0, index - 2);
    const window = points.slice(start, index + 1);
    const value =
      window.reduce((total, item) => total + item.value, 0) / window.length;
    return { ...point, value };
  });
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1] ?? current;
    const beforePrevious = points[index - 2] ?? previous;
    const smoothing = 0.18;
    const cp1x = previous.x + (current.x - beforePrevious.x) * smoothing;
    const cp1y = previous.y + (current.y - beforePrevious.y) * smoothing;
    const cp2x = current.x - (next.x - previous.x) * smoothing;
    const cp2y = current.y - (next.y - previous.y) * smoothing;
    commands.push(
      `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${current.x} ${current.y}`,
    );
  }
  return commands.join(" ");
}

function labelSamples<T extends { x: number; label: string; runId: string }>(
  points: T[],
): Array<T & { anchor: "end" | "middle" | "start" }> {
  type Anchor = "end" | "middle" | "start";
  if (points.length <= 2) {
    return points.map((point, index) => ({
      ...point,
      anchor: (index === 0 ? "start" : "end") satisfies Anchor,
    }));
  }
  const middle = points[Math.floor(points.length / 2)];
  return [
    { ...points[0], anchor: "start" satisfies Anchor },
    { ...middle, anchor: "middle" satisfies Anchor },
    { ...points[points.length - 1], anchor: "end" satisfies Anchor },
  ];
}

function formatMetric(value: unknown, unit: string) {
  const number = numeric(value);
  if (!Number.isFinite(number)) return "—";
  if (unit === "bytes") return `${(number / 1024 / 1024).toFixed(2)} MB`;
  if (unit === "MB") return `${number.toFixed(1)} MB`;
  if (unit === "count") return String(Math.round(number));
  return `${Math.round(number)} ms`;
}

function formatPercent(value: unknown) {
  const number = numeric(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function shortCommit(value: string) {
  return value ? value.slice(0, 8) : "sem commit";
}

function shortId(value: string) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}/u.test(value)) {
    return value.slice(0, 16).replace("T", " ");
  }
  return value ? value.slice(0, 12) : "sem run";
}

function statusLabel(status: BenchmarkReleaseGate["status"]) {
  if (status === "pass") return "PASS";
  if (status === "blocked") return "BLOCKED";
  return "WARN";
}

function directionLabel(direction: BenchmarkMetricDelta["direction"]) {
  if (direction === "improved") return "melhorou";
  if (direction === "regressed") return "regressão";
  return "estável";
}

function relativeDate(value: string) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(date);
}

function numeric(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
