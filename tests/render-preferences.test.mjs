import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyRenderPreferencesToEnvironment,
  describeRenderPreferenceSources,
  loadRenderPreferences,
  normalizeRenderPreferences,
  renderPreferenceEnvironmentKeys,
  saveRenderPreferences,
} from "../server/render-preferences.mjs";

test("render preferences default to empty overrides and drop unknown values", () => {
  assert.deepEqual(normalizeRenderPreferences(null), {
    gpuMode: "",
    capturePacing: "",
    encoderMode: "",
    updatedAt: "",
  });
  const normalized = normalizeRenderPreferences({
    gpuMode: "HARDWARE",
    capturePacing: " adaptive ",
    encoderMode: "turbo",
    extra: "ignored",
  });
  assert.equal(normalized.gpuMode, "hardware");
  assert.equal(normalized.capturePacing, "adaptive");
  assert.equal(normalized.encoderMode, "");
});

test("render preferences round-trip through a JSON file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "render-prefs-"));
  const filePath = path.join(directory, "render-preferences.local.json");
  try {
    assert.deepEqual(await loadRenderPreferences(filePath), {
      gpuMode: "",
      capturePacing: "",
      encoderMode: "",
      updatedAt: "",
    });

    const saved = await saveRenderPreferences(filePath, {
      gpuMode: "hardware",
      capturePacing: "adaptive",
    });
    assert.ok(saved.updatedAt);
    const persisted = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(persisted.gpuMode, "hardware");

    const loaded = await loadRenderPreferences(filePath);
    assert.equal(loaded.gpuMode, "hardware");
    assert.equal(loaded.capturePacing, "adaptive");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("saved preferences override the environment and clearing restores it", () => {
  const env = { SONARA_GPU_MODE: "software" };
  applyRenderPreferencesToEnvironment(
    normalizeRenderPreferences({ gpuMode: "hardware" }),
    env,
  );
  assert.equal(env.SONARA_GPU_MODE, "hardware");

  // Clearing the preference hands control back to the original environment.
  applyRenderPreferencesToEnvironment(normalizeRenderPreferences({}), env);
  assert.equal(env.SONARA_GPU_MODE, "software");

  const fresh = {};
  applyRenderPreferencesToEnvironment(
    normalizeRenderPreferences({ capturePacing: "adaptive" }),
    fresh,
  );
  assert.equal(fresh.SONARA_CAPTURE_PACING, "adaptive");
  applyRenderPreferencesToEnvironment(normalizeRenderPreferences({}), fresh);
  assert.equal("SONARA_CAPTURE_PACING" in fresh, false);
  assert.deepEqual(Object.keys(renderPreferenceEnvironmentKeys).sort(), [
    "capturePacing",
    "encoderMode",
    "gpuMode",
  ]);
});

test("preference sources prefer saved values over environment over defaults", () => {
  const preferences = normalizeRenderPreferences({
    gpuMode: "auto",
    capturePacing: "",
    encoderMode: "",
  });
  const sources = describeRenderPreferenceSources(preferences, {
    SONARA_ENCODER_MODE: "hardware",
  });
  assert.deepEqual(sources, {
    gpuMode: "preference",
    capturePacing: "default",
    encoderMode: "environment",
  });
});
