import type { RenderJob } from "../types";
import { formatDurationMs, jobStageLabel } from "../jobs/BatchJobBoard";

export async function copyTextToClipboard(value: string) {
  const text = String(value || "").trim();
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function jobErrorReport(job: RenderJob) {
  return [
    `Job: ${job.id}`,
    `Tipo: ${job.kind ?? "desconhecido"}`,
    `Status: ${job.status}`,
    job.maxAttempts && job.maxAttempts > 1
      ? `Tentativa: ${job.attempt ?? 0}/${job.maxAttempts}`
      : "",
    job.stage ? `Etapa atual: ${jobStageLabel(job.stage)}` : "",
    job.stageTimings?.length
      ? `Tempos:\n${job.stageTimings
          .map(
            (item) =>
              `- ${jobStageLabel(item.stage)}: ${formatDurationMs(item.durationMs)}${item.interrupted ? " (interrompido)" : ""}`,
          )
          .join("\n")}`
      : "",
    job.retryHistory?.length
      ? `Retentativas:\n${job.retryHistory
          .map(
            (item) =>
              `- tentativa ${item.attempt}: ${item.errorCode} em ${item.stage ? jobStageLabel(item.stage) : "job"} (${item.message})`,
          )
          .join("\n")}`
      : "",
    job.errorCode ? `Código: ${job.errorCode}` : "",
    `Mensagem: ${job.message}`,
    job.errorDetail ? `Detalhe:\n${job.errorDetail}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
