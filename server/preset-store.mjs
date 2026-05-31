import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  builtinVisualPresets,
  effectIds,
  getBuiltinPreset,
  normalizeVisualSettings,
} from "../shared/visual-effects.mjs";

export class PresetStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createPresetStore(filePath) {
  return {
    async list() {
      return readPresets(filePath);
    },
    async listAll() {
      return [...builtinVisualPresets, ...(await readPresets(filePath))];
    },
    async create(input = {}) {
      const requestedId = input.rendererId ?? input.baseEffectId;
      if (!effectIds.includes(requestedId)) {
        throw new PresetStoreError(
          "INVALID_RENDERER_ID",
          "Familia visual nao permitida.",
        );
      }
      const base = getBuiltinPreset(requestedId);
      const visual = normalizeVisualSettings({
        ...base,
        ...input,
        source: "custom",
        rendererId: base.id,
      });
      const created = {
        ...visual,
        id: `custom-${slugify(input.name || base.name)}-${crypto.randomUUID().slice(0, 8)}`,
        name: String(input.name || `${base.name} personalizado`),
        source: "custom",
      };
      const presets = await readPresets(filePath);
      presets.push(created);
      await writePresets(filePath, presets);
      return created;
    },
    async update(id, input = {}) {
      if (input.rendererId && !effectIds.includes(input.rendererId)) {
        throw new PresetStoreError(
          "INVALID_RENDERER_ID",
          "Familia visual nao permitida.",
        );
      }
      const presets = await readPresets(filePath);
      const index = presets.findIndex((preset) => preset.id === id);
      if (index < 0) {
        throw new PresetStoreError(
          "CUSTOM_PRESET_NOT_FOUND",
          "Preset personalizado nao encontrado.",
        );
      }
      const current = presets[index];
      const next = normalizeVisualSettings({
        ...current,
        ...input,
        id: current.id,
        source: "custom",
      });
      presets[index] = {
        ...next,
        id: current.id,
        name: String(input.name ?? current.name),
        source: "custom",
      };
      await writePresets(filePath, presets);
      return presets[index];
    },
    async remove(id) {
      const presets = await readPresets(filePath);
      const next = presets.filter((preset) => preset.id !== id);
      if (next.length === presets.length) {
        throw new PresetStoreError(
          "CUSTOM_PRESET_NOT_FOUND",
          "Preset personalizado nao encontrado.",
        );
      }
      await writePresets(filePath, next);
    },
  };
}

async function readPresets(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((preset) => preset?.source === "custom")
      .filter((preset) =>
        effectIds.includes(preset.rendererId ?? preset.baseEffectId),
      )
      .map((preset) => ({
        ...normalizeVisualSettings(preset),
        id: String(preset.id),
        name: String(preset.name),
        source: "custom",
      }));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writePresets(filePath, presets) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(presets, null, 2), "utf8");
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 42);
}
