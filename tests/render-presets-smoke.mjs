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

async function renderAndCheck({ name, preset, size, duration, fps }) {
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
  const stat = await fs.stat(outputPath);
  console.log(`${name}: ${stat.size} bytes`);
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
