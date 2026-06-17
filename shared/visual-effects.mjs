export const VISUAL_SCHEMA_VERSION = 5;
export const ATMOSPHERE_BASE_LAYER_ID = "atmosphere-base";
export const ATMOSPHERE_EXTRA_LAYER_ID = "atmosphere-2";

const atmosphereBlendModes = new Set([
  "normal",
  "screen",
  "multiply",
  "overlay",
  "lighter",
]);

export const visualPostDefaults = {
  bloom: 0,
  vignette: 0,
  grain: 0,
  scanlines: 0,
  chromaticAberration: 0,
};

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
export const visualCommonControlKeys = [
  "intensity",
  "speed",
  "brightness",
  "direction",
  "audioReaction",
  "shade",
];
const visualCommonControlKeySet = new Set(visualCommonControlKeys);
const commonSupportsByRenderer = new Map([
  [
    "liquid-mesh",
    ["speed", "brightness", "direction", "audioReaction", "shade"],
  ],
  ["volumetric-clouds", visualCommonControlKeys],
  [
    "aurora-ribbons",
    ["speed", "brightness", "direction", "audioReaction", "shade"],
  ],
  [
    "color-mesh",
    ["speed", "brightness", "direction", "audioReaction", "shade"],
  ],
  ["plasma", ["intensity", "speed", "brightness", "audioReaction", "shade"]],
  ["lava", ["intensity", "speed", "brightness", "audioReaction", "shade"]],
  ["lava-lamp", ["intensity", "speed", "brightness", "audioReaction", "shade"]],
  ["vortex", ["intensity", "speed", "brightness", "audioReaction", "shade"]],
  ["galaxy", ["intensity", "speed", "brightness", "audioReaction", "shade"]],
  ["starfield", ["speed", "brightness", "audioReaction", "shade"]],
  ["vector-aura", ["speed", "direction", "audioReaction", "shade"]],
  ["playful-shapes", ["speed", "direction", "audioReaction", "shade"]],
  ["piano-ribbons", ["speed", "direction", "audioReaction", "shade"]],
  ["vinyl", ["speed", "shade"]],
  ["audio-dark", ["speed", "shade"]],
  // V5 Lote 1 (etéreo × CodePen)
  [
    "iridescent-bloom",
    ["speed", "brightness", "direction", "audioReaction", "shade"],
  ],
  ["ether-birth", ["speed", "brightness", "audioReaction", "shade"]],
  [
    "fluid-volume",
    ["speed", "brightness", "direction", "audioReaction", "shade"],
  ],
  [
    "endless-shallows",
    ["speed", "brightness", "direction", "audioReaction", "shade"],
  ],
  ["storybook-dream", ["speed", "brightness", "audioReaction", "shade"]],
  [
    "liquid-chrome",
    ["speed", "brightness", "direction", "audioReaction", "shade"],
  ],
  [
    "stratosphere-flight",
    ["speed", "brightness", "direction", "audioReaction", "shade"],
  ],
  ["shambhala-passage", ["speed", "brightness", "audioReaction", "shade"]],
  [
    "neural-haze",
    ["speed", "brightness", "direction", "audioReaction", "shade"],
  ],
  [
    "light-trails",
    ["speed", "brightness", "direction", "audioReaction", "shade"],
  ],
  // V6 Lote 2 (CodePen × Sabosugi)
  [
    "holo-topography",
    ["intensity", "speed", "brightness", "audioReaction", "shade"],
  ],
  ["fractal-sphere", ["speed", "brightness", "audioReaction", "shade"]],
  ["fluid-flow", ["speed", "brightness", "audioReaction", "shade"]],
  ["terrain-magic", ["speed", "brightness", "audioReaction", "shade"]],
  ["terrain-flight", ["speed", "brightness", "audioReaction", "shade"]],
]);

const visualCategoryIdsByLabel = new Map([
  ["Atmosferas", "atmospheres"],
  ["Composicoes", "compositions"],
  ["Espaço", "space"],
  ["Fluidos", "fluids"],
  ["Infantil", "playful"],
  ["Lava", "lava"],
  ["Luz & Gradiente", "light-gradient"],
  ["Minimalista", "minimal"],
  ["Paisagem", "landscape"],
  ["Superficies", "surfaces"],
]);

const paletteProfiles = [
  { id: "original", name: "Original" },
  {
    id: "deep",
    name: "Profunda",
    base: { hue: -10, saturation: 10, lightness: -12 },
    effect: { hue: -18, saturation: 14, lightness: -4 },
    light: { hue: -6, saturation: 8, lightness: 6 },
    common: { intensity: 4, speed: -4, brightness: -6, audioReaction: 2 },
    advanced: [6, -4, 8, 7, -2, 4],
  },
  {
    id: "warm",
    name: "Quente",
    base: { hue: 24, saturation: 8, lightness: -6 },
    effect: { hue: 34, saturation: 16, lightness: 2 },
    light: { hue: 22, saturation: 12, lightness: 8 },
    common: { intensity: 2, speed: -2, brightness: 4, audioReaction: -1 },
    advanced: [-4, 5, -2, 6, 4, -3],
  },
  {
    id: "prism",
    name: "Prisma",
    base: { hue: 56, saturation: 18, lightness: -8 },
    effect: { hue: 124, saturation: 20, lightness: 5 },
    light: { hue: -86, saturation: 18, lightness: 10 },
    common: { intensity: 6, speed: 3, brightness: 3, audioReaction: 6 },
    advanced: [8, 6, 10, 8, 12, 6],
  },
];

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
  categoryId,
  family,
  tags,
  variants,
  performanceTier,
  post,
  appliedVariantId,
  note,
  colors,
  common = {},
  advanced,
  controls,
  supportsCommon,
  playful,
  cloudLight,
  palettes,
}) {
  const normalizedCommon = { ...commonDefaults, ...common };
  const normalizedPalettes = normalizePalettes(
    palettes,
    [],
    colors,
    normalizedCommon,
    advanced,
  );
  return {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    id,
    name,
    rendererId,
    source: "builtin",
    category,
    categoryId: normalizeCategoryId(categoryId, category),
    family: normalizeIdentifier(family, rendererId),
    tags: normalizeTags(tags),
    variants: normalizeVariants(variants),
    performanceTier: normalizePerformanceTier(performanceTier),
    post: normalizePost(post),
    ...(normalizeIdentifier(appliedVariantId, "")
      ? { appliedVariantId: normalizeIdentifier(appliedVariantId, "") }
      : {}),
    note,
    colors,
    palettes: normalizedPalettes,
    common: normalizedCommon,
    supportsCommon: normalizeSupportsCommon(supportsCommon, rendererId),
    advanced,
    controls,
    waveform: { ...waveformDefaults },
    ...(playful ? { playful: normalizePlayfulContent(playful) } : {}),
    // Every preset carries an optional light focus (disabled by default) so the
    // "Foco solar" control is available across atmospheres, not just clouds.
    cloudLight: normalizeCloudLight(cloudLight ?? cloudLightDefaults),
  };
}

const volumetricCloudControls = [
  control("coverage", "Cobertura"),
  control("scale", "Escala"),
  control("softness", "Maciez"),
  control("light", "Luz difusa"),
  control("drift", "Deriva"),
];

function broadCloudPreset({
  id,
  name,
  note,
  colors,
  common,
  advanced,
  cloudLight = cloudLightDefaults,
  variants,
}) {
  return preset({
    id,
    rendererId: "volumetric-clouds",
    name,
    category: "Atmosferas",
    note,
    colors,
    common,
    advanced,
    cloudLight: { ...cloudLightDefaults, ...cloudLight },
    variants,
    controls: volumetricCloudControls,
  });
}

const cloudTimelineVariants = [
  {
    id: "dawn",
    name: "Amanhecer",
    note: "Ceu frio abrindo em rosa quente, com nuvens largas e luz baixa.",
    colors: { base: "#1a3140", effect: "#f2b8a0", light: "#ffe3b0" },
    common: {
      speed: 14,
      brightness: 56,
      direction: 24,
      audioReaction: 10,
      shade: 14,
    },
    advanced: { coverage: 54, scale: 48, softness: 84, light: 54, drift: 18 },
    cloudLight: {
      enabled: true,
      intensity: 46,
      color: "#ffd8a6",
      x: 24,
      y: 28,
      radius: 34,
      diffusion: 78,
      motion: 8,
      speed: 24,
      direction: 16,
    },
  },
  {
    id: "noon",
    name: "Meio-dia",
    note: "Azul aberto, nuvens claras e sol alto para uma atmosfera mais limpa.",
    colors: { base: "#4f90b2", effect: "#edf7f4", light: "#fff7d6" },
    common: {
      speed: 12,
      brightness: 70,
      direction: 8,
      audioReaction: 8,
      shade: 4,
    },
    advanced: { coverage: 46, scale: 42, softness: 72, light: 66, drift: 14 },
    cloudLight: {
      enabled: true,
      intensity: 42,
      color: "#fff4c6",
      x: 50,
      y: 18,
      radius: 28,
      diffusion: 64,
      motion: 4,
      speed: 18,
      direction: 8,
    },
  },
  {
    id: "sunset",
    name: "Entardecer",
    note: "Horizonte quente com nuvens densas e brilho lateral cinematografico.",
    colors: { base: "#2d2034", effect: "#f09a76", light: "#ffd39a" },
    common: {
      speed: 15,
      brightness: 58,
      direction: 350,
      audioReaction: 12,
      shade: 12,
    },
    advanced: { coverage: 60, scale: 46, softness: 80, light: 58, drift: 20 },
    cloudLight: {
      enabled: true,
      intensity: 60,
      color: "#ffc081",
      x: 76,
      y: 34,
      radius: 36,
      diffusion: 76,
      motion: 10,
      speed: 20,
      direction: 350,
    },
  },
  {
    id: "dusk",
    name: "Anoitecer",
    note: "Azuis profundos com rastro quente no horizonte e deriva discreta.",
    colors: { base: "#101b35", effect: "#6f83aa", light: "#f3b58c" },
    common: {
      speed: 13,
      brightness: 44,
      direction: 338,
      audioReaction: 10,
      shade: 22,
    },
    advanced: { coverage: 62, scale: 50, softness: 86, light: 38, drift: 18 },
    cloudLight: {
      enabled: true,
      intensity: 32,
      color: "#f5aa8c",
      x: 78,
      y: 42,
      radius: 40,
      diffusion: 82,
      motion: 6,
      speed: 16,
      direction: 338,
    },
  },
  {
    id: "midnight",
    name: "Noite alta",
    note: "Nuvens frias e contidas sobre ceu quase preto, sem foco solar ativo.",
    colors: { base: "#030712", effect: "#263755", light: "#9eb8df" },
    common: {
      speed: 10,
      brightness: 34,
      direction: 326,
      audioReaction: 8,
      shade: 36,
    },
    advanced: { coverage: 64, scale: 52, softness: 90, light: 24, drift: 12 },
    cloudLight: {
      color: "#b8cdfd",
      x: 62,
      y: 22,
      radius: 30,
      diffusion: 70,
      speed: 14,
      direction: 326,
    },
  },
];

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
  broadCloudPreset({
    id: "volumetric-clouds",
    name: "Nuvens amplas",
    note: "Massas difusas e reconheciveis com deriva cinematografica.",
    colors: { base: "#162631", effect: "#bdc7c8", light: "#e2c99b" },
    common: { speed: 16, brightness: 52, direction: 16, audioReaction: 12 },
    advanced: { coverage: 58, scale: 44, softness: 78, light: 44, drift: 22 },
    variants: cloudTimelineVariants,
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
      control("glow", "Brilho das faixas"),
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
    note: "Teclado em perspectiva com linhas melódicas luminosas e resposta musical contida.",
    colors: { base: "#111827", effect: "#31577a", light: "#f4ce64" },
    common: {
      speed: 18,
      brightness: 58,
      direction: 8,
      audioReaction: 18,
      shade: 10,
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
    advanced: { discSize: 78, rpm: 34, x: 50, y: 52, shadow: 62, reaction: 12 },
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
  preset({
    id: "plasma-nebula",
    rendererId: "plasma",
    name: "Plasma nebulosa",
    category: "Espaço",
    note: "Nebulosa cósmica com manchas roxas-azuladas e brilho difuso.",
    colors: { base: "#7c3aed", effect: "#0ea5e9", light: "#f0abfc" },
    common: { speed: 22, intensity: 60, brightness: 50, audioReaction: 22 },
    advanced: { scale: 32, complexity: 60, saturation: 56, glow: 40 },
    controls: [
      control("scale", "Escala"),
      control("complexity", "Complexidade"),
      control("saturation", "Saturação"),
      control("glow", "Brilho do plasma"),
    ],
  }),
  preset({
    id: "plasma-lava",
    rendererId: "lava",
    name: "Plasma lava",
    category: "Lava",
    note: "Fluxo vulcânico com veios vermelhos, laranja e núcleo claro.",
    colors: { base: "#dc2626", effect: "#f97316", light: "#fef3c7" },
    common: { speed: 32, intensity: 72, brightness: 52, audioReaction: 26 },
    advanced: { scale: 41, complexity: 40, saturation: 67, glow: 50 },
    controls: [
      control("scale", "Escala"),
      control("complexity", "Complexidade"),
      control("saturation", "Saturação"),
      control("glow", "Brilho da lava"),
    ],
  }),
  preset({
    id: "lava-lamp",
    rendererId: "lava-lamp",
    name: "Lâmpada de lava",
    category: "Lava",
    note: "Cera quente subindo e descendo em líquido translúcido, no espírito retrô da lâmpada de lava.",
    colors: { base: "#2a1245", effect: "#f0531c", light: "#ffd24a" },
    common: { speed: 18, intensity: 60, brightness: 52, audioReaction: 20 },
    advanced: { blobs: 55, viscosity: 60, glow: 55, contrast: 45 },
    controls: [
      control("blobs", "Bolhas"),
      control("viscosity", "Viscosidade"),
      control("glow", "Brilho"),
      control("contrast", "Contraste"),
    ],
  }),
  preset({
    id: "vortex-whirlpool",
    rendererId: "vortex",
    name: "Vórtice",
    category: "Espaço",
    note: "Espiral azul profunda com centro luminoso e arrasto suave.",
    colors: { base: "#0ea5e9", effect: "#1e3a5f", light: "#7dd3fc" },
    common: { speed: 28, intensity: 62, brightness: 48, audioReaction: 24 },
    advanced: { arms: 29, twist: 29, zoom: 32, glow: 45 },
    controls: [
      control("arms", "Braços"),
      control("twist", "Torção"),
      control("zoom", "Zoom"),
      control("glow", "Brilho do núcleo"),
    ],
  }),
  preset({
    id: "vortex-galaxy",
    rendererId: "galaxy",
    name: "Galáxia espiral",
    category: "Espaço",
    note: "Núcleo galáctico com braços espirais densos e poeira cósmica.",
    colors: { base: "#ec4899", effect: "#6366f1", light: "#f0abfc" },
    common: { speed: 14, intensity: 54, brightness: 46, audioReaction: 20 },
    advanced: { arms: 57, twist: 23, zoom: 25, glow: 42 },
    controls: [
      control("arms", "Braços"),
      control("twist", "Torção"),
      control("zoom", "Zoom"),
      control("glow", "Brilho do núcleo"),
    ],
  }),
  preset({
    id: "starfield",
    rendererId: "starfield",
    name: "Campo Estelar",
    category: "Espaço",
    note: "Estrelas voando pelo espaço com profundidade, cintilação e matizes variados (portado do Nebula). Substitui o antigo efeito de estrelas.",
    colors: { base: "#05060f", effect: "#bfdbfe", light: "#67e8f9" },
    common: { speed: 22, intensity: 80, brightness: 60, audioReaction: 24 },
    advanced: { density: 60, warp: 30, twinkle: 55, glow: 50, colorVar: 32 },
    palettes: [
      {
        id: "original",
        name: "Original",
        colors: { base: "#05060f", effect: "#bfdbfe", light: "#67e8f9" },
        common: { speed: 22, intensity: 80, brightness: 60, audioReaction: 24 },
        advanced: {
          density: 60,
          warp: 30,
          twinkle: 55,
          glow: 50,
          colorVar: 32,
        },
      },
      {
        id: "prism",
        name: "Prisma",
        colors: { base: "#0a0420", effect: "#f0abfc", light: "#7dd3fc" },
        common: { speed: 20, intensity: 82, brightness: 58, audioReaction: 26 },
        advanced: {
          density: 66,
          warp: 28,
          twinkle: 62,
          glow: 56,
          colorVar: 88,
        },
      },
      {
        id: "warm",
        name: "Quente",
        colors: { base: "#0a0703", effect: "#fde68a", light: "#fff7ed" },
        common: { speed: 18, intensity: 76, brightness: 58, audioReaction: 20 },
        advanced: {
          density: 54,
          warp: 26,
          twinkle: 48,
          glow: 52,
          colorVar: 16,
        },
      },
      {
        id: "deep",
        name: "Profunda",
        colors: { base: "#020817", effect: "#7dd3fc", light: "#a78bfa" },
        common: { speed: 26, intensity: 86, brightness: 54, audioReaction: 28 },
        advanced: {
          density: 72,
          warp: 36,
          twinkle: 70,
          glow: 62,
          colorVar: 64,
        },
      },
    ],
    controls: [
      control("density", "Densidade"),
      control("warp", "Profundidade do avanço"),
      control("twinkle", "Cintilação"),
      control("glow", "Brilho das estrelas"),
      control("colorVar", "Variedade de cor"),
    ],
  }),
  // === Sonara Atmospheres V5 — Lote 1 (etéreo × CodePen) ===
  // Paletas auto-geradas (original/profunda/quente/prisma) pela factory.
  preset({
    id: "iridescent-bloom",
    name: "Bloom iridescente",
    category: "Luz & Gradiente",
    note: "Brilhos suaves com reflexo nacarado que desliza de cor; sem pontos, ideal para pop e capas vibrantes.",
    colors: { base: "#0b1026", effect: "#5b3fb0", light: "#f5b8e0" },
    common: {
      speed: 22,
      brightness: 56,
      direction: 28,
      audioReaction: 26,
      shade: 8,
    },
    advanced: {
      scale: 46,
      detail: 52,
      spread: 60,
      focus: 50,
      drift: 34,
      blend: 58,
    },
    controls: [
      control("scale", "Escala"),
      control("detail", "Detalhe"),
      control("spread", "Dispersão cromática"),
      control("focus", "Foco do brilho"),
      control("drift", "Deriva"),
      control("blend", "Iridescência"),
    ],
  }),
  preset({
    id: "ether-birth",
    name: "Nascimento etéreo",
    category: "Espaço",
    note: "Massa difusa que pulsa para fora de um núcleo brilhante; expansão pela energia da música, sem deriva lateral.",
    colors: { base: "#05060f", effect: "#3a2f6e", light: "#c9b6ff" },
    common: { speed: 18, brightness: 50, audioReaction: 34, shade: 12 },
    advanced: { scale: 44, detail: 50, swirl: 40, core: 56, glow: 48 },
    controls: [
      control("scale", "Escala"),
      control("detail", "Detalhe"),
      control("swirl", "Redemoinho"),
      control("core", "Núcleo"),
      control("glow", "Brilho"),
    ],
  }),
  preset({
    id: "fluid-volume",
    name: "Volume fluido",
    category: "Fluidos",
    note: "Volume faux-volumétrico com profundidade e advecção interna; a energia controla o movimento do fluido.",
    colors: { base: "#061a1e", effect: "#1f6f7a", light: "#bfeae0" },
    common: {
      speed: 20,
      brightness: 48,
      direction: 120,
      audioReaction: 30,
      shade: 14,
    },
    advanced: { scale: 48, detail: 54, blend: 46, glow: 44, advection: 38 },
    controls: [
      control("scale", "Escala"),
      control("detail", "Detalhe"),
      control("blend", "Mistura"),
      control("glow", "Brilho"),
      control("advection", "Advecção"),
    ],
  }),
  preset({
    id: "endless-shallows",
    name: "Águas rasas",
    category: "Fluidos",
    note: "Rede de cáusticas de luz sobre um gradiente de água; cintilação lenta puxada pelos médios.",
    colors: { base: "#08303a", effect: "#2f9fb3", light: "#d8f6ef" },
    common: {
      speed: 22,
      brightness: 54,
      direction: 36,
      audioReaction: 28,
      shade: 8,
    },
    advanced: { scale: 42, warp: 48, filament: 52, glow: 50, drift: 30 },
    controls: [
      control("scale", "Escala"),
      control("warp", "Distorção"),
      control("filament", "Filamentos"),
      control("glow", "Brilho"),
      control("drift", "Deriva"),
    ],
  }),
  preset({
    id: "storybook-dream",
    name: "Sonho ilustrado",
    category: "Atmosferas",
    note: "Luz volumétrica quente com god-rays suaves e halo sobre um entardecer de livro ilustrado.",
    colors: { base: "#2a1830", effect: "#d98a5c", light: "#ffe2b0" },
    common: { speed: 16, brightness: 58, audioReaction: 22, shade: 10 },
    advanced: {
      rays: 46,
      softness: 52,
      sunX: 50,
      halo: 48,
      warmth: 56,
      sunY: 72,
    },
    controls: [
      control("rays", "Raios"),
      control("softness", "Maciez"),
      control("sunX", "Posição horizontal do sol"),
      control("halo", "Halo"),
      control("warmth", "Calor"),
      control("sunY", "Posição vertical do sol"),
    ],
  }),
  preset({
    id: "liquid-chrome",
    name: "Cromo líquido",
    category: "Superficies",
    note: "Superfície metálica anisotrópica com reflexos especulares contínuos; graves controlam a amplitude da ondulação.",
    colors: { base: "#0c1118", effect: "#6b7686", light: "#eaf2ff" },
    common: {
      speed: 20,
      brightness: 52,
      direction: 150,
      audioReaction: 30,
      shade: 10,
    },
    advanced: { scale: 44, relief: 50, polish: 54, streak: 46, sheen: 52 },
    controls: [
      control("scale", "Escala"),
      control("relief", "Relevo"),
      control("polish", "Polimento"),
      control("streak", "Estrias"),
      control("sheen", "Brilho metálico"),
    ],
  }),
  preset({
    id: "stratosphere-flight",
    name: "Voo estratosférico",
    category: "Atmosferas",
    family: "sky-atmosphere",
    tags: ["ceu", "paralaxe", "cinematico"],
    performanceTier: 2,
    note: "Céu contínuo com nuvens altas, horizonte em avanço e trilhas discretas de luz.",
    colors: { base: "#081629", effect: "#356f9e", light: "#f6d8a2" },
    common: {
      speed: 18,
      brightness: 58,
      direction: 22,
      audioReaction: 16,
      shade: 8,
    },
    advanced: {
      altitude: 52,
      cloudScale: 48,
      horizon: 44,
      parallax: 42,
      glow: 46,
    },
    controls: [
      control("altitude", "Altitude"),
      control("cloudScale", "Escala das nuvens"),
      control("horizon", "Horizonte"),
      control("parallax", "Paralaxe"),
      control("glow", "Luz de avanço"),
    ],
  }),
  preset({
    id: "shambhala-passage",
    name: "Passagem luminosa",
    category: "Luz & Gradiente",
    family: "sacred-light",
    tags: ["portal", "simetria", "dourado"],
    performanceTier: 2,
    note: "Corredor radial quente com arcos suaves e brilho de portal, sem estrobo.",
    colors: { base: "#16101f", effect: "#7f4f2f", light: "#ffd58d" },
    common: {
      speed: 14,
      brightness: 56,
      audioReaction: 18,
      shade: 12,
    },
    advanced: {
      symmetry: 48,
      depth: 52,
      corridor: 44,
      arches: 50,
      glow: 58,
    },
    controls: [
      control("symmetry", "Simetria"),
      control("depth", "Profundidade"),
      control("corridor", "Corredor"),
      control("arches", "Arcos"),
      control("glow", "Brilho"),
    ],
  }),
  preset({
    id: "neural-haze",
    name: "Névoa neural",
    category: "Superficies",
    family: "organic-contours",
    tags: ["contorno", "organico", "calmo"],
    performanceTier: 2,
    note: "Campo orgânico de contornos luminosos que respira com fluxos de áudio sem pulsar demais.",
    colors: { base: "#091116", effect: "#28556a", light: "#a7f0d6" },
    common: {
      speed: 16,
      brightness: 50,
      direction: 126,
      audioReaction: 20,
      shade: 14,
    },
    advanced: {
      scale: 46,
      density: 54,
      contours: 48,
      glow: 42,
      drift: 36,
    },
    controls: [
      control("scale", "Escala"),
      control("density", "Densidade"),
      control("contours", "Contornos"),
      control("glow", "Brilho"),
      control("drift", "Deriva"),
    ],
  }),
  preset({
    id: "light-trails",
    name: "Trilhas de luz",
    category: "Luz & Gradiente",
    family: "light-ribbons",
    tags: ["trilhas", "movimento", "luminoso"],
    performanceTier: 2,
    note: "Faixas luminosas amplas cruzam a cena com movimento contínuo e reação discreta nos agudos.",
    colors: { base: "#080b19", effect: "#304d8a", light: "#f5b9ff" },
    common: {
      speed: 22,
      brightness: 54,
      direction: 18,
      audioReaction: 18,
      shade: 10,
    },
    advanced: {
      trails: 54,
      width: 44,
      bend: 50,
      glow: 52,
      flare: 42,
      field: 46,
    },
    controls: [
      control("trails", "Trilhas"),
      control("width", "Espessura"),
      control("bend", "Curvatura"),
      control("glow", "Brilho"),
      control("flare", "Clarão"),
      control("field", "Campo"),
    ],
  }),
  // === V6 Lote 2 — adaptados de pens públicos de Sabosugi (codepen.io/sabosugi) ===
  preset({
    id: "holo-topography",
    rendererId: "holo-topography",
    name: "Topografia holográfica",
    category: "Superficies",
    family: "holographic",
    tags: ["topografia", "holográfico", "linhas"],
    performanceTier: 2,
    note: "Linhas de contorno deformadas por polos magnéticos com bordas holográficas iridescentes.",
    colors: { base: "#6619cc", effect: "#e63380", light: "#1accff" },
    common: { speed: 30, intensity: 55, brightness: 52, audioReaction: 24 },
    advanced: {
      frequency: 45,
      thickness: 48,
      warp: 50,
      holo: 40,
      sharpness: 48,
    },
    controls: [
      control("frequency", "Frequência"),
      control("thickness", "Espessura"),
      control("warp", "Deformação"),
      control("holo", "Holografia"),
      control("sharpness", "Nitidez"),
    ],
  }),
  preset({
    id: "fractal-sphere",
    rendererId: "fractal-sphere",
    name: "Esfera fractal",
    category: "Espaço",
    family: "fractal-volume",
    tags: ["esfera", "fractal", "volume"],
    performanceTier: 3,
    note: "Esfera orgânica de luz volumétrica girando devagar, com paleta iridescente.",
    colors: { base: "#120a2e", effect: "#3aa0ff", light: "#ff5e9c" },
    common: { speed: 24, brightness: 50, audioReaction: 22 },
    advanced: { scale: 40, smoothing: 45, radius: 45, edge: 40, phase: 30 },
    controls: [
      control("scale", "Escala"),
      control("smoothing", "Suavização"),
      control("radius", "Raio"),
      control("edge", "Borda"),
      control("phase", "Fase"),
    ],
  }),
  preset({
    id: "fluid-flow",
    rendererId: "fluid-flow",
    name: "Fluxo fluido",
    category: "Fluidos",
    family: "fluid-volume",
    tags: ["fluido", "volumétrico", "fluxo"],
    performanceTier: 3,
    note: "Volume líquido torcido em fluxo contínuo, com grão óptico cinematográfico.",
    colors: { base: "#04122a", effect: "#0a6bd0", light: "#7fd0ff" },
    common: { speed: 30, brightness: 58, audioReaction: 24 },
    advanced: { depth: 50, exposure: 62, color: 40 },
    controls: [
      control("depth", "Profundidade"),
      control("exposure", "Exposição"),
      control("color", "Cor"),
    ],
  }),
  preset({
    id: "terrain-magic",
    rendererId: "terrain-magic",
    name: "Paisagem mágica",
    category: "Paisagem",
    family: "terrain",
    tags: ["terreno", "paisagem", "voo"],
    performanceTier: 3,
    note: "Voo sobre montanhas volumétricas com luz cíclica em ciano, azul e magenta.",
    colors: { base: "#0a9fbd", effect: "#00d2ff", light: "#ff0055" },
    common: { speed: 26, brightness: 50, audioReaction: 22 },
    advanced: { scale: 45, height: 45, relief: 50, light: 40 },
    controls: [
      control("scale", "Escala"),
      control("height", "Altura"),
      control("relief", "Relevo"),
      control("light", "Luz"),
    ],
  }),
  preset({
    id: "terrain-flight",
    rendererId: "terrain-flight",
    name: "Voo atmosférico",
    category: "Paisagem",
    family: "terrain",
    tags: ["voo", "névoa", "colinas"],
    performanceTier: 3,
    note: "Voo veloz sobre colinas com névoa luminosa quente e tom cinematográfico.",
    colors: { base: "#2a1206", effect: "#c8531a", light: "#ffd9a0" },
    common: { speed: 30, brightness: 54, audioReaction: 22 },
    advanced: { relief: 45, frequency: 45, detail: 45, fog: 45 },
    controls: [
      control("relief", "Relevo"),
      control("frequency", "Frequência"),
      control("detail", "Detalhe"),
      control("fog", "Névoa"),
    ],
  }),
];

export const builtinPresetMap = new Map(
  builtinVisualPresets.map((item) => [item.id, item]),
);
export const effectIds = builtinVisualPresets.map((item) => item.id);
const legacyPresetAliases = new Map([
  ["starfield-prism", { baseId: "starfield", paletteId: "prism" }],
  ["starfield-warm", { baseId: "starfield", paletteId: "warm" }],
  [
    "volumetric-clouds-dawn",
    { baseId: "volumetric-clouds", variantId: "dawn" },
  ],
  [
    "volumetric-clouds-noon",
    { baseId: "volumetric-clouds", variantId: "noon" },
  ],
  [
    "volumetric-clouds-sunset",
    { baseId: "volumetric-clouds", variantId: "sunset" },
  ],
  [
    "volumetric-clouds-dusk",
    { baseId: "volumetric-clouds", variantId: "dusk" },
  ],
  [
    "volumetric-clouds-midnight",
    { baseId: "volumetric-clouds", variantId: "midnight" },
  ],
]);
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
  "starfield-prism",
  "starfield-warm",
  "volumetric-clouds-dawn",
  "volumetric-clouds-noon",
  "volumetric-clouds-sunset",
  "volumetric-clouds-dusk",
  "volumetric-clouds-midnight",
];

export function getBuiltinPreset(id) {
  return builtinPresetMap.get(id) ?? builtinVisualPresets[0];
}

export function normalizeVisualPresetList(value = builtinVisualPresets) {
  const normalized = [];
  const seen = new Set();
  for (const item of Array.isArray(value) ? value : builtinVisualPresets) {
    const preset = normalizeVisualSettings(item);
    if (seen.has(preset.id)) continue;
    seen.add(preset.id);
    normalized.push(preset);
  }
  return normalized;
}

export function normalizeVisualSettings(input = {}) {
  const source =
    typeof input.visualSettings === "string"
      ? parseJson(input.visualSettings)
      : input.visualSettings && typeof input.visualSettings === "object"
        ? input.visualSettings
        : input;
  // Resolve the base builtin by preset id first (the map is keyed by id), then
  // fall back to a rendererId match. Shader presets share a rendererId across
  // several ids (e.g. plasma-nebula/plasma-lava → "plasma"), so resolving by
  // rendererId alone never hits the id-keyed map and silently collapsed every
  // shader scene back to liquid-mesh — dropping the renderer and its advanced
  // params on both preview and export.
  const requestedId = String(
    source.id ??
      source.rendererId ??
      source.baseEffectId ??
      source.effect ??
      "liquid-mesh",
  );
  const requestedRenderer = String(
    source.rendererId ?? source.baseEffectId ?? source.effect ?? requestedId,
  );
  const legacyAlias =
    legacyPresetAliases.get(requestedId) ??
    legacyPresetAliases.get(requestedRenderer);
  const base =
    builtinPresetMap.get(legacyAlias?.baseId ?? requestedId) ??
    builtinVisualPresets.find(
      (item) => item.rendererId === requestedRenderer,
    ) ??
    builtinVisualPresets[0];
  const requestedVariantId = normalizeIdentifier(
    source.appliedVariantId ?? legacyAlias?.variantId,
    "",
  );
  const selectedVariant = requestedVariantId
    ? base.variants.find((variant) => variant.id === requestedVariantId)
    : null;
  const aliasPalette = legacyAlias
    ? base.palettes.find((palette) => palette.id === legacyAlias.paletteId)
    : null;
  const incomingCommon =
    source.common ??
    (hasCommonFields(source)
      ? source
      : (selectedVariant?.common ?? aliasPalette?.common)) ??
    source;
  const incomingColors =
    source.colors ??
    (hasColorFields(source)
      ? {}
      : (selectedVariant?.colors ?? aliasPalette?.colors)) ??
    {};
  const incomingAdvanced =
    source.advanced ??
    selectedVariant?.advanced ??
    aliasPalette?.advanced ??
    {};
  const incomingCloudLight = source.cloudLight ?? selectedVariant?.cloudLight;
  const incomingWaveform = source.waveform ?? {};
  const incomingWaveformAdvanced = incomingWaveform.advanced ?? {};

  const visual = {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    id: source.source === "custom" && source.id ? String(source.id) : base.id,
    name:
      source.source === "custom" ? String(source.name ?? base.name) : base.name,
    rendererId: base.rendererId,
    source: source.source === "custom" ? "custom" : "builtin",
    category: String(source.category ?? base.category),
    categoryId: normalizeCategoryId(
      source.categoryId ?? base.categoryId,
      source.category ?? base.category,
    ),
    family: normalizeIdentifier(source.family ?? base.family, base.rendererId),
    tags: normalizeTags(source.tags, base.tags),
    variants: normalizeVariants(source.variants, base.variants),
    performanceTier: normalizePerformanceTier(
      source.performanceTier ?? base.performanceTier,
    ),
    post: normalizePost(source.post, base.post),
    ...(selectedVariant ||
    normalizeIdentifier(source.appliedVariantId ?? base.appliedVariantId, "")
      ? {
          appliedVariantId: normalizeIdentifier(
            selectedVariant?.id ??
              source.appliedVariantId ??
              base.appliedVariantId,
            "",
          ),
        }
      : {}),
    note: String(source.note ?? base.note),
    colors: {
      base: hex(incomingColors.base ?? source.colorA, base.colors.base),
      effect: hex(incomingColors.effect ?? source.colorB, base.colors.effect),
      light: hex(incomingColors.light ?? source.accentColor, base.colors.light),
    },
    palettes: normalizePalettes(
      source.palettes,
      base.palettes,
      base.colors,
      base.common,
      base.advanced,
    ),
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
    supportsCommon: normalizeSupportsCommon(
      base.supportsCommon,
      base.rendererId,
    ),
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
    ...(base.cloudLight || incomingCloudLight
      ? {
          cloudLight: normalizeCloudLight(
            incomingCloudLight,
            base.cloudLight ?? cloudLightDefaults,
          ),
        }
      : {}),
    ...(Array.isArray(source.renderOrder) && source.renderOrder.length > 0
      ? { renderOrder: source.renderOrder }
      : {}),
  };
  if (
    Array.isArray(source.atmosphereLayers) &&
    source.atmosphereLayers.length
  ) {
    visual.atmosphereLayers = normalizeAtmosphereLayers(
      source.atmosphereLayers,
      visual,
    );
  }
  return visual;
}

export function normalizeAtmosphereLayers(input = [], baseScene = {}) {
  const base = normalizeLayerScene(baseScene);
  const source = Array.isArray(input) ? input.slice(0, 2) : [];
  if (!source.length) return [createAtmosphereLayer({}, base, 0)];
  return source.map((item, index) =>
    createAtmosphereLayer(
      item,
      index === 0 ? base : (source[0]?.scene ?? base),
      index,
    ),
  );
}

export function resolveAtmosphereLayers(input = {}) {
  const scene = normalizeVisualSettings(input);
  return Array.isArray(scene.atmosphereLayers) && scene.atmosphereLayers.length
    ? scene.atmosphereLayers
    : [createAtmosphereLayer({}, scene, 0)];
}

export function atmosphereLayerIdFromStackItem(item = {}) {
  return item.kind === "atmosphere" && item.layerId
    ? String(item.layerId)
    : ATMOSPHERE_BASE_LAYER_ID;
}

export function normalizeAtmosphereBlendMode(input) {
  const value = String(input ?? "normal");
  return atmosphereBlendModes.has(value) ? value : "normal";
}

export function atmosphereStackPerformance(input = {}) {
  const activeLayers = resolveAtmosphereLayers(input).filter(
    (layer) => layer.visible !== false && layer.opacity > 0,
  );
  const tiers = activeLayers.map((layer) =>
    normalizePerformanceTier(layer.scene?.performanceTier ?? 1),
  );
  const tierTotal = tiers.reduce((total, tier) => total + tier, 0);
  const tierThreeCount = tiers.filter((tier) => tier >= 3).length;
  const moderate = activeLayers.length >= 2;
  const heavy = moderate && (tierThreeCount >= 2 || tierTotal >= 5);
  return {
    activeCount: activeLayers.length,
    tierTotal,
    tierThreeCount,
    moderate,
    heavy,
  };
}

function createAtmosphereLayer(item = {}, fallbackScene, index) {
  const isBase = index === 0;
  const id = isBase ? ATMOSPHERE_BASE_LAYER_ID : ATMOSPHERE_EXTRA_LAYER_ID;
  const scene = normalizeLayerScene(item?.scene ?? fallbackScene);
  return {
    id,
    name: String(item?.name || (isBase ? "Fundo visual" : "Atmosfera 2")).slice(
      0,
      80,
    ),
    visible: boolean(item?.visible, true),
    opacity: number(item?.opacity, isBase ? 100 : 55),
    blendMode: normalizeAtmosphereBlendMode(
      item?.blendMode ?? (isBase ? "normal" : "screen"),
    ),
    scene,
  };
}

function normalizeLayerScene(input = {}) {
  const source =
    input && typeof input === "object"
      ? { ...input, atmosphereLayers: undefined, renderOrder: undefined }
      : input;
  return normalizeVisualSettings(source);
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

function normalizeCategoryId(value, fallbackCategory) {
  const fallback =
    visualCategoryIdsByLabel.get(String(fallbackCategory ?? "")) ??
    normalizeIdentifier(fallbackCategory, "atmospheres");
  return normalizeIdentifier(value, fallback);
}

function normalizeIdentifier(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return String(fallback ?? "");
  }
  const normalized = slugifyPaletteId(value);
  return normalized || String(fallback ?? "");
}

function normalizeTags(value, fallback = []) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;]+/u)
      : Array.isArray(fallback)
        ? fallback
        : [];
  const tags = [];
  for (const item of source) {
    const tag = String(item ?? "").trim();
    if (!tag || tags.includes(tag)) continue;
    tags.push(tag.slice(0, 40));
    if (tags.length === 12) break;
  }
  return tags;
}

function normalizeVariants(value = [], fallback = []) {
  const source =
    Array.isArray(value) && value.length
      ? value
      : Array.isArray(fallback)
        ? fallback
        : [];
  const normalized = [];
  for (const item of source) {
    const id = normalizeIdentifier(item?.id ?? item?.variantId, "");
    if (!id || normalized.some((variant) => variant.id === id)) continue;
    normalized.push({
      id,
      name: String(item?.name ?? item?.label ?? id),
      ...(item?.note ? { note: String(item.note) } : {}),
      ...(item?.paletteId
        ? { paletteId: normalizeIdentifier(item.paletteId, "") }
        : {}),
      tags: normalizeTags(item?.tags),
      ...(item?.colors ? { colors: item.colors } : {}),
      ...(item?.common ? { common: item.common } : {}),
      ...(item?.advanced ? { advanced: item.advanced } : {}),
      ...(item?.cloudLight ? { cloudLight: item.cloudLight } : {}),
    });
  }
  return normalized;
}

function normalizePerformanceTier(value, fallback = 1) {
  return Math.round(number(value, fallback, 1, 3));
}

function normalizePost(value = {}, fallback = visualPostDefaults) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  return {
    bloom: number(source.bloom, base.bloom ?? visualPostDefaults.bloom),
    vignette: number(
      source.vignette,
      base.vignette ?? visualPostDefaults.vignette,
    ),
    grain: number(source.grain, base.grain ?? visualPostDefaults.grain),
    scanlines: number(
      source.scanlines,
      base.scanlines ?? visualPostDefaults.scanlines,
    ),
    chromaticAberration: number(
      source.chromaticAberration,
      base.chromaticAberration ?? visualPostDefaults.chromaticAberration,
    ),
  };
}

function createPaletteSet(colors, common, advanced) {
  return paletteProfiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    colors:
      profile.id === "original"
        ? normalizePaletteColors(colors, colors)
        : {
            base: adjustHex(colors.base, profile.base),
            effect: adjustHex(colors.effect, profile.effect),
            light: adjustHex(colors.light, profile.light),
          },
    common:
      profile.id === "original"
        ? normalizePaletteCommon(common, common)
        : adjustCommon(common, profile.common),
    advanced:
      profile.id === "original"
        ? normalizePaletteNumbers(advanced, advanced)
        : adjustAdvanced(advanced, profile.advanced),
  }));
}

function normalizePalettes(
  value,
  fallback = [],
  fallbackColors,
  fallbackCommon,
  fallbackAdvanced,
) {
  const generated = createPaletteSet(
    fallbackColors,
    fallbackCommon,
    fallbackAdvanced,
  );
  const source = Array.isArray(value) && value.length ? value : fallback;
  const normalized = [];
  for (const [index, item] of (Array.isArray(source) ? source : []).entries()) {
    const colors = normalizePaletteColors(item?.colors, fallbackColors);
    const common = normalizePaletteCommon(item?.common, fallbackCommon);
    const advanced = normalizePaletteNumbers(item?.advanced, fallbackAdvanced);
    const id = slugifyPaletteId(item?.id ?? item?.name ?? index);
    if (!id || normalized.some((palette) => palette.id === id)) continue;
    normalized.push({
      id,
      name: String(
        item?.name || generated[index]?.name || `Paleta ${index + 1}`,
      ),
      colors,
      common,
      advanced,
    });
    if (normalized.length === 4) break;
  }
  for (const generatedPalette of generated) {
    if (normalized.length === 4) break;
    if (normalized.some((palette) => palette.id === generatedPalette.id)) {
      continue;
    }
    normalized.push(generatedPalette);
  }
  return normalized.slice(0, 4);
}

function normalizePaletteColors(value = {}, fallback) {
  return {
    base: hex(value.base, fallback.base),
    effect: hex(value.effect, fallback.effect),
    light: hex(value.light, fallback.light),
  };
}

function normalizePaletteNumbers(value = {}, fallback = {}) {
  return Object.fromEntries(
    Object.entries(fallback).map(([key, fallbackValue]) => [
      key,
      number(value?.[key], fallbackValue),
    ]),
  );
}

function normalizePaletteCommon(value = {}, fallback = {}) {
  return Object.fromEntries(
    Object.entries(fallback).map(([key, fallbackValue]) => [
      key,
      number(value?.[key], fallbackValue, 0, key === "direction" ? 360 : 100),
    ]),
  );
}

function normalizeSupportsCommon(value, rendererId) {
  const fallback =
    commonSupportsByRenderer.get(String(rendererId)) ??
    commonSupportsByRenderer.get("liquid-mesh");
  const source = Array.isArray(value) && value.length ? value : fallback;
  const normalized = [];
  for (const key of source) {
    const stringKey = String(key);
    if (
      !visualCommonControlKeySet.has(stringKey) ||
      normalized.includes(stringKey)
    ) {
      continue;
    }
    normalized.push(stringKey);
  }
  return normalized.length ? normalized : [...fallback];
}

function adjustCommon(value = {}, patch = {}) {
  return Object.fromEntries(
    Object.entries(value).map(([key, current]) => [
      key,
      number(
        Number(current) + (patch[key] ?? 0),
        current,
        0,
        key === "direction" ? 360 : 100,
      ),
    ]),
  );
}

function adjustAdvanced(value = {}, deltas = []) {
  return Object.fromEntries(
    Object.entries(value).map(([key, current], index) => [
      key,
      number(Number(current) + (deltas[index % deltas.length] ?? 0), current),
    ]),
  );
}

function adjustHex(value, patch = {}) {
  const hsl = hexToHsl(value);
  return hslToHex(
    hsl.h + (patch.hue ?? 0),
    hsl.s + (patch.saturation ?? 0),
    hsl.l + (patch.lightness ?? 0),
  );
}

function hexToHsl(value) {
  const hexValue = hex(value, "#ffffff").slice(1);
  const r = parseInt(hexValue.slice(0, 2), 16) / 255;
  const g = parseInt(hexValue.slice(2, 4), 16) / 255;
  const b = parseInt(hexValue.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l: Math.round(lightness * 100) };
  }
  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue =
    max === r
      ? (g - b) / delta + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  hue /= 6;
  return {
    h: Math.round(hue * 360),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

function hslToHex(hue, saturation, lightness) {
  const h = (((Number(hue) || 0) % 360) + 360) % 360;
  const s = clamp(Number(saturation) || 0, 0, 100) / 100;
  const l = clamp(Number(lightness) || 0, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = h / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const [r1, g1, b1] =
    segment < 1
      ? [chroma, x, 0]
      : segment < 2
        ? [x, chroma, 0]
        : segment < 3
          ? [0, chroma, x]
          : segment < 4
            ? [0, x, chroma]
            : segment < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const m = l - chroma / 2;
  return `#${[r1, g1, b1]
    .map((channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function slugifyPaletteId(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
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

function hasCommonFields(value = {}) {
  return [
    "intensity",
    "speed",
    "brightness",
    "direction",
    "audioReaction",
    "shade",
  ].some((key) => value[key] !== undefined);
}

function hasColorFields(value = {}) {
  return ["colorA", "colorB", "accentColor"].some(
    (key) => value[key] !== undefined,
  );
}
