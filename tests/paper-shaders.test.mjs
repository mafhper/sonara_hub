import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  isPaperShaderRenderer,
  paperShaderDefinitions,
  paperShaderPresetConfigs,
  paperShaderPresetCount,
  resolvePaperShaderFrame,
} from "../shared/paper-shaders.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Paper Shaders inventory keeps all official shaders and examples", () => {
  assert.equal(paperShaderDefinitions.length, 29);
  assert.equal(paperShaderPresetConfigs.length, 29);
  assert.equal(paperShaderPresetCount, 120);
  assert.equal(
    new Set(paperShaderDefinitions.map((definition) => definition.rendererId))
      .size,
    29,
  );
});

test("Paper Shader runtime is fully vendored without external packages", async () => {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(root, "package.json"), "utf8"),
  );
  const packageLock = JSON.parse(
    await fs.readFile(path.join(root, "package-lock.json"), "utf8"),
  );
  const adapterSource = await fs.readFile(
    path.join(root, "shared", "paper-shaders.mjs"),
    "utf8",
  );

  assert.equal(packageJson.dependencies?.["@paper-design/shaders"], undefined);
  assert.equal(
    packageJson.devDependencies?.["@paper-design/shaders-react"],
    undefined,
  );
  assert.equal(
    Object.keys(packageLock.packages).some((key) =>
      key.startsWith("node_modules/@paper-design/"),
    ),
    false,
  );
  assert.doesNotMatch(adapterSource, /from\s+["']@paper-design\//u);
  assert.match(adapterSource, /from\s+["']\.\/paper-shader-sources\.mjs["']/u);
  await fs.access(path.join(root, "shared", "paper-shader-sources.mjs"));
});

test("Paper Shader presets default to zero music reaction", () => {
  for (const preset of paperShaderPresetConfigs) {
    assert.equal(preset.common.audioReaction, 0, preset.id);
  }
});

test("static Paper shaders are identified and grouped as simple effects", () => {
  const staticIds = paperShaderDefinitions
    .filter((definition) => definition.motion === "static")
    .map((definition) => definition.rendererId);

  assert.deepEqual(staticIds, [
    "paper-dot-grid",
    "paper-waves",
    "paper-static-mesh-gradient",
    "paper-static-radial-gradient",
    "paper-paper-texture",
    "paper-fluted-glass",
    "paper-image-dithering",
    "paper-halftone-dots",
    "paper-halftone-cmyk",
  ]);

  for (const preset of paperShaderPresetConfigs) {
    const definition = paperShaderDefinitions.find(
      (candidate) => candidate.rendererId === preset.rendererId,
    );
    assert.equal(
      preset.category,
      definition.motion === "static" ? "Efeitos simples" : definition.category,
      preset.id,
    );
  }
});

test("every Paper Shader resolves a deterministic frame payload", () => {
  for (const preset of paperShaderPresetConfigs) {
    const frame = resolvePaperShaderFrame(preset, { energy: 0.4 }, 2.5);
    assert.ok(frame, preset.id);
    assert.match(frame.fragmentShader, /^#version 300 es/u, preset.id);
    assert.equal(frame.textureColors.length, 3, preset.id);
    assert.ok(Number.isFinite(frame.time), preset.id);
    assert.ok(Object.keys(frame.uniforms).length > 8, preset.id);
  }
});

test("Paper Shader variants select the matching official preset", () => {
  const base = paperShaderPresetConfigs.find(
    (preset) => preset.id === "paper-mesh-gradient",
  );
  const original = resolvePaperShaderFrame(base, {}, 1);
  const ink = resolvePaperShaderFrame(
    {
      ...base,
      appliedVariantId: "ink",
      colors: base.variants.find((variant) => variant.id === "ink").colors,
      advanced: base.variants.find((variant) => variant.id === "ink").advanced,
    },
    {},
    1,
  );
  assert.notDeepEqual(original.textureColors, ink.textureColors);
  assert.notEqual(original.uniforms.u_rotation, ink.uniforms.u_rotation);
});

test("monochrome Paper variants preserve semantic contrast colors", () => {
  const preset = paperShaderPresetConfigs.find(
    (candidate) => candidate.id === "paper-voronoi",
  );
  const scene = {
    ...preset,
    appliedVariantId: "cells",
    colors: preset.variants.find((variant) => variant.id === "cells").colors,
    advanced: preset.variants.find((variant) => variant.id === "cells")
      .advanced,
  };
  const frame = resolvePaperShaderFrame(scene, {}, 1);
  assert.deepEqual(frame.uniforms.u_colorGap, [0, 0, 0, 1]);
  assert.deepEqual(frame.uniforms.u_colorGlow, [1, 1, 1, 1]);
});

test("Paper palettes preserve structural colors and source alpha", () => {
  const preset = paperShaderPresetConfigs.find(
    (candidate) => candidate.id === "paper-god-rays",
  );
  const variant = preset.variants.find(
    (candidate) => candidate.id === "linear",
  );
  const frame = resolvePaperShaderFrame(
    {
      ...preset,
      appliedVariantId: variant.id,
      colors: variant.colors,
      advanced: variant.advanced,
    },
    {},
    1,
  );
  assert.deepEqual(frame.uniforms.u_colorBack, [0, 0, 0, 1]);
  assert.equal(frame.uniforms.u_colors.length, 3);
  assert.ok(frame.uniforms.u_colors.every((color) => color[3] < 0.3));
});

test("Paper Shader renderer detection is namespaced", () => {
  assert.equal(isPaperShaderRenderer("paper-water"), true);
  assert.equal(isPaperShaderRenderer("water"), false);
  assert.equal(isPaperShaderRenderer("paper-unknown"), false);
});
