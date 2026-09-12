import fs from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { build as viteBuild } from "vite";
import { normalizeVisualSettings } from "../shared/visual-effects.mjs";
import {
  FFMPEG_MISSING_CODE,
  FFMPEG_PROCESS_FAILED_CODE,
  normalizeFfmpegSpawnError,
  resolveFfmpegPath,
} from "./ffmpeg-tool.mjs";

const runtimePath = fileURLToPath(
  new URL("../shared/canvas-scene-runtime.mjs", import.meta.url),
);
let bundledRuntimeSourcePromise = null;

export const webglGpuModes = Object.freeze(["auto", "hardware", "software"]);

const softwareRendererPattern =
  /swiftshader|llvmpipe|software(?:\s+|[-_])(?:rasterizer|renderer)|microsoft basic render|basic render driver/iu;

export function normalizeGpuMode(value, fallback = "software") {
  const safeFallback = webglGpuModes.includes(fallback) ? fallback : "software";
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return webglGpuModes.includes(normalized) ? normalized : safeFallback;
}

export function resolveGpuMode(environment = process.env) {
  // Keep the historical force flag working while making the new mode explicit.
  if (environment.SONARA_FORCE_GPU === "1") return "hardware";
  return normalizeGpuMode(environment.SONARA_GPU_MODE, "software");
}

export const capturePacingModes = Object.freeze(["legacy", "adaptive"]);

// legacy: fixed post-frame wait (historical behavior).
// adaptive: wait only the remainder of the frame deadline after draw +
// requestFrame complete, removing the double-counted artificial tax while
// keeping wall-clock alignment for the intermediate WebM.
export function resolveCapturePacingMode(environment = process.env) {
  const normalized = String(environment.SONARA_CAPTURE_PACING ?? "")
    .trim()
    .toLowerCase();
  return capturePacingModes.includes(normalized) ? normalized : "legacy";
}

function normalizeCapturePacingMode(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return capturePacingModes.includes(normalized) ? normalized : "legacy";
}

export function webglLaunchArgs(
  mode = resolveGpuMode(),
  platform = process.platform,
) {
  const common = [
    "--allow-file-access-from-files",
    "--autoplay-policy=no-user-gesture-required",
  ];
  const resolvedMode = normalizeGpuMode(mode);
  if (resolvedMode === "software") {
    return [
      ...common,
      // Keep the existing software path usable in headless and service contexts.
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
    ];
  }

  const angle =
    platform === "win32"
      ? "--use-angle=d3d11"
      : platform === "darwin"
        ? "--use-angle=metal"
        : "--use-angle=gl";
  return [
    ...common,
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    angle,
    // In headless mode, GPU compositing keeps accelerated canvas frames away
    // from the captureStream pipeline: MediaRecorder then emits a silent,
    // empty WebM. Software compositing routes the GPU-rendered frames back
    // into the capture path while WebGL itself still runs on the dedicated
    // GPU (verified with an isolated probe on ANGLE D3D11 / RX 7600).
    "--disable-gpu-compositing",
    "--enable-gpu-rasterization",
    "--enable-zero-copy",
  ];
}

export function normalizeGpuInfo(info = {}) {
  const cleanText = (value) => {
    const normalized = String(value ?? "")
      .replace(/[\u0000-\u001f\u007f]/gu, " ")
      .replaceAll("|", "/")
      .trim()
      .slice(0, 256);
    return normalized || null;
  };
  return {
    available: Boolean(info.available),
    vendor: cleanText(info.vendor),
    renderer: cleanText(info.renderer),
    version: cleanText(info.version),
    shadingLanguageVersion: cleanText(info.shadingLanguageVersion),
    webglVersion: cleanText(info.webglVersion),
  };
}

export function isSoftwareWebglRenderer(info = {}) {
  if (!info.available || !info.renderer) return true;
  return softwareRendererPattern.test(
    [info.vendor, info.renderer, info.version].filter(Boolean).join(" "),
  );
}

export function isHardwareWebglRenderer(info = {}) {
  return Boolean(
    info.available && info.renderer && !isSoftwareWebglRenderer(info),
  );
}

export function createGpuHardwareUnavailableError(info = {}) {
  const normalized = normalizeGpuInfo(info);
  const error = new Error(
    [
      "GPU_HARDWARE_UNAVAILABLE: o renderer WebGL não confirmou uma GPU de hardware.",
      normalized.renderer
        ? `Renderer: ${normalized.renderer}.`
        : "Renderer: indisponível.",
    ].join(" "),
  );
  error.code = "GPU_HARDWARE_UNAVAILABLE";
  error.details = { gpuInfo: normalized };
  return error;
}

export function bundleSceneRuntimeSource() {
  if (!bundledRuntimeSourcePromise) {
    bundledRuntimeSourcePromise = buildSceneRuntimeBundle().catch((error) => {
      bundledRuntimeSourcePromise = null;
      throw error;
    });
  }
  return bundledRuntimeSourcePromise;
}

async function buildSceneRuntimeBundle() {
  const result = await viteBuild({
    configFile: false,
    logLevel: "silent",
    publicDir: false,
    build: {
      write: false,
      target: "es2022",
      minify: false,
      sourcemap: false,
      lib: {
        entry: runtimePath,
        formats: ["es"],
        fileName: "scene-runtime",
      },
      rollupOptions: {
        output: { codeSplitting: false },
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(
    (item) => item.output ?? [],
  );
  const chunk = outputs.find((item) => item.type === "chunk" && item.isEntry);
  if (!chunk?.code) {
    throw new Error("Falha ao empacotar o runtime de cena para exportação.");
  }
  return chunk.code;
}

export function createWebglRenderSession({
  launchBrowser = launchWebglBrowser,
  mode = resolveGpuMode(),
} = {}) {
  const sessionMode = normalizeGpuMode(mode);
  let browserPromise = null;
  let closed = false;

  async function getBrowser() {
    if (closed) throw new Error("Sessão de renderização WebGL encerrada.");
    if (!browserPromise) {
      browserPromise = Promise.resolve().then(launchBrowser);
    }
    let browser;
    try {
      browser = await browserPromise;
    } catch (error) {
      browserPromise = null;
      throw error;
    }
    if (typeof browser.isConnected === "function" && !browser.isConnected()) {
      browserPromise = Promise.resolve().then(launchBrowser);
      try {
        browser = await browserPromise;
      } catch (error) {
        browserPromise = null;
        throw error;
      }
    }
    return browser;
  }

  return {
    mode: sessionMode,
    getBrowser,
    async close() {
      if (closed) return;
      closed = true;
      const activeBrowser = browserPromise;
      browserPromise = null;
      const browser = await activeBrowser?.catch(() => null);
      await browser?.close();
    },
  };
}

export function canReuseRenderSession(renderSession, requestedMode) {
  if (!renderSession) return false;
  if (typeof renderSession.getBrowser !== "function") return false;
  if (normalizeGpuMode(requestedMode) !== "software") return true;
  // A software-only retry (for example, the auto-mode fallback after an
  // invalid hardware WebM) must never reuse a session launched in auto or
  // hardware mode, otherwise the retry would record with the same GPU
  // browser and the fallback would be a no-op.
  return renderSession.mode === "software";
}

function launchWebglBrowser(mode = resolveGpuMode()) {
  return chromium.launch({
    headless: true,
    args: webglLaunchArgs(mode),
  });
}

function probeWebglRendererInPage() {
  const canvas = document.createElement("canvas");
  const contexts = [
    ["webgl2", "WebGL2"],
    ["webgl", "WebGL1"],
  ];
  for (const [contextName, webglVersion] of contexts) {
    let gl = null;
    try {
      gl = canvas.getContext(contextName);
    } catch {
      gl = null;
    }
    if (!gl) continue;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const vendorParameter = debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR;
    const rendererParameter = debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER;
    return {
      available: true,
      vendor: gl.getParameter(vendorParameter),
      renderer: gl.getParameter(rendererParameter),
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      webglVersion,
    };
  }
  return {
    available: false,
    vendor: null,
    renderer: null,
    version: null,
    shadingLanguageVersion: null,
    webglVersion: null,
  };
}

async function probeBrowserRenderer(browser) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    return normalizeGpuInfo(await page.evaluate(probeWebglRendererInPage));
  } finally {
    await context.close().catch(() => {});
  }
}

async function closeBrowser(browser) {
  if (browser) await browser.close().catch(() => {});
}

// One-shot capability probe used by the local settings surface. Never throws;
// probe failures are reported through the returned info instead.
export async function probeWebglCapabilities(mode = "hardware") {
  let browser;
  try {
    browser = await launchWebglBrowser(mode);
    return await probeBrowserRenderer(browser);
  } catch (error) {
    return {
      ...normalizeGpuInfo(null),
      probeError: error?.message ?? String(error),
    };
  } finally {
    await closeBrowser(browser);
  }
}

async function acquireWebglBrowser({ renderSession, requestedMode }) {
  const ownsBrowser = !renderSession;
  if (renderSession) {
    const browser = await renderSession.getBrowser();
    let candidateGpuInfo = null;
    let fallbackReason = null;
    if (requestedMode !== "software") {
      candidateGpuInfo = await probeBrowserRenderer(browser);
      if (
        requestedMode === "hardware" &&
        !isHardwareWebglRenderer(candidateGpuInfo)
      ) {
        throw createGpuHardwareUnavailableError(candidateGpuInfo);
      }
      if (
        requestedMode === "auto" &&
        !isHardwareWebglRenderer(candidateGpuInfo)
      ) {
        fallbackReason = candidateGpuInfo.available
          ? "renderer-reported-software"
          : "renderer-unavailable";
      }
    }
    return { browser, ownsBrowser, candidateGpuInfo, fallbackReason };
  }

  if (requestedMode === "software") {
    return {
      browser: await launchWebglBrowser("software"),
      ownsBrowser,
      candidateGpuInfo: null,
      fallbackReason: null,
    };
  }

  let browser;
  let candidateGpuInfo = null;
  let fallbackReason = null;
  try {
    browser = await launchWebglBrowser(requestedMode);
    candidateGpuInfo = await probeBrowserRenderer(browser);
  } catch (error) {
    await closeBrowser(browser);
    if (requestedMode !== "auto") throw error;
    fallbackReason = "hardware-launch-or-probe-failed";
  }

  if (browser && isHardwareWebglRenderer(candidateGpuInfo)) {
    return { browser, ownsBrowser, candidateGpuInfo, fallbackReason: null };
  }

  if (requestedMode === "hardware") {
    await closeBrowser(browser);
    throw createGpuHardwareUnavailableError(candidateGpuInfo ?? {});
  }

  await closeBrowser(browser);
  fallbackReason ??= candidateGpuInfo?.available
    ? "renderer-reported-software"
    : "renderer-unavailable";
  return {
    browser: await launchWebglBrowser("software"),
    ownsBrowser,
    candidateGpuInfo,
    fallbackReason,
  };
}

export async function renderWebglBackgroundVideo(options) {
  const { size, onProgress, onTelemetry, onRenderHealth } = options;
  try {
    await runWebglRenderAttempt(options, size, 1);
  } catch (error) {
    if (resolveGpuMode() === "auto" && error?.code === "WEBGL_OUTPUT_INVALID") {
      onTelemetry?.({
        phase: "gpu-fallback",
        attempt: 2,
        fromMode: "hardware",
        toMode: "software",
        reason: "webm-output-invalid",
      });
      await runWebglRenderAttempt(
        {
          ...options,
          gpuModeOverride: "software",
          gpuFallbackReason: "webm-output-invalid",
        },
        size,
        2,
      );
      return;
    }
    const retryable =
      error?.code === "WEBGL_CONTEXT_LOST" ||
      error?.code === "WEBGL_SHADER_ERROR";
    if (error?.code === "WEBGL_CONTEXT_LOST") {
      onRenderHealth?.({ type: "context-lost", reason: error.code });
    }
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
    onRenderHealth,
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
    bundleSceneRuntimeSource,
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
        pacingMode: resolveCapturePacingMode(),
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
  const renderSession = options.renderSession;
  const gpuModeRequested = normalizeGpuMode(
    options.gpuModeOverride ?? resolveGpuMode(),
  );
  const reusableSession = canReuseRenderSession(
    renderSession,
    gpuModeRequested,
  );
  let ownsBrowser = !renderSession;
  let browserResolution;
  try {
    browserResolution = await timedTelemetryPhase(
      emitTelemetry,
      reusableSession ? "browser-acquire" : "browser-launch",
      () =>
        acquireWebglBrowser({
          renderSession: reusableSession ? renderSession : null,
          requestedMode: gpuModeRequested,
        }),
    );
    browser = browserResolution.browser;
    ownsBrowser = browserResolution.ownsBrowser;
  } catch (error) {
    await file.close().catch(() => {});
    throw error;
  }
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
    // Cancellation is also polled by the server-side watcher below. This callback
    // still closes the page promptly when the throttled in-page progress update
    // reaches Node between frames.
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
  // run. Polling here force-closes the owned browser or the current shared
  // context, aborting the render even when the page is wedged.
  let cancelWatcher = null;
  if (typeof shouldCancel === "function") {
    cancelWatcher = setInterval(() => {
      if (shouldCancel()) {
        canceled = true;
        clearInterval(cancelWatcher);
        cancelWatcher = null;
        (ownsBrowser ? browser : context).close().catch(() => {});
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
    const gpuInfo = normalizeGpuInfo(
      await timedTelemetryPhase(emitTelemetry, "gpu-probe", () =>
        page.evaluate(probeWebglRendererInPage),
      ),
    );
    const gpuHardware = isHardwareWebglRenderer(gpuInfo);
    const gpuModeResolved = gpuHardware ? "hardware" : "software";
    const gpuFallbackReason =
      options.gpuFallbackReason ??
      browserResolution.fallbackReason ??
      (gpuModeRequested === "auto" && !gpuHardware
        ? "renderer-reported-software"
        : gpuModeRequested === "hardware" && !gpuHardware
          ? "hardware-requested-but-renderer-software"
          : null);
    emitTelemetry("gpu-info", {
      gpuAvailable: gpuInfo.available,
      gpuHardware,
      gpuModeRequested,
      gpuModeResolved:
        gpuModeRequested === "hardware" && !gpuHardware
          ? "unavailable"
          : gpuModeResolved,
      gpuFallbackReason,
      vendor: gpuInfo.vendor,
      renderer: gpuInfo.renderer,
      version: gpuInfo.version,
      shadingLanguageVersion: gpuInfo.shadingLanguageVersion,
      webglVersion: gpuInfo.webglVersion,
    });
    if (gpuModeRequested === "hardware" && !gpuHardware) {
      throw createGpuHardwareUnavailableError(gpuInfo);
    }
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
    if (ownsBrowser) await browser.close().catch(() => {});
  }

  if (canceled) throw canceledRenderError();
  try {
    await timedTelemetryPhase(emitTelemetry, "webm-validation", () =>
      assertValidWebm(outputPath, bytesWritten),
    );
    const expectedFrames = Math.max(
      2,
      Math.ceil(duration * (settings.webglFps ?? 24)),
    );
    const capturedFrames = await timedTelemetryPhase(
      emitTelemetry,
      "capture-frame-count",
      () => countWebmVideoFrames(outputPath),
    );
    emitTelemetry("capture-frame-count-result", {
      expectedFrames,
      capturedFrames,
    });
    const evaluation = evaluateFrameCaptureCount({
      expectedFrames,
      capturedFrames,
    });
    onRenderHealth?.({
      type: "capture-frame-count",
      expectedFrames,
      capturedFrames,
      ratio: evaluation.ratio,
      ok: evaluation.ok,
    });
    if (!evaluation.ok) {
      throw createWebglOutputInvalidError(
        `Captura perdeu frames: ${capturedFrames}/${expectedFrames} (${Math.round(evaluation.ratio * 100)}%).`,
      );
    }
  } catch (error) {
    // Output-invalid failures are much easier to root-cause with the page
    // console/pageerror trail attached (for example, empty WebM on hardware
    // ANGLE launches).
    error.diagnostics ??= diagnostics.slice(-12);
    throw error;
  }
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
  const runtimeSource = await bundleSceneRuntimeSource();
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

  const browser = await launchWebglBrowser();
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
  pacingMode = "legacy",
}) {
  const serializedRuntimeUrl = serializeForInlineScript(runtimeUrl);
  const serializedScene = serializeForInlineScript(scene);
  const serializedAudioEnvelope = serializeForInlineScript(audioEnvelope);
  const serializedComposition = serializeForInlineScript(composition);
  const capturePacingMode = normalizeCapturePacingMode(pacingMode);
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
    import { createSceneRuntime, loadMediaElements } from ${serializedRuntimeUrl};
    const scene = ${serializedScene};
    const audioEnvelope = ${serializedAudioEnvelope};
    const composition = await loadMediaElements(${serializedComposition});
    const capturePacingAdaptive = ${capturePacingMode === "adaptive"};
    const canvas = document.getElementById("scene");
    const runtime = createSceneRuntime(canvas, scene, composition);
    runtime.resize(${size.width}, ${size.height});
    const audioSamples = [];
    const audioSpectrum = [];
    const audioFrame = {
      energy: 0,
      bass: 0,
      mid: 0,
      high: 0,
      centroid: 0,
      flux: 0,
      onset: 0,
      beat: 0,
      beatPhase: 0,
      samples: audioSamples,
      spectrum: audioSpectrum,
    };

    function audioAt(time) {
      if (!audioEnvelope.frames.length) {
        audioFrame.energy = 0;
        audioFrame.bass = 0;
        audioFrame.mid = 0;
        audioFrame.high = 0;
        audioFrame.centroid = 0;
        audioFrame.flux = 0;
        audioFrame.onset = 0;
        audioFrame.beat = 0;
        audioFrame.beatPhase = 0;
        audioSamples.length = 0;
        audioSpectrum.length = 0;
        return audioFrame;
      }
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
      const lerpArrayInto = (target, a = [], b = []) => {
        const length = Math.max(a.length, b.length);
        target.length = length;
        for (let index = 0; index < length; index += 1) {
          target[index] = lerp(a[index] ?? 0, b[index] ?? 0);
        }
        return target;
      };
      audioFrame.energy = lerp(left.energy, right.energy);
      audioFrame.bass = lerp(left.bass, right.bass);
      audioFrame.mid = lerp(left.mid, right.mid);
      audioFrame.high = lerp(left.high, right.high);
      audioFrame.centroid = lerp(left.centroid ?? 0, right.centroid ?? 0);
      audioFrame.flux = lerp(left.flux ?? 0, right.flux ?? 0);
      audioFrame.onset = lerp(left.onset ?? 0, right.onset ?? 0);
      audioFrame.beat = nearest(left.beat ?? 0, right.beat ?? 0);
      audioFrame.beatPhase = lerpPhase(left.beatPhase ?? 0, right.beatPhase ?? 0);
      lerpArrayInto(audioSamples, left.samples, right.samples);
      lerpArrayInto(audioSpectrum, left.spectrum, right.spectrum);
      return audioFrame;
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
      // Without this, a failed internal encoder surfaces as a silent empty
      // WebM: the frame loop keeps running and nothing reaches the server.
      recorder.onerror = (event) => {
        reportPhase("media-recorder-error", {
          error: String(event.error?.message ?? event.error ?? "unknown"),
          state: recorder.state,
        });
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
      let nextProgressReport = 4;
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
        const progress = ((index + 1) / totalFrames) * 88 + 4;
        if (progress >= nextProgressReport || index === totalFrames - 1) {
          window.reportSceneProgress(progress);
          nextProgressReport = Math.floor(progress) + 1;
        }
        const remainingDelayMs =
          captureFrameDelayMs - (performance.now() - renderStarted);
        const pacingWaitMs = capturePacingAdaptive
          ? Math.max(0, remainingDelayMs)
          : captureFrameDelayMs;
        // Sempre devolve uma volta de event loop ao browser: sem isso, quando
        // o draw consome o orçamento inteiro do frame o MediaRecorder perde
        // turnos de CPU e descarta frames silenciosamente (ou emite WebM vazio
        // em software).
        const delayStarted = performance.now();
        await delay(pacingWaitMs);
        captureMetrics.delayMs += performance.now() - delayStarted;
      }
      await reportPhase("canvas-frame-loop-complete", {
        delayMs: roundMs(captureMetrics.delayMs),
        frameLoopMs: roundMs(captureMetrics.renderMs + captureMetrics.requestFrameMs + captureMetrics.delayMs),
        renderMs: roundMs(captureMetrics.renderMs),
        requestFrameMs: roundMs(captureMetrics.requestFrameMs),
        targetDelayMs: roundMs(captureFrameDelayMs),
        pacingMode: "${capturePacingMode}",
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

export function serializeForInlineScript(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

async function assertValidWebm(outputPath, bytesWritten) {
  const handle = await fs.open(outputPath, "r");
  try {
    const stat = await handle.stat();
    const size = Math.max(stat.size, bytesWritten);
    if (size < 1024) {
      throw createWebglOutputInvalidError(
        `Cena exportou um WebM vazio ou incompleto (${size} bytes).`,
      );
    }
    const header = Buffer.alloc(4);
    await handle.read(header, 0, 4, 0);
    if (
      header[0] !== 0x1a ||
      header[1] !== 0x45 ||
      header[2] !== 0xdf ||
      header[3] !== 0xa3
    ) {
      throw createWebglOutputInvalidError(
        "Cena exportou um arquivo sem cabecalho WebM valido.",
      );
    }
  } finally {
    await handle.close();
  }
  try {
    await assertWebmDecodable(outputPath);
  } catch (error) {
    throw normalizeWebmValidationError(error);
  }
}

export function normalizeWebmValidationError(error) {
  if (error == null) {
    return createWebglOutputInvalidError(
      "Falha desconhecida ao validar o WebM exportado.",
    );
  }
  const code = error.code;
  if (
    code === "WEBGL_OUTPUT_INVALID" ||
    // Infrastructure failures (missing binary, spawn errors) carry actionable
    // codes and must not be disguised as corrupt WebM output; disguising them
    // would also make auto GPU mode rerender in software for nothing.
    code === FFMPEG_MISSING_CODE ||
    code === FFMPEG_PROCESS_FAILED_CODE
  ) {
    return error;
  }
  return createWebglOutputInvalidError(error.message, error);
}

function createWebglOutputInvalidError(message, cause = null) {
  const error = new Error(message);
  error.code = "WEBGL_OUTPUT_INVALID";
  if (cause) error.cause = cause;
  return error;
}

export function assertWebmDecodeReport(stderr) {
  if (
    /File ended prematurely|EBML header parsing failed|Invalid data found/i.test(
      stderr,
    )
  ) {
    throw createWebglOutputInvalidError(
      "Cena exportou um WebM truncado ou invalido.",
    );
  }
}

export const minCapturedFrameRatio = 0.95;

export function evaluateFrameCaptureCount({
  expectedFrames,
  capturedFrames,
  minRatio = minCapturedFrameRatio,
}) {
  const expected = Math.max(0, Math.floor(Number(expectedFrames) || 0));
  const captured = Math.max(0, Math.floor(Number(capturedFrames) || 0));
  if (!expected) return { ok: true, ratio: 1 };
  const ratio = captured / expected;
  return { ok: ratio >= minRatio, ratio: Number(ratio.toFixed(4)) };
}

export function countWebmVideoFrames(outputPath, runner = spawnSync) {
  const ffmpegPath = resolveFfmpegPath();
  const result = runner(
    ffmpegPath,
    ["-hide_banner", "-i", outputPath, "-map", "0:v:0", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true },
  );
  if (result.error) {
    const normalized = normalizeFfmpegSpawnError(result.error, ffmpegPath);
    normalized.code ??= FFMPEG_PROCESS_FAILED_CODE;
    throw normalized;
  }
  const stderr = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assertWebmDecodeReport(stderr);
  if (result.status !== 0) {
    throw createWebglOutputInvalidError(
      `Cena WebM não pode ser decodificada: ${stderr.slice(-1200)}`,
    );
  }
  const matches = [...stderr.matchAll(/frame=\s*(\d+)/gu)];
  if (!matches.length) {
    throw createWebglOutputInvalidError(
      "Contagem de frames do WebM intermediário indisponível.",
    );
  }
  return Number(matches.at(-1)[1]);
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
    child.on("error", (error) => {
      const normalized = normalizeFfmpegSpawnError(error, ffmpegPath);
      normalized.code ??= FFMPEG_PROCESS_FAILED_CODE;
      reject(normalized);
    });
    child.on("close", (code) => {
      try {
        assertWebmDecodeReport(stderr);
        if (code !== 0) {
          throw createWebglOutputInvalidError(
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
