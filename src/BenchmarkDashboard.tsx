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

type BenchmarkReport = {
  generatedAt: string;
  metrics: BenchmarkMetric[];
  runCount: number;
  returnedRunCount: number;
  latestRun: BenchmarkRun | null;
  profiles: string[];
  audioKinds: string[];
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

export default function BenchmarkDashboard() {
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [metricKey, setMetricKey] = useState(defaultMetric);
  const [profile, setProfile] = useState("all");
  const [caseId, setCaseId] = useState("");

  async function loadReport() {
    setLoading(true);
    setError("");
    try {
      setReport(await fetchJson<BenchmarkReport>("/api/dev/benchmarks"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReport();
  }, []);

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

  return (
    <main className="bench-dashboard">
      <header className="bench-hero">
        <div>
          <a className="bench-back" href="/">
            <ArrowLeft /> Sonara Hub
          </a>
          <p className="bench-kicker">Benchmarks locais</p>
          <h1>Evolução de performance</h1>
          <p>
            Histórico de render/export lido de <code>.dev/bench</code>, com o
            último run em destaque e acesso ao restante da série.
          </p>
        </div>
        <button type="button" onClick={() => void loadReport()}>
          <RefreshCcw /> Atualizar
        </button>
      </header>

      {error && (
        <div className="bench-error" role="alert">
          <TriangleAlert />
          <span>{error}</span>
        </div>
      )}

      <section className="bench-summary-grid" aria-label="Resumo do benchmark">
        <MetricCard
          icon={<Clock />}
          label="Último run"
          value={latestRun ? relativeDate(latestRun.createdAt) : "Sem dados"}
          detail={latestRun ? latestRun.profile : "Rode bench:render"}
        />
        <MetricCard
          icon={<Database />}
          label="Histórico"
          value={`${report?.returnedRunCount ?? 0}/${report?.runCount ?? 0}`}
          detail="runs carregados"
        />
        <MetricCard
          icon={<Gauge />}
          label="Total do último"
          value={formatMetric(latestRun?.summary.totalMs, "ms")}
          detail={`${latestRun?.summary.caseCount ?? 0} casos`}
        />
        <MetricCard
          icon={<Activity />}
          label="Pico RSS"
          value={formatMetric(latestRun?.summary.peakRssMb, "MB")}
          detail={`${latestRun?.summary.retryCount ?? 0} retries WebGL`}
        />
      </section>

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

      <section className="bench-panel">
        <div className="bench-panel-title">
          <Clock />
          <div>
            <strong>Histórico completo</strong>
            <span>Runs mais recentes primeiro</span>
          </div>
        </div>
        <RunHistory runs={[...visibleRuns].reverse()} />
      </section>
    </main>
  );
}

function MetricCard({
  detail,
  icon,
  label,
  value,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bench-card">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </div>
    </div>
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
    <div className="bench-bars">
      {rows.map((row) => (
        <div className="bench-bar-row" key={row.key}>
          <span>{row.label}</span>
          <div>
            <i style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} />
          </div>
          <strong>{formatMetric(row.value, "ms")}</strong>
        </div>
      ))}
      <div className="bench-case-meta">
        <span>
          {caseData.outputSize.width}x{caseData.outputSize.height}
        </span>
        <span>{caseData.qualityProfile}</span>
        <span>{formatMetric(caseData.peakRssMb, "MB")} RSS</span>
      </div>
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
            <th>RSS</th>
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

function RunHistory({ runs }: { runs: BenchmarkRun[] }) {
  if (!runs.length) return <div className="bench-empty">Sem runs.</div>;
  return (
    <div className="bench-run-list">
      {runs.map((run) => (
        <details key={run.runId}>
          <summary>
            <strong>{relativeDate(run.createdAt)}</strong>
            <span>{run.profile}</span>
            <span>{run.audioSource.kind}</span>
            <span>{formatMetric(run.summary.totalMs, "ms")}</span>
            <span className={run.warningCount ? "warn" : ""}>
              {run.warningCount} alertas
            </span>
          </summary>
          <div>
            <p>
              <code>{run.runId}</code> · {run.git.branch} {run.git.commit}
              {run.git.dirty ? " · dirty" : ""}
            </p>
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
