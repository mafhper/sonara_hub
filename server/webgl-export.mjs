import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { normalizeVisualSettings } from "../shared/visual-effects.mjs";
import {
  normalizeFfmpegSpawnError,
  resolveFfmpegPath,
} from "./ffmpeg-tool.mjs";

const runtimePath = fileURLToPath(
  new URL("../shared/canvas-scene-runtime.mjs", import.meta.url),
);

export async function renderWebglBackgroundVideo(options) {
  const { size, onProgress, onTelemetry } = options;
  try {
    await runWebglRenderAttempt(options, size, 1);
  } catch (error) {
    const retryable =
      error?.code === "WEBGL_CONTEXT_LOST" ||
      error?.code === "WEBGL_SHADER_ERROR";
    const reduced = reduceRenderSize(size);
    if (retryable && reduced) {
      onTelemetry?.({
        phase: "webgl-retry",
        attempt: 2,
        reason: error.code,
        fromSize: size,
        size: reduced,
      });
      onProgress?.(4, "Recuperando contexto WebGL em resolução reduzida");
      await runWebglRenderAttempt(options, reduced, 2);
      return;
    }
    throw error;
  }
}

export async function renderWebglScenePoster(options) {
  const { size, onProgress } = options;
  try {
    await runWebglPosterAttempt(options, size);
  } catch (error) {
    const retryable =
      error?.code === "WEBGL_CONTEXT_LOST" ||
      error?.code === "WEBGL_SHADER_ERROR";
    const reduced = reduceRenderSize(size);
    if (retryable && reduced) {
      onProgress?.(4, "Recuperando contexto WebGL em resolução reduzida");
      await runWebglPosterAttempt(options, reduced);
      return;
    }
    throw error;
  }
}

// On WebGL context loss we retry once at a smaller internal size; the ffmpeg mux
// upscales the intermediate back to the requested output resolution (lanczos),
// so a successful-but-softer render still beats a hard crash. Returns null when
// the size is already small enough that a retry would not help.
function reduceRenderSize(size) {
  const longest = Math.max(size.width, size.height);
  const factor = Math.min(0.7, 1280 / longest);
  if (factor >= 0.99) return null;
  const even = (value) => Math.max(2, Math.round((value * factor) / 2) * 2);
  return { width: even(size.width), height: even(size.height) };
}

function createWebglTelemetry(onTelemetry, attempt, size) {
  const started = performance.now();
  return (phase, data = {}) => {
    onTelemetry?.({
      phase,
      attempt,
      size,
      atMs: roundTelemetryMs(performance.now() - started),
      ...data,
    });
  };
}

async function timedTelemetryPhase(emitTelemetry, phase, action) {
  const started = performance.now();
  try {
    return await action();
  } finally {
    emitTelemetry(phase, {
      durationMs: roundTelemetryMs(performance.now() - started),
    });
  }
}

function sanitizeBrowserTelemetryEvent(event) {
  if (!event || typeof event !== "object") {
    return { phase: "unknown", data: {} };
  }
  const phase = String(event.phase ?? "unknown");
  const data = {};
  for (const [key, value] of Object.entries(event)) {
    if (key === "phase") continue;
    if (
      value === null ||
      ["boolean", "number", "string"].includes(typeof value)
    ) {
      data[key] = value;
    }
  }
  return { phase, data };
}

function roundTelemetryMs(value) {
  return Math.round(value * 100) / 100;
}

function canceledRenderError() {
  const error = new Error("Job cancelado");
  error.code = "JOB_CANCELED";
  return error;
}

async function runWebglRenderAttempt(options, size, attempt) {
  const {
    outputPath,
    duration,
    settings,
    audioEnvelope,
    composition = {},
    onProgress,
    onTelemetry,
    shouldCancel,
  } = options;
  const emitTelemetry = createWebglTelemetry(onTelemetry, attempt, size);
  emitTelemetry("attempt-start");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const rendererPath = path.join(
    path.dirname(outputPath),
    "scene-renderer.html",
  );
  const runtimeSource = await timedTelemetryPhase(
    emitTelemetry,
    "runtime-load",
    () => fs.readFile(runtimePath, "utf8"),
  );
  const runtimeUrl = `data:text/javascript;base64,${Buffer.from(runtimeSource).toString("base64")}`;
  await timedTelemetryPhase(emitTelemetry, "renderer-html-write", () =>
    fs.writeFile(
      rendererPath,
      buildRendererHtml({
        runtimeUrl,
        size,
        scene: normalizeVisualSettings(settings.visualSettings ?? settings),
        audioEnvelope,
        composition,
      }),
      "utf8",
    ),
  );

  const file = await fs.open(outputPath, "w");
  let bytesWritten = 0;
  let writeQueue = Promise.resolve();
  let canceled = false;
  let browser;
  let context;
  let page;
  browser = await timedTelemetryPhase(emitTelemetry, "browser-launch", () =>
    chromium.launch({
      headless: true,
      args: [
        "--allow-file-access-from-files",
        "--autoplay-policy=no-user-gesture-required",
        // Keep the software (SwiftShader) path usable and ignore the GPU blocklist
        // so headless Chromium does not refuse to start a WebGL context. Forcing a
        // real GPU is opt-in (SONARA_FORCE_GPU=1) since it can fail to launch in a
        // non-interactive/service context on Windows.
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
        ...(process.env.SONARA_FORCE_GPU === "1"
          ? ["--use-angle=gl", "--enable-gpu"]
          : []),
      ],
    }),
  );
  await timedTelemetryPhase(emitTelemetry, "page-open", async () => {
    context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { width: size.width, height: size.height },
    });
    page = await context.newPage();
  });
  const diagnostics = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      diagnostics.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    diagnostics.push(`pageerror: ${error.message}`);
  });

  await page.exposeFunction("reportSceneProgress", async (progress) => {
    // Cancellation is honored here (called once per frame): close the page so the
    // in-flight page.evaluate rejects promptly instead of finishing the render.
    if (typeof shouldCancel === "function" && shouldCancel()) {
      canceled = true;
      await page.close().catch(() => {});
      return;
    }
    onProgress?.(
      Math.max(4, Math.min(92, Math.round(progress))),
      "Renderizando cena",
    );
  });
  await page.exposeFunction("reportScenePhase", async (event) => {
    const telemetry = sanitizeBrowserTelemetryEvent(event);
    emitTelemetry(`browser:${telemetry.phase}`, telemetry.data);
  });
  await page.exposeFunction("saveSceneChunk", async (chunkBase64) => {
    const buffer = Buffer.from(chunkBase64, "base64");
    if (!buffer.length) return;
    writeQueue = writeQueue.then(async () => {
      await file.write(buffer);
      bytesWritten += buffer.length;
    });
    await writeQueue;
  });

  // Server-side cancel watcher: a slow per-frame render can block the page's JS
  // thread, so the in-page reportSceneProgress callback (and page.close) may not
  // run. Polling here and force-closing the browser process aborts the render
  // even when the page is wedged.
  let cancelWatcher = null;
  if (typeof shouldCancel === "function") {
    cancelWatcher = setInterval(() => {
      if (shouldCancel()) {
        canceled = true;
        clearInterval(cancelWatcher);
        cancelWatcher = null;
        browser.close().catch(() => {});
      }
    }, 400);
  }

  try {
    await timedTelemetryPhase(emitTelemetry, "page-load", async () => {
      await page.goto(pathToFileURL(rendererPath).href, { waitUntil: "load" });
      await page.waitForFunction(
        () => typeof window.recordScene === "function",
      );
    });
    try {
      await timedTelemetryPhase(emitTelemetry, "scene-record", () =>
        page.evaluate(
          ({ durationSeconds, fps, startTime }) =>
            window.recordScene(durationSeconds, fps, startTime),
          {
            durationSeconds: duration,
            fps: settings.webglFps,
            startTime: Number(options.startTime ?? 0),
          },
        ),
      );
    } catch (error) {
      if (canceled || (typeof shouldCancel === "function" && shouldCancel())) {
        throw canceledRenderError();
      }
      throw describeSceneRenderError(error, {
        diagnostics,
        scene: normalizeVisualSettings(settings.visualSettings ?? settings),
        size,
        fps: settings.webglFps,
      });
    }
    await writeQueue;
  } finally {
    if (cancelWatcher) clearInterval(cancelWatcher);
    await file.close();
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  if (canceled) throw canceledRenderError();
  await timedTelemetryPhase(emitTelemetry, "webm-validation", () =>
    assertValidWebm(outputPath, bytesWritten),
  );
  emitTelemetry("attempt-complete", { bytesWritten });
}

async function runWebglPosterAttempt(options, size) {
  const {
    outputPath,
    settings,
    audioEnvelope,
    composition = {},
    onProgress,
    posterTime = 7.5,
  } = options;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const rendererPath = path.join(
    path.dirname(outputPath),
    "scene-poster-renderer.html",
  );
  const runtimeSource = await fs.readFile(runtimePath, "utf8");
  const runtimeUrl = `data:text/javascript;base64,${Buffer.from(runtimeSource).toString("base64")}`;
  await fs.writeFile(
    rendererPath,
    buildRendererHtml({
      runtimeUrl,
      size,
      scene: normalizeVisualSettings(settings.visualSettings ?? settings),
      audioEnvelope,
      composition,
    }),
    "utf8",
  );

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--allow-file-access-from-files",
      "--autoplay-policy=no-user-gesture-required",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      ...(process.env.SONARA_FORCE_GPU === "1"
        ? ["--use-angle=gl", "--enable-gpu"]
        : []),
    ],
  });
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width: size.width, height: size.height },
  });
  const page = await context.newPage();
  const diagnostics = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      diagnostics.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    diagnostics.push(`pageerror: ${error.message}`);
  });

  try {
    onProgress?.(8, "Renderizando poster");
    await page.goto(pathToFileURL(rendererPath).href, { waitUntil: "load" });
    await page.waitForFunction(
      () => typeof window.renderScenePoster === "function",
    );
    try {
      await page.evaluate(({ time }) => window.renderScenePoster(time), {
        time: Number(posterTime) || 0,
      });
    } catch (error) {
      throw describeSceneRenderError(error, {
        diagnostics,
        scene: normalizeVisualSettings(settings.visualSettings ?? settings),
        size,
        fps: settings.webglFps,
      });
    }
    await page.locator("#scene").screenshot({
      path: outputPath,
      type: "jpeg",
      quality: 90,
    });
    onProgress?.(72, "Poster renderizado");
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const stat = await fs.stat(outputPath);
  if (stat.size < 1024) {
    throw new Error(
      `Poster exportado vazio ou incompleto (${stat.size} bytes).`,
    );
  }
}

export function describeSceneRenderError(
  error,
  { diagnostics = [], scene, size, fps },
) {
  const original = error instanceof Error ? error.message : String(error);
  const contextLost = /contexto perdido:\s*true|context lost/i.test(original);
  const shaderFailure = /WEBGL_SHADER|shader WebGL|compileShader/i.test(
    original,
  );
  const code = contextLost
    ? "WEBGL_CONTEXT_LOST"
    : shaderFailure
      ? "WEBGL_SHADER_ERROR"
      : "WEBGL_RENDER_ERROR";
  const detail = [
    `Código: ${code}`,
    `Preset: ${scene.name || scene.id}`,
    `Renderer: ${scene.rendererId}`,
    `Resolução interna: ${size.width}x${size.height} @ ${fps} fps`,
    `Erro original: ${original}`,
    diagnostics.length
      ? `Diagnóstico do Chromium:\n${diagnostics.slice(-8).join("\n")}`
      : "",
    contextLost
      ? "Ação sugerida: tente o perfil Rápido ou Automático, reduza a resolução desta exportação ou escolha um renderer vetorial/tela escura para confirmar se o problema é do contexto WebGL."
      : "Ação sugerida: copie esta mensagem e revise o preset/renderer usado na exportação.",
  ]
    .filter(Boolean)
    .join("\n");
  const wrapped = new Error(
    `Falha ao renderizar a cena de vídeo (${code}). Use "Copiar erro" para analisar o diagnóstico.`,
  );
  wrapped.code = code;
  wrapped.detail = detail;
  wrapped.cause = error;
  return wrapped;
}

export function buildRendererHtml({
  runtimeUrl,
  size,
  scene,
  audioEnvelope = { frameRate: 12, frames: [] },
  composition,
}) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cinzel:wght@400;700;900&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=DM+Serif+Display:ital@0;1&family=Montserrat:ital,wght@0,300;0,400;0,700;0,900;1,300;1,700&family=Oswald:wght@300;400;600;700&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Raleway:ital,wght@0,300;0,400;0,700;1,300;1,400&family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #08090b; }
    canvas { display: block; width: ${size.width}px; height: ${size.height}px; }
  </style>
</head>
<body>
  <canvas id="scene" width="${size.width}" height="${size.height}"></canvas>
  <script type="module">
    import { createSceneRuntime, loadMediaElements } from ${JSON.stringify(runtimeUrl)};
    const scene = ${JSON.stringify(scene)};
    const audioEnvelope = ${JSON.stringify(audioEnvelope)};
    const composition = await loadMediaElements(${JSON.stringify(composition)});
    const canvas = document.getElementById("scene");
    const runtime = createSceneRuntime(canvas, scene, composition);
    runtime.resize(${size.width}, ${size.height});

    function audioAt(time) {
      if (!audioEnvelope.frames.length) return { energy: 0, bass: 0, mid: 0, high: 0, centroid: 0, flux: 0, onset: 0, beat: 0, beatPhase: 0, samples: [], spectrum: [] };
      const position = Math.max(0, time * audioEnvelope.frameRate);
      const leftIndex = Math.min(audioEnvelope.frames.length - 1, Math.floor(position));
      const rightIndex = Math.min(audioEnvelope.frames.length - 1, leftIndex + 1);
      const mix = position - leftIndex;
      const left = audioEnvelope.frames[leftIndex], right = audioEnvelope.frames[rightIndex];
      const lerp = (a, b) => a + (b - a) * mix;
      const nearest = (a, b) => (mix < 0.5 ? a : b);
      const lerpPhase = (a, b) => {
        let rightPhase = b;
        if (rightPhase - a > 0.5) rightPhase -= 1;
        if (a - rightPhase > 0.5) rightPhase += 1;
        const value = lerp(a, rightPhase);
        return value - Math.floor(value);
      };
      const lerpArray = (a = [], b = []) => {
        const length = Math.max(a.length, b.length);
        return Array.from({ length }, (_, index) => lerp(a[index] ?? 0, b[index] ?? 0));
      };
      return {
        energy: lerp(left.energy, right.energy),
        bass: lerp(left.bass, right.bass),
        mid: lerp(left.mid, right.mid),
        high: lerp(left.high, right.high),
        centroid: lerp(left.centroid ?? 0, right.centroid ?? 0),
        flux: lerp(left.flux ?? 0, right.flux ?? 0),
        onset: lerp(left.onset ?? 0, right.onset ?? 0),
        beat: nearest(left.beat ?? 0, right.beat ?? 0),
        beatPhase: lerpPhase(left.beatPhase ?? 0, right.beatPhase ?? 0),
        samples: lerpArray(left.samples, right.samples),
        spectrum: lerpArray(left.spectrum, right.spectrum),
      };
    }

    const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const reportPhase = async (phase, data = {}) => {
      if (typeof window.reportScenePhase === "function") {
        await window.reportScenePhase({ phase, ...data });
      }
    };

    // Wait for custom fonts (up to 4 s) before exposing the render API so that
    // the first frame is never drawn with fallback fonts.
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);

    window.renderScenePoster = (time = 0) => {
      runtime.setAudio(audioAt(time));
      runtime.render(time, 24);
    };

    window.recordScene = async (durationSeconds, fps, startTime = 0) => {
      if (!window.MediaRecorder) throw new Error("MediaRecorder indisponível no Chromium");
      // Fail fast if the GPU context drops mid-render instead of stalling the
      // frame loop; the server classifies this as WEBGL_CONTEXT_LOST and retries
      // at a reduced resolution.
      let contextLost = false;
      canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        contextLost = true;
      });
      // Prefer VP9: at a given bitrate it keeps far more detail than VP8, so the
      // intermediate WebM that ffmpeg re-encodes is effectively transparent.
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
          ? "video/webm;codecs=vp8"
          : "video/webm";
      const stream = canvas.captureStream(0);
      const [track] = stream.getVideoTracks();
      if (typeof track?.requestFrame !== "function") {
        throw new Error("Captura determinística do canvas indisponível no Chromium");
      }
      const frameDuration = 1000 / fps;
      const captureFrameDelayMs = Math.min(frameDuration, 32);
      const totalFrames = Math.max(2, Math.ceil(durationSeconds * fps));
      const roundMs = (value) => Math.round(value * 100) / 100;
      const captureMetrics = {
        renderMs: 0,
        requestFrameMs: 0,
        delayMs: 0,
      };
      const recorder = new MediaRecorder(stream, {
        mimeType,
        // ~25 Mbps at 1080p (was ~3): keeps the intermediate near-lossless so the
        // final x264 pass is the only meaningful quality stage.
        videoBitsPerSecond: Math.max(24000000, Math.round(canvas.width * canvas.height * 12)),
      });
      const chunks = [];
      let chunkBytes = 0;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunkBytes += event.data.size;
          chunks.push(event.data.arrayBuffer().then((buffer) => window.saveSceneChunk(arrayBufferToBase64(buffer))));
        }
      };
      await reportPhase("media-recorder-start", {
        fps,
        height: canvas.height,
        mimeType,
        targetDelayMs: roundMs(captureFrameDelayMs),
        totalFrames,
        width: canvas.width,
      });
      recorder.start(250);
      await reportPhase("canvas-capture-start", { totalFrames });
      for (let index = 0; index < totalFrames; index += 1) {
        if (contextLost) throw new Error("Falha ao renderizar: contexto perdido: true (WEBGL_CONTEXT_LOST)");
        const time = Math.max(0, startTime) + Math.min(durationSeconds, index / fps);
        const renderStarted = performance.now();
        runtime.setAudio(audioAt(time));
        runtime.render(time, fps);
        captureMetrics.renderMs += performance.now() - renderStarted;
        const requestFrameStarted = performance.now();
        track.requestFrame();
        captureMetrics.requestFrameMs += performance.now() - requestFrameStarted;
        window.reportSceneProgress(((index + 1) / totalFrames) * 88 + 4);
        const delayStarted = performance.now();
        await delay(captureFrameDelayMs);
        captureMetrics.delayMs += performance.now() - delayStarted;
      }
      await reportPhase("canvas-frame-loop-complete", {
        delayMs: roundMs(captureMetrics.delayMs),
        frameLoopMs: roundMs(captureMetrics.renderMs + captureMetrics.requestFrameMs + captureMetrics.delayMs),
        renderMs: roundMs(captureMetrics.renderMs),
        requestFrameMs: roundMs(captureMetrics.requestFrameMs),
        targetDelayMs: roundMs(captureFrameDelayMs),
        totalFrames,
      });
      await reportPhase("canvas-capture-complete", { totalFrames });
      await reportPhase("media-recorder-stop-start", { chunks: chunks.length });
      await new Promise((resolve) => {
        recorder.onstop = resolve;
        if (recorder.state === "recording") recorder.requestData();
        setTimeout(() => {
          if (recorder.state === "inactive") resolve();
          else recorder.stop();
        }, 250);
      });
      await reportPhase("media-recorder-stop-complete", { chunks: chunks.length });
      await Promise.all(chunks);
      await reportPhase("chunks-flush-complete", { chunkBytes, chunks: chunks.length });
    };

    function arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let index = 0; index < bytes.length; index += 32768) {
        binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 32768));
      }
      return btoa(binary);
    }
  </script>
</body>
</html>`;
}

async function assertValidWebm(outputPath, bytesWritten) {
  const stat = await fs.stat(outputPath);
  const size = Math.max(stat.size, bytesWritten);
  if (size < 1024) {
    throw new Error(
      `Cena exportou um WebM vazio ou incompleto (${size} bytes).`,
    );
  }
  const handle = await fs.open(outputPath, "r");
  try {
    const header = Buffer.alloc(4);
    await handle.read(header, 0, 4, 0);
    if (
      header[0] !== 0x1a ||
      header[1] !== 0x45 ||
      header[2] !== 0xdf ||
      header[3] !== 0xa3
    ) {
      throw new Error("Cena exportou um arquivo sem cabecalho WebM valido.");
    }
  } finally {
    await handle.close();
  }
  await assertWebmDecodable(outputPath);
}

export function assertWebmDecodeReport(stderr) {
  if (
    /File ended prematurely|EBML header parsing failed|Invalid data found/i.test(
      stderr,
    )
  ) {
    throw new Error("Cena exportou um WebM truncado ou invalido.");
  }
}

function assertWebmDecodable(outputPath) {
  const ffmpegPath = resolveFfmpegPath();
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      ["-hide_banner", "-i", outputPath, "-f", "null", "-"],
      { windowsHide: true },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) =>
      reject(normalizeFfmpegSpawnError(error, ffmpegPath)),
    );
    child.on("close", (code) => {
      try {
        assertWebmDecodeReport(stderr);
        if (code !== 0) {
          throw new Error(
            `Cena WebM não pode ser decodificada: ${stderr.slice(-1200)}`,
          );
        }
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}
