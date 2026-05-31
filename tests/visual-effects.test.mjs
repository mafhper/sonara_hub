import assert from "node:assert/strict";
import test from "node:test";
import {
  builtinVisualPresets,
  effectIds,
  normalizeVisualSettings,
  removedEffectIds,
} from "../shared/visual-effects.mjs";

const expectedIds = [
  "liquid-mesh",
  "volumetric-clouds",
  "aurora-ribbons",
  "vector-aura",
  "vinyl",
  "audio-dark",
];

test("catalog exposes six broad visual families without particle presets", () => {
  assert.deepEqual(effectIds, expectedIds);
  assert.deepEqual(
    builtinVisualPresets.map((preset) => preset.id),
    expectedIds,
  );
  assert.ok(removedEffectIds.includes("fire"));
  assert.ok(removedEffectIds.includes("rain-window"));
  assert.equal(new Set(expectedIds).size, builtinVisualPresets.length);
});

test("legacy visual fields normalize into the V3 contract", () => {
  const visual = normalizeVisualSettings({
    effect: "fire",
    intensity: "75",
    speed: "35",
    brightness: "60",
    direction: "450",
    colorA: "#120706",
    colorB: "#d94f1a",
    accentColor: "#ffd36b",
  });

  assert.equal(visual.schemaVersion, 3);
  assert.equal(visual.rendererId, "liquid-mesh");
  assert.equal(visual.common.intensity, 75);
  assert.equal(visual.common.direction, 360);
  assert.equal(visual.colors.light, "#ffd36b");
  assert.equal(visual.waveform.visible, false);
  assert.equal(visual.waveform.type, "mirror-line");
});

test("waveform fields normalize into the V2 catalog with safe constraints", () => {
  const visual = normalizeVisualSettings({
    rendererId: "aurora-ribbons",
    waveform: {
      visible: true,
      type: "spectrum-bars",
      thickness: 72,
      smoothing: -2,
      width: 160,
      audioReaction: -4,
      advanced: { barGap: 120, radialRadius: -5 },
    },
  });

  assert.equal(visual.waveform.visible, true);
  assert.equal(visual.waveform.schemaVersion, 2);
  assert.equal(visual.waveform.type, "spectrum-bars");
  assert.equal(visual.waveform.thickness, 6);
  assert.equal(visual.waveform.smoothing, 0);
  assert.equal(visual.waveform.width, 100);
  assert.equal(visual.waveform.audioReaction, 0);
  assert.equal(visual.waveform.advanced.barGap, 100);
  assert.equal(visual.waveform.advanced.radialRadius, 0);
});

test("unknown waveform styles fall back to the legacy mirrored line", () => {
  const visual = normalizeVisualSettings({
    waveform: { type: "particle-cloud" },
  });

  assert.equal(visual.waveform.type, "mirror-line");
});

test("unknown renderers fall back to liquid mesh and invalid colors use defaults", () => {
  const visual = normalizeVisualSettings({
    rendererId: "not-real",
    colors: { base: "red" },
  });

  assert.equal(visual.rendererId, "liquid-mesh");
  assert.match(visual.colors.base, /^#[0-9a-f]{6}$/i);
});
