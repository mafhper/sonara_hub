const vertexShader = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

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
  vec2 sun = vec2(0.5 + (u_param2 - 0.5) * 0.6, 0.72);
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
};

const blendModes = {
  normal: "source-over",
  screen: "screen",
  multiply: "multiply",
  overlay: "overlay",
};

export function legacyRenderStack(scene, composition) {
  const stack = [{ kind: "atmosphere" }];
  if (scene.cloudLight?.enabled && scene.rendererId !== "volumetric-clouds") {
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

export function createSceneRuntime(
  canvas,
  initialScene,
  initialComposition = {},
) {
  const context = canvas.getContext("2d", { alpha: false });
  const webglCanvas = document.createElement("canvas");
  const webgl = createWebglRenderer(webglCanvas);
  const state = {
    scene: initialScene,
    composition: initialComposition,
    audio: {
      energy: 0,
      bass: 0,
      mid: 0,
      high: 0,
      samples: [],
      spectrum: [],
    },
  };

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
  }

  function renderAtmosphere(context, width, height, scene, audio, time) {
    if (fragmentShaders[scene.rendererId]) {
      webgl.render(scene, audio, time);
      context.drawImage(webglCanvas, 0, 0, width, height);
    } else if (scene.rendererId === "vector-aura") {
      drawVectorAura(context, width, height, scene, audio, time);
    } else if (scene.rendererId === "playful-shapes") {
      drawPlayfulShapes(context, width, height, scene, audio, time);
    } else if (scene.rendererId === "piano-ribbons") {
      drawPianoRibbons(context, width, height, scene, audio, time);
    } else {
      drawDarkSurface(context, width, height, scene, audio, time);
    }
  }

  function render(time = 0, fps = 24) {
    resize(
      canvas.clientWidth || canvas.width,
      canvas.clientHeight || canvas.height,
    );
    const { scene, composition, audio } = state;
    const width = canvas.width;
    const height = canvas.height;
    context.save();
    context.clearRect(0, 0, width, height);

    const stack =
      Array.isArray(composition.renderOrder) &&
      composition.renderOrder.length > 0
        ? composition.renderOrder
        : Array.isArray(scene.renderOrder) && scene.renderOrder.length > 0
          ? scene.renderOrder
          : legacyRenderStack(scene, composition);

    for (const item of stack) {
      switch (item.kind) {
        case "atmosphere":
          renderAtmosphere(context, width, height, scene, audio, time);
          break;
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
          drawPost(context, width, height, scene.post, time, fps);
          break;
        case "waveform":
          if (scene.waveform?.visible) {
            drawWaveform(context, width, height, scene.waveform, audio, time);
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
          const layer = (composition.layers ?? []).find(
            (l) => l.id === item.layerId,
          );
          if (layer && layer.visible !== false && layer.element) {
            drawMediaLayer(
              context,
              width,
              height,
              layer,
              time,
              composition.durationSeconds,
            );
          }
          break;
        }
      }
    }

    // Text and global shade always render last — they are not part of the
    // reorderable stack because text overlay is conceptually always on top.
    if (composition.showMetadata !== false) {
      const textAvoidanceBounds = mediaTextAvoidanceBounds(
        width,
        height,
        composition.layers ?? [],
        composition.durationSeconds,
      );
      drawMetadata(
        context,
        width,
        height,
        composition.metadata ?? {},
        composition.textSettings ?? {},
        time,
        composition.durationSeconds,
        { blockingRects: textAvoidanceBounds },
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
    },
    setComposition(composition) {
      state.composition = composition;
    },
    setAudio(audio) {
      state.audio = { ...state.audio, ...audio };
    },
    destroy() {
      webgl.destroy();
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

function createWebglRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
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
      "audioEnergy",
      "audioBass",
      "audioMid",
      "audioHigh",
      "colorA",
      "colorB",
      "accentColor",
      "param0",
      "param1",
      "param2",
      "param3",
      "param4",
      "param5",
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

  function render(scene, audio, time) {
    const compiled = getProgram(scene.rendererId);
    const values = scene.controls.map(
      ({ key }) => (scene.advanced[key] ?? 0) / 100,
    );
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(compiled.program);
    gl.enableVertexAttribArray(compiled.position);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(compiled.position, 2, gl.FLOAT, false, 0, 0);
    set2f("resolution", canvas.width, canvas.height);
    set1f("time", time);
    set1f("intensity", scene.common.intensity / 100);
    set1f("speed", scene.common.speed / 100);
    set1f("brightness", scene.common.brightness / 100);
    set1f("direction", scene.common.direction);
    set1f("audioReaction", scene.common.audioReaction / 100);
    set1f("shade", scene.common.shade / 100);
    set1f("audioEnergy", audio.energy ?? 0);
    set1f("audioBass", audio.bass ?? 0);
    set1f("audioMid", audio.mid ?? 0);
    set1f("audioHigh", audio.high ?? 0);
    set1f("audioCentroid", audio.centroid ?? 0);
    set1f("audioFlux", audio.flux ?? 0);
    set1f("audioOnset", audio.onset ?? 0);
    set1f("audioBeat", audio.beat ?? 0);
    set1f("beatPhase", audio.beatPhase ?? 0);
    set3fv("colorA", hexToRgb(scene.colors.base));
    set3fv("colorB", hexToRgb(scene.colors.effect));
    set3fv("accentColor", hexToRgb(scene.colors.light));
    for (let index = 0; index < 6; index += 1) {
      set1f(`param${index}`, values[index] ?? 0);
    }
    const cloudLight = scene.cloudLight ?? {};
    set1f("cloudSunEnabled", cloudLight.enabled ? 1 : 0);
    set1f("cloudSunIntensity", (cloudLight.intensity ?? 0) / 100);
    set1f("cloudSunX", (cloudLight.x ?? 28) / 100);
    set1f("cloudSunY", (cloudLight.y ?? 24) / 100);
    set1f("cloudSunRadius", (cloudLight.radius ?? 32) / 100);
    set1f("cloudSunDiffusion", (cloudLight.diffusion ?? 68) / 100);
    set1f("cloudSunMotion", (cloudLight.motion ?? 0) / 100);
    set1f("cloudSunSpeed", (cloudLight.speed ?? 36) / 100);
    set1f("cloudSunDirection", cloudLight.direction ?? 18);
    set3fv("cloudSunColor", hexToRgb(cloudLight.color ?? scene.colors.light));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

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

  return {
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

function drawVectorAura(context, width, height, scene, audio, time) {
  const base = scene.colors.base;
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);
  const direction = (scene.common.direction * Math.PI) / 180;
  const speed = 0.04 + scene.common.speed / 220;
  const presence = scene.advanced.shapes / 100;
  const scale = 0.28 + scene.advanced.scale / 150;
  const drift = scene.advanced.drift / 100;
  const blur = 18 + scene.advanced.blur * 0.62;
  const pulse =
    1 + (audio.mid ?? 0) * (scene.common.audioReaction / 100) * 0.22;
  context.save();
  context.filter = `blur(${blur}px)`;
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < 3; index += 1) {
    const phase = time * speed * (0.72 + index * 0.16) + index * 2.18;
    const center = height * (0.24 + index * 0.24);
    const swing = height * (0.08 + drift * 0.11);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, hexToRgba(scene.colors.effect, 0.04 * presence));
    gradient.addColorStop(
      0.46,
      hexToRgba(
        index === 1 ? scene.colors.light : scene.colors.effect,
        0.38 * presence,
      ),
    );
    gradient.addColorStop(1, hexToRgba(scene.colors.light, 0.07 * presence));
    context.strokeStyle = gradient;
    context.lineWidth = height * (0.15 + presence * 0.08 + index * 0.025);
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
    const phase = time * speed + index * 1.73;
    const x =
      width *
      (0.22 +
        index * 0.2 +
        Math.sin(phase) * 0.1 * drift * Math.cos(direction));
    const y =
      height *
      (0.24 +
        (index % 2) * 0.34 +
        Math.cos(phase * 0.82) * 0.11 * drift * Math.sin(direction + 1));
    const radius = width * scale * (0.58 + index * 0.08) * pulse;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(
      0,
      hexToRgba(
        index % 2 ? scene.colors.effect : scene.colors.light,
        0.38 * presence,
      ),
    );
    gradient.addColorStop(
      0.58,
      hexToRgba(scene.colors.effect, 0.16 * presence),
    );
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(x, y, radius, radius * 0.58, phase * 0.14, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawPlayfulShapes(context, width, height, scene, audio, time) {
  drawPlayfulBackground(context, width, height, scene, audio);
  const playful = scene.playful ?? {};
  const categories = playfulCategories(playful);
  const quantity = Math.round(4 + ((scene.advanced.quantity ?? 48) / 100) * 10);
  const direction = ((scene.common.direction ?? 0) * Math.PI) / 180;
  const speed = 0.12 + (scene.common.speed ?? 22) / 72;
  const depthAmount = (scene.advanced.depth ?? 54) / 100;
  const randomness = (scene.advanced.randomness ?? 56) / 100;
  const diversity = (scene.advanced.diversity ?? 72) / 100;
  const rotation = (scene.advanced.rotation ?? 42) / 100;
  const drift = (scene.advanced.drift ?? 38) / 100;
  const scale = 0.72 + (scene.advanced.scale ?? 56) / 150;
  const reaction =
    ((scene.common.audioReaction ?? 22) / 100) * (audio.energy ?? 0);
  const mode = playfulMotion(playful.motionMode);
  const seed = Math.round(playful.seed ?? 37);
  const palette = [scene.colors.light, scene.colors.effect, "#ffffff"];
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
    const x = baseX + sway * Math.cos(direction) - lift * Math.sin(direction);
    const y = baseY + sway * Math.sin(direction) + lift * Math.cos(direction);
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
      playful,
      seed,
      index,
    );
    context.restore();
  }
  context.restore();
}

function drawPlayfulBackground(context, width, height, scene, audio) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, scene.colors.base);
  gradient.addColorStop(0.58, hexToRgba(scene.colors.effect, 0.82));
  gradient.addColorStop(1, hexToRgba(scene.colors.light, 0.92));
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
  if (value === "calm") {
    return {
      travel: 0.64,
      rotation: 0.58,
      bassPulse: 0.42,
      energy: 0.48,
      highlight: 0.58,
    };
  }
  if (value === "play") {
    return {
      travel: 1.34,
      rotation: 1.24,
      bassPulse: 0.94,
      energy: 1.12,
      highlight: 1.08,
    };
  }
  return {
    travel: 0.92,
    rotation: 0.84,
    bassPulse: 0.68,
    energy: 0.78,
    highlight: 0.82,
  };
}

function drawPlayfulElement(
  context,
  category,
  size,
  color,
  playful,
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
  const collection =
    category === "letter"
      ? splitVisualCollection(playful.collections?.letters, "A B C D E")
      : category === "number"
        ? splitVisualCollection(playful.collections?.numbers, "1 2 3 4 5")
        : splitVisualCollection(playful.collections?.emojis, "☀️ 🎈 🌱 ⭐ 🎵");
  const glyph = safeGlyph(collection[index % collection.length]);
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

function drawPianoRibbons(context, width, height, scene, audio, time) {
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, scene.colors.base);
  background.addColorStop(1, hexToRgba(scene.colors.effect, 0.82));
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const bandCount = Math.round(6 + ((scene.advanced.bands ?? 54) / 100) * 8);
  const gap = 0.12 + ((scene.advanced.gap ?? 26) / 100) * 0.34;
  const widthScale = 0.74 + ((scene.advanced.bandWidth ?? 58) / 100) * 0.68;
  const curvature = ((scene.advanced.curvature ?? 46) / 100) * height * 0.22;
  const depth = (scene.advanced.depth ?? 54) / 100;
  const drift = (scene.advanced.drift ?? 34) / 100;
  const speed = 0.16 + (scene.common.speed ?? 24) / 82;
  const direction = ((scene.common.direction ?? 0) * Math.PI) / 180;
  const available = width * 1.16;
  const step = available / bandCount;
  const bandWidth = step * widthScale * (1 - gap * 0.38);
  const palette = [
    scene.colors.light,
    "#f7f1dd",
    scene.colors.effect,
    "#76b7d6",
  ];
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(Math.sin(direction) * 0.08);
  context.translate(-width / 2, -height / 2);
  for (let index = 0; index < bandCount; index += 1) {
    const spectrum =
      audio.spectrum?.[index % (audio.spectrum?.length || 1)] ??
      audio.energy ??
      0;
    const phase = time * speed + index * 0.54;
    const wave =
      Math.sin(phase) * curvature * (0.46 + drift * 0.7) +
      spectrum * curvature * (scene.common.audioReaction / 70);
    const x = -width * 0.08 + index * step;
    const foreground = index % 3 !== 1;
    context.globalAlpha = 0.56 + (foreground ? 0.26 : depth * 0.18);
    context.fillStyle = palette[index % palette.length];
    context.beginPath();
    context.moveTo(x, height * 1.12);
    context.bezierCurveTo(
      x - bandWidth * 0.12,
      height * 0.72 + wave,
      x + bandWidth * 0.18,
      height * 0.28 - wave * 0.58,
      x + bandWidth * 0.5,
      -height * 0.12,
    );
    context.lineTo(x + bandWidth * 1.18, -height * 0.12);
    context.bezierCurveTo(
      x + bandWidth * 0.84,
      height * 0.28 - wave * 0.58,
      x + bandWidth * 0.92,
      height * 0.72 + wave,
      x + bandWidth,
      height * 1.12,
    );
    context.closePath();
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
) {
  const element = layer.element;
  if (!element) return;
  const opacity = effectiveLayerOpacity(layer, time, durationSeconds);
  if (opacity <= 0) return;
  const bounds = mediaLayerBounds(width, height, layer, time, durationSeconds);
  if (!bounds) return;
  const drawWidth = bounds.drawWidth;
  const drawHeight = bounds.drawHeight;
  const x = bounds.x;
  const y = bounds.y;
  const shadow = layer.shadow ?? {};
  context.save();
  context.globalCompositeOperation =
    blendModes[layer.blendMode] ?? "source-over";
  context.globalAlpha = opacity;
  context.shadowColor = `rgba(0,0,0,${(shadow.opacity ?? 0) / 100})`;
  context.shadowBlur = shadow.blur ?? 0;
  context.shadowOffsetX = shadow.x ?? 0;
  context.shadowOffsetY = shadow.y ?? 0;
  context.translate(x + drawWidth / 2, y + drawHeight / 2);
  context.rotate(((layer.rotation ?? 0) * Math.PI) / 180);
  if (layer.blur) context.filter = `blur(${Math.max(0, layer.blur)}px)`;
  context.drawImage(
    element,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight,
  );
  context.filter = "none";
  if (layer.maskOpacity) {
    context.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(100, layer.maskOpacity)) / 100})`;
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
) {
  const element = layer?.element;
  if (!element || layer.visible === false) return null;
  const opacity = effectiveLayerOpacity(layer, time, durationSeconds);
  if (opacity <= 0) return null;
  const naturalWidth = element.videoWidth || element.naturalWidth || width;
  const naturalHeight = element.videoHeight || element.naturalHeight || height;
  const zoom = effectiveZoomScale(layer.zoom, time, durationSeconds);
  const targetWidth = width * ((layer.scale ?? 100) / 100) * zoom;
  const targetHeight = height * ((layer.scale ?? 100) / 100) * zoom;
  const factor =
    layer.fit === "cover"
      ? Math.max(targetWidth / naturalWidth, targetHeight / naturalHeight)
      : Math.min(targetWidth / naturalWidth, targetHeight / naturalHeight);
  const drawWidth = naturalWidth * factor;
  const drawHeight = naturalHeight * factor;
  const x = (width - drawWidth) * ((layer.x ?? 50) / 100);
  const y = (height - drawHeight) * ((layer.y ?? 50) / 100);
  const rotation = (((layer.rotation ?? 0) * Math.PI) / 180) % (Math.PI * 2);
  if (!rotation) {
    return {
      x,
      y,
      drawWidth,
      drawHeight,
      left: x,
      top: y,
      right: x + drawWidth,
      bottom: y + drawHeight,
    };
  }
  const cx = x + drawWidth / 2;
  const cy = y + drawHeight / 2;
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  const boxWidth = drawWidth * cos + drawHeight * sin;
  const boxHeight = drawWidth * sin + drawHeight * cos;
  return {
    x,
    y,
    drawWidth,
    drawHeight,
    left: cx - boxWidth / 2,
    top: cy - boxHeight / 2,
    right: cx + boxWidth / 2,
    bottom: cy + boxHeight / 2,
  };
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

function drawPost(context, width, height, post, time = 0, fps = 24) {
  const vignette = clampNumber(Number(post?.vignette ?? 0), 0, 100) / 100;
  const grain = clampNumber(Number(post?.grain ?? 0), 0, 100) / 100;
  const scanlines = clampNumber(Number(post?.scanlines ?? 0), 0, 100) / 100;
  // `bloom` and `chromaticAberration` are schema stubs for V5.1; they need
  // framebuffer passes, so V5 keeps them inert instead of faking the behavior.
  if (vignette <= 0 && grain <= 0 && scanlines <= 0) return;

  if (vignette > 0) {
    context.save();
    context.globalCompositeOperation = "multiply";
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
    context.restore();
  }

  if (grain > 0 && typeof document !== "undefined") {
    const frameSeed = Math.floor(Math.max(0, time) * Math.max(1, fps));
    const image = context.createImageData(width, height);
    const data = image.data;
    const alpha = Math.round(28 * grain);
    for (let index = 0; index < data.length; index += 4) {
      const pixel = index / 4;
      const value = seeded(frameSeed + 17, pixel, 29) > 0.5 ? 255 : 0;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = alpha;
    }
    const grainCanvas = document.createElement("canvas");
    grainCanvas.width = width;
    grainCanvas.height = height;
    grainCanvas.getContext("2d").putImageData(image, 0, 0);
    context.save();
    context.globalCompositeOperation = "overlay";
    context.drawImage(grainCanvas, 0, 0);
    context.restore();
  }

  if (scanlines > 0) {
    const step = Math.max(2, Math.round(height / 360));
    context.save();
    context.globalCompositeOperation = "multiply";
    context.fillStyle = `rgba(0,0,0,${0.2 * scanlines})`;
    for (let y = 0; y < height; y += step * 2) {
      context.fillRect(0, y, width, step);
    }
    context.restore();
  }
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
  const size =
    ((Math.min(width, height) * scene.advanced.discSize) / 100) *
    (1 + bassPulse * 0.045);
  const x = (width * scene.advanced.x) / 100;
  const y = (height * scene.advanced.y) / 100;
  const radius = size / 2;
  context.save();
  context.translate(x, y);
  context.rotate(
    time * (((scene.advanced.rpm ?? 34) + bassPulse * 16) / 60) * Math.PI * 2,
  );
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
  context.strokeStyle = "rgba(255,255,255,0.08)";
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

function drawWaveform(context, width, height, waveform, audio, time) {
  const centerY = (height * waveform.position) / 100;
  const reaction = 0.35 + (waveform.audioReaction ?? 54) / 100;
  const amplitude = ((height * waveform.height) / 200) * reaction;
  const visualWidth = width * ((waveform.width ?? 100) / 100);
  const startX = (width - visualWidth) / 2;
  const samples = smoothSamples(
    audio.samples?.length ? audio.samples : syntheticSamples(audio, time),
    waveform.smoothing,
  );
  const spectrum = audio.spectrum?.length
    ? audio.spectrum
    : syntheticSpectrum(audio, time);
  context.save();
  const lineStyle = waveformPaint(
    context,
    waveform,
    startX,
    centerY - amplitude,
    startX + visualWidth,
    centerY + amplitude,
    waveform.opacity / 100,
  );
  context.strokeStyle = lineStyle;
  context.fillStyle = lineStyle;
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
  samples.forEach((sample, index) => {
    const x = startX + (index / Math.max(1, samples.length - 1)) * width;
    const y = centerY + direction * sample * amplitude;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
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
) {
  context.beginPath();
  samples.forEach((sample, index) => {
    const x = startX + (index / Math.max(1, samples.length - 1)) * width;
    const y = centerY - sample * amplitude;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  [...samples].reverse().forEach((sample, reverseIndex) => {
    const index = samples.length - reverseIndex - 1;
    const x = startX + (index / Math.max(1, samples.length - 1)) * width;
    context.lineTo(x, centerY + sample * amplitude);
  });
  context.closePath();
  context.fillStyle = waveformPaint(
    context,
    waveform,
    startX,
    centerY - amplitude,
    startX + width,
    centerY + amplitude,
    (waveform.opacity / 100) * ((waveform.advanced?.fillOpacity ?? 28) / 100),
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
) {
  const gap = Math.max(
    1,
    width * 0.002 + (waveform.advanced?.barGap ?? 42) * 0.04,
  );
  const barWidth = Math.max(2, width / Math.max(1, spectrum.length) - gap);
  const radius = Math.min(
    barWidth / 2,
    (waveform.advanced?.barRadius ?? 62) / 10,
  );
  const peakHold =
    Math.max(0, Math.min(100, waveform.advanced?.barPeakHold ?? 0)) / 100;
  const peakDecay =
    Math.max(0, Math.min(100, waveform.advanced?.barPeakDecay ?? 56)) / 100;
  spectrum.forEach((value, index) => {
    const x = startX + index * (barWidth + gap);
    const barHeight = Math.max(waveform.thickness, value * amplitude * 2);
    context.fillStyle = waveformBandPaint(
      waveform,
      index,
      spectrum.length,
      waveform.opacity / 100,
    );
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
      context.fillStyle = waveformBandPaint(
        waveform,
        index,
        spectrum.length,
        Math.min(1, waveform.opacity / 70),
      );
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
  });
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
    context.shadowColor = waveformBandPaint(waveform, 1, 3, 0.72);
  }
  context.strokeStyle = waveformPaint(
    context,
    waveform,
    -radius,
    0,
    radius,
    0,
    Math.min(0.46, waveform.opacity / 210),
  );
  context.lineWidth = Math.max(1, waveform.thickness * 0.74);
  context.beginPath();
  context.arc(0, 0, radius, rotation, rotation + arc);
  context.stroke();
  context.strokeStyle = waveformPaint(
    context,
    waveform,
    -radius,
    0,
    radius,
    0,
    Math.min(0.28, waveform.opacity / 320),
  );
  context.lineWidth = Math.max(1, waveform.thickness * 0.42);
  context.beginPath();
  context.arc(0, 0, radius * 0.965, rotation, rotation + arc);
  context.stroke();
  context.lineWidth = waveform.thickness;
  spectrum.forEach((value, index) => {
    const angle = rotation + (index / Math.max(1, spectrum.length - 1)) * arc;
    const barHeight = Math.max(
      waveform.thickness,
      value * amplitude * (1 + Math.sin(time * 0.65 + index * 0.37) * 0.06),
    );
    context.strokeStyle = waveformBandPaint(
      waveform,
      index,
      spectrum.length,
      waveform.opacity / 100,
    );
    context.beginPath();
    context.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    context.lineTo(
      Math.cos(angle) * (radius + barHeight),
      Math.sin(angle) * (radius + barHeight),
    );
    context.stroke();
  });
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

function waveformBandPaint(waveform, index, total, alpha) {
  if (waveform.colorMode === "single") return hexToRgba(waveform.color, alpha);
  const palette = [
    waveform.color,
    waveform.secondaryColor,
    waveform.tertiaryColor,
  ];
  if (waveform.colorMode === "bands") {
    return hexToRgba(palette[index % palette.length], alpha);
  }
  const t = total <= 1 ? 0 : index / (total - 1);
  const first = t < 0.5 ? palette[0] : palette[1];
  const second = t < 0.5 ? palette[1] : palette[2];
  return rgbToRgba(
    mixRgb(hexToRgb(first), hexToRgb(second), t < 0.5 ? t * 2 : (t - 0.5) * 2),
    alpha,
  );
}

function mixRgb(first, second, amount) {
  const t = Math.max(0, Math.min(1, amount));
  return first.map((value, index) => value + (second[index] - value) * t);
}

function rgbToRgba(rgb, alpha) {
  const [red, green, blue] = rgb.map((value) =>
    Math.round(Math.max(0, Math.min(1, value)) * 255),
  );
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

function smoothSamples(values, smoothing = 72) {
  const weight = Math.min(0.92, Math.max(0, smoothing / 100));
  let previous = values[0] ?? 0;
  return values.map((value) => {
    previous = previous * weight + value * (1 - weight);
    return previous;
  });
}

function syntheticSamples(audio, time) {
  return Array.from({ length: 96 }, (_, index) => {
    const x = index / 95;
    const envelope = Math.sin(Math.PI * x);
    const wave =
      Math.sin(index * 0.46 + time * 1.6) * 0.42 +
      Math.sin(index * 0.18 - time * 0.72) * 0.28 +
      Math.sin(index * 0.08 + time * 0.34) * 0.18;
    return wave * envelope * (0.28 + (audio.energy ?? 0) * 0.72);
  });
}

function syntheticSpectrum(audio, time) {
  return Array.from({ length: 24 }, (_, index) => {
    const position = index / 23;
    const band =
      position < 0.28
        ? (audio.bass ?? audio.energy ?? 0)
        : position < 0.68
          ? (audio.mid ?? audio.energy ?? 0)
          : (audio.high ?? audio.energy ?? 0);
    return Math.max(
      0.04,
      band * (0.68 + Math.sin(index * 0.83 + time * 1.8) * 0.18),
    );
  });
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
  if (!baseLines.length) return;
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
  context.save();
  context.textBaseline = "top";
  context.shadowColor = `rgba(0,0,0,${Math.max(0, Math.min(100, textSettings.shadow)) / 100})`;
  context.shadowBlur = Math.max(0, textSettings.shadow * scale * 0.4);
  let cursorY = y;
  for (const line of lines) {
    const opacity = effectiveTextOpacity(line.style, time, durationSeconds);
    if (opacity <= 0) {
      cursorY += line.lineHeight;
      continue;
    }
    context.fillStyle = hexToRgba(line.style.color, opacity);
    context.textAlign =
      line.style.align === "justify" ? "left" : line.style.align;
    context.font = metadataFont(line.style, line.fontSize);
    drawMetadataLine(context, line.text, x, cursorY, line.maxWidth, line.style);
    cursorY += line.lineHeight;
  }
  context.restore();
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
  const safeHex = /^#[0-9a-f]{6}$/i.test(String(hex ?? ""))
    ? String(hex)
    : "#ffffff";
  const value = Number.parseInt(safeHex.slice(1), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

function hexToRgba(hex, alpha) {
  const [red, green, blue] = hexToRgb(hex).map((value) =>
    Math.round(value * 255),
  );
  return `rgba(${red},${green},${blue},${alpha})`;
}
