import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import {
  builtinVisualPresets,
  normalizeVisualSettings,
} from "../shared/visual-effects.mjs";
import { renderWebglBackgroundVideo } from "../server/webgl-export.mjs";

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.slice(1)),
  "..",
);
const outputDir = path.join(root, ".dev", "render-smoke");
await fs.mkdir(outputDir, { recursive: true });

const smokeProfile = normalizeSmokeProfile(
  option("profile") ?? process.env.SONARA_RENDER_SMOKE_PROFILE ?? "quick",
);
const fullSmoke = smokeProfile === "full";
const defaultRenderCase = fullSmoke
  ? {
      duration: 3,
      fps: 12,
      size: { width: 1280, height: 720 },
      suffix: "720p",
    }
  : {
      duration: 1,
      fps: 8,
      size: { width: 640, height: 360 },
      suffix: "360p",
    };
const quickPresetIds = new Set([
  "liquid-mesh",
  "volumetric-clouds",
  "vector-aura",
  "playful-shapes",
  "piano-ribbons",
  "audio-dark",
  "lava-lamp",
  "starfield",
  "holo-topography",
  "fluid-flow",
]);
const presetSmokeCases = fullSmoke
  ? builtinVisualPresets
  : builtinVisualPresets.filter((preset) => quickPresetIds.has(preset.id));

console.log(
  `Render preset smoke: ${smokeProfile} (${presetSmokeCases.length} base presets)`,
);

const audioEnvelope = {
  frameRate: 2,
  frames: [
    frame(0.12, 0.1, 0.08, 0.05),
    frame(0.42, 0.5, 0.28, 0.16),
    frame(0.2, 0.18, 0.22, 0.14),
  ],
};

for (const preset of presetSmokeCases) {
  await renderAndCheck({
    name: `${preset.id}-${defaultRenderCase.suffix}`,
    preset,
    ...defaultRenderCase,
  });
}

const postScene = structuredClone(builtinVisualPresets[0]);
postScene.post = { ...postScene.post, vignette: 58, scanlines: 30 };
const liquidBaseOutput = path.join(
  outputDir,
  `liquid-mesh-${defaultRenderCase.suffix}.webm`,
);
const postOutput = await renderAndCheck({
  name: `liquid-mesh-post-overlay-${defaultRenderCase.suffix}`,
  preset: postScene,
  ...defaultRenderCase,
  duration: 1,
  minFrames: expectedFrameCount({ ...defaultRenderCase, duration: 1 }),
});
assert.notEqual(
  await firstFrameHash(liquidBaseOutput),
  await firstFrameHash(postOutput),
  "post overlay should alter the rendered frame when enabled",
);

await renderAndCheck({
  name: `stacked-atmospheres-moderate-${defaultRenderCase.suffix}`,
  preset: normalizeVisualSettings({
    id: "liquid-mesh",
    atmosphereLayers: [
      { scene: { id: "liquid-mesh" } },
      {
        opacity: 55,
        blendMode: "screen",
        scene: { id: "fractal-sphere" },
      },
    ],
  }),
  ...defaultRenderCase,
  duration: 2,
  assertAnimated: true,
  minFrames: fullSmoke
    ? 24
    : expectedFrameCount({ ...defaultRenderCase, duration: 2 }),
});

await renderAndCheck({
  name: `stacked-atmospheres-heavy-${defaultRenderCase.suffix}`,
  preset: normalizeVisualSettings({
    id: "holo-topography",
    atmosphereLayers: [
      { scene: { id: "holo-topography" } },
      {
        opacity: 55,
        blendMode: "screen",
        scene: { id: "fluid-flow" },
      },
    ],
  }),
  ...defaultRenderCase,
  duration: 1,
});

const broadClouds = builtinVisualPresets.find(
  (preset) => preset.id === "volumetric-clouds",
);
const cloudTimelineHashes = [];
for (const variant of broadClouds.variants) {
  const preset = normalizeVisualSettings({
    id: broadClouds.id,
    appliedVariantId: variant.id,
  });
  const outputPath = await renderAndCheck({
    name: `${broadClouds.id}-${variant.id}-${defaultRenderCase.suffix}`,
    preset,
    ...defaultRenderCase,
  });
  cloudTimelineHashes.push(await firstFrameHash(outputPath));
}
assert.equal(
  new Set(cloudTimelineHashes).size,
  broadClouds.variants.length,
  "cloud timeline variants should render visibly distinct first frames",
);

const waveformTypes = fullSmoke
  ? [
      "mirror-line",
      "single-line",
      "filled-ribbon",
      "spectrum-bars",
      "radial-ring",
    ]
  : ["spectrum-bars", "radial-ring"];
for (const type of waveformTypes) {
  const preset = structuredClone(builtinVisualPresets[0]);
  preset.waveform = { ...preset.waveform, visible: true, type };
  await renderAndCheck({
    name: `waveform-${type}-${defaultRenderCase.suffix}`,
    preset,
    ...defaultRenderCase,
    duration: fullSmoke ? 2 : defaultRenderCase.duration,
  });
}

const waveformVariantHashes = [];
const waveformVariants = [
  {
    name: "spectrum-bars-gradient-peak",
    type: "spectrum-bars",
    colorMode: "gradient",
    advanced: { barPeakHold: 86, barPeakDecay: 32 },
  },
  {
    name: "spectrum-bars-color-bands",
    type: "spectrum-bars",
    colorMode: "bands",
    advanced: { barPeakHold: 62, barPeakDecay: 48 },
  },
  {
    name: "radial-ring-gradient-glow",
    type: "radial-ring",
    colorMode: "gradient",
    advanced: { radialGlow: 82, radialRadius: 36, radialArc: 92 },
  },
];
for (const variant of fullSmoke
  ? waveformVariants
  : waveformVariants.slice(0, 2)) {
  const preset = structuredClone(builtinVisualPresets[0]);
  preset.waveform = {
    ...preset.waveform,
    visible: true,
    type: variant.type,
    colorMode: variant.colorMode,
    color: "#7bd7ff",
    secondaryColor: "#f6c663",
    tertiaryColor: "#ef7cad",
    advanced: { ...preset.waveform.advanced, ...variant.advanced },
  };
  const outputPath = await renderAndCheck({
    name: `waveform-${variant.name}-${defaultRenderCase.suffix}`,
    preset,
    ...defaultRenderCase,
    duration: 2,
    assertAnimated: true,
  });
  waveformVariantHashes.push(await firstFrameHash(outputPath));
}
assert.equal(
  new Set(waveformVariantHashes).size,
  waveformVariantHashes.length,
  "waveform color and geometry variants should produce distinct frames",
);

const textScene = structuredClone(
  builtinVisualPresets.find((preset) => preset.id === "audio-dark"),
);
const textBaseComposition = {
  metadata: {
    title: "The Light Through the Kitchen Window",
    artist: "Matheus Lima",
    album: "The Beauty of Almost",
    year: "2026",
    version: "Original",
  },
  showMetadata: true,
};
const textBaseline = await renderAndCheck({
  name: `text-control-${defaultRenderCase.suffix}`,
  preset: textScene,
  ...defaultRenderCase,
  duration: 1,
});
const textLeft = await renderAndCheck({
  name: `text-side-left-justify-${defaultRenderCase.suffix}`,
  preset: textScene,
  ...defaultRenderCase,
  duration: 1,
  composition: {
    ...textBaseComposition,
    textSettings: {
      fields: {
        title: true,
        artist: true,
        album: true,
        year: true,
        version: false,
      },
      preset: "side-left",
      fontFamily: "Georgia",
      fontSize: 48,
      fontWeight: 680,
      letterSpacing: 1,
      lineHeight: 116,
      color: "#f4e8d1",
      opacity: 96,
      x: 6,
      y: 82,
      align: "justify",
      verticalAnchor: "bottom",
      shadow: 42,
    },
  },
});
const textRight = await renderAndCheck({
  name: `text-side-right-${defaultRenderCase.suffix}`,
  preset: textScene,
  ...defaultRenderCase,
  duration: 1,
  composition: {
    ...textBaseComposition,
    textSettings: {
      fields: {
        title: true,
        artist: true,
        album: true,
        year: true,
        version: true,
      },
      order: ["album", "title", "artist", "year", "version"],
      fieldStyles: {
        title: {
          fontFamily: "Georgia",
          fontSize: 42,
          fontWeight: 640,
          letterSpacing: 0,
          lineHeight: 112,
          color: "#fff4d6",
          opacity: 96,
        },
        album: {
          fontFamily: "Inter",
          fontSize: 22,
          fontWeight: 760,
          letterSpacing: 5,
          lineHeight: 120,
          color: "#9fd4ff",
          opacity: 78,
        },
        artist: {
          fontFamily: "Inter",
          fontSize: 26,
          fontWeight: 620,
          letterSpacing: 0,
          lineHeight: 118,
          color: "#dbe9ff",
          opacity: 82,
        },
        year: {
          fontFamily: "Inter",
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 4,
          lineHeight: 116,
          color: "#a8b6ca",
          opacity: 68,
        },
        version: {
          fontFamily: "Inter",
          fontSize: 18,
          fontWeight: 620,
          letterSpacing: 2,
          lineHeight: 116,
          color: "#a8b6ca",
          opacity: 58,
        },
      },
      preset: "side-right",
      fontFamily: "Inter",
      fontSize: 40,
      fontWeight: 720,
      letterSpacing: 0,
      lineHeight: 124,
      color: "#dbe9ff",
      opacity: 94,
      x: 94,
      y: 18,
      align: "right",
      verticalAnchor: "top",
      shadow: 54,
    },
  },
});
assert.notEqual(
  await firstFrameHash(textBaseline),
  await firstFrameHash(textLeft),
  "side-left justified metadata should alter the rendered frame",
);
assert.notEqual(
  await firstFrameHash(textLeft),
  await firstFrameHash(textRight),
  "side-right metadata should render in a distinct position",
);

if (fullSmoke) {
  for (const sample of [
    { name: "liquid-mesh-1080p", width: 1920, height: 1080 },
    { name: "volumetric-clouds-2k", width: 2560, height: 1440 },
    { name: "aurora-ribbons-4k", width: 3840, height: 2160 },
    { name: "color-mesh-1080p", width: 1920, height: 1080 },
  ]) {
    await renderAndCheck({
      name: sample.name,
      preset: builtinVisualPresets.find((preset) =>
        sample.name.startsWith(preset.id),
      ),
      size: { width: sample.width, height: sample.height },
      duration: 3,
      fps: 12,
    });
  }
}

const playful = structuredClone(
  builtinVisualPresets.find((preset) => preset.id === "playful-shapes"),
);
playful.playful.motionMode = "play";
playful.playful.enabled = {
  rectangles: false,
  letters: false,
  numbers: false,
  emojis: true,
};
playful.playful.collections.emojis = "🎈 🎵 🌱";
await renderAndCheck({
  name: `playful-shapes-custom-emoji-${defaultRenderCase.suffix}`,
  preset: playful,
  ...defaultRenderCase,
  duration: 2,
  assertAnimated: true,
});

const cloudsWithSun = structuredClone(
  builtinVisualPresets.find((preset) => preset.id === "volumetric-clouds"),
);
cloudsWithSun.cloudLight.enabled = true;
cloudsWithSun.cloudLight.intensity = 74;
cloudsWithSun.cloudLight.color = "#ffe0a3";
cloudsWithSun.cloudLight.motion = 38;
cloudsWithSun.cloudLight.speed = 46;
cloudsWithSun.cloudLight.direction = 24;
await renderAndCheck({
  name: `volumetric-clouds-sun-${defaultRenderCase.suffix}`,
  preset: cloudsWithSun,
  ...defaultRenderCase,
  duration: 2,
  assertAnimated: true,
});

async function renderAndCheck({
  name,
  preset,
  size,
  duration,
  fps,
  assertAnimated = false,
  minFrames = 0,
  composition,
}) {
  const outputPath = path.join(outputDir, `${name}.webm`);
  await renderWebglBackgroundVideo({
    outputPath,
    size,
    duration,
    settings: { visualSettings: preset, webglFps: fps },
    audioEnvelope,
    composition,
    onProgress: () => {},
  });
  await openWithFfmpeg(outputPath);
  if (minFrames) await assertFrameCountAtLeast(outputPath, minFrames);
  if (assertAnimated)
    await assertFrameVariation(outputPath, animationSampleFrame(duration, fps));
  const stat = await fs.stat(outputPath);
  console.log(`${name}: ${stat.size} bytes`);
  return outputPath;
}

function assertFrameCountAtLeast(filePath, minFrames) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      ["-v", "error", "-i", filePath, "-f", "framemd5", "-"],
      { windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `ffmpeg ${code}`));
      const frameCount = stdout
        .split(/\r?\n/u)
        .filter((line) => line && !line.startsWith("#")).length;
      assert.ok(
        frameCount >= minFrames,
        `${path.basename(filePath)} should contain at least ${minFrames} frames`,
      );
      resolve();
    });
  });
}

function assertFrameVariation(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      [
        "-v",
        "error",
        "-i",
        filePath,
        "-vf",
        "select=eq(n\\,0)+eq(n\\,12)",
        "-f",
        "framemd5",
        "-",
      ],
      { windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `ffmpeg ${code}`));
      const hashes = stdout
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => line.split(",").at(-1)?.trim())
        .filter(Boolean);
      try {
        assert.ok(
          new Set(hashes).size >= 2,
          `${path.basename(filePath)} should animate between sampled frames`,
        );
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

function openWithFfmpeg(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      ["-v", "error", "-i", filePath, "-f", "null", "-"],
      {
        windowsHide: true,
      },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(stderr || `ffmpeg ${code}`)),
    );
  });
}

function firstFrameHash(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      ["-v", "error", "-i", filePath, "-frames:v", "1", "-f", "framemd5", "-"],
      { windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `ffmpeg ${code}`));
      const hash = stdout
        .split(/\r?\n/)
        .find((line) => line && !line.startsWith("#"))
        ?.split(",")
        .at(-1)
        ?.trim();
      hash ? resolve(hash) : reject(new Error(`No frame hash for ${filePath}`));
    });
  });
}

function animationSampleFrame(duration, fps) {
  return Math.max(1, Math.floor((duration * fps) / 2));
}

function expectedFrameCount({ duration, fps }) {
  return Math.max(1, Math.floor(duration * fps));
}

function normalizeSmokeProfile(value) {
  return value === "full" ? "full" : "quick";
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function frame(energy, bass, mid, high) {
  return {
    energy,
    bass,
    mid,
    high,
    samples: Array.from(
      { length: 64 },
      (_, index) => Math.sin(index * 0.35) * energy,
    ),
    spectrum: Array.from({ length: 24 }, (_, index) =>
      Math.max(0.04, bass * (1 - index / 36) + high * (index / 32)),
    ),
  };
}
