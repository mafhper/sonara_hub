import {
  Image,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { type RefObject, useEffect, useState } from "react";

import { IconButton, sliderStyle } from "../inspectors/fields";

export function Transport({
  audioRef,
  audioSrc,
  artworkLabel,
  artworkSrc,
  canNext,
  canPrevious,
  trackArtist,
  trackCount,
  trackIndex,
  trackTitle,
  onEditArtwork,
  onNext,
  onPrevious,
  onToggle,
}: {
  audioRef: RefObject<HTMLAudioElement | null>;
  audioSrc: string;
  artworkLabel: string;
  artworkSrc: string;
  canNext: boolean;
  canPrevious: boolean;
  trackArtist: string;
  trackCount: number;
  trackIndex: number;
  trackTitle: string;
  onEditArtwork: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggle: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const sync = () => setTime(audio.currentTime);
    const metadata = () => setDuration(audio.duration || 0);
    const play = () => setPlaying(true);
    const pause = () => setPlaying(false);
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("loadedmetadata", metadata);
    audio.addEventListener("play", play);
    audio.addEventListener("pause", pause);
    return () => {
      audio.removeEventListener("timeupdate", sync);
      audio.removeEventListener("loadedmetadata", metadata);
      audio.removeEventListener("play", play);
      audio.removeEventListener("pause", pause);
    };
  }, [audioRef, audioSrc]);

  return (
    <div className={playing ? "transport is-playing" : "transport"}>
      <div className="transport-controls" aria-label="Navegacao da faixa">
        <IconButton
          disabled={!canPrevious}
          label="Faixa anterior"
          onClick={onPrevious}
        >
          <SkipBack />
        </IconButton>
        <IconButton
          label={playing ? "Pausar prévia" : "Tocar prévia"}
          onClick={onToggle}
        >
          {playing ? <Pause /> : <Play />}
        </IconButton>
        <IconButton disabled={!canNext} label="Proxima faixa" onClick={onNext}>
          <SkipForward />
        </IconButton>
      </div>
      <div className="transport-artwork">
        <button
          aria-label="Abrir ajustes de capa"
          className="transport-artwork-button"
          title="Abrir ajustes de capa"
          type="button"
          onClick={onEditArtwork}
        >
          {artworkSrc ? <img alt="" src={artworkSrc} /> : <Music2 />}
        </button>
        {artworkLabel && <small>{artworkLabel}</small>}
        <div className="transport-artwork-popover">
          <div className="transport-artwork-preview">
            {artworkSrc ? <img alt="" src={artworkSrc} /> : <Music2 />}
          </div>
          <strong>{trackTitle || "Nenhuma faixa selecionada"}</strong>
          <span>Prévia ampliada da arte atual</span>
          <div className="transport-artwork-actions">
            <button type="button" onClick={onEditArtwork}>
              <Image /> Abrir Capas
            </button>
          </div>
        </div>
      </div>
      <div className="transport-track">
        <strong>{trackTitle || "Nenhuma faixa selecionada"}</strong>
        <small>
          {trackArtist || "Sem artista"}
          {trackCount > 0 && ` · ${Math.max(0, trackIndex) + 1}/${trackCount}`}
        </small>
      </div>
      <strong className="transport-time">{formatDuration(time)}</strong>
      <span
        className={`sonara-slider transport-slider ${seeking ? "is-dragging" : ""}`}
        style={sliderStyle(time, 0, duration || 0)}
      >
        <input
          aria-label="Posição da prévia"
          aria-valuetext={`${formatDuration(time)} de ${formatDuration(duration)}`}
          className="sonara-slider-control"
          max={duration || 0}
          min="0"
          step="0.1"
          type="range"
          value={time}
          onBlur={() => setSeeking(false)}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (audioRef.current) audioRef.current.currentTime = next;
            setTime(next);
          }}
          onPointerCancel={() => setSeeking(false)}
          onPointerDown={() => setSeeking(true)}
          onPointerUp={() => setSeeking(false)}
        />
        <span className="sonara-slider-value-badge" aria-hidden="true">
          {formatDuration(time)}
        </span>
      </span>
      <span className="transport-time">{formatDuration(duration)}</span>
    </div>
  );
}

function formatDuration(seconds?: number | null) {
  if (!Number.isFinite(seconds)) return "--:--";
  const safe = Number(seconds);
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}
