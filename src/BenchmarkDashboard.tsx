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

type BenchmarkMetric = {
  key: string;
  label: string;
  unit: string;
};

type BenchmarkCase = {
  id: string;
  outputId: string;
  repeatIndex: number;
  rendererId: string;
  category: string;
  qualityProfile: string;
  duration: number;
  outputSize: { width: number; height: number };
  warnings: string[];
  retryWebgl: boolean;
  outputMp4: string;
  totalMs: number;
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
  webglRetryCount: number;
};

type BenchmarkRun = {
  runId: string;
  profile: string;
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
  "createdAt" | "git" | "profile" | "runId" | "summary"
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
  categories: Record<string, { label: string; value: number }>;
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
  kind: "all" | "audio" | "full" | "quick";
  label: string;
  status: "completed" | "failed" | "queued" | "running";
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
  currentStep: string;
  logs: string[];
};

type BenchmarkReport = {
  generatedAt: string;
  metrics: BenchmarkMetric[];
  runCount: number;
  returnedRunCount: number;
  latestRun: BenchmarkRun | null;
  profiles: string[];
  audioKinds: string[];
  baselines: BenchmarkBaseline[];
  activeBaseline: string;
  latestComparison: BenchmarkComparison | null;
  baselineComparison: BenchmarkComparison | null;
  score: BenchmarkScore;
  releaseGate: BenchmarkReleaseGate;
  cleanupPolicy: BenchmarkCleanupPolicy;
  runs: BenchmarkRun[];
  source: {
    missing: boolean;
    totalLines: number;
    parseErrors: Array<{ line: number; message: string }>;
  };
};

const defaultMetric = "totalMs";
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
  { id: "gate", label: "Release Gate" },
  { id: "history", label: "Histórico" },
] as const;
const defaultCleanupPolicy: BenchmarkCleanupPolicy = {
  enabled: false,
  maxAgeDays: 30,
  maxRuns: 100,
  removeArtifacts: true,
};
type BenchmarkTab = (typeof benchmarkTabs)[number]["id"];

export default function BenchmarkDashboard() {
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [metricKey, setMetricKey] = useState(defaultMetric);
  const [profile, setProfile] = useState("all");
  const [caseId, setCaseId] = useState("");
  const [activeTab, setActiveTab] = useState<BenchmarkTab>("render");
  const [baselineSlot, setBaselineSlot] = useState("stable");
  const [cleanupDraft, setCleanupDraft] =
    useState<BenchmarkCleanupPolicy>(defaultCleanupPolicy);
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [selectedCleanupRunId, setSelectedCleanupRunId] = useState("");
  const [executionKind, setExecutionKind] =
    useState<BenchmarkExecution["kind"]>("quick");
  const [execution, setExecution] = useState<BenchmarkExecution | null>(null);
  const [executionCollapsed, setExecutionCollapsed] = useState(false);

  async function loadReport() {
    setLoading(true);
    setError("");
    try {
      setReport(
        await fetchJson<BenchmarkReport>(
          `/api/dev/benchmarks?baseline=${encodeURIComponent(baselineSlot)}`,
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
  }, [baselineSlot]);

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
    return profile === "all"
      ? runs
      : runs.filter((run) => run.profile === profile);
  }, [profile, report]);

  const caseOptions = useMemo(() => {
    const latestByCase = new Map<string, BenchmarkCase>();
    for (const run of visibleRuns) {
      for (const item of run.cases) latestByCase.set(item.id, item);
    }
    return [...latestByCase.values()].sort(
      (first, second) => second.totalMs - first.totalMs,
    );
  }, [visibleRuns]);

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
          <label>
            <span>Baseline</span>
            <select
              value={baselineSlot}
              onChange={(event) => setBaselineSlot(event.target.value)}
            >
              {(report?.baselines ?? []).map((baseline) => (
                <option key={baseline.slot} value={baseline.slot}>
                  {baseline.label}
                  {baseline.found ? "" : " (vazia)"}
                </option>
              ))}
              {!report?.baselines?.length && (
                <option value="stable">Baseline Stable</option>
              )}
            </select>
          </label>
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
          detail={latestRun ? latestRun.profile : "Rode bench:render"}
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
                    ? `${latestRun.profile} · ${latestRun.audioSource.label || latestRun.audioSource.kind}`
                    : loading
                      ? "Carregando"
                      : "Sem histórico"}
                </span>
              </div>
            </div>
            <LatestCasesTable run={latestRun} />
          </section>
        </>
      )}

      {activeTab === "gate" && (
        <ReleaseGatePanel
          baselineComparison={report?.baselineComparison ?? null}
          latestComparison={report?.latestComparison ?? null}
          releaseGate={report?.releaseGate ?? null}
          score={report?.score ?? null}
        />
      )}

      {activeTab === "history" && (
        <>
          <section className="bench-panel">
            <div className="bench-panel-title">
              <Clock />
              <div>
                <strong>Histórico completo</strong>
                <span>Runs mais recentes primeiro</span>
              </div>
            </div>
            <RunHistory
              comparison={
                report?.baselineComparison ?? report?.latestComparison
              }
              runs={[...visibleRuns].reverse()}
            />
          </section>
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
        </>
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
            <option value="quick">Render quick</option>
            <option value="full">Render full</option>
            <option value="audio">Render com áudio da pasta input</option>
            <option value="all">Todos os benchmarks de render</option>
          </select>
        </label>
        <button disabled={running} type="button" onClick={onStart}>
          <BarChart3 /> {running ? "Executando" : "Iniciar"}
        </button>
      </div>
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

function PhaseBreakdown({ caseData }: { caseData?: BenchmarkCase | null }) {
  if (!caseData) return <div className="bench-empty">Sem amostra.</div>;
  const rows = phaseMetrics.map((key) => ({
    key,
    label: metricLabel(key),
    value: numeric(caseData[key as keyof BenchmarkCase]),
  }));
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="bench-sample-stack">
      <div className="bench-sample-kpis">
        <span>
          <small>Total</small>
          <strong>{formatMetric(caseData.totalMs, "ms")}</strong>
        </span>
        <span>
          <small>Arquivo</small>
          <strong>{formatMetric(caseData.mp4Bytes, "bytes")}</strong>
        </span>
        <span>
          <small>Memória</small>
          <strong>{formatMetric(caseData.peakRssMb, "MB")}</strong>
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

function LatestCasesTable({ run }: { run?: BenchmarkRun | null }) {
  if (!run) return <div className="bench-empty">Sem histórico coletado.</div>;
  return (
    <div className="bench-table-wrap">
      <table className="bench-table">
        <thead>
          <tr>
            <th>Caso</th>
            <th>Total</th>
            <th>WebM</th>
            <th>Render</th>
            <th>Mux</th>
            <th>Memória</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {run.cases.map((item) => (
            <tr key={`${item.outputId}-${item.repeatIndex}`}>
              <td>
                <strong>{item.id}</strong>
                <span>{item.rendererId}</span>
              </td>
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

function ReleaseGatePanel({
  baselineComparison,
  latestComparison,
  releaseGate,
  score,
}: {
  baselineComparison?: BenchmarkComparison | null;
  latestComparison?: BenchmarkComparison | null;
  releaseGate?: BenchmarkReleaseGate | null;
  score?: BenchmarkScore | null;
}) {
  const comparison = baselineComparison ?? latestComparison ?? null;
  const status = releaseGate?.status ?? "warn";
  return (
    <section className="bench-gate-grid">
      <div className={`bench-panel bench-score-card is-${status}`}>
        <div className="bench-panel-title">
          <Gauge />
          <div>
            <strong>Sonara Performance Score</strong>
            <span>
              Referência:{" "}
              {score?.reference === "baseline"
                ? "baseline"
                : score?.reference === "previous"
                  ? "run anterior"
                  : "sem comparação"}
            </span>
          </div>
        </div>
        <div className="bench-score-value">
          <strong>{Math.round(score?.value ?? 0)}</strong>
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
            <span>
              Pesos: render 40%, memória 25%, exportação 20%, estabilidade 15%
            </span>
          </div>
        </div>
        {Object.entries(score?.categories ?? {}).map(([key, category]) => (
          <ScoreRow key={key} label={category.label} value={category.value} />
        ))}
      </div>

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
          <strong>Retenção e limpeza</strong>
          <span>Remove apenas dados locais de benchmark em .dev/bench.</span>
        </div>
      </div>
      <div className="bench-cleanup-grid">
        <label className="bench-check-row">
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
          <span>Usar política automática como critério padrão</span>
        </label>
        <label>
          <span>Manter últimos runs</span>
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
        <label>
          <span>Remover após</span>
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
        </label>
        <label className="bench-check-row">
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
          <span>Remover artefatos dos runs junto com o histórico</span>
        </label>
        <label className="bench-run-select">
          <span>Run específico</span>
          <select
            value={selectedRunId}
            onChange={(event) => onSelectedRun(event.target.value)}
          >
            {runs.map((run) => (
              <option key={run.runId} value={run.runId}>
                {relativeDate(run.createdAt)} · {shortCommit(run.git.commit)} ·{" "}
                {run.profile}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="bench-cleanup-actions">
        <button type="button" onClick={onSavePolicy}>
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
            <span>{run.profile}</span>
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
                {run.warnings.slice(0, 6).map((warning) => (
                  <li key={warning}>{warning}</li>
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

function metricLabel(key: string) {
  const labels: Record<string, string> = {
    canvasCaptureMs: "Captura",
    frameRenderMs: "Render",
    mediaRecorderMs: "Recorder",
    muxMs: "Mux",
    validationMs: "Validação",
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
