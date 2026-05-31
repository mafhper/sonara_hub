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
  shadow: { opacity: number; blur: number; x: number; y: number };
  fit: "cover" | "contain";
  blendMode: "normal" | "screen" | "multiply" | "overlay";
  loop: boolean;
  order: number;
};

export type SceneComposition = {
  layers?: RuntimeMediaLayer[];
  coverSrc?: string;
  coverElement?: HTMLImageElement | null;
  metadata?: { title?: string; artist?: string };
  showMetadata?: boolean;
};

export function loadMediaElements(
  composition?: SceneComposition,
): Promise<SceneComposition>;
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
