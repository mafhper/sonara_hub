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
import { type ReactNode, useEffect, useMemo, useState } from "react";
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

      <section className="bench-main-grid">
        <section className="bench-panel bench-chart-panel">
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
        </section>

        <section className="bench-panel">
          <div className="bench-panel-title">
            <Gauge />
            <div>
              <strong>Última amostra</strong>
              <span>{latestCase?.rendererId || "Sem dados"}</span>
            </div>
          </div>
          <PhaseBreakdown caseData={latestCase} />
        </section>
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
  if (!points.length) {
    return <div className="bench-empty">Sem dados para esta seleção.</div>;
  }
  const width = 820;
  const height = 300;
  const padding = 42;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const xStep =
    points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const coordinates = points.map((point, index) => ({
    ...point,
    x: padding + xStep * index,
    y:
      height - padding - ((point.value - min) / range) * (height - padding * 2),
  }));
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`;

  return (
    <div className="bench-chart">
      <svg
        aria-label="Série histórica"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id="benchLineFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(167,191,255,0.28)" />
            <stop offset="100%" stopColor="rgba(167,191,255,0.02)" />
          </linearGradient>
        </defs>
        <line
          className="bench-axis"
          x1={padding}
          x2={width - padding}
          y1={height - padding}
          y2={height - padding}
        />
        <line
          className="bench-axis"
          x1={padding}
          x2={padding}
          y1={padding}
          y2={height - padding}
        />
        <polygon className="bench-area" points={area} />
        <polyline className="bench-line" points={line} />
        {coordinates.map((point) => (
          <g key={`${point.runId}-${point.label}`}>
            <circle className="bench-dot" cx={point.x} cy={point.y} r="4" />
            <title>
              {point.label}: {formatMetric(point.value, unit)}
            </title>
          </g>
        ))}
        <text className="bench-axis-label" x={padding} y={padding - 14}>
          {formatMetric(max, unit)}
        </text>
        <text
          className="bench-axis-label"
          x={padding}
          y={height - padding + 24}
        >
          {formatMetric(min, unit)}
        </text>
      </svg>
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
