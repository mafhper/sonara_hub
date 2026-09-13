import assert from "node:assert/strict";
import test from "node:test";

import {
  clampPublicationClipDuration,
  clampPublicationClipDurationForPreset,
  evaluatePublicationDurationPolicy,
  EXPORTER_MAX_DURATION_SECONDS,
  publicationAssetPresetById,
  publicationAssetSettingsForPreset,
  publicationPresetRecommendedDurationSeconds,
} from "../shared/publication-assets.mjs";

// Contrato de duração em publication assets (PR3 — semântica de perfil).
//
// Presets de clip possuem:
//   defaultDurationSeconds      — valor inicial sugerido pela aplicação;
//   recommendations.durationSeconds — preferência do perfil (aviso, não bloqueio);
//   constraints.duration        — reservado para limites bloqueantes (PR6+).
//
// A capacidade operacional do exportador (1..600) continua sendo o único
// limitador técnico de duração nesta sprint.

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

test("presets de clip separam default, recommendation e constraint de duração", () => {
  const story = publicationAssetPresetById("instagram-story-clip");
  assert.equal(story.defaultDurationSeconds, 15);
  assert.equal(story.recommendations?.durationSeconds, 15);
  assert.equal(story.constraints?.duration, undefined);
  assert.equal(
    publicationPresetRecommendedDurationSeconds("instagram-story-clip"),
    15,
  );

  const reel = publicationAssetPresetById("instagram-reel");
  assert.equal(reel.defaultDurationSeconds, 30);
  assert.equal(reel.recommendations?.durationSeconds, 90);
  assert.equal(reel.constraints?.duration, undefined);
  assert.equal(
    publicationPresetRecommendedDurationSeconds("instagram-reel"),
    90,
  );

  const shorts = publicationAssetPresetById("youtube-shorts");
  assert.equal(shorts.defaultDurationSeconds, 30);
  assert.equal(shorts.recommendations?.durationSeconds, 60);
  assert.equal(shorts.constraints?.duration, undefined);
});

test("presets de imagem não possuem recommendation de duração", () => {
  const thumb = publicationAssetPresetById("youtube-thumbnail");
  assert.equal(thumb.recommendations?.durationSeconds, undefined);
  assert.equal(
    publicationPresetRecommendedDurationSeconds("youtube-thumbnail"),
    null,
  );
});

test("evaluatePublicationDurationPolicy identifica recomendação excedida sem bloquear", () => {
  const policy = evaluatePublicationDurationPolicy("instagram-reel", 120);
  assert.equal(policy.requestedDurationSeconds, 120);
  assert.equal(policy.recommendedDurationSeconds, 90);
  assert.equal(policy.recommendationExceeded, true);
  assert.equal(policy.constraintExceeded, false);
  assert.equal(policy.blocking, false);
});

test("evaluatePublicationDurationPolicy não sinaliza warning quando duração está dentro da recomendação", () => {
  const policy = evaluatePublicationDurationPolicy("instagram-reel", 60);
  assert.equal(policy.recommendationExceeded, false);
  assert.equal(policy.blocking, false);
});

test("evaluatePublicationDurationPolicy respeita constraint bloqueante quando presente", () => {
  const preset = {
    ...publicationAssetPresetById("youtube-shorts"),
    constraints: {
      ...publicationAssetPresetById("youtube-shorts").constraints,
      duration: {
        mode: "maximum",
        valueSeconds: 60,
        enforcement: "blocking",
      },
    },
  };
  const ok = evaluatePublicationDurationPolicy(preset, 50);
  assert.equal(ok.constraintExceeded, false);
  assert.equal(ok.blocking, false);

  const exceeded = evaluatePublicationDurationPolicy(preset, 90);
  assert.equal(exceeded.constraintExceeded, true);
  assert.equal(exceeded.blocking, true);
});

test("evaluatePublicationDurationPolicy ignora durationConstraint sem valor", () => {
  const preset = {
    ...publicationAssetPresetById("clip-vertical"),
    constraints: {
      ...publicationAssetPresetById("clip-vertical").constraints,
      duration: { mode: "unrestricted" },
    },
  };
  const policy = evaluatePublicationDurationPolicy(preset, 300);
  assert.equal(policy.constraintExceeded, false);
  assert.equal(policy.blocking, false);
});
