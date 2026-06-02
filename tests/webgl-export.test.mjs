import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWebmDecodeReport,
  buildRendererHtml,
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
