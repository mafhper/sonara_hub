import { Pause, Play, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import type { TrackDraft } from "../types";
import {
  CompositionLivePreview,
  CompositionThumbnail,
} from "./CompositionPreview";
import { ArtworkFrame, EmptyReviewState } from "./ReviewPrimitives";
import { thumbnailFingerprint, trackAudioSrc } from "./video-review-helpers";

export function VideoReviewGrid({
  coverForTrack,
  selectedTrackId,
  onEditVisual,
  onSelectTrack,
  onThumbnailMode,
  onThumbnailTime,
  outputLabel,
  showMetadata,
  tracks,
}: {
  coverForTrack: (track?: TrackDraft) => { file: File; src: string } | null;
  selectedTrackId: string;
  onEditVisual: (trackId: string) => void;
  onSelectTrack: (trackId: string) => void;
  onThumbnailMode: (
    trackId: string,
    mode: TrackDraft["thumbnailPreviewMode"],
  ) => void;
  onThumbnailTime: (trackId: string, seconds: number) => void;
  outputLabel: string;
  showMetadata: boolean;
  tracks: TrackDraft[];
}) {
  // Which card is playing live: hover gives a muted animated preview, the
  // overlay button switches to persistent playback with audio (one at a time).
  const [livePreview, setLivePreview] = useState<{
    trackId: string;
    withAudio: boolean;
  } | null>(null);
  return (
    <div className="review-stage video-review">
      <header className="review-stage-header">
        <div>
          <span className="overline">Conferência de vídeos</span>
          <h1>Grade de publicação</h1>
          <p>Confira títulos, capas e frames antes de exportar.</p>
        </div>
        <strong>
          {tracks.length} vídeo{tracks.length === 1 ? "" : "s"}
        </strong>
      </header>
      {tracks.length ? (
        <div className="youtube-grid">
          {tracks.map((track) => {
            const coverSrc = coverForTrack(track)?.src;
            const selected = track.id === selectedTrackId;
            const audioSrc = trackAudioSrc(track);
            const live =
              livePreview?.trackId === track.id &&
              track.thumbnailPreviewMode === "composition" &&
              Boolean(audioSrc);
            return (
              <article
                className={`youtube-card ${selected ? "selected" : ""}`}
                key={track.id}
              >
                <div
                  className="youtube-thumbnail-shell"
                  onMouseEnter={() =>
                    setLivePreview((current) =>
                      current?.withAudio
                        ? current
                        : { trackId: track.id, withAudio: false },
                    )
                  }
                  onMouseLeave={() =>
                    setLivePreview((current) =>
                      current &&
                      current.trackId === track.id &&
                      !current.withAudio
                        ? null
                        : current,
                    )
                  }
                >
                  <div
                    className="youtube-thumbnail"
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectTrack(track.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectTrack(track.id);
                      }
                    }}
                  >
                    {live ? (
                      <CompositionLivePreview
                        autoPlay
                        className="composition-live-preview youtube-live-preview"
                        audioSrc={audioSrc}
                        durationSeconds={track.audioInfo?.durationSeconds}
                        coverSrc={coverSrc}
                        layers={track.layers}
                        metadata={track.metadata}
                        muted={!livePreview?.withAudio}
                        scene={track.scene}
                        showMetadata={showMetadata}
                        textSettings={track.textSettings}
                      />
                    ) : track.thumbnailPreviewMode === "composition" ? (
                      <CompositionThumbnail
                        coverSrc={coverSrc}
                        durationSeconds={track.audioInfo?.durationSeconds}
                        fingerprint={thumbnailFingerprint(
                          track,
                          coverSrc,
                          showMetadata,
                        )}
                        frameTime={track.thumbnailTime ?? 7.5}
                        layers={track.layers}
                        metadata={track.metadata}
                        scene={track.scene}
                        showMetadata={showMetadata}
                        textSettings={track.textSettings}
                      />
                    ) : (
                      <ArtworkFrame artworkSrc={coverSrc} />
                    )}
                    <span className="youtube-duration">
                      {formatDuration(track.audioInfo?.durationSeconds)}
                    </span>
                  </div>
                  {track.thumbnailPreviewMode === "composition" &&
                    Boolean(audioSrc) && (
                      <button
                        aria-label={
                          live && livePreview?.withAudio
                            ? "Parar reprodução"
                            : "Tocar com áudio"
                        }
                        className="youtube-live-toggle"
                        type="button"
                        onClick={() =>
                          setLivePreview((current) =>
                            current?.trackId === track.id && current.withAudio
                              ? null
                              : { trackId: track.id, withAudio: true },
                          )
                        }
                      >
                        {live && livePreview?.withAudio ? <Pause /> : <Play />}
                      </button>
                    )}
                </div>
                <div className="youtube-card-copy">
                  <strong>
                    {track.metadata.title || "Título não informado"}
                  </strong>
                  <span>
                    {track.metadata.artist || "Artista não informado"}
                  </span>
                  <small>
                    {outputLabel} ·{" "}
                    {track.metadata.visibility === "public"
                      ? "Público"
                      : track.metadata.visibility === "private"
                        ? "Privado"
                        : "Não listado"}
                  </small>
                </div>
                <ul className="video-card-data">
                  <li>
                    <span>Efeito</span>
                    <strong>{track.scene?.name ?? "—"}</strong>
                  </li>
                  <li>
                    <span>Waveform</span>
                    <strong>
                      {track.scene?.waveform?.visible ? "Ligada" : "Desligada"}
                    </strong>
                  </li>
                  <li>
                    <span>Camadas</span>
                    <strong>{track.layers.length}/3</strong>
                  </li>
                  <li>
                    <span>Texto</span>
                    <strong>
                      {showMetadata
                        ? `${
                            Object.values(
                              track.textSettings?.fields ?? {},
                            ).filter(Boolean).length
                          } campos`
                        : "Oculto"}
                    </strong>
                  </li>
                  <li>
                    <span>Álbum</span>
                    <strong>{track.metadata.album || "—"}</strong>
                  </li>
                  <li>
                    <span>Ano · Versão</span>
                    <strong>
                      {[track.metadata.year, track.metadata.version]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </strong>
                  </li>
                </ul>
                <div
                  className="thumbnail-mode-switch"
                  role="group"
                  aria-label={`Miniatura de ${track.metadata.title}`}
                >
                  <button
                    className={
                      track.thumbnailPreviewMode === "composition"
                        ? "active"
                        : ""
                    }
                    type="button"
                    onClick={() => onThumbnailMode(track.id, "composition")}
                  >
                    Frame
                  </button>
                  <button
                    className={
                      track.thumbnailPreviewMode === "cover" ? "active" : ""
                    }
                    type="button"
                    onClick={() => onThumbnailMode(track.id, "cover")}
                  >
                    Capa
                  </button>
                </div>
                {selected &&
                  track.thumbnailPreviewMode === "composition" &&
                  !live && (
                    <label className="thumbnail-frame-picker">
                      <span>
                        Frame da miniatura ·{" "}
                        {formatDuration(track.thumbnailTime ?? 7.5)}
                      </span>
                      <input
                        max={Math.max(
                          10,
                          Math.floor(track.audioInfo?.durationSeconds ?? 60),
                        )}
                        min={0}
                        step={1}
                        type="range"
                        value={track.thumbnailTime ?? 7.5}
                        onChange={(event) =>
                          onThumbnailTime(track.id, Number(event.target.value))
                        }
                      />
                    </label>
                  )}
                {selected && (
                  <div className="video-card-options">
                    <button
                      aria-label="Ajustar visual"
                      className="primary-action"
                      type="button"
                      onClick={() => onEditVisual(track.id)}
                    >
                      <SlidersHorizontal />
                      <span>
                        <strong>Configurar frame</strong>
                        <small>Abrir Estúdio visual</small>
                      </span>
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyReviewState />
      )}
    </div>
  );
}

function formatDuration(seconds?: number | null) {
  if (!Number.isFinite(seconds)) return "--:--";
  const safe = Number(seconds);
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}
