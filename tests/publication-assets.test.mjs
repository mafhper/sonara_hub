import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ffmpegPath from "ffmpeg-static";
import { renderPublicationAssetJob } from "../server/render-job-core.mjs";
import {
  applyPublicationTextOverride,
  clampPublicationClipDuration,
  clampPublicationClipDurationForPreset,
  clampPublicationTextOffset,
  clampPublicationTextScale,
  normalizePublicationAssetOverrides,
  normalizePublicationBookletTheme,
  publicationConstraintSummary,
  publicationBookletThemeById,
  publicationBookletThemes,
  publicationAssetSettingsForPreset,
  publicationAssetPresetById,
  publicationAssetPresets,
  publicationLyricsTextForSettings,
  sanitizePublicationFilePart,
} from "../shared/publication-assets.mjs";

test("publication presets cover social images and short clips", () => {
  assert.equal(publicationAssetPresets.length, 18);
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
  assert.equal(
    publicationAssetPresetById("instagram-story-clip").maxDurationSeconds,
    15,
  );
  assert.equal(
    publicationAssetPresetById("youtube-shorts").platform,
    "YouTube",
  );
  assert.equal(
    publicationAssetPresetById("tiktok-vertical").platform,
    "TikTok",
  );
  assert.equal(
    publicationAssetPresetById("digital-booklet-editorial").kind,
    "booklet",
  );
  assert.equal(
    publicationAssetPresetById("digital-booklet-profile").extension,
    "html",
  );
});

test("publication booklet themes are normalized for static HTML", () => {
  assert.equal(publicationBookletThemes.length, 3);
  assert.equal(normalizePublicationBookletTheme("studio"), "studio");
  assert.equal(normalizePublicationBookletTheme("missing"), "midnight");
  assert.equal(publicationBookletThemeById("contrast").label, "Alto contraste");
});

test("publication text scale and offset are clamped", () => {
  assert.equal(clampPublicationTextScale(0.1), 0.5);
  assert.equal(clampPublicationTextScale(5), 2);
  assert.equal(clampPublicationTextScale(1.25), 1.25);
  assert.equal(clampPublicationTextScale("x"), 1);
  assert.equal(clampPublicationTextOffset(-200), -40);
  assert.equal(clampPublicationTextOffset(200), 40);
  assert.equal(clampPublicationTextOffset(12.6), 13);
  assert.equal(clampPublicationTextOffset("x"), 0);
});

test("publication asset settings expose text override defaults", () => {
  const settings = publicationAssetSettingsForPreset("youtube-thumbnail");
  assert.equal(settings.textScale, 1);
  assert.equal(settings.textOffsetX, 0);
  assert.equal(settings.textOffsetY, 0);
  assert.equal(settings.hideText, false);
});

test("publication text override scales, offsets, and hides text", () => {
  const base = {
    fields: { title: true, artist: true, album: false },
    fontSize: 40,
    fieldStyles: { title: { fontSize: 60 }, artist: { fontSize: 30 } },
    x: 50,
    y: 90,
  };
  const scaled = applyPublicationTextOverride(base, {
    textScale: 1.5,
    textOffsetX: 10,
    textOffsetY: 20,
  });
  assert.equal(scaled.fontSize, 60);
  assert.equal(scaled.fieldStyles.title.fontSize, 90);
  assert.equal(scaled.x, 60);
  assert.equal(scaled.y, 100); // clamped at 100
  // original is untouched (pure)
  assert.equal(base.fontSize, 40);
  assert.equal(base.x, 50);

  const hidden = applyPublicationTextOverride(base, { hideText: true });
  assert.deepEqual(hidden.fields, {
    title: false,
    artist: false,
    album: false,
  });

  // no-op override returns the same reference
  assert.equal(applyPublicationTextOverride(base, {}), base);
});

test("publication clip duration is clamped globally and by preset", () => {
  assert.equal(clampPublicationClipDuration(-5), 1);
  assert.equal(clampPublicationClipDuration(12), 12);
  assert.equal(clampPublicationClipDuration(120), 120);
  assert.equal(clampPublicationClipDuration(900), 600);
  assert.equal(clampPublicationClipDuration("x"), 15);
  assert.equal(
    clampPublicationClipDurationForPreset(120, "instagram-story-clip"),
    15,
  );
  assert.equal(
    clampPublicationClipDurationForPreset(120, "instagram-reel"),
    90,
  );
  assert.equal(
    clampPublicationClipDurationForPreset(120, "youtube-shorts"),
    60,
  );
});

test("publication constraint summaries describe platform limits", () => {
  assert.equal(
    publicationConstraintSummary("whatsapp-status-clip"),
    "até 30s · até 10 MB · H.264/AAC · 9:16",
  );
  assert.equal(
    publicationConstraintSummary("youtube-thumbnail"),
    "JPEG · 16:9",
  );
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
        bookletTheme: "contrast",
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
        bookletTheme: "contrast",
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
      textScale: 1,
      textOffsetX: 0,
      textOffsetY: 0,
      hideText: false,
      lyricsPosition: "bottom",
      lyricsStyle: "minimal",
      bookletTheme: "midnight",
    },
  );
  assert.equal(
    publicationAssetSettingsForPreset(
      "instagram-story-clip",
      { clipDuration: 120 },
      {},
    ).clipDuration,
    15,
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
      textScale: 1,
      textOffsetX: 0,
      textOffsetY: 0,
      hideText: false,
      lyricsPosition: "bottom",
      lyricsStyle: "minimal",
      bookletTheme: "midnight",
    },
  );
});

test("publication booklet settings inherit preset theme and accept overrides", () => {
  assert.equal(
    publicationAssetSettingsForPreset("digital-booklet-profile").bookletTheme,
    "studio",
  );
  assert.equal(
    publicationAssetSettingsForPreset(
      "digital-booklet-profile",
      {},
      { "digital-booklet-profile": { bookletTheme: "contrast" } },
    ).bookletTheme,
    "contrast",
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
      textScale: 1,
      textOffsetX: 0,
      textOffsetY: 0,
      hideText: false,
      lyricsPosition: "bottom",
      lyricsStyle: "minimal",
      bookletTheme: "midnight",
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

test("publication booklet job writes static HTML, manifest, and size validation", async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "sonara-booklet-test-"),
  );
  try {
    const audioPath = path.join(tempDir, "audio.mp3");
    createSyntheticAudio(audioPath);
    const outputName = "booklet-test.html";
    const outputPath = path.join(tempDir, outputName);
    const updates = [];
    const preset = {
      ...publicationAssetPresetById("digital-booklet-editorial"),
      constraints: { maxFileSizeBytes: 1 },
    };
    await renderPublicationAssetJob({
      jobId: "booklet-test",
      audioPath,
      backgroundFile: null,
      mediaLayerFiles: [],
      coverFile: null,
      settings: {
        qualityProfile: "fast",
        renderMode: "single",
        showMetadata: true,
        compositionSettings: {
          durationSeconds: 1,
          mediaLayers: [],
          textSettings: {},
        },
      },
      metadata: {
        title: "Abertura",
        artist: "Sonara",
        album: "Caderno de Campo",
        albumArtist: "Sonara",
        year: "2026",
        genre: "Podcast",
        language: "pt-BR",
        description: "Notas do episódio",
        tags: "podcast, bastidores",
        lyrics: "[Intro]\nLinha removida\nLinha final",
        useEmbeddedCover: false,
      },
      preset,
      clipStart: 0,
      clipDuration: 15,
      includeFullLyrics: false,
      lyricsMode: "excerpt",
      lyricsExcerpt: "[Intro]\nLinha final",
      lyricsHideTags: true,
      lyricsLineSpacing: 160,
      lyricsPosition: "bottom",
      lyricsStyle: "minimal",
      bookletTheme: "contrast",
      generateDataFiles: true,
      outputPath,
      outputName,
      workDir: tempDir,
      updateJob: (_jobId, patch) => updates.push(patch),
      shouldCancel: () => false,
    });
    const html = await fs.readFile(outputPath, "utf8");
    assert.match(html, /Caderno de Campo/);
    assert.match(html, /Notas do episódio/);
    assert.match(html, /Linha final/);
    assert.doesNotMatch(html, /\[Intro\]/);

    const manifest = JSON.parse(
      await fs.readFile(`${outputPath}.manifest.json`, "utf8"),
    );
    const outputStat = await fs.stat(outputPath);
    assert.equal(manifest.preset.kind, "booklet");
    assert.equal(manifest.files[0].path, `encartes/${outputName}`);
    assert.equal(manifest.files[0].sizeBytes, outputStat.size);
    assert.equal(manifest.validation.fileSize.actualBytes, outputStat.size);
    assert.equal(manifest.validation.fileSize.maxBytes, 1);
    assert.equal(manifest.validation.fileSize.status, "exceeded");
    assert.equal(manifest.validation.warnings.length, 1);
    assert.equal(manifest.theme.id, "contrast");
    const markdown = await fs.readFile(`${outputPath}.manifest.md`, "utf8");
    assert.match(markdown, /Tamanho final:/);
    assert.match(markdown, /Limite de tamanho: 1 B \(excedido\)/);
    assert.match(markdown, /Alerta: Tamanho final acima do limite/);
    assert.equal(updates.at(-1).status, "done");
    assert.equal(
      updates.at(-1).publicationValidation.fileSize.status,
      "exceeded",
    );
    assert.equal(updates.at(-1).warnings.length, 1);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

function createSyntheticAudio(filePath) {
  const result = spawnSync(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=220:duration=1",
      "-c:a",
      "libmp3lame",
      filePath,
    ],
    { windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.toString() || "ffmpeg audio fixture failed");
  }
}
