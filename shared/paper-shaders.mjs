import {
  colorPanelsFragmentShader,
  ditheringFragmentShader,
  DitheringShapes,
  DitheringTypes,
  dotGridFragmentShader,
  DotGridShapes,
  dotOrbitFragmentShader,
  flutedGlassFragmentShader,
  GlassDistortionShapes,
  GlassGridShapes,
  gemSmokeFragmentShader,
  GemSmokeShapes,
  getShaderColorFromString,
  godRaysFragmentShader,
  grainGradientFragmentShader,
  GrainGradientShapes,
  halftoneCmykFragmentShader,
  HalftoneCmykTypes,
  halftoneDotsFragmentShader,
  HalftoneDotsGrids,
  HalftoneDotsTypes,
  heatmapFragmentShader,
  imageDitheringFragmentShader,
  liquidMetalFragmentShader,
  LiquidMetalShapes,
  meshGradientFragmentShader,
  metaballsFragmentShader,
  neuroNoiseFragmentShader,
  paperTextureFragmentShader,
  perlinNoiseFragmentShader,
  pulsingBorderFragmentShader,
  PulsingBorderAspectRatios,
  ShaderFitOptions,
  simplexNoiseFragmentShader,
  smokeRingFragmentShader,
  spiralFragmentShader,
  staticMeshGradientFragmentShader,
  staticRadialGradientFragmentShader,
  swirlFragmentShader,
  voronoiFragmentShader,
  warpFragmentShader,
  WarpPatterns,
  waterFragmentShader,
  wavesFragmentShader,
} from "./paper-shader-sources.mjs";
import { paperShaderPresetSources } from "./paper-shader-presets.mjs";

const {
  colorPanels: colorPanelsPresets,
  dithering: ditheringPresets,
  dotGrid: dotGridPresets,
  dotOrbit: dotOrbitPresets,
  flutedGlass: flutedGlassPresets,
  gemSmoke: gemSmokePresets,
  godRays: godRaysPresets,
  grainGradient: grainGradientPresets,
  halftoneCmyk: halftoneCmykPresets,
  halftoneDots: halftoneDotsPresets,
  heatmap: heatmapPresets,
  imageDithering: imageDitheringPresets,
  liquidMetal: liquidMetalPresets,
  meshGradient: meshGradientPresets,
  metaballs: metaballsPresets,
  neuroNoise: neuroNoisePresets,
  paperTexture: paperTexturePresets,
  perlinNoise: perlinNoisePresets,
  pulsingBorder: pulsingBorderPresets,
  simplexNoise: simplexNoisePresets,
  smokeRing: smokeRingPresets,
  spiral: spiralPresets,
  staticMeshGradient: staticMeshGradientPresets,
  staticRadialGradient: staticRadialGradientPresets,
  swirl: swirlPresets,
  voronoi: voronoiPresets,
  warp: warpPresets,
  water: waterPresets,
  waves: wavesPresets,
} = paperShaderPresetSources;

const PAPER_SHADER_SOURCE = "Paper Shaders";
const PAPER_SHADER_TAGS = ["paper-design", "shader", "apache-2.0"];
// Paper Shaders Apache-2.0 vertex shader, embedded for deterministic rendering
// inside Sonara's shared preview/export runtime. Module wrapping is Sonara's.
const PAPER_VERTEX_SHADER = `#version 300 es
precision mediump float;

layout(location = 0) in vec4 a_position;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_imageAspectRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

out vec2 v_objectUV;
out vec2 v_objectBoxSize;
out vec2 v_responsiveUV;
out vec2 v_responsiveBoxGivenSize;
out vec2 v_patternUV;
out vec2 v_patternBoxSize;
out vec2 v_imageUV;

vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {
  vec2 box = vec2(0.0);
  box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);
  float noFitBoxWidth = box.x;
  if (u_fit == 1.0) {
    box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y);
  } else if (u_fit == 2.0) {
    box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y);
  }
  box.y = box.x / boxRatio;
  return vec3(box, noFitBoxWidth);
}

void main() {
  gl_Position = a_position;
  vec2 uv = gl_Position.xy * 0.5;
  vec2 boxOrigin = vec2(0.5 - u_originX, u_originY - 0.5);
  vec2 givenBoxSize = max(vec2(u_worldWidth, u_worldHeight), vec2(1.0)) * u_pixelRatio;
  float rotation = u_rotation * 3.14159265358979323846 / 180.0;
  mat2 graphicRotation = mat2(cos(rotation), sin(rotation), -sin(rotation), cos(rotation));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);

  vec2 fixedRatioBoxGivenSize = vec2(
    (u_worldWidth == 0.0) ? u_resolution.x : givenBoxSize.x,
    (u_worldHeight == 0.0) ? u_resolution.y : givenBoxSize.y
  );
  v_objectBoxSize = getBoxSize(1.0, fixedRatioBoxGivenSize).xy;
  vec2 objectWorldScale = u_resolution.xy / v_objectBoxSize;
  v_objectUV = uv * objectWorldScale;
  v_objectUV += boxOrigin * (objectWorldScale - 1.0);
  v_objectUV += graphicOffset;
  v_objectUV /= u_scale;
  v_objectUV = graphicRotation * v_objectUV;

  v_responsiveBoxGivenSize = vec2(
    (u_worldWidth == 0.0) ? u_resolution.x : givenBoxSize.x,
    (u_worldHeight == 0.0) ? u_resolution.y : givenBoxSize.y
  );
  float responsiveRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
  vec2 responsiveBoxSize = getBoxSize(responsiveRatio, v_responsiveBoxGivenSize).xy;
  vec2 responsiveBoxScale = u_resolution.xy / responsiveBoxSize;
  v_responsiveUV = uv * responsiveBoxScale;
  v_responsiveUV += boxOrigin * (responsiveBoxScale - 1.0);
  v_responsiveUV += graphicOffset;
  v_responsiveUV /= u_scale;
  v_responsiveUV.x *= responsiveRatio;
  v_responsiveUV = graphicRotation * v_responsiveUV;
  v_responsiveUV.x /= responsiveRatio;

  vec2 patternBoxGivenSize = vec2(
    (u_worldWidth == 0.0) ? u_resolution.x : givenBoxSize.x,
    (u_worldHeight == 0.0) ? u_resolution.y : givenBoxSize.y
  );
  float patternBoxRatio = patternBoxGivenSize.x / patternBoxGivenSize.y;
  vec3 boxSizeData = getBoxSize(patternBoxRatio, patternBoxGivenSize);
  v_patternBoxSize = boxSizeData.xy;
  float patternBoxNoFitBoxWidth = boxSizeData.z;
  vec2 patternBoxScale = u_resolution.xy / v_patternBoxSize;
  v_patternUV = uv;
  v_patternUV += graphicOffset / patternBoxScale;
  v_patternUV += boxOrigin;
  v_patternUV -= boxOrigin / patternBoxScale;
  v_patternUV *= u_resolution.xy;
  v_patternUV /= u_pixelRatio;
  if (u_fit > 0.0) {
    v_patternUV *= patternBoxNoFitBoxWidth / v_patternBoxSize.x;
  }
  v_patternUV /= u_scale;
  v_patternUV = graphicRotation * v_patternUV;
  v_patternUV += boxOrigin / patternBoxScale;
  v_patternUV -= boxOrigin;
  v_patternUV *= 0.01;

  vec2 imageBoxSize;
  if (u_fit == 1.0) {
    imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else if (u_fit == 2.0) {
    imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else {
    imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio);
  }
  imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;
  vec2 imageBoxScale = u_resolution.xy / imageBoxSize;
  v_imageUV = uv * imageBoxScale;
  v_imageUV += boxOrigin * (imageBoxScale - 1.0);
  v_imageUV += graphicOffset;
  v_imageUV /= u_scale;
  v_imageUV.x *= u_imageAspectRatio;
  v_imageUV = graphicRotation * v_imageUV;
  v_imageUV.x /= u_imageAspectRatio;
  v_imageUV += 0.5;
  v_imageUV.y = 1.0 - v_imageUV.y;
}
`;

const tuning = (key, label, min = 0, max = 1) => ({
  key,
  label,
  min,
  max,
});

const rawDefinitions = [
  definition(
    "mesh-gradient",
    "Gradiente em malha",
    "Luz & Gradiente",
    meshGradientFragmentShader,
    meshGradientPresets,
    2,
    "Campos de cor orgânicos que se dobram e se misturam em movimento contínuo.",
    [
      tuning("distortion", "Distorção"),
      tuning("swirl", "Redemoinho"),
      tuning("grainOverlay", "Grão"),
    ],
  ),
  definition(
    "smoke-ring",
    "Anel de fumaça",
    "Atmosferas",
    smokeRingFragmentShader,
    smokeRingPresets,
    2,
    "Volume circular de fumaça com bordas suaves e centro respirando.",
    [
      tuning("radius", "Raio", 0.05, 0.6),
      tuning("thickness", "Espessura"),
      tuning("innerShape", "Forma interna"),
    ],
  ),
  definition(
    "neuro-noise",
    "Ruído neural",
    "Superficies",
    neuroNoiseFragmentShader,
    neuroNoisePresets,
    2,
    "Rede luminosa orgânica com aparência neural e contraste profundo.",
    [
      tuning("brightness", "Brilho", 0, 0.5),
      tuning("contrast", "Contraste"),
      tuning("scale", "Escala", 0.3, 2.5),
    ],
  ),
  definition(
    "dot-orbit",
    "Órbita de pontos",
    "Minimalista",
    dotOrbitFragmentShader,
    dotOrbitPresets,
    2,
    "Pontos coloridos orbitam suas células em um padrão rítmico e lúdico.",
    [
      tuning("size", "Tamanho", 0.1, 2),
      tuning("sizeRange", "Variação"),
      tuning("spreading", "Dispersão", 0.2, 2),
    ],
  ),
  definition(
    "dot-grid",
    "Grade de pontos",
    "Minimalista",
    dotGridFragmentShader,
    dotGridPresets,
    1,
    "Grade geométrica estática com forma, espaçamento e traço ajustáveis.",
    [
      tuning("size", "Tamanho", 0.25, 8),
      tuning("gapX", "Espaço horizontal", 8, 64),
      tuning("gapY", "Espaço vertical", 8, 64),
    ],
    { aliases: { size: "dotSize" }, enums: { shape: DotGridShapes } },
  ),
  definition(
    "simplex-noise",
    "Ruído simplex",
    "Superficies",
    simplexNoiseFragmentShader,
    simplexNoisePresets,
    2,
    "Curvas cromáticas suaves animadas por ruído simplex.",
    [
      tuning("stepsPerColor", "Passos de cor", 1, 8),
      tuning("softness", "Maciez"),
      tuning("scale", "Escala", 0.2, 2),
    ],
  ),
  definition(
    "metaballs",
    "Metaballs",
    "Fluidos",
    metaballsFragmentShader,
    metaballsPresets,
    2,
    "Formas líquidas se atraem, se fundem e se separam em fluxo contínuo.",
    [
      tuning("count", "Quantidade", 2, 20),
      tuning("size", "Tamanho", 0.1, 1.5),
      tuning("scale", "Escala", 0.3, 2),
    ],
  ),
  definition(
    "waves",
    "Ondas gráficas",
    "Minimalista",
    wavesFragmentShader,
    wavesPresets,
    1,
    "Linhas repetidas formam ondas, zigue-zagues e superfícies gráficas.",
    [
      tuning("frequency", "Frequência", 0.05, 2),
      tuning("amplitude", "Amplitude"),
      tuning("spacing", "Espaçamento", 0.2, 3),
    ],
  ),
  definition(
    "perlin-noise",
    "Ruído Perlin",
    "Superficies",
    perlinNoiseFragmentShader,
    perlinNoisePresets,
    2,
    "Campo Perlin tridimensional com transições densas e orgânicas.",
    [
      tuning("proportion", "Proporção"),
      tuning("softness", "Maciez"),
      tuning("octaveCount", "Oitavas", 1, 6),
    ],
  ),
  definition(
    "voronoi",
    "Voronoi luminoso",
    "Superficies",
    voronoiFragmentShader,
    voronoiPresets,
    2,
    "Células Voronoi animadas com fendas e brilho controláveis.",
    [
      tuning("distortion", "Distorção"),
      tuning("gap", "Intervalo", 0, 0.25),
      tuning("glow", "Brilho"),
    ],
  ),
  definition(
    "warp",
    "Dobra cromática",
    "Fluidos",
    warpFragmentShader,
    warpPresets,
    2,
    "Faixas de cor deformadas por ruído e redemoinhos fluidos.",
    [
      tuning("distortion", "Distorção"),
      tuning("swirl", "Redemoinho"),
      tuning("softness", "Maciez"),
    ],
    { enums: { shape: WarpPatterns } },
  ),
  definition(
    "god-rays",
    "Raios de luz",
    "Luz & Gradiente",
    godRaysFragmentShader,
    godRaysPresets,
    2,
    "Feixes luminosos irradiam do centro com halo e densidade cinematográficos.",
    [
      tuning("density", "Densidade"),
      tuning("intensity", "Intensidade"),
      tuning("bloom", "Bloom"),
    ],
  ),
  definition(
    "spiral",
    "Espiral mutante",
    "Minimalista",
    spiralFragmentShader,
    spiralPresets,
    2,
    "Espiral monocromática que alterna entre geometria e fluxo orgânico.",
    [
      tuning("density", "Densidade", 0.1, 3),
      tuning("distortion", "Distorção"),
      tuning("strokeWidth", "Espessura"),
    ],
  ),
  definition(
    "swirl",
    "Redemoinho cromático",
    "Fluidos",
    swirlFragmentShader,
    swirlPresets,
    2,
    "Bandas de cor giram em arcos e redemoinhos concêntricos.",
    [
      tuning("bandCount", "Faixas", 1, 10),
      tuning("twist", "Torção"),
      tuning("noise", "Ruído"),
    ],
  ),
  definition(
    "dithering",
    "Dithering animado",
    "Superficies",
    ditheringFragmentShader,
    ditheringPresets,
    2,
    "Dithering de duas cores aplicado a formas e movimentos abstratos.",
    [
      tuning("size", "Tamanho do pixel", 1, 8),
      tuning("scale", "Escala", 0.2, 2),
      tuning("rotation", "Rotação", 0, 360),
    ],
    {
      aliases: { size: "pxSize" },
      enums: { shape: DitheringShapes, type: DitheringTypes },
    },
  ),
  definition(
    "grain-gradient",
    "Gradiente granulado",
    "Luz & Gradiente",
    grainGradientFragmentShader,
    grainGradientPresets,
    2,
    "Gradiente multicolorido com formas abstratas e textura de grão.",
    [
      tuning("softness", "Maciez"),
      tuning("intensity", "Intensidade"),
      tuning("noise", "Grão"),
    ],
    { enums: { shape: GrainGradientShapes } },
  ),
  definition(
    "pulsing-border",
    "Moldura pulsante",
    "Luz & Gradiente",
    pulsingBorderFragmentShader,
    pulsingBorderPresets,
    2,
    "Trilhas luminosas percorrem uma moldura suave com fumaça e bloom.",
    [
      tuning("thickness", "Espessura"),
      tuning("bloom", "Bloom"),
      tuning("smoke", "Fumaça"),
    ],
    { enums: { aspectRatio: PulsingBorderAspectRatios } },
  ),
  definition(
    "color-panels",
    "Painéis de cor",
    "Luz & Gradiente",
    colorPanelsFragmentShader,
    colorPanelsPresets,
    2,
    "Painéis translúcidos giram e cruzam um eixo central luminoso.",
    [
      tuning("density", "Densidade", 0.5, 6),
      tuning("blur", "Desfoque"),
      tuning("gradient", "Gradiente"),
    ],
  ),
  definition(
    "static-mesh-gradient",
    "Malha estática",
    "Luz & Gradiente",
    staticMeshGradientFragmentShader,
    staticMeshGradientPresets,
    1,
    "Gradiente em malha estático para fundos elegantes e leves.",
    [
      tuning("mixing", "Mistura"),
      tuning("waveX", "Onda horizontal", 0, 3),
      tuning("waveY", "Onda vertical", 0, 3),
    ],
  ),
  definition(
    "static-radial-gradient",
    "Gradiente radial",
    "Luz & Gradiente",
    staticRadialGradientFragmentShader,
    staticRadialGradientPresets,
    1,
    "Gradiente radial multiponto com foco, queda e distorção ajustáveis.",
    [
      tuning("radius", "Raio", 0.1, 1.5),
      tuning("falloff", "Queda"),
      tuning("distortion", "Distorção"),
    ],
  ),
  definition(
    "paper-texture",
    "Textura de papel",
    "Superficies",
    paperTextureFragmentShader,
    paperTexturePresets,
    2,
    "Fibras, dobras e rugosidade formam superfícies de papel e cartão.",
    [
      tuning("roughness", "Rugosidade"),
      tuning("fiber", "Fibras"),
      tuning("crumples", "Amassado"),
    ],
  ),
  definition(
    "fluted-glass",
    "Vidro canelado",
    "Superficies",
    flutedGlassFragmentShader,
    flutedGlassPresets,
    2,
    "Refração em lâminas transforma um fundo interno em vidro texturizado.",
    [
      tuning("distortion", "Distorção"),
      tuning("size", "Tamanho"),
      tuning("edges", "Bordas"),
    ],
    {
      enums: { distortionShape: GlassDistortionShapes, shape: GlassGridShapes },
      usesImage: true,
    },
  ),
  definition(
    "water",
    "Superfície d'água",
    "Fluidos",
    waterFragmentShader,
    waterPresets,
    2,
    "Cáusticas e distorção simulam uma superfície aquática em movimento.",
    [
      tuning("waves", "Ondas"),
      tuning("caustic", "Cáustica"),
      tuning("layering", "Camadas"),
    ],
    { usesImage: true },
  ),
  definition(
    "image-dithering",
    "Imagem em dithering",
    "Superficies",
    imageDitheringFragmentShader,
    imageDitheringPresets,
    2,
    "Uma textura interna é reduzida a padrões de dithering e paletas compactas.",
    [
      tuning("size", "Tamanho do pixel", 1, 8),
      tuning("colorSteps", "Passos de cor", 1, 8),
      tuning("scale", "Escala", 0.25, 2),
    ],
    {
      aliases: { size: "pxSize" },
      enums: { type: DitheringTypes },
      usesImage: true,
    },
  ),
  definition(
    "heatmap",
    "Mapa térmico",
    "Luz & Gradiente",
    heatmapFragmentShader,
    heatmapPresets,
    2,
    "Ondas de intensidade percorrem uma textura e a convertem em gradiente térmico.",
    [
      tuning("contour", "Contorno"),
      tuning("innerGlow", "Brilho interno"),
      tuning("outerGlow", "Brilho externo"),
    ],
    { usesImage: true },
  ),
  definition(
    "liquid-metal",
    "Metal líquido",
    "Superficies",
    liquidMetalFragmentShader,
    liquidMetalPresets,
    3,
    "Material metálico fluido com reflexos cromáticos e formas recortadas.",
    [
      tuning("distortion", "Distorção"),
      tuning("repetition", "Repetição", 0.5, 8),
      tuning("softness", "Maciez"),
    ],
    { enums: { shape: LiquidMetalShapes } },
  ),
  definition(
    "halftone-dots",
    "Retícula de pontos",
    "Superficies",
    halftoneDotsFragmentShader,
    halftoneDotsPresets,
    2,
    "Retícula de pontos transforma uma textura em impressão gráfica modular.",
    [
      tuning("size", "Tamanho", 0.1, 2),
      tuning("radius", "Raio", 0.2, 2),
      tuning("contrast", "Contraste"),
    ],
    {
      enums: { grid: HalftoneDotsGrids, type: HalftoneDotsTypes },
      usesImage: true,
    },
  ),
  definition(
    "halftone-cmyk",
    "Retícula CMYK",
    "Superficies",
    halftoneCmykFragmentShader,
    halftoneCmykPresets,
    3,
    "Simulação de impressão CMYK com ganho, inundação e ruído de grade.",
    [
      tuning("size", "Tamanho", 0.05, 1),
      tuning("contrast", "Contraste", 0, 2),
      tuning("gridNoise", "Ruído da grade"),
    ],
    { enums: { type: HalftoneCmykTypes }, usesImage: true },
  ),
  definition(
    "gem-smoke",
    "Fumaça de gema",
    "Atmosferas",
    gemSmokeFragmentShader,
    gemSmokePresets,
    3,
    "Fumaça cromática percorre uma forma vítrea com brilho interno e externo.",
    [
      tuning("innerDistortion", "Distorção interna"),
      tuning("outerDistortion", "Distorção externa"),
      tuning("outerGlow", "Brilho externo"),
    ],
    { enums: { shape: GemSmokeShapes } },
  ),
];

export const paperShaderDefinitions = rawDefinitions.map(finalizeDefinition);
export const paperShaderRendererIds = new Set(
  paperShaderDefinitions.map((item) => item.rendererId),
);
export const paperShaderPresetCount = paperShaderDefinitions.reduce(
  (total, item) => total + item.presets.length,
  0,
);
export const paperShaderPresetConfigs = paperShaderDefinitions.map((item) => ({
  id: item.rendererId,
  rendererId: item.rendererId,
  name: item.name,
  category: item.motion === "static" ? "Efeitos simples" : item.category,
  family: `paper-${item.slug}`,
  tags: [
    ...PAPER_SHADER_TAGS,
    item.slug,
    item.motion,
    ...(item.usesImage ? ["image-overlay"] : []),
  ],
  performanceTier: item.performanceTier,
  note: `${item.note} Fonte: ${PAPER_SHADER_SOURCE}.`,
  colors: paletteFromParams(item.presets[0].params),
  common: {
    speed: item.presets[0].params.speed === 0 ? 0 : 24,
    brightness: 52,
    audioReaction: 0,
    shade: 8,
  },
  advanced: advancedFromPreset(item, item.presets[0]),
  controls: item.tuning.map(({ key, label }) => ({
    key,
    label,
    min: 0,
    max: 100,
    unit: "%",
  })),
  variants: item.presets.slice(1).map((preset) => ({
    id: slugify(preset.name),
    name: preset.name,
    tags: [item.slug, slugify(preset.name)],
    colors: paletteFromParams(preset.params),
    advanced: advancedFromPreset(item, preset),
  })),
}));

const paperShaderDefinitionMap = new Map(
  paperShaderDefinitions.map((item) => [item.rendererId, item]),
);

export function isPaperShaderRenderer(rendererId) {
  return paperShaderRendererIds.has(String(rendererId ?? ""));
}

export function resolvePaperShaderFrame(scene = {}, audio = {}, time = 0) {
  const definition = paperShaderDefinitionMap.get(scene.rendererId);
  if (!definition) return null;
  const selectedPreset =
    definition.presets.find(
      (preset) => slugify(preset.name) === scene.appliedVariantId,
    ) ?? definition.presets[0];
  const params = { ...selectedPreset.params };
  for (const entry of definition.tuning) {
    const normalized = clamp(Number(scene.advanced?.[entry.key]) / 100, 0, 1);
    params[entry.key] = mix(entry.min, entry.max, normalized);
  }
  const palette = scene.colors ?? paletteFromParams(params);
  const colors = [palette.base, palette.effect, palette.light];
  const uniforms = paramsToUniforms(definition, params, colors);
  const speed = Math.max(0, Number(params.speed) || 0);
  const speedScale = clamp(Number(scene.common?.speed ?? 28) / 28, 0, 3);
  const audioAmount = clamp(
    Number(scene.common?.audioReaction ?? 0) / 100,
    0,
    1,
  );
  const audioEnergy = clamp(Number(audio.energy ?? 0), 0, 1);
  return {
    fragmentShader: definition.fragmentShader,
    uniforms,
    time:
      Number(time) *
      speed *
      speedScale *
      (1 + audioEnergy * audioAmount * 0.35),
    textureColors: colors,
  };
}

export function createPaperShaderRenderer(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  if (!gl) {
    throw new Error(
      "WebGL2 indisponível para renderizar Paper Shaders. Código: WEBGL2_CONTEXT_UNAVAILABLE.",
    );
  }
  const programs = new Map();
  const buffer = gl.createBuffer();
  const textureCache = new Map();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  function render(scene, audio, time) {
    const frame = resolvePaperShaderFrame(scene, audio, time);
    if (!frame) return;
    const compiled = getProgram(scene.rendererId, frame.fragmentShader);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(compiled.program);
    gl.enableVertexAttribArray(compiled.position);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(compiled.position, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    let textureUnit = 0;
    for (const uniform of compiled.uniforms) {
      const name = uniform.name.replace(/\[0\]$/u, "");
      const value = specialUniformValue(name, frame, canvas);
      if (isSamplerType(uniform.type)) {
        const kind = name.toLowerCase().includes("noise") ? "noise" : "image";
        const texture = getTexture(kind, frame.textureColors);
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(uniform.location, textureUnit);
        textureUnit += 1;
      } else {
        setUniform(uniform, value);
      }
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function getProgram(rendererId, fragmentShader) {
    if (programs.has(rendererId)) return programs.get(rendererId);
    const program = createProgram(gl, PAPER_VERTEX_SHADER, fragmentShader);
    const position = gl.getAttribLocation(program, "a_position");
    const uniforms = [];
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let index = 0; index < count; index += 1) {
      const info = gl.getActiveUniform(program, index);
      if (!info) continue;
      uniforms.push({
        name: info.name,
        size: info.size,
        type: info.type,
        location: gl.getUniformLocation(program, info.name),
      });
    }
    const compiled = { program, position, uniforms };
    programs.set(rendererId, compiled);
    return compiled;
  }

  function getTexture(kind, colors) {
    const key = `${kind}:${colors.join("|")}`;
    if (textureCache.has(key)) return textureCache.get(key);
    const size = 128;
    const data = createTexturePixels(kind, colors, size);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      size,
      size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
    textureCache.set(key, texture);
    return texture;
  }

  function setUniform(uniform, value) {
    const array = Array.isArray(value) ? value.flat(Infinity) : value;
    switch (uniform.type) {
      case gl.FLOAT:
        if (uniform.size > 1) gl.uniform1fv(uniform.location, array);
        else gl.uniform1f(uniform.location, Number(value) || 0);
        break;
      case gl.FLOAT_VEC2:
        gl.uniform2fv(uniform.location, array ?? [0, 0]);
        break;
      case gl.FLOAT_VEC3:
        gl.uniform3fv(uniform.location, array ?? [0, 0, 0]);
        break;
      case gl.FLOAT_VEC4:
        gl.uniform4fv(uniform.location, array ?? [0, 0, 0, 1]);
        break;
      case gl.INT:
        if (uniform.size > 1) gl.uniform1iv(uniform.location, array);
        else gl.uniform1i(uniform.location, Number(value) || 0);
        break;
      case gl.BOOL:
        if (uniform.size > 1) gl.uniform1iv(uniform.location, array);
        else gl.uniform1i(uniform.location, Number(Boolean(value)));
        break;
      case gl.INT_VEC2:
      case gl.BOOL_VEC2:
        gl.uniform2iv(uniform.location, array ?? [0, 0]);
        break;
      case gl.INT_VEC3:
      case gl.BOOL_VEC3:
        gl.uniform3iv(uniform.location, array ?? [0, 0, 0]);
        break;
      case gl.INT_VEC4:
      case gl.BOOL_VEC4:
        gl.uniform4iv(uniform.location, array ?? [0, 0, 0, 0]);
        break;
      default:
        break;
    }
  }

  function isSamplerType(type) {
    return type === gl.SAMPLER_2D || type === gl.SAMPLER_CUBE;
  }

  return {
    render,
    destroy() {
      for (const { program } of programs.values()) gl.deleteProgram(program);
      for (const texture of textureCache.values()) gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      programs.clear();
      textureCache.clear();
    },
  };
}

function definition(
  slug,
  name,
  category,
  fragmentShader,
  presets,
  performanceTier,
  note,
  controls,
  options = {},
) {
  return {
    slug,
    rendererId: `paper-${slug}`,
    name,
    category,
    fragmentShader,
    presets,
    performanceTier,
    note,
    tuning: controls,
    aliases: options.aliases ?? {},
    enums: options.enums ?? {},
    usesImage: Boolean(options.usesImage),
  };
}

function finalizeDefinition(item) {
  if (!item.presets?.length) {
    throw new Error(`Paper Shader sem presets: ${item.rendererId}`);
  }
  const motion = item.presets.every(
    (preset) => Number(preset.params.speed ?? 0) === 0,
  )
    ? "static"
    : "animated";
  return Object.freeze({ ...item, motion, presets: [...item.presets] });
}

function advancedFromPreset(definition, preset) {
  return Object.fromEntries(
    definition.tuning.map(({ key, min, max }) => [
      key,
      Math.round(
        clamp((Number(preset.params[key]) - min) / (max - min), 0, 1) * 100,
      ),
    ]),
  );
}

function paletteFromParams(params = {}) {
  const candidates = [
    ...(Array.isArray(params.colors) ? params.colors : []),
    params.colorBack,
    params.colorFront,
    params.colorMid,
    params.colorHighlight,
    params.colorTint,
    params.colorBloom,
    params.colorInner,
    params.colorFill,
    params.colorStroke,
    params.colorC,
    params.colorM,
    params.colorY,
  ].filter((value) => typeof value === "string" && value.startsWith("#"));
  const unique = [...new Set(candidates.map(normalizeHex6))];
  return {
    base: unique[0] ?? "#0a1020",
    effect: unique[1] ?? unique[0] ?? "#667eea",
    light: unique[2] ?? unique[1] ?? unique[0] ?? "#f5f7ff",
  };
}

function paramsToUniforms(definition, params, colors) {
  const uniforms = {};
  for (const [key, rawValue] of Object.entries(params)) {
    if (["speed", "frame", "image", "margin"].includes(key)) continue;
    const uniformKey = definition.aliases[key] ?? key;
    if (key === "fit") {
      uniforms.u_fit = ShaderFitOptions[rawValue] ?? 0;
    } else if (key === "colors") {
      const mappedColors = mapPaperColors(colors, rawValue);
      uniforms.u_colors = mappedColors.map(getShaderColorFromString);
      uniforms.u_colorsCount = mappedColors.length;
    } else if (key.startsWith("color")) {
      uniforms[`u_${uniformKey}`] = getShaderColorFromString(
        sceneColorForParam(key, colors, rawValue),
      );
    } else if (definition.enums[key]) {
      uniforms[`u_${uniformKey}`] = definition.enums[key][rawValue] ?? 0;
    } else {
      uniforms[`u_${uniformKey}`] = rawValue;
    }
  }
  if (!("u_colors" in uniforms)) {
    uniforms.u_colors = colors.map(getShaderColorFromString);
    uniforms.u_colorsCount = colors.length;
  }
  uniforms.u_isImage = false;
  return uniforms;
}

function sceneColorForParam(key, colors, presetColor) {
  const normalizedKey = String(key).toLowerCase();
  const containsAny = (values) =>
    values.some((value) => normalizedKey.includes(value));
  if (
    containsAny(["back", "shadow", "gap", "glow", "bloom"]) ||
    /^color[cmyk]$/u.test(normalizedKey)
  ) {
    return presetColor;
  }
  if (new Set(colors.map(normalizeHex6)).size === 1) {
    return normalizeHex6(presetColor);
  }
  if (containsAny(["back", "shadow", "gap"]) || normalizedKey.endsWith("k"))
    return colors[0];
  if (
    containsAny(["highlight", "glow", "bloom"]) ||
    normalizedKey.endsWith("y")
  )
    return colors[2];
  if (containsAny(["mid", "tint", "stroke"]) || normalizedKey.endsWith("m"))
    return colors[1];
  return colors[1];
}

function mapPaperColors(colors, sourceColors) {
  const source = Array.isArray(sourceColors) ? sourceColors : [];
  const count = Math.max(3, source.length);
  return Array.from({ length: count }, (_, index) =>
    withSourceAlpha(colors[index % colors.length], source[index]),
  );
}

function withSourceAlpha(color, sourceColor) {
  const normalizedSource = String(sourceColor ?? "").toLowerCase();
  const alpha = /^#[0-9a-f]{8}$/u.test(normalizedSource)
    ? normalizedSource.slice(7, 9)
    : "";
  return `${normalizeHex6(color)}${alpha}`;
}

function specialUniformValue(name, frame, canvas) {
  if (name === "u_resolution") return [canvas.width, canvas.height];
  if (name === "u_pixelRatio") return 1;
  if (name === "u_time") return frame.time;
  if (name.endsWith("AspectRatio")) return 1;
  return frame.uniforms[name] ?? 0;
}

function createTexturePixels(kind, colors, size) {
  const palette = colors.map(parseHexColor);
  const output = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const hash = fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
      const wave = clamp(
        (Math.sin(x * 0.09 + Math.cos(y * 0.07) * 2.4) + 1) * 0.5,
        0,
        1,
      );
      const first = palette[0];
      const second = palette[1];
      const third = palette[2];
      const mixed = mixColor(first, second, wave);
      const color = mixColor(
        mixed,
        third,
        Math.max(0, 1 - distanceToCenter(x, y, size) * 1.6),
      );
      const noise = kind === "noise" ? Math.round(hash * 255) : 0;
      output[offset] = kind === "noise" ? noise : color[0];
      output[offset + 1] = kind === "noise" ? noise : color[1];
      output[offset + 2] = kind === "noise" ? noise : color[2];
      output[offset + 3] = 255;
    }
  }
  return output;
}

function parseHexColor(value) {
  const normalized = String(value ?? "#000000").replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : normalized;
  return [0, 2, 4].map((offset) =>
    Number.parseInt(expanded.slice(offset, offset + 2) || "00", 16),
  );
}

function normalizeHex6(value) {
  const normalized = String(value ?? "#000000").toLowerCase();
  if (/^#[0-9a-f]{8}$/u.test(normalized)) return normalized.slice(0, 7);
  if (/^#[0-9a-f]{6}$/u.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/u.test(normalized)) {
    return `#${normalized
      .slice(1)
      .split("")
      .map((part) => `${part}${part}`)
      .join("")}`;
  }
  return "#000000";
}

function mixColor(left, right, amount) {
  return left.map((channel, index) =>
    Math.round(mix(channel, right[index], amount)),
  );
}

function distanceToCenter(x, y, size) {
  const nx = x / size - 0.5;
  const ny = y / size - 0.5;
  return Math.hypot(nx, ny);
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Falha desconhecida";
    gl.deleteProgram(program);
    throw new Error(`Falha ao vincular Paper Shader: ${message}`);
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Falha desconhecida";
    gl.deleteShader(shader);
    throw new Error(`Falha ao compilar Paper Shader: ${message}`);
  }
  return shader;
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function mix(left, right, amount) {
  return left + (right - left) * amount;
}

function fract(value) {
  return value - Math.floor(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
