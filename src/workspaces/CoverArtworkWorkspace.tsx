import { Eye, EyeOff, Image, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { groupCatalogTracks } from "../../shared/catalog-tracks.mjs";
import type {
  ArtworkSuggestion,
  CoverSeriesSettings,
  TrackDraft,
} from "../types";
import { CoverSeriesArtwork, CoverSeriesEditor } from "./CoverSeries";
import { EmptyReviewState } from "./ReviewPrimitives";

export function CoverArtworkWorkspace({
  albumCoverForTrack,
  coverForTrack,
  coverSeriesSettings,
  selectedTrackId,
  seriesSettingsForTrack,
  onChooseCover,
  onChooseAlbumCover,
  onClearCover,
  onClearCoverSeriesOverride,
  onCoverSeriesPatch,
  onRestoreSuggestedCover,
  onSaveCoverSeriesDefault,
  onSelectTrack,
  onSelectSuggestedCover,
  onUseDetectedAlbumCover,
  tracks,
}: {
  albumCoverForTrack: (
    track?: TrackDraft,
  ) => { file: File; src: string } | null;
  coverForTrack: (track?: TrackDraft) => { file: File; src: string } | null;
  coverSeriesSettings: CoverSeriesSettings;
  selectedTrackId: string;
  seriesSettingsForTrack: (track?: TrackDraft) => CoverSeriesSettings;
  onChooseCover: (trackId: string) => void;
  onChooseAlbumCover: () => void;
  onClearCover: () => void;
  onClearCoverSeriesOverride: (trackId: string) => void;
  onCoverSeriesPatch: (
    patch: Partial<CoverSeriesSettings>,
    scope: "all" | "current",
    trackId?: string,
  ) => void;
  onRestoreSuggestedCover: (trackId?: string) => void;
  onSaveCoverSeriesDefault: (settings?: CoverSeriesSettings) => void;
  onSelectTrack: (trackId: string) => void;
  onSelectSuggestedCover: (trackId: string, relativePath: string) => void;
  onUseDetectedAlbumCover: (trackId?: string) => void;
  tracks: TrackDraft[];
}) {
  const [showSeries, setShowSeries] = useState(true);
  const [seriesScope, setSeriesScope] = useState<"all" | "current">("all");
  const previousTrackIdRef = useRef("");
  const albums = groupCatalogTracks(tracks);
  const artworkTrack =
    tracks.find((track) => track.id === selectedTrackId) ?? tracks[0];
  const artworkAlbum = artworkTrack
    ? albums.find((album) =>
        album.tracks.some((track) => track.id === artworkTrack.id),
      )
    : undefined;
  const albumTracks = artworkAlbum?.tracks ?? [];
  const hasOverride = Boolean(artworkTrack?.coverSeriesOverride);
  const editingScope = seriesScope === "current" ? "current" : "all";
  const editingSettings = artworkTrack
    ? editingScope === "current"
      ? seriesSettingsForTrack(artworkTrack)
      : coverSeriesSettings
    : coverSeriesSettings;
  const trackArtwork = coverForTrack(artworkTrack);
  const albumArtwork = albumCoverForTrack(artworkTrack);
  const detectedAlbumArtwork =
    artworkTrack?.albumCoverSuggestion ?? artworkTrack?.suggestedCover ?? null;

  useEffect(() => {
    if (!artworkTrack || previousTrackIdRef.current === artworkTrack.id) return;
    previousTrackIdRef.current = artworkTrack.id;
    setShowSeries(true);
    setSeriesScope("all");
  }, [artworkTrack]);

  return (
    <div className="review-stage artwork-review">
      <header className="review-stage-header artwork-review-header">
        <div>
          <span className="overline">Capa e série visual</span>
          <h1>Capas</h1>
          <p>
            Ajuste a arte tratada, escolha fontes de capa e revise a série
            numerada do álbum em uma superfície dedicada.
          </p>
        </div>
        <strong>
          {tracks.length} faixa{tracks.length === 1 ? "" : "s"}
        </strong>
      </header>
      {artworkTrack ? (
        <div className="artwork-workspace">
          <section className="artwork-canvas-panel">
            <div className="artwork-canvas-toolbar">
              <div>
                <span className="overline">Prévia tratada</span>
                <h2>{artworkTrack.metadata.title || "Faixa sem título"}</h2>
                <p>
                  {[
                    artworkTrack.metadata.album,
                    artworkTrack.metadata.artist,
                    artworkTrack.metadata.trackNumber
                      ? `faixa ${artworkTrack.metadata.trackNumber}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Sem metadados de álbum"}
                </p>
              </div>
              <div className="artwork-action-bar" role="toolbar">
                <button
                  aria-label="Definir capa compartilhada do álbum"
                  className="quiet-action"
                  type="button"
                  onClick={onChooseAlbumCover}
                >
                  <Image /> Definir capa do álbum
                </button>
                {detectedAlbumArtwork && (
                  <button
                    aria-label="Usar capa detectada como capa compartilhada do álbum"
                    className="quiet-action"
                    type="button"
                    onClick={() => onUseDetectedAlbumCover(artworkTrack.id)}
                  >
                    <RotateCcw /> Usar detectada no álbum
                  </button>
                )}
                <button
                  aria-label={`Trocar capa desta faixa: ${
                    artworkTrack.metadata.title || "faixa sem título"
                  }`}
                  className="upload-action"
                  type="button"
                  onClick={() => onChooseCover(artworkTrack.id)}
                >
                  <Image /> Trocar capa da faixa
                </button>
                {artworkTrack.suggestedCover && (
                  <button
                    className="quiet-action"
                    type="button"
                    onClick={() => onRestoreSuggestedCover(artworkTrack.id)}
                  >
                    <RotateCcw /> Usar arte oferecida
                  </button>
                )}
                {(artworkTrack.coverOverride || trackArtwork) && (
                  <button
                    className="quiet-action"
                    type="button"
                    onClick={onClearCover}
                  >
                    <Trash2 />{" "}
                    {artworkTrack.coverOverride
                      ? "Remover capa da faixa"
                      : "Remover capa compartilhada"}
                  </button>
                )}
                <button
                  className="quiet-action"
                  type="button"
                  onClick={() => setShowSeries((current) => !current)}
                >
                  {showSeries ? <EyeOff /> : <Eye />}
                  {showSeries ? "Ver arte base" : "Ver com série visual"}
                </button>
              </div>
            </div>
            <div className="artwork-canvas-frame">
              <CoverSeriesArtwork
                artworkSrc={trackArtwork?.src}
                className="artwork-canvas"
                coverSeriesSettings={seriesSettingsForTrack(artworkTrack)}
                showSeries={showSeries}
                track={artworkTrack}
              />
            </div>
            <div className="artwork-album-strip">
              <div className="artwork-strip-head">
                <span className="overline">Capas do álbum</span>
                <span>
                  {albumTracks.length} faixa
                  {albumTracks.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="artwork-strip-grid">
                {albumArtwork?.src && (
                  <button
                    aria-label={
                      detectedAlbumArtwork
                        ? "Usar capa detectada no álbum"
                        : "Capa compartilhada do álbum"
                    }
                    className="artwork-strip-item is-album"
                    disabled={!detectedAlbumArtwork}
                    type="button"
                    onClick={() => onUseDetectedAlbumCover(artworkTrack.id)}
                  >
                    <CoverSeriesArtwork
                      artworkSrc={albumArtwork.src}
                      className="catalog-artwork-series-thumb"
                      showSeries={false}
                      track={artworkTrack}
                    />
                    <span>Capa do álbum</span>
                    {detectedAlbumArtwork && <em>detectada</em>}
                  </button>
                )}
                {albumTracks.map((track) => (
                  <button
                    aria-label={`Editar capa de ${track.metadata.title || "faixa"}`}
                    className={`artwork-strip-item ${
                      track.id === artworkTrack.id ? "active" : ""
                    }`}
                    key={track.id}
                    type="button"
                    onClick={() => onSelectTrack(track.id)}
                  >
                    <CoverSeriesArtwork
                      artworkSrc={coverForTrack(track)?.src}
                      className="catalog-artwork-series-thumb"
                      coverSeriesSettings={seriesSettingsForTrack(track)}
                      showSeries={showSeries}
                      track={track}
                    />
                    <span>
                      {track.metadata.trackNumber
                        ? `${String(track.metadata.trackNumber).padStart(2, "0")} · `
                        : ""}
                      {track.metadata.title || "Faixa sem título"}
                    </span>
                    {track.coverOverride && <em>capa própria</em>}
                    {track.coverSeriesOverride && <em>ajuste próprio</em>}
                  </button>
                ))}
              </div>
            </div>
          </section>
          <aside className="artwork-control-panel">
            <div className="cover-series-scope">
              <span className="cover-series-scope-label">Estilo afeta</span>
              <div
                className="segmented"
                role="tablist"
                aria-label="Escopo dos ajustes da série"
              >
                <button
                  aria-selected={seriesScope === "all"}
                  className={seriesScope === "all" ? "active" : ""}
                  role="tab"
                  type="button"
                  onClick={() => setSeriesScope("all")}
                >
                  Série
                </button>
                <button
                  aria-selected={seriesScope === "current"}
                  className={seriesScope === "current" ? "active" : ""}
                  role="tab"
                  type="button"
                  onClick={() => setSeriesScope("current")}
                >
                  Único
                </button>
              </div>
              {seriesScope === "current" && hasOverride && (
                <button
                  className="quiet-action cover-series-scope-reset"
                  type="button"
                  onClick={() => onClearCoverSeriesOverride(artworkTrack.id)}
                >
                  <RotateCcw /> Reverter ao padrão do álbum
                </button>
              )}
              {seriesScope === "current" && !hasOverride && (
                <p className="cover-series-scope-hint">
                  A capa selecionada segue o padrão da série. Qualquer ajuste
                  cria um estilo exclusivo só para ela.
                </p>
              )}
            </div>
            <CoverSeriesEditor
              compact
              settings={editingSettings}
              onChange={(patch) =>
                onCoverSeriesPatch(patch, editingScope, artworkTrack.id)
              }
              onSaveDefault={onSaveCoverSeriesDefault}
            />
            {(artworkTrack.artworkOptions?.length ?? 0) > 1 && (
              <div className="catalog-artwork-variants artwork-source-panel">
                <span className="overline">Fontes disponíveis</span>
                <div>
                  {artworkTrack.artworkOptions?.map((option) => (
                    <button
                      className={
                        option.relativePath ===
                        (artworkTrack.coverOverride?.relativePath ??
                          artworkTrack.suggestedCover?.relativePath)
                          ? "active"
                          : ""
                      }
                      key={option.relativePath}
                      type="button"
                      onClick={() =>
                        onSelectSuggestedCover(
                          artworkTrack.id,
                          option.relativePath,
                        )
                      }
                    >
                      <strong>{artworkVariantLabel(option)}</strong>
                      <small>{formatBytes(option.file.size)}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!artworkTrack.suggestedCover && (
              <p className="helper-copy catalog-artwork-hint">
                {artworkConventionHint(artworkTrack)}
              </p>
            )}
          </aside>
        </div>
      ) : (
        <EmptyReviewState />
      )}
    </div>
  );
}

function artworkConventionHint(track: TrackDraft) {
  return `Dica: coloque a capa como ${track.metadata.title || track.outputBaseName}.jpg ao lado do áudio, ou use cover/folder/front no diretório do álbum.`;
}

function artworkVariantLabel(artwork: ArtworkSuggestion) {
  if (artwork.source === "manual") return "Capa manual";
  return artwork.relativePath.split(/[\\/]/).pop() || artwork.relativePath;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
