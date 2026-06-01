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
}) {
  const outputPath = path.join(outputDir, `${name}.webm`);
  await renderWebglBackgroundVideo({
    outputPath,
    size,
    duration,
    settings: { visualSettings: preset, webglFps: fps },
    audioEnvelope,
    onProgress: () => {},
  });
  await openWithFfmpeg(outputPath);
  if (assertAnimated) await assertFrameVariation(outputPath);
  const stat = await fs.stat(outputPath);
  console.log(`${name}: ${stat.size} bytes`);
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
