import { FolderOpen, Video } from "lucide-react";
import type { ScenePresetV3 } from "../../shared/visual-effects.mjs";
import type { VideoOutputConflictMode } from "../../shared/video-output-folder.mjs";
import type { RenderJob, TrackMetadata } from "../types";
import {
  FileNamePatternSection,
  type FileNamePattern,
} from "./FileNamePattern";
import { InspectorGroup, SelectField, TextField } from "./fields";
import { waveformTypeLabel } from "./VisualInspector";

// 2K/4K were removed: the headless WebGL renderer loses its context on the
// FBM-heavy shaders at those sizes. Only resolutions the pipeline renders
// reliably are offered; old sessions referencing 2k/4k fall back to 1080p.
export const outputPresets = [
  ["youtube-720p", "720p", "1280 x 720"],
  ["youtube-1080p", "1080p", "1920 x 1080"],
  ["shorts-1080x1920", "Shorts", "1080 x 1920"],
];

export function ExportInspector({
  batchCount,
  coverName,
  fileNamePattern,
  jobs,
  layerCount,
  metadata,
  outputConflictMode,
  outputFolderName,
  outputPreset,
  qualityProfile,
  scene,
  workflowMode,
  onChooseOutput,
  onClearCompleted,
  onExport,
  onFileNamePattern,
  onMetadata,
  onOutputConflictMode,
  onPreset,
  onQuality,
}: {
  batchCount: number;
  coverName?: string;
  fileNamePattern: FileNamePattern;
  jobs: RenderJob[];
  layerCount: number;
  metadata: TrackMetadata;
  outputConflictMode: VideoOutputConflictMode;
  outputFolderName: string;
  outputPreset: string;
  qualityProfile: string;
  scene: ScenePresetV3;
  workflowMode: "single" | "batch";
  onChooseOutput: () => void;
  onClearCompleted: () => void;
  onExport: () => void;
  onFileNamePattern: (next: FileNamePattern) => void;
  onMetadata: (patch: Partial<TrackMetadata>) => void;
  onOutputConflictMode: (value: string) => void;
  onPreset: (value: string) => void;
  onQuality: (value: string) => void;
}) {
  const resolution =
    outputPresets.find(([value]) => value === outputPreset) ?? outputPresets[1];
  const renderJobs = jobs.filter((job) => job.kind === "video-render");
  const activeRenderJobs = renderJobs.filter((job) =>
    ["queued", "paused", "running"].includes(job.status),
  ).length;
  return (
    <>
      <InspectorGroup title="Resumo da exportação" open>
        <dl className="export-summary">
          <div>
            <dt>{workflowMode === "batch" ? "Lote" : "Faixa"}</dt>
            <dd>
              {workflowMode === "batch"
                ? `${batchCount} ${batchCount === 1 ? "faixa selecionada" : "faixas selecionadas"}`
                : metadata.title || "Sem titulo"}
            </dd>
          </div>
          <div>
            <dt>Arte</dt>
            <dd>{coverName || "Sem capa"}</dd>
          </div>
          <div>
            <dt>Visual</dt>
            <dd>{scene.name}</dd>
          </div>
          <div>
            <dt>Waveform</dt>
            <dd>
              {scene.waveform.visible
                ? `${waveformTypeLabel(scene.waveform.type)} ativa`
                : "Desligada"}
            </dd>
          </div>
          <div>
            <dt>Camadas</dt>
            <dd>{layerCount}/3</dd>
          </div>
          <div>
            <dt>Saída</dt>
            <dd>
              {resolution[1]} · {outputFolderName}
            </dd>
          </div>
        </dl>
      </InspectorGroup>
      <InspectorGroup title="Arquivo final" open>
        <div className="inspector-subsection">
          <p className="inspector-kicker">Nome e formato</p>
          <TextField
            label="Nome do arquivo"
            value={metadata.outputFileName}
            onChange={(outputFileName) => onMetadata({ outputFileName })}
          />
          <SelectField
            label="Resolução"
            value={outputPreset}
            onChange={onPreset}
          >
            {outputPresets.map(([value, label, dimensions]) => (
              <option key={value} value={value}>
                {label} · {dimensions}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Perfil de qualidade"
            value={qualityProfile}
            onChange={onQuality}
          >
            <option value="auto">Automatico</option>
            <option value="fast">Rapido</option>
            <option value="final">Final</option>
          </SelectField>
        </div>
        <div className="inspector-subsection">
          <p className="inspector-kicker">Destino</p>
          <button
            className="upload-action"
            type="button"
            onClick={onChooseOutput}
          >
            <FolderOpen /> {outputFolderName}
          </button>
          <SelectField
            label="Se a pasta do projeto já existir"
            value={outputConflictMode}
            onChange={onOutputConflictMode}
          >
            <option value="backup">Fazer backup antes</option>
            <option value="overwrite">Sobrescrever nomes iguais</option>
            <option value="clear">Excluir conteúdo anterior</option>
          </SelectField>
          <p className="helper-copy">
            A exportação grava em uma subpasta por álbum/projeto. Vídeos ficam
            na raiz dessa subpasta; sidecars e capas vão para assets.
          </p>
          <button
            className="primary-action wide"
            disabled={workflowMode === "batch" && batchCount === 0}
            type="button"
            onClick={onExport}
          >
            <Video />{" "}
            {workflowMode === "batch" ? "Exportar lote" : "Exportar vídeo"}
          </button>
        </div>
      </InspectorGroup>
      <InspectorGroup title="Nomenclatura dos vídeos exportados" scope="series">
        <div className="inspector-subsection">
          <p className="inspector-kicker">Padrão de arquivo</p>
          <FileNamePatternSection
            extension="mp4"
            pattern={fileNamePattern}
            sampleTags={metadata}
            onChange={onFileNamePattern}
          />
        </div>
      </InspectorGroup>
    </>
  );
}
