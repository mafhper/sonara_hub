import { Copy, Download, Pause, Play, Trash2, X } from "lucide-react";
import type { RenderJob } from "../types";

export function BatchJobBoard({
  jobs,
  kind = "audio-process",
  emptyCopy = "Ao processar, cada arquivo aparece aqui com etapa, progresso e controle de cancelamento.",
  title = "Processamento do lote",
  onCancelAll,
  onCancelJob,
  onClearTerminal,
  onCopyJobError,
  onPause,
  onResume,
  queuePaused,
}: {
  jobs: RenderJob[];
  kind?: NonNullable<RenderJob["kind"]>;
  emptyCopy?: string;
  title?: string;
  onCancelAll: () => void;
  onCancelJob: (id: string) => void;
  onClearTerminal: () => void;
  onCopyJobError?: (job: RenderJob) => void;
  onPause: () => void;
  onResume: () => void;
  queuePaused: boolean;
}) {
  const activeJobs = jobs.filter((job) => job.kind === kind);
  const jobCounts = {
    running: activeJobs.filter((job) => job.status === "running").length,
    waiting: activeJobs.filter((job) =>
      ["queued", "paused"].includes(job.status),
    ).length,
    done: activeJobs.filter((job) => job.status === "done").length,
    failed: activeJobs.filter((job) =>
      ["error", "canceled"].includes(job.status),
    ).length,
  };
  return (
    <section className="batch-job-board">
      <header>
        <div>
          <span className="overline">{title}</span>
          <strong>
            {activeJobs.length
              ? `${activeJobs.length} processamento${activeJobs.length === 1 ? "" : "s"} registrado${activeJobs.length === 1 ? "" : "s"}`
              : "Nenhum processamento iniciado"}
          </strong>
        </div>
        <div className="batch-job-actions">
          {jobCounts.done + jobCounts.failed > 0 && (
            <button type="button" onClick={onClearTerminal}>
              <Trash2 /> Limpar concluídos
            </button>
          )}
          <button type="button" onClick={queuePaused ? onResume : onPause}>
            {queuePaused ? <Play /> : <Pause />}
            {queuePaused ? "Retomar fila" : "Pausar fila"}
          </button>
          <button type="button" onClick={onCancelAll}>
            <X /> Cancelar todos
          </button>
        </div>
      </header>
      {activeJobs.length > 0 && (
        <div className="batch-job-summary">
          <span>
            <b>{jobCounts.running}</b> em andamento
          </span>
          <span>
            <b>{jobCounts.waiting}</b> aguardando
          </span>
          <span>
            <b>{jobCounts.done}</b> concluídos
          </span>
          <span>
            <b>{jobCounts.failed}</b> interrompidos
          </span>
        </div>
      )}
      {activeJobs.length === 0 ? (
        <p className="helper-copy">{emptyCopy}</p>
      ) : (
        <div className="batch-job-list">
          {activeJobs.map((job) => {
            const terminal = ["done", "error", "canceled"].includes(job.status);
            return (
              <div className={`batch-job-row ${job.status}`} key={job.id}>
                <div>
                  <strong>
                    {job.metadata?.title || readableJobMessage(job.message)}
                  </strong>
                  <small>
                    {jobStatusLabel(job.status)} ·{" "}
                    {readableJobMessage(job.message)}
                  </small>
                  {job.stage && job.stage !== "complete" && (
                    <small className="job-stage-line">
                      Etapa: {jobStageLabel(job.stage)}
                    </small>
                  )}
                  {job.maxAttempts && job.maxAttempts > 1 ? (
                    <small className="job-stage-line">
                      Tentativa {job.attempt ?? 0}/{job.maxAttempts}
                      {job.nextAttemptAt
                        ? ` · próxima ${formatRetryTime(job.nextAttemptAt)}`
                        : ""}
                    </small>
                  ) : null}
                  {job.stageTimings?.length ? (
                    <small className="job-stage-line">
                      Tempos: {formatJobStageTimings(job.stageTimings)}
                    </small>
                  ) : null}
                  {job.warnings?.slice(0, 2).map((warning) => (
                    <small className="job-warning-line" key={warning}>
                      Alerta: {warning}
                    </small>
                  ))}
                </div>
                <progress max={100} value={job.progress} />
                <span>{job.progress}%</span>
                {terminal ? (
                  <div className="job-terminal-actions">
                    {kind === "audio-process" && job.outputUrl && (
                      <a href={job.outputUrl} download title="Baixar MP3">
                        <Download /> MP3
                      </a>
                    )}
                    {kind === "video-render" && job.outputUrl && (
                      <a href={job.outputUrl} download title="Baixar MP4">
                        <Download /> MP4
                      </a>
                    )}
                    {kind === "publication-asset" && job.outputUrl && (
                      <a href={job.outputUrl} download title="Baixar asset">
                        <Download /> Asset
                      </a>
                    )}
                    {kind === "podcast-feed" && job.outputUrl && (
                      <a href={job.outputUrl} download title="Baixar RSS">
                        <Download /> RSS
                      </a>
                    )}
                    {job.sidecarUrl && (
                      <a href={job.sidecarUrl} download title="Baixar JSON">
                        <Download /> JSON
                      </a>
                    )}
                    {kind === "publication-asset" && job.markdownUrl && (
                      <a
                        href={job.markdownUrl}
                        download
                        title="Baixar Markdown"
                      >
                        <Download /> MD
                      </a>
                    )}
                    <span className="job-terminal-state">
                      {jobStatusLabel(job.status)}
                    </span>
                    {job.status === "error" && job.errorCode && (
                      <span className="job-error-code">
                        Código: {job.errorCode}
                      </span>
                    )}
                    {job.status === "error" && onCopyJobError && (
                      <button type="button" onClick={() => onCopyJobError(job)}>
                        <Copy /> Copiar erro
                      </button>
                    )}
                  </div>
                ) : (
                  <button type="button" onClick={() => onCancelJob(job.id)}>
                    <X /> Cancelar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function jobStatusLabel(status: RenderJob["status"]) {
  return {
    queued: "na fila",
    paused: "pausado",
    running: "processando",
    done: "concluído",
    error: "falhou",
    canceled: "cancelado",
  }[status];
}

export function jobStageLabel(stage: string) {
  return (
    {
      "asset-prepare": "preparo do asset",
      "audio-analysis": "análise de áudio",
      "audio-assets": "capas e sidecars",
      "audio-prepare": "preparo do MP3",
      "audio-tags": "metadados limpos",
      "ffmpeg-mux": "mux FFmpeg",
      manifest: "manifesto",
      "output-validation": "validação final",
      "poster-render": "poster",
      "webgl-render": "render WebGL",
    }[stage] ?? stage
  );
}

function formatJobStageTimings(
  timings: NonNullable<RenderJob["stageTimings"]>,
) {
  return timings
    .slice(-4)
    .map(
      (item) =>
        `${jobStageLabel(item.stage)} ${formatDurationMs(item.durationMs)}${item.interrupted ? " interrompido" : ""}`,
    )
    .join(" · ");
}

export function formatDurationMs(value: number) {
  const milliseconds = Math.max(0, Number(value) || 0);
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)}s`;
}

function formatRetryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "em breve";
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function readableJobMessage(message: string) {
  return message
    .replaceAll("Renderizacao", "Renderização")
    .replaceAll("concluida", "concluída")
    .replaceAll("concluido", "concluído")
    .replaceAll("Analisando audio", "Analisando áudio")
    .replaceAll("Servidor local indisponivel", "Servidor local indisponível");
}
