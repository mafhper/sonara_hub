import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createPresetStore,
  PresetStoreError,
} from "../server/preset-store.mjs";

test("custom preset store persists a duplicated V3 atmosphere", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-hub-"));
  const store = createPresetStore(path.join(directory, "presets.json"));
  const created = await store.create({
    name: "Fluxo editorial",
    rendererId: "liquid-mesh",
    colors: { base: "#101010", effect: "#404850", light: "#d0d6db" },
  });

  assert.equal(created.source, "custom");
  assert.equal(created.rendererId, "liquid-mesh");
  assert.match(created.id, /^custom-/);
  assert.equal((await store.list()).length, 1);
});

test("custom preset store rejects builtin identifiers and removed renderers", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-hub-"));
  const store = createPresetStore(path.join(directory, "presets.json"));

  await assert.rejects(
    () => store.update("liquid-mesh", { name: "Nao permitido" }),
    (error) =>
      error instanceof PresetStoreError &&
      error.code === "CUSTOM_PRESET_NOT_FOUND",
  );
  await assert.rejects(
    () => store.create({ name: "Legado", rendererId: "fire" }),
    (error) =>
      error instanceof PresetStoreError && error.code === "INVALID_RENDERER_ID",
  );
});

test("custom preset store drops legacy particle presets while reading", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-hub-"));
  const filePath = path.join(directory, "presets.json");
  await fs.writeFile(
    filePath,
    JSON.stringify([
      { id: "custom-old", source: "custom", baseEffectId: "space" },
    ]),
  );

  assert.deepEqual(await createPresetStore(filePath).list(), []);
});
