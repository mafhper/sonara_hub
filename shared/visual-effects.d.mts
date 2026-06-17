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
  colorMode: "single" | "gradient" | "bands";
  secondaryColor: string;
  tertiaryColor: string;
  thickness: number;
  smoothing: number;
  audioReaction: number;
  advanced: {
    fillOpacity: number;
    barGap: number;
    barRadius: number;
    barPeakHold: number;
    barPeakDecay: number;
    radialRadius: number;
    radialArc: number;
    radialRotation: number;
    radialGlow: number;
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

export type VisualCommonControlKey =
  | "intensity"
  | "speed"
  | "brightness"
  | "direction"
  | "audioReaction"
  | "shade";

export type PlayfulContent = {
  seed: number;
  motionMode: "calm" | "soft-rhythm" | "play";
  enabled: {
    rectangles: boolean;
    letters: boolean;
    numbers: boolean;
    emojis: boolean;
  };
  collections: {
    letters: string;
    numbers: string;
    emojis: string;
  };
};

export type CloudLightSettings = {
  enabled: boolean;
  intensity: number;
  color: string;
  x: number;
  y: number;
  radius: number;
  diffusion: number;
  motion: number;
  speed: number;
  direction: number;
};

export type VisualPalette = {
  id: string;
  name: string;
  colors: { base: string; effect: string; light: string };
  common: Record<string, number>;
  advanced: Record<string, number>;
};

export type AtmosphereBlendMode =
  | "normal"
  | "screen"
  | "multiply"
  | "overlay"
  | "lighter";

export type AtmosphereLayerV1 = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: AtmosphereBlendMode;
  scene: ScenePresetV3;
};

export type AtmosphereStackPerformance = {
  activeCount: number;
  tierTotal: number;
  tierThreeCount: number;
  moderate: boolean;
  heavy: boolean;
};

export type RenderStackItem =
  | { kind: "atmosphere"; layerId?: string }
  | { kind: "sun-focus" }
  | { kind: "post" }
  | { kind: "waveform" }
  | { kind: "vinyl" }
  | { kind: "media"; layerId: string; order: number };

export type SceneRendererId =
  | "liquid-mesh"
  | "volumetric-clouds"
  | "aurora-ribbons"
  | "vector-aura"
  | "playful-shapes"
  | "color-mesh"
  | "piano-ribbons"
  | "vinyl"
  | "audio-dark"
  | "plasma"
  | "lava"
  | "lava-lamp"
  | "vortex"
  | "galaxy"
  | "starfield"
  | "iridescent-bloom"
  | "ether-birth"
  | "fluid-volume"
  | "endless-shallows"
  | "storybook-dream"
  | "liquid-chrome"
  | "stratosphere-flight"
  | "shambhala-passage"
  | "neural-haze"
  | "light-trails"
  | "holo-topography"
  | "fractal-sphere"
  | "fluid-flow"
  | "terrain-magic"
  | "terrain-flight";

export type VisualPostSettings = {
  bloom: number;
  vignette: number;
  grain: number;
  scanlines: number;
  chromaticAberration: number;
};

export type VisualVariant = {
  id: string;
  name: string;
  note?: string;
  paletteId?: string;
  tags: string[];
  colors?: { base: string; effect: string; light: string };
  common?: Record<string, number>;
  advanced?: Record<string, number>;
  cloudLight?: Partial<CloudLightSettings>;
};

export type ScenePresetV5 = {
  schemaVersion: 5;
  id: string;
  name: string;
  rendererId: SceneRendererId;
  source: "builtin" | "custom";
  category: string;
  categoryId: string;
  family: string;
  tags: string[];
  variants: VisualVariant[];
  performanceTier: 1 | 2 | 3;
  post: VisualPostSettings;
  appliedVariantId?: string;
  note: string;
  colors: { base: string; effect: string; light: string };
  palettes: VisualPalette[];
  common: Record<string, number>;
  supportsCommon: VisualCommonControlKey[];
  advanced: Record<string, number>;
  controls: VisualControl[];
  waveform: WaveformV2;
  playful?: PlayfulContent;
  cloudLight?: CloudLightSettings;
  atmosphereLayers?: AtmosphereLayerV1[];
  renderOrder?: RenderStackItem[];
};

export type ScenePresetV4 = Omit<ScenePresetV5, "schemaVersion"> & {
  schemaVersion: 4 | 5;
};

export type ScenePresetV3 = ScenePresetV4;

export const VISUAL_SCHEMA_VERSION: number;
export const ATMOSPHERE_BASE_LAYER_ID: string;
export const ATMOSPHERE_EXTRA_LAYER_ID: string;
export const visualPostDefaults: VisualPostSettings;
export const visualCommonControlKeys: VisualCommonControlKey[];
export const builtinVisualPresets: ScenePresetV5[];
export const effectIds: string[];
export const removedEffectIds: string[];
export function getBuiltinPreset(id: string): ScenePresetV5;
export function normalizeVisualPresetList(input?: unknown): ScenePresetV5[];
export function normalizeVisualSettings(input?: unknown): ScenePresetV5;
export function normalizeAtmosphereLayers(
  input: unknown,
  baseScene?: unknown,
): AtmosphereLayerV1[];
export function resolveAtmosphereLayers(input?: unknown): AtmosphereLayerV1[];
export function atmosphereLayerIdFromStackItem(item?: RenderStackItem): string;
export function normalizeAtmosphereBlendMode(
  input: unknown,
): AtmosphereBlendMode;
export function atmosphereStackPerformance(
  input?: unknown,
): AtmosphereStackPerformance;
export function parseVisualCollection(
  value: unknown,
  fallback?: string,
): string[];
export function visualUniforms(settings?: unknown): {
  rendererId: ScenePresetV5["rendererId"];
  common: Record<string, number>;
  colors: { base: string; effect: string; light: string };
  advanced: number[];
  waveform: WaveformV2;
  cloudLight?: CloudLightSettings;
};
