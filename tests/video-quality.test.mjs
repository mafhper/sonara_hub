import assert from "node:assert/strict";
import test from "node:test";
import { validateVideoAudioAnalysis } from "../server/video-quality.mjs";

test("video quality blocks an AAC export with confirmed overload", () => {
  assert.throws(
    () => validateVideoAudioAnalysis({ risk: "overload", truePeakDbtp: 1.05 }),
    /AAC final excedeu/,
  );
});

test("video quality allows reduced headroom but preserves the warning", () => {
  assert.doesNotThrow(() =>
    validateVideoAudioAnalysis({
      risk: "reduced-headroom",
      truePeakDbtp: -0.78,
    }),
  );
});
