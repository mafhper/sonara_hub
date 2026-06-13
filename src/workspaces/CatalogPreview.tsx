import { Maximize2 } from "lucide-react";
import { useState } from "react";

import { groupCatalogTracks } from "../../shared/catalog-tracks.mjs";
import type { CoverSeriesSettings, TrackDraft } from "../types";
import { CoverSeriesArtwork } from "./CoverSeries";
import { EmptyReviewState } from "./ReviewPrimitives";

export function CatalogPreview({
  coverForTrack,
  seriesSettingsForTrack,
  onInspectArtwork,
  onSelectTrack,
  tracks,
}: {
  coverForTrack: (track?: TrackDraft) => { file: File; src: string } | null;
  seriesSettingsForTrack: (track?: TrackDraft) => CoverSeriesSettings;
  onInspectArtwork: (trackId: string) => void;
  onSelectTrack: (trackId: string) => void;
  tracks: TrackDraft[];
}) {
  const [tagLevels, setTagLevels] = useState<Record<string, number>>({});
  const albums = groupCatalogTracks(tracks);

  function inspectArtwork(track: TrackDraft) {
    onInspectArtwork(track.id);
  }

  return (
    <div className="review-stage catalog-review">
      <header className="review-stage-header">
        <div>
          <span className="overline">Conferência musical</span>
          <h1>Catálogo planejado</h1>
          <p>Visualize as tags como uma página de álbum antes do tratamento.</p>
        </div>
        <strong>
          {tracks.length} faixa{tracks.length === 1 ? "" : "s"}
        </strong>
      </header>
      <div className="catalog-scroll">
        {albums.length ? (
          albums.map((album) => {
            const leadTrack = album.tracks[0];
            const artwork = coverForTrack(leadTrack)?.src;
            return (
              <section className="catalog-album" key={album.id}>
                <header className="catalog-album-header">
                  <CatalogArtworkButton
                    artworkSrc={artwork}
                    coverSeriesSettings={seriesSettingsForTrack(leadTrack)}
                    onClick={() => inspectArtwork(leadTrack)}
                    track={leadTrack}
                  />
                  <div>
                    <span className="overline">Álbum</span>
                    <h2>{album.album || "Álbum não informado"}</h2>
                    <p>{album.artist || "Artista não informado"}</p>
                    <small>
                      {[
                        album.year || "Ano ausente",
                        album.genre || "Gênero ausente",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {" · "}
                      {album.tracks.length} faixa
                      {album.tracks.length === 1 ? "" : "s"}
                    </small>
                  </div>
                </header>
                <div className="catalog-track-list">
                  {album.tracks.map((track) => {
                    const m = track.metadata;
                    const trackLabel = m.trackNumber
                      ? m.trackTotal
                        ? `${m.trackNumber}/${m.trackTotal}`
                        : `${m.trackNumber}`
                      : "";
                    const diskLabel =
                      m.diskNumber > 1 || m.diskTotal > 1
                        ? `${m.diskNumber}/${m.diskTotal || 1}`
                        : "";
                    const flag = (
                      on: boolean,
                      onLabel: string,
                      offLabel: string,
                    ) => ({ value: on ? onLabel : offLabel, hasData: on });
                    const rows: Array<{
                      label: string;
                      value: string;
                      primary: boolean;
                      hasData: boolean;
                    }> = [
                      {
                        label: "Artista",
                        value: m.artist,
                        primary: true,
                        hasData: !!m.artist,
                      },
                      {
                        label: "Álbum",
                        value: m.album,
                        primary: true,
                        hasData: !!m.album,
                      },
                      {
                        label: "Gênero",
                        value: m.genre,
                        primary: true,
                        hasData: !!m.genre,
                      },
                      {
                        label: "Ano",
                        value: m.year,
                        primary: true,
                        hasData: !!m.year,
                      },
                      {
                        label: "Faixa",
                        value: trackLabel,
                        primary: true,
                        hasData: !!trackLabel,
                      },
                      {
                        label: "Artista do álbum",
                        value: m.albumArtist,
                        primary: false,
                        hasData: !!m.albumArtist,
                      },
                      {
                        label: "Compositor",
                        value: m.composer,
                        primary: false,
                        hasData: !!m.composer,
                      },
                      {
                        label: "Disco",
                        value: diskLabel,
                        primary: false,
                        hasData: !!diskLabel,
                      },
                      {
                        label: "Idioma",
                        value: m.language,
                        primary: false,
                        hasData: !!m.language,
                      },
                      {
                        label: "Data de gravação",
                        value: m.recordingDate,
                        primary: false,
                        hasData: !!m.recordingDate,
                      },
                      {
                        label: "Copyright",
                        value: m.copyright,
                        primary: false,
                        hasData: !!m.copyright,
                      },
                      {
                        label: "Categoria",
                        value: m.categoryId,
                        primary: false,
                        hasData: !!m.categoryId,
                      },
                      {
                        label: "Visibilidade",
                        value: m.visibility,
                        primary: false,
                        hasData: !!m.visibility,
                      },
                      {
                        label: "Tags",
                        value: m.tags,
                        primary: false,
                        hasData: !!m.tags,
                      },
                      {
                        label: "Comentário",
                        value: m.comment,
                        primary: false,
                        hasData: !!m.comment,
                      },
                      {
                        label: "Descrição",
                        value: m.description,
                        primary: false,
                        hasData: !!m.description,
                      },
                      {
                        label: "Idioma da letra",
                        value: m.lyricsLanguage,
                        primary: false,
                        hasData: !!m.lyricsLanguage,
                      },
                      {
                        label: "Para crianças",
                        primary: false,
                        ...flag(m.madeForKids, "Sim", "Não"),
                      },
                      {
                        label: "Mídia sintética",
                        primary: false,
                        ...flag(m.containsSyntheticMedia, "Sim", "Não"),
                      },
                      {
                        label: "Normalização",
                        primary: false,
                        ...flag(m.normalizationEnabled, "Ativa", "Inativa"),
                      },
                    ];
                    const level = tagLevels[track.id] ?? 0;
                    const visibleRows = rows.filter((row) =>
                      level >= 2
                        ? true
                        : row.hasData && (level >= 1 || row.primary),
                    );
                    const hasExtra = rows.some(
                      (row) => row.hasData && !row.primary,
                    );
                    const hasEmpty = rows.some((row) => !row.hasData);
                    const setLevel = (next: number) =>
                      setTagLevels((current) => ({
                        ...current,
                        [track.id]: next,
                      }));
                    return (
                      <div className="catalog-track-row" key={track.id}>
                        <button
                          className="catalog-track"
                          type="button"
                          onClick={() => onSelectTrack(track.id)}
                        >
                          <span className="catalog-track-number">
                            {m.diskNumber > 1 ? `${m.diskNumber}.` : ""}
                            {m.trackNumber || "–"}
                          </span>
                          <span>
                            <strong>{m.title || "Título ausente"}</strong>
                            <small>
                              {m.version ||
                                (track.packageStatus === "treated"
                                  ? "Cópia tratada"
                                  : "Arquivo original")}
                            </small>
                          </span>
                          <span className="catalog-track-duration">
                            {formatDuration(track.audioInfo?.durationSeconds)}
                          </span>
                          <em>
                            {track.packageStatus === "treated"
                              ? "Tratado"
                              : "Original"}
                          </em>
                        </button>
                        <div className="catalog-track-tags">
                          {visibleRows.map((row) => (
                            <span
                              className={`catalog-tag${row.hasData ? "" : " is-empty"}`}
                              key={row.label}
                            >
                              <span className="catalog-tag-key">
                                {row.label}
                              </span>
                              <span className="catalog-tag-value">
                                {row.value || "—"}
                              </span>
                            </span>
                          ))}
                          {level === 0 && (hasExtra || hasEmpty) && (
                            <button
                              className="catalog-tag-toggle"
                              type="button"
                              onClick={() => setLevel(hasExtra ? 1 : 2)}
                            >
                              ▾ mais
                            </button>
                          )}
                          {level === 1 && hasEmpty && (
                            <button
                              className="catalog-tag-toggle"
                              type="button"
                              onClick={() => setLevel(2)}
                            >
                              ▾ vazias
                            </button>
                          )}
                          {level >= 1 && (
                            <button
                              className="catalog-tag-toggle"
                              type="button"
                              onClick={() => setLevel(0)}
                            >
                              ▴ recolher
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        ) : (
          <EmptyReviewState />
        )}
      </div>
    </div>
  );
}

function CatalogArtworkButton({
  artworkSrc,
  coverSeriesSettings,
  onClick,
  track,
}: {
  artworkSrc?: string;
  coverSeriesSettings: CoverSeriesSettings;
  onClick: () => void;
  track: TrackDraft;
}) {
  return (
    <button
      aria-label={`Abrir Capas de ${track.metadata.album || track.metadata.title || "álbum"}`}
      className="catalog-artwork-button"
      type="button"
      onClick={onClick}
    >
      <span aria-hidden="true" className="catalog-artwork-vinyl" />
      <CoverSeriesArtwork
        artworkSrc={artworkSrc}
        className="artwork-square"
        coverSeriesSettings={coverSeriesSettings}
        track={track}
      />
      <span className="catalog-artwork-edit">
        <Maximize2 /> Capas
      </span>
    </button>
  );
}

function formatDuration(seconds?: number | null) {
  if (!Number.isFinite(seconds)) return "--:--";
  const safe = Number(seconds);
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}
