# Playful Visual Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three child-friendly ambient scenes, an optional cloud sun focus,
contextual controls, export parity, and an experience-oriented README.

**Architecture:** Extend the shared visual catalog to V4 while normalizing V3
input. Use WebGL for continuous fields and deterministic Canvas2D for large
decorative elements. Keep preview, thumbnails, and export on the same runtime.

**Tech Stack:** React, TypeScript, Canvas2D, WebGL, Chromium canvas capture,
Playwright, Node test runner, Vite.

---

### Task 1: Visual Contract V4

**Files:**

- Modify: `shared/visual-effects.mjs`
- Modify: `shared/visual-effects.d.mts`
- Modify: `tests/visual-effects.test.mjs`
- Modify: `tests/preset-store.test.mjs`

- [ ] Add failing tests for nine catalog entries, V3-to-V4 normalization,
      playful content normalization, custom collection limits, and cloud light
      clamping.
- [ ] Run `node --test tests/visual-effects.test.mjs tests/preset-store.test.mjs`
      and confirm the new assertions fail.
- [ ] Emit schema version `4`, add `playful-shapes`, `color-mesh`, and
      `piano-ribbons`, and normalize semantic settings:

```js
const playfulDefaults = {
  seed: 37,
  motionMode: "soft-rhythm",
  enabled: { rectangles: true, letters: true, numbers: true, emojis: true },
  collections: { letters: "A B C", numbers: "1 2 3 4 5", emojis: "☀️ 🎈 🌱" },
};

const cloudLightDefaults = {
  enabled: false,
  intensity: 54,
  x: 28,
  y: 24,
  radius: 32,
  diffusion: 68,
};
```

- [ ] Add a collection parser that splits on spaces, commas, semicolons, or
      line breaks; removes duplicates; limits each item to eight code points; and
      limits each collection to twelve items.
- [ ] Run the targeted tests and commit the contract.

### Task 2: Shared Renderers

**Files:**

- Modify: `shared/canvas-scene-runtime.mjs`
- Modify: `tests/render-presets-smoke.mjs`

- [ ] Add the `color-mesh` shader and dedicated cloud light uniforms:

```glsl
uniform float u_cloudSunEnabled;
uniform float u_cloudSunIntensity;
uniform float u_cloudSunX;
uniform float u_cloudSunY;
uniform float u_cloudSunRadius;
uniform float u_cloudSunDiffusion;
```

- [ ] Add deterministic Canvas2D renderers:

```js
if (scene.rendererId === "playful-shapes") {
  drawPlayfulShapes(context, width, height, scene, audio, time);
} else if (scene.rendererId === "piano-ribbons") {
  drawPianoRibbons(context, width, height, scene, audio, time);
}
```

- [ ] Build playful elements from a seeded hash. Cap element count, use large
      shapes, and map depth to scale, opacity, and motion speed.
- [ ] Use native emoji with a neutral fallback and no render exceptions.
- [ ] Extend render smoke coverage for all nine presets plus custom playful
      content and clouds with sun.
- [ ] Run `npm run test:render` and commit the runtime.

### Task 3: Contextual Inspector

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `tests/ui-smoke.mjs`

- [ ] Add failing UI smoke assertions for the new preset options and contextual
      sections.
- [ ] Add update helpers:

```ts
function updatePlayful(patch: Partial<PlayfulContent>) {
  updateScene(normalizeVisualSettings({ ...selectedScene, playful: patch }));
}

function updateCloudLight(patch: Partial<CloudLightSettings>) {
  updateScene(normalizeVisualSettings({ ...selectedScene, cloudLight: patch }));
}
```

- [ ] In `VisualInspector`, show `Conteúdo lúdico` only for `playful-shapes`.
      Render motion mode, category toggles, collections, seed, and reset action.
- [ ] Show `Foco solar` only for `volumetric-clouds`, with toggle and sliders.
- [ ] Add curated child-friendly palette buttons without introducing nested
      cards.
- [ ] Run `npm run type-check`, `npm run build`, and `npm run test:ui`. Commit
      the inspector.

### Task 4: README and Development Guide

**Files:**

- Modify: `README.md`
- Create: `docs/development.md`
- Modify: `docs/release-test-bench.md`

- [ ] Rewrite the README around the end-user journey and keep setup concise.
- [ ] Move long validation, release, and supply-chain notes to
      `docs/development.md`.
- [ ] Update the release bench from six to nine render families and add playful
      and cloud-light exploratory cases.
- [ ] Run `npm run format:check` and commit documentation.

### Task 5: Release Validation

**Files:**

- Review: all modified files

- [ ] Run:

```powershell
npm run format:check
npm run type-check
npm test
npm run build
npm run test:ui
npm run test:render
npm run site:build
```

- [ ] Run `git diff --check` and review `git status --short`.
- [ ] Confirm `.dev/`, `.superpowers/`, `outputs/`, `dist/`, and private files
      are absent from the diff.
- [ ] Push the completed branch only after all gates pass.
