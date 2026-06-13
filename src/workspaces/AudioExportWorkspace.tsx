import { AlertTriangle, Clock3, FileAudio, ListChecks } from "lucide-react";
import type { ReactNode } from "react";

import { BatchJobBoard } from "../jobs/BatchJobBoard";
import { formatDurationMs, jobStageLabel } from "../jobs/BatchJobBoard";
import type { RenderJob } from "../types";

export function AudioExportWorkspace({
  jobs,
  queuePaused,
  selectedCount,
  treatedCount,
  onCancelAllJobs,
  onCancelJob,
  onClearTerminalJobs,
  onPauseQueue,
  onResumeQueue,
}: {
  jobs: RenderJob[];
  queuePaused: boolean;
  selectedCount: number;
  treatedCount: number;
  onCancelAllJobs: () => void;
  onCancelJob: (id: string) => void;
  onClearTerminalJobs: () => void;
  onPauseQueue: () => void;
  onResumeQueue: () => void;
}) {
  const audioJobs = jobs.filter((job) => job.kind === "audio-process");
  const summary = exportSummary(audioJobs);
  return (
    <div className="review-stage audio-export-stage">
      <header className="review-stage-header">
        <div>
          <span className="overline">Exportar Áudio</span>
          <h1>Fila de áudio tratado</h1>
          <p>
            Acompanhe processamentos de MP3, metadados, capas e sidecars sem
            voltar para o editor da biblioteca.
          </p>
        </div>
        <div className="stage-header-actions">
          <strong>
            {selectedCount} selecionada{selectedCount === 1 ? "" : "s"}
          </strong>
          <span className="status-chip">
            <FileAudio /> {treatedCount} tratada
            {treatedCount === 1 ? "" : "s"}
          </span>
        </div>
      </header>
      <section className="stage-surface export-dashboard">
        <DashboardMetric
          icon={<ListChecks />}
          label="Fila"
          value={queuePaused ? "Pausada" : "Ativa"}
          detail={`${summary.running} processando · ${summary.waiting} aguardando`}
        />
        <DashboardMetric
          icon={<FileAudio />}
          label="Pacotes"
          value={`${summary.done}/${audioJobs.length || 0}`}
          detail={`${summary.outputs} MP3 · ${summary.sidecars} JSON`}
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
          label="Interrupções"
          value={String(summary.failed)}
          detail={summary.latestError}
        />
      </section>
      <BatchJobBoard
        emptyCopy="Ao processar áudio, cada faixa aparece aqui com etapa, progresso, cancelamento e links finais."
        jobs={jobs}
        kind="audio-process"
        queuePaused={queuePaused}
        title="Processamento de áudio"
        onCancelAll={onCancelAllJobs}
        onCancelJob={onCancelJob}
        onClearTerminal={onClearTerminalJobs}
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
    done: jobs.filter((job) => job.status === "done").length,
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
    outputs: jobs.filter((job) => job.outputUrl).length,
    running: jobs.filter((job) => job.status === "running").length,
    sidecars: jobs.filter((job) => job.sidecarUrl).length,
    waiting: jobs.filter((job) => ["queued", "paused"].includes(job.status))
      .length,
  };
}
