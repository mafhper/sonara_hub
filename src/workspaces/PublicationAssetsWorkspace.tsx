import { BookOpen, Download, Image, Video, X } from "lucide-react";
import type { CSSProperties } from "react";

import { CanvasInteractionOverlay } from "../CanvasInteractionOverlay";
import { BatchJobBoard } from "../jobs/BatchJobBoard";
import {
  publicationAssetKindLabel,
  publicationLyricsSettingLabel,
  type PublicationAssetMode,
} from "../publication";
import type {
  MediaLayerV2,
  RenderJob,
  TextOverlaySettings,
  TrackDraft,
  TrackMetadata,
} from "../types";
import { applyPublicationTextOverride } from "../../shared/publication-assets.mjs";
import type {
  PublicationAssetPreset,
  PublicationAssetSettings,
} from "../../shared/publication-assets.mjs";
import {
  publicationAssetPresets,
  publicationBookletThemeById,
  publicationConstraintSummary,
} from "../../shared/publication-assets.mjs";
import type { ScenePresetV3 } from "../../shared/visual-effects.mjs";
import {
  CompositionLivePreview,
  CompositionThumbnail,
} from "./CompositionPreview";
import { thumbnailFingerprint } from "./video-review-helpers";

export function PublicationAssetsWorkspace({
  assetMode,
  exportCount,
  exporting,
  excludedTrackIds,
  jobs,
  lyricsPreviewText,
  preset,
  previewAudioSrc,
  previewComposition,
  previewTrack,
  queuePaused,
  selectedPresetIds,
  selectedSettings,
  tracks,
  onAllTracks,
  onCancelAllJobs,
  onCancelJob,
  onClearTerminalJobs,
  onCopyJobError,
  onExport,
  onPauseQueue,
  onPreset,
  onPresetScope,
  onResumeQueue,
  onReviewVideos,
  onStopExport,
  onTogglePreset,
  onToggleTrack,
  onAssetSettings,
  onUpdateLayer,
}: {
  assetMode: PublicationAssetMode;
  exportCount: number;
  exporting: boolean;
  excludedTrackIds: string[];
  jobs: RenderJob[];
  lyricsPreviewText: string;
  preset: PublicationAssetPreset;
  previewAudioSrc: string;
  previewComposition: {
    scene: ScenePresetV3 | null;
    textSettings: TextOverlaySettings | null;
    layers: MediaLayerV2[];
    metadata: TrackMetadata | null;
    cover: { file: File; src: string } | null;
    showMetadata: boolean;
  } | null;
  previewTrack: TrackDraft | null;
  queuePaused: boolean;
  selectedPresetIds: string[];
  selectedSettings: PublicationAssetSettings;
  tracks: TrackDraft[];
  onAllTracks: (include: boolean) => void;
  onCancelAllJobs: () => void;
  onCancelJob: (id: string) => void;
  onClearTerminalJobs: () => void;
  onCopyJobError: (job: RenderJob) => void;
  onExport: () => void;
  onPauseQueue: () => void;
  onPreset: (presetId: string) => void;
  onPresetScope: (scope: PublicationAssetMode) => void;
  onResumeQueue: () => void;
  onReviewVideos: () => void;
  onStopExport: () => void;
  onTogglePreset: (presetId: string) => void;
  onToggleTrack: (id: string) => void;
  onAssetSettings: (patch: Partial<PublicationAssetSettings>) => void;
  onUpdateLayer: (trackId: string, patch: { layers: MediaLayerV2[] }) => void;
}) {
  const publicationJobs = jobs.filter(
    (job) => job.kind === "publication-asset",
  );
  const checkedPresetIds = new Set(
    selectedPresetIds.length ? selectedPresetIds : [preset.id],
  );
  const selectedFormatCount = checkedPresetIds.size;
  const selectedTracks = tracks.filter(
    (track) => !excludedTrackIds.includes(track.id),
  );
  const selectedTrackCount = selectedTracks.length;
  const selectedTypeLabel = publicationAssetKindLabel(preset.kind);
  const selectedBookletTheme = publicationBookletThemeById(
    selectedSettings.bookletTheme,
  );
  const selectedConstraintSummary = publicationConstraintSummary(preset);
  const selectedFormatDescription = `${preset.width}x${preset.height} · ${
    preset.kind === "clip"
      ? "clip curto"
      : preset.kind === "booklet"
        ? "HTML estático"
        : "imagem"
  }`;
  const previewLongest = 360;
  const previewWidth =
    preset.width >= preset.height
      ? previewLongest
      : Math.max(
          1,
          Math.round((preset.width / preset.height) * previewLongest),
        );
  const previewHeight =
    preset.height > preset.width
      ? previewLongest
      : Math.max(
          1,
          Math.round((preset.height / preset.width) * previewLongest),
        );
  return (
    <div className="review-stage publication-stage">
      <header className="review-stage-header">
        <div>
          <span className="overline">Divulgação</span>
          <h1>Assets de publicação</h1>
          <p>
            Escolha os formatos e as faixas, confira a prévia real e gere
            exatamente o que precisa.
          </p>
        </div>
        <div className="stage-header-actions">
          <strong>
            {exportCount} asset{exportCount === 1 ? "" : "s"}
          </strong>
          <button type="button" onClick={onReviewVideos}>
            <Video /> Visualizar
          </button>
          {exporting ? (
            <button
              className="danger-action"
              type="button"
              onClick={onStopExport}
            >
              <X /> Parar geração
            </button>
          ) : (
            <button
              className="primary-action"
              disabled={exportCount === 0}
              type="button"
              onClick={onExport}
            >
              <Download /> Gerar {exportCount || ""} asset
              {exportCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </header>
      <section className="stage-surface publication-overview">
        <div>
          <span className="overline">Em foco</span>
          <strong>{preset.label}</strong>
          <small>
            {selectedConstraintSummary || selectedFormatDescription}
          </small>
        </div>
        <div>
          <span className="overline">Disparo</span>
          <strong>
            {selectedTrackCount} faixa{selectedTrackCount === 1 ? "" : "s"} ×{" "}
            {selectedFormatCount} formato{selectedFormatCount === 1 ? "" : "s"}
          </strong>
          <small>
            {exportCount} arquivo{exportCount === 1 ? "" : "s"} no total
          </small>
        </div>
        <div>
          <span className="overline">Ajuste efetivo</span>
          <strong>
            {preset.kind === "clip"
              ? `${selectedSettings.clipStart}s · ${selectedSettings.clipDuration}s`
              : preset.kind === "booklet"
                ? selectedBookletTheme.label
                : `${preset.width}x${preset.height}`}
          </strong>
          <small>{publicationLyricsSettingLabel(selectedSettings)}</small>
        </div>
      </section>
      <section className="stage-surface publication-focus">
        <div className="publication-format-picker">
          <div className="publication-format-head">
            <div>
              <span className="overline">Formatos a exportar</span>
              <strong>
                {selectedFormatCount} de {publicationAssetPresets.length}{" "}
                marcados
              </strong>
            </div>
            <div className="publication-scope-buttons">
              <button
                className={assetMode === "single" ? "is-active" : ""}
                type="button"
                onClick={() => onPresetScope("single")}
              >
                Em foco
              </button>
              <button
                className={assetMode === "group" ? "is-active" : ""}
                type="button"
                onClick={() => onPresetScope("group")}
              >
                Grupo {selectedTypeLabel}
              </button>
              <button
                className={assetMode === "all" ? "is-active" : ""}
                type="button"
                onClick={() => onPresetScope("all")}
              >
                Todos
              </button>
            </div>
          </div>
          <div className="publication-format-list">
            {publicationFormatGroups().map((group) => (
              <div className="publication-format-group" key={group.label}>
                <span className="publication-format-group-label">
                  {group.label}
                </span>
                <ul>
                  {group.presets.map((option) => {
                    const checked = checkedPresetIds.has(option.id);
                    const focused = option.id === preset.id;
                    return (
                      <li
                        className={`publication-format-row${focused ? " is-focused" : ""}`}
                        key={option.id}
                      >
                        <input
                          aria-label={`Incluir ${option.label} na exportação`}
                          checked={checked}
                          type="checkbox"
                          onChange={() => onTogglePreset(option.id)}
                        />
                        <button
                          className="publication-format-select"
                          type="button"
                          onClick={() => onPreset(option.id)}
                        >
                          <span className="publication-format-name">
                            {option.label}
                          </span>
                          <small>
                            {publicationAssetKindLabel(option.kind)} ·{" "}
                            {option.width}x{option.height}
                          </small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="publication-preview-panel">
          <div>
            <span className="overline">Prévia real · {preset.label}</span>
            <small>
              {preset.extension.toUpperCase()} · {preset.directory} ·{" "}
              {previewTrack?.metadata.title || "sem faixa em foco"}
              {selectedConstraintSummary
                ? ` · ${selectedConstraintSummary}`
                : ""}
            </small>
          </div>
          <div
            className="publication-preview-stage"
            style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
          >
            {previewTrack && previewComposition?.scene ? (
              <>
                {preset.kind === "booklet" ? (
                  <BookletPreview
                    metadata={
                      previewComposition.metadata ?? previewTrack.metadata
                    }
                    settings={selectedSettings}
                  />
                ) : preset.kind === "clip" && previewAudioSrc ? (
                  <CompositionLivePreview
                    className="publication-preview-render publication-live-preview"
                    audioSrc={previewAudioSrc}
                    clipDuration={selectedSettings.clipDuration}
                    clipStart={selectedSettings.clipStart}
                    coverSrc={previewComposition.cover?.src}
                    durationSeconds={previewTrack.audioInfo?.durationSeconds}
                    layers={previewComposition.layers}
                    metadata={
                      previewComposition.metadata ?? previewTrack.metadata
                    }
                    scene={previewComposition.scene}
                    showMetadata={previewComposition.showMetadata}
                    textSettings={applyPublicationTextOverride(
                      previewComposition.textSettings ??
                        previewTrack.textSettings,
                      selectedSettings,
                    )}
                  />
                ) : (
                  <CompositionThumbnail
                    className="publication-preview-render"
                    coverSrc={previewComposition.cover?.src}
                    durationSeconds={previewTrack.audioInfo?.durationSeconds}
                    fingerprint={`${thumbnailFingerprint(
                      previewTrack,
                      previewComposition.cover?.src,
                      previewComposition.showMetadata,
                    )}:txt${selectedSettings.textScale},${selectedSettings.textOffsetX},${selectedSettings.textOffsetY},${selectedSettings.hideText ? 1 : 0}`}
                    frameTime={
                      preset.kind === "image" ? selectedSettings.clipStart : 7.5
                    }
                    height={previewHeight}
                    layers={previewComposition.layers}
                    metadata={
                      previewComposition.metadata ?? previewTrack.metadata
                    }
                    scene={previewComposition.scene}
                    showMetadata={previewComposition.showMetadata}
                    textSettings={applyPublicationTextOverride(
                      previewComposition.textSettings ??
                        previewTrack.textSettings,
                      selectedSettings,
                    )}
                    width={previewWidth}
                  />
                )}
                {preset.kind !== "booklet" && (
                  <CanvasInteractionOverlay
                    layers={previewComposition.layers ?? []}
                    showMetadata={previewComposition.showMetadata ?? true}
                    textSettings={{
                      ...(previewComposition.textSettings ??
                        previewTrack.textSettings),
                      x:
                        (previewComposition.textSettings?.x ??
                          previewTrack.textSettings.x) +
                        selectedSettings.textOffsetX,
                      y:
                        (previewComposition.textSettings?.y ??
                          previewTrack.textSettings.y) +
                        selectedSettings.textOffsetY,
                    }}
                    onUpdateLayer={(id, patch) =>
                      onUpdateLayer(previewTrack.id, {
                        layers: previewTrack.layers.map((layer) =>
                          layer.id === id ? { ...layer, ...patch } : layer,
                        ),
                      })
                    }
                    onUpdateTextSettings={(patch) => {
                      if ("x" in patch) {
                        onAssetSettings({
                          textOffsetX:
                            (patch.x ?? 50) -
                            (previewComposition.textSettings?.x ??
                              previewTrack.textSettings.x),
                        });
                      }
                      if ("y" in patch) {
                        onAssetSettings({
                          textOffsetY:
                            (patch.y ?? 50) -
                            (previewComposition.textSettings?.y ??
                              previewTrack.textSettings.y),
                        });
                      }
                      if ("fontSize" in patch) {
                        const baseFontSize =
                          previewComposition.textSettings?.fontSize ??
                          previewTrack.textSettings.fontSize;
                        if (baseFontSize > 0) {
                          onAssetSettings({
                            textScale:
                              Math.round(
                                (patch.fontSize! / baseFontSize) * 100,
                              ) / 100,
                          });
                        }
                      }
                    }}
                  />
                )}
              </>
            ) : (
              <span className="publication-preview-empty">
                {preset.kind === "clip" ? (
                  <Video />
                ) : preset.kind === "booklet" ? (
                  <BookOpen />
                ) : (
                  <Image />
                )}
                Selecione uma faixa para ver a prévia
              </span>
            )}
          </div>
          <p className="publication-preview-settings">
            {preset.kind === "clip"
              ? `${selectedSettings.clipStart}s · ${selectedSettings.clipDuration}s`
              : preset.kind === "booklet"
                ? `Tema ${selectedBookletTheme.label}`
                : `${preset.width}x${preset.height}`}{" "}
            · {publicationLyricsSettingLabel(selectedSettings)}
          </p>
          {lyricsPreviewText && (
            <p
              className="publication-lyrics-preview"
              style={{
                lineHeight: `${selectedSettings.lyricsLineSpacing}%`,
              }}
            >
              {lyricsPreviewText}
            </p>
          )}
        </div>
      </section>
      <section className="stage-surface publication-track-list">
        <header>
          <div>
            <span className="overline">Faixas no escopo</span>
            <strong>
              {selectedTrackCount} de {tracks.length} selecionada
              {selectedTrackCount === 1 ? "" : "s"}
            </strong>
          </div>
          {tracks.length > 0 && (
            <div className="publication-track-actions">
              <button type="button" onClick={() => onAllTracks(true)}>
                Selecionar todas
              </button>
              <button type="button" onClick={() => onAllTracks(false)}>
                Limpar
              </button>
            </div>
          )}
        </header>
        {tracks.length ? (
          <div>
            {tracks.map((track) => (
              <label className="publication-track-row" key={track.id}>
                <input
                  checked={!excludedTrackIds.includes(track.id)}
                  type="checkbox"
                  onChange={() => onToggleTrack(track.id)}
                />
                <span>
                  <strong>{track.metadata.title || "Faixa sem título"}</strong>
                  <small>
                    {track.metadata.album || "Sem álbum"} ·{" "}
                    {track.metadata.lyrics ? "com letra" : "sem letra"}
                  </small>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="helper-copy">
            Selecione uma faixa ou marque faixas na biblioteca para gerar em
            lote.
          </p>
        )}
      </section>
      <BatchJobBoard
        emptyCopy="Ao gerar divulgação, cada imagem, clip e manifesto aparece aqui com progresso e links finais."
        jobs={publicationJobs}
        kind="publication-asset"
        queuePaused={queuePaused}
        title="Geração de divulgação"
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

function publicationFormatGroups() {
  const groups = new Map<string, PublicationAssetPreset[]>();
  for (const preset of publicationAssetPresets) {
    const label = preset.platform === "Social" ? "Padrões" : preset.platform;
    const bucket = groups.get(label) ?? [];
    bucket.push(preset);
    groups.set(label, bucket);
  }
  return [...groups.entries()]
    .sort(([first], [second]) =>
      first === "Padrões" ? -1 : second === "Padrões" ? 1 : 0,
    )
    .map(([label, presets]) => ({ label, presets }));
}

function BookletPreview({
  metadata,
  settings,
}: {
  metadata: TrackMetadata;
  settings: PublicationAssetSettings;
}) {
  const theme = publicationBookletThemeById(settings.bookletTheme);
  const tags = metadata.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 4);
  const lyricsPreview =
    settings.lyricsMode === "none"
      ? ""
      : (settings.lyricsExcerpt || metadata.lyrics)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 4)
          .join(" / ");
  return (
    <div
      className="publication-booklet-preview"
      style={
        {
          "--booklet-bg": theme.background,
          "--booklet-surface": theme.surface,
          "--booklet-text": theme.text,
          "--booklet-muted": theme.muted,
          "--booklet-accent": theme.accent,
        } as CSSProperties
      }
    >
      <div>
        <span>{metadata.album || "Álbum"}</span>
        <strong>{metadata.title || "Faixa sem título"}</strong>
        <small>{metadata.artist || metadata.albumArtist || "Artista"}</small>
      </div>
      <dl>
        <div>
          <dt>Ano</dt>
          <dd>{metadata.year || "-"}</dd>
        </div>
        <div>
          <dt>Gênero</dt>
          <dd>{metadata.genre || "-"}</dd>
        </div>
        <div>
          <dt>Tema</dt>
          <dd>{theme.label}</dd>
        </div>
      </dl>
      {tags.length > 0 && (
        <p>
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </p>
      )}
      {lyricsPreview && <blockquote>{lyricsPreview}</blockquote>}
    </div>
  );
}
