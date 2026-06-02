import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { builtinVisualPresets } from "../shared/visual-effects.mjs";
import { renderWebglBackgroundVideo } from "../server/webgl-export.mjs";

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.slice(1)),
  "..",
);
const outputDir = path.join(root, ".dev", "render-smoke");
await fs.mkdir(outputDir, { recursive: true });

const audioEnvelope = {
  frameRate: 2,
  frames: [
    frame(0.12, 0.1, 0.08, 0.05),
    frame(0.42, 0.5, 0.28, 0.16),
    frame(0.2, 0.18, 0.22, 0.14),
  ],
};

for (const preset of builtinVisualPresets) {
  await renderAndCheck({
    name: `${preset.id}-720p`,
    preset,
    size: { width: 1280, height: 720 },
    duration: 3,
    fps: 12,
  });
}

for (const type of [
  "mirror-line",
  "single-line",
  "filled-ribbon",
  "spectrum-bars",
  "radial-ring",
]) {
  const preset = structuredClone(builtinVisualPresets[0]);
  preset.waveform = { ...preset.waveform, visible: true, type };
  await renderAndCheck({
    name: `waveform-${type}-720p`,
    preset,
    size: { width: 1280, height: 720 },
    duration: 2,
    fps: 12,
  });
}

const waveformVariantHashes = [];
for (const variant of [
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
]) {
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
    name: `waveform-${variant.name}-720p`,
    preset,
    size: { width: 1280, height: 720 },
    duration: 2,
    fps: 12,
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
  name: "text-control-720p",
  preset: textScene,
  size: { width: 1280, height: 720 },
  duration: 1,
  fps: 12,
});
const textLeft = await renderAndCheck({
  name: "text-side-left-justify-720p",
  preset: textScene,
  size: { width: 1280, height: 720 },
  duration: 1,
  fps: 12,
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
  name: "text-side-right-720p",
  preset: textScene,
  size: { width: 1280, height: 720 },
  duration: 1,
  fps: 12,
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
  name: "playful-shapes-custom-emoji-720p",
  preset: playful,
  size: { width: 1280, height: 720 },
  duration: 2,
  fps: 12,
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
  name: "volumetric-clouds-sun-720p",
  preset: cloudsWithSun,
  size: { width: 1280, height: 720 },
  duration: 2,
  fps: 12,
  assertAnimated: true,
});

async function renderAndCheck({
  name,
  preset,
  size,
  duration,
  fps,
  assertAnimated = false,
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
  if (assertAnimated) await assertFrameVariation(outputPath);
  const stat = await fs.stat(outputPath);
  console.log(`${name}: ${stat.size} bytes`);
  return outputPath;
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
