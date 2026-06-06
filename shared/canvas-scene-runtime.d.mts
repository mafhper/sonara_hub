import type { ScenePresetV3 } from "./visual-effects.mjs";

export type RuntimeMediaLayer = {
  id: string;
  kind: "image" | "svg" | "video";
  src?: string;
  element?: HTMLImageElement | HTMLVideoElement | null;
  visible: boolean;
  opacity: number;
  scale: number;
  x: number;
  y: number;
  rotation: number;
  blur?: number;
  maskOpacity?: number;
  shadow: { opacity: number; blur: number; x: number; y: number };
  coverFadeOut?: {
    enabled: boolean;
    mode?: "tail" | "timed";
    endPercent: number;
    startPercent?: number;
    durationSeconds?: number;
  };
  fit: "cover" | "contain";
  blendMode: "normal" | "screen" | "multiply" | "overlay";
  loop: boolean;
  order: number;
};

export type SceneComposition = {
  layers?: RuntimeMediaLayer[];
  coverSrc?: string;
  coverElement?: HTMLImageElement | null;
  metadata?: {
    title?: string;
    artist?: string;
    album?: string;
    year?: string;
    version?: string;
  };
  showMetadata?: boolean;
  textSettings?: Record<string, unknown>;
  durationSeconds?: number | null;
};

export function loadMediaElements(
  composition?: SceneComposition,
): Promise<SceneComposition>;
export function effectiveLayerOpacity(
  layer: RuntimeMediaLayer,
  time?: number,
  durationSeconds?: number | null,
): number;
export function effectiveTextOpacity(
  style: {
    opacity?: number;
    fadeOut?: {
      enabled?: boolean;
      mode?: "tail" | "timed";
      endPercent?: number;
      startPercent?: number;
      durationSeconds?: number;
    };
  },
  time?: number,
  durationSeconds?: number | null,
): number;
export function createSceneRuntime(
  canvas: HTMLCanvasElement,
  initialScene: ScenePresetV3,
  initialComposition?: SceneComposition,
): {
  render(time?: number): void;
  resize(width?: number, height?: number): void;
  setScene(scene: ScenePresetV3): void;
  setComposition(composition: SceneComposition): void;
  setAudio(audio: Record<string, number | number[]>): void;
  destroy(): void;
};
