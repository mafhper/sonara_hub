import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPublicationClipDuration,
  publicationLyricsTextForSettings,
  normalizePublicationAssetOverrides,
  publicationAssetSettingsForPreset,
  publicationAssetPresetById,
  publicationAssetPresets,
  sanitizePublicationFilePart,
} from "../shared/publication-assets.mjs";

test("publication presets cover social images and short clips", () => {
  assert.equal(publicationAssetPresets.length, 13);
  assert.equal(publicationAssetPresetById("youtube-thumbnail").width, 1280);
  assert.equal(publicationAssetPresetById("soundcloud-banner").height, 520);
  assert.equal(publicationAssetPresetById("clip-vertical").kind, "clip");
  assert.equal(
    publicationAssetPresetById("instagram-feed").platform,
    "Instagram",
  );
  assert.equal(publicationAssetPresetById("instagram-story").kind, "image");
  assert.equal(publicationAssetPresetById("instagram-reel").kind, "clip");
  assert.equal(
    publicationAssetPresetById("whatsapp-status").platform,
    "WhatsApp",
  );
  assert.equal(publicationAssetPresetById("whatsapp-status-clip").kind, "clip");
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

test("publication asset overrides are normalized by known preset", () => {
  assert.deepEqual(
    normalizePublicationAssetOverrides({
      "clip-vertical": {
        clipStart: -2,
        clipDuration: 120,
        includeLyrics: 1,
        lyricsMode: "excerpt",
        lyricsExcerpt: "  first line\n\nsecond line  ",
        lyricsHideTags: true,
        lyricsLineSpacing: 280,
      },
      "unknown-preset": {
        clipStart: 10,
      },
    }),
    {
      "clip-vertical": {
        clipStart: 0,
        clipDuration: 30,
        includeLyrics: true,
        lyricsMode: "excerpt",
        lyricsExcerpt: "first line\n\nsecond line",
        lyricsHideTags: true,
        lyricsLineSpacing: 220,
      },
    },
  );
});

test("publication asset settings merge global defaults with per asset overrides", () => {
  const defaults = { clipStart: 4, clipDuration: 15, includeLyrics: false };
  const overrides = {
    "clip-square": {
      clipStart: 10,
      clipDuration: 2,
      includeLyrics: true,
      lyricsMode: "excerpt",
      lyricsExcerpt: "Edited hook",
      lyricsHideTags: true,
      lyricsLineSpacing: 155,
    },
  };
  assert.deepEqual(
    publicationAssetSettingsForPreset("clip-square", defaults, overrides),
    {
      clipStart: 10,
      clipDuration: 2,
      includeLyrics: true,
      lyricsMode: "excerpt",
      lyricsExcerpt: "Edited hook",
      lyricsHideTags: true,
      lyricsLineSpacing: 155,
    },
  );
  assert.deepEqual(
    publicationAssetSettingsForPreset("youtube-thumbnail", defaults, overrides),
    {
      clipStart: 4,
      clipDuration: 15,
      includeLyrics: false,
      lyricsMode: "none",
      lyricsExcerpt: "",
      lyricsHideTags: false,
      lyricsLineSpacing: 130,
    },
  );
});

test("publication asset settings keep legacy full lyrics semantics", () => {
  assert.deepEqual(
    publicationAssetSettingsForPreset(
      "youtube-thumbnail",
      { includeLyrics: true },
      {},
    ),
    {
      clipStart: 0,
      clipDuration: 15,
      includeLyrics: true,
      lyricsMode: "full",
      lyricsExcerpt: "",
      lyricsHideTags: false,
      lyricsLineSpacing: 130,
    },
  );
});

test("publication lyrics text can hide bracket tags", () => {
  const lyrics = "[Verso]\nQuando o relógio cansa\n[Refrão]\nA estrada canta";
  assert.equal(
    publicationLyricsTextForSettings(lyrics, {
      lyricsMode: "full",
      lyricsHideTags: true,
    }),
    "Quando o relógio cansa\nA estrada canta",
  );
  assert.equal(
    publicationLyricsTextForSettings(lyrics, {
      lyricsMode: "excerpt",
      lyricsExcerpt: "[Ponte]\nSó esse trecho",
      lyricsHideTags: false,
    }),
    "[Ponte]\nSó esse trecho",
  );
});
