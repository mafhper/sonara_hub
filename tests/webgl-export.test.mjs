import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWebmDecodeReport,
  buildRendererHtml,
  describeSceneRenderError,
} from "../server/webgl-export.mjs";

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
  assert.match(html, /await delay\(captureFrameDelayMs\)/);
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
    /WebM truncado/,
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
