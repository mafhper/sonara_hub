import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWebmDecodeReport,
  buildRendererHtml,
  canReuseRenderSession,
  capturePacingModes,
  createWebglRenderSession,
  createGpuHardwareUnavailableError,
  describeSceneRenderError,
  evaluateFrameCaptureCount,
  countWebmVideoFrames,
  isHardwareWebglRenderer,
  isSoftwareWebglRenderer,
  minCapturedFrameRatio,
  normalizeGpuInfo,
  normalizeGpuMode,
  normalizeWebmValidationError,
  resolveCapturePacingMode,
  resolveGpuMode,
  serializeForInlineScript,
  webglGpuModes,
  webglLaunchArgs,
} from "../server/webgl-export.mjs";
import * as webglExport from "../server/webgl-export.mjs";

test("GPU mode defaults to software and honors explicit overrides", () => {
  assert.deepEqual(webglGpuModes, ["auto", "hardware", "software"]);
  assert.equal(normalizeGpuMode(undefined), "software");
  assert.equal(normalizeGpuMode("invalid"), "software");
  assert.equal(resolveGpuMode({}), "software");
  assert.equal(resolveGpuMode({ SONARA_GPU_MODE: "hardware" }), "hardware");
  assert.equal(resolveGpuMode({ SONARA_GPU_MODE: "auto" }), "auto");
  assert.equal(
    resolveGpuMode({ SONARA_GPU_MODE: "software", SONARA_FORCE_GPU: "1" }),
    "hardware",
  );
});

test("GPU launch profiles keep software fallback separate from hardware flags", () => {
  const software = webglLaunchArgs("software", "win32");
  const hardware = webglLaunchArgs("hardware", "win32");
  const auto = webglLaunchArgs("auto", "win32");

  assert.ok(software.includes("--enable-unsafe-swiftshader"));
  assert.equal(software.includes("--enable-gpu"), false);
  assert.ok(hardware.includes("--enable-gpu"));
  assert.ok(hardware.includes("--use-angle=d3d11"));
  // Required for headless captureStream: without it MediaRecorder emits a
  // silent, empty WebM even when WebGL renders on the dedicated GPU.
  assert.ok(hardware.includes("--disable-gpu-compositing"));
  assert.equal(hardware.includes("--enable-unsafe-swiftshader"), false);
  assert.deepEqual(auto, hardware);
});

test("GPU renderer diagnostics distinguish hardware from software", () => {
  const hardware = normalizeGpuInfo({
    available: true,
    vendor: "Google Inc.",
    renderer: "ANGLE (AMD, AMD Radeon RX 7600 Direct3D11)",
    version: "WebGL 1.0",
    webglVersion: "WebGL1",
  });
  const software = normalizeGpuInfo({
    available: true,
    vendor: "Google Inc.",
    renderer: "ANGLE (Google, Vulkan 1.3.0 SwiftShader Device)",
    version: "WebGL 1.0",
    webglVersion: "WebGL1",
  });

  assert.equal(isHardwareWebglRenderer(hardware), true);
  assert.equal(isSoftwareWebglRenderer(hardware), false);
  assert.equal(isHardwareWebglRenderer(software), false);
  assert.equal(isSoftwareWebglRenderer(software), true);
  assert.equal(isHardwareWebglRenderer({ available: false }), false);
  assert.throws(
    () => {
      throw createGpuHardwareUnavailableError(software);
    },
    (error) => {
      assert.equal(error.code, "GPU_HARDWARE_UNAVAILABLE");
      assert.match(error.message, /SwiftShader|renderer/i);
      assert.equal(error.details.gpuInfo.renderer, software.renderer);
      return true;
    },
  );
});

test("scene runtime is bundled into one import-free module for data URLs", async () => {
  assert.equal(typeof webglExport.bundleSceneRuntimeSource, "function");
  const source = await webglExport.bundleSceneRuntimeSource();
  assert.doesNotMatch(source, /^\s*import\s/mu);
  assert.match(source, /createPaperShaderRenderer/u);
  assert.match(source, /createSceneRuntime/u);
});

test("scene runtime requests the high-performance WebGL adapter", async () => {
  const source = await webglExport.bundleSceneRuntimeSource();
  assert.equal(
    (source.match(/powerPreference:\s*["']high-performance["']/gu) ?? [])
      .length >= 2,
    true,
  );
});

test("WebGL render session reuses and closes its browser", async () => {
  let launchCount = 0;
  let closeCount = 0;
  const browser = {
    isConnected: () => true,
    close: async () => {
      closeCount += 1;
    },
  };
  const session = createWebglRenderSession({
    launchBrowser: async () => {
      launchCount += 1;
      return browser;
    },
  });

  assert.equal(await session.getBrowser(), browser);
  assert.equal(await session.getBrowser(), browser);
  assert.equal(launchCount, 1);

  await session.close();
  await session.close();
  assert.equal(closeCount, 1);
  await assert.rejects(() => session.getBrowser(), /encerrada/i);
});

test("render sessions record their launch GPU mode", () => {
  const previous = process.env.SONARA_GPU_MODE;
  try {
    delete process.env.SONARA_GPU_MODE;
    const defaultSession = createWebglRenderSession({
      launchBrowser: async () => ({}),
    });
    assert.equal(defaultSession.mode, "software");

    process.env.SONARA_GPU_MODE = "hardware";
    const envSession = createWebglRenderSession({
      launchBrowser: async () => ({}),
    });
    assert.equal(envSession.mode, "hardware");
  } finally {
    if (previous === undefined) delete process.env.SONARA_GPU_MODE;
    else process.env.SONARA_GPU_MODE = previous;
  }

  const explicitSession = createWebglRenderSession({
    launchBrowser: async () => ({}),
    mode: "AUTO",
  });
  assert.equal(explicitSession.mode, "auto");
});

test("software retries never reuse auto/hardware sessions", () => {
  const sessionLike = { getBrowser: async () => ({}) };
  assert.equal(canReuseRenderSession(null, "software"), false);
  assert.equal(
    canReuseRenderSession({ ...sessionLike, mode: "software" }, "software"),
    true,
  );
  assert.equal(
    canReuseRenderSession({ ...sessionLike, mode: "auto" }, "software"),
    false,
  );
  assert.equal(
    canReuseRenderSession({ ...sessionLike, mode: "hardware" }, "software"),
    false,
  );
  // Duck-typed sessions without a recorded mode are treated conservatively.
  assert.equal(canReuseRenderSession(sessionLike, "software"), false);

  // Non-software requests may reuse any healthy session.
  assert.equal(
    canReuseRenderSession({ ...sessionLike, mode: "hardware" }, "hardware"),
    true,
  );
  assert.equal(
    canReuseRenderSession({ ...sessionLike, mode: "auto" }, "auto"),
    true,
  );
  assert.equal(
    canReuseRenderSession({ ...sessionLike, mode: "software" }, "auto"),
    true,
  );
});

test("WebM validation keeps infrastructure error codes actionable", () => {
  const invalid = Object.assign(new Error("truncated"), {
    code: "WEBGL_OUTPUT_INVALID",
  });
  assert.equal(normalizeWebmValidationError(invalid), invalid);

  const missing = Object.assign(
    new Error("FFMPEG_MISSING: ffmpeg não encontrado."),
    {
      code: "FFMPEG_MISSING",
    },
  );
  assert.equal(normalizeWebmValidationError(missing), missing);
  assert.equal(normalizeWebmValidationError(missing).code, "FFMPEG_MISSING");

  const processFailed = Object.assign(new Error("ffmpeg terminou"), {
    code: "FFMPEG_PROCESS_FAILED",
  });
  assert.equal(normalizeWebmValidationError(processFailed), processFailed);

  const generic = new Error("boom");
  const wrapped = normalizeWebmValidationError(generic);
  assert.equal(wrapped.code, "WEBGL_OUTPUT_INVALID");
  assert.equal(wrapped.cause, generic);

  const unknown = normalizeWebmValidationError(null);
  assert.equal(unknown.code, "WEBGL_OUTPUT_INVALID");
});

test("canvas exporter requests deterministic frames instead of relying on headless animation", () => {
  const html = buildRendererHtml({
    runtimeUrl: "data:text/javascript;base64,AA==",
    size: { width: 1280, height: 720 },
    scene: {},
    audioEnvelope: { frameRate: 12, frames: [] },
    composition: {},
  });

  assert.match(html, /canvas\.captureStream\(0\)/);
  assert.match(html, /track\.requestFrame\(\)/);
  assert.match(html, /runtime\.render\(time, fps\)/);
  assert.match(
    html,
    /const captureFrameDelayMs = Math\.min\(frameDuration, 32\)/,
  );
  assert.match(html, /const capturePacingAdaptive = false;/);
  assert.match(
    html,
    /const remainingDelayMs =\s*captureFrameDelayMs - \(performance\.now\(\) - renderStarted\)/,
  );
  assert.match(html, /await delay\(pacingWaitMs\)/);
  // O yield por frame é incondicional: sem ele o MediaRecorder perde frames
  // (ou emite WebM vazio) quando o draw consome o orçamento inteiro.
  assert.doesNotMatch(html, /if \(pacingWaitMs > 0\)/u);
  assert.match(html, /pacingMode: "legacy"/);
  assert.match(html, /targetDelayMs/);
  assert.match(html, /reportScenePhase/);
  assert.match(html, /media-recorder-start/);
  assert.match(html, /canvas-capture-start/);
  assert.match(html, /canvas-frame-loop-complete/);
  assert.match(html, /canvas-capture-complete/);
  assert.match(html, /renderMs/);
  assert.match(html, /requestFrameMs/);
  assert.match(html, /chunks-flush-complete/);
  assert.match(html, /chunkBytes/);
  assert.doesNotMatch(html, /requestAnimationFrame/);
});

test("capture pacing defaults to legacy and honors SONARA_CAPTURE_PACING", () => {
  assert.deepEqual(capturePacingModes, ["legacy", "adaptive"]);
  assert.equal(resolveCapturePacingMode({}), "legacy");
  assert.equal(
    resolveCapturePacingMode({ SONARA_CAPTURE_PACING: "adaptive" }),
    "adaptive",
  );
  assert.equal(
    resolveCapturePacingMode({ SONARA_CAPTURE_PACING: " ADAPTIVE " }),
    "adaptive",
  );
  assert.equal(
    resolveCapturePacingMode({ SONARA_CAPTURE_PACING: "turbo" }),
    "legacy",
  );
});

test("renderer HTML switches to adaptive frame pacing when requested", () => {
  const html = buildRendererHtml({
    runtimeUrl: "data:text/javascript;base64,AA==",
    size: { width: 1280, height: 720 },
    scene: {},
    audioEnvelope: { frameRate: 12, frames: [] },
    composition: {},
    pacingMode: "adaptive",
  });

  assert.match(html, /const capturePacingAdaptive = true;/);
  assert.match(html, /pacingMode: "adaptive"/);
});

test("renderer HTML keeps user metadata inside the module script", () => {
  const payload =
    "</script><script>globalThis.compromised = true</script>\u2028&";
  const html = buildRendererHtml({
    runtimeUrl: "data:text/javascript;base64,AA==",
    size: { width: 1280, height: 720 },
    scene: { title: payload },
    audioEnvelope: { frameRate: 12, frames: [] },
    composition: { metadata: payload },
  });

  assert.doesNotMatch(html, /<script>globalThis\.compromised/u);
  assert.match(html, /\\u003c\/script\\u003e/iu);
  assert.equal(JSON.parse(serializeForInlineScript(payload)), payload);
});

test("canvas exporter throttles per-frame progress bridge calls", () => {
  const html = buildRendererHtml({
    runtimeUrl: "data:text/javascript;base64,AA==",
    size: { width: 1280, height: 720 },
    scene: {},
    audioEnvelope: { frameRate: 12, frames: [] },
    composition: {},
  });

  assert.match(html, /let nextProgressReport = 4/);
  assert.match(
    html,
    /if \(progress >= nextProgressReport \|\| index === totalFrames - 1\)/,
  );
  assert.match(html, /window\.reportSceneProgress\(progress\)/);
  assert.match(html, /nextProgressReport = Math\.floor\(progress\) \+ 1/);
  assert.doesNotMatch(
    html,
    /window\.reportSceneProgress\(\(\(index \+ 1\) \/ totalFrames\) \* 88 \+ 4\)/,
  );
});

test("canvas exporter reuses interpolated audio frame buffers", () => {
  const html = buildRendererHtml({
    runtimeUrl: "data:text/javascript;base64,AA==",
    size: { width: 1280, height: 720 },
    scene: {},
    audioEnvelope: {
      frameRate: 12,
      frames: [
        { energy: 0, bass: 0, mid: 0, high: 0, samples: [0], spectrum: [0] },
        { energy: 1, bass: 1, mid: 1, high: 1, samples: [1], spectrum: [1] },
      ],
    },
    composition: {},
  });

  assert.match(html, /const audioSamples = \[\]/);
  assert.match(html, /const audioSpectrum = \[\]/);
  assert.match(html, /const audioFrame = \{/);
  assert.match(html, /samples: audioSamples/);
  assert.match(html, /spectrum: audioSpectrum/);
  assert.match(html, /function audioAt\(time\)/);
  assert.match(html, /function lerpArrayInto|const lerpArrayInto/);
  assert.match(html, /target\.length = length/);
  assert.match(html, /return audioFrame/);
  assert.doesNotMatch(html, /Array\.from\(\{ length \}/);
});

test("canvas exporter rejects a truncated WebM before mux", () => {
  assert.throws(
    () =>
      assertWebmDecodeReport(
        "[matroska,webm] File ended prematurely at pos. 10693997",
      ),
    (error) => {
      assert.equal(error.code, "WEBGL_OUTPUT_INVALID");
      assert.match(error.message, /WebM truncado/);
      return true;
    },
  );
  assert.doesNotThrow(() => assertWebmDecodeReport(""));
});

test("canvas exporter wraps WebGL context loss with copyable diagnostics", () => {
  const error = describeSceneRenderError(
    new Error("Falha ao compilar shader WebGL. Contexto perdido: true"),
    {
      diagnostics: ["pageerror: context lost"],
      fps: 12,
      scene: {
        id: "volumetric-clouds",
        name: "Nuvens amplas",
        rendererId: "volumetric-clouds",
      },
      size: { width: 1920, height: 1080 },
    },
  );

  assert.equal(error.code, "WEBGL_CONTEXT_LOST");
  assert.match(error.message, /WEBGL_CONTEXT_LOST/);
  assert.match(error.detail, /Preset: Nuvens amplas/);
  assert.match(error.detail, /Renderer: volumetric-clouds/);
  assert.match(error.detail, /1920x1080 @ 12 fps/);
});

test("frame capture evaluation fails only below the minimum ratio", () => {
  assert.equal(minCapturedFrameRatio, 0.95);
  assert.equal(
    evaluateFrameCaptureCount({ expectedFrames: 4650, capturedFrames: 4650 })
      .ok,
    true,
  );
  assert.equal(
    evaluateFrameCaptureCount({ expectedFrames: 1000, capturedFrames: 960 }).ok,
    true,
  );
  const failing = evaluateFrameCaptureCount({
    expectedFrames: 4650,
    capturedFrames: 2409,
  });
  assert.equal(failing.ok, false);
  assert.equal(failing.ratio, 0.5181);
  assert.equal(
    evaluateFrameCaptureCount({ expectedFrames: 0, capturedFrames: 0 }).ok,
    true,
  );
  assert.equal(
    evaluateFrameCaptureCount({ expectedFrames: 500, capturedFrames: "x" }).ok,
    false,
  );
});

test("webm frame counter parses the last progress frame count", () => {
  const stderr = [
    "frame= 120 fps=30 q=-0.0 size=N/A time=00:00:04.00 bitrate=N/A speed=1x",
    "frame= 2409 fps=31 q=-0.0 Lsize=N/A time=00:01:20.33 bitrate=N/A speed=1x",
  ].join("\n");
  let receivedArgs = null;
  const fakeRunner = (file, args) => {
    receivedArgs = { file, args };
    return { status: 0, stdout: "", stderr };
  };
  const frames = countWebmVideoFrames("clip.webm", fakeRunner);
  assert.equal(frames, 2409);
  assert.equal(receivedArgs.args.includes("-map"), true);

  assert.throws(
    () =>
      countWebmVideoFrames("clip.webm", () => ({
        status: 0,
        stdout: "",
        stderr: "sem contagem",
      })),
    /Contagem de frames/u,
  );

  assert.throws(
    () =>
      countWebmVideoFrames("clip.webm", () => ({
        status: 1,
        stdout: "",
        stderr: "Some error\nframe=   10\n",
      })),
    /pode ser decodificada/u,
  );
});
