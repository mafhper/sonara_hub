import {
  createPaperShaderRenderer,
  isPaperShaderRenderer,
} from "./paper-shaders.mjs";

const vertexShader = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const LITTLE_ENDIAN =
  new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
const HAS_OWN_PROPERTY = Object.prototype.hasOwnProperty;
const PIANO_BLACK_KEY_PATTERN = new Set([0, 1, 3, 4, 5]);
const PLAYFUL_FALLBACK_GLYPHS = ["•"];
const HEX_COLOR_VALUE_CACHE_LIMIT = 256;
const hexColorValueCache = new Map();
const PLAYFUL_MOTION_CALM = {
  travel: 0.64,
  rotation: 0.58,
  bassPulse: 0.42,
  energy: 0.48,
  highlight: 0.58,
};
const PLAYFUL_MOTION_PLAY = {
  travel: 1.34,
  rotation: 1.24,
  bassPulse: 0.94,
  energy: 1.12,
  highlight: 1.08,
};
const PLAYFUL_MOTION_FLOAT = {
  travel: 0.92,
  rotation: 0.84,
  bassPulse: 0.68,
  energy: 0.78,
  highlight: 0.82,
};

const shaderPrelude = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_intensity;
uniform float u_speed;
uniform float u_brightness;
uniform float u_direction;
uniform float u_audioReaction;
uniform float u_shade;
uniform float u_audioEnergy;
uniform float u_audioBass;
uniform float u_audioMid;
uniform float u_audioHigh;
uniform float u_audioCentroid;
uniform float u_audioFlux;
uniform float u_audioOnset;
uniform float u_audioBeat;
uniform float u_beatPhase;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform vec3 u_accentColor;
uniform float u_param0;
uniform float u_param1;
uniform float u_param2;
uniform float u_param3;
uniform float u_param4;
uniform float u_param5;
uniform float u_param6;
uniform float u_cloudSunEnabled;
uniform float u_cloudSunIntensity;
uniform float u_cloudSunX;
uniform float u_cloudSunY;
uniform float u_cloudSunRadius;
uniform float u_cloudSunDiffusion;
uniform float u_cloudSunMotion;
uniform float u_cloudSunSpeed;
uniform float u_cloudSunDirection;
uniform vec3 u_cloudSunColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0, amplitude = 0.5;
  for (int index = 0; index < 6; index++) {
    value += amplitude * noise(p);
    p = p * 2.03 + 0.17;
    amplitude *= 0.5;
  }
  return value;
}
vec2 direction() {
  float angle = u_direction * 0.01745329252;
  return vec2(cos(angle), sin(angle));
}
float pulse(float band, float amount) {
  return 1.0 + band * u_audioReaction * amount;
}
vec3 finish(vec3 color, vec2 uv) {
  float vignette = smoothstep(0.86, 0.18, length(uv - 0.5));
  color *= (0.54 + u_brightness * 0.9) * mix(0.64, 1.0, vignette);
  color *= 1.0 - u_shade * 0.34;
  return color;
}
`;

export const shaderAudioUniformNames = [
  "audioEnergy",
  "audioBass",
  "audioMid",
  "audioHigh",
  "audioCentroid",
  "audioFlux",
  "audioOnset",
  "audioBeat",
  "beatPhase",
];

// ###########################################################################
// # AVISO — NÃO USE CRASE NESTE ARQUIVO                                        #
// #                                                                              #
// # Tudo abaixo de `const fragmentShaders` são TEMPLATE LITERALS JS com GLSL     #
// # dentro. Uma crase (código 96) em qualquer lugar da string fecha o literal —   #
// # inclusive dentro de um COMENTÁRIO, porque o parser não distingue. O mesmo    #
// # vale para "${", que abriria uma interpolação JS.                             #
// #                                                                              #
// # O sintoma é um build quebrado com:                                           #
// #   [PARSE_ERROR] Expected `,` or `}` but found `Identifier`                   #
// # e a linha apontada é o ponto onde a string JÁ TERMINOU — raramente é a        #
// # linha culpada, que costuma estar 5 a 15 linhas acima.                        #
// #                                                                              #
// # Caiu nisso 3 vezes numa sessão. Use aspas duplas em comentário.             #
// # O build pega o erro; só o diagnóstico é que é ruim.                          #
// ###########################################################################
const fragmentShaders = {
  "liquid-mesh": `${shaderPrelude}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  float t = u_time * (0.08 + u_speed * 0.55);
  vec2 drift = direction() * t * (0.14 + u_param4 * 0.34);
  vec2 p = uv * ratio * (1.25 + u_param0 * 2.4);
  float broad = fbm(p + drift);
  float folded = fbm(p * 1.52 - drift * 0.72 + broad * (0.34 + u_param1 * 0.82));
  float surface = smoothstep(0.18, 0.9, broad * 0.58 + folded * 0.62);
  float ridge = pow(smoothstep(0.46, 0.94, abs(folded - broad) + surface * 0.3), 2.4);
  float light = smoothstep(0.82, 0.05, distance(uv, vec2(0.32, 0.34)));
  vec3 color = mix(u_colorA, u_colorB, surface * (0.44 + u_param2 * 0.42));
  color += u_accentColor * (ridge * u_param3 * 0.38 + light * 0.13) * pulse(u_audioMid, 0.32);
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  "volumetric-clouds": `${shaderPrelude}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  float t = u_time * (0.04 + u_speed * 0.22);
  vec2 drift = direction() * t * (0.1 + u_param4 * 0.3);
  vec2 p = uv * ratio * (0.82 + u_param1 * 1.35);
  float broad = fbm(p + drift);
  float body = fbm(p * 2.0 - drift * 0.58);
  float softDetail = fbm(p * 3.25 + drift.yx * 0.28);
  float threshold = mix(0.8, 0.42, u_param0);
  float cloud = smoothstep(threshold - 0.16, threshold + mix(0.32, 0.18, u_param2), broad * 0.58 + body * 0.48 + softDetail * 0.1);
  vec2 sunMotionDirection = vec2(cos(radians(u_cloudSunDirection)), sin(radians(u_cloudSunDirection)));
  vec2 sunPosition = vec2(u_cloudSunX, u_cloudSunY) + sunMotionDirection * sin(u_time * mix(0.05, 0.86, u_cloudSunSpeed)) * u_cloudSunMotion * 0.18;
  float sunDistance = distance(uv, sunPosition);
  float sunRadius = mix(0.08, 0.46, u_cloudSunRadius);
  float sunDiffusion = mix(0.12, 0.78, u_cloudSunDiffusion);
  float sunCore = smoothstep(sunRadius, sunRadius * 0.12, sunDistance);
  float sunGlow = smoothstep(sunRadius + sunDiffusion, sunRadius * 0.32, sunDistance);
  float sun = u_cloudSunEnabled * u_cloudSunIntensity * (sunCore * 0.62 + sunGlow * 0.38);
  vec3 sky = mix(u_colorA * 0.7, u_colorA + u_colorB * 0.12, uv.y);
  vec3 color = mix(sky, mix(u_colorB * 0.62, u_colorB, cloud), cloud * (0.3 + u_intensity * 0.42));
  color += u_cloudSunColor * sun * (0.16 + u_param3 * 0.28) * pulse(u_audioMid, 0.2);
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  "aurora-ribbons": `${shaderPrelude}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time * (0.07 + u_speed * 0.34);
  float field = fbm(vec2(uv.x * 1.8, uv.y * 2.6) + direction() * t * 0.18);
  float baseY = mix(0.42, 0.7, u_param3);
  float wave = sin(uv.x * (3.2 + u_param0 * 5.2) + t + field * (1.2 + u_param1 * 3.0));
  float ribbon = smoothstep(0.15 + u_param2 * 0.18, 0.0, abs(uv.y - baseY - wave * 0.1));
  float echo = smoothstep(0.22, 0.0, abs(uv.y - baseY + 0.17 - wave * 0.075));
  float haze = fbm(vec2(uv.x * 2.2, uv.y * 4.5 - t * 0.22));
  vec3 color = mix(u_colorA, u_colorB, haze * 0.22);
  color += u_accentColor * (ribbon + echo * 0.42) * (0.22 + u_param4 * 0.62) * pulse(u_audioMid, 0.32);
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  // Técnica `ribbon-field` adaptada de ThreeUI "Predictive Arc" / variante
  // Ribbon Field (MIT): fitas procedurais com grade de pontos e bloom.
  // Reimplementada para a interface fullscreen u_* do Sonara.
  "ribbon-field": `${shaderPrelude}
float ribbonField(vec2 uv, float offset, float width, float phase) {
  float y = 0.55 + 0.20 * sin((uv.x * 2.15) + phase) + 0.045 * sin((uv.x * 7.0) - phase * 0.7);
  float d = abs(uv.y - y - offset);
  return exp(-(d * d) / width);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time * (0.08 + u_speed * 0.55);
  float r1 = ribbonField(uv, 0.03, 0.0065, t + 0.9);
  float r2 = ribbonField(uv, -0.23, 0.0085, t + 3.25);
  float r3 = ribbonField(uv, 0.25, 0.014, t + 1.85);
  float glow = (r1 * 1.14 + r2 * 1.05 + r3 * 0.48) * (0.55 + u_param1 * 0.9);
  vec3 col = vec3(0.0);
  col += u_accentColor * r1 * 0.92;
  col += u_colorB * r1 * 0.62;
  col += mix(u_colorB, u_accentColor, 0.4) * r3 * 0.42;
  col += u_colorB * r2 * 0.66;
  col += mix(u_accentColor, u_colorB, 0.5) * (r2 + r3) * 0.30;
  float bloom = exp(-pow(distance(uv, vec2(0.76, 0.40 + 0.035 * sin(t))), 2.0) / 0.050);
  bloom += exp(-pow(distance(uv, vec2(0.71, 0.75 + 0.025 * cos(t))), 2.0) / 0.030);
  col += u_accentColor * bloom * (0.18 + u_param2 * 0.4);
  float gridSize = 4.0 + u_param0 * 10.0;
  vec2 grid = fract(gl_FragCoord.xy / gridSize) - 0.5;
  float dotShape = smoothstep(0.29, 0.11, length(grid));
  float n = hash(floor(gl_FragCoord.xy / gridSize));
  float scan = 0.72 + 0.28 * sin((uv.x + uv.y) * 38.0 + u_time * 1.3);
  float dots = dotShape * (0.48 + 0.52 * n) * scan;
  float micro = hash(gl_FragCoord.xy + u_time) * 0.035;
  float alpha = clamp((glow * 1.55 + bloom * 0.5) * dots, 0.0, 1.0);
  vec3 base = u_colorA * 0.05;
  vec3 finalColor = mix(base, col, clamp(alpha * (1.0 + u_param3), 0.0, 1.0));
  finalColor += micro;
  gl_FragColor = vec4(finish(finalColor * pulse(u_audioMid, 0.35), uv), 1.0);
}`,
  // Técnica `void-field` adaptada de ThreeUI "Void Protocol"
  // (src/shaders/neuform-isolated/sources/void-protocol.html, MIT): matriz de
  // pontos com distorção barrel, respiração radial, scanlines e flicker.
  // Adaptação: o `uMouse` do upstream foi removido — o runtime do Sonara é
  // determinístico e sem ponteiro (paridade preview↔export é regra dura).
  // O palette fixo roxo foi substituído pelas cores do preset.
  "void-field": `${shaderPrelude}
vec2 barrel(vec2 uv, float amount) {
  vec2 center = uv - 0.5;
  float r = dot(center, center);
  return uv + center * r * amount;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  uv = barrel(uv, 0.12 + u_param0 * 0.22);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 gridCount = vec2(70.0 + u_param1 * 90.0);
  gridCount.y *= u_resolution.y / u_resolution.x;
  vec2 gridUv = fract(uv * gridCount);
  vec2 id = floor(uv * gridCount);
  vec2 cellCenter = id / gridCount - 0.5;
  float dist = length(cellCenter);
  float breathe = sin(u_time * (0.5 + u_speed * 0.9) - dist * 10.0) * 0.5 + 0.5;
  float dotSize = (0.18 + u_param2 * 0.28) * breathe;
  float circle = smoothstep(dotSize, dotSize - 0.05, length(gridUv - 0.5));
  float scanline = sin(uv.y * (420.0 + u_param3 * 700.0)) * 0.03;
  // Flicker determinístico: depende só de u_time e da linha da célula.
  float flicker = hash(vec2(floor(u_time * 12.0), id.y)) > 0.97 ? 0.45 : 1.0;
  vec3 tint = mix(u_colorB, u_accentColor, smoothstep(0.0, 0.9, dist));
  vec3 col = tint * circle * breathe * flicker;
  col = max(col - scanline, 0.0);
  // Vinheta suave: o upstream usava smoothstep(0.8, 0.2) e um offset de
  // 0.05px que apagavam a borda da matriz quase inteira num preset 16:9.
  // A vinheta foi alargada e a matriz ganhou um brilho de campo fraco, para
  // que a grade continue legível até as bordas.
  col *= smoothstep(1.05, 0.25, dist);
  col += tint * 0.045;
  col += u_colorB * pow(breathe, 6.0) * (0.06 + u_param4 * 0.18) * pulse(u_audioMid, 0.3);
  gl_FragColor = vec4(finish(col, uv), 1.0);
}`,
  // Técnica `laser` adaptada de ThreeUI "Laser"
  // (src/shaders/laser/laserShaders.ts, MIT): 4 variantes (lâmina atmosférica,
  // array que some, abertura prismática, relé halftone) com perfil gaussiano de
  // feixe, névoa por fbm e retícula. Adaptação: o `u_pointer` do upstream — que
  // seguia o cursor por lerp de frame (não-determinístico) — foi FIXADO em um
  // ponto centrado com deriva função apenas de `u_time` (ver
  // `.dev/tasks/backlog/threeui-library/candidato-laser.md`). O runtime do Sonara
  // é determinístico e sem ponteiro (paridade preview↔export é regra dura); a
  // diferença para o upstream é declarada no NOTICE. Os uniforms `u_hue`/
  // `u_saturation` viraram as cores do preset e o tonemap do upstream foi
  // absorvido por `finish()`.
  laser: `${shaderPrelude}
vec2 laserProfile(float distanceToLine, float coreWidth, float glowWidth) {
  float core = exp(-pow(distanceToLine / max(coreWidth, 0.0002), 2.0));
  float glow = exp(-pow(distanceToLine / max(glowWidth, 0.001), 1.25));
  return vec2(core, glow);
}
mat2 laserRotate(float angle) {
  float s = sin(angle), c = cos(angle);
  return mat2(c, -s, s, c);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  // Controle de posicionamento do elemento central: deslocamento X/Y e rotação
  // aplicados pelo usuário (params 4/5/6). Substituem o "ponteiro" do upstream de
  // forma determinística: o offset move a âncora, a rotação gira o espaço em
  // volta do centro. A deriva temporal continua por baixo (movimento vivo).
  //
  // A âncora mora no MESMO espaço de p (centrado em 0, ~[-1,1]) e não em
  // [0,1] como o u_pointer do upstream. A diferença importa: p é
  // normalizado por min(resolution), então uma âncora 0..1 ficava fora do
  // enquadramento em telas largas — o fbm era amostrado fora da cena, a névoa
  // sumia e sobrava só o brilho central (leitura de lens flare, sem laser).
  vec2 offset = vec2((u_param4 - 0.5) * 0.7, (u_param5 - 0.5) * 0.7);
  p = laserRotate((u_param6 - 0.5) * 6.2831853) * p;
  vec2 pointer = vec2(sin(u_time * 0.34) * 0.16, cos(u_time * 0.26) * 0.11) + offset;
  float variant = u_param0;                 // 0..3, arredondado nos 4 ramos
  float size = 0.35 + u_param1 * 2.15;      // u_size   (clamp 0.35..2.5)
  // "span" e nao "length": length e palavra reservada em GLSL (builtin) e o
  // driver rejeita a compilacao com "function name expected". Erro pego pelo
  // probe de afinacao, nao pelo smoke de render.
  float span = 0.35 + u_param2 * 2.15;         // u_length (clamp 0.35..2.5)
  float density = 0.25 + u_param3 * 2.25;  // u_density(clam 0.25..2.5)
  float t = u_time * (0.6 + u_speed * 0.8);
  vec3 color = u_colorA * 0.012;

  if (variant < 0.5) {
    // atmospheric-blade
    float drift = sin(t * 0.21) * 0.025;
    float center = pointer.x * 0.16 + drift;
    float tilt = pointer.x * 0.055 + sin(t * 0.13) * 0.018;
    float dist = abs(p.x - center - p.y * tilt);
    float vMask = 1.0 - smoothstep(0.68 * span, 1.35 * span, abs(p.y));
    vec2 beam = laserProfile(dist, 0.0028 * size, 0.052 * size);
    vec2 fogUv = vec2(p.x * 2.1, p.y * 1.35 - t * 0.055);
    fogUv.x += sin(p.y * 2.1 - t * 0.12) * 0.14;
    float fogNoise = fbm(fogUv + pointer * 0.35);
    // Névoa: a pluma larga é a assinatura visual do laser. Três ajustes sobre o
    // upstream, todos medidos: o fbm de 6 oitavas tem massa concentrada em
    // 0.3–0.4 (pouca área passa do smoothstep), o envelope 0.24*size era
    // estreito em espaço p, e a fumaça somava 0.34 contra 1.65 do núcleo.
    // O fog é amostrado numa frequência menor que a do feixe, para a pluma ter
    // volume contínuo em vez de pontos isolados.
    float fog = smoothstep(0.16, 0.62, fogNoise) * exp(-pow(dist / (0.46 * size), 1.05)) * density * vMask;
    float mirageDist = abs(abs(p.x - center + p.y * tilt * 0.35) - 0.105 * span);
    vec2 mirage = laserProfile(mirageDist, 0.0011 * size, 0.016 * size);
    float mirageMask = (1.0 - smoothstep(0.08, 1.2, abs(p.y))) * (0.35 + 0.65 * fogNoise);
    // A fumaça precisa pesar mais que o brilho: é ela que dá a leitura de
    // "laser dentro de fumaça". O upstream somava a névoa em 0.34 contra 1.65
    // do núcleo, então mesmo com o envelope largo ela ficava apagada. Aqui a
    // fumaça é a massa dominante e o núcleo é o realce em cima.
    color += u_colorB * fog * 0.82;
    color += u_colorB * beam.y * vMask * (0.52 + 0.06 * sin(t * 1.1));
    color += mix(u_colorB, u_accentColor, 0.88) * beam.x * vMask * 1.65;
    color += u_colorB * mirage.y * mirageMask * 0.12 * density;
    color += u_accentColor * mirage.x * mirageMask * 0.35 * density;
    color += u_colorB * exp(-length(vec2((p.x - center) * 2.5, p.y + 0.77 * span)) * 7.0) * 0.45;
  } else if (variant < 1.5) {
    // vanishing-array
    vec2 origin = vec2(pointer.x * 0.16, 0.12 + pointer.y * 0.075);
    vec2 q = p - origin;
    float radius = length(q);
    float angle = atan(q.y, q.x);
    float spokeCount = floor(11.0 + density * 10.0);
    float angularDistance = abs(sin(angle * spokeCount));
    float spoke = exp(-angularDistance * max(radius, 0.06) / (0.0075 * size));
    float reach = smoothstep(0.035, 0.16, radius) * (1.0 - smoothstep(0.42 * span, 1.55 * span, radius));
    float lowerField = 1.0 - smoothstep(-0.12, 0.22, q.y);
    float upperField = smoothstep(0.02, 0.52, q.y) * 0.48;
    float fieldMask = max(lowerField, upperField);
    float carrier = 0.55 + 0.45 * sin(radius * 16.0 - t * 4.1 + angle * 2.0);
    carrier = pow(max(carrier, 0.0), 7.0);
    float rail = spoke * reach * fieldMask;
    float railCore = pow(rail, 2.1);
    float ringPhase = abs(sin((radius * 13.0 - t * 1.5) / max(span, 0.35)));
    float rings = exp(-ringPhase / (0.035 * size)) * (1.0 - smoothstep(0.1, 1.2, radius)) * lowerField;
    float horizon = exp(-abs(q.y) / (0.0035 * size)) * (1.0 - smoothstep(0.12, 1.15, abs(q.x)));
    // Gradiente do trilho entre as duas pontas da paleta, modulado pelo ângulo:
    // é o que dá a leitura de "arco-íris que gira" do upstream.
    vec3 railTint = mix(u_colorB, u_accentColor, 0.5 + 0.5 * sin(angle * 3.0));
    color += railTint * rail * (0.24 + carrier * 0.72);
    color += mix(railTint, u_accentColor, 0.9) * railCore * (0.52 + carrier * 0.92);
    color += u_colorB * rings * 0.14 * density;
    color += mix(u_colorB, u_accentColor, 0.75) * horizon * 0.38;
    color += u_colorB * exp(-radius * 15.0) * 0.95;
  } else if (variant < 2.5) {
    // prism-aperture
    vec2 center = pointer * vec2(0.12, 0.08);
    vec2 q = p - center;
    float breathing = 0.46 * span + sin(t * 0.72) * 0.012;
    float warp = (fbm(q * 3.2 + vec2(0.0, -t * 0.08)) - 0.5) * 0.025 * density;
    float diamond = abs(q.x * 0.82) + abs(q.y) - breathing - warp;
    float innerDiamond = abs(q.x * 0.82) + abs(q.y) - breathing * 0.66 + warp * 0.45;
    vec2 outer = laserProfile(abs(diamond), 0.0024 * size, 0.046 * size);
    vec2 inner = laserProfile(abs(innerDiamond), 0.0012 * size, 0.018 * size);
    float edgeMask = 1.0 - smoothstep(0.25, 1.18, length(q));
    float perimeterPhase = sin((q.x - q.y) * 15.0 - t * 3.3);
    float packets = pow(max(perimeterPhase, 0.0), 10.0) * outer.y;
    float axisX = exp(-abs(q.x) / (0.002 * size)) * (1.0 - smoothstep(0.04, breathing, abs(q.y)));
    float axisY = exp(-abs(q.y) / (0.002 * size)) * (1.0 - smoothstep(0.04, breathing, abs(q.x)));
    // Franjas de dispersão: o upstream usava accent(0.98,·) e accent(0.54,·);
    // aqui viram as duas pontas da paleta do preset.
    float redFringe = exp(-pow(abs(diamond - 0.011 * size) / (0.011 * size), 1.4));
    float blueFringe = exp(-pow(abs(diamond + 0.011 * size) / (0.011 * size), 1.4));
    color += u_colorB * outer.y * edgeMask * 0.5;
    color += mix(u_colorB, u_accentColor, 0.9) * outer.x * edgeMask * 1.5;
    color += u_colorB * inner.y * edgeMask * 0.18 * density;
    color += u_accentColor * inner.x * edgeMask * 0.48 * density;
    color += u_accentColor * redFringe * 0.13;
    color += mix(u_colorB, u_accentColor, 0.5) * blueFringe * 0.16;
    color += mix(u_colorB, u_accentColor, 0.8) * (axisX + axisY) * 0.2;
    color += u_colorB * packets * 0.85;
    color += u_colorB * exp(-length(q) * 9.0) * 0.22;
  } else {
    // halftone-relay
    float center = 0.29 + pointer.x * 0.12;
    float bend = sin(p.y * 2.1 - t * 0.25) * 0.018;
    float mainDist = abs(p.x - center - bend);
    float relayDist = abs(p.x - center + 0.075 * span + bend * 0.45);
    vec2 mainBeam = laserProfile(mainDist, 0.0022 * size, 0.072 * size);
    vec2 relayBeam = laserProfile(relayDist, 0.0012 * size, 0.025 * size);
    vec2 fogUv = vec2(p.x * 3.0, p.y * 2.5 - t * 0.1);
    float fogNoise = fbm(fogUv + vec2(sin(t * 0.16), 0.0));
    float fog = smoothstep(0.28, 0.78, fogNoise) * exp(-mainDist * 9.5 / size) * density;
    float dotScale = mix(9.0, 4.5, clamp((density - 0.25) / 2.25, 0.0, 1.0));
    vec2 dotCell = fract(gl_FragCoord.xy / dotScale) - 0.5;
    float dot = 1.0 - smoothstep(0.08, 0.34, length(dotCell));
    float dotMask = dot * smoothstep(0.08, 0.68, fog + mainBeam.y * 0.65);
    float pulseLine = pow(max(0.0, sin(p.y * 9.0 - t * 4.0)), 12.0);
    float horizontalRelay = exp(-abs(p.y + 0.34 - pointer.y * 0.08) / (0.0024 * size));
    horizontalRelay *= 1.0 - smoothstep(0.1, 1.05 * span, abs(p.x - center));
    color += u_colorB * fog * 0.24;
    color += u_colorB * mainBeam.y * 0.54;
    color += mix(u_colorB, u_accentColor, 0.9) * mainBeam.x * 1.48;
    color += u_colorB * relayBeam.y * 0.2;
    color += u_accentColor * relayBeam.x * 0.5;
    color += mix(u_colorB, u_accentColor, 0.6) * dotMask * (0.3 + pulseLine * 0.42);
    color += mix(u_colorB, u_accentColor, 0.8) * horizontalRelay * (0.22 + pulseLine * 0.58);
  }

  float vignette = 1.0 - smoothstep(0.24, 1.45, length(p * vec2(0.72, 0.88)));
  color *= 0.55 + vignette * 0.45;
  // Tonemap Reinhard do upstream (color / (color + 0.72)). Sem ele o quadro
  // fica como névoa cinza chapada: ele é o que mantém o fundo preto e faz o
  // núcleo do feixe estourar em branco — é o que faz o laser LER como luz.
  color = color / (color + vec3(0.72));
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  // Técnica `halftone-flow` adaptada de ThreeUI "Nexus Unified Flow"
  // (src/shaders/neuform-isolated/sources/nexus-unified-flow.html, MIT):
  // campo de fluxo com domain warping, pintado em retícula halftone cuja
  // área do ponto segue a intensidade. Adaptação: contador de loop `int`
  // (GLSL ES 1.00 não aceita `float`) e paleta vinda do preset.
  "halftone-flow": `${shaderPrelude}
mat2 rot(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= u_resolution.x / u_resolution.y;
  vec2 flowUv = p;
  float t = u_time * (0.12 + u_speed * 0.4);
  for (int index = 1; index < 4; index++) {
    float f = float(index);
    flowUv *= rot(t * 0.1);
    flowUv.x += sin(flowUv.y * 2.0 * f + t) * (0.25 + u_param0 * 0.5);
    flowUv.y += cos(flowUv.x * 1.5 * f - t * 0.8) * (0.25 + u_param0 * 0.5);
  }
  float intensity = sin(flowUv.x * 2.0 + flowUv.y * 3.0) * 0.5 + 0.5;
  intensity = clamp(intensity * (0.55 + u_param1 * 0.8), 0.0, 1.0);
  vec3 fluidColor = mix(u_colorA * 0.35, u_colorB, smoothstep(0.2, 0.6, intensity));
  fluidColor = mix(fluidColor, u_accentColor, smoothstep(0.65, 1.0, intensity));
  float gridSize = 4.0 + u_param2 * 8.0;
  vec2 cellUv = fract(gl_FragCoord.xy / gridSize) - 0.5;
  float radius = intensity * (0.20 + u_param3 * 0.30);
  float dotMask = smoothstep(radius, radius - 0.1, length(cellUv));
  vec3 finalColor = mix(u_colorA * 0.1, fluidColor, dotMask);
  finalColor += fluidColor * (0.06 + u_param4 * 0.16) * pulse(u_audioMid, 0.28);
  gl_FragColor = vec4(finish(finalColor, uv), 1.0);
}`,
  // Técnica `amber-halftone` adaptada de ThreeUI "Amber Halftone"
  // (src/shaders/neuform-isolated/sources/amber-halftone.html, MIT):
  // retícula de pontos cujo brilho é uma onda radial senoidal, em gradiente
  // vertical. Adaptação: o point-field three.js (gl_PointSize + atributo
  // `scale`) virou grade procedural no fragment shader; a cor fixa do
  // upstream foi substituída pelas cores do preset. O upstream semeava 4000
  // pontos preenchendo o quadro; numa grade procedural o raio zera onde
  // `scale` cai, então o raio ganhou um piso e o campo ganhou uma névoa de
  // fósforo — sem isso a maior parte do frame fica preta morta.
  "amber-halftone": `${shaderPrelude}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float cells = 18.0 + u_param0 * 42.0;
  vec2 gridUv = uv * cells;
  gridUv.x *= u_resolution.x / u_resolution.y;
  vec2 cellUv = fract(gridUv) - 0.5;
  float dist = length(uv - 0.5) * 2.0;
  float scale = sin(dist * 6.0 - u_time * (0.6 + u_speed * 1.8)) * 0.5 + 0.5;
  float radius = (0.10 + u_param1 * 0.32) * (0.45 + scale * 0.55);
  float dot = smoothstep(radius, radius * 0.18, length(cellUv));
  vec3 phosphor = mix(u_colorB, u_accentColor, clamp(uv.y + u_param2 * 0.4, 0.0, 1.0));
  vec3 col = phosphor * (0.05 + dot * (0.35 + scale * 0.65));
  float scan = 0.92 + 0.08 * sin(uv.y * (300.0 + u_param3 * 500.0));
  col *= scan;
  col += u_accentColor * pow(scale, 8.0) * u_param4 * 0.28 * pulse(u_audioMid, 0.26);
  gl_FragColor = vec4(finish(col, uv), 1.0);
}`,
  "color-mesh": `${shaderPrelude}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  float t = u_time * (0.06 + u_speed * 0.34);
  vec2 drift = direction() * t * (0.08 + u_param4 * 0.26);
  vec2 p = uv * ratio * (0.8 + u_param0 * 1.9);
  float broad = fbm(p + drift);
  float folded = fbm(p * (1.18 + u_param2 * 0.48) - drift * 0.7 + broad * (0.22 + u_param1 * 0.82));
  float wave = sin((uv.x + uv.y * 0.72) * (2.8 + u_param0 * 4.4) + t + folded * 2.4);
  float blendA = smoothstep(0.08, 0.92, broad * 0.58 + folded * 0.42);
  float blendB = smoothstep(-0.72, 0.78, wave + folded * 0.56);
  vec3 color = mix(u_colorA, u_colorB, blendA * (0.42 + u_param3 * 0.48));
  color = mix(color, u_accentColor, blendB * (0.14 + u_param3 * 0.34));
  float softness = mix(0.08, 0.28, u_param5);
  float light = smoothstep(0.92 - softness, 0.36 - softness, distance(uv, vec2(0.24, 0.24)));
  color += u_accentColor * light * 0.12 * pulse(u_audioMid, 0.18);
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  // Portado de nebula/packages/effects/src/effect-plasma/fragment.glsl
  // (adaptado para a interface fullscreen u_* do Sonara; re-sync manual).
  plasma: `${shaderPrelude}
vec3 hsv2rgb(vec3 c) {
  vec4 k = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + k.xyz) * 6.0 - k.www);
  return c.z * mix(k.xxx, clamp(p - k.xxx, 0.0, 1.0), c.y);
}
void main() {
  vec2 frag = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  float scale = mix(0.3, 2.5, u_param0);
  float complexity = 1.0 + u_param1 * 5.0;
  float saturation = 0.2 + u_param2 * 1.8;
  vec2 uv = (frag * 2.0 - 1.0) * ratio * scale;
  float t = u_time * (0.12 + u_speed * 1.1);
  float pl = sin(uv.x * 4.0 + t) + cos(uv.y * 4.0 + t * 1.3);
  pl += sin((uv.x * 2.0 + uv.y * 3.0) * 2.0 + t * 0.7);
  pl += cos((uv.x * 3.0 - uv.y * 2.0) * 2.0 + t * 1.1);
  float n = 0.0;
  float amp = 0.5;
  vec2 q = uv * 0.8 + t * 0.06;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= complexity) break;
    n += amp * noise(q);
    q = mat2(1.6, 1.2, -1.2, 1.6) * q;
    amp *= 0.5;
  }
  pl = pl * 0.4 + n * 0.6;
  float p = pl * 0.5 + 0.5;
  float hue = p * 0.7 + t * 0.02 + n * 0.15;
  float sat = clamp(0.5 + p * 0.5 * saturation, 0.0, 1.0);
  float val = clamp(0.4 + p * 0.6 * (0.5 + u_intensity * 1.3), 0.0, 1.0);
  vec3 plasmaColor = hsv2rgb(vec3(hue, sat, val));
  vec3 color = mix(u_colorA, u_colorB, smoothstep(0.0, 1.0, p));
  color = mix(color, u_accentColor, smoothstep(0.5, 1.0, p));
  color = mix(color, plasmaColor, 0.3);
  float glow = 1.0 - length(uv) * 0.4;
  color += u_accentColor * max(0.0, glow) * (0.1 + u_param3 * 0.4) * pulse(u_audioBass, 0.5);
  color = pow(max(color, 0.0), vec3(0.9));
  gl_FragColor = vec4(finish(color, frag), 1.0);
}`,
  // Portado de nebula/packages/effects/src/effect-vortex/fragment.glsl
  // (adaptado para a interface fullscreen u_* do Sonara; re-sync manual).
  vortex: `${shaderPrelude}
void main() {
  vec2 frag = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  float arms = 1.0 + u_param0 * 7.0;
  float twist = u_param1 * 2.5;
  float zoom = mix(0.3, 2.5, u_param2);
  vec2 uv = (frag * 2.0 - 1.0) * ratio * zoom;
  float t = u_time * (0.1 + u_speed * 1.0);
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float spiral = a + r * twist * 6.2831853 + t * 0.6;
  float arm = sin(spiral * arms) * 0.5 + 0.5;
  float tunnel = 1.0 / (r + 0.15);
  float n = fbm(vec2(r * 2.0 + a * 0.5, t * 0.1));
  float pattern = arm * tunnel * (0.7 + n * 0.3);
  float ring = sin(r * 8.0 - t * 1.4) * 0.5 + 0.5;
  float glow = 1.0 - smoothstep(0.0, 1.2, r);
  vec3 color = mix(u_colorA, u_colorB, smoothstep(0.0, 1.0, pattern * 0.5 + 0.5));
  color = mix(color, u_accentColor, smoothstep(0.3, 0.9, pattern));
  color += u_accentColor * pow(glow, 2.0) * (0.18 + u_param3 * 0.5) * pulse(u_audioBass, 0.4);
  color *= (0.6 + pattern * 0.6 + ring * 0.15) * (0.4 + u_intensity * 1.2);
  color *= 1.0 + pow(glow, 3.0) * 0.4;
  color = pow(max(color, 0.0), vec3(0.92));
  gl_FragColor = vec4(finish(color, frag), 1.0);
}`,
  // Adaptado de nebula/packages/effects/src/effect-starfield (originalmente
  // GL_POINTS 3D) para um campo estelar fullscreen procedural: camadas de
  // profundidade que reciclam, com estrelas que crescem e se espalham ao se
  // aproximarem da câmera. Substitui o antigo efeito "space" removido.
  starfield: `${shaderPrelude}
float starHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 52853.13); }
// Luminance-preserving hue rotation (Rodrigues around the grey axis), so each
// star can take a distinct tint without changing its brightness.
vec3 hueShiftColor(vec3 color, float angle) {
  const vec3 k = vec3(0.57735026);
  float c = cos(angle);
  return color * c + cross(k, color) * sin(angle) + k * dot(k, color) * (1.0 - c);
}
void main() {
  vec2 res = u_resolution.xy;
  vec2 uv01 = gl_FragCoord.xy / res;
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float t = u_time * (0.12 + u_speed * 0.9);
  float density = 0.7 + u_param0 * 2.2;
  float warp = 0.35 + u_param1 * 1.7;
  float twinkleAmt = u_param2;
  float glow = 0.45 + u_param3 * 1.4;
  float colorVar = u_param4;
  vec3 col = u_colorA * 0.10;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float z = fract(fi / 6.0 + t * warp * 0.12);
    float persp = z;
    float fade = smoothstep(0.0, 0.18, z) * smoothstep(1.0, 0.55, z);
    float gridScale = mix(13.0, 2.4, persp) * density;
    vec2 g = uv * gridScale + fi * 19.0;
    vec2 cell = floor(g);
    vec2 f = fract(g) - 0.5;
    float rnd = starHash(cell);
    float present = step(0.84, rnd);
    vec2 jitter = (vec2(starHash(cell + 3.1), starHash(cell + 7.7)) - 0.5) * 0.7;
    float d = length(f - jitter);
    float radius = (0.04 + 0.12 * persp) * glow;
    float star = present * smoothstep(radius, 0.0, d);
    float tw = mix(1.0, 0.45 + 0.55 * sin(t * 5.0 + rnd * 40.0), twinkleAmt);
    // Per-star colour: blend the two star tints, then spread the hue by an
    // amount the user controls so the field reads as many-coloured stars.
    vec3 baseStar = mix(u_colorB, u_accentColor, starHash(cell + 5.0));
    float hueShift = (starHash(cell + 9.3) - 0.5) * colorVar * 2.4;
    vec3 starCol = max(vec3(0.0), hueShiftColor(baseStar, hueShift));
    col += star * fade * tw * starCol * (0.55 + persp * 0.95);
  }
  col *= 1.0 + u_audioHigh * u_audioReaction * 0.7;
  col += u_accentColor * smoothstep(0.75, 0.0, length(uv)) * 0.05 * pulse(u_audioMid, 0.3);
  gl_FragColor = vec4(finish(col, uv01), 1.0);
}`,
  // Top-down spiral galaxy (Via-Láctea). Adapta a ideia do
  // nebula/effect-particle-galaxy (braços espirais 3D em GL_POINTS) para um
  // campo fullscreen procedural: braços logarítmicos girando, bojo central
  // luminoso, poeira ao longo dos braços e estrelas pontilhadas. Substitui o
  // antigo "vortex-galaxy" que era idêntico ao vórtice.
  galaxy: `${shaderPrelude}
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 res = u_resolution.xy;
  vec2 uv01 = gl_FragCoord.xy / res;
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float zoom = mix(1.7, 0.75, u_param2);
  uv *= zoom;
  float t = u_time * (0.04 + u_speed * 0.45);
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float armCount = 2.0 + floor(u_param0 * 5.0 + 0.5);
  float winding = 2.4 + u_param1 * 5.5;
  float ang = a + winding * log(r + 0.07) + t;
  float arm = pow(cos(ang * armCount) * 0.5 + 0.5, 2.6);
  float disk = exp(-r * 2.2);
  float core = exp(-r * r * 26.0);
  float dust = fbm(vec2(ang * armCount * 0.25, r * 5.0) + t * 0.2);
  float armGlow = arm * disk * (0.45 + 0.7 * dust);
  vec2 sg = uv * mix(150.0, 52.0, clamp(r, 0.0, 1.0));
  float star = step(0.93, gHash(floor(sg))) * disk * (0.4 + arm * 0.8);
  vec3 color = mix(u_colorA * 0.25, u_colorB, armGlow);
  color = mix(color, u_accentColor, core);
  color += u_accentColor * core * 1.6;
  color += u_colorB * armGlow * (0.5 + u_param3 * 1.2);
  color += vec3(1.0) * star * (0.5 + u_param4 * 0.8);
  color += u_accentColor * smoothstep(1.4, 0.0, r) * 0.04;
  color *= 0.45 + u_intensity * 1.25;
  color *= 1.0 + u_audioBass * u_audioReaction * 0.5;
  color = pow(max(color, 0.0), vec3(0.92));
  gl_FragColor = vec4(finish(color, uv01), 1.0);
}`,
  // Lava: fluxo vulcânico ascendente com veios incandescentes e núcleo quente.
  // Distinto da "plasma" (nebulosa cósmica difusa) para que Plasma lava e
  // Plasma nebulosa deixem de ser o mesmo efeito só recolorido.
  lava: `${shaderPrelude}
void main() {
  vec2 frag = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  float scale = mix(0.6, 2.6, u_param0);
  vec2 uv = (frag * 2.0 - 1.0) * ratio * scale;
  float t = u_time * (0.1 + u_speed * 0.9);
  vec2 flow = uv * vec2(1.4, 1.0);
  flow.y -= t * 0.6;
  float n = fbm(flow * 1.4);
  n += 0.5 * fbm(flow * 3.1 + n);
  float veins = abs(sin((uv.x * 3.0 + n * 3.5) * 1.6 + t));
  veins = pow(1.0 - veins, 2.0);
  float heat = clamp(n * 0.8 + veins * 0.6, 0.0, 1.5);
  vec3 color = mix(u_colorA, u_colorB, smoothstep(0.1, 0.9, heat));
  color = mix(color, u_accentColor, smoothstep(0.7, 1.2, heat + veins * 0.5));
  color += u_accentColor * veins * (0.4 + u_param3 * 0.8) * pulse(u_audioBass, 0.6);
  color += u_colorB * smoothstep(1.0, 0.0, length(uv)) * 0.12 * u_param2;
  color *= 0.5 + u_intensity * 1.3;
  color = pow(max(color, 0.0), vec3(0.9));
  gl_FragColor = vec4(finish(color, frag), 1.0);
}`,
  // Lâmpada de lava: metaballs de cera quente subindo/descendo num líquido
  // translúcido. Sem veios (distinto da "lava" vulcânica) e sem fbm nebuloso
  // (distinto do "plasma"). Os graves empurram os blobs e pulsam o brilho.
  "lava-lamp": `${shaderPrelude}
void main() {
  vec2 frag = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = vec2((frag.x - 0.5) * aspect, frag.y - 0.5);
  float t = u_time * (0.16 + u_speed * 0.6);
  float bass = u_audioBass * u_audioReaction;
  // Poucos blobs grandes, empilhados no eixo vertical como num tubo. Campo
  // gaussiano (cai rápido) -> blobs redondos e discretos que se fundem ao se
  // tocar, sem a espuma de iso-contornos do 1/dist^2.
  float count = floor(mix(3.0, 6.0, u_param0) + 0.5);
  float visc = 0.7 + u_param1 * 0.9;
  float field = 0.0;
  float merge = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= count) break;
    float fi = float(i);
    float seed = hash(vec2(fi * 1.37, 7.13));
    float seed2 = hash(vec2(fi, 2.0));
    float rate = 0.45 + seed * 0.8;
    float phase = seed * 6.2831;
    float y = sin(t * rate + phase) * 0.36 + bass * 0.1 * sin(phase + t);
    float x = (seed - 0.5) * aspect * 0.42 + sin(t * 0.35 * rate + phase) * 0.06;
    float sigma = (0.16 + seed2 * 0.09) * visc * (1.0 + bass * 0.18);
    vec2 d = uv - vec2(x, y);
    float contrib = exp(-dot(d, d) / (sigma * sigma));
    field += contrib;
    merge += contrib * contrib;
  }
  // contraste -> nitidez da membrana; inner -> núcleo quente onde blobs se somam.
  float edge = 0.5;
  float soft = mix(0.24, 0.05, u_param3);
  float blob = smoothstep(edge - soft, edge + soft, field);
  float inner = smoothstep(1.3, 2.6, field + merge * 0.6);
  float rim = exp(-abs(field - edge) * mix(4.0, 9.0, u_param3));
  float glow = 0.3 + u_param2 * 0.9;
  vec3 liquid = mix(u_colorA * 0.5, u_colorA, frag.y);
  vec3 wax = mix(u_colorB, u_accentColor, inner);
  vec3 color = mix(liquid, wax, blob);
  color += u_accentColor * rim * glow * 0.6 * pulse(u_audioBass, 0.4);
  color += u_accentColor * inner * glow * 0.5;
  color *= 0.62 + u_intensity * 1.05;
  color = pow(max(color, 0.0), vec3(0.92));
  gl_FragColor = vec4(finish(color, frag), 1.0);
}`,
  // === Sonara Atmospheres V5 — Lote 1 (etéreo × CodePen) ===
  // Bloom iridescente: brilhos suaves com reflexo nacarado deslizante, sem
  // pontos. Graves -> respiração do bloom; energia -> varredura de matiz.
  // Paleta cosseno no estilo Inigo Quilez (fórmula de uso livre).
  "iridescent-bloom": `${shaderPrelude}
vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  float t = u_time * (0.05 + u_speed * 0.40);
  vec2 p = (uv - 0.5) * ratio * (1.0 + u_param0 * 2.0);
  vec2 drift = direction() * t * (0.05 + u_param4 * 0.25);
  float warp = fbm(p * 1.3 + drift);
  float field = fbm(p * (0.8 + u_param1 * 1.6) + warp * (0.5 + u_param2 * 1.5) + drift);
  float bassPulse = 1.0 + u_audioBass * u_audioReaction * 0.6;
  vec2 c1 = vec2(0.34, 0.40) + 0.04 * vec2(sin(t * 0.7), cos(t * 0.5));
  vec2 c2 = vec2(0.68, 0.62) + 0.05 * vec2(cos(t * 0.6), sin(t * 0.8));
  float r = mix(0.5, 0.18, u_param3) / bassPulse;
  float bloom1 = smoothstep(r, 0.0, distance(uv, c1));
  float bloom2 = smoothstep(r * 1.2, 0.0, distance(uv, c2));
  float lum = field * 0.6 + (bloom1 + bloom2) * 0.5;
  float hue = field * (0.6 + u_param2) + u_time * 0.02 + (u_audioEnergy * 0.5 + u_audioCentroid * 0.35) * u_audioReaction;
  vec3 irid = cosPalette(hue, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
  vec3 base = mix(u_colorA, u_colorB, smoothstep(0.2, 0.9, field));
  vec3 color = mix(base, irid, (0.35 + u_param5 * 0.5) * lum);
  color += u_accentColor * (bloom1 + bloom2) * 0.25 * pulse(u_audioMid, 0.3);
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  // Nascimento etéreo: fbm radial expandindo de um núcleo brilhante. A massa
  // pulsa para fora a partir do centro (energia/grave), sem deriva lateral —
  // é o que o separa de smoke/clouds.
  "ether-birth": `${shaderPrelude}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * ratio;
  float t = u_time * (0.05 + u_speed * 0.40);
  float radius = length(p);
  float expansion = 1.0 + u_audioEnergy * u_audioReaction * 0.7;
  float scale = 1.0 + u_param0 * 2.5;
  // Seamless swirl: rotate sampling by radius (no atan, so no seam on -x axis).
  float swirl = u_param2 * 4.0 * radius - t * 0.3;
  float cs = cos(swirl), sn = sin(swirl);
  vec2 q = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
  float turbulence = fbm(q * scale * (2.0 + u_param1 * 4.0) + t * 0.15);
  // Concentric shells expanding outward from the core.
  float shells = sin(radius * (8.0 + u_param1 * 16.0) * scale - t * expansion * 4.0) * 0.5 + 0.5;
  float core = smoothstep(0.6, 0.0, radius / (0.35 + u_param3 * 0.5));
  float mass = smoothstep(0.1, 0.9, shells * 0.4 + turbulence * 0.5 + core * 0.7);
  vec3 color = mix(u_colorA, u_colorB, mass);
  color += u_accentColor * core * (0.4 + u_param4 * 0.6) * pulse(u_audioBass, 0.4);
  color += u_colorB * smoothstep(0.95, 0.2, radius) * mass * 0.18;
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  // Volume fluido: fbm faux-volumétrico (acúmulo leve de densidade em camadas)
  // com profundidade/oclusão e advecção interna. Energia -> advecção.
  // Reimplementação original inspirada na vibe "3D Fluid" (sem copiar código).
  "fluid-volume": `${shaderPrelude}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * ratio * (1.0 + u_param0 * 1.5);
  float t = u_time * (0.05 + u_speed * 0.40);
  vec2 advect = direction() * t * (0.1 + u_param4 * 0.3);
  float density = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 q = p + advect + vec2(fi * 0.05, -fi * 0.03);
    float layer = fbm(q * (1.2 + u_param1 * 1.8) + fi * 0.4 + density * (0.3 + u_param2));
    density += layer * (0.32 - fi * 0.03);
  }
  density += u_audioEnergy * u_audioReaction * 0.4;
  float volume = smoothstep(0.2, 1.1, density);
  vec3 deep = mix(u_colorA, u_colorB, volume);
  vec3 color = mix(deep, u_accentColor, smoothstep(0.6, 1.0, density) * (0.2 + u_param3 * 0.5));
  color *= mix(0.7, 1.05, volume);
  color += u_accentColor * pow(volume, 3.0) * 0.18 * pulse(u_audioMid, 0.25);
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  // Águas rasas infinitas: cáusticas de luz (rede de filamentos) sobre um
  // gradiente, com cintilação lenta e deriva. Médios -> cintilação.
  // Reimplementação original inspirada na vibe "Endless Shallows".
  "endless-shallows": `${shaderPrelude}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = uv * ratio * (2.0 + u_param0 * 3.0);
  float t = u_time * (0.06 + u_speed * 0.30);
  vec2 drift = direction() * t * (0.05 + u_param4 * 0.2);
  float warp = fbm(p * 0.8 + drift);
  vec2 cell = p + warp * (0.6 + u_param1 * 1.4) + drift;
  float c1 = abs(sin(cell.x * 1.3 + cell.y * 0.7 + t));
  float c2 = abs(sin(cell.y * 1.1 - cell.x * 0.5 - t * 0.8));
  float caustic = pow(1.0 - min(c1, c2), 2.5 + u_param2 * 3.0);
  float shimmer = caustic * pulse(u_audioMid, 0.5);
  vec3 water = mix(u_colorA, u_colorB, smoothstep(0.0, 1.0, uv.y + warp * 0.2));
  vec3 color = water + u_accentColor * shimmer * (0.4 + u_param3 * 0.6);
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  // Sonho de livro ilustrado: luz volumétrica quente (god-rays suaves) com halo
  // sobre um entardecer. Cintilação lenta; graves -> respiração do halo.
  "storybook-dream": `${shaderPrelude}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  float t = u_time * (0.04 + u_speed * 0.25);
  vec2 sun = vec2(0.5 + (u_param2 - 0.5) * 0.6, mix(0.18, 0.84, u_param5));
  vec2 d = (uv - sun) * ratio;
  float angle = atan(d.y, d.x);
  float radius = length(d);
  float rays = pow(fbm(vec2(angle * (3.0 + u_param0 * 6.0), radius * 2.0 - t)), 1.5);
  float beam = smoothstep(0.9, 0.0, radius) * (0.4 + rays * (0.4 + u_param1 * 0.8));
  float halo = smoothstep(0.5 + u_param3 * 0.4, 0.0, radius);
  vec3 sky = mix(u_colorA, u_colorB, smoothstep(0.0, 1.0, uv.y));
  vec3 color = sky + u_accentColor * (beam + halo * 0.6) * (0.5 + u_param4 * 0.5);
  color += u_accentColor * halo * 0.3 * pulse(u_audioBass, 0.25);
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  // Cromo líquido: campo de altura + normal-map fake -> metal anisotrópico com
  // reflexos especulares. Graves -> amplitude da ondulação.
  // Porte da técnica de LUMEN MODE0 (MIT) — ver NOTICE para atribuição.
  "liquid-chrome": `${shaderPrelude}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = uv * ratio * (1.5 + u_param0 * 3.0);
  float t = u_time * (0.05 + u_speed * 0.50);
  vec2 drift = direction() * t * 0.15;
  float amp = 1.0 + u_audioBass * u_audioReaction * 0.6;
  float e = 0.012;
  float h = fbm(p + drift);
  float hx = fbm(p + vec2(e, 0.0) + drift);
  float hy = fbm(p + vec2(0.0, e) + drift);
  float relief = (4.0 + u_param1 * 8.0) * amp;
  vec3 n = normalize(vec3((h - hx) * relief, (h - hy) * relief, 1.0));
  vec3 lightDir = normalize(vec3(0.5, 0.6, 0.7));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 reflectDir = reflect(-lightDir, n);
  float spec = pow(max(dot(reflectDir, viewDir), 0.0), mix(8.0, 48.0, u_param2));
  float diffuse = max(dot(n, lightDir), 0.0);
  float aniso = abs(sin((h + n.x) * (6.0 + u_param3 * 10.0)));
  vec3 metal = mix(u_colorA, u_colorB, diffuse);
  vec3 color = metal + u_accentColor * spec * (0.6 + u_param4 * 0.8);
  color = mix(color, u_accentColor, aniso * 0.12);
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  // V5.2 — referências CodePen usadas apenas como direção visual. Estes
  // shaders são originais e mantêm resposta musical limitada a luz/cor.
  "stratosphere-flight": `${shaderPrelude}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  float t = u_time * (0.05 + u_speed * 0.34);
  float horizon = mix(0.28, 0.68, u_param2);
  vec2 drift = direction() * t * (0.08 + u_param3 * 0.28);
  vec2 p = vec2((uv.x - 0.5) * ratio.x, uv.y - horizon);
  float depth = smoothstep(-0.18, 0.48, p.y);
  float cloudScale = mix(1.2, 4.8, u_param1);
  float cloud = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 layer = vec2(p.x * (1.0 + fi * 0.22), p.y * (1.9 + fi * 0.5));
    layer += drift * (0.4 + fi * 0.35) + vec2(0.0, -t * (0.08 + fi * 0.04));
    cloud += fbm(layer * cloudScale + fi * 1.7) * (0.34 - fi * 0.045);
  }
  float mass = smoothstep(0.42, 0.86, cloud + depth * (0.12 + u_param0 * 0.34));
  float runway = pow(max(0.0, 1.0 - abs(p.x) * 1.8), 3.0) * smoothstep(-0.16, 0.42, p.y);
  float streaks = pow(max(0.0, sin((p.y + t * (0.5 + u_param3)) * 16.0 + abs(p.x) * 7.0)), 5.0);
  float beatLight = 1.0 + u_audioBeat * u_audioReaction * 0.12 + u_audioEnergy * u_audioReaction * 0.1;
  vec3 sky = mix(u_colorA, u_colorB, smoothstep(0.05, 1.0, uv.y));
  vec3 color = mix(sky, u_colorB, mass * (0.2 + u_intensity * 0.36));
  color += u_accentColor * (runway * (0.16 + u_param4 * 0.38) + streaks * 0.06) * beatLight;
  color += u_colorB * smoothstep(0.9, 0.18, abs(uv.y - horizon)) * 0.08;
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  "shambhala-passage": `${shaderPrelude}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * ratio;
  float t = u_time * (0.04 + u_speed * 0.28);
  float r = length(p);
  float a = atan(p.y, p.x);
  float symmetry = floor(mix(5.0, 12.0, u_param0));
  float arch = abs(sin(a * symmetry + r * (4.0 + u_param1 * 8.0) - t));
  float corridor = pow(max(0.0, 1.0 - abs(p.x) * (1.0 + u_param2 * 1.4)), 2.2);
  float steps = pow(1.0 - abs(fract((r - t * 0.06) * (8.0 + u_param1 * 8.0)) - 0.5) * 2.0, 3.0);
  float mist = fbm(p * (2.0 + u_param2 * 3.0) + t * 0.12);
  float gate = smoothstep(0.82, 0.18, r) * (arch * (0.16 + u_param3 * 0.44) + steps * 0.18);
  float glow = corridor * smoothstep(0.72, 0.0, abs(p.y + 0.16)) * (0.22 + u_param4 * 0.54);
  vec3 stone = mix(u_colorA, u_colorB, mist * 0.5 + r * 0.35);
  vec3 color = stone + u_accentColor * (gate + glow) * (1.0 + u_audioMid * u_audioReaction * 0.14);
  color += u_colorB * corridor * 0.08;
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  "neural-haze": `${shaderPrelude}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * ratio * (1.0 + u_param0 * 2.4);
  float t = u_time * (0.05 + u_speed * 0.3);
  vec2 drift = direction() * t * (0.08 + u_param4 * 0.22);
  float field = fbm(p * (1.2 + u_param1 * 2.8) + drift);
  field += 0.5 * fbm(p * (3.1 + u_param1 * 3.0) - drift.yx * 0.7 + field);
  float contourFreq = mix(5.0, 18.0, u_param2);
  float contour = 1.0 - smoothstep(0.0, 0.08 + u_param3 * 0.1, abs(fract(field * contourFreq + t * 0.08) - 0.5));
  float pulse = 1.0 + (u_audioFlux * 0.4 + u_audioOnset * 0.35) * u_audioReaction;
  float node = smoothstep(0.96, 0.72, length(p + vec2(0.12, -0.04)));
  vec3 base = mix(u_colorA, u_colorB, smoothstep(0.16, 0.9, field));
  vec3 color = base + u_accentColor * (contour * (0.16 + u_param3 * 0.34) + node * 0.14) * pulse;
  color = mix(color, u_colorB, smoothstep(0.7, 0.2, length(p)) * 0.12);
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  "light-trails": `${shaderPrelude}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 ratio = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * ratio;
  float t = u_time * (0.05 + u_speed * 0.42);
  float trails = floor(mix(3.0, 8.0, u_param0));
  float width = mix(0.012, 0.08, u_param1);
  float bend = mix(0.14, 0.62, u_param2);
  float field = fbm(p * (1.4 + u_param5 * 2.2) + direction() * t * 0.16);
  float accum = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float active = step(fi + 0.5, trails);
    float lane = (fi + 0.5) / trails - 0.5;
    float wave = sin((p.x + field * bend) * (3.0 + fi * 0.42) + t * (1.0 + fi * 0.12)) * bend;
    float target = lane * 0.9 + wave * 0.22;
    float line = smoothstep(width * (1.8 + fi * 0.12), 0.0, abs(p.y - target));
    accum += line * (0.55 + fi * 0.06) * active;
  }
  float flare = pow(smoothstep(0.82, 0.0, length(p - vec2(0.22, 0.08))), 2.0);
  float response = 1.0 + (u_audioHigh * 0.2 + u_audioBeat * 0.16) * u_audioReaction;
  vec3 base = mix(u_colorA, u_colorB, field * 0.46 + uv.y * 0.24);
  vec3 color = base + u_accentColor * accum * (0.22 + u_param3 * 0.46) * response;
  color += u_colorB * flare * (0.08 + u_param4 * 0.22);
  gl_FragColor = vec4(finish(color, uv), 1.0);
}`,
  // === Sonara Atmospheres — Lote 2 (CodePen × Sabosugi) ===
  // Reimplementados na interface u_* fullscreen do Sonara a partir dos pens
  // públicos de Sabosugi (codepen.io/sabosugi). Adaptados, não copiados.

  // Topografia holográfica — linhas de contorno deformadas por "polos
  // magnéticos" com brilho holográfico (fresnel). Adaptado de "Chameleon
  // Topography" (codepen.io/sabosugi/pen/LEbENap).
  "holo-topography": `${shaderPrelude}
vec3 topoGradient(float t, vec3 c1, vec3 c2, vec3 c3) {
  t = clamp(t, 0.0, 1.0);
  vec3 b1 = mix(c1, c2, smoothstep(0.0, 0.5, t));
  vec3 b2 = mix(c2, c3, smoothstep(0.5, 1.0, t));
  return mix(b1, b2, step(0.5, t));
}
vec2 topoWarp(vec2 p, float t) {
  float c = cos(-2.57), s = sin(1.73);
  p *= mat2(c, -s, s, c);
  float warp = 0.4 + u_param2 * 1.4;
  vec2 pole1 = vec2(sin(t * -2.1), cos(t * 0.4)) * (-0.97);
  float d1 = sqrt(dot(p - pole1, p - pole1) + 1.0);
  p.y += sin(d1 * 2.4 - t * 3.0) * (-0.366) * warp;
  vec2 pole2 = vec2(cos(t * 0.7), -sin(t * 1.1)) * 2.71;
  float d2 = sqrt(dot(p - pole2, p - pole2) + 1.0);
  p.x += cos(d2 * 2.0 + t * 1.2) * 0.156 * warp;
  p.y += sin(p.x * 1.5 + t * -2.0) * 1.24;
  return p;
}
float topoMap(vec2 p, float t) {
  vec2 w = topoWarp(p, t);
  float freq = 8.0 + u_param0 * 24.0;
  float thick = 0.2 + u_param1 * 0.7;
  float power = 0.3 + u_param4 * 1.4;
  float wave = sin(w.y * freq);
  float nw = wave * thick + 0.5;
  return pow(clamp(nw, 0.0, 1.0), power) * 0.25;
}
vec3 topoNormal(vec2 p, float t) {
  vec2 e = vec2(0.01, 0.0);
  float h = topoMap(p, t);
  return normalize(vec3(topoMap(p + e.xy, t) - h, topoMap(p + e.yx, t) - h, 0.017));
}
void main() {
  vec2 frag = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time * (0.04 + u_speed * 0.5);
  vec2 uv = (gl_FragCoord.xy * 3.6 - u_resolution.xy) / u_resolution.y;
  vec3 n = topoNormal(uv, t);
  vec2 w = topoWarp(uv, t);
  float freq = 8.0 + u_param0 * 24.0;
  float lineID = floor((w.y * (freq * 0.934)) / 7.1931853);
  vec2 rotP = uv * mat2(cos(0.0), -sin(0.4), sin(0.7), cos(1.3));
  float gradPos = rotP.y * 0.35 + 0.3;
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 lightDir1 = normalize(vec3(0.4, 0.7, 0.6));
  vec3 lightDir2 = normalize(vec3(-0.6, -0.4, 0.3));
  vec3 baseColor = topoGradient(gradPos, u_colorA, u_colorB, u_accentColor);
  float internalGrad = smoothstep(-0.6, 1.0, n.y + n.x * 0.3);
  vec3 lineVol = mix(baseColor * 0.2, baseColor, internalGrad);
  float diff1 = max(dot(n, lightDir1), 0.0);
  float diff2 = max(dot(n, lightDir2), 0.0);
  vec3 refDir1 = reflect(-lightDir1, n);
  float spec1 = pow(max(dot(viewDir, refDir1), 0.0), 40.0) * 1.5;
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.4);
  float holo = 0.5 + u_param3 * 2.5;
  vec3 holoSpectrum = 0.5 + 0.5 * cos(u_time + w.x * 3.0 + lineID * 1.2 + vec3(0.0, 2.0, 4.0));
  vec3 color = lineVol * (diff1 * 0.8 + 0.1);
  color += baseColor * diff2 * 0.3;
  color += vec3(1.0, 0.95, 1.0) * spec1;
  color += holoSpectrum * fresnel * holo * pulse(u_audioHigh, 0.6);
  color *= 0.7 + u_intensity * 0.9;
  color = pow(max(color, 0.0), vec3(0.85));
  gl_FragColor = vec4(finish(color, frag), 1.0);
}`,

  // Esfera fractal — volume orgânico raymarched (SDFs com smin + turbulência,
  // paleta cosseno). Adaptado de "Colorful Magical Sphere"
  // (codepen.io/sabosugi/pen/OPbJJOr); rotação por tempo em vez do mouse.
  "fractal-sphere": `${shaderPrelude}
float sphereRand(vec2 p) { return fract(sin(dot(p, vec2(12.8998, 78.233))) * 43758.5453); }
vec3 sphereTanh(vec3 x) { vec3 e = exp(2.0 * clamp(x, -12.0, 12.0)); return (e - 1.0) / (e + 1.0); }
float sphereSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
vec3 spinPos(vec3 p, vec2 xRot, vec2 yRot) {
  p.yz = mat2(xRot.x, -xRot.y, xRot.y, xRot.x) * p.yz;
  p.xz = mat2(yRot.x, -yRot.y, yRot.y, yRot.x) * p.xz;
  return p;
}
float sphereScene(vec3 rp, float ct, float scale, float soft) {
  vec3 a = rp * scale; vec3 b = rp * scale;
  for (int k = 0; k < 4; k++) {
    float it = 2.3 + float(k) * 1.1;
    b += sin(0.6 * ct + a.zxy * (it * 0.3)) * 0.4;
    a += sin(ct + a.yzx * it) * 0.25;
  }
  float sa = length(a + 1.0) - 2.0;
  float sb = length(b - 1.3) - 2.9;
  return (abs(sphereSmin(sa, sb, soft)) * 0.1) / scale;
}
void main() {
  vec2 frag = gl_FragCoord.xy / u_resolution.xy;
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  float ct = u_time * (0.3 + u_speed * 1.3);
  float scale = 0.6 + u_param0 * 1.6;
  float soft = 0.6 + u_param1 * 2.4;
  float fadeOuter = 2.2 + u_param2 * 1.4;
  float fadeInner = fadeOuter - 0.2 - u_param3 * 1.2;
  float ax = u_time * (0.12 + u_speed * 0.25);
  float ay = u_time * 0.2;
  float td = -0.015 * sphereRand(gl_FragCoord.xy);
  vec3 acc = vec3(0.0);
  vec3 ro = vec3(0.0, 0.0, -4.5);
  vec3 rd = normalize(vec3(uv, 1.0));
  vec3 paletteTint = 0.55 + 0.45 * (u_colorA + u_colorB + u_accentColor);
  float paletteShift = u_param4 * 4.0;
  vec2 xRot = vec2(cos(ax), sin(ax));
  vec2 yRot = vec2(cos(ay), sin(ay));
  for (int i = 0; i < 64; i++) {
    vec3 cp = ro + rd * td;
    if (td > 10.0) break;
    float dc = length(cp);
    if (dc > fadeOuter + 0.01) { td += dc - fadeOuter; continue; }
    vec3 rp = spinPos(cp, xRot, yRot);
    float sd = sphereScene(rp, ct, scale, soft);
    float stepSize = 0.012 + sd;
    td += stepSize;
    float radialFade = smoothstep(fadeOuter, fadeInner, dc);
    vec3 pal = 1.0 + cos(rp.z + vec3(5.8, 4.1, 2.8) + paletteShift);
    pal *= paletteTint;
    acc += (pal / stepSize) * radialFade;
    if (acc.x > 25000.0 && acc.y > 25000.0 && acc.z > 25000.0) break;
  }
  float vig = max(length(uv), 0.2);
  vec3 col = sphereTanh(acc / (8000.0 * vig));
  col *= 1.0 + u_audioBass * u_audioReaction * 0.5;
  gl_FragColor = vec4(finish(col, frag), 1.0);
}`,

  // Fluxo fluido — volume torcido raymarched com paleta cosseno e grão óptico.
  // Adaptado de "Fluid Background" (codepen.io/sabosugi/pen/gbwNZPr).
  "fluid-flow": `${shaderPrelude}
float fluidHash(vec3 p) { p = fract(p * 0.9631); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
vec3 fluidTanh(vec3 x) { vec3 e = exp(2.0 * clamp(x, -12.0, 12.0)); return (e - 1.0) / (e + 1.0); }
void main() {
  vec2 frag = gl_FragCoord.xy / u_resolution.xy;
  vec2 uv = (2.1 * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y;
  float tAnim = u_time * (-(0.3 + u_speed * 0.9));
  float tFlight = 2.6 + u_param0 * 4.0;
  vec3 rayDir = normalize(vec3(uv, -1.6));
  vec3 acc = vec3(0.4);
  float grain = fluidHash(vec3(gl_FragCoord.xy, u_time * 5.0));
  float td = 1.2 + grain * 0.13;
  float lightInt = mix(8000.0, 42000.0, u_param1);
  vec3 base = mix(u_colorA, u_accentColor, u_param2) * 1.5;
  for (int i = 0; i < 80; i++) {
    vec3 pos = td * rayDir;
    pos.z -= tFlight;
    pos.z = mod(pos.z + 2.2, 4.0) - 2.4;
    vec3 rotAxis = normalize(cos(vec3(2.8, 2.0, -0.3) - td * 1.7));
    vec3 tw = rotAxis * dot(rotAxis, pos) - cross(rotAxis, pos);
    float scale = 7.4;
    for (int j = 0; j < 4; j++) { scale += 7.5; tw += sin(tw * scale + tAnim).yzx / scale; }
    float sv = tw.y;
    float stepD = 0.16 * abs(length(pos) - 1.9) + (-0.14) * abs(sv);
    td += stepD;
    vec3 pal = base * (cos(sv + vec3(3.4, -1.6, 5.3)) * 1.05 + 0.7);
    acc += (pal / max(stepD, 0.01)) * td;
    if (acc.x > 90000.0) break;
    if (td > 25.1) break;
  }
  vec3 col = fluidTanh(acc / lightInt);
  col += (grain - 0.5) * 0.02;
  col *= 1.0 + u_audioMid * u_audioReaction * 0.4;
  gl_FragColor = vec4(finish(col, frag), 1.0);
}`,

  // Paisagem mágica — terreno rochoso volumétrico com paleta cíclica.
  // Adaptado de "Magical Landscape" (codepen.io/sabosugi/pen/OPbXXoN).
  "terrain-magic": `${shaderPrelude}
float landHash(vec2 p) { p = fract(p * vec2(125.86, 458.36)); p += dot(p, p + 44.21); return fract(p.x * p.y); }
float landIGN(vec2 p) { vec3 m = vec3(0.02711056, 0.00583715, 52.9829189); return fract(m.z * fract(dot(p, m.xy))); }
float landNoise(vec2 x) {
  vec2 p = floor(x); vec2 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  float a = landHash(p); float b = landHash(p + vec2(1.0, 0.0));
  float c = landHash(p + vec2(0.0, 1.0)); float d = landHash(p + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec3 landTanh(vec3 x) { vec3 e = exp(2.0 * clamp(x, -10.0, 10.0)); return (e - 1.0) / (e + 1.0); }
vec3 landGradient(float t, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
  t = fract(t);
  if (t < 0.25) return mix(c1, c2, smoothstep(0.0, 0.25, t));
  if (t < 0.50) return mix(c2, c3, smoothstep(0.25, 0.50, t));
  if (t < 0.75) return mix(c3, c4, smoothstep(0.50, 0.75, t));
  return mix(c4, c1, smoothstep(0.75, 1.0, t));
}
float landTerrain(vec3 p, float scaleU, float baseH, float ampU) {
  if (p.y > 6.0) return p.y;
  vec2 uv = p.xz * scaleU + 13.0;
  float h = baseH; float a = ampU;
  for (int j = 0; j < 3; j++) {
    h += landNoise(uv) * a;
    uv = uv * mat2(-0.163296, 8.20684, 2.54316, 5.356704);
    uv += vec2(-4.8, 11.5); a *= 0.3;
  }
  return p.y + h - 2.3;
}
void main() {
  vec2 frag = gl_FragCoord.xy / u_resolution.xy;
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  float time = u_time * (0.3 + u_speed * 0.6);
  float scaleU = 0.4 + u_param0 * 0.8;
  float baseH = 0.5 + u_param1 * 1.2;
  float ampU = 0.5 + u_param2 * 1.2;
  float fstep = 0.012 + u_param3 * 0.03;
  vec3 ro = vec3(0.0, 2.7, time * 2.0);
  vec3 rd = normalize(vec3(uv, 1.0));
  float pc = cos(0.17), ps = sin(0.17); rd.yz = mat2(pc, ps, -ps, pc) * rd.yz;
  vec3 acc = vec3(3.0);
  float d = landHash(gl_FragCoord.xy) * 0.03;
  for (int i = 1; i <= 64; i++) {
    if (d > 60.0) break;
    vec3 p = ro + rd * d;
    float terr = landTerrain(p, scaleU, baseH, ampU);
    float shape;
    if (terr > 4.0) { shape = terr; }
    else {
      vec3 p3 = p * 2.5 + 13.0; vec3 sinP = sin(p3); vec3 cosP = cos(vec3(p3.y, p3.z, p3.x));
      float sn = dot(sinP, cosP) * 0.5; shape = max(sn, terr);
    }
    float s = fstep + 0.06 * abs(shape - float(i) * 0.02);
    d += s;
    vec3 baseColor = landGradient(float(i) * 0.04, u_colorA, u_colorB, u_accentColor, u_colorB) * 1.4;
    acc += max(baseColor / s, -d * d * 0.42);
  }
  vec3 tone = landTanh((acc * acc) * 0.00000125);
  tone += (landIGN(gl_FragCoord.xy) - 0.5) * 0.004;
  tone *= 1.0 + u_audioBass * u_audioReaction * 0.4;
  gl_FragColor = vec4(finish(tone, frag), 1.0);
}`,

  // Voo atmosférico — voo volumétrico sobre colinas com névoa luminosa e
  // tone mapping ACES. Adaptado de "Flight Through the Atmosphere"
  // (codepen.io/sabosugi/pen/gbLPgeL).
  "terrain-flight": `${shaderPrelude}
float flightHash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float flightHash(float n) { return fract(sin(n) * 43758.7253); }
vec3 flightTone(vec3 c) {
  mat3 m1 = mat3(0.59719, 0.17600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  mat3 m2 = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = m1 * c; vec3 a = v * (v - 0.3254214) - 0.000090537; vec3 b = v * (0.973729 * v + 0.3429510) + 0.018081;
  return m2 * (a / b);
}
float flightValue(vec3 x) {
  vec3 p = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  float n = p.x + p.y * 157.0 + 113.0 * p.z;
  float res = mix(mix(mix(flightHash(n + 0.0), flightHash(n + 1.0), f.x), mix(flightHash(n + 157.0), flightHash(n + 158.0), f.x), f.y),
                  mix(mix(flightHash(n + 113.0), flightHash(n + 114.0), f.x), mix(flightHash(n + 270.0), flightHash(n + 271.0), f.x), f.y), f.z);
  return res * 1.8 + 1.7;
}
float flightFine(vec3 p, float freq, float amp) {
  float value = -1.1; float a = amp; p *= freq;
  for (int k = 0; k < 3; k++) { value += a * flightValue(p); p *= 1.8; a *= 0.9; }
  return value;
}
void main() {
  vec2 frag = gl_FragCoord.xy / u_resolution.xy;
  float time = u_time * (0.4 + u_speed * 1.4);
  vec3 rayPos = vec3(-1.0, 0.8, time * 3.0);
  vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y;
  vec3 rayDir = normalize(vec3(uv, 0.30));
  float rc = cos(0.76), rs = sin(0.76); rayDir.yz = mat2(rc, -rs, rs, rc) * rayDir.yz;
  float dither = flightHash12(gl_FragCoord.xy);
  rayPos += rayDir * dither * 0.8;
  float terrainHeight = 0.3 + u_param0 * 1.0;
  float freq = 1.0 + u_param1 * 3.0;
  float amp = 0.1 + u_param2 * 0.5;
  float fogStep = 1.2 + u_param3 * 1.6;
  vec3 colorPhase = vec3(3.7, 1.5, 1.0) + (u_accentColor - 0.5) * 2.0;
  vec3 acc = vec3(27.2);
  for (int k = 0; k < 44; k++) {
    float fi = 8.8 + float(k);
    float height = flightFine(vec3(rayPos.xz * 0.52, 4.3), freq, amp) * terrainHeight;
    float dist = max(abs(rayPos.y - height), 0.40);
    rayPos += rayDir * dist * fogStep;
    vec3 color = 1.0 + sin(fi * 0.12 + length(rayPos.xz * 0.15) + colorPhase);
    acc += color / dist;
  }
  vec3 finalColor = (acc * acc) / 2600.0;
  finalColor = mix(finalColor, finalColor * (0.55 + u_colorA + u_colorB), 0.45);
  finalColor += dither * 0.0425;
  vec3 tone = flightTone(finalColor);
  tone *= 1.0 + u_audioEnergy * u_audioReaction * 0.3;
  gl_FragColor = vec4(finish(tone, frag), 1.0);
}`,
  // CRT / tubo de fósforo. A TÉCNICA (curva, scanline, máscara tríade, halation,
  // barra de rolagem, sheen, vinheta, flicker, grão) é o shader upstream do ThreeUI
  // (crtShaders.ts, MIT). O CONTEÚDO é gerado aqui, no próprio shader: o upstream
  // amostrava uma textura com telas de terceiros (BSOD do Windows, terminal ZION do
  // Matrix) e isso foi excluído na auditoria SH12. Gerar o conteúdo no shader é o que
  // torna a exclusão estrutural em vez de uma promessa: não existe textura onde
  // possa haver tela de terceiro. Ver .dev/tasks/completed/legal-audit/.
  //
  // Contrato de params (avançado = contrato com o shader, controls = camada de UI).
  // São 7 slots: param0..param6. O 0 é o variant (índice cru, do picker), então
  // restam 6 controles. A velocidade NÃO é um deles — vem do controle comum `speed`.
  //   param0 variant (índice cru 0..3, nunca normalizado)
  //   param1 curve      param2 scanDensity  param3 scanDepth
  //   param4 chroma     param5 grain        param6 vignette
  crt: `${shaderPrelude}
// Duas funções de ruído com corpos diferentes, de propósito: crtHash é
// determinística por célula (o conteúdo do scope precisa ser estável no tempo),
// crtHash21 é o grão de estática e muda a cada frame.
float crtHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float crtHash21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// O slot de movimento não existe: o runtime expõe u_param0..u_param6 (7 slots, e
// o 0 é o variant), então o oitavo controle seria o nono. A velocidade do tubo vem
// do controle COMUM "speed", que já existe e é exatamente onde o usuário espera
// regular velocidade — um "Movimento" duplicando isso seria um slider a mais.
float motionOf(){ return 0.30 + u_speed * 0.9; }

// Conteúdo autoral, desenhado no espaço da tela. Os 4 ramos são formas de scope
// de áudio: onda, espectro, grade+varredura, anéis. Nenhuma letra, nenhum logo.
vec3 crtContent(vec2 uv, float t) {
  vec2 p = uv - 0.5;
  float energy = u_audioEnergy;
  int v = int(u_param0 + 0.5);

  if (v == 0) {
    // scope de onda: traço de fósforo com brilho e cauda
    float f = 1.6 + u_audioMid * 2.2;
    float wave = sin(uv.x * f * 6.28318 + t * 1.7) * 0.5;
    wave += sin(uv.x * f * 2.1 * 6.28318 - t * 1.1) * 0.22 * (0.4 + energy);
    float y = 0.5 + wave * (0.16 + u_audioBass * 0.20);
    float d = abs(uv.y - y);
    float core = smoothstep(0.012, 0.0, d);
    float tail = smoothstep(0.075, 0.0, d) * 0.30;
    float axis = smoothstep(0.0015, 0.0, abs(p.y)) * 0.22;
    float tick = step(0.965, fract(uv.x * 8.0)) * 0.06;
    return vec3(0.16, 1.0, 0.42) * (core + tail) + vec3(0.10, 0.55, 0.26) * (axis + tick);
  }

  if (v == 1) {
    // espectro: barras com pico suavizado
    float bins = 34.0;
    float idx = floor(uv.x * bins);
    float f = crtHash21(vec2(idx, 3.0));
    float h = 0.10 + f * 0.20 + u_audioEnergy * (0.20 + f * 0.34);
    float inBar = step(uv.y, h) * step(0.18, fract(uv.x * bins));
    float peak = smoothstep(0.010, 0.0, abs(uv.y - h));
    float floorLine = smoothstep(0.002, 0.0, abs(uv.y - 0.09)) * 0.30;
    vec3 tint = mix(vec3(0.20, 1.0, 0.55), vec3(0.35, 0.85, 1.0), uv.x);
    return tint * (inBar * 0.42 + peak * 0.85) + vec3(0.10, 0.42, 0.28) * floorLine;
  }

  if (v == 2) {
    // grade + linha de varredura girando a partir do centro
    vec2 g = abs(fract(uv * vec2(12.0, 8.0)) - 0.5);
    float grid = smoothstep(0.055, 0.0, min(g.x, g.y)) * 0.20;
    float a = t * 0.55 * (0.4 + motionOf());
    float r = length(p);
    // um raio girando: distância angular ao ângulo atual, 0 = sobre o raio
    float sweep = abs(fract((atan(p.y, p.x) + a) * 0.1592) - 0.5);
    float line = smoothstep(0.045, 0.0, sweep) * smoothstep(0.46, 0.10, r);
    float dot0 = smoothstep(0.030, 0.0, r) * 0.9;
    return vec3(1.0, 0.68, 0.22) * (grid + line * 0.85) + vec3(0.9, 0.55, 0.15) * dot0;
  }

  // Túnel: anéis recuando para o centro. O aspect precisa entrar pelo X (não pelo
  // Y) para o resultado ser um círculo e não um disco achatado — escalando o Y a
  // forma vira uma elipse larga e a leitura perde a profundidade.
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  float r = length(vec2(p.x * aspect, p.y)) / max(aspect, 1.0) * 1.9;
  float spin = t * 0.55 * (0.4 + motionOf());
  // anéis finos e nítidos, com brilho caindo para fora
  float band = abs(fract(r * 6.0 - spin) - 0.5) * 2.0;
  float ring = smoothstep(0.42, 0.02, band);
  float depth = smoothstep(1.05, 0.06, r);
  // núcleo: o ponto de fuga do túnel
  float core = smoothstep(0.13, 0.0, r);
  vec3 cold = vec3(0.30, 0.62, 1.0);
  vec3 hot = vec3(0.92, 0.97, 1.0);
  vec3 col = cold * ring * depth * 1.55;
  col += hot * core * (0.85 + u_audioEnergy * 0.9);
  // luz do anel mais próximo de dentro, para o profundidade aparecer
  col += cold * smoothstep(0.30, 0.0, r) * 0.20;
  return col;
}

void main() {
  vec2 res = max(u_resolution, vec2(1.0));
  vec2 raw = gl_FragCoord.xy / res;
  float t = u_time;
  float motion = motionOf();

  // --- técnica do tubo (upstream) -------------------------------------------
  float curve = 0.06 + u_param1 * 0.26;
  vec2 uv = raw * 2.0 - 1.0;
  vec2 o = uv.yx * uv.yx;
  uv += uv * o * curve;
  uv = uv * 0.5 + 0.5;

  // dentro/fora da tela (a curvatura empurra as bordas para fora)
  vec2 inb = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  float inside = inb.x * inb.y;
  vec2 ed = min(uv, 1.0 - uv);
  inside *= smoothstep(0.0, 0.020, min(ed.x, ed.y));

  // aberração cromática radial
  vec2 dir = uv - 0.5;
  float d2 = dot(dir, dir);
  vec2 ab = dir * (0.0012 + 0.0085 * d2) * (0.4 + u_param4 * 1.6);
  vec3 col;
  col.r = crtContent(uv + ab, t).r;
  col.g = crtContent(uv, t).g;
  col.b = crtContent(uv - ab, t).b;

  // halation: anel largo de amostras para o fósforo florescer no vidro
  float halo = 0.045 + u_audioEnergy * 0.05;
  float hs = 0.0042;
  vec3 wide = crtContent(uv + vec2(hs, 0.0), t) + crtContent(uv - vec2(hs, 0.0), t)
            + crtContent(uv + vec2(0.0, hs), t) + crtContent(uv - vec2(0.0, hs), t);
  col += wide * (halo / 4.0);

  // scanline: seno ao longo de y, rolando com o tempo
  // Scanline: a densidade é medida em PIXELS, não em linhas absolutas. Com um
  // número fixo (194 linhas), a 270px de altura isso dá 2,8px por ciclo e cai
  // acima de Nyquist: a grade vira ruído e mudar o controle não muda nada — foi
  // medido como inerte. Derivando da altura, o ciclo fica entre ~24px e ~7px em
  // qualquer resolução, então o controle volta a ter efeito e a aparência
  // continua igual entre o preview e o export.
  float density = (u_resolution.y / 6.0) * (0.5 + u_param2 * 1.2);
  float sl = sin(uv.y * 3.14159265 * density + t * 4.0 * motion);
  col *= mix(1.0 - u_param3 * 0.62, 1.0, sl * sl);

  // máscara tríade (grade de abertura de fósforo)
  float triad = 180.0 + u_param4 * 120.0;
  float gx = gl_FragCoord.x * (6.2831853 / triad);
  float grille = 0.10 + u_param4 * 0.22;
  vec3 mask = (1.0 - grille) + grille * cos(gx + vec3(0.0, 2.094, 4.188));
  col *= mix(vec3(1.0), mask, 0.85);

  // barra de rolagem + flicker
  float bar = fract(uv.y * 0.5 - t * 0.07 * motion);
  bar = smoothstep(0.0, 0.05, bar) * smoothstep(0.18, 0.05, bar);
  col += bar * 0.022 * motion;
  col *= 1.0 - (0.012 + u_audioOnset * 0.02) * sin(t * 8.0);

  // brilho de vidro no topo + vinheta
  float sheen = smoothstep(0.55, 0.0, distance(uv, vec2(0.50, 0.15)));
  col += sheen * 0.028;
  // Vinheta: o falloff precisa cobrir área VISÍVEL. Começando em 0.98, o controle
  // só agia onde a sala já era preta, então não havia pixel para escurecer e ele
  // media 0.0002 — inerte. Escurecendo a partir de 1.15 e com o alcance todo,
  // ele passa a actuar sobre a parte útil da imagem.
  float vig = smoothstep(1.15, 0.15, length((uv - 0.5) * vec2(1.05, 1.0)));
  col *= mix(1.0 - u_param6 * 0.85, 1.0, vig);

  // grão
  col += (crtHash(raw * res * 0.5 + vec2(floor(t * 24.0))) - 0.5) * u_param5 * 0.20;

  // sala escura fora do tubo
  vec3 room = vec3(0.016, 0.020, 0.030);
  col = mix(room, col, inside);
  col = max(col, room * 0.5);
  gl_FragColor = vec4(col, 1.0);
}`,
  // Liquid Form / metal líquido. Metaball raymarched com deslocamento por simplex
  // noise e iluminação de ambiente (key + rim + fill + painel), do ThreeUI
  // (src/shaders/liquid-form/liquidFormShaders.ts, MIT). Sem texto, sem marca, sem
  // asset: técnica pura.
  //
  // Diferença em relação ao upstream, que não é cosmética: ele interpola a
  // CÂMERA pelo mouse a cada frame (u_mouse + u_mouse_amount). Isso não é
  // reproduzível e export determinístico é regra do Sonara — o mesmo motivo que
  // trocou o ponteiro do laser por controles (ver SH11). Aqui vira rotateX/rotateY/
  // rotate, com deriva por u_time por baixo para não ficar estático.
  //
  // Contrato de params (avançado = contrato com o shader, controls = camada de UI):
  //   param0 variant (índice cru 0..3, nunca normalizado)
  //   param1 morph     param2 noiseScale  param3 camera
  //   param4 rotateX   param5 rotateY    param6 rotate
  //
  // Custo: MAX_STEPS 48 (o upstream usa 70) x 3 snoise por map(), e calcNormal
  // chama map() mais 4x. São ~340 avaliações de simplex por pixel. Baixei de 70
  // para 48 porque o ganho visual era imperceptível e o custo é linear nos passos.
  liquidform: `${shaderPrelude}
#define LF_STEPS 72
#define LF_MAX_DIST 20.0
#define LF_SURF_DIST 0.0025
// Com morph alto o campo deixa de ser um SDF válido (o gradiente não é mais 1),
// e o passo "d += ds" passa a dar overshoot: o raio pula a superfície e aparece
// uma costura fina cortando o blob. Backlog de Marching Marchando: dividir o
// passo por uma cota do gradiente. 0.72 é o menor valor que remove a costura
// sem custar passos extras.
#define LF_STEP 0.72

vec3 lfMod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 lfMod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 lfPermute(vec4 x){ return lfMod289(((x * 34.0) + 1.0) * x); }
vec4 lfTaylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

// simplex noise 3D (Ashima/Gustavson, como o upstream)
float lfSnoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = lfMod289(i);
  vec4 p = lfPermute(lfPermute(lfPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = lfTaylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// Orientação da câmera vinda dos controles, com deriva lenta por u_time.
mat2 lfRot(float a){ float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }

float lfMap(vec3 p, float t) {
  float morph = lfSnoise(p * (0.8 * u_param2) + t * 0.1) * 0.2;
  morph += lfSnoise(p * (1.5 * u_param2) - t * 0.05 + 10.0) * 0.08;
  morph += lfSnoise(p * (3.0 * u_param2) + t * 0.02) * 0.02;
  return length(p) - 1.8 + morph * u_param1;
}

vec3 lfNormal(vec3 p, float t) {
  // O epsilon da normal é 0.002 (o do upstream) e isso é pequeno demais para um
  // campo com ruído: a diferença finita passa a ser dominada pela variação rápida
  // do noise, a normal fica ruidosa, e aparece um filete escuro onde ela gira —
  // uma linha fina cortando o metal. Confirmado por teste: com noiseScale=0 a
  // esfera sai limpa, então o filete vem do ruído, não da geometria. 0.012 é uma
  // fração da menor estrutura do noise (~0.76 em espaço p), então ainda resolve
  // a forma, mas não mede o ruído.
  vec2 e = vec2(0.012, 0.0);
  return normalize(vec3(
    lfMap(p + e.xyy, t) - lfMap(p - e.xyy, t),
    lfMap(p + e.yxy, t) - lfMap(p - e.yxy, t),
    lfMap(p + e.yyx, t) - lfMap(p - e.yyx, t)
  ));
}

// O material vem da VARIANTE, não de um slider: é o que define se o blob é
// cromo, mercúrio, óleo ou cobre. Key/rim/fill são o mesmo rig nos quatro, mas
// o GANHO e o AMBIENTE diferem por material — sem isso o cromo sai perlado em vez
// de espelhado, porque o ambiente preenche os shadows e não sobra preto.
vec3 lfEnv(vec3 rd, vec2 aim, int v) {
  vec3 col;
  vec3 keyTint, rimTint, fillTint, specTint;
  float keyGain, ambient;
  if (v == 1) {          // mercúrio: contraste alto, quase sem preenchimento
    keyTint = vec3(0.86, 0.88, 0.95); rimTint = vec3(0.55, 0.60, 0.70);
    fillTint = vec3(0.10); specTint = vec3(1.0);
    keyGain = 1.9; ambient = 0.012;
  } else if (v == 2) {   // película de óleo: iridescente por espessura
    keyTint = vec3(0.70, 0.55, 0.95); rimTint = vec3(0.25, 0.70, 0.75);
    fillTint = vec3(0.12, 0.10, 0.16); specTint = vec3(0.95, 0.90, 1.0);
    keyGain = 1.4; ambient = 0.035;
  } else if (v == 3) {   // cobre: quente, com sombra oca
    keyTint = vec3(1.0, 0.72, 0.48); rimTint = vec3(0.70, 0.34, 0.18);
    fillTint = vec3(0.16, 0.08, 0.04); specTint = vec3(1.0, 0.85, 0.70);
    keyGain = 1.7; ambient = 0.025;
  } else {               // cromo polido: especular duro, sombra profunda
    keyTint = vec3(0.98, 0.97, 0.95); rimTint = vec3(0.52, 0.56, 0.62);
    fillTint = vec3(0.14); specTint = vec3(1.0);
    keyGain = 2.4; ambient = 0.008;
  }
  col = vec3(ambient);
  vec3 keyDir = normalize(vec3(0.5 + aim.x, 1.0 + aim.y * 0.5, 1.2));
  float key = pow(max(dot(rd, keyDir), 0.0), 12.0);
  float rim = pow(max(dot(rd, normalize(vec3(-0.8, -0.2, -1.0))), 0.0), 6.0);
  float fill = pow(max(dot(rd, normalize(vec3(-1.0, 0.5, 0.5))), 0.0), 3.0);
  float panel = exp(-pow((rd.y - 0.2) * 4.0, 2.0)) * smoothstep(-0.5, 0.5, rd.z);
  col += keyTint * key * keyGain;
  col += rimTint * rim * 0.8;
  col += fillTint * fill * 0.6;
  col += vec3(0.15) * panel;
  return col;
}

void main() {
  vec2 res = max(u_resolution, vec2(1.0));
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - res * 0.5) / min(res.x, res.y);
  float t = u_time * 0.8 * (0.4 + u_speed * 0.5);
  int v = int(u_param0 + 0.5);

  // Câmera: os controles viram a mira, com deriva lenta por baixo para o blob
  // nunca ficar parado. É aqui que o u_mouse do upstream morre.
  vec2 aim = (vec2(u_param4, u_param5) - 0.5) * 2.0;
  aim += vec2(sin(t * 0.31), cos(t * 0.23)) * 0.10;
  float roll = (u_param6 - 0.5) * 3.14159 + sin(t * 0.17) * 0.05;
  vec2 ruv = lfRot(roll) * uv;

  vec3 ro = vec3(0.0, 0.0, 2.6 + u_param3 * 2.4);
  vec3 fwd = normalize(vec3(aim.x, aim.y, 0.0) - ro);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  vec3 rd = normalize(fwd + ruv.x * right + ruv.y * up);

  vec3 col = mix(vec3(0.02), vec3(0.05), length(ruv) * 0.5);
  float d = 0.0;
  for (int i = 0; i < LF_STEPS; i++) {
    vec3 p = ro + rd * d;
    float ds = lfMap(p, t);
    d += ds * LF_STEP;
    if (d > LF_MAX_DIST || abs(ds) < LF_SURF_DIST) break;
  }
  if (d < LF_MAX_DIST) {
    vec3 p = ro + rd * d;
    vec3 n = lfNormal(p, t);
    vec3 ref = reflect(rd, n);
    float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
    fresnel = mix(0.4, 1.0, fresnel);
    vec3 env = lfEnv(ref, aim, v);
    col = env * fresnel * 1.8;
    vec3 lightPos = normalize(vec3(0.5 + aim.x, 1.0, 1.0));
    // O upstream usa pow(..., 60.0). Exponente alto num vetor de reflexão é
    // ALIASING ESPECULAR: o pico é tão estreito que a menor variação numérica de
    // "ref" entre pixels vizinhos o liga e desliga, e o resultado é um filete
    // escuro cortando o metal. O outro shader do proprio runtime já usava 48 como
    // teto (mix(8.0, 48.0, ...)) — aqui o teto é 32, e o ganho compensa o pico
    // mais largo para o brilho não cair.
    float spec = pow(max(dot(ref, lightPos), 0.0), 32.0);
    col += lfEnv(vec3(0.0, 0.0, 1.0), aim, v) * spec * 2.6;
    // a película de óleo tem cor dependente da espessura (distância ao núcleo)
    if (v == 2) {
      float film = clamp(1.0 - (length(p) - 1.8) * 1.6, 0.0, 1.0);
      col *= 0.65 + 0.55 * cos(6.2831 * (film * 2.2 + vec3(0.0, 0.33, 0.67)));
    }
    // O upstream usa isto como pista de profundidade na silhueta:
    //   col *= mix(0.7, 1.0, smoothstep(-0.1, 0.1, disp))
    // Mas "disp" é exatamente o deslocamento do noise, então o smoothstep
    // desenha a CURVA DE NÍVEL ZERO do ruído — uma linha fina cortando o blob.
    // Com o morph do upstream (fraco) ela ficava imperceptível; com morph alto
    // virou um risco visível atravessando o metal. Alargar o intervalo e
    // reduzir a força devolve um gradiente suave em vez de um contorno.
    float disp = lfMap(p, t) - (length(p) - 1.8);
    col *= mix(0.88, 1.0, smoothstep(-0.45, 0.45, disp));
  }
  col += vec3(0.02, 0.02, 0.02) * exp(-length(ruv) * 2.5);
  // Tonemap do upstream (col/(col+0.5) + gamma 2.2): é o que mantém o fundo preto
  // e o cromo lendo como metal em vez de plástico.
  col = col / (col + 0.5);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}`,
};

const blendModes = {
  normal: "source-over",
  screen: "screen",
  multiply: "multiply",
  overlay: "overlay",
  lighter: "lighter",
};

const ATMOSPHERE_BASE_LAYER_ID = "atmosphere-base";
const ATMOSPHERE_EXTRA_LAYER_ID = "atmosphere-2";

function atmosphereLayerIdFromStackItem(item = {}) {
  return item.kind === "atmosphere" && item.layerId
    ? String(item.layerId)
    : ATMOSPHERE_BASE_LAYER_ID;
}

function resolveAtmosphereLayers(scene = {}) {
  const source = Array.isArray(scene.atmosphereLayers)
    ? scene.atmosphereLayers.slice(0, 2)
    : [];
  if (!source.length) {
    return [createRuntimeAtmosphereLayer({}, scene, 0)];
  }
  return source.map((layer, index) =>
    createRuntimeAtmosphereLayer(
      layer,
      index === 0 ? scene : (source[0]?.scene ?? scene),
      index,
    ),
  );
}

function createRuntimeAtmosphereLayer(item = {}, fallbackScene = {}, index) {
  const isBase = index === 0;
  const blendMode = blendModes[item.blendMode] ? item.blendMode : undefined;
  return {
    id: isBase ? ATMOSPHERE_BASE_LAYER_ID : ATMOSPHERE_EXTRA_LAYER_ID,
    name: String(item.name || (isBase ? "Fundo visual" : "Atmosfera 2")),
    visible: item.visible !== false,
    opacity: clampNumber(Number(item.opacity ?? (isBase ? 100 : 55)), 0, 100),
    blendMode: blendMode ?? (isBase ? "normal" : "screen"),
    scene:
      item.scene && typeof item.scene === "object" ? item.scene : fallbackScene,
  };
}

export function legacyRenderStack(scene, composition) {
  const atmosphereLayers = resolveAtmosphereLayers(scene);
  const explicitAtmosphereLayers =
    Array.isArray(scene.atmosphereLayers) && scene.atmosphereLayers.length > 0;
  const stack = explicitAtmosphereLayers
    ? atmosphereLayers.map((layer) => ({
        kind: "atmosphere",
        layerId: layer.id,
      }))
    : [{ kind: "atmosphere" }];
  if (
    !explicitAtmosphereLayers &&
    scene.cloudLight?.enabled &&
    scene.rendererId !== "volumetric-clouds"
  ) {
    stack.push({ kind: "sun-focus" });
  }
  stack.push({ kind: "post" });
  for (const layer of [...(composition.layers ?? [])].reverse()) {
    if (layer.visible !== false && layer.element) {
      stack.push({ kind: "media", layerId: layer.id, order: layer.order });
    }
  }
  if (scene.rendererId === "vinyl") {
    stack.push({ kind: "vinyl" });
  }
  if (scene.waveform?.visible) {
    stack.push({ kind: "waveform" });
  }
  return stack;
}

function createRenderCache(scene, composition) {
  const atmosphereLayers = resolveAtmosphereLayers(scene);
  const explicitAtmosphereLayers =
    Array.isArray(scene.atmosphereLayers) && scene.atmosphereLayers.length > 0;
  const stack =
    Array.isArray(composition.renderOrder) && composition.renderOrder.length > 0
      ? composition.renderOrder
      : Array.isArray(scene.renderOrder) && scene.renderOrder.length > 0
        ? scene.renderOrder
        : legacyRenderStack(scene, composition);
  const atmosphereLayerMap = new Map(
    atmosphereLayers.map((layer) => [layer.id, layer]),
  );
  const mediaLayerMap = new Map(
    (composition.layers ?? []).map((layer) => [layer.id, layer]),
  );
  return {
    atmosphereLayers,
    explicitAtmosphereLayers,
    metadata: createMetadataRenderCache(),
    post: createPostRenderCache(),
    resolvedStack: resolveRenderStackItems(
      stack,
      atmosphereLayers,
      atmosphereLayerMap,
      mediaLayerMap,
    ),
    stack,
    waveform: createWaveformRenderCache(),
  };
}

function resolveRenderStackItems(
  stack,
  atmosphereLayers,
  atmosphereLayerMap,
  mediaLayerMap,
) {
  return stack.map((item) => {
    if (item.kind === "atmosphere") {
      return {
        ...item,
        layer:
          atmosphereLayerMap.get(atmosphereLayerIdFromStackItem(item)) ??
          atmosphereLayers[0],
        rendererCache: createAtmosphereRendererCache(),
      };
    }
    if (item.kind === "media") {
      const layer = mediaLayerMap.get(item.layerId);
      return {
        ...item,
        layer,
        mediaState: createMediaLayerRenderState(layer),
      };
    }
    return item;
  });
}

function createMediaLayerRenderState(layer) {
  if (!layer) return null;
  const element = layer.element;
  const visible = layer.visible !== false;
  const shadow = layer.shadow ?? {};
  const blur = layer.blur;
  const maskOpacity = layer.maskOpacity;
  return {
    bounds: {},
    compositeOperation: blendModes[layer.blendMode] ?? "source-over",
    coverFadeOut: layer.coverFadeOut,
    element,
    enabled: visible && Boolean(element),
    fadeIn: layer.fadeIn,
    filter: blur ? `blur(${Math.max(0, blur)}px)` : null,
    fitCover: layer.fit === "cover",
    maskFillStyle: maskOpacity
      ? `rgba(0,0,0,${Math.max(0, Math.min(100, maskOpacity)) / 100})`
      : null,
    opacity: layer.opacity,
    rotation: ((layer.rotation ?? 0) * Math.PI) / 180,
    scale: (layer.scale ?? 100) / 100,
    shadowBlur: shadow.blur ?? 0,
    shadowColor: `rgba(0,0,0,${(shadow.opacity ?? 0) / 100})`,
    shadowOffsetX: shadow.x ?? 0,
    shadowOffsetY: shadow.y ?? 0,
    visible,
    x: (layer.x ?? 50) / 100,
    y: (layer.y ?? 50) / 100,
    zoom: layer.zoom,
  };
}

function createAtmosphereRendererCache() {
  return {
    linearGradients: [],
    pianoState: null,
    playfulState: null,
    vectorState: null,
  };
}

function createMetadataRenderCache() {
  return {
    layout: undefined,
    width: 0,
    height: 0,
    durationKey: "",
    mediaKey: "",
    fontStatus: "",
  };
}

function createPostRenderCache() {
  return {
    grain: {
      canvas: null,
      context: null,
      image: null,
      width: 0,
      height: 0,
    },
    scanlines: {
      canvas: null,
      context: null,
      width: 0,
      height: 0,
      alpha: 0,
      step: 0,
    },
    vignette: {
      canvas: null,
      context: null,
      width: 0,
      height: 0,
      intensity: 0,
    },
  };
}

function createWaveformRenderCache() {
  return {
    bandPaints: createWaveformPaintCache(),
    fillPaint: createWaveformStyleCache(),
    palette: null,
    paletteKey: "",
    peakPaints: createWaveformPaintCache(),
    primaryPaint: createWaveformStyleCache(),
    radialGeometry: {
      arc: 0,
      radius: 0,
      rotation: 0,
      total: 0,
      values: [],
    },
    radialInnerPaint: createWaveformStyleCache(),
    radialOuterPaint: createWaveformStyleCache(),
    smoothedSamples: [],
    syntheticSamples: [],
    syntheticSpectrum: [],
  };
}

function createWaveformPaintCache() {
  return {
    key: "",
    values: [],
  };
}

function createWaveformStyleCache() {
  return {
    key: "",
    value: null,
  };
}

function assignAudioState(target, audio = {}) {
  if (!audio || typeof audio !== "object") return;
  for (const key in audio) {
    if (HAS_OWN_PROPERTY.call(audio, key)) target[key] = audio[key];
  }
}

export function createSceneRuntime(
  canvas,
  initialScene,
  initialComposition = {},
) {
  const context = canvas.getContext("2d", { alpha: false });
  const webglCanvas = document.createElement("canvas");
  const webgl = createWebglRenderer(webglCanvas);
  let paperCanvas = null;
  let paperWebgl = null;
  const state = {
    scene: initialScene,
    composition: initialComposition,
    audio: {
      energy: 0,
      bass: 0,
      mid: 0,
      high: 0,
      centroid: 0,
      flux: 0,
      onset: 0,
      beat: 0,
      beatPhase: 0,
      samples: [],
      spectrum: [],
    },
  };
  let renderCache = createRenderCache(state.scene, state.composition);

  function resize(width = canvas.clientWidth, height = canvas.clientHeight) {
    const MAX_DIM = 4096;
    const nextWidth = Math.min(Math.max(2, Math.round(width || 2)), MAX_DIM);
    const nextHeight = Math.min(Math.max(2, Math.round(height || 2)), MAX_DIM);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    if (webglCanvas.width !== nextWidth || webglCanvas.height !== nextHeight) {
      webglCanvas.width = nextWidth;
      webglCanvas.height = nextHeight;
    }
    if (
      paperCanvas &&
      (paperCanvas.width !== nextWidth || paperCanvas.height !== nextHeight)
    ) {
      paperCanvas.width = nextWidth;
      paperCanvas.height = nextHeight;
    }
  }

  function getPaperWebgl() {
    if (!paperWebgl) {
      paperCanvas = document.createElement("canvas");
      paperCanvas.width = canvas.width;
      paperCanvas.height = canvas.height;
      paperWebgl = createPaperShaderRenderer(paperCanvas);
    }
    return paperWebgl;
  }

  function renderAtmosphere(
    context,
    width,
    height,
    scene,
    audio,
    time,
    rendererCache,
  ) {
    if (fragmentShaders[scene.rendererId]) {
      webgl.render(scene, audio, time);
      context.drawImage(webglCanvas, 0, 0, width, height);
    } else if (isPaperShaderRenderer(scene.rendererId)) {
      getPaperWebgl().render(scene, audio, time);
      context.drawImage(paperCanvas, 0, 0, width, height);
    } else if (scene.rendererId === "vector-aura") {
      drawVectorAura(context, width, height, scene, audio, time, rendererCache);
    } else if (scene.rendererId === "playful-shapes") {
      drawPlayfulShapes(
        context,
        width,
        height,
        scene,
        audio,
        time,
        rendererCache,
      );
    } else if (scene.rendererId === "piano-ribbons") {
      drawPianoRibbons(
        context,
        width,
        height,
        scene,
        audio,
        time,
        rendererCache,
      );
    } else if (scene.rendererId === "predictive-arc") {
      drawPredictiveArc(
        context,
        width,
        height,
        scene,
        audio,
        time,
        rendererCache,
      );
    } else if (scene.rendererId === "data-pixel-arc") {
      drawDataPixelArc(
        context,
        width,
        height,
        scene,
        audio,
        time,
        rendererCache,
      );
    } else if (scene.rendererId === "signal-particles") {
      drawSignalParticles(
        context,
        width,
        height,
        scene,
        audio,
        time,
        rendererCache,
      );
    } else if (scene.rendererId === "override-grid") {
      drawOverrideGrid(
        context,
        width,
        height,
        scene,
        audio,
        time,
        rendererCache,
      );
    } else {
      drawDarkSurface(context, width, height, scene, audio, time);
    }
  }

  function renderAtmosphereLayer(
    context,
    width,
    height,
    layer,
    audio,
    time,
    includeLayerLightFocus,
    rendererCache,
  ) {
    if (!layer || layer.visible === false || layer.opacity <= 0) return;
    const layerScene = layer.scene ?? state.scene;
    context.save();
    context.globalCompositeOperation =
      blendModes[layer.blendMode] ?? "source-over";
    context.globalAlpha = Math.max(0, Math.min(100, layer.opacity)) / 100;
    renderAtmosphere(
      context,
      width,
      height,
      layerScene,
      audio,
      time,
      rendererCache,
    );
    if (
      includeLayerLightFocus &&
      layerScene.cloudLight?.enabled &&
      layerScene.rendererId !== "volumetric-clouds"
    ) {
      drawLightFocus(
        context,
        width,
        height,
        layerScene.cloudLight,
        audio,
        time,
      );
    }
    context.restore();
  }

  function render(time = 0, fps = 24) {
    resize(
      canvas.clientWidth || canvas.width,
      canvas.clientHeight || canvas.height,
    );
    const { scene, composition, audio } = state;
    const width = canvas.width;
    const height = canvas.height;
    const cache = renderCache;
    context.save();
    context.clearRect(0, 0, width, height);
    // Allow WebGL atmosphere layers to dedupe identical output within this
    // frame, but never reuse a previous frame's back buffer (see beginFrame).
    webgl.beginFrame();

    for (const item of cache.resolvedStack) {
      switch (item.kind) {
        case "atmosphere": {
          renderAtmosphereLayer(
            context,
            width,
            height,
            item.layer,
            audio,
            time,
            cache.explicitAtmosphereLayers,
            item.rendererCache,
          );
          break;
        }
        case "sun-focus":
          if (scene.cloudLight?.enabled) {
            drawLightFocus(
              context,
              width,
              height,
              scene.cloudLight,
              audio,
              time,
            );
          }
          break;
        case "post":
          drawPost(context, width, height, scene.post, time, fps, cache.post);
          break;
        case "waveform":
          if (scene.waveform?.visible) {
            drawWaveform(
              context,
              width,
              height,
              scene.waveform,
              audio,
              time,
              cache.waveform,
            );
          }
          break;
        case "vinyl":
          if (scene.rendererId === "vinyl") {
            drawVinyl(
              context,
              width,
              height,
              scene,
              composition.coverElement,
              composition.metadata ?? {},
              audio,
              time,
            );
          }
          break;
        case "media": {
          const layer = item.layer;
          if (layer && item.mediaState?.enabled) {
            drawMediaLayer(
              context,
              width,
              height,
              layer,
              time,
              composition.durationSeconds,
              item.mediaState,
            );
          }
          break;
        }
      }
    }

    // Text and global shade always render last — they are not part of the
    // reorderable stack because text overlay is conceptually always on top.
    if (composition.showMetadata !== false) {
      const metadataLayout = resolveMetadataLayout(
        context,
        width,
        height,
        composition,
        cache.metadata,
      );
      drawMetadataLayout(
        context,
        metadataLayout,
        time,
        composition.durationSeconds,
      );
    }
    if (scene.common?.shade) {
      context.fillStyle = `rgba(0, 0, 0, ${scene.common.shade / 310})`;
      context.fillRect(0, 0, width, height);
    }
    context.restore();
  }

  return {
    render,
    resize,
    setScene(scene) {
      state.scene = scene;
      renderCache = createRenderCache(state.scene, state.composition);
    },
    setComposition(composition) {
      state.composition = composition;
      renderCache = createRenderCache(state.scene, state.composition);
    },
    setAudio(audio) {
      assignAudioState(state.audio, audio);
    },
    destroy() {
      webgl.destroy();
      paperWebgl?.destroy();
    },
  };
}

export async function loadMediaElements(composition = {}) {
  const layers = await Promise.all(
    (composition.layers ?? []).map(async (layer) => ({
      ...layer,
      element: await loadMediaElement(layer),
    })),
  );
  return {
    ...composition,
    layers,
    coverElement: composition.coverSrc
      ? await loadImage(composition.coverSrc)
      : null,
  };
}

async function loadMediaElement(layer) {
  if (!layer.src) return null;
  if (layer.kind === "video") {
    const video = document.createElement("video");
    video.src = layer.src;
    video.muted = true;
    video.loop = layer.loop !== false;
    video.playsInline = true;
    await waitFor(video, "loadeddata");
    await video.play().catch(() => {});
    return video;
  }
  return loadImage(layer.src);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function waitFor(target, event) {
  return new Promise((resolve, reject) => {
    target.addEventListener(event, resolve, { once: true });
    target.addEventListener("error", reject, { once: true });
  });
}

// Introspecção para testes: existe um renderer DEDICADO para este id?
//
// Existe porque um erro aqui é INVISÍVEL: um preset cujo `rendererId` não bate
// com nenhuma chave do mapa cai no `else` genérico (`drawDarkSurface`) e
// renderiza uma superfície escura genérica — sem exceção, sem warning, e o
// smoke de render "passa" porque só checa que o vídeo foi gerado. Foi
// exatamente o que aconteceu em SH11 com os 4 presets do laser.
//
// `false` NÃO significa "vazio": significa "cai no fallback genérico", que é
// intencional para presets de fundo liso (ex.: `audio-dark`).
export function sceneRuntimeHasRenderer(rendererId) {
  if (Object.hasOwn(fragmentShaders, rendererId)) return true;
  if (isPaperShaderRenderer(rendererId)) return true;
  if (canvas2dRendererIds().includes(rendererId)) return true;
  return false;
}

export const sceneRuntimeRendererIds = () => [
  ...Object.keys(fragmentShaders),
  ...canvas2dRendererIds(),
];

// Os renderers Canvas 2D são os ids que caem nos ramos `draw*` do dispatch,
// e não estão em `fragmentShaders`. Deduzidos do código em vez de duplicados
// numa lista, para a introspecção não divergir do dispatch.
function canvas2dRendererIds() {
  return [
    "vinyl",
    "vector-aura",
    "playful-shapes",
    "piano-ribbons",
    "predictive-arc",
    "data-pixel-arc",
    "signal-particles",
    "override-grid",
  ];
}

function createWebglRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  if (!gl) {
    throw new Error(
      "WebGL indisponível para renderizar a cena. Código: WEBGL_CONTEXT_UNAVAILABLE.",
    );
  }
  canvas.addEventListener(
    "webglcontextlost",
    (event) => {
      event.preventDefault();
    },
    false,
  );
  const programs = new Map();
  const sceneUniformCache = new WeakMap();
  const dynamicUniformStates = new Map();
  const staticUniformStates = new Map();
  let activeProgram = null;
  let lastRenderedFrame = null;
  let viewportWidth = 0;
  let viewportHeight = 0;
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );

  function getProgram(rendererId) {
    if (programs.has(rendererId)) return programs.get(rendererId);
    const program = createProgram(
      gl,
      vertexShader,
      fragmentShaders[rendererId],
    );
    const position = gl.getAttribLocation(program, "a_position");
    const names = [
      "resolution",
      "time",
      "intensity",
      "speed",
      "brightness",
      "direction",
      "audioReaction",
      "shade",
      ...shaderAudioUniformNames,
      "colorA",
      "colorB",
      "accentColor",
      "param0",
      "param1",
      "param2",
      "param3",
      "param4",
      "param5",
      "param6",
      "cloudSunEnabled",
      "cloudSunIntensity",
      "cloudSunX",
      "cloudSunY",
      "cloudSunRadius",
      "cloudSunDiffusion",
      "cloudSunMotion",
      "cloudSunSpeed",
      "cloudSunDirection",
      "cloudSunColor",
    ];
    const uniforms = Object.fromEntries(
      names.map((name) => [name, gl.getUniformLocation(program, `u_${name}`)]),
    );
    const compiled = { program, position, uniforms };
    programs.set(rendererId, compiled);
    return compiled;
  }

  function beginFrame() {
    // The identical-output reuse below is only safe within a single frame:
    // skipping drawArrays leaves the previous draw in the WebGL back buffer,
    // which is then blitted again via drawImage for an identical stacked
    // layer. Across frames the back buffer is not reliably retained (it is
    // driver-dependent even with preserveDrawingBuffer), so a static/paused
    // atmosphere that skips every frame would blit a cleared, black buffer.
    // Resetting per frame forces the first atmosphere render of each frame to
    // redraw while still deduping identical layers inside the same frame.
    lastRenderedFrame = null;
  }

  function render(scene, audio, time) {
    const compiled = getProgram(scene.rendererId);
    const uniforms = getSceneUniformData(scene);
    const audioEnergy = audio.energy ?? 0;
    const audioBass = audio.bass ?? 0;
    const audioMid = audio.mid ?? 0;
    const audioHigh = audio.high ?? 0;
    const audioCentroid = audio.centroid ?? 0;
    const audioFlux = audio.flux ?? 0;
    const audioOnset = audio.onset ?? 0;
    const audioBeat = audio.beat ?? 0;
    const beatPhase = audio.beatPhase ?? 0;
    if (
      lastRenderedFrame?.program === compiled.program &&
      lastRenderedFrame.staticKey === uniforms.staticKey &&
      lastRenderedFrame.width === canvas.width &&
      lastRenderedFrame.height === canvas.height &&
      lastRenderedFrame.time === time &&
      lastRenderedFrame.audioEnergy === audioEnergy &&
      lastRenderedFrame.audioBass === audioBass &&
      lastRenderedFrame.audioMid === audioMid &&
      lastRenderedFrame.audioHigh === audioHigh &&
      lastRenderedFrame.audioCentroid === audioCentroid &&
      lastRenderedFrame.audioFlux === audioFlux &&
      lastRenderedFrame.audioOnset === audioOnset &&
      lastRenderedFrame.audioBeat === audioBeat &&
      lastRenderedFrame.beatPhase === beatPhase
    ) {
      return;
    }
    if (viewportWidth !== canvas.width || viewportHeight !== canvas.height) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      viewportWidth = canvas.width;
      viewportHeight = canvas.height;
    }
    if (activeProgram !== compiled.program) {
      gl.useProgram(compiled.program);
      gl.enableVertexAttribArray(compiled.position);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.vertexAttribPointer(compiled.position, 2, gl.FLOAT, false, 0, 0);
      activeProgram = compiled.program;
    }
    const staticUniforms = staticUniformStates.get(compiled.program);
    if (
      !staticUniforms ||
      staticUniforms.key !== uniforms.staticKey ||
      staticUniforms.width !== canvas.width ||
      staticUniforms.height !== canvas.height
    ) {
      set2f("resolution", canvas.width, canvas.height);
      set1f("intensity", uniforms.intensity);
      set1f("speed", uniforms.speed);
      set1f("brightness", uniforms.brightness);
      set1f("direction", uniforms.direction);
      set1f("audioReaction", uniforms.audioReaction);
      set1f("shade", uniforms.shade);
      set3fv("colorA", uniforms.colorA);
      set3fv("colorB", uniforms.colorB);
      set3fv("accentColor", uniforms.accentColor);
      // 7 = o tamanho do array em `buildUniforms` e o que o prelude declara.
      // Este loop usava < 6: o uniform `u_param6` era criado, receberia valor,
      // e nunca era escrito — o control de rotação aparecia no inspector e não
      // fazia nada. Os três lugares (prelude, array, loop) precisam concordar.
      for (let index = 0; index < 7; index += 1) {
        set1f(`param${index}`, uniforms.params[index] ?? 0);
      }
      set1f("cloudSunEnabled", uniforms.cloudSunEnabled);
      set1f("cloudSunIntensity", uniforms.cloudSunIntensity);
      set1f("cloudSunX", uniforms.cloudSunX);
      set1f("cloudSunY", uniforms.cloudSunY);
      set1f("cloudSunRadius", uniforms.cloudSunRadius);
      set1f("cloudSunDiffusion", uniforms.cloudSunDiffusion);
      set1f("cloudSunMotion", uniforms.cloudSunMotion);
      set1f("cloudSunSpeed", uniforms.cloudSunSpeed);
      set1f("cloudSunDirection", uniforms.cloudSunDirection);
      set3fv("cloudSunColor", uniforms.cloudSunColor);
      staticUniformStates.set(compiled.program, {
        key: uniforms.staticKey,
        width: canvas.width,
        height: canvas.height,
      });
    }
    let dynamicUniforms = dynamicUniformStates.get(compiled.program);
    if (
      !dynamicUniforms ||
      dynamicUniforms.time !== time ||
      dynamicUniforms.audioEnergy !== audioEnergy ||
      dynamicUniforms.audioBass !== audioBass ||
      dynamicUniforms.audioMid !== audioMid ||
      dynamicUniforms.audioHigh !== audioHigh ||
      dynamicUniforms.audioCentroid !== audioCentroid ||
      dynamicUniforms.audioFlux !== audioFlux ||
      dynamicUniforms.audioOnset !== audioOnset ||
      dynamicUniforms.audioBeat !== audioBeat ||
      dynamicUniforms.beatPhase !== beatPhase
    ) {
      set1f("time", time);
      set1f("audioEnergy", audioEnergy);
      set1f("audioBass", audioBass);
      set1f("audioMid", audioMid);
      set1f("audioHigh", audioHigh);
      set1f("audioCentroid", audioCentroid);
      set1f("audioFlux", audioFlux);
      set1f("audioOnset", audioOnset);
      set1f("audioBeat", audioBeat);
      set1f("beatPhase", beatPhase);
      if (!dynamicUniforms) {
        dynamicUniforms = {};
        dynamicUniformStates.set(compiled.program, dynamicUniforms);
      }
      dynamicUniforms.time = time;
      dynamicUniforms.audioEnergy = audioEnergy;
      dynamicUniforms.audioBass = audioBass;
      dynamicUniforms.audioMid = audioMid;
      dynamicUniforms.audioHigh = audioHigh;
      dynamicUniforms.audioCentroid = audioCentroid;
      dynamicUniforms.audioFlux = audioFlux;
      dynamicUniforms.audioOnset = audioOnset;
      dynamicUniforms.audioBeat = audioBeat;
      dynamicUniforms.beatPhase = beatPhase;
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!lastRenderedFrame) lastRenderedFrame = {};
    lastRenderedFrame.program = compiled.program;
    lastRenderedFrame.staticKey = uniforms.staticKey;
    lastRenderedFrame.width = canvas.width;
    lastRenderedFrame.height = canvas.height;
    lastRenderedFrame.time = time;
    lastRenderedFrame.audioEnergy = audioEnergy;
    lastRenderedFrame.audioBass = audioBass;
    lastRenderedFrame.audioMid = audioMid;
    lastRenderedFrame.audioHigh = audioHigh;
    lastRenderedFrame.audioCentroid = audioCentroid;
    lastRenderedFrame.audioFlux = audioFlux;
    lastRenderedFrame.audioOnset = audioOnset;
    lastRenderedFrame.audioBeat = audioBeat;
    lastRenderedFrame.beatPhase = beatPhase;

    function set1f(name, value) {
      gl.uniform1f(compiled.uniforms[name], value);
    }
    function set2f(name, first, second) {
      gl.uniform2f(compiled.uniforms[name], first, second);
    }
    function set3fv(name, value) {
      gl.uniform3fv(compiled.uniforms[name], value);
    }
  }

  function getSceneUniformData(scene) {
    const cached = sceneUniformCache.get(scene);
    if (cached) return cached;
    const cloudLight = scene.cloudLight ?? {};
    // Mapeia pela ORDEM DE advanced, não de controls — igual ao
    // `visualUniforms`. `advanced` é o contrato com o shader (Nª chave =
    // u_paramN); `controls` é a camada de UI e pode ter menos entradas.
    //
    // Este era o bug que fazia o laser "virar lens flare": com `variant`
    // fora de controls, o size ocupava u_param0, o shader lia variant=0.55,
    // caía no ramo `array` (raios radiais = lens flare) e nunca chegava na
    // blade (a plumosa de fumaça). O preset padrão renderizava a variação
    // errada sem erro nenhum. `visualUniforms` já estava certo; este caminho
    // — o que realmente renderiza — não.
    const values = Object.keys(scene.advanced ?? {}).map(
      // `variant` é índice de ramo (0..3), não percentual — ver o comentário
      // equivalente em visualUniforms. Dividir por 100 fazia variant=3 virar
      // 0.03 e o shader cair no ramo errado.
      (key) =>
        key === "variant"
          ? (scene.advanced[key] ?? 0)
          : (scene.advanced[key] ?? 0) / 100,
    );
    const uniforms = {
      intensity: scene.common.intensity / 100,
      speed: scene.common.speed / 100,
      brightness: scene.common.brightness / 100,
      direction: scene.common.direction,
      audioReaction: scene.common.audioReaction / 100,
      shade: scene.common.shade / 100,
      colorA: hexToRgb(scene.colors.base),
      colorB: hexToRgb(scene.colors.effect),
      accentColor: hexToRgb(scene.colors.light),
      // 7 posições = o que o prelude declara (u_param0..u_param6). Aumentar
      // aqui e no prelude juntos: se o array for maior que o declarado, o
      // uniform é criado e nunca escrito (controle na UI que não faz nada).
      params: Array.from({ length: 7 }, (_, index) => values[index] ?? 0),
      cloudSunEnabled: cloudLight.enabled ? 1 : 0,
      cloudSunIntensity: (cloudLight.intensity ?? 0) / 100,
      cloudSunX: (cloudLight.x ?? 28) / 100,
      cloudSunY: (cloudLight.y ?? 24) / 100,
      cloudSunRadius: (cloudLight.radius ?? 32) / 100,
      cloudSunDiffusion: (cloudLight.diffusion ?? 68) / 100,
      cloudSunMotion: (cloudLight.motion ?? 0) / 100,
      cloudSunSpeed: (cloudLight.speed ?? 36) / 100,
      cloudSunDirection: cloudLight.direction ?? 18,
      cloudSunColor: hexToRgb(cloudLight.color ?? scene.colors.light),
    };
    uniforms.staticKey = JSON.stringify([
      uniforms.intensity,
      uniforms.speed,
      uniforms.brightness,
      uniforms.direction,
      uniforms.audioReaction,
      uniforms.shade,
      uniforms.colorA,
      uniforms.colorB,
      uniforms.accentColor,
      uniforms.params,
      uniforms.cloudSunEnabled,
      uniforms.cloudSunIntensity,
      uniforms.cloudSunX,
      uniforms.cloudSunY,
      uniforms.cloudSunRadius,
      uniforms.cloudSunDiffusion,
      uniforms.cloudSunMotion,
      uniforms.cloudSunSpeed,
      uniforms.cloudSunDirection,
      uniforms.cloudSunColor,
    ]);
    sceneUniformCache.set(scene, uniforms);
    return uniforms;
  }

  return {
    beginFrame,
    render,
    destroy() {
      for (const { program } of programs.values()) gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    },
  };
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  const shaderType =
    type === gl.VERTEX_SHADER
      ? "vertex"
      : type === gl.FRAGMENT_SHADER
        ? "fragment"
        : "unknown";
  if (!shader) {
    throw new Error(
      `WebGL não criou o shader ${shaderType}. Contexto perdido: ${gl.isContextLost()}. Código: WEBGL_SHADER_CREATE_FAILED.`,
    );
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    throw new Error(
      `Falha ao compilar shader WebGL (${shaderType}). Contexto perdido: ${gl.isContextLost()}. Código: WEBGL_SHADER_COMPILE_FAILED.${info ? ` Detalhe: ${info}` : ""}`,
    );
  }
  return shader;
}

function getCachedAtmosphereLinearGradient(cache, index, width, height) {
  const entry = cache?.linearGradients[index];
  return entry?.width === width && entry.height === height
    ? entry.gradient
    : null;
}

function setCachedAtmosphereLinearGradient(
  cache,
  index,
  width,
  height,
  gradient,
) {
  if (!cache) return;
  cache.linearGradients[index] = { width, height, gradient };
}

function drawVectorAura(
  context,
  width,
  height,
  scene,
  audio,
  time,
  rendererCache,
) {
  const state = getVectorAuraRenderState(scene, rendererCache);
  context.fillStyle = state.base;
  context.fillRect(0, 0, width, height);
  const pulse = 1 + (audio.mid ?? 0) * state.audioReaction;
  context.save();
  context.filter = state.blurFilter;
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < 3; index += 1) {
    const phase = time * state.speed * (0.72 + index * 0.16) + index * 2.18;
    const center = height * (0.24 + index * 0.24);
    const swing = height * (0.08 + state.drift * 0.11);
    let gradient = getCachedAtmosphereLinearGradient(
      rendererCache,
      index,
      width,
      height,
    );
    if (!gradient) {
      gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, state.linearStart);
      gradient.addColorStop(
        0.46,
        index === 1 ? state.linearMiddleLight : state.linearMiddleEffect,
      );
      gradient.addColorStop(1, state.linearEnd);
      setCachedAtmosphereLinearGradient(
        rendererCache,
        index,
        width,
        height,
        gradient,
      );
    }
    context.strokeStyle = gradient;
    context.lineWidth = height * (0.15 + state.presence * 0.08 + index * 0.025);
    context.beginPath();
    context.moveTo(-width * 0.14, center + Math.sin(phase) * swing);
    context.bezierCurveTo(
      width * 0.24,
      center + Math.cos(phase * 0.78) * swing,
      width * 0.7,
      center - Math.sin(phase * 0.64) * swing,
      width * 1.14,
      center + Math.cos(phase * 0.9) * swing,
    );
    context.stroke();
  }
  for (let index = 0; index < 4; index += 1) {
    const phase = time * state.speed + index * 1.73;
    const x =
      width *
      (0.22 +
        index * 0.2 +
        Math.sin(phase) * 0.1 * state.drift * state.directionCos);
    const y =
      height *
      (0.24 +
        (index % 2) * 0.34 +
        Math.cos(phase * 0.82) * 0.11 * state.drift * state.directionSinOffset);
    const radius = width * state.scale * (0.58 + index * 0.08) * pulse;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(
      0,
      index % 2 ? state.radialEffectCore : state.radialLightCore,
    );
    gradient.addColorStop(0.58, state.radialEffectMid);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(x, y, radius, radius * 0.58, phase * 0.14, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function getVectorAuraRenderState(scene, rendererCache) {
  if (rendererCache?.vectorState) return rendererCache.vectorState;
  const direction = (scene.common.direction * Math.PI) / 180;
  const presence = scene.advanced.shapes / 100;
  const state = {
    audioReaction: (scene.common.audioReaction / 100) * 0.22,
    base: scene.colors.base,
    blurFilter: `blur(${18 + scene.advanced.blur * 0.62}px)`,
    directionCos: Math.cos(direction),
    directionSinOffset: Math.sin(direction + 1),
    drift: scene.advanced.drift / 100,
    linearEnd: hexToRgba(scene.colors.light, 0.07 * presence),
    linearMiddleEffect: hexToRgba(scene.colors.effect, 0.38 * presence),
    linearMiddleLight: hexToRgba(scene.colors.light, 0.38 * presence),
    linearStart: hexToRgba(scene.colors.effect, 0.04 * presence),
    presence,
    radialEffectCore: hexToRgba(scene.colors.effect, 0.38 * presence),
    radialEffectMid: hexToRgba(scene.colors.effect, 0.16 * presence),
    radialLightCore: hexToRgba(scene.colors.light, 0.38 * presence),
    scale: 0.28 + scene.advanced.scale / 150,
    speed: 0.04 + scene.common.speed / 220,
  };
  if (rendererCache) rendererCache.vectorState = state;
  return state;
}

// Técnica `dot-grid-arc-field` (adaptada de ThreeUI "Predictive Arc", MIT):
// grid de pontos amostrando uma curva de arco paramétrica, com queda radial,
// modulação senoidal e blend aditivo. Reimplementada para o runtime compartilhado.
function getPredictiveArcRenderState(scene, rendererCache) {
  if (rendererCache?.predictiveArcState)
    return rendererCache.predictiveArcState;
  const state = {
    audioReaction: (scene.common.audioReaction / 100) * 0.3,
    base: scene.colors.base,
    brightness: 0.6 + (scene.common.brightness / 100) * 0.9,
    spacing: 3 + (scene.advanced.spacing / 100) * 14,
    dotSize: 1 + (scene.advanced.dotSize / 100) * 9,
    archHeight: 0.35 + (scene.advanced.archHeight / 100) * 0.55,
    thickness: 40 + (scene.advanced.thickness / 100) * 200,
    glow: 0.4 + (scene.advanced.glow / 100) * 0.6,
    speed: 0.5 + (scene.common.speed / 100) * 2.5,
    effectRgb: hexToRgb(scene.colors.effect),
    lightRgb: hexToRgb(scene.colors.light),
  };
  if (rendererCache) rendererCache.predictiveArcState = state;
  return state;
}

function drawPredictiveArc(
  context,
  width,
  height,
  scene,
  audio,
  time,
  rendererCache,
) {
  const state = getPredictiveArcRenderState(scene, rendererCache);
  const pulse = 1 + (audio.mid ?? 0) * state.audioReaction;
  context.fillStyle = state.base;
  context.fillRect(0, 0, width, height);
  const centerX = width / 2;
  const archPeakY = height * 0.35;
  const archWidth = width * 1.5;
  const archHeight = height * state.archHeight;
  const spacing = state.spacing;
  const baseThickness = state.thickness;
  const dotSize = state.dotSize * pulse;
  const effect = state.effectRgb;
  const light = state.lightRgb;
  const drift = time * state.speed;
  context.globalCompositeOperation = "lighter";
  for (let x = 0; x < width; x += spacing) {
    const normX = (x - centerX) / (archWidth / 2);
    const radial = Math.max(0, 1 - Math.pow(Math.abs(normX), 2.5));
    if (radial <= 0.02) continue;
    const curveY = archPeakY + normX * normX * archHeight;
    const thickness = baseThickness * (1 + (1 - Math.abs(normX)) * 0.6);
    for (let y = 0; y < height; y += spacing) {
      const distance = Math.abs(y - curveY);
      if (distance >= thickness) continue;
      let intensity = 1 - distance / thickness;
      const waveX = Math.sin(x * 0.015 + drift);
      const waveY = Math.cos(y * 0.02 + drift);
      intensity = intensity * 0.7 + waveX * waveY * 0.3 * intensity;
      intensity *= radial;
      if (intensity <= 0.02) continue;
      const mix = Math.min(1, intensity * state.glow);
      const red = (effect[0] * (1 - mix) + light[0] * mix) * state.brightness;
      const green = (effect[1] * (1 - mix) + light[1] * mix) * state.brightness;
      const blue = (effect[2] * (1 - mix) + light[2] * mix) * state.brightness;
      context.fillStyle = `rgb(${Math.min(255, Math.floor(red * 255))},${Math.min(255, Math.floor(green * 255))},${Math.min(255, Math.floor(blue * 255))})`;
      const size = dotSize * intensity;
      context.fillRect(x, y, size, size);
    }
  }
  context.globalCompositeOperation = "source-over";
}

// Técnica `data-pixel-arc` (adaptada de ThreeUI "Predictive Arc" / variante
// Data Pixel, MIT): grid de blocos grosso sobre um arco, com queda radial e
// alfa por bloco. Reimplementada para o runtime compartilhado (cores do preset).
function getDataPixelArcRenderState(scene, rendererCache) {
  if (rendererCache?.dataPixelArcState) return rendererCache.dataPixelArcState;
  const state = {
    audioReaction: (scene.common.audioReaction / 100) * 0.3,
    base: scene.colors.base,
    brightness: 0.6 + (scene.common.brightness / 100) * 0.9,
    pixelSize: 4 + (scene.advanced.pixelSize / 100) * 14,
    arcCenter: 0.25 + (scene.advanced.arcCenter / 100) * 0.4,
    arcDrop: 0.4 + (scene.advanced.arcDrop / 100) * 0.7,
    thickness: 0.12 + (scene.advanced.thickness / 100) * 0.45,
    speed: 0.5 + (scene.common.speed / 100) * 2.5,
    effectRgb: hexToRgb(scene.colors.effect),
    lightRgb: hexToRgb(scene.colors.light),
  };
  if (rendererCache) rendererCache.dataPixelArcState = state;
  return state;
}

function drawDataPixelArc(
  context,
  width,
  height,
  scene,
  audio,
  time,
  rendererCache,
) {
  const state = getDataPixelArcRenderState(scene, rendererCache);
  const layerAlpha = context.globalAlpha;
  const pulse = 1 + (audio.mid ?? 0) * state.audioReaction;
  const cols = Math.ceil(width / state.pixelSize);
  const rows = Math.ceil(height / state.pixelSize);
  const arcCenterY = height * state.arcCenter;
  const arcDrop = height * state.arcDrop;
  const thickness = height * state.thickness;
  const gap = Math.max(1, Math.round(state.pixelSize * 0.12));
  const cell = Math.max(1, state.pixelSize - gap);
  const effect = state.effectRgb;
  const light = state.lightRgb;
  const drift = time * state.speed;
  context.globalAlpha = 1;
  context.fillStyle = state.base;
  context.fillRect(0, 0, width, height);
  for (let x = 0; x < cols; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      const px = x * state.pixelSize;
      const py = y * state.pixelSize;
      const nx = (px / width) * 2 - 1;
      const curveY = arcCenterY + Math.pow(Math.abs(nx), 1.8) * arcDrop;
      let intensity = Math.max(0, 1 - Math.abs(py - curveY) / thickness);
      if (intensity <= 0.01) continue;
      const wave1 = Math.sin(nx * 4 - drift * 1.5) * 0.1;
      const wave2 = Math.cos(py * 0.01 + drift) * 0.1;
      intensity = Math.max(0, Math.min(1, intensity + wave1 + wave2));
      intensity *= Math.max(0, 1 - Math.pow(Math.abs(nx), 2.5));
      if (intensity <= 0.02) continue;
      const core = Math.pow(intensity, 3);
      const mix = Math.min(1, Math.pow(intensity, 1.5) * pulse);
      const red =
        (effect[0] * (1 - mix) + light[0] * mix + core * 0.35) *
        state.brightness;
      const green =
        (effect[1] * (1 - mix) + light[1] * mix + core * 0.35) *
        state.brightness;
      const blue =
        (effect[2] * (1 - mix) + light[2] * mix + core * 0.35) *
        state.brightness;
      context.fillStyle = `rgb(${Math.min(255, Math.floor(red * 255))},${Math.min(255, Math.floor(green * 255))},${Math.min(255, Math.floor(blue * 255))})`;
      context.globalAlpha = layerAlpha * Math.min(1, intensity);
      context.fillRect(px, py, cell, cell);
    }
  }
  context.globalAlpha = layerAlpha;
}

// Técnica `signal-particles` adaptada de ThreeUI "Signal Particles"
// (src/shaders/neuform-isolated/sources/signal-particles.html, MIT): grade de
// pontos cuja ativação vem de duas ondas cruzadas, com "highlights" raros
// sorteados por hash das coordenadas da célula. Adaptação: o tempo por frame
// do upstream virou o tempo determinístico do runtime compartilhado, e as
// três cores fixas viraram as cores do preset.
function getSignalParticlesRenderState(scene, rendererCache) {
  if (rendererCache?.signalParticlesState)
    return rendererCache.signalParticlesState;
  const state = {
    audioReaction: (scene.common.audioReaction / 100) * 0.3,
    base: scene.colors.base,
    brightness: 0.6 + (scene.common.brightness / 100) * 0.9,
    spacing: 8 + (scene.advanced.spacing / 100) * 34,
    dotSize: 1 + (scene.advanced.dotSize / 100) * 6,
    highlight: scene.advanced.highlight / 100,
    speed: 0.6 + (scene.common.speed / 100) * 2.0,
    effectRgb: hexToRgb(scene.colors.effect),
    lightRgb: hexToRgb(scene.colors.light),
  };
  if (rendererCache) rendererCache.signalParticlesState = state;
  return state;
}

function drawSignalParticles(
  context,
  width,
  height,
  scene,
  audio,
  time,
  rendererCache,
) {
  const state = getSignalParticlesRenderState(scene, rendererCache);
  const layerAlpha = context.globalAlpha;
  const t = time * state.speed;
  const cols = Math.floor(width / state.spacing);
  const rows = Math.floor(height / state.spacing);
  const offsetX = (width - cols * state.spacing) / 2;
  const offsetY = (height - rows * state.spacing) / 2;
  const dotSize = state.dotSize * (1 + (audio.mid ?? 0) * state.audioReaction);
  const effect = state.effectRgb;
  const light = state.lightRgb;
  const highlightCut = 0.995 - state.highlight * 0.02;
  context.fillStyle = state.base;
  context.fillRect(0, 0, width, height);
  for (let i = 0; i <= cols; i += 1) {
    for (let j = 0; j <= rows; j += 1) {
      const nx = i * 0.1;
      const ny = j * 0.1;
      const wave1 = Math.sin(nx + t * 0.5) * Math.cos(ny - t * 0.3);
      const wave2 = Math.sin(nx * 0.5 - ny * 0.5 + t * 0.8);
      const value = wave1 + wave2;
      if (value <= 0.1) continue;
      // Mesmo sorteio de destaque do upstream (sin/cos das coordenadas da
      // célula), com o limiar parametrizado em vez de fixo em 0.98. O
      // contrato de preset tem 3 cores, então os dois raros do upstream
      // (azul e violeta) viram a cor de luz e a mesma cor puxada 55% para a
      // cor de efeito — as duas classes continuam distinguíveis.
      const highlight = Math.sin(i * 12.34) * Math.cos(j * 56.78);
      const x = offsetX + i * state.spacing;
      const y = offsetY + j * state.spacing;
      let rgb = effect;
      let alpha = Math.min(0.6, (value - 0.1) * 0.8);
      if (highlight > highlightCut) {
        rgb = light;
        alpha = 0.95;
      } else if (highlight < -highlightCut) {
        rgb = [
          light[0] * 0.45 + effect[0] * 0.55,
          light[1] * 0.45 + effect[1] * 0.55,
          light[2] * 0.45 + effect[2] * 0.55,
        ];
        alpha = 0.9;
      }
      const k = alpha * state.brightness;
      context.fillStyle = `rgb(${Math.min(255, Math.floor(rgb[0] * 255 * k))},${Math.min(255, Math.floor(rgb[1] * 255 * k))},${Math.min(255, Math.floor(rgb[2] * 255 * k))})`;
      context.beginPath();
      context.arc(x, y, dotSize, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = layerAlpha;
}

// Técnica `override-grid` adaptada de ThreeUI "Override Grid"
// (src/shaders/neuform-isolated/sources/override-grid.html, MIT): grade de
// blocos pulsando com uma onda radial que sai do centro, com escala e alfa
// derivados da fase. Adaptação: o tamanho de bloco fixo em px do upstream
// virou um parâmetro 0–100, o laranja fixo virou a cor do preset e o tempo
// por frame virou o tempo determinístico do runtime.
// O upstream desenha isto como overlay a 50% de opacidade ATRÁS de conteúdo
// (alfa máximo 0.15). Como preset autonome o efeito precisa se sustentar
// sozinho, então o alfa foi elevado — a curva `wave` e a escala Z-depth são
// as mesmas do upstream.
function getOverrideGridRenderState(scene, rendererCache) {
  if (rendererCache?.overrideGridState) return rendererCache.overrideGridState;
  const state = {
    audioReaction: (scene.common.audioReaction / 100) * 0.3,
    base: scene.colors.base,
    brightness: 0.6 + (scene.common.brightness / 100) * 0.9,
    blockSize: 10 + (scene.advanced.blockSize / 100) * 46,
    gap: 1 + (scene.advanced.gap / 100) * 7,
    depth: 0.2 + (scene.advanced.depth / 100) * 0.8,
    speed: 0.4 + (scene.common.speed / 100) * 1.6,
    effectRgb: hexToRgb(scene.colors.effect),
  };
  if (rendererCache) rendererCache.overrideGridState = state;
  return state;
}

function drawOverrideGrid(
  context,
  width,
  height,
  scene,
  audio,
  time,
  rendererCache,
) {
  const state = getOverrideGridRenderState(scene, rendererCache);
  const layerAlpha = context.globalAlpha;
  const t = time * state.speed;
  const pitch = state.blockSize + state.gap;
  const cols = Math.ceil(width / pitch);
  const rows = Math.ceil(height / pitch);
  const centerX = cols / 2;
  const centerY = rows / 2;
  const effect = state.effectRgb;
  context.fillStyle = state.base;
  context.fillRect(0, 0, width, height);
  context.globalAlpha = layerAlpha;
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const dist = Math.sqrt((i - centerX) ** 2 + (j - centerY) ** 2);
      const wave = Math.sin(t - dist * 0.4);
      if (wave <= 0) continue;
      const alpha = wave * (0.3 + state.depth * 0.45);
      const size = state.blockSize * (wave * 0.7 + 0.3);
      const offset = (pitch - size) / 2;
      const k = (1 + (audio.mid ?? 0) * state.audioReaction) * state.brightness;
      context.fillStyle = `rgba(${Math.min(255, Math.floor(effect[0] * 255 * k))},${Math.min(255, Math.floor(effect[1] * 255 * k))},${Math.min(255, Math.floor(effect[2] * 255 * k))},${alpha})`;
      context.fillRect(i * pitch + offset, j * pitch + offset, size, size);
    }
  }
  context.globalAlpha = layerAlpha;
}

function drawPlayfulShapes(
  context,
  width,
  height,
  scene,
  audio,
  time,
  rendererCache,
) {
  drawPlayfulBackground(context, width, height, scene, audio, rendererCache);
  const {
    categories,
    depthAmount,
    directionCos,
    directionSin,
    diversity,
    drift,
    glyphCollections,
    mode,
    palette,
    quantity,
    randomness,
    rotation,
    scale,
    seed,
    speed,
  } = getPlayfulRenderState(scene, rendererCache);
  const reaction =
    ((scene.common.audioReaction ?? 22) / 100) * (audio.energy ?? 0);
  const minDimension = Math.min(width, height);

  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let index = 0; index < quantity; index += 1) {
    const depth = 0.34 + seeded(seed, index, 1) * (0.34 + depthAmount * 0.44);
    const phase = seeded(seed, index, 2) * Math.PI * 2;
    const pace = speed * (0.55 + depth * 0.86);
    const travel = minDimension * (0.025 + drift * 0.105) * mode.travel;
    const lift =
      Math.sin(time * pace + phase) * travel +
      Math.sin(time * pace * 0.48 + phase * 1.7) * travel * 0.32;
    const sway =
      Math.cos(time * pace * 0.78 + phase) * travel +
      Math.sin(time * pace * 0.32 + phase) * travel * 0.42;
    const baseX =
      width * (0.08 + seeded(seed, index, 3) * (0.84 + randomness * 0.04));
    const baseY =
      height * (0.1 + seeded(seed, index, 4) * (0.76 + randomness * 0.04));
    const x = baseX + sway * directionCos - lift * directionSin;
    const y = baseY + sway * directionSin + lift * directionCos;
    const size =
      minDimension *
      (0.07 + seeded(seed, index, 5) * 0.065) *
      scale *
      (0.68 + depth * 0.52) *
      (1 + (audio.bass ?? 0) * mode.bassPulse * 0.08);
    const angle =
      (seeded(seed, index, 6) - 0.5) * rotation * 0.7 +
      Math.sin(time * pace * 0.62 + phase) *
        rotation *
        mode.rotation *
        (0.42 + (audio.mid ?? 0) * 0.14);
    const category =
      categories[
        Math.floor(
          seeded(seed, index, 7) *
            Math.max(1, Math.ceil(categories.length * diversity)),
        ) % categories.length
      ];
    const color = palette[index % palette.length];
    const alpha =
      0.38 +
      depth * 0.42 +
      Math.min(0.12, (audio.high ?? 0) * mode.highlight * 0.16);
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.globalAlpha = Math.min(0.96, alpha);
    context.shadowColor = "rgba(35, 46, 72, 0.18)";
    context.shadowBlur = minDimension * 0.025 * depth;
    context.shadowOffsetY = minDimension * 0.012 * depth;
    drawPlayfulElement(
      context,
      category,
      size * (1 + reaction * mode.energy * 0.1),
      color,
      glyphCollections,
      seed,
      index,
    );
    context.restore();
  }
  context.restore();
}

function getPlayfulRenderState(scene, rendererCache) {
  if (rendererCache?.playfulState) return rendererCache.playfulState;
  const playful = scene.playful ?? {};
  const categories = playfulCategories(playful);
  const direction = ((scene.common.direction ?? 0) * Math.PI) / 180;
  const state = {
    categories,
    depthAmount: (scene.advanced.depth ?? 54) / 100,
    directionCos: Math.cos(direction),
    directionSin: Math.sin(direction),
    diversity: (scene.advanced.diversity ?? 72) / 100,
    drift: (scene.advanced.drift ?? 38) / 100,
    glyphCollections: categories.some((category) => category !== "rectangle")
      ? playfulGlyphCollections(playful)
      : null,
    mode: playfulMotion(playful.motionMode),
    palette: [scene.colors.light, scene.colors.effect, "#ffffff"],
    quantity: Math.round(4 + ((scene.advanced.quantity ?? 48) / 100) * 10),
    randomness: (scene.advanced.randomness ?? 56) / 100,
    rotation: (scene.advanced.rotation ?? 42) / 100,
    scale: 0.72 + (scene.advanced.scale ?? 56) / 150,
    seed: Math.round(playful.seed ?? 37),
    speed: 0.12 + (scene.common.speed ?? 22) / 72,
  };
  if (rendererCache) rendererCache.playfulState = state;
  return state;
}

function drawPlayfulBackground(
  context,
  width,
  height,
  scene,
  audio,
  rendererCache,
) {
  let gradient = getCachedAtmosphereLinearGradient(
    rendererCache,
    0,
    width,
    height,
  );
  if (!gradient) {
    gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, scene.colors.base);
    gradient.addColorStop(0.58, hexToRgba(scene.colors.effect, 0.82));
    gradient.addColorStop(1, hexToRgba(scene.colors.light, 0.92));
    setCachedAtmosphereLinearGradient(
      rendererCache,
      0,
      width,
      height,
      gradient,
    );
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const glow = context.createRadialGradient(
    width * 0.22,
    height * 0.18,
    0,
    width * 0.22,
    height * 0.18,
    width * 0.62,
  );
  glow.addColorStop(0, `rgba(255,255,255,${0.18 + (audio.high ?? 0) * 0.04})`);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

function playfulCategories(playful) {
  const enabled = playful.enabled ?? {};
  const categories = [];
  if (enabled.rectangles !== false) categories.push("rectangle");
  if (enabled.letters !== false) categories.push("letter");
  if (enabled.numbers !== false) categories.push("number");
  if (enabled.emojis !== false) categories.push("emoji");
  return categories.length ? categories : ["rectangle"];
}

function playfulMotion(value) {
  if (value === "calm") return PLAYFUL_MOTION_CALM;
  if (value === "play") return PLAYFUL_MOTION_PLAY;
  return PLAYFUL_MOTION_FLOAT;
}

function playfulGlyphCollections(playful) {
  return {
    emoji: splitVisualCollection(playful.collections?.emojis, "☀️ 🎈 🌱 ⭐ 🎵"),
    letter: splitVisualCollection(playful.collections?.letters, "A B C D E"),
    number: splitVisualCollection(playful.collections?.numbers, "1 2 3 4 5"),
  };
}

function drawPlayfulElement(
  context,
  category,
  size,
  color,
  glyphCollections,
  seed,
  index,
) {
  if (category === "rectangle") {
    const width = size * (0.9 + seeded(seed, index, 8) * 0.42);
    const height = size * (0.72 + seeded(seed, index, 9) * 0.34);
    roundedRectPath(
      context,
      -width / 2,
      -height / 2,
      width,
      height,
      size * 0.18,
    );
    context.fillStyle = hexToRgba(color, color === "#ffffff" ? 0.28 : 0.9);
    context.fill();
    return;
  }
  const collection = glyphCollections?.[category] ?? PLAYFUL_FALLBACK_GLYPHS;
  const glyph = collection[index % collection.length];
  context.fillStyle =
    category === "emoji" ? "rgba(255,255,255,0.2)" : hexToRgba(color, 0.88);
  context.beginPath();
  context.arc(0, 0, size * 0.52, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = "transparent";
  context.fillStyle =
    category === "emoji" ? "#ffffff" : "rgba(255,255,255,0.92)";
  context.font =
    category === "emoji"
      ? `${size * 0.64}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
      : `760 ${size * 0.58}px Inter, Arial, sans-serif`;
  context.fillText(glyph, 0, size * 0.02, size * 0.88);
}

function drawPianoRibbons(
  context,
  width,
  height,
  scene,
  audio,
  time,
  rendererCache,
) {
  const state = getPianoRibbonsRenderState(scene, rendererCache);
  let background = getCachedAtmosphereLinearGradient(
    rendererCache,
    0,
    width,
    height,
  );
  if (!background) {
    background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, state.backgroundStart);
    background.addColorStop(0.58, state.backgroundMiddle);
    background.addColorStop(1, state.backgroundEnd);
    setCachedAtmosphereLinearGradient(
      rendererCache,
      0,
      width,
      height,
      background,
    );
  }
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(
    width * 0.34,
    height * 0.22,
    0,
    width * 0.34,
    height * 0.22,
    Math.max(width, height) * 0.72,
  );
  glow.addColorStop(0, hexToRgba(state.light, 0.16 + (audio.mid ?? 0) * 0.04));
  glow.addColorStop(1, state.lightTransparent);
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  const curvature = state.curvatureScale * height;

  context.save();
  context.globalCompositeOperation = "screen";
  context.lineCap = "round";
  context.lineJoin = "round";
  for (let staff = 0; staff < 5; staff += 1) {
    const y = height * (0.28 + staff * 0.048);
    context.strokeStyle = state.staffStrokeStyle;
    context.lineWidth = Math.max(1, height * 0.0014);
    context.beginPath();
    context.moveTo(width * 0.08, y);
    context.bezierCurveTo(
      width * 0.3,
      y - height * 0.018,
      width * 0.68,
      y + height * 0.016,
      width * 0.94,
      y,
    );
    context.stroke();
  }

  for (let index = 0; index < state.bandCount; index += 1) {
    const spectrum =
      audio.spectrum?.[index % (audio.spectrum?.length || 1)] ??
      audio.energy ??
      0;
    const phase = time * state.speed + index * 0.62;
    const wave =
      Math.sin(phase + state.directionWaveOffset) *
        curvature *
        (0.32 + state.drift * 0.58) +
      spectrum * curvature * state.reaction;
    const y =
      height * (0.24 + index * (0.38 / Math.max(1, state.bandCount - 1)));
    const thickness =
      height *
      (0.01 + state.widthScale * 0.015 + spectrum * state.reaction * 0.018) *
      (1 - state.gap * 0.22);
    const alpha = 0.34 + state.depth * 0.28 + Math.min(0.16, spectrum * 0.12);
    const ribbon = context.createLinearGradient(0, y, width, y + wave);
    ribbon.addColorStop(
      0,
      hexToRgba(state.palette[index % state.palette.length], 0),
    );
    ribbon.addColorStop(
      0.22,
      hexToRgba(state.palette[index % state.palette.length], alpha),
    );
    ribbon.addColorStop(
      0.74,
      hexToRgba(
        state.palette[(index + 1) % state.palette.length],
        alpha * 0.92,
      ),
    );
    ribbon.addColorStop(1, state.lightTransparent);
    context.strokeStyle = ribbon;
    context.lineWidth = thickness;
    context.shadowColor = hexToRgba(state.light, 0.22 + alpha * 0.12);
    context.shadowBlur = thickness * (0.8 + state.depth * 1.1);
    context.beginPath();
    context.moveTo(-width * 0.08, y + wave * 0.4);
    context.bezierCurveTo(
      width * 0.22,
      y - wave,
      width * 0.54,
      y + wave,
      width * 1.08,
      y - wave * 0.36,
    );
    context.stroke();
  }
  context.shadowColor = "transparent";
  context.globalCompositeOperation = "source-over";
  drawPianoKeyboard(context, width, height, state, audio);
  context.restore();
}

function getPianoRibbonsRenderState(scene, rendererCache) {
  if (rendererCache?.pianoState) return rendererCache.pianoState;
  const depth = (scene.advanced.depth ?? 54) / 100;
  const direction = ((scene.common.direction ?? 0) * Math.PI) / 180;
  const light = scene.colors.light;
  const state = {
    audioReaction: (scene.common.audioReaction ?? 28) / 100,
    backgroundEnd: hexToRgba(scene.colors.base, 0.96),
    backgroundMiddle: hexToRgba(scene.colors.effect, 0.34),
    backgroundStart: hexToRgba(scene.colors.base, 1),
    bandCount: Math.round(4 + ((scene.advanced.bands ?? 54) / 100) * 5),
    curvatureScale: ((scene.advanced.curvature ?? 46) / 100) * 0.18,
    depth,
    directionWaveOffset: Math.cos(direction) * 0.6,
    drift: (scene.advanced.drift ?? 34) / 100,
    gap: 0.08 + ((scene.advanced.gap ?? 26) / 100) * 0.18,
    light,
    lightTransparent: hexToRgba(light, 0),
    palette: [light, "#f7f1dd", scene.colors.effect, "#76b7d6"],
    reaction: ((scene.common.audioReaction ?? 28) / 100) * 0.32,
    speed: 0.08 + (scene.common.speed ?? 24) / 120,
    staffStrokeStyle: hexToRgba("#ffffff", 0.08 + depth * 0.03),
    widthScale: 0.7 + ((scene.advanced.bandWidth ?? 58) / 100) * 0.42,
  };
  if (rendererCache) rendererCache.pianoState = state;
  return state;
}

function drawPianoKeyboard(context, width, height, state, audio) {
  const baseY = height * 0.72;
  const keyboardHeight = height * 0.2;
  const left = width * 0.08;
  const right = width * 0.92;
  const keys = 18;
  const keyWidth = (right - left) / keys;
  const lift = (audio.energy ?? 0) * state.audioReaction;
  context.save();
  context.shadowColor = "rgba(0,0,0,0.36)";
  context.shadowBlur = height * 0.018;
  context.shadowOffsetY = height * 0.012;
  for (let index = 0; index < keys; index += 1) {
    const x = left + index * keyWidth;
    const topInset = (index / keys - 0.5) * height * 0.035;
    const alpha = 0.78 + (index % 3 === 0 ? lift * 0.08 : 0);
    context.fillStyle = `rgba(247,241,221,${alpha})`;
    roundedRectPath(
      context,
      x + 1,
      baseY + Math.abs(topInset),
      keyWidth - 2,
      keyboardHeight - Math.abs(topInset),
      Math.max(2, keyWidth * 0.08),
    );
    context.fill();
    context.strokeStyle = "rgba(24, 28, 36, 0.48)";
    context.lineWidth = 1;
    context.stroke();
  }
  for (let index = 0; index < keys - 1; index += 1) {
    if (!PIANO_BLACK_KEY_PATTERN.has(index % 7)) continue;
    const x = left + (index + 0.68) * keyWidth;
    const heightOffset = (index % 4) * keyboardHeight * 0.012;
    roundedRectPath(
      context,
      x,
      baseY + keyboardHeight * 0.04,
      keyWidth * 0.58,
      keyboardHeight * (0.58 + heightOffset / keyboardHeight),
      Math.max(2, keyWidth * 0.08),
    );
    context.fillStyle = "#11151d";
    context.fill();
    context.fillStyle = hexToRgba(state.light, 0.05 + lift * 0.04);
    context.fill();
  }
  context.restore();
}

function drawDarkSurface(context, width, height, scene, audio, time) {
  const pulse =
    ((0.5 + Math.sin(time * (0.18 + scene.common.speed / 170)) * 0.5) *
      (scene.advanced.pulse ?? 12)) /
    100;
  const gradient = context.createRadialGradient(
    width * 0.52,
    height * 0.48,
    0,
    width * 0.52,
    height * 0.48,
    width * 0.72,
  );
  gradient.addColorStop(
    0,
    hexToRgba(
      scene.colors.effect,
      0.22 + pulse * 0.16 + (audio.energy ?? 0) * 0.05,
    ),
  );
  gradient.addColorStop(1, scene.colors.base);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

export function effectiveLayerOpacity(layer, time = 0, durationSeconds = null) {
  return (
    effectiveTimedOpacity(
      clampPercent(layer.opacity ?? 100) / 100,
      layer.coverFadeOut,
      time,
      durationSeconds,
    ) * fadeInFactor(layer.fadeIn, time, durationSeconds)
  );
}

// Fade-in ramps opacity 0 → 1 over a window at the start of the clip. Mirrors
// the fade-out timing math so previews and exports stay identical.
function fadeInFactor(fadeIn, time = 0, durationSeconds = null) {
  if (!fadeIn?.enabled) return 1;
  const duration = Number(durationSeconds);
  if (!(duration > 0)) return 1;
  const startPercent = clampNumber(Number(fadeIn.startPercent ?? 0), 0, 95);
  const fadeDuration = clampNumber(
    Number(fadeIn.durationSeconds ?? 1.5),
    0.25,
    60,
  );
  const fadeStart = duration * (startPercent / 100);
  const progress = (Math.max(0, time) - fadeStart) / fadeDuration;
  return clampNumber(progress, 0, 1);
}

// Continuous zoom across the clip: scale multiplier eases linearly from `from`
// to `to` (both percent). Returns 1 when disabled so callers can multiply.
export function effectiveZoomScale(zoom, time = 0, durationSeconds = null) {
  if (!zoom?.enabled) return 1;
  const from = clampNumber(Number(zoom.from ?? 100), 20, 400) / 100;
  const to = clampNumber(Number(zoom.to ?? 115), 20, 400) / 100;
  const duration = Number(durationSeconds);
  if (!(duration > 0)) return from;
  const progress = clampNumber(Math.max(0, time) / duration, 0, 1);
  return from + (to - from) * progress;
}

function effectiveTimedOpacity(
  baseOpacity,
  fadeOut,
  time = 0,
  durationSeconds = null,
) {
  if (!fadeOut?.enabled) return baseOpacity;
  const duration = Number(durationSeconds);
  if (!(duration > 0)) return baseOpacity;
  if (fadeOut.mode === "timed") {
    const startPercent = clampNumber(Number(fadeOut.startPercent ?? 10), 0, 95);
    const fadeDuration = clampNumber(
      Number(fadeOut.durationSeconds ?? 2),
      0.25,
      60,
    );
    const fadeStart = duration * (startPercent / 100);
    const progress = (Math.max(0, time) - fadeStart) / fadeDuration;
    return baseOpacity * clampNumber(1 - progress, 0, 1);
  }
  const endPercent = clampNumber(Number(fadeOut.endPercent ?? 35), 1, 100);
  const fadeDuration = duration * (endPercent / 100);
  if (!(fadeDuration > 0)) return baseOpacity;
  const fadeStart = Math.max(0, duration - fadeDuration);
  const progress = (Math.max(0, time) - fadeStart) / fadeDuration;
  return baseOpacity * clampNumber(1 - progress, 0, 1);
}

function drawMediaLayer(
  context,
  width,
  height,
  layer,
  time = 0,
  durationSeconds = null,
  mediaState = null,
) {
  const prepared = mediaState ?? createMediaLayerRenderState(layer);
  if (!prepared?.enabled) return;
  const element = prepared.element;
  const opacity = effectiveLayerOpacity(prepared, time, durationSeconds);
  if (opacity <= 0) return;
  const bounds = mediaLayerBounds(width, height, layer, time, durationSeconds, {
    output: prepared.bounds,
    precomputedOpacity: opacity,
    preparedLayer: prepared,
  });
  if (!bounds) return;
  const drawWidth = bounds.drawWidth;
  const drawHeight = bounds.drawHeight;
  const x = bounds.x;
  const y = bounds.y;
  context.save();
  context.globalCompositeOperation = prepared.compositeOperation;
  context.globalAlpha = opacity;
  context.shadowColor = prepared.shadowColor;
  context.shadowBlur = prepared.shadowBlur;
  context.shadowOffsetX = prepared.shadowOffsetX;
  context.shadowOffsetY = prepared.shadowOffsetY;
  context.translate(x + drawWidth / 2, y + drawHeight / 2);
  context.rotate(prepared.rotation);
  if (prepared.filter) context.filter = prepared.filter;
  context.drawImage(
    element,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight,
  );
  context.filter = "none";
  if (prepared.maskFillStyle) {
    context.fillStyle = prepared.maskFillStyle;
    context.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  }
  context.restore();
}

export function mediaLayerBounds(
  width,
  height,
  layer,
  time = 0,
  durationSeconds = null,
  options = {},
) {
  const prepared = options.preparedLayer;
  const element = prepared ? prepared.element : layer?.element;
  const visible = prepared ? prepared.visible : layer?.visible !== false;
  if (!element || !visible) return null;
  const opacity = Number.isFinite(options.precomputedOpacity)
    ? options.precomputedOpacity
    : effectiveLayerOpacity(layer, time, durationSeconds);
  if (opacity <= 0) return null;
  const naturalWidth = element.videoWidth || element.naturalWidth || width;
  const naturalHeight = element.videoHeight || element.naturalHeight || height;
  const zoom = effectiveZoomScale(
    prepared ? prepared.zoom : layer.zoom,
    time,
    durationSeconds,
  );
  const scale = prepared ? prepared.scale : (layer.scale ?? 100) / 100;
  const targetWidth = width * scale * zoom;
  const targetHeight = height * scale * zoom;
  const fitCover = prepared ? prepared.fitCover : layer.fit === "cover";
  const factor = fitCover
    ? Math.max(targetWidth / naturalWidth, targetHeight / naturalHeight)
    : Math.min(targetWidth / naturalWidth, targetHeight / naturalHeight);
  const drawWidth = naturalWidth * factor;
  const drawHeight = naturalHeight * factor;
  const x =
    (width - drawWidth) * (prepared ? prepared.x : (layer.x ?? 50) / 100);
  const y =
    (height - drawHeight) * (prepared ? prepared.y : (layer.y ?? 50) / 100);
  const rotation =
    (prepared ? prepared.rotation : ((layer.rotation ?? 0) * Math.PI) / 180) %
    (Math.PI * 2);
  const output =
    options.output && typeof options.output === "object" ? options.output : {};
  output.x = x;
  output.y = y;
  output.drawWidth = drawWidth;
  output.drawHeight = drawHeight;
  output.opacity = opacity;
  if (!rotation) {
    output.left = x;
    output.top = y;
    output.right = x + drawWidth;
    output.bottom = y + drawHeight;
    return output;
  }
  const cx = x + drawWidth / 2;
  const cy = y + drawHeight / 2;
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  const boxWidth = drawWidth * cos + drawHeight * sin;
  const boxHeight = drawWidth * sin + drawHeight * cos;
  output.left = cx - boxWidth / 2;
  output.top = cy - boxHeight / 2;
  output.right = cx + boxWidth / 2;
  output.bottom = cy + boxHeight / 2;
  return output;
}

export function mediaTextAvoidanceBounds(
  width,
  height,
  layers = [],
  durationSeconds = null,
) {
  return layers
    .map((layer) => mediaLayerBounds(width, height, layer, 0, durationSeconds))
    .filter(Boolean);
}

function drawPost(
  context,
  width,
  height,
  post,
  time = 0,
  fps = 24,
  cache = null,
) {
  const vignette = clampNumber(Number(post?.vignette ?? 0), 0, 100) / 100;
  const grain = clampNumber(Number(post?.grain ?? 0), 0, 100) / 100;
  const scanlines = clampNumber(Number(post?.scanlines ?? 0), 0, 100) / 100;
  // `bloom` and `chromaticAberration` are schema stubs for V5.1; they need
  // framebuffer passes, so V5 keeps them inert instead of faking the behavior.
  if (vignette <= 0 && grain <= 0 && scanlines <= 0) return;

  if (vignette > 0) drawPostVignette(context, width, height, vignette, cache);

  if (grain > 0) drawPostGrain(context, width, height, grain, time, fps, cache);

  if (scanlines > 0)
    drawPostScanlines(context, width, height, scanlines, cache);
}

function drawPostGrain(
  context,
  width,
  height,
  grain,
  time = 0,
  fps = 24,
  cache = null,
) {
  if (typeof document === "undefined") return;
  const surface = getPostGrainSurface(context, width, height, cache?.grain);
  if (!surface) return;
  const frameSeed = Math.floor(Math.max(0, time) * Math.max(1, fps));
  const alpha = Math.round(28 * grain);
  fillPostGrainImage(surface, frameSeed, alpha);
  surface.context.putImageData(surface.image, 0, 0);
  context.save();
  context.globalCompositeOperation = "overlay";
  context.drawImage(surface.canvas, 0, 0);
  context.restore();
}

function getPostGrainSurface(context, width, height, cache = null) {
  if (
    cache?.canvas &&
    cache.context &&
    cache.image &&
    cache.width === width &&
    cache.height === height
  ) {
    return cache;
  }
  const baseSurface = createPostSurface(width, height);
  if (!baseSurface) return null;
  const image = context.createImageData(width, height);
  const surface = {
    ...baseSurface,
    data32: imageData32(image),
    image,
  };
  if (cache) Object.assign(cache, surface);
  return surface;
}

function fillPostGrainImage(surface, frameSeed, alpha) {
  const data32 = surface.data32;
  if (data32) {
    const black = grainPixel32(0, alpha);
    const white = grainPixel32(255, alpha);
    for (let pixel = 0; pixel < data32.length; pixel += 1) {
      data32[pixel] = seeded(frameSeed + 17, pixel, 29) > 0.5 ? white : black;
    }
    return;
  }
  const data = surface.image.data;
  for (let index = 0; index < data.length; index += 4) {
    const pixel = index / 4;
    const value = seeded(frameSeed + 17, pixel, 29) > 0.5 ? 255 : 0;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = alpha;
  }
}

function imageData32(image) {
  const data = image?.data;
  if (!data?.buffer || data.byteLength % 4 !== 0 || data.byteOffset % 4 !== 0) {
    return null;
  }
  return new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4);
}

function grainPixel32(value, alpha) {
  return LITTLE_ENDIAN
    ? ((alpha << 24) | (value << 16) | (value << 8) | value) >>> 0
    : ((value << 24) | (value << 16) | (value << 8) | alpha) >>> 0;
}

function drawPostScanlines(context, width, height, scanlines, cache = null) {
  const step = Math.max(2, Math.round(height / 360));
  const alpha = 0.2 * scanlines;
  const surface = getPostScanlineSurface(
    width,
    height,
    alpha,
    step,
    cache?.scanlines,
  );
  context.save();
  context.globalCompositeOperation = "multiply";
  if (surface) {
    context.drawImage(surface.canvas, 0, 0);
  } else {
    context.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let y = 0; y < height; y += step * 2) {
      context.fillRect(0, y, width, step);
    }
  }
  context.restore();
}

function getPostScanlineSurface(width, height, alpha, step, cache = null) {
  if (
    typeof document === "undefined" ||
    !Number.isFinite(alpha) ||
    !(alpha > 0)
  ) {
    return null;
  }
  if (
    cache?.canvas &&
    cache.context &&
    cache.width === width &&
    cache.height === height &&
    cache.alpha === alpha &&
    cache.step === step
  ) {
    return cache;
  }
  const surface = createPostSurface(width, height);
  if (!surface) return null;
  surface.context.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < height; y += step * 2) {
    surface.context.fillRect(0, y, width, step);
  }
  Object.assign(surface, {
    alpha,
    step,
  });
  if (cache) Object.assign(cache, surface);
  return surface;
}

function drawPostVignette(context, width, height, vignette, cache = null) {
  const surface = getPostVignetteSurface(
    width,
    height,
    vignette,
    cache?.vignette,
  );
  context.save();
  context.globalCompositeOperation = "multiply";
  if (surface) {
    context.drawImage(surface.canvas, 0, 0);
  } else {
    fillPostVignette(context, width, height, vignette);
  }
  context.restore();
}

function getPostVignetteSurface(width, height, vignette, cache = null) {
  if (
    typeof document === "undefined" ||
    !Number.isFinite(vignette) ||
    !(vignette > 0)
  ) {
    return null;
  }
  if (
    cache?.canvas &&
    cache.context &&
    cache.width === width &&
    cache.height === height &&
    cache.intensity === vignette
  ) {
    return cache;
  }
  const surface = createPostSurface(width, height);
  if (!surface) return null;
  fillPostVignette(surface.context, width, height, vignette);
  Object.assign(surface, {
    intensity: vignette,
  });
  if (cache) Object.assign(cache, surface);
  return surface;
}

function createPostSurface(width, height) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const surfaceContext = canvas.getContext("2d");
  if (!surfaceContext) return null;
  return {
    canvas,
    context: surfaceContext,
    width,
    height,
  };
}

function fillPostVignette(context, width, height, vignette) {
  const radius = Math.hypot(width, height) * (0.48 + vignette * 0.18);
  const gradient = context.createRadialGradient(
    width * 0.5,
    height * 0.5,
    radius * 0.16,
    width * 0.5,
    height * 0.5,
    radius,
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.64, "rgba(245,245,245,1)");
  gradient.addColorStop(1, `rgba(0,0,0,${0.42 * vignette})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

// Generic, renderer-agnostic sun/light overlay. Drawn after the base scene so
// any atmosphere can carry a configurable light point, mirroring the controls
// (position, radius, diffusion, drift) that volumetric-clouds bakes into its
// shader. Off by default, so it never alters an existing look unless enabled.
function drawLightFocus(context, width, height, light, audio, time = 0) {
  const intensity = clampNumber(light.intensity ?? 54, 0, 100) / 100;
  if (intensity <= 0) return;
  const minDim = Math.min(width, height);
  const dir = ((light.direction ?? 18) * Math.PI) / 180;
  const motion = clampNumber(light.motion ?? 0, 0, 100) / 100;
  const speed = 0.05 + (clampNumber(light.speed ?? 36, 0, 100) / 100) * 0.8;
  const drift = Math.sin(time * speed) * motion * 0.18 * minDim;
  const cx =
    (clampNumber(light.x ?? 28, 0, 100) / 100) * width + Math.cos(dir) * drift;
  const cy =
    (clampNumber(light.y ?? 24, 0, 100) / 100) * height + Math.sin(dir) * drift;
  const radius =
    (0.08 + (clampNumber(light.radius ?? 32, 8, 72) / 100) * 0.46) * minDim;
  const diffusion =
    0.5 + (clampNumber(light.diffusion ?? 68, 0, 100) / 100) * 1.8;
  const bass = audio?.bass ?? audio?.low ?? 0;
  const reactive = Math.min(1, intensity * (1 + bass * 0.4));
  const color = light.color ?? "#f8dca6";
  context.save();
  context.globalCompositeOperation = "screen";
  const halo = context.createRadialGradient(
    cx,
    cy,
    radius * 0.4,
    cx,
    cy,
    radius * diffusion * 2.2,
  );
  halo.addColorStop(0, hexToRgba(color, reactive * 0.5));
  halo.addColorStop(1, hexToRgba(color, 0));
  context.fillStyle = halo;
  context.fillRect(0, 0, width, height);
  const core = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
  core.addColorStop(0, hexToRgba(color, reactive));
  core.addColorStop(1, hexToRgba(color, 0));
  context.fillStyle = core;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function clampPercent(value) {
  return clampNumber(Number(value), 0, 100);
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function drawVinyl(
  context,
  width,
  height,
  scene,
  cover,
  metadata,
  audio,
  time,
) {
  const reaction =
    (scene.advanced.reaction ?? scene.common.audioReaction ?? 0) / 100;
  const bassPulse = Math.max(0, audio.bass ?? audio.energy ?? 0) * reaction;
  const lightBreath = Math.max(0, audio.mid ?? audio.energy ?? 0) * reaction;
  const size =
    ((Math.min(width, height) * scene.advanced.discSize) / 100) *
    (1 + bassPulse * 0.012);
  const x = (width * scene.advanced.x) / 100;
  const y = (height * scene.advanced.y) / 100;
  const radius = size / 2;
  context.save();
  context.translate(x, y);
  context.rotate(time * ((scene.advanced.rpm ?? 34) / 60) * Math.PI * 2);
  context.shadowColor = `rgba(0,0,0,${scene.advanced.shadow / 125})`;
  context.shadowBlur = radius * 0.16;
  context.shadowOffsetY = radius * 0.08;
  const disc = context.createRadialGradient(0, 0, radius * 0.08, 0, 0, radius);
  disc.addColorStop(0, "#161719");
  disc.addColorStop(0.18, "#090a0b");
  disc.addColorStop(0.62, "#17181a");
  disc.addColorStop(1, "#070708");
  context.fillStyle = disc;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = `rgba(255,255,255,${0.07 + lightBreath * 0.04})`;
  context.lineWidth = Math.max(1, radius * 0.006);
  for (let groove = 0.28; groove < 0.96; groove += 0.045) {
    context.beginPath();
    context.arc(0, 0, radius * groove, 0, Math.PI * 2);
    context.stroke();
  }
  context.save();
  context.beginPath();
  context.arc(0, 0, radius * 0.34, 0, Math.PI * 2);
  context.clip();
  if (cover)
    context.drawImage(
      cover,
      -radius * 0.34,
      -radius * 0.34,
      radius * 0.68,
      radius * 0.68,
    );
  else {
    context.fillStyle = scene.colors.light;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
    context.fillStyle = "rgba(15, 16, 18, 0.76)";
    context.font = `600 ${Math.max(9, radius * 0.075)}px Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      String(metadata.title || "Sonara Hub").slice(0, 24),
      0,
      -radius * 0.03,
      radius * 0.55,
    );
  }
  context.restore();
  context.fillStyle = "#0d0e10";
  context.beginPath();
  context.arc(0, 0, radius * 0.035, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawWaveform(
  context,
  width,
  height,
  waveform,
  audio,
  time,
  cache = null,
) {
  const centerY = (height * waveform.position) / 100;
  const reaction = 0.35 + (waveform.audioReaction ?? 54) / 100;
  const amplitude = ((height * waveform.height) / 200) * reaction;
  const visualWidth = width * ((waveform.width ?? 100) / 100);
  const startX = (width - visualWidth) / 2;
  const needsSpectrum =
    waveform.type === "spectrum-bars" || waveform.type === "radial-ring";
  const samples = needsSpectrum
    ? null
    : smoothSamples(
        audio.samples?.length
          ? audio.samples
          : syntheticSamples(audio, time, cache?.syntheticSamples),
        waveform.smoothing,
        cache?.smoothedSamples,
      );
  const spectrum = needsSpectrum
    ? audio.spectrum?.length
      ? audio.spectrum
      : syntheticSpectrum(audio, time, cache?.syntheticSpectrum)
    : null;
  const waveformPalette = needsSpectrum
    ? resolveWaveformPalette(waveform, cache)
    : null;
  context.save();
  if (waveform.type !== "spectrum-bars" && waveform.type !== "radial-ring") {
    const lineStyle = cachedWaveformPaint(
      context,
      waveform,
      startX,
      centerY - amplitude,
      startX + visualWidth,
      centerY + amplitude,
      waveform.opacity / 100,
      cache?.primaryPaint,
    );
    context.strokeStyle = lineStyle;
    context.fillStyle = lineStyle;
  }
  context.lineWidth = waveform.thickness;
  context.lineJoin = "round";
  context.lineCap = "round";
  switch (waveform.type) {
    case "single-line":
      drawWaveLine(
        context,
        samples,
        startX,
        visualWidth,
        centerY,
        amplitude,
        1,
      );
      break;
    case "filled-ribbon":
      drawFilledRibbon(
        context,
        samples,
        startX,
        visualWidth,
        centerY,
        amplitude,
        waveform,
        cache?.fillPaint,
      );
      break;
    case "spectrum-bars":
      drawSpectrumBars(
        context,
        spectrum,
        startX,
        visualWidth,
        centerY,
        amplitude,
        waveform,
        time,
        waveformPalette,
        cache,
      );
      break;
    case "radial-ring":
      drawRadialRing(
        context,
        width,
        height,
        spectrum,
        centerY,
        amplitude,
        waveform,
        time,
        waveformPalette,
        cache,
      );
      break;
    default:
      drawWaveLine(
        context,
        samples,
        startX,
        visualWidth,
        centerY,
        amplitude,
        -1,
      );
      drawWaveLine(
        context,
        samples,
        startX,
        visualWidth,
        centerY,
        amplitude,
        1,
      );
  }
  context.restore();
}

function drawWaveLine(
  context,
  samples,
  startX,
  width,
  centerY,
  amplitude,
  direction,
) {
  context.beginPath();
  const sampleCount = samples.length;
  const denominator = Math.max(1, sampleCount - 1);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = samples[index];
    const x = startX + (index / denominator) * width;
    const y = centerY + direction * sample * amplitude;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
}

function drawFilledRibbon(
  context,
  samples,
  startX,
  width,
  centerY,
  amplitude,
  waveform,
  paintCache = null,
) {
  context.beginPath();
  const sampleCount = samples.length;
  const denominator = Math.max(1, sampleCount - 1);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = samples[index];
    const x = startX + (index / denominator) * width;
    const y = centerY - sample * amplitude;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  for (let index = sampleCount - 1; index >= 0; index -= 1) {
    const sample = samples[index];
    const x = startX + (index / denominator) * width;
    context.lineTo(x, centerY + sample * amplitude);
  }
  context.closePath();
  context.fillStyle = cachedWaveformPaint(
    context,
    waveform,
    startX,
    centerY - amplitude,
    startX + width,
    centerY + amplitude,
    (waveform.opacity / 100) * ((waveform.advanced?.fillOpacity ?? 28) / 100),
    paintCache,
  );
  context.fill();
  context.stroke();
}

function drawSpectrumBars(
  context,
  spectrum,
  startX,
  width,
  centerY,
  amplitude,
  waveform,
  time,
  palette,
  cache = null,
) {
  const gap = Math.max(
    1,
    width * 0.002 + (waveform.advanced?.barGap ?? 42) * 0.04,
  );
  const spectrumLength = spectrum.length;
  const barWidth = Math.max(2, width / Math.max(1, spectrumLength) - gap);
  const radius = Math.min(
    barWidth / 2,
    (waveform.advanced?.barRadius ?? 62) / 10,
  );
  const peakHold =
    Math.max(0, Math.min(100, waveform.advanced?.barPeakHold ?? 0)) / 100;
  const peakDecay =
    Math.max(0, Math.min(100, waveform.advanced?.barPeakDecay ?? 56)) / 100;
  const bandPaints = resolveWaveformBandPaints(
    waveform,
    palette,
    spectrumLength,
    waveform.opacity / 100,
    cache?.bandPaints,
  );
  const peakPaints =
    peakHold > 0.02
      ? resolveWaveformBandPaints(
          waveform,
          palette,
          spectrumLength,
          Math.min(1, waveform.opacity / 70),
          cache?.peakPaints,
        )
      : null;
  for (let index = 0; index < spectrumLength; index += 1) {
    const value = spectrum[index];
    const x = startX + index * (barWidth + gap);
    const barHeight = Math.max(waveform.thickness, value * amplitude * 2);
    context.fillStyle = bandPaints[index];
    roundedRect(
      context,
      x,
      centerY - barHeight / 2,
      barWidth,
      barHeight,
      radius,
    );
    if (peakHold > 0.02) {
      const phase = Math.sin(time * (0.7 + peakDecay * 1.6) + index * 0.91);
      const peakHeight = Math.min(
        amplitude * 2.1,
        barHeight + amplitude * peakHold * (0.45 + phase * 0.18),
      );
      const capHeight = Math.max(2, waveform.thickness * 1.2);
      context.fillStyle = peakPaints[index];
      roundedRect(
        context,
        x,
        centerY - peakHeight / 2 - capHeight * 1.15,
        barWidth,
        capHeight,
        Math.min(radius, capHeight / 2),
      );
      roundedRect(
        context,
        x,
        centerY + peakHeight / 2 + capHeight * 0.35,
        barWidth,
        capHeight,
        Math.min(radius, capHeight / 2),
      );
    }
  }
}

function drawRadialRing(
  context,
  width,
  height,
  spectrum,
  centerY,
  amplitude,
  waveform,
  time,
  palette,
  cache = null,
) {
  const arc = ((waveform.advanced?.radialArc ?? 100) / 100) * Math.PI * 2;
  const rotation =
    (((waveform.advanced?.radialRotation ?? 0) - 90) * Math.PI) / 180;
  const radius =
    Math.min(width, height) * ((waveform.advanced?.radialRadius ?? 32) / 100);
  const glow = Math.max(0, Math.min(100, waveform.advanced?.radialGlow ?? 0));
  context.save();
  context.translate(width / 2, centerY);
  if (glow > 0) {
    context.shadowBlur = (glow / 100) * Math.min(width, height) * 0.045;
    context.shadowColor = waveformBandPaint(waveform, palette, 1, 3, 0.72);
  }
  context.strokeStyle = cachedWaveformPaint(
    context,
    waveform,
    -radius,
    0,
    radius,
    0,
    Math.min(0.46, waveform.opacity / 210),
    cache?.radialOuterPaint,
  );
  context.lineWidth = Math.max(1, waveform.thickness * 0.74);
  context.beginPath();
  context.arc(0, 0, radius, rotation, rotation + arc);
  context.stroke();
  context.strokeStyle = cachedWaveformPaint(
    context,
    waveform,
    -radius,
    0,
    radius,
    0,
    Math.min(0.28, waveform.opacity / 320),
    cache?.radialInnerPaint,
  );
  context.lineWidth = Math.max(1, waveform.thickness * 0.42);
  context.beginPath();
  context.arc(0, 0, radius * 0.965, rotation, rotation + arc);
  context.stroke();
  context.lineWidth = waveform.thickness;
  const spectrumLength = spectrum.length;
  const radialGeometry = resolveRadialGeometry(
    spectrumLength,
    rotation,
    arc,
    radius,
    cache?.radialGeometry,
  );
  const bandPaints = resolveWaveformBandPaints(
    waveform,
    palette,
    spectrumLength,
    waveform.opacity / 100,
    cache?.bandPaints,
  );
  for (let index = 0; index < spectrumLength; index += 1) {
    const value = spectrum[index];
    const barHeight = Math.max(
      waveform.thickness,
      value * amplitude * (1 + Math.sin(time * 0.65 + index * 0.37) * 0.06),
    );
    context.strokeStyle = bandPaints[index];
    context.beginPath();
    const geometryIndex = index * 4;
    const startX = radialGeometry[geometryIndex];
    const startY = radialGeometry[geometryIndex + 1];
    const unitX = radialGeometry[geometryIndex + 2];
    const unitY = radialGeometry[geometryIndex + 3];
    context.moveTo(startX, startY);
    context.lineTo(startX + unitX * barHeight, startY + unitY * barHeight);
    context.stroke();
  }
  context.restore();
}

function waveformPaint(context, waveform, x0, y0, x1, y1, alpha) {
  if (waveform.colorMode !== "gradient") {
    return hexToRgba(waveform.color, alpha);
  }
  const gradient = context.createLinearGradient(x0, y0, x1, y1);
  gradient.addColorStop(0, hexToRgba(waveform.color, alpha));
  gradient.addColorStop(0.54, hexToRgba(waveform.secondaryColor, alpha));
  gradient.addColorStop(1, hexToRgba(waveform.tertiaryColor, alpha));
  return gradient;
}

function cachedWaveformPaint(
  context,
  waveform,
  x0,
  y0,
  x1,
  y1,
  alpha,
  cache = null,
) {
  if (!cache) return waveformPaint(context, waveform, x0, y0, x1, y1, alpha);
  const key = [
    waveform.colorMode,
    waveform.color,
    waveform.secondaryColor,
    waveform.tertiaryColor,
    x0,
    y0,
    x1,
    y1,
    alpha,
  ].join("|");
  if (cache.key === key && cache.value) return cache.value;
  cache.key = key;
  cache.value = waveformPaint(context, waveform, x0, y0, x1, y1, alpha);
  return cache.value;
}

function resolveRadialGeometry(total, rotation, arc, radius, cache = null) {
  if (
    cache &&
    cache.total === total &&
    cache.rotation === rotation &&
    cache.arc === arc &&
    cache.radius === radius &&
    cache.values.length === total * 4
  ) {
    return cache.values;
  }
  const values = cache?.values ?? [];
  values.length = total * 4;
  const denominator = Math.max(1, total - 1);
  for (let index = 0; index < total; index += 1) {
    const angle = rotation + (index / denominator) * arc;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const valueIndex = index * 4;
    values[valueIndex] = cos * radius;
    values[valueIndex + 1] = sin * radius;
    values[valueIndex + 2] = cos;
    values[valueIndex + 3] = sin;
  }
  if (cache) {
    cache.total = total;
    cache.rotation = rotation;
    cache.arc = arc;
    cache.radius = radius;
    cache.values = values;
  }
  return values;
}

function resolveWaveformPalette(waveform, cache = null) {
  const key = [
    waveform.color,
    waveform.secondaryColor,
    waveform.tertiaryColor,
  ].join("|");
  if (cache?.palette && cache.paletteKey === key) return cache.palette;
  const palette = {
    key,
    rgbs: [
      hexToRgb(waveform.color),
      hexToRgb(waveform.secondaryColor),
      hexToRgb(waveform.tertiaryColor),
    ],
  };
  if (cache) {
    cache.palette = palette;
    cache.paletteKey = key;
    cache.bandPaints.key = "";
    cache.peakPaints.key = "";
  }
  return palette;
}

function resolveWaveformBandPaints(
  waveform,
  palette,
  total,
  alpha,
  cache = null,
) {
  const key = `${palette.key}|${waveform.colorMode}|${total}|${alpha}`;
  if (cache?.key === key && cache.values.length === total) {
    return cache.values;
  }
  const values = cache?.values ?? [];
  values.length = total;
  for (let index = 0; index < total; index += 1) {
    values[index] = waveformBandPaint(waveform, palette, index, total, alpha);
  }
  if (cache) {
    cache.key = key;
    cache.values = values;
  }
  return values;
}

function waveformBandPaint(waveform, palette, index, total, alpha) {
  if (waveform.colorMode === "single") return rgbToRgba(palette.rgbs[0], alpha);
  if (waveform.colorMode === "bands") {
    return rgbToRgba(palette.rgbs[index % palette.rgbs.length], alpha);
  }
  const t = total <= 1 ? 0 : index / (total - 1);
  const first = t < 0.5 ? palette.rgbs[0] : palette.rgbs[1];
  const second = t < 0.5 ? palette.rgbs[1] : palette.rgbs[2];
  return mixRgbToRgba(first, second, t < 0.5 ? t * 2 : (t - 0.5) * 2, alpha);
}

function mixRgbToRgba(first, second, amount, alpha) {
  const t = Math.max(0, Math.min(1, amount));
  return rgbComponentsToRgba(
    first[0] + (second[0] - first[0]) * t,
    first[1] + (second[1] - first[1]) * t,
    first[2] + (second[2] - first[2]) * t,
    alpha,
  );
}

function rgbToRgba(rgb, alpha) {
  return rgbComponentsToRgba(rgb[0], rgb[1], rgb[2], alpha);
}

function rgbComponentsToRgba(redValue, greenValue, blueValue, alpha) {
  const red = Math.round(Math.max(0, Math.min(1, redValue)) * 255);
  const green = Math.round(Math.max(0, Math.min(1, greenValue)) * 255);
  const blue = Math.round(Math.max(0, Math.min(1, blueValue)) * 255);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, radius);
  } else {
    context.rect(x, y, width, height);
  }
  context.fill();
}

function smoothSamples(values, smoothing = 72, output = null) {
  const weight = Math.min(0.92, Math.max(0, smoothing / 100));
  if (weight <= 0) return values;
  const smoothed = output ?? new Array(values.length);
  smoothed.length = values.length;
  let previous = values[0] ?? 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    previous = previous * weight + value * (1 - weight);
    smoothed[index] = previous;
  }
  return smoothed;
}

function syntheticSamples(audio, time, output = null) {
  const samples = output ?? new Array(96);
  samples.length = 96;
  const energyScale = 0.28 + (audio.energy ?? 0) * 0.72;
  for (let index = 0; index < samples.length; index += 1) {
    const x = index / 95;
    const envelope = Math.sin(Math.PI * x);
    const wave =
      Math.sin(index * 0.46 + time * 1.6) * 0.42 +
      Math.sin(index * 0.18 - time * 0.72) * 0.28 +
      Math.sin(index * 0.08 + time * 0.34) * 0.18;
    samples[index] = wave * envelope * energyScale;
  }
  return samples;
}

function syntheticSpectrum(audio, time, output = null) {
  const spectrum = output ?? new Array(24);
  spectrum.length = 24;
  const bass = audio.bass ?? audio.energy ?? 0;
  const mid = audio.mid ?? audio.energy ?? 0;
  const high = audio.high ?? audio.energy ?? 0;
  for (let index = 0; index < spectrum.length; index += 1) {
    const position = index / 23;
    const band = position < 0.28 ? bass : position < 0.68 ? mid : high;
    spectrum[index] = Math.max(
      0.04,
      band * (0.68 + Math.sin(index * 0.83 + time * 1.8) * 0.18),
    );
  }
  return spectrum;
}

const defaultTextFadeOut = {
  enabled: false,
  mode: "tail",
  endPercent: 70,
  startPercent: 10,
  durationSeconds: 2,
};

const defaultTextSettings = {
  fields: {
    title: true,
    artist: true,
    album: false,
    year: false,
    version: false,
  },
  order: ["title", "version", "artist", "album", "year"],
  fieldStyles: {
    title: {
      fontFamily: "Inter",
      fontSize: 42,
      fontWeight: 720,
      fontStyle: "normal",
      letterSpacing: 0,
      lineHeight: 116,
      color: "#f7f8fb",
      opacity: 96,
      fadeOut: defaultTextFadeOut,
      align: "left",
    },
    version: {
      fontFamily: "Inter",
      fontSize: 25,
      fontWeight: 620,
      fontStyle: "normal",
      letterSpacing: 1,
      lineHeight: 118,
      color: "#cbd2dc",
      opacity: 72,
      fadeOut: defaultTextFadeOut,
      align: "left",
    },
    artist: {
      fontFamily: "Inter",
      fontSize: 28,
      fontWeight: 620,
      fontStyle: "normal",
      letterSpacing: 0,
      lineHeight: 120,
      color: "#cbd2dc",
      opacity: 82,
      fadeOut: defaultTextFadeOut,
      align: "left",
    },
    album: {
      fontFamily: "Georgia",
      fontSize: 26,
      fontWeight: 560,
      fontStyle: "normal",
      letterSpacing: 0,
      lineHeight: 122,
      color: "#d6c7a4",
      opacity: 72,
      fadeOut: defaultTextFadeOut,
      align: "left",
    },
    year: {
      fontFamily: "Inter",
      fontSize: 21,
      fontWeight: 620,
      fontStyle: "normal",
      letterSpacing: 4,
      lineHeight: 116,
      color: "#a5afbc",
      opacity: 62,
      fadeOut: defaultTextFadeOut,
      align: "left",
    },
  },
  fontFamily: "Inter",
  fontSize: 42,
  fontWeight: 650,
  letterSpacing: 0,
  lineHeight: 118,
  color: "#f7f8fb",
  opacity: 94,
  x: 5,
  y: 7,
  align: "left",
  verticalAnchor: "top",
  shadow: 48,
};

function drawMetadata(
  context,
  width,
  height,
  metadata,
  settings = {},
  time = 0,
  durationSeconds = null,
  options = {},
) {
  const layout = prepareMetadataLayout(
    context,
    width,
    height,
    metadata,
    settings,
    options,
  );
  drawMetadataLayout(context, layout, time, durationSeconds);
}

function resolveMetadataLayout(
  context,
  width,
  height,
  composition,
  cache = null,
) {
  const layers = composition.layers ?? [];
  const durationKey = metadataDurationKey(composition.durationSeconds);
  const mediaKey = metadataMediaKey(layers, durationKey);
  const fontStatus = documentFontStatus();
  if (
    cache &&
    cache.layout !== undefined &&
    cache.width === width &&
    cache.height === height &&
    cache.durationKey === durationKey &&
    cache.mediaKey === mediaKey &&
    cache.fontStatus === fontStatus
  ) {
    return cache.layout;
  }
  const textAvoidanceBounds = mediaTextAvoidanceBounds(
    width,
    height,
    layers,
    composition.durationSeconds,
  );
  const layout = prepareMetadataLayout(
    context,
    width,
    height,
    composition.metadata ?? {},
    composition.textSettings ?? {},
    { blockingRects: textAvoidanceBounds },
  );
  if (cache) {
    cache.layout = layout;
    cache.width = width;
    cache.height = height;
    cache.durationKey = durationKey;
    cache.mediaKey = mediaKey;
    cache.fontStatus = fontStatus;
  }
  return layout;
}

function prepareMetadataLayout(
  context,
  width,
  height,
  metadata,
  settings = {},
  options = {},
) {
  const textSettings = {
    ...defaultTextSettings,
    ...settings,
    fields: { ...defaultTextSettings.fields, ...(settings.fields ?? {}) },
    order: normalizeMetadataOrder(settings.order),
    fieldStyles: mergeMetadataFieldStyles(settings.fieldStyles),
  };
  const values = {
    title: String(metadata.title ?? "").trim(),
    version: String(metadata.version ?? "").trim(),
    // Fall back to the album artist when the track artist is empty, matching the
    // catalog/library which shows `albumArtist || artist`. Without this the video
    // overlay dropped the artist line for tracks that only carry an album artist.
    artist: String(metadata.artist || metadata.albumArtist || "").trim(),
    album: String(metadata.album ?? "").trim(),
    year: String(metadata.year ?? "").trim(),
  };
  const scale = Math.max(0.2, width / 1920);
  // Position is needed before measuring so each line can be shrunk to fit the
  // safe width that its alignment leaves between the anchor and the frame edge.
  const x = (width * textSettings.x) / 100;
  const baseLines = textSettings.order
    .filter((field) => textSettings.fields[field] && values[field])
    .map((field) => {
      const fieldStyle = textSettings.fieldStyles[field];
      const style = {
        ...mergeMetadataFieldStyle(field, fieldStyle),
        align:
          fieldStyle?.align ??
          (textSettings.align === "justify" ? "left" : textSettings.align),
      };
      const requestedSize = Math.max(9, style.fontSize * scale);
      const text = applyTextTransform(values[field], style.textTransform);
      const requestedLineHeight =
        requestedSize * ((style.lineHeight ?? 118) / 100);
      return {
        field,
        text,
        style,
        requestedSize,
        requestedLineHeight,
      };
    });
  if (!baseLines.length) return null;
  let y = (height * textSettings.y) / 100;
  const requestedBlockHeight = baseLines.reduce(
    (sum, line) => sum + line.requestedLineHeight,
    0,
  );
  if (textSettings.verticalAnchor === "middle") y -= requestedBlockHeight / 2;
  if (textSettings.verticalAnchor === "bottom") y -= requestedBlockHeight;
  let measureY = y;
  const lines = baseLines.map((line) => {
    const lineTop = measureY;
    const lineBottom = measureY + line.requestedLineHeight;
    measureY = lineBottom;
    const maxWidth = metadataSafeWidth(width, x, line.style.align, {
      blockingRects: options.blockingRects,
      lineTop,
      lineBottom,
    });
    // Auto-fit: never let an oversized title spill past the safe area —
    // shrink the font instead of relying on fillText's horizontal squash.
    const fontSize = fitMetadataFontSize(
      context,
      line.text,
      line.style,
      line.requestedSize,
      maxWidth,
    );
    const lineHeight = fontSize * ((line.style.lineHeight ?? 118) / 100);
    return {
      field: line.field,
      text: line.text,
      style: line.style,
      fontSize,
      maxWidth,
      lineHeight,
    };
  });
  const blockHeight = lines.reduce((sum, line) => sum + line.lineHeight, 0);
  y = (height * textSettings.y) / 100;
  if (textSettings.verticalAnchor === "middle") y -= blockHeight / 2;
  if (textSettings.verticalAnchor === "bottom") y -= blockHeight;
  return {
    lines,
    scale,
    shadow: textSettings.shadow,
    x,
    y,
  };
}

function drawMetadataLayout(context, layout, time = 0, durationSeconds = null) {
  if (!layout) return;
  context.save();
  context.textBaseline = "top";
  context.shadowColor = `rgba(0,0,0,${Math.max(0, Math.min(100, layout.shadow)) / 100})`;
  context.shadowBlur = Math.max(0, layout.shadow * layout.scale * 0.4);
  let cursorY = layout.y;
  for (const line of layout.lines) {
    const opacity = effectiveTextOpacity(line.style, time, durationSeconds);
    if (opacity <= 0) {
      cursorY += line.lineHeight;
      continue;
    }
    context.fillStyle = hexToRgba(line.style.color, opacity);
    context.textAlign =
      line.style.align === "justify" ? "left" : line.style.align;
    context.font = metadataFont(line.style, line.fontSize);
    drawMetadataLine(
      context,
      line.text,
      layout.x,
      cursorY,
      line.maxWidth,
      line.style,
    );
    cursorY += line.lineHeight;
  }
  context.restore();
}

function documentFontStatus() {
  return typeof document !== "undefined" && document.fonts?.status
    ? document.fonts.status
    : "unavailable";
}

function metadataDurationKey(durationSeconds = null) {
  const duration = Number(durationSeconds);
  return duration > 0 ? String(duration) : "";
}

function metadataMediaKey(layers = [], durationKey = "") {
  return layers
    .map((layer) => {
      const element = layer?.element;
      const fadeOut = layer?.coverFadeOut;
      const fadeIn = layer?.fadeIn;
      const zoom = layer?.zoom;
      return [
        layer?.id ?? "",
        durationKey,
        layer?.visible === false ? 0 : 1,
        layer?.opacity ?? "",
        layer?.scale ?? "",
        layer?.x ?? "",
        layer?.y ?? "",
        layer?.rotation ?? "",
        layer?.fit ?? "",
        fadeOut?.enabled ? 1 : 0,
        fadeOut?.mode ?? "",
        fadeOut?.startPercent ?? "",
        fadeOut?.endPercent ?? "",
        fadeOut?.durationSeconds ?? "",
        fadeIn?.enabled ? 1 : 0,
        fadeIn?.startPercent ?? "",
        fadeIn?.durationSeconds ?? "",
        zoom?.enabled ? 1 : 0,
        zoom?.from ?? "",
        zoom?.to ?? "",
        element?.videoWidth || element?.naturalWidth || "",
        element?.videoHeight || element?.naturalHeight || "",
      ].join(":");
    })
    .join("|");
}

export function effectiveTextOpacity(style, time = 0, durationSeconds = null) {
  return (
    effectiveTimedOpacity(
      clampPercent(style.opacity ?? 100) / 100,
      style.fadeOut,
      time,
      durationSeconds,
    ) * fadeInFactor(style.fadeIn, time, durationSeconds)
  );
}

function normalizeMetadataOrder(order) {
  const defaults = defaultTextSettings.order;
  const incoming = Array.isArray(order) ? order : [];
  const next = [];
  for (const field of incoming) {
    if (defaults.includes(field) && !next.includes(field)) next.push(field);
  }
  return [...next, ...defaults.filter((field) => !next.includes(field))];
}

function mergeMetadataFieldStyles(styles = {}) {
  return defaultTextSettings.order.reduce(
    (result, field) => ({
      ...result,
      [field]: mergeMetadataFieldStyle(field, styles[field]),
    }),
    {},
  );
}

function mergeMetadataFieldStyle(field, style = {}) {
  const fallback = defaultTextSettings.fieldStyles[field];
  return {
    ...fallback,
    ...style,
    fontFamily: [
      "Inter",
      "Georgia",
      "Arial",
      "Playfair Display",
      "Cormorant Garamond",
      "DM Serif Display",
      "Cinzel",
      "Montserrat",
      "Oswald",
      "Raleway",
      "Space Grotesk",
      "Bebas Neue",
    ].includes(style.fontFamily)
      ? style.fontFamily
      : fallback.fontFamily,
    fontSize: clampValue(style.fontSize, fallback.fontSize, 9, 96),
    fontWeight: clampValue(style.fontWeight, fallback.fontWeight, 300, 900),
    fontStyle: style.fontStyle === "italic" ? "italic" : fallback.fontStyle,
    letterSpacing: clampValue(
      style.letterSpacing,
      fallback.letterSpacing,
      0,
      24,
    ),
    lineHeight: clampValue(style.lineHeight, fallback.lineHeight, 90, 180),
    color:
      typeof style.color === "string" && /^#[0-9a-f]{6}$/i.test(style.color)
        ? style.color
        : fallback.color,
    opacity: clampValue(style.opacity, fallback.opacity, 0, 100),
    textTransform: ["none", "uppercase", "lowercase"].includes(
      style.textTransform,
    )
      ? style.textTransform
      : (fallback.textTransform ?? "none"),
    fadeOut: normalizeTextFadeOut(style.fadeOut ?? fallback.fadeOut),
    fadeIn: normalizeTextFadeIn(style.fadeIn ?? fallback.fadeIn),
    align: ["left", "center", "right"].includes(style.align)
      ? style.align
      : fallback.align,
  };
}

function normalizeTextFadeOut(value = {}) {
  const mode = value?.mode === "timed" ? "timed" : "tail";
  return {
    enabled: value?.enabled === true,
    mode,
    endPercent: clampValue(
      value?.endPercent,
      defaultTextFadeOut.endPercent,
      5,
      95,
    ),
    startPercent: clampValue(
      value?.startPercent,
      defaultTextFadeOut.startPercent,
      0,
      95,
    ),
    durationSeconds: clampValue(
      value?.durationSeconds,
      defaultTextFadeOut.durationSeconds,
      0.25,
      60,
    ),
  };
}

function normalizeTextFadeIn(value = {}) {
  return {
    enabled: value?.enabled === true,
    startPercent: clampValue(value?.startPercent, 0, 0, 95),
    durationSeconds: clampValue(value?.durationSeconds, 1.5, 0.25, 60),
  };
}

function clampValue(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

// Builds the canvas font shorthand for a metadata line at a given size. Shared
// by the draw loop and the fit measurement so both agree on metrics.
function metadataFont(style, fontSize) {
  return `${style.fontStyle === "italic" ? "italic " : ""}${Math.round(
    style.fontWeight,
  )} ${fontSize}px ${fontFamilyStack(style.fontFamily)}`;
}

// Horizontal room a line has before it touches the frame edge or a media layer
// that intersects the same vertical band. A small margin keeps text off hard
// borders; media bounds are sampled at t=0 so animated layers do not make text
// pulse during export.
const METADATA_SAFE_MARGIN = 0.045;
const METADATA_OBSTACLE_PADDING = 0.012;
export function metadataSafeWidth(width, xPx, align, options = {}) {
  const margin = width * METADATA_SAFE_MARGIN;
  const obstaclePadding = Math.max(8, width * METADATA_OBSTACLE_PADDING);
  let leftLimit = margin;
  let rightLimit = width - margin;
  const lineTop = Number(options.lineTop);
  const lineBottom = Number(options.lineBottom);
  const blockers = Array.isArray(options.blockingRects)
    ? options.blockingRects
    : [];
  for (const rect of blockers) {
    if (!rect) continue;
    const overlapsVertically =
      Number.isFinite(lineTop) && Number.isFinite(lineBottom)
        ? rect.bottom > lineTop && rect.top < lineBottom
        : true;
    if (!overlapsVertically) continue;
    if (rect.left <= xPx && rect.right >= xPx) {
      return 0;
    }
    if (rect.right < xPx) {
      leftLimit = Math.max(leftLimit, rect.right + obstaclePadding);
    } else if (rect.left > xPx) {
      rightLimit = Math.min(rightLimit, rect.left - obstaclePadding);
    }
  }
  if (align === "center") {
    return Math.max(0, 2 * Math.min(xPx - leftLimit, rightLimit - xPx));
  }
  if (align === "right") return Math.max(0, xPx - leftLimit);
  return Math.max(0, rightLimit - xPx);
}

// Shrinks fontSize until the (letter-spacing-aware) text fits maxWidth. Pure
// reduction — never enlarges, never wraps — with a 9px floor. Returns the
// original size when it already fits or when there is no width budget.
export function fitMetadataFontSize(context, text, style, fontSize, maxWidth) {
  if (!(maxWidth > 0)) return fontSize;
  const spaced = applyLetterSpacing(text, style.letterSpacing);
  let size = fontSize;
  for (let pass = 0; pass < 4; pass += 1) {
    context.font = metadataFont(style, size);
    const measured = context.measureText(spaced).width;
    if (measured <= maxWidth || size <= 9) break;
    const next = Math.max(9, Math.floor(size * (maxWidth / measured)));
    size = next >= size ? Math.max(9, size - 1) : next;
  }
  return size;
}

function drawMetadataLine(context, line, x, y, maxWidth, textSettings) {
  if (textSettings.align !== "justify") {
    // No maxWidth cap: the font was already fit to the safe width, so passing a
    // cap here would horizontally squash glyphs instead of preserving the fit.
    context.fillText(
      applyLetterSpacing(line, textSettings.letterSpacing),
      x,
      y,
    );
    return;
  }
  const words = String(line).trim().split(/\s+/u).filter(Boolean);
  if (words.length < 2) {
    context.fillText(
      applyLetterSpacing(line, textSettings.letterSpacing),
      x,
      y,
    );
    return;
  }
  const measured = words.map((word) => ({
    word: applyLetterSpacing(word, textSettings.letterSpacing),
    width: context.measureText(
      applyLetterSpacing(word, textSettings.letterSpacing),
    ).width,
  }));
  const totalWidth = measured.reduce((sum, item) => sum + item.width, 0);
  const gap = Math.max(4, (maxWidth - totalWidth) / (words.length - 1));
  let cursor = x;
  for (const item of measured) {
    context.fillText(item.word, cursor, y);
    cursor += item.width + gap;
  }
}

function fontFamilyStack(fontFamily) {
  switch (fontFamily) {
    case "Georgia":
      return "Georgia, 'Times New Roman', serif";
    case "Arial":
      return "Arial, sans-serif";
    case "Playfair Display":
      return "'Playfair Display', Georgia, serif";
    case "Cormorant Garamond":
      return "'Cormorant Garamond', Georgia, serif";
    case "DM Serif Display":
      return "'DM Serif Display', Georgia, serif";
    case "Cinzel":
      return "Cinzel, Georgia, serif";
    case "Montserrat":
      return "Montserrat, Inter, sans-serif";
    case "Oswald":
      return "Oswald, Inter, sans-serif";
    case "Raleway":
      return "Raleway, Inter, sans-serif";
    case "Space Grotesk":
      return "'Space Grotesk', Inter, sans-serif";
    case "Bebas Neue":
      return "'Bebas Neue', Impact, sans-serif";
    case "Inter":
    default:
      return "Inter, Arial, sans-serif";
  }
}

function applyTextTransform(text, transform) {
  if (transform === "uppercase") return String(text).toUpperCase();
  if (transform === "lowercase") return String(text).toLowerCase();
  return text;
}

function applyLetterSpacing(value, spacing) {
  const amount = Math.max(0, Number(spacing) || 0);
  return amount > 0
    ? String(value)
        .split("")
        .join(" ".repeat(Math.min(4, Math.round(amount / 2))))
    : value;
}

function seeded(seed, index, salt = 0) {
  return fract(
    Math.sin(seed * 12.9898 + index * 78.233 + salt * 37.719) * 43758.5453,
  );
}

function fract(value) {
  return value - Math.floor(value);
}

function roundedRectPath(context, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function splitVisualCollection(value, fallback) {
  const items = String(value ?? "")
    .split(/[\s,;]+/u)
    .map(safeGlyph)
    .filter(Boolean);
  return items.length ? items : String(fallback).split(/\s+/u);
}

function safeGlyph(value) {
  const glyph = Array.from(String(value ?? ""))
    .filter((character) => character >= " ")
    .slice(0, 8)
    .join("");
  return glyph || "•";
}

function hexToRgb(hex) {
  const value = hexColorValue(hex);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

function hexColorValue(hex) {
  const source = String(hex ?? "");
  const safeHex = /^#[0-9a-f]{6}$/i.test(source)
    ? source.toLowerCase()
    : "#ffffff";
  const cached = hexColorValueCache.get(safeHex);
  if (cached !== undefined) return cached;
  const value = Number.parseInt(safeHex.slice(1), 16);
  if (hexColorValueCache.size >= HEX_COLOR_VALUE_CACHE_LIMIT) {
    hexColorValueCache.clear();
  }
  hexColorValueCache.set(safeHex, value);
  return value;
}

function hexToRgba(hex, alpha) {
  const value = hexColorValue(hex);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}
