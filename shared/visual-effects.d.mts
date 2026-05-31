export type WaveformType =
  | "mirror-line"
  | "single-line"
  | "filled-ribbon"
  | "spectrum-bars"
  | "radial-ring";

export type WaveformV2 = {
  schemaVersion: 2;
  visible: boolean;
  type: WaveformType;
  opacity: number;
  height: number;
  position: number;
  width: number;
  color: string;
  thickness: number;
  smoothing: number;
  audioReaction: number;
  advanced: {
    fillOpacity: number;
    barGap: number;
    barRadius: number;
    radialRadius: number;
    radialArc: number;
    radialRotation: number;
  };
};

export type WaveformV1 = WaveformV2;

export type VisualControl = {
  key: string;
  label: string;
  min: number;
  max: number;
  unit: string;
};

export type ScenePresetV3 = {
  schemaVersion: 3;
  id: string;
  name: string;
  rendererId:
    | "liquid-mesh"
    | "volumetric-clouds"
    | "aurora-ribbons"
    | "vector-aura"
    | "vinyl"
    | "audio-dark";
  source: "builtin" | "custom";
  category: string;
  note: string;
  colors: { base: string; effect: string; light: string };
  common: Record<string, number>;
  advanced: Record<string, number>;
  controls: VisualControl[];
  waveform: WaveformV2;
};

export const VISUAL_SCHEMA_VERSION: number;
export const builtinVisualPresets: ScenePresetV3[];
export const effectIds: string[];
export const removedEffectIds: string[];
export function getBuiltinPreset(id: string): ScenePresetV3;
export function normalizeVisualSettings(input?: unknown): ScenePresetV3;
export function visualUniforms(settings?: unknown): {
  rendererId: ScenePresetV3["rendererId"];
  common: Record<string, number>;
  colors: { base: string; effect: string; light: string };
  advanced: number[];
  waveform: WaveformV2;
};
