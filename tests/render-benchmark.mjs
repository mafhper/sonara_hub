import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { buildWebglMuxArgs } from "../server/video-mux.mjs";
import { renderCanvasSize, renderTiming } from "../server/render-profile.mjs";
import { sampleAudioEnvelope } from "../server/audio-envelope.mjs";
import { renderWebglBackgroundVideo } from "../server/webgl-export.mjs";
import {
  builtinVisualPresets,
  normalizeVisualSettings,
} from "../shared/visual-effects.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const benchRoot = path.join(root, ".dev", "bench");
const runsDir = path.join(benchRoot, "runs");
const historyPath = path.join(benchRoot, "render-history.jsonl");
const latestReportPath = path.join(benchRoot, "latest-render-report.md");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = path.join(runsDir, `${runId}-render`);
const outputDir = path.join(runDir, "outputs");
const assetsDir = path.join(runDir, "assets");
const profile =
  option("profile") ?? process.env.SONARA_BENCH_PROFILE ?? "quick";
const audioPath = path.join(assetsDir, "bench-audio.m4a");
const layerPath = path.join(assetsDir, "bench-layer.png");
const coverPath = path.join(assetsDir, "bench-cover.png");
const modeCases = buildCases(profile);
const audioMode =
  option("audio") ?? process.env.SONARA_BENCH_AUDIO ?? "synthetic";
const repeat = parseRepeat(
  option("repeat") ?? process.env.SONARA_BENCH_REPEAT ?? "1",
);
const benchmarkStep = normalizeBenchmarkStep(
  option("step") ?? process.env.SONARA_BENCH_STEP ?? inferBenchmarkStep(),
);
const testKey =
  option("test-key") ??
  process.env.SONARA_BENCH_TEST_KEY ??
  `render.${benchmarkStep}`;
const suiteId = option("suite-id") ?? process.env.SONARA_BENCH_SUITE_ID ?? "";
const suiteKind =
  option("suite-kind") ?? process.env.SONARA_BENCH_SUITE_KIND ?? "individual";

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(assetsDir, { recursive: true });

await writeFixturePng(layerPath);
await writeFixturePng(coverPath);
const maxDuration = Math.max(...modeCases.map((item) => item.duration));
const audioSource = await prepareBenchAudio(audioPath, maxDuration, audioMode);
const audioEnvelope =
  audioSource.kind === "input"
    ? await sampleAudioEnvelope(audioPath, 2)
    : syntheticAudioEnvelope();

const history = await readHistory(historyPath);
const run = {
  runId,
  kind: "render-benchmark",
  profile,
  testKey,
  testLabel: benchmarkTestLabel(benchmarkStep),
  domain: benchmarkStep === "audio" ? "audio" : "video",
  pipeline: "render-export",
  suiteId,
  suiteKind,
  repeat,
  createdAt: new Date().toISOString(),
  git: gitInfo(),
  environment: environmentInfo(),
  audioSource,
  thresholds: {
    canvasCaptureMs: 1.25,
    frameRenderMs: 1.35,
    mediaRecorderMs: 1.25,
    muxMs: 1.25,
    totalMs: 1.25,
    peakRssMb: 1.3,
    webmStageMs: 1.25,
    webmBytes: 1.2,
    mp4Bytes: 1.2,
  },
  cases: [],
  medians: [],
  warnings: [],
};

console.log(`Sonara render benchmark (${profile})`);
console.log(`Audio: ${audioSource.label}`);
console.log(`Repeat: ${repeat}`);
console.log(`Outputs: ${path.relative(root, outputDir)}`);

for (let repeatIndex = 1; repeatIndex <= repeat; repeatIndex += 1) {
  for (const benchCase of modeCases) {
    const result = await runCase(benchCase, repeatIndex);
    result.warnings = compareWithHistory(result, history, run.thresholds);
    run.cases.push(result);
    run.warnings.push(
      ...result.warnings.map((warning) => `${result.id}: ${warning}`),
    );
    const status = result.warnings.length ? "WARN" : "OK";
    const repeatLabel = repeat > 1 ? ` r${repeatIndex}/${repeat}` : "";
    console.log(
      `${status} ${result.id}${repeatLabel}: ${formatMs(result.totalMs)} total, ${formatMs(result.frameRenderMs)} render, ${formatMs(result.canvasCaptureMs)} capture, ${formatMs(result.mediaRecorderMs)} recorder, ${formatMs(result.muxMs)} mux, ${result.peakRssMb.toFixed(1)} MB rss`,
    );
  }
}
run.medians = repeat > 1 ? repeatedCaseMedians(run.cases) : [];

await fs.writeFile(
  path.join(runDir, "render.json"),
  JSON.stringify(run, null, 2),
);
await fs.appendFile(historyPath, `${JSON.stringify(run)}\n`);
await fs.writeFile(latestReportPath, renderMarkdown(run));

console.log(`Report: ${path.relative(root, latestReportPath)}`);
if (run.warnings.length) {
  console.warn("Performance warnings:");
  for (const warning of run.warnings) console.warn(`- ${warning}`);
}

async function runCase(benchCase, repeatIndex = 1) {
  const timing = renderTiming({
    qualityProfile: benchCase.qualityProfile,
    renderMode: "single",
  });
  const settings = {
    visualSettings: benchCase.scene,
    qualityProfile: benchCase.qualityProfile,
    renderMode: "single",
    webglFps: benchCase.webglFps ?? timing.webglFps,
    outputFps: benchCase.outputFps ?? timing.outputFps,
    encoderPreset: benchCase.encoderPreset ?? timing.encoderPreset,
    crf: benchCase.crf ?? 22,
  };
  const internalSize = renderCanvasSize(benchCase.outputSize, settings);
  const outputId =
    repeat > 1 ? `${benchCase.id}-r${repeatIndex}` : benchCase.id;
  const webmPath = path.join(outputDir, `${outputId}.webm`);
  const mp4Path = path.join(outputDir, `${outputId}.mp4`);
  const progressMessages = [];
  const webglTelemetry = [];
  const monitor = startMemoryMonitor();
  const started = performance.now();

  const webmStarted = performance.now();
  await renderWebglBackgroundVideo({
    outputPath: webmPath,
    size: internalSize,
    duration: benchCase.duration,
    settings,
    audioEnvelope,
    composition: benchCase.composition,
    onProgress: (_progress, message) => {
      if (message) progressMessages.push(message);
    },
    onTelemetry: (event) => {
      webglTelemetry.push(event);
    },
  });
  const webmStageMs = performance.now() - webmStarted;
  const webglPhases = summarizeWebglTelemetry(webglTelemetry, webmStageMs);

  const muxStarted = performance.now();
  await runFfmpeg(
    buildWebglMuxArgs({
      audioPath,
      duration: benchCase.duration,
      metadata: benchMetadata(benchCase),
      outputPath: mp4Path,
      outputSize: benchCase.outputSize,
      settings,
      subtitlePath: null,
      webglVideoPath: webmPath,
    }),
  );
  const muxMs = performance.now() - muxStarted;

  const validationStarted = performance.now();
  await openWithFfmpeg(mp4Path);
  const validationMs = performance.now() - validationStarted;
  const memory = monitor.stop();
  const webmStat = await fs.stat(webmPath);
  const mp4Stat = await fs.stat(mp4Path);
  const totalMs = performance.now() - started;
  const rendererId = benchCase.scene.rendererId ?? benchCase.scene.id;
  const params = {
    id: benchCase.id,
    profile,
    sceneId: benchCase.scene.id,
    rendererId,
    outputSize: benchCase.outputSize,
    internalSize,
    duration: benchCase.duration,
    webglFps: settings.webglFps,
    outputFps: settings.outputFps,
    qualityProfile: settings.qualityProfile,
    waveform: benchCase.scene.waveform,
    compositionKey: benchCase.compositionKey,
    audioSource: audioSource.kind,
  };
  return {
    id: benchCase.id,
    outputId,
    repeatIndex,
    paramsHash: hash(params),
    sceneId: benchCase.scene.id,
    rendererId,
    category: benchCase.category,
    domain: inferCaseDomain(benchCase),
    pipeline: "render-export",
    outputSize: benchCase.outputSize,
    internalSize,
    duration: benchCase.duration,
    webglFps: settings.webglFps,
    outputFps: settings.outputFps,
    qualityProfile: settings.qualityProfile,
    totalMs: round(totalMs),
    webmStageMs: round(webmStageMs),
    webglPrepareMs: webglPhases.webglPrepareMs,
    canvasCaptureMs: webglPhases.canvasCaptureMs,
    frameRenderMs: webglPhases.frameRenderMs,
    frameRequestMs: webglPhases.frameRequestMs,
    frameDelayMs: webglPhases.frameDelayMs,
    mediaRecorderMs: webglPhases.mediaRecorderMs,
    webmFlushMs: webglPhases.webmFlushMs,
    webmValidationMs: webglPhases.webmValidationMs,
    sceneRecordMs: webglPhases.sceneRecordMs,
    muxMs: round(muxMs),
    validationMs: round(validationMs),
    webmBytes: webmStat.size,
    webmChunkBytes: webglPhases.webmChunkBytes,
    webmChunkCount: webglPhases.webmChunkCount,
    mp4Bytes: mp4Stat.size,
    peakRssMb: round(memory.peakRssMb),
    startRssMb: round(memory.startRssMb),
    endRssMb: round(memory.endRssMb),
    memoryDeltaMb: round(memory.endRssMb - memory.startRssMb),
    webglRetryCount: webglPhases.webglRetryCount,
    retryWebgl:
      webglPhases.webglRetryCount > 0 ||
      progressMessages.some((message) =>
        /Recuperando contexto WebGL/i.test(message),
      ),
    webglPhaseEvents: compactWebglTelemetry(webglTelemetry),
    outputWebm: path.relative(root, webmPath),
    outputMp4: path.relative(root, mp4Path),
  };
}

function buildCases(selectedProfile) {
  const baseCases = [
    {
      id: "audio-dark-720p-fast",
      category: "baseline",
      scene: preset("audio-dark"),
      outputSize: { width: 1280, height: 720 },
      duration: 2,
      qualityProfile: "fast",
      composition: textComposition(),
      compositionKey: "text-simple",
    },
    {
      id: "liquid-waveform-720p-fast",
      category: "waveform",
      scene: withWaveform(preset("liquid-mesh"), {
        type: "spectrum-bars",
        colorMode: "gradient",
      }),
      outputSize: { width: 1280, height: 720 },
      duration: 2,
      qualityProfile: "fast",
      composition: textComposition(),
      compositionKey: "text-simple",
    },
    {
      id: "plasma-720p-fast",
      category: "shader",
      scene: preset("plasma-nebula"),
      outputSize: { width: 1280, height: 720 },
      duration: 2,
      qualityProfile: "fast",
      composition: textComposition(),
      compositionKey: "text-simple",
    },
    {
      id: "stacked-atmospheres-720p-fast",
      category: "shader+atmosphere-stack",
      scene: stackedAtmospheres("liquid-mesh", "fractal-sphere"),
      outputSize: { width: 1280, height: 720 },
      duration: 2,
      qualityProfile: "fast",
      composition: textComposition(),
      compositionKey: "text-simple",
    },
    {
      id: "starfield-layers-720p-fast",
      category: "shader+layers",
      scene: withWaveform(preset("starfield"), { type: "radial-ring" }),
      outputSize: { width: 1280, height: 720 },
      duration: 2,
      qualityProfile: "fast",
      composition: layeredComposition(),
      compositionKey: "two-image-layers+cover+text",
    },
    {
      id: "clouds-sun-1080p-auto",
      category: "shader+1080p",
      scene: cloudsWithSun(),
      outputSize: { width: 1920, height: 1080 },
      duration: 2,
      qualityProfile: "auto",
      composition: textComposition(),
      compositionKey: "text-simple",
      crf: 23,
    },
  ];
  if (selectedProfile !== "full") return baseCases;
  return [
    ...baseCases,
    {
      id: "vortex-1080p-auto",
      category: "shader+1080p",
      scene: preset("vortex-galaxy"),
      outputSize: { width: 1920, height: 1080 },
      duration: 3,
      qualityProfile: "auto",
      composition: textComposition(),
      compositionKey: "text-simple",
      crf: 23,
    },
    {
      id: "playful-720p-fast",
      category: "canvas2d",
      scene: preset("playful-shapes"),
      outputSize: { width: 1280, height: 720 },
      duration: 2,
      qualityProfile: "fast",
      composition: textComposition(),
      compositionKey: "text-simple",
    },
    {
      id: "piano-ribbons-720p-fast",
      category: "canvas2d",
      scene: withWaveform(preset("piano-ribbons"), { type: "filled-ribbon" }),
      outputSize: { width: 1280, height: 720 },
      duration: 2,
      qualityProfile: "fast",
      composition: textComposition(),
      compositionKey: "text-simple",
    },
  ];
}

function preset(id) {
  const found = builtinVisualPresets.find((item) => item.id === id);
  assert.ok(found, `Missing visual preset ${id}`);
  return structuredClone(found);
}

function stackedAtmospheres(baseId, extraId) {
  return normalizeVisualSettings({
    id: baseId,
    atmosphereLayers: [
      { scene: { id: baseId } },
      {
        opacity: 55,
        blendMode: "screen",
        scene: { id: extraId },
      },
    ],
  });
}

function withWaveform(scene, patch) {
  return {
    ...scene,
    waveform: {
      ...scene.waveform,
      visible: true,
      opacity: 72,
      height: 16,
      color: "#9fd4ff",
      secondaryColor: "#f6c663",
      tertiaryColor: "#ef7cad",
      advanced: { ...scene.waveform.advanced },
      ...patch,
    },
  };
}

function cloudsWithSun() {
  const scene = preset("volumetric-clouds");
  scene.cloudLight = {
    ...scene.cloudLight,
    enabled: true,
    intensity: 74,
    color: "#ffe0a3",
    motion: 28,
    speed: 42,
    direction: 24,
  };
  return scene;
}

function textComposition() {
  return {
    metadata: benchMetadata(),
    showMetadata: true,
    textSettings: {
      fields: {
        title: true,
        artist: true,
        album: true,
        year: true,
        version: false,
      },
      order: ["title", "artist", "album", "year"],
      preset: "side-left",
      fontFamily: "Inter",
      fontSize: 34,
      fontWeight: 720,
      letterSpacing: 1,
      lineHeight: 116,
      color: "#f7f8fb",
      opacity: 92,
      x: 7,
      y: 78,
      align: "left",
      verticalAnchor: "bottom",
      shadow: 42,
    },
  };
}

function layeredComposition() {
  const base = textComposition();
  return {
    ...base,
    coverSrc: pathToFileURL(coverPath).href,
    layers: [
      layer("layer-a", 0, 82, 48, 50, 50, "screen"),
      layer("layer-b", 1, 58, 74, 74, 30, "overlay"),
    ],
  };
}

function layer(id, order, opacity, scale, x, y, blendMode) {
  return {
    id,
    kind: "image",
    src: pathToFileURL(layerPath).href,
    opacity,
    scale,
    x,
    y,
    rotation: order ? -8 : 12,
    blur: 0,
    maskOpacity: 0,
    shadow: { opacity: 22, blur: 24, x: 0, y: 12 },
    visible: true,
    fit: "contain",
    blendMode,
    loop: true,
    order,
  };
}

function benchMetadata(benchCase = {}) {
  return {
    title: benchCase.id ?? "Benchmark Sonara",
    version: "Bench",
    artist: "Sonara QA",
    album: "Render Bench",
    genre: "Ambient",
    description: "",
    comment: "",
    tags: "benchmark, sonara",
    visibility: "private",
    categoryId: "10",
    language: "pt-BR",
    recordingDate: "2026-06-04",
    copyright: "",
    outputFileName: "",
    useEmbeddedCover: false,
    containsSyntheticMedia: true,
    madeForKids: false,
    albumArtist: "Sonara QA",
    composer: "",
    year: "2026",
    trackNumber: 1,
    trackTotal: 1,
    diskNumber: 1,
    diskTotal: 1,
    lyrics: "",
    lyricsLanguage: "por",
    normalizationEnabled: false,
  };
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(stderr.slice(-2000) || `ffmpeg ${code}`)),
    );
  });
}

function openWithFfmpeg(filePath) {
  return runFfmpeg(["-v", "error", "-i", filePath, "-f", "null", "-"]);
}

async function prepareBenchAudio(filePath, duration, mode) {
  if (mode === "input") {
    const input = await findLargestInputAudio();
    if (input) {
      trimInputAudio(input.path, filePath, duration);
      return {
        kind: "input",
        label: `input/${input.relativePath}`,
        sourcePath: input.relativePath,
        sourceBytes: input.size,
        trimmedDurationSeconds: Math.max(2, duration + 0.2),
      };
    }
    createSyntheticAudio(filePath, duration);
    return {
      kind: "synthetic",
      label: "synthetic sine (fallback: input folder has no audio)",
    };
  }
  createSyntheticAudio(filePath, duration);
  return { kind: "synthetic", label: "synthetic sine" };
}

function createSyntheticAudio(filePath, duration) {
  const result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=330:duration=${Math.max(2, duration + 0.2)}`,
      "-ac",
      "2",
      "-ar",
      "44100",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      filePath,
    ],
    { windowsHide: true },
  );
  if (result.status !== 0) throw new Error(result.stderr.toString());
}

function trimInputAudio(inputPath, outputPath, duration) {
  const result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:a:0",
      "-t",
      String(Math.max(2, duration + 0.2)),
      "-vn",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outputPath,
    ],
    { windowsHide: true },
  );
  if (result.status !== 0) throw new Error(result.stderr.toString());
}

async function findLargestInputAudio() {
  const inputRoot = path.join(root, "input");
  const candidates = [];
  await walk(inputRoot, async (filePath) => {
    if (!/\.(mp3|wav|m4a|flac|aac)$/i.test(filePath)) return;
    const stat = await fs.stat(filePath);
    candidates.push({
      path: filePath,
      relativePath: path.relative(inputRoot, filePath),
      size: stat.size,
    });
  }).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  return candidates.sort((a, b) => b.size - a.size)[0] ?? null;
}

async function walk(directory, visit) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, visit);
    } else if (entry.isFile()) {
      await visit(fullPath);
    }
  }
}

async function writeFixturePng(filePath) {
  await fs.writeFile(
    filePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR42mNk+M+ABzDhkQAP/wL+zKxQfAAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
}

function startMemoryMonitor() {
  const start = process.memoryUsage();
  let peak = start;
  const timer = setInterval(() => {
    const current = process.memoryUsage();
    if (current.rss > peak.rss) peak = current;
  }, 50);
  return {
    stop() {
      clearInterval(timer);
      const end = process.memoryUsage();
      if (end.rss > peak.rss) peak = end;
      return {
        startRssMb: bytesToMb(start.rss),
        peakRssMb: bytesToMb(peak.rss),
        endRssMb: bytesToMb(end.rss),
      };
    },
  };
}

function summarizeWebglTelemetry(events, fallbackWebmStageMs) {
  const prepareMs = [
    "runtime-load",
    "renderer-html-write",
    "browser-launch",
    "page-open",
    "page-load",
  ].reduce((total, phase) => total + sumPhaseDuration(events, phase), 0);
  const sceneRecordMs =
    sumPhaseDuration(events, "scene-record") || fallbackWebmStageMs;
  const frameLoop = phaseEvent(events, "browser:canvas-frame-loop-complete");
  const chunksFlush = phaseEvent(events, "browser:chunks-flush-complete");
  return {
    webglPrepareMs: round(prepareMs),
    canvasCaptureMs: round(
      durationBetween(
        events,
        "browser:canvas-capture-start",
        "browser:canvas-capture-complete",
      ),
    ),
    frameRenderMs: round(finiteNumber(frameLoop?.renderMs)),
    frameRequestMs: round(finiteNumber(frameLoop?.requestFrameMs)),
    frameDelayMs: round(finiteNumber(frameLoop?.delayMs)),
    mediaRecorderMs: round(
      durationBetween(
        events,
        "browser:media-recorder-start",
        "browser:media-recorder-stop-complete",
      ),
    ),
    webmFlushMs: round(
      durationBetween(
        events,
        "browser:media-recorder-stop-complete",
        "browser:chunks-flush-complete",
      ),
    ),
    webmValidationMs: round(sumPhaseDuration(events, "webm-validation")),
    sceneRecordMs: round(sceneRecordMs),
    webmChunkBytes: Math.round(finiteNumber(chunksFlush?.chunkBytes)),
    webmChunkCount: Math.round(finiteNumber(chunksFlush?.chunks)),
    webglRetryCount: events.filter((event) => event.phase === "webgl-retry")
      .length,
  };
}

function compactWebglTelemetry(events) {
  return events.map((event) => {
    const compact = {
      phase: event.phase,
      attempt: event.attempt,
      atMs: event.atMs,
    };
    for (const key of [
      "durationMs",
      "chunkBytes",
      "chunks",
      "delayMs",
      "fps",
      "frameLoopMs",
      "height",
      "mimeType",
      "reason",
      "renderMs",
      "requestFrameMs",
      "targetDelayMs",
      "totalFrames",
      "width",
    ]) {
      if (event[key] !== undefined) compact[key] = event[key];
    }
    return compact;
  });
}

function sumPhaseDuration(events, phase) {
  return events
    .filter((event) => event.phase === phase)
    .reduce((total, event) => total + finiteNumber(event.durationMs), 0);
}

function durationBetween(events, startPhase, endPhase) {
  const start = events.find((event) => event.phase === startPhase);
  const end = events.find((event) => event.phase === endPhase);
  if (!start || !end) return 0;
  return Math.max(0, finiteNumber(end.atMs) - finiteNumber(start.atMs));
}

function phaseEvent(events, phase) {
  return (
    events.findLast?.((event) => event.phase === phase) ??
    [...events].reverse().find((event) => event.phase === phase)
  );
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function readHistory(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function compareWithHistory(result, runs, thresholds) {
  const previous = runs
    .flatMap((item) => item.cases ?? [])
    .filter(
      (item) =>
        item.id === result.id &&
        item.paramsHash === result.paramsHash &&
        Number.isFinite(item.totalMs),
    )
    .slice(-12);
  if (previous.length < 2) return ["baseline insuficiente para regressao"];

  const warnings = [];
  compareMetric(
    warnings,
    "tempo total",
    result.totalMs,
    median(previous, "totalMs"),
    thresholds.totalMs,
    "ms",
  );
  compareMetric(
    warnings,
    "WebM stage",
    result.webmStageMs,
    median(previous, "webmStageMs"),
    thresholds.webmStageMs,
    "ms",
  );
  compareMetric(
    warnings,
    "captura canvas",
    result.canvasCaptureMs,
    median(previous, "canvasCaptureMs"),
    thresholds.canvasCaptureMs,
    "ms",
  );
  compareMetric(
    warnings,
    "render dos frames",
    result.frameRenderMs,
    median(previous, "frameRenderMs"),
    thresholds.frameRenderMs,
    "ms",
  );
  compareMetric(
    warnings,
    "MediaRecorder/WebM",
    result.mediaRecorderMs,
    median(previous, "mediaRecorderMs"),
    thresholds.mediaRecorderMs,
    "ms",
  );
  compareMetric(
    warnings,
    "mux FFmpeg",
    result.muxMs,
    median(previous, "muxMs"),
    thresholds.muxMs,
    "ms",
  );
  compareMetric(
    warnings,
    "RSS pico",
    result.peakRssMb,
    median(previous, "peakRssMb"),
    thresholds.peakRssMb,
    "MB",
  );
  compareMetric(
    warnings,
    "WebM bytes",
    result.webmBytes,
    median(previous, "webmBytes"),
    thresholds.webmBytes,
    "bytes",
  );
  compareMetric(
    warnings,
    "MP4 bytes",
    result.mp4Bytes,
    median(previous, "mp4Bytes"),
    thresholds.mp4Bytes,
    "bytes",
  );
  if (result.retryWebgl && !previous.some((item) => item.retryWebgl)) {
    warnings.push("retry WebGL apareceu neste run");
  }
  return warnings;
}

function repeatedCaseMedians(cases) {
  const grouped = new Map();
  for (const item of cases) {
    grouped.set(item.id, [...(grouped.get(item.id) ?? []), item]);
  }
  return [...grouped.entries()].map(([id, items]) => {
    const first = items[0];
    return {
      id,
      rendererId: first.rendererId,
      outputSize: first.outputSize,
      duration: first.duration,
      repeats: items.length,
      totalMs: round(median(items, "totalMs")),
      webmStageMs: round(median(items, "webmStageMs")),
      webglPrepareMs: round(median(items, "webglPrepareMs")),
      canvasCaptureMs: round(median(items, "canvasCaptureMs")),
      frameRenderMs: round(median(items, "frameRenderMs")),
      mediaRecorderMs: round(median(items, "mediaRecorderMs")),
      muxMs: round(median(items, "muxMs")),
      peakRssMb: round(median(items, "peakRssMb")),
      mp4Bytes: Math.round(median(items, "mp4Bytes")),
      webglRetryCount: Math.round(median(items, "webglRetryCount")),
    };
  });
}

function compareMetric(warnings, label, current, baseline, multiplier, unit) {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(baseline) ||
    baseline <= 0
  ) {
    return;
  }
  if (current > baseline * multiplier) {
    warnings.push(
      `${label} acima do baseline: ${formatNumber(current)} ${unit} vs mediana ${formatNumber(baseline)} ${unit}`,
    );
  }
}

function median(items, key) {
  const values = items
    .map((item) => Number(item[key]))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!values.length) return Number.NaN;
  const middle = Math.floor(values.length / 2);
  return values.length % 2
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

function renderMarkdown(runData) {
  const rows = runData.cases
    .map((item) =>
      [
        item.id,
        item.rendererId,
        `${item.outputSize.width}x${item.outputSize.height}`,
        `${item.duration}s`,
        formatMs(item.webmStageMs),
        formatMs(item.webglPrepareMs),
        formatMs(item.canvasCaptureMs),
        formatMs(item.frameRenderMs),
        formatMs(item.frameDelayMs),
        formatMs(item.mediaRecorderMs),
        `${item.webmChunkCount} / ${(item.webmChunkBytes / 1024 / 1024).toFixed(2)} MB`,
        formatMs(item.webmValidationMs),
        formatMs(item.muxMs),
        formatMs(item.validationMs),
        formatMs(item.totalMs),
        `${item.peakRssMb.toFixed(1)} MB`,
        `${(item.mp4Bytes / 1024 / 1024).toFixed(2)} MB`,
        item.warnings.length ? item.warnings.join("; ") : "ok",
      ].join(" | "),
    )
    .join("\n");
  const medianRows = (runData.medians ?? [])
    .map((item) =>
      [
        item.id,
        item.rendererId,
        `${item.outputSize.width}x${item.outputSize.height}`,
        item.repeats,
        formatMs(item.webmStageMs),
        formatMs(item.webglPrepareMs),
        formatMs(item.canvasCaptureMs),
        formatMs(item.frameRenderMs),
        formatMs(item.mediaRecorderMs),
        formatMs(item.muxMs),
        formatMs(item.totalMs),
        `${item.peakRssMb.toFixed(1)} MB`,
        `${(item.mp4Bytes / 1024 / 1024).toFixed(2)} MB`,
        item.webglRetryCount,
      ].join(" | "),
    )
    .join("\n");
  const medianSection =
    runData.repeat > 1
      ? `
## Repeat Medians

Case | Renderer | Output | Repeats | WebM stage | Prepare | Capture | Frame render | Recorder | Mux | Total | Peak RSS | MP4 | WebGL retries
--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:
${medianRows}
`
      : "";
  const warnings = runData.warnings.length
    ? runData.warnings.map((item) => `- ${item}`).join("\n")
    : "- Nenhum alerta alem de baseline insuficiente.";
  return `# Sonara Hub render benchmark

Run: \`${runData.runId}\`
Profile: \`${runData.profile}\`
Test: \`${runData.testKey}\`
Suite: \`${runData.suiteKind}${runData.suiteId ? ` / ${runData.suiteId}` : ""}\`
Commit: \`${runData.git.commit}\`
Branch: \`${runData.git.branch}\`
Environment: ${runData.environment.platform} ${runData.environment.release}, Node ${runData.environment.node}
Audio: ${runData.audioSource.label}
Repeat: ${runData.repeat}

## Results

Case | Renderer | Output | Duration | WebM stage | Prepare | Capture | Frame render | Frame wait | Recorder | WebM chunks | WebM validate | Mux | MP4 validate | Total | Peak RSS | MP4 | Status
--- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---
${rows}

${medianSection}
## Warnings

${warnings}

## Notes

- WebM stage is now broken down into Chromium/runtime prepare, deterministic canvas capture, per-frame render/wait, MediaRecorder/WebM stop+flush, chunk bytes, and WebM validation inside \`renderWebglBackgroundVideo\`.
- FFmpeg mux, MP4 validation, peak RSS and WebGL retry count remain tracked per case; compact browser phase events are persisted in each run JSON.
- \`--repeat=N\` runs each case multiple times and reports per-case medians in this Markdown report and in \`render.json\`.
- Regression warnings are warn-only and now compare the main phase timings when matching history exists. Functional failures still fail the benchmark process.
- Baseline uses previous local runs with the same case and parameter hash from \`.dev/bench/render-history.jsonl\`.
`;
}

function gitInfo() {
  return {
    branch: command("git", ["branch", "--show-current"]),
    commit: command("git", ["rev-parse", "HEAD"]),
    status: command("git", ["status", "--short"]),
  };
}

function environmentInfo() {
  return {
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    node: process.version,
    cpus: os.cpus().length,
    totalMemoryMb: round(bytesToMb(os.totalmem())),
    ffmpeg: ffmpegPath,
  };
}

function command(name, args) {
  const result = spawnSync(name, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function inferBenchmarkStep() {
  if (audioMode === "input") return "audio";
  if (profile === "full") return "full";
  return "quick";
}

function normalizeBenchmarkStep(value) {
  return ["audio", "full", "quick"].includes(value)
    ? value
    : inferBenchmarkStep();
}

function benchmarkTestLabel(step) {
  return {
    audio: "Render com audio real",
    full: "Render full",
    quick: "Render quick",
  }[step];
}

function inferCaseDomain(benchCase) {
  const value = `${benchCase.category ?? ""} ${benchCase.compositionKey ?? ""}`;
  if (/waveform|audio/i.test(value)) return "audio";
  if (/layer|asset|cover/i.test(value)) return "asset";
  return "video";
}

function parseRepeat(value) {
  const parsed = Number.parseInt(String(value ?? "1"), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(10, Math.max(1, parsed));
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function bytesToMb(value) {
  return value / 1024 / 1024;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function formatMs(value) {
  return `${Math.round(value)}ms`;
}

function formatNumber(value) {
  return Number(value).toFixed(1);
}

function syntheticAudioEnvelope() {
  return {
    frameRate: 2,
    frames: [
      frame(0.12, 0.1, 0.08, 0.05),
      frame(0.42, 0.5, 0.28, 0.16),
      frame(0.2, 0.18, 0.22, 0.14),
    ],
  };
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
