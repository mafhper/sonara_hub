import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPublicationClipDuration,
  publicationAssetPresetById,
  publicationAssetPresets,
  sanitizePublicationFilePart,
} from "../shared/publication-assets.mjs";

test("publication presets cover social images and short clips", () => {
  assert.equal(publicationAssetPresets.length, 8);
  assert.equal(publicationAssetPresetById("youtube-thumbnail").width, 1280);
  assert.equal(publicationAssetPresetById("soundcloud-banner").height, 520);
  assert.equal(publicationAssetPresetById("clip-vertical").kind, "clip");
});

test("publication clip duration is clamped to 1-30 seconds", () => {
  assert.equal(clampPublicationClipDuration(-5), 1);
  assert.equal(clampPublicationClipDuration(12), 12);
  assert.equal(clampPublicationClipDuration(120), 30);
  assert.equal(clampPublicationClipDuration("x"), 15);
});

test("publication file parts are safe for local output", () => {
  assert.equal(
    sanitizePublicationFilePart('Album: "Nothing" / 2026'),
    "Album-Nothing-2026",
  );
});
