import type { ScenePresetV5 } from "./visual-effects.mjs";

export type PaperShaderDefinition = {
  slug: string;
  rendererId: string;
  name: string;
  category: string;
  fragmentShader: string;
  presets: Array<{ name: string; params: Record<string, unknown> }>;
  performanceTier: 1 | 2 | 3;
  note: string;
  motion: "static" | "animated";
  usesImage: boolean;
};

export const paperShaderDefinitions: PaperShaderDefinition[];
export const paperShaderRendererIds: Set<string>;
export const paperShaderPresetCount: number;
export const paperShaderPresetConfigs: ScenePresetV5[];
export function isPaperShaderRenderer(rendererId?: unknown): boolean;
export function resolvePaperShaderFrame(
  scene?: Partial<ScenePresetV5>,
  audio?: Record<string, unknown>,
  time?: number,
): null | {
  fragmentShader: string;
  uniforms: Record<string, unknown>;
  time: number;
  textureColors: string[];
};
export function createPaperShaderRenderer(canvas: HTMLCanvasElement): {
  render(
    scene: Partial<ScenePresetV5>,
    audio?: Record<string, unknown>,
    time?: number,
  ): void;
  destroy(): void;
};
