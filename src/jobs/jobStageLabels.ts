/**
 * Human-readable labels for render/export job stages.
 *
 * Keep this mapping free of internal jargon (e.g. "FFmpeg", "WebGL"). It is
 * imported by UI components and by clipboard/export formatters, so changes
 * here surface in multiple places.
 */

export const STAGE_LABELS: Record<string, string> = {
  "asset-prepare": "Preparando",
  "audio-analysis": "Analisando áudio",
  "audio-assets": "Preparando arquivos",
  "audio-prepare": "Preparando áudio",
  "audio-tags": "Organizando metadados",
  complete: "Concluído",
  "ffmpeg-mux": "Codificando",
  manifest: "Finalizando",
  "output-validation": "Validando",
  "poster-render": "Renderizando imagem",
  "webgl-render": "Renderizando",
};

/**
 * `fallback` lets diagnostic contexts (clipboard error reports, stage
 * timings) keep the raw stage identifier when it is not mapped, while UI
 * display contexts keep the friendly "Processando" default.
 */
export function jobStageLabel(
  stage: string | undefined,
  fallback: string = "Processando",
): string {
  if (!stage) return "Processando";
  return STAGE_LABELS[stage] ?? fallback;
}
