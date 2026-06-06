import test from "node:test";
import assert from "node:assert/strict";
import {
  effectiveLayerOpacity,
  effectiveTextOpacity,
} from "../shared/canvas-scene-runtime.mjs";

test("cover layer fade-out is proportional to video duration", () => {
  const layer = {
    opacity: 80,
    coverFadeOut: { enabled: true, endPercent: 25 },
  };

  assert.equal(effectiveLayerOpacity(layer, 0, 20), 0.8);
  assert.equal(effectiveLayerOpacity(layer, 14.9, 20), 0.8);
  assert.equal(effectiveLayerOpacity(layer, 17.5, 20), 0.4);
  assert.equal(effectiveLayerOpacity(layer, 20, 20), 0);
  assert.equal(effectiveLayerOpacity(layer, 24, 20), 0);
});

test("text fade-out runs during the final configured percentage", () => {
  const textStyle = {
    opacity: 60,
    fadeOut: { enabled: true, endPercent: 50 },
  };
  const coverLayer = {
    opacity: 90,
    coverFadeOut: { enabled: true, endPercent: 25 },
  };

  assert.equal(effectiveTextOpacity(textStyle, 4.9, 10), 0.6);
  assert.equal(effectiveTextOpacity(textStyle, 7.5, 10), 0.3);
  assert.equal(effectiveLayerOpacity(coverLayer, 7.5, 10), 0.9);
  assert.equal(effectiveLayerOpacity(coverLayer, 8.75, 10), 0.45);
});

test("timed fade-out starts at a configured video percentage", () => {
  const layer = {
    opacity: 80,
    coverFadeOut: {
      enabled: true,
      mode: "timed",
      startPercent: 10,
      durationSeconds: 2,
      endPercent: 25,
    },
  };
  const textStyle = {
    opacity: 60,
    fadeOut: {
      enabled: true,
      mode: "timed",
      startPercent: 10,
      durationSeconds: 2,
      endPercent: 50,
    },
  };

  assert.equal(effectiveLayerOpacity(layer, 0.9, 10), 0.8);
  assert.equal(effectiveLayerOpacity(layer, 2, 10), 0.4);
  assert.equal(effectiveLayerOpacity(layer, 3, 10), 0);
  assert.equal(effectiveTextOpacity(textStyle, 2, 10), 0.3);
});

test("disabled fade preserves base opacity for layers and text", () => {
  assert.equal(effectiveLayerOpacity({ opacity: 42 }, 9, 10), 0.42);
  assert.equal(effectiveTextOpacity({ opacity: 73 }, 9, 10), 0.73);
});
