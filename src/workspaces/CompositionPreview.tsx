import { Loader2, Pause, Play, Video } from "lucide-react";
import {
  type MutableRefObject,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createSceneRuntime,
  loadMediaElements,
} from "../../shared/canvas-scene-runtime.mjs";
import type { SceneComposition } from "../../shared/canvas-scene-runtime.mjs";
import { atmosphereStackPerformance } from "../../shared/visual-effects.mjs";
import type { ScenePresetV3 } from "../../shared/visual-effects.mjs";
import { audioBandsFromAnalyser } from "../features/audio/audioPlayback";
import type {
  MediaLayerV2,
  TextOverlaySettings,
  TrackMetadata,
} from "../types";
import { ArtworkFrame } from "./ReviewPrimitives";

const compositionThumbnailCache = new Map<string, string>();
const COMPOSITION_THUMBNAIL_CACHE_LIMIT = 60;

function scenePreviewPolicy(scene: ScenePresetV3) {
  const performance = atmosphereStackPerformance(scene);
  if (performance.heavy) return { maxFps: 12, maxScale: 1 };
  if (performance.moderate) return { maxFps: 24, maxScale: 1.25 };
  return { maxFps: 0, maxScale: 1.5 };
}

export type PreviewAudioBands = {
  energy: number;
  bass: number;
  mid: number;
  high: number;
  centroid: number;
  flux: number;
  onset: number;
  beat: number;
  beatPhase: number;
  samples: number[];
  spectrum: number[];
};

export function ScenePreview({
  audioBandsRef,
  audioRef,
  coverSrc,
  durationSeconds,
  layers,
  metadata,
  scene,
  showMetadata,
  textSettings,
}: {
  audioBandsRef: MutableRefObject<PreviewAudioBands>;
  audioRef: RefObject<HTMLAudioElement | null>;
  coverSrc?: string;
  durationSeconds?: number | null;
  layers: MediaLayerV2[];
  metadata: TrackMetadata;
  scene: ScenePresetV3;
  showMetadata: boolean;
  textSettings: TextOverlaySettings;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<ReturnType<typeof createSceneRuntime> | undefined>(
    undefined,
  );
  const sceneRef = useRef(scene);
  const previewPolicyRef = useRef(scenePreviewPolicy(scene));
  const compositionRef = useRef<SceneComposition>({});

  useEffect(() => {
    sceneRef.current = scene;
    previewPolicyRef.current = scenePreviewPolicy(scene);
    runtimeRef.current?.setScene(scene);
  }, [scene]);

  useEffect(() => {
    let active = true;
    void loadMediaElements({
      coverSrc,
      durationSeconds,
      layers: layers.map((layer) => ({ ...layer, src: layer.src })),
      metadata,
      showMetadata,
      textSettings,
    }).then((composition) => {
      if (!active) return;
      compositionRef.current = composition;
      runtimeRef.current?.setComposition(composition);
    });
    return () => {
      active = false;
    };
  }, [coverSrc, durationSeconds, layers, metadata, showMetadata, textSettings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const runtime = createSceneRuntime(
      canvas,
      sceneRef.current,
      compositionRef.current,
    );
    runtimeRef.current = runtime;
    let frame = 0;
    let lastRenderAt = 0;
    const started = performance.now();
    const draw = (now = performance.now()) => {
      const policy = previewPolicyRef.current;
      const minFrameMs = policy.maxFps > 0 ? 1000 / policy.maxFps : 0;
      if (minFrameMs && now - lastRenderAt < minFrameMs * 0.9) {
        frame = window.requestAnimationFrame(draw);
        return;
      }
      lastRenderAt = now;
      const scale = Math.min(policy.maxScale, window.devicePixelRatio || 1);
      const audioTime = audioRef.current?.currentTime;
      const renderTime =
        Number.isFinite(audioTime) && (audioRef.current?.duration ?? 0) > 0
          ? Number(audioTime)
          : (performance.now() - started) / 1000;
      runtime.resize(canvas.clientWidth * scale, canvas.clientHeight * scale);
      runtime.setAudio(audioBandsRef.current);
      runtime.render(renderTime);
      frame = window.requestAnimationFrame(draw);
    };
    draw();
    return () => {
      window.cancelAnimationFrame(frame);
      runtime.destroy();
    };
  }, [audioBandsRef, audioRef]);

  return <canvas className="scene-canvas" ref={canvasRef} />;
}

export function CompositionThumbnail({
  coverSrc,
  durationSeconds,
  fingerprint,
  layers,
  metadata,
  scene,
  showMetadata,
  textSettings,
  width = 320,
  height = 180,
  frameTime = 7.5,
  className = "composition-thumbnail",
}: {
  coverSrc?: string;
  durationSeconds?: number | null;
  fingerprint: string;
  layers: MediaLayerV2[];
  metadata: TrackMetadata;
  scene: ScenePresetV3;
  showMetadata: boolean;
  textSettings: TextOverlaySettings;
  width?: number;
  height?: number;
  frameTime?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const cacheKey = `${fingerprint}@${width}x${height}@t${frameTime}`;
  const [previewSrc, setPreviewSrc] = useState(
    () => compositionThumbnailCache.get(cacheKey) ?? "",
  );

  useEffect(() => {
    let active = true;
    let runtime: ReturnType<typeof createSceneRuntime> | undefined;
    const cached = compositionThumbnailCache.get(cacheKey);
    setFailed(false);
    if (cached) {
      setPreviewSrc(cached);
      return;
    }
    setPreviewSrc("");
    const timeout = window.setTimeout(() => {
      void loadMediaElements({
        coverSrc,
        durationSeconds,
        layers: layers.map((layer) => ({ ...layer, src: layer.src })),
        metadata,
        showMetadata,
        textSettings,
      })
        .then((composition) => {
          const canvas = canvasRef.current;
          if (!active || !canvas) return;
          runtime = createSceneRuntime(canvas, scene, composition);
          runtime.resize(width, height);
          runtime.render(frameTime);
          const nextPreview = canvas.toDataURL("image/jpeg", 0.82);
          compositionThumbnailCache.set(cacheKey, nextPreview);
          if (
            compositionThumbnailCache.size > COMPOSITION_THUMBNAIL_CACHE_LIMIT
          ) {
            compositionThumbnailCache.delete(
              compositionThumbnailCache.keys().next().value ?? "",
            );
          }
          setPreviewSrc(nextPreview);
          runtime.destroy();
          runtime = undefined;
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    }, 140);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      runtime?.destroy();
    };
  }, [
    cacheKey,
    coverSrc,
    durationSeconds,
    frameTime,
    height,
    layers,
    metadata,
    scene,
    showMetadata,
    textSettings,
    width,
  ]);

  if (failed) return <ArtworkFrame artworkSrc={coverSrc} />;
  if (previewSrc) {
    return <img alt="" className={className} src={previewSrc} />;
  }
  return (
    <span className={`${className} composition-thumbnail-loading`}>
      {coverSrc ? <img alt="" src={coverSrc} /> : <Video />}
      <span>
        <Loader2 />
        Gerando frame
      </span>
      <canvas
        aria-hidden="true"
        height={height}
        ref={canvasRef}
        width={width}
      />
    </span>
  );
}

export function CompositionLivePreview({
  audioSrc,
  autoPlay = false,
  className = "composition-live-preview",
  clipStart = 0,
  clipDuration = null,
  coverSrc,
  durationSeconds,
  layers,
  metadata,
  muted = false,
  scene,
  showMetadata,
  textSettings,
}: {
  audioSrc: string;
  autoPlay?: boolean;
  className?: string;
  clipStart?: number;
  clipDuration?: number | null;
  coverSrc?: string;
  durationSeconds?: number | null;
  layers: MediaLayerV2[];
  metadata: TrackMetadata;
  muted?: boolean;
  scene: ScenePresetV3;
  showMetadata: boolean;
  textSettings: TextOverlaySettings;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioElRef = useRef<HTMLAudioElement>(null);
  const runtimeRef = useRef<ReturnType<typeof createSceneRuntime> | undefined>(
    undefined,
  );
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const windowStart = Math.max(0, clipStart);
  const windowLength = Math.max(
    1,
    Math.min(
      clipDuration ?? Number.POSITIVE_INFINITY,
      Math.max(1, (durationSeconds ?? windowStart + 30) - windowStart),
    ),
  );
  const windowStartRef = useRef(windowStart);
  const windowEndRef = useRef(windowStart + windowLength);
  windowStartRef.current = windowStart;
  windowEndRef.current = windowStart + windowLength;
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    runtimeRef.current?.setScene(scene);
  }, [scene]);

  useEffect(() => {
    let active = true;
    void loadMediaElements({
      coverSrc,
      durationSeconds,
      layers: layers.map((layer) => ({ ...layer, src: layer.src })),
      metadata,
      showMetadata,
      textSettings,
    }).then((composition) => {
      if (active) runtimeRef.current?.setComposition(composition);
    });
    return () => {
      active = false;
    };
  }, [coverSrc, durationSeconds, layers, metadata, showMetadata, textSettings]);

  useEffect(() => {
    const audio = audioElRef.current;
    if (audio && audio.paused) {
      audio.currentTime = windowStart;
      setPosition(0);
    }
  }, [windowStart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const audio = audioElRef.current;
    if (!canvas || !audio) return;
    const runtime = createSceneRuntime(canvas, scene, {});
    runtimeRef.current = runtime;
    let frame = 0;
    const draw = () => {
      const analyser = analyserRef.current;
      if (analyser && !audio.paused) {
        runtime.setAudio(audioBandsFromAnalyser(analyser));
      }
      const current = Number.isFinite(audio.currentTime)
        ? audio.currentTime
        : windowStartRef.current;
      if (!audio.paused && current >= windowEndRef.current) {
        audio.currentTime = windowStartRef.current;
      }
      const scale = Math.min(1.5, window.devicePixelRatio || 1);
      runtime.resize(canvas.clientWidth * scale, canvas.clientHeight * scale);
      runtime.render(Math.max(windowStartRef.current, current));
      frame = window.requestAnimationFrame(draw);
    };
    draw();
    const handleTime = () =>
      setPosition(
        Math.max(0, (audio.currentTime ?? 0) - windowStartRef.current),
      );
    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleMetadata = () => {
      if (audio.paused) audio.currentTime = windowStartRef.current;
    };
    audio.addEventListener("timeupdate", handleTime);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("loadedmetadata", handleMetadata);
    if (autoPlay) {
      audio.muted = true;
      void audio.play().catch(() => undefined);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      audio.removeEventListener("timeupdate", handleTime);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("loadedmetadata", handleMetadata);
      audio.pause();
      runtime.destroy();
      runtimeRef.current = undefined;
      void audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
      analyserRef.current = null;
    };
    // The runtime/audio graph lives for the component's lifetime; scene and
    // composition updates flow through the effects above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const audio = audioElRef.current;
    if (!audio) return;
    audio.muted = muted;
    if (!muted) {
      ensureAudioGraph();
      void audioContextRef.current?.resume().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  function ensureAudioGraph() {
    const audio = audioElRef.current;
    if (!audio || audioContextRef.current) return;
    try {
      const context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyser.connect(context.destination);
      audioContextRef.current = context;
      analyserRef.current = analyser;
    } catch {
      // Audio graph is an enhancement (reactive waveform); playback works
      // without it.
    }
  }

  function togglePlay() {
    const audio = audioElRef.current;
    if (!audio) return;
    if (audio.paused) {
      ensureAudioGraph();
      void audioContextRef.current?.resume().catch(() => undefined);
      if (
        audio.currentTime < windowStartRef.current ||
        audio.currentTime >= windowEndRef.current
      ) {
        audio.currentTime = windowStartRef.current;
      }
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }

  return (
    <div className={`composition-live-preview ${className ?? ""}`}>
      <canvas ref={canvasRef} />
      <audio preload="metadata" ref={audioElRef} src={audioSrc} />
      <div className="live-preview-controls">
        <button
          aria-label={playing ? "Pausar prévia" : "Tocar prévia"}
          type="button"
          onClick={togglePlay}
        >
          {playing ? <Pause /> : <Play />}
        </button>
        <input
          aria-label="Posição da prévia do clipe"
          max={Math.round(windowLength * 10) / 10}
          min={0}
          step={0.1}
          type="range"
          value={Math.min(position, windowLength)}
          onChange={(event) => {
            const audio = audioElRef.current;
            const next = Number(event.target.value);
            setPosition(next);
            if (audio) audio.currentTime = windowStartRef.current + next;
          }}
        />
        <span>
          {formatDuration(windowStart + Math.min(position, windowLength))}
        </span>
      </div>
    </div>
  );
}

function formatDuration(seconds?: number | null) {
  if (!Number.isFinite(seconds)) return "--:--";
  const safe = Number(seconds);
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}
