import assert from "node:assert/strict";
import test from "node:test";

import {
  clampPublicationClipDuration,
  clampPublicationClipDurationForPreset,
  EXPORTER_MAX_DURATION_SECONDS,
  publicationAssetPresetById,
  publicationAssetSettingsForPreset,
  publicationPresetMaxDurationSeconds,
} from "../shared/publication-assets.mjs";

// Contrato de duração em publication assets (PR2 — duração configurável).
//
// Os presets de clip não impõem mais um teto rígido de duração. O único
// limitador é a capacidade operacional do exportador (1..600). Cada preset
// passa a ter um defaultDurationSeconds usado como fallback quando o usuário
// não informou uma duração.

test("capacidade global de duração (1..600) é preservada", () => {
  assert.equal(clampPublicationClipDuration(-5), 1);
  assert.equal(clampPublicationClipDuration(12), 12);
  assert.equal(clampPublicationClipDuration(120), 120);
  assert.equal(
    clampPublicationClipDuration(900),
    EXPORTER_MAX_DURATION_SECONDS,
  );
  assert.equal(clampPublicationClipDuration("x"), 15);
});

test("clamp por preset ignora o preset e usa a capacidade do exportador", () => {
  assert.equal(clampPublicationClipDurationForPreset(60, "clip-vertical"), 60);
  assert.equal(
    clampPublicationClipDurationForPreset(60, "instagram-story-clip"),
    60,
  );
  assert.equal(
    clampPublicationClipDurationForPreset(120, "instagram-reel"),
    120,
  );
  assert.equal(
    clampPublicationClipDurationForPreset(120, "youtube-shorts"),
    120,
  );
  assert.equal(
    clampPublicationClipDurationForPreset(700, "tiktok-vertical"),
    EXPORTER_MAX_DURATION_SECONDS,
  );
  assert.equal(
    clampPublicationClipDurationForPreset(700, "youtube-thumbnail"),
    EXPORTER_MAX_DURATION_SECONDS,
  );
});

test("publicationAssetSettingsForPreset preserva duração solicitada", () => {
  const settings = publicationAssetSettingsForPreset("clip-vertical", {
    clipDuration: 60,
  });
  assert.equal(settings.clipDuration, 60);
});

test("publicationAssetSettingsForPreset aplica defaultDurationSeconds como fallback", () => {
  const settings = publicationAssetSettingsForPreset("instagram-story-clip");
  assert.equal(settings.clipDuration, 15);
  const reel = publicationAssetSettingsForPreset("instagram-reel");
  assert.equal(reel.clipDuration, 30);
});

test("override por asset é re-clampado pela capacidade do exportador, não pelo preset", () => {
  const settings = publicationAssetSettingsForPreset(
    "clip-vertical",
    { clipDuration: 30 },
    { "clip-vertical": { clipDuration: 700 } },
  );
  assert.equal(settings.clipDuration, EXPORTER_MAX_DURATION_SECONDS);
});

test("troca de preset mantém duração solicitada dentro da capacidade do exportador", () => {
  const settings = publicationAssetSettingsForPreset("instagram-story-clip", {
    clipDuration: 90,
  });
  assert.equal(settings.clipDuration, 90);
});

test("presets de clip têm defaultDurationSeconds e ainda expõem recommendation em constraints", () => {
  const story = publicationAssetPresetById("instagram-story-clip");
  assert.equal(story.defaultDurationSeconds, 15);
  assert.equal(story.constraints.maxDurationSeconds, 15);
  assert.equal(publicationPresetMaxDurationSeconds("instagram-story-clip"), 15);
  const reel = publicationAssetPresetById("instagram-reel");
  assert.equal(reel.defaultDurationSeconds, 30);
  assert.equal(reel.constraints.maxDurationSeconds, 90);
});
