export const VISUAL_SCHEMA_VERSION = 4;

const playfulCollectionDefaults = {
  letters: "A B C D E",
  numbers: "1 2 3 4 5",
  emojis: "☀️ 🎈 🌱 ⭐ 🎵",
};

const playfulDefaults = {
  seed: 37,
  motionMode: "soft-rhythm",
  enabled: {
    rectangles: true,
    letters: true,
    numbers: true,
    emojis: true,
  },
  collections: playfulCollectionDefaults,
};

const cloudLightDefaults = {
  enabled: false,
  intensity: 54,
  color: "#f8dca6",
  x: 28,
  y: 24,
  radius: 32,
  diffusion: 68,
  motion: 0,
  speed: 36,
  direction: 18,
};

const waveformDefaults = {
  schemaVersion: 2,
  visible: false,
  type: "mirror-line",
  opacity: 42,
  height: 12,
  position: 88,
  width: 100,
  color: "#d7dce3",
  colorMode: "single",
  secondaryColor: "#8fb4ff",
  tertiaryColor: "#ffcf7a",
  thickness: 2,
  smoothing: 72,
  audioReaction: 54,
  advanced: {
    fillOpacity: 28,
    barGap: 42,
    barRadius: 62,
    barPeakHold: 24,
    barPeakDecay: 56,
    radialRadius: 32,
    radialArc: 100,
    radialRotation: 0,
    radialGlow: 24,
  },
};

const waveformColorModes = new Set(["single", "gradient", "bands"]);

const waveformTypes = new Set([
  "mirror-line",
  "single-line",
  "filled-ribbon",
  "spectrum-bars",
  "radial-ring",
]);

const commonDefaults = {
  intensity: 54,
  speed: 28,
  brightness: 48,
  direction: 18,
  audioReaction: 18,
  shade: 18,
};

const control = (key, label, min = 0, max = 100, unit = "%") => ({
  key,
  label,
  min,
  max,
  unit,
});

function preset({
  id,
  rendererId = id,
  name,
  category,
  note,
  colors,
  common = {},
  advanced,
  controls,
  playful,
  cloudLight,
}) {
  return {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    id,
    name,
    rendererId,
    source: "builtin",
    category,
    note,
    colors,
    common: { ...commonDefaults, ...common },
    advanced,
    controls,
    waveform: { ...waveformDefaults },
    ...(playful ? { playful: normalizePlayfulContent(playful) } : {}),
    ...(cloudLight ? { cloudLight: normalizeCloudLight(cloudLight) } : {}),
  };
}

export const builtinVisualPresets = [
  preset({
    id: "liquid-mesh",
    name: "Fluxo líquido",
    category: "Superficies",
    note: "Reflexos amplos e lentos com profundidade de superficie.",
    colors: { base: "#101824", effect: "#536b86", light: "#d8c6ae" },
    common: { speed: 24, brightness: 46, direction: 132, audioReaction: 18 },
    advanced: { scale: 48, warp: 42, depth: 64, highlight: 42, flow: 36 },
    controls: [
      control("scale", "Escala"),
      control("warp", "Dobra"),
      control("depth", "Profundidade"),
      control("highlight", "Reflexo"),
      control("flow", "Fluxo"),
    ],
  }),
  preset({
    id: "volumetric-clouds",
    name: "Nuvens amplas",
    category: "Atmosferas",
    note: "Massas difusas e reconheciveis com deriva cinematografica.",
    colors: { base: "#162631", effect: "#bdc7c8", light: "#e2c99b" },
    common: { speed: 16, brightness: 52, direction: 16, audioReaction: 12 },
    advanced: { coverage: 58, scale: 44, softness: 78, light: 44, drift: 22 },
    cloudLight: cloudLightDefaults,
    controls: [
      control("coverage", "Cobertura"),
      control("scale", "Escala"),
      control("softness", "Maciez"),
      control("light", "Luz difusa"),
      control("drift", "Deriva"),
    ],
  }),
  preset({
    id: "aurora-ribbons",
    name: "Aurora",
    category: "Atmosferas",
    note: "Faixas largas e silenciosas com iluminacao organica.",
    colors: { base: "#081522", effect: "#176d68", light: "#9bd38b" },
    common: { speed: 16, brightness: 42, direction: 8, audioReaction: 22 },
    advanced: { ribbons: 52, wave: 44, spread: 62, height: 56, glow: 48 },
    controls: [
      control("ribbons", "Faixas"),
      control("wave", "Ondulacao"),
      control("spread", "Espalhamento"),
      control("height", "Altura"),
      control("glow", "Brilho"),
    ],
  }),
  preset({
    id: "vector-aura",
    name: "Aura vetorial",
    category: "Superficies",
    note: "Formas largas e desfocadas inspiradas em composicoes vetoriais.",
    colors: { base: "#15151c", effect: "#696180", light: "#b3c0cd" },
    common: { speed: 18, brightness: 44, direction: 138, audioReaction: 16 },
    advanced: { shapes: 58, scale: 62, blur: 74, drift: 34, glow: 36 },
    controls: [
      control("shapes", "Presença"),
      control("scale", "Escala"),
      control("blur", "Desfoque"),
      control("drift", "Deriva"),
      control("glow", "Luz"),
    ],
  }),
  preset({
    id: "playful-shapes",
    name: "Formas lúdicas",
    category: "Infantil",
    note: "Formas amplas e coloridas com movimento curado para canções infantis.",
    colors: { base: "#73b5c8", effect: "#ef8b7f", light: "#f4c85d" },
    common: {
      intensity: 58,
      speed: 22,
      brightness: 66,
      direction: 318,
      audioReaction: 22,
      shade: 4,
    },
    advanced: {
      quantity: 48,
      randomness: 56,
      depth: 54,
      diversity: 72,
      scale: 56,
      rotation: 42,
      drift: 38,
    },
    controls: [
      control("quantity", "Quantidade"),
      control("randomness", "Aleatoriedade"),
      control("depth", "Profundidade"),
      control("diversity", "Diversidade"),
      control("scale", "Escala"),
      control("rotation", "Giro"),
      control("drift", "Deriva"),
    ],
    playful: playfulDefaults,
  }),
  preset({
    id: "color-mesh",
    name: "Mesh colorido",
    category: "Infantil",
    note: "Campos cromáticos amplos com gradientes suaves e profundidade leve.",
    colors: { base: "#73b7d1", effect: "#e891a6", light: "#f4d676" },
    common: {
      speed: 18,
      brightness: 64,
      direction: 126,
      audioReaction: 14,
      shade: 2,
    },
    advanced: {
      scale: 48,
      warp: 46,
      depth: 62,
      colorSpread: 68,
      drift: 34,
      softness: 74,
    },
    controls: [
      control("scale", "Escala"),
      control("warp", "Dobra"),
      control("depth", "Profundidade"),
      control("colorSpread", "Dispersão cromática"),
      control("drift", "Deriva"),
      control("softness", "Maciez"),
    ],
  }),
  preset({
    id: "piano-ribbons",
    name: "Faixas de piano",
    category: "Infantil",
    note: "Faixas largas e musicais com balanço suave e cores alegres.",
    colors: { base: "#17314f", effect: "#e77f88", light: "#f4ce64" },
    common: {
      speed: 24,
      brightness: 62,
      direction: 8,
      audioReaction: 28,
      shade: 8,
    },
    advanced: {
      bands: 54,
      bandWidth: 58,
      gap: 26,
      curvature: 46,
      depth: 54,
      drift: 34,
    },
    controls: [
      control("bands", "Faixas"),
      control("bandWidth", "Largura"),
      control("gap", "Separação"),
      control("curvature", "Curvatura"),
      control("depth", "Profundidade"),
      control("drift", "Deriva"),
    ],
  }),
  preset({
    id: "vinyl",
    name: "Vinil",
    category: "Composicoes",
    note: "Disco girando com arte central sobre um fundo ambiente escuro.",
    colors: { base: "#080808", effect: "#202124", light: "#b98b52" },
    common: { speed: 22, brightness: 34, direction: 0, audioReaction: 4 },
    advanced: { discSize: 78, rpm: 34, x: 50, y: 52, shadow: 62, reaction: 28 },
    controls: [
      control("discSize", "Tamanho do disco"),
      control("rpm", "Rotação", 12, 64, " RPM"),
      control("x", "Posição horizontal"),
      control("y", "Posição vertical"),
      control("shadow", "Sombra"),
      control("reaction", "Pulso da música"),
    ],
  }),
  preset({
    id: "audio-dark",
    name: "Tela escura",
    category: "Minimalista",
    note: "Plano quase preto com respiracao luminosa minima.",
    colors: { base: "#030404", effect: "#111719", light: "#26363a" },
    common: {
      intensity: 14,
      speed: 8,
      brightness: 15,
      direction: 0,
      audioReaction: 12,
      shade: 54,
    },
    advanced: { darkness: 86, pulse: 16, vignette: 74, drift: 10 },
    controls: [
      control("darkness", "Escuridao"),
      control("pulse", "Respiração"),
      control("vignette", "Vinheta"),
      control("drift", "Deriva"),
    ],
  }),
];

export const builtinPresetMap = new Map(
  builtinVisualPresets.map((item) => [item.id, item]),
);
export const effectIds = builtinVisualPresets.map((item) => item.id);
export const removedEffectIds = [
  "clouds",
  "fire",
  "space",
  "blues",
  "whisky",
  "fog",
  "rain-window",
  "aurora",
  "embers",
];

export function getBuiltinPreset(id) {
  return builtinPresetMap.get(id) ?? builtinVisualPresets[0];
}

export function normalizeVisualSettings(input = {}) {
  const source =
    typeof input.visualSettings === "string"
      ? parseJson(input.visualSettings)
      : input.visualSettings && typeof input.visualSettings === "object"
        ? input.visualSettings
        : input;
  const requestedId = String(
    source.rendererId ?? source.baseEffectId ?? source.effect ?? "liquid-mesh",
  );
  const base = getBuiltinPreset(requestedId);
  const incomingCommon = source.common ?? source;
  const incomingColors = source.colors ?? {};
  const incomingAdvanced = source.advanced ?? {};
  const incomingWaveform = source.waveform ?? {};
  const incomingWaveformAdvanced = incomingWaveform.advanced ?? {};

  return {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    id: String(source.id ?? base.id),
    name: String(source.name ?? base.name),
    rendererId: base.rendererId,
    source: source.source === "custom" ? "custom" : "builtin",
    category: String(source.category ?? base.category),
    note: String(source.note ?? base.note),
    colors: {
      base: hex(incomingColors.base ?? source.colorA, base.colors.base),
      effect: hex(incomingColors.effect ?? source.colorB, base.colors.effect),
      light: hex(incomingColors.light ?? source.accentColor, base.colors.light),
    },
    common: {
      intensity: number(incomingCommon.intensity, base.common.intensity),
      speed: number(incomingCommon.speed, base.common.speed),
      brightness: number(incomingCommon.brightness, base.common.brightness),
      direction: number(
        incomingCommon.direction,
        base.common.direction,
        0,
        360,
      ),
      audioReaction: number(
        incomingCommon.audioReaction,
        base.common.audioReaction,
      ),
      shade: number(incomingCommon.shade, base.common.shade),
    },
    advanced: Object.fromEntries(
      Object.entries(base.advanced).map(([key, fallback]) => [
        key,
        number(incomingAdvanced[key], fallback),
      ]),
    ),
    controls: base.controls,
    waveform: {
      schemaVersion: 2,
      visible: boolean(incomingWaveform.visible, base.waveform.visible),
      type: waveformTypes.has(incomingWaveform.type)
        ? incomingWaveform.type
        : "mirror-line",
      opacity: number(incomingWaveform.opacity, base.waveform.opacity),
      height: number(incomingWaveform.height, base.waveform.height),
      position: number(incomingWaveform.position, base.waveform.position),
      width: number(incomingWaveform.width, base.waveform.width),
      color: hex(incomingWaveform.color, base.waveform.color),
      colorMode: waveformColorModes.has(incomingWaveform.colorMode)
        ? incomingWaveform.colorMode
        : base.waveform.colorMode,
      secondaryColor: hex(
        incomingWaveform.secondaryColor,
        base.waveform.secondaryColor,
      ),
      tertiaryColor: hex(
        incomingWaveform.tertiaryColor,
        base.waveform.tertiaryColor,
      ),
      thickness: number(
        incomingWaveform.thickness,
        base.waveform.thickness,
        1,
        6,
      ),
      smoothing: number(incomingWaveform.smoothing, base.waveform.smoothing),
      audioReaction: number(
        incomingWaveform.audioReaction,
        base.waveform.audioReaction,
      ),
      advanced: Object.fromEntries(
        Object.entries(base.waveform.advanced).map(([key, fallback]) => [
          key,
          number(incomingWaveformAdvanced[key], fallback),
        ]),
      ),
    },
    ...(base.playful || source.playful
      ? {
          playful: normalizePlayfulContent(
            source.playful,
            base.playful ?? playfulDefaults,
          ),
        }
      : {}),
    ...(base.cloudLight || source.cloudLight
      ? {
          cloudLight: normalizeCloudLight(
            source.cloudLight,
            base.cloudLight ?? cloudLightDefaults,
          ),
        }
      : {}),
  };
}

export function visualUniforms(settings) {
  const visual = normalizeVisualSettings(settings);
  const values = visual.controls.map(({ key }) => visual.advanced[key] / 100);
  return {
    rendererId: visual.rendererId,
    common: {
      intensity: visual.common.intensity / 100,
      speed: visual.common.speed / 100,
      brightness: visual.common.brightness / 100,
      direction: visual.common.direction,
      audioReaction: visual.common.audioReaction / 100,
      shade: visual.common.shade / 100,
    },
    colors: visual.colors,
    advanced: Array.from({ length: 6 }, (_, index) => values[index] ?? 0),
    waveform: visual.waveform,
    cloudLight: visual.cloudLight,
  };
}

export function parseVisualCollection(value, fallback = "") {
  const items = String(value ?? "")
    .split(/[\s,;]+/u)
    .map((item) => Array.from(item).slice(0, 8).join(""))
    .filter(Boolean);
  const unique = [...new Set(items)].slice(0, 12);
  if (unique.length) return unique;
  if (fallback && fallback !== value) return parseVisualCollection(fallback);
  return [];
}

function normalizePlayfulContent(value = {}, fallback = playfulDefaults) {
  const enabled = {
    rectangles: boolean(value.enabled?.rectangles, fallback.enabled.rectangles),
    letters: boolean(value.enabled?.letters, fallback.enabled.letters),
    numbers: boolean(value.enabled?.numbers, fallback.enabled.numbers),
    emojis: boolean(value.enabled?.emojis, fallback.enabled.emojis),
  };
  if (!Object.values(enabled).some(Boolean)) enabled.rectangles = true;
  return {
    seed: number(value.seed, fallback.seed, 0, 999999),
    motionMode: ["calm", "soft-rhythm", "play"].includes(value.motionMode)
      ? value.motionMode
      : fallback.motionMode,
    enabled,
    collections: {
      letters: parseVisualCollection(
        value.collections?.letters,
        playfulCollectionDefaults.letters,
      ).join(" "),
      numbers: parseVisualCollection(
        value.collections?.numbers,
        playfulCollectionDefaults.numbers,
      ).join(" "),
      emojis: parseVisualCollection(
        value.collections?.emojis,
        playfulCollectionDefaults.emojis,
      ).join(" "),
    },
  };
}

function normalizeCloudLight(value = {}, fallback = cloudLightDefaults) {
  return {
    enabled: boolean(value.enabled, fallback.enabled),
    intensity: number(value.intensity, fallback.intensity),
    color: hex(value.color, fallback.color),
    x: number(value.x, fallback.x),
    y: number(value.y, fallback.y),
    radius: number(value.radius, fallback.radius, 8, 72),
    diffusion: number(value.diffusion, fallback.diffusion),
    motion: number(value.motion, fallback.motion),
    speed: number(value.speed, fallback.speed),
    direction: number(value.direction, fallback.direction, 0, 360),
  };
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function hex(value, fallback) {
  const result = String(value ?? "");
  return /^#[0-9a-f]{6}$/i.test(result) ? result : fallback;
}

function number(value, fallback, min = 0, max = 100) {
  const result = Number(value);
  return Number.isFinite(result)
    ? Math.min(max, Math.max(min, result))
    : fallback;
}

function boolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return String(value) === "true";
}
