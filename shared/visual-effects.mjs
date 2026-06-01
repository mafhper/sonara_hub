export const VISUAL_SCHEMA_VERSION = 3;

const waveformDefaults = {
  schemaVersion: 2,
  visible: false,
  type: "mirror-line",
  opacity: 42,
  height: 12,
  position: 88,
  width: 100,
  color: "#d7dce3",
  thickness: 2,
  smoothing: 72,
  audioReaction: 54,
  advanced: {
    fillOpacity: 28,
    barGap: 42,
    barRadius: 62,
    radialRadius: 32,
    radialArc: 100,
    radialRotation: 0,
  },
};

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
    id: "vinyl",
    name: "Vinil",
    category: "Composicoes",
    note: "Disco girando com arte central sobre um fundo ambiente escuro.",
    colors: { base: "#080808", effect: "#202124", light: "#b98b52" },
    common: { speed: 22, brightness: 34, direction: 0, audioReaction: 4 },
    advanced: { discSize: 78, rpm: 34, x: 50, y: 52, shadow: 62 },
    controls: [
      control("discSize", "Tamanho do disco"),
      control("rpm", "Rotação", 12, 64, " RPM"),
      control("x", "Posição horizontal"),
      control("y", "Posição vertical"),
      control("shadow", "Sombra"),
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
