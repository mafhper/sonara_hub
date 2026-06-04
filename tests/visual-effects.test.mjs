import assert from "node:assert/strict";
import test from "node:test";
import {
  builtinVisualPresets,
  effectIds,
  normalizeVisualSettings,
  parseVisualCollection,
  removedEffectIds,
} from "../shared/visual-effects.mjs";

const expectedIds = [
  "liquid-mesh",
  "volumetric-clouds",
  "aurora-ribbons",
  "vector-aura",
  "playful-shapes",
  "color-mesh",
  "piano-ribbons",
  "vinyl",
  "audio-dark",
  "plasma-nebula",
  "plasma-lava",
  "vortex-whirlpool",
  "vortex-galaxy",
  "starfield",
];

test("catalog exposes the broad families plus the ported shader presets", () => {
  assert.deepEqual(effectIds, expectedIds);
  assert.deepEqual(
    builtinVisualPresets.map((preset) => preset.id),
    expectedIds,
  );
  assert.ok(removedEffectIds.includes("fire"));
  assert.ok(removedEffectIds.includes("rain-window"));
  assert.equal(new Set(expectedIds).size, builtinVisualPresets.length);
});

test("ported shader presets normalize and share fullscreen renderers", () => {
  const plasma = normalizeVisualSettings({ rendererId: "plasma-nebula" });
  assert.equal(plasma.rendererId, "plasma");
  assert.equal(plasma.id, "plasma-nebula");
  assert.equal(plasma.category, "Shaders");
  assert.deepEqual(
    plasma.controls.map((entry) => entry.key),
    ["scale", "complexity", "saturation", "glow"],
  );
  assert.equal(plasma.advanced.complexity, 60);

  const plasmaLava = normalizeVisualSettings({ rendererId: "plasma-lava" });
  assert.equal(plasmaLava.rendererId, "plasma");
  assert.equal(plasmaLava.colors.base, "#dc2626");

  const vortex = normalizeVisualSettings({ rendererId: "vortex-galaxy" });
  assert.equal(vortex.rendererId, "vortex");
  assert.deepEqual(
    vortex.controls.map((entry) => entry.key),
    ["arms", "twist", "zoom", "glow"],
  );
  assert.equal(vortex.advanced.arms, 57);
});

test("normalizing a real shader preset object preserves its renderer and advanced params", () => {
  // The actual builtin objects (and any saved scene) carry id !== rendererId for
  // shader presets — id "plasma-nebula", rendererId "plasma". Normalizing must
  // resolve the base by id and keep the renderer/advanced shape, otherwise the
  // export silently collapses every shader scene back to liquid-mesh.
  for (const preset of builtinVisualPresets) {
    const normalized = normalizeVisualSettings(preset);
    assert.equal(
      normalized.rendererId,
      preset.rendererId,
      `renderer changed for ${preset.id}`,
    );
    assert.deepEqual(
      Object.keys(normalized.advanced),
      Object.keys(preset.advanced),
      `advanced keys changed for ${preset.id}`,
    );
  }
});

test("legacy visual fields normalize into the V4 contract", () => {
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

  assert.equal(visual.schemaVersion, 4);
  assert.equal(visual.rendererId, "liquid-mesh");
  assert.equal(visual.common.intensity, 75);
  assert.equal(visual.common.direction, 360);
  assert.equal(visual.colors.light, "#ffd36b");
  assert.equal(visual.waveform.visible, false);
  assert.equal(visual.waveform.type, "mirror-line");
});

test("V3 presets normalize into V4 playful and cloud-light defaults", () => {
  const visual = normalizeVisualSettings({
    schemaVersion: 3,
    rendererId: "playful-shapes",
  });
  const clouds = normalizeVisualSettings({
    schemaVersion: 3,
    rendererId: "volumetric-clouds",
  });

  assert.equal(visual.schemaVersion, 4);
  assert.equal(visual.playful.motionMode, "soft-rhythm");
  assert.equal(visual.playful.enabled.emojis, true);
  assert.equal(clouds.cloudLight.enabled, false);
  assert.equal(clouds.cloudLight.intensity, 54);
});

test("playful collections sanitize separators, duplicates and unsafe size", () => {
  assert.deepEqual(
    parseVisualCollection(
      "A, B; A\nPALAVRA-MUITO-LONGA C D E F G H I J K L M N",
      "X Y",
    ),
    ["A", "B", "PALAVRA-", "C", "D", "E", "F", "G", "H", "I", "J", "K"],
  );

  const visual = normalizeVisualSettings({
    rendererId: "playful-shapes",
    playful: {
      seed: 1000000,
      motionMode: "not-real",
      enabled: {
        rectangles: false,
        letters: false,
        numbers: false,
        emojis: false,
      },
      collections: {
        letters: "",
        numbers: "1, 2, 2, 3",
        emojis: "☀️, 🎈, 🌱",
      },
    },
  });

  assert.equal(visual.playful.seed, 999999);
  assert.equal(visual.playful.motionMode, "soft-rhythm");
  assert.equal(visual.playful.enabled.rectangles, true);
  assert.equal(visual.playful.collections.letters, "A B C D E");
  assert.equal(visual.playful.collections.numbers, "1 2 3");
  assert.equal(visual.playful.collections.emojis, "☀️ 🎈 🌱");
});

test("cloud sun focus normalizes into safe bounds", () => {
  const visual = normalizeVisualSettings({
    rendererId: "volumetric-clouds",
    cloudLight: {
      enabled: true,
      intensity: 160,
      color: "#ffe0a3",
      x: -10,
      y: 130,
      radius: 2,
      diffusion: 72,
      motion: 120,
      speed: 44,
      direction: 725,
    },
  });

  assert.deepEqual(visual.cloudLight, {
    enabled: true,
    intensity: 100,
    color: "#ffe0a3",
    x: 0,
    y: 100,
    radius: 8,
    diffusion: 72,
    motion: 100,
    speed: 44,
    direction: 360,
  });
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
      colorMode: "bands",
      secondaryColor: "invalid",
      tertiaryColor: "#f2b870",
      advanced: {
        barGap: 120,
        barPeakHold: 140,
        barPeakDecay: -10,
        radialRadius: -5,
        radialGlow: 120,
      },
    },
  });

  assert.equal(visual.waveform.visible, true);
  assert.equal(visual.waveform.schemaVersion, 2);
  assert.equal(visual.waveform.type, "spectrum-bars");
  assert.equal(visual.waveform.thickness, 6);
  assert.equal(visual.waveform.smoothing, 0);
  assert.equal(visual.waveform.width, 100);
  assert.equal(visual.waveform.audioReaction, 0);
  assert.equal(visual.waveform.colorMode, "bands");
  assert.match(visual.waveform.secondaryColor, /^#[0-9a-f]{6}$/i);
  assert.equal(visual.waveform.tertiaryColor, "#f2b870");
  assert.equal(visual.waveform.advanced.barGap, 100);
  assert.equal(visual.waveform.advanced.barPeakHold, 100);
  assert.equal(visual.waveform.advanced.barPeakDecay, 0);
  assert.equal(visual.waveform.advanced.radialRadius, 0);
  assert.equal(visual.waveform.advanced.radialGlow, 100);
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
