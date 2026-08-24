import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { capturePacingModes, webglGpuModes } from "./webgl-export.mjs";
import { videoEncoderModes } from "./video-mux.mjs";

export const renderPreferenceEnvironmentKeys = Object.freeze({
  gpuMode: "SONARA_GPU_MODE",
  capturePacing: "SONARA_CAPTURE_PACING",
  encoderMode: "SONARA_ENCODER_MODE",
});

const allowedValuesByField = Object.freeze({
  gpuMode: webglGpuModes,
  capturePacing: capturePacingModes,
  encoderMode: videoEncoderModes,
});

export function normalizeRenderPreferences(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const preferences = {};
  for (const [field, allowed] of Object.entries(allowedValuesByField)) {
    const value = String(source[field] ?? "")
      .trim()
      .toLowerCase();
    preferences[field] = allowed.includes(value) ? value : "";
  }
  preferences.updatedAt =
    typeof source.updatedAt === "string" ? source.updatedAt : "";
  return preferences;
}

export async function loadRenderPreferences(filePath) {
  try {
    const raw = JSON.parse(await readFile(filePath, "utf8"));
    return normalizeRenderPreferences(raw);
  } catch {
    return normalizeRenderPreferences(null);
  }
}

export async function saveRenderPreferences(filePath, raw) {
  const preferences = normalizeRenderPreferences(raw);
  const payload = { ...preferences, updatedAt: new Date().toISOString() };
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, filePath);
  return payload;
}

const environmentOriginalsByTarget = new WeakMap();

// Saved preferences override the environment so the local settings modal wins
// over SONARA_* variables. Original values are remembered per environment
// object so clearing a preference hands control back to the environment (or
// built-in default).
export function applyRenderPreferencesToEnvironment(
  preferences,
  env = process.env,
) {
  let originals = environmentOriginalsByTarget.get(env);
  if (!originals) {
    originals = new Map();
    environmentOriginalsByTarget.set(env, originals);
  }
  for (const [name, original] of originals) {
    if (original === undefined) delete env[name];
    else env[name] = original;
  }
  originals.clear();
  for (const [field, name] of Object.entries(renderPreferenceEnvironmentKeys)) {
    const value = preferences[field];
    if (!value) continue;
    if (!originals.has(name)) {
      originals.set(name, env[name]);
    }
    env[name] = value;
  }
  return { ...preferences };
}

export function describeRenderPreferenceSources(
  preferences,
  env = process.env,
) {
  const sources = {};
  for (const [field, name] of Object.entries(renderPreferenceEnvironmentKeys)) {
    sources[field] = preferences[field]
      ? "preference"
      : String(env[name] ?? "").trim()
        ? "environment"
        : "default";
  }
  return sources;
}
