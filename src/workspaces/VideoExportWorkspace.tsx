import {
  AlertTriangle,
  Clock3,
  Copy,
  Images,
  ListChecks,
  Video,
} from "lucide-react";
import type { ReactNode } from "react";

import { BatchJobBoard } from "../jobs/BatchJobBoard";
import { formatDurationMs, jobStageLabel } from "../jobs/BatchJobBoard";
import type { RenderJob } from "../types";

export function VideoExportWorkspace({
  jobs,
  outputLabel,
  queuePaused,
  selectedCount,
  onCancelAllJobs,
  onCancelJob,
  onClearPublicationJobs,
  onClearVideoJobs,
  onCopyJobError,
  onPauseQueue,
  onResumeQueue,
  onVisualize,
}: {
  jobs: RenderJob[];
  outputLabel: string;
  queuePaused: boolean;
  selectedCount: number;
  onCancelAllJobs: () => void;
  onCancelJob: (id: string) => void;
  onClearPublicationJobs: () => void;
  onClearVideoJobs: () => void;
  onCopyJobError: (job: RenderJob) => void;
  onPauseQueue: () => void;
  onResumeQueue: () => void;
  onVisualize: () => void;
}) {
  const exportJobs = jobs.filter(
    (job) => job.kind === "video-render" || job.kind === "publication-asset",
  );
  const videoJobs = exportJobs.filter((job) => job.kind === "video-render");
  const publicationJobs = exportJobs.filter(
    (job) => job.kind === "publication-asset",
  );
  const errorJobs = exportJobs.filter((job) => job.status === "error");
  const summary = exportSummary(exportJobs);
  return (
    <div className="review-stage video-export-stage">
      <header className="review-stage-header">
        <div>
          <span className="overline">Exportar Divulgação</span>
          <h1>Fila de exportação</h1>
          <p>
            Acompanhe vídeos, mini-clips, imagens, sidecars e diagnósticos em
            uma área central.
          </p>
        </div>
        <div className="stage-header-actions">
          <strong>
            {selectedCount} selecionada{selectedCount === 1 ? "" : "s"}
          </strong>
          <button type="button" onClick={onVisualize}>
            <Video /> Visualizar
          </button>
        </div>
      </header>
      <section className="stage-surface export-dashboard">
        <DashboardMetric
          icon={<ListChecks />}
          label="Fila"
          value={queuePaused ? "Pausada" : "Ativa"}
          detail={`${summary.running} renderizando · ${summary.waiting} aguardando`}
        />
        <DashboardMetric
          icon={<Video />}
          label="Vídeos"
          value={`${summary.videosDone}/${videoJobs.length || 0}`}
          detail={`${summary.videoOutputs} MP4 finalizado${summary.videoOutputs === 1 ? "" : "s"}`}
        />
        <DashboardMetric
          icon={<Images />}
          label="Assets"
          value={`${summary.assetsDone}/${publicationJobs.length || 0}`}
          detail={`${summary.assetOutputs} arquivo${summary.assetOutputs === 1 ? "" : "s"} de divulgação`}
        />
        <DashboardMetric
          icon={<Clock3 />}
          label="Última etapa"
          value={summary.latestStageLabel}
          detail={summary.latestStageDuration}
        />
        <DashboardMetric
          danger={summary.failed > 0}
          icon={<AlertTriangle />}
          label="Falhas"
          value={String(summary.failed)}
          detail={summary.latestError}
        />
      </section>
      <section className="stage-surface export-overview">
        <div>
          <span className="overline">Perfil atual</span>
          <strong>{outputLabel}</strong>
          <small>
            O botão Exportar no inspetor inicia os jobs e traz você para esta
            tela.
          </small>
        </div>
        <div>
          <span className="overline">Jobs</span>
          <strong>
            {videoJobs.length} vídeo{videoJobs.length === 1 ? "" : "s"} ·{" "}
            {publicationJobs.length} asset
            {publicationJobs.length === 1 ? "" : "s"}
          </strong>
          <small>
            Renderização de vídeo e assets de divulgação compartilham a fila.
          </small>
        </div>
        {errorJobs.length > 0 && (
          <div className="export-error-callout">
            <strong>
              {errorJobs.length} exportação
              {errorJobs.length === 1 ? " falhou" : " falharam"}
            </strong>
            <p>
              Copie o diagnóstico do item com erro para analisar o renderer,
              preset, resolução e mensagem original.
            </p>
            <div className="export-error-actions">
              <button type="button" onClick={onVisualize}>
                <Video /> Visualizar assets
              </button>
              <button
                type="button"
                onClick={() => onCopyJobError(errorJobs[0])}
              >
                <Copy /> Analisar erro
              </button>
            </div>
          </div>
        )}
      </section>
      <BatchJobBoard
        emptyCopy="Ao exportar vídeos, cada item aparece aqui com etapa, progresso, cancelamento e links finais."
        jobs={jobs}
        kind="video-render"
        queuePaused={queuePaused}
        title="Vídeos exportados"
        onCancelAll={onCancelAllJobs}
        onCancelJob={onCancelJob}
        onClearTerminal={onClearVideoJobs}
        onCopyJobError={onCopyJobError}
        onPause={onPauseQueue}
        onResume={onResumeQueue}
      />
      <BatchJobBoard
        emptyCopy="Ao gerar assets de divulgação, cada clip, imagem ou sidecar aparece aqui."
        jobs={jobs}
        kind="publication-asset"
        queuePaused={queuePaused}
        title="Assets de divulgação"
        onCancelAll={onCancelAllJobs}
        onCancelJob={onCancelJob}
        onClearTerminal={onClearPublicationJobs}
        onCopyJobError={onCopyJobError}
        onPause={onPauseQueue}
        onResume={onResumeQueue}
      />
    </div>
  );
}

function DashboardMetric({
  danger = false,
  detail,
  icon,
  label,
  value,
}: {
  danger?: boolean;
  detail: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className={
        danger ? "export-dashboard-metric danger" : "export-dashboard-metric"
      }
    >
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function exportSummary(jobs: RenderJob[]) {
  const latestStage = jobs
    .flatMap((job) => job.stageTimings ?? [])
    .sort((first, second) => second.endedAt.localeCompare(first.endedAt))[0];
  const latestError = jobs.find(
    (job) => job.status === "error" || job.status === "canceled",
  );
  return {
    assetOutputs: jobs.filter(
      (job) => job.kind === "publication-asset" && job.outputUrl,
    ).length,
    assetsDone: jobs.filter(
      (job) => job.kind === "publication-asset" && job.status === "done",
    ).length,
    failed: jobs.filter((job) => ["error", "canceled"].includes(job.status))
      .length,
    latestError: latestError
      ? `${latestError.errorCode ?? latestError.status} · ${latestError.message}`
      : "Sem falhas registradas",
    latestStageDuration: latestStage
      ? `${formatDurationMs(latestStage.durationMs)} · ${new Date(latestStage.endedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
      : "Sem tempos registrados",
    latestStageLabel: latestStage
      ? jobStageLabel(latestStage.stage)
      : "Sem dados",
    running: jobs.filter((job) => job.status === "running").length,
    videoOutputs: jobs.filter(
      (job) => job.kind === "video-render" && job.outputUrl,
    ).length,
    videosDone: jobs.filter(
      (job) => job.kind === "video-render" && job.status === "done",
    ).length,
    waiting: jobs.filter((job) => ["queued", "paused"].includes(job.status))
      .length,
  };
}
