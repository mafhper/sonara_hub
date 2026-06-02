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
  assert.match(html, /runtime\.render\(time\)/);
  assert.match(html, /await delay\(frameDuration\)/);
  assert.doesNotMatch(html, /requestAnimationFrame/);
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
