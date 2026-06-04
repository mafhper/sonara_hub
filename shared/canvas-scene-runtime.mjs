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
void main() {
  vec2 res = u_resolution.xy;
  vec2 uv01 = gl_FragCoord.xy / res;
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float t = u_time * (0.12 + u_speed * 0.9);
  float density = 0.7 + u_param0 * 2.2;
  float warp = 0.35 + u_param1 * 1.7;
  float twinkleAmt = u_param2;
  float glow = 0.45 + u_param3 * 1.4;
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
    vec3 starCol = mix(u_colorB, u_accentColor, starHash(cell + 5.0));
    col += star * fade * tw * starCol * (0.55 + persp * 0.95);
  }
  col *= 1.0 + u_audioHigh * u_audioReaction * 0.7;
  col += u_accentColor * smoothstep(0.75, 0.0, length(uv)) * 0.05 * pulse(u_audioMid, 0.3);
  gl_FragColor = vec4(finish(col, uv01), 1.0);
}`,
};

const blendModes = {
  normal: "source-over",
  screen: "screen",
  multiply: "multiply",
  overlay: "overlay",
};

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
    const nextWidth = Math.max(2, Math.round(width || 2));
    const nextHeight = Math.max(2, Math.round(height || 2));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    if (webglCanvas.width !== nextWidth || webglCanvas.height !== nextHeight) {
      webglCanvas.width = nextWidth;
      webglCanvas.height = nextHeight;
    }
  }

  function render(time = 0) {
    resize(
      canvas.clientWidth || canvas.width,
      canvas.clientHeight || canvas.height,
    );
    const { scene, composition, audio } = state;
    const width = canvas.width;
    const height = canvas.height;
    context.save();
    context.clearRect(0, 0, width, height);

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

    for (const layer of composition.layers ?? []) {
      if (layer.visible !== false && layer.element) {
        drawMediaLayer(context, width, height, layer);
      }
    }

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
    if (scene.waveform?.visible) {
      drawWaveform(context, width, height, scene.waveform, audio, time);
    }
    if (composition.showMetadata !== false) {
      drawMetadata(
        context,
        width,
        height,
        composition.metadata ?? {},
        composition.textSettings ?? {},
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

function drawMediaLayer(context, width, height, layer) {
  const element = layer.element;
  if (!element) return;
  const naturalWidth = element.videoWidth || element.naturalWidth || width;
  const naturalHeight = element.videoHeight || element.naturalHeight || height;
  const targetWidth = width * ((layer.scale ?? 100) / 100);
  const targetHeight = height * ((layer.scale ?? 100) / 100);
  const factor =
    layer.fit === "cover"
      ? Math.max(targetWidth / naturalWidth, targetHeight / naturalHeight)
      : Math.min(targetWidth / naturalWidth, targetHeight / naturalHeight);
  const drawWidth = naturalWidth * factor;
  const drawHeight = naturalHeight * factor;
  const x = (width - drawWidth) * ((layer.x ?? 50) / 100);
  const y = (height - drawHeight) * ((layer.y ?? 50) / 100);
  const shadow = layer.shadow ?? {};
  context.save();
  context.globalCompositeOperation =
    blendModes[layer.blendMode] ?? "source-over";
  context.globalAlpha = (layer.opacity ?? 100) / 100;
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

function drawMetadata(context, width, height, metadata, settings = {}) {
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
    artist: String(metadata.artist ?? "").trim(),
    album: String(metadata.album ?? "").trim(),
    year: String(metadata.year ?? "").trim(),
  };
  const scale = Math.max(0.2, width / 1920);
  const lines = textSettings.order
    .filter((field) => textSettings.fields[field] && values[field])
    .map((field) => {
      const fieldStyle = textSettings.fieldStyles[field];
      const style = {
        ...mergeMetadataFieldStyle(field, fieldStyle),
        align:
          fieldStyle?.align ??
          (textSettings.align === "justify" ? "left" : textSettings.align),
      };
      const fontSize = Math.max(9, style.fontSize * scale);
      const lineHeight = fontSize * ((style.lineHeight ?? 118) / 100);
      return {
        field,
        text: values[field],
        style,
        fontSize,
        lineHeight,
      };
    });
  if (!lines.length) return;
  const x = (width * textSettings.x) / 100;
  let y = (height * textSettings.y) / 100;
  const blockHeight = lines.reduce((sum, line) => sum + line.lineHeight, 0);
  if (textSettings.verticalAnchor === "middle") y -= blockHeight / 2;
  if (textSettings.verticalAnchor === "bottom") y -= blockHeight;
  context.save();
  context.textBaseline = "top";
  context.shadowColor = `rgba(0,0,0,${Math.max(0, Math.min(100, textSettings.shadow)) / 100})`;
  context.shadowBlur = Math.max(0, textSettings.shadow * scale * 0.4);
  let cursorY = y;
  for (const line of lines) {
    context.fillStyle = hexToRgba(
      line.style.color,
      Math.max(0, Math.min(100, line.style.opacity)) / 100,
    );
    context.textAlign =
      line.style.align === "justify" ? "left" : line.style.align;
    context.font = `${line.style.fontStyle === "italic" ? "italic " : ""}${Math.round(line.style.fontWeight)} ${line.fontSize}px ${fontFamilyStack(line.style.fontFamily)}`;
    drawMetadataLine(context, line.text, x, cursorY, width * 0.7, line.style);
    cursorY += line.lineHeight;
  }
  context.restore();
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
    fontFamily: ["Inter", "Georgia", "Arial"].includes(style.fontFamily)
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
    align: ["left", "center", "right"].includes(style.align)
      ? style.align
      : fallback.align,
  };
}

function clampValue(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function drawMetadataLine(context, line, x, y, maxWidth, textSettings) {
  if (textSettings.align !== "justify") {
    context.fillText(
      applyLetterSpacing(line, textSettings.letterSpacing),
      x,
      y,
      maxWidth,
    );
    return;
  }
  const words = String(line).trim().split(/\s+/u).filter(Boolean);
  if (words.length < 2) {
    context.fillText(
      applyLetterSpacing(line, textSettings.letterSpacing),
      x,
      y,
      maxWidth,
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
    case "Inter":
    default:
      return "Inter, Arial, sans-serif";
  }
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
