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
  float sun = smoothstep(0.58, 0.02, distance(uv, vec2(0.28, 0.28)));
  vec3 sky = mix(u_colorA * 0.7, u_colorA + u_colorB * 0.12, uv.y);
  vec3 color = mix(sky, mix(u_colorB * 0.62, u_colorB, cloud), cloud * (0.3 + u_intensity * 0.42));
  color += u_accentColor * sun * u_param3 * 0.2 * pulse(u_audioMid, 0.2);
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
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
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
  context.strokeStyle = hexToRgba(waveform.color, waveform.opacity / 100);
  context.fillStyle = hexToRgba(waveform.color, waveform.opacity / 100);
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
  context.fillStyle = hexToRgba(
    waveform.color,
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
  spectrum.forEach((value, index) => {
    const x = startX + index * (barWidth + gap);
    const barHeight = Math.max(waveform.thickness, value * amplitude * 2);
    roundedRect(
      context,
      x,
      centerY - barHeight / 2,
      barWidth,
      barHeight,
      radius,
    );
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
) {
  const arc = ((waveform.advanced?.radialArc ?? 100) / 100) * Math.PI * 2;
  const rotation =
    (((waveform.advanced?.radialRotation ?? 0) - 90) * Math.PI) / 180;
  const radius =
    Math.min(width, height) * ((waveform.advanced?.radialRadius ?? 32) / 100);
  context.save();
  context.translate(width / 2, centerY);
  spectrum.forEach((value, index) => {
    const angle = rotation + (index / Math.max(1, spectrum.length - 1)) * arc;
    const barHeight = Math.max(waveform.thickness, value * amplitude);
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
  shadow: 48,
};

function drawMetadata(context, width, height, metadata, settings = {}) {
  const textSettings = {
    ...defaultTextSettings,
    ...settings,
    fields: { ...defaultTextSettings.fields, ...(settings.fields ?? {}) },
  };
  const title = String(metadata.title ?? "").trim();
  const artist = String(metadata.artist ?? "").trim();
  const album = String(metadata.album ?? "").trim();
  const year = String(metadata.year ?? "").trim();
  const version = String(metadata.version ?? "").trim();
  const lines = [
    textSettings.fields.title && title,
    textSettings.fields.version && version,
    textSettings.fields.artist && artist,
    textSettings.fields.album && album,
    textSettings.fields.year && year,
  ].filter(Boolean);
  if (!lines.length) return;
  const scale = Math.max(0.2, width / 1920);
  const fontSize = Math.max(9, textSettings.fontSize * scale);
  const lineHeight = fontSize * ((textSettings.lineHeight ?? 118) / 100);
  const x = (width * textSettings.x) / 100;
  const y = (height * textSettings.y) / 100;
  context.save();
  context.textBaseline = "top";
  context.textAlign = textSettings.align;
  context.shadowColor = `rgba(0,0,0,${Math.max(0, Math.min(100, textSettings.shadow)) / 100})`;
  context.shadowBlur = Math.max(0, textSettings.shadow * scale * 0.4);
  context.fillStyle = hexToRgba(
    textSettings.color,
    Math.max(0, Math.min(100, textSettings.opacity)) / 100,
  );
  context.font = `${Math.round(textSettings.fontWeight)} ${fontSize}px ${fontFamilyStack(textSettings.fontFamily)}`;
  for (const [index, line] of lines.entries()) {
    context.fillText(
      applyLetterSpacing(line, textSettings.letterSpacing),
      x,
      y + index * lineHeight,
      width * 0.7,
    );
  }
  context.restore();
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
