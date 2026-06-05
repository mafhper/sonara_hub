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
  assert.equal(effectiveLayerOpacity(layer, 2.5, 20), 0.4);
  assert.equal(effectiveLayerOpacity(layer, 5, 20), 0);
  assert.equal(effectiveLayerOpacity(layer, 10, 20), 0);
});

test("text fade-out is independent from cover fade-out", () => {
  const textStyle = {
    opacity: 60,
    fadeOut: { enabled: true, endPercent: 50 },
  };
  const coverLayer = {
    opacity: 90,
    coverFadeOut: { enabled: true, endPercent: 25 },
  };

  assert.equal(effectiveTextOpacity(textStyle, 2.5, 10), 0.3);
  assert.equal(effectiveLayerOpacity(coverLayer, 2.5, 10), 0);
});

test("disabled fade preserves base opacity for layers and text", () => {
  assert.equal(effectiveLayerOpacity({ opacity: 42 }, 9, 10), 0.42);
  assert.equal(effectiveTextOpacity({ opacity: 73 }, 9, 10), 0.73);
});
