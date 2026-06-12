import { Copy, Video } from "lucide-react";

import { BatchJobBoard } from "../jobs/BatchJobBoard";
import type { RenderJob } from "../types";

export function VideoExportWorkspace({
  jobs,
  outputLabel,
  queuePaused,
  selectedCount,
  onCancelAllJobs,
  onCancelJob,
  onClearTerminalJobs,
  onCopyJobError,
  onPauseQueue,
  onResumeQueue,
  onReviewVideos,
}: {
  jobs: RenderJob[];
  outputLabel: string;
  queuePaused: boolean;
  selectedCount: number;
  onCancelAllJobs: () => void;
  onCancelJob: (id: string) => void;
  onClearTerminalJobs: () => void;
  onCopyJobError: (job: RenderJob) => void;
  onPauseQueue: () => void;
  onResumeQueue: () => void;
  onReviewVideos: () => void;
}) {
  const videoJobs = jobs.filter((job) => job.kind === "video-render");
  const errorJobs = videoJobs.filter((job) => job.status === "error");
  return (
    <div className="review-stage video-export-stage">
      <header className="review-stage-header">
        <div>
          <span className="overline">Exportação de vídeos</span>
          <h1>Processamento de vídeos</h1>
          <p>
            Acompanhe renderização, mux de áudio, validação e arquivos finais em
            uma área central.
          </p>
        </div>
        <div className="stage-header-actions">
          <strong>
            {selectedCount} selecionada{selectedCount === 1 ? "" : "s"}
          </strong>
          <button type="button" onClick={onReviewVideos}>
            <Video /> Conferir vídeos
          </button>
        </div>
      </header>
      <section className="stage-surface export-overview">
        <div>
          <span className="overline">Perfil atual</span>
          <strong>{outputLabel}</strong>
          <small>
            O botão Exportar no inspetor inicia os jobs e traz você para esta
            tela.
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
              <button type="button" onClick={onReviewVideos}>
                <Video /> Continuar conferindo
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
        emptyCopy="Ao exportar, cada vídeo aparece aqui com etapa, progresso, cancelamento e links finais."
        jobs={jobs}
        kind="video-render"
        queuePaused={queuePaused}
        title="Processamento dos vídeos"
        onCancelAll={onCancelAllJobs}
        onCancelJob={onCancelJob}
        onClearTerminal={onClearTerminalJobs}
        onCopyJobError={onCopyJobError}
        onPause={onPauseQueue}
        onResume={onResumeQueue}
      />
    </div>
  );
}
