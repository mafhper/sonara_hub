import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCoverSeriesMetaStylePatch,
  applyCoverSeriesScopePatch,
  applySelectedTextSettingsToBatch,
  clearCoverSeriesScopeOverride,
  mergeTextSettingsByMode,
  resolveAlbumArtwork,
  resolveCoverSeriesSettings,
  resolveEffectiveComposition,
  resolveTrackArtwork,
} from "../shared/composition-scope.mjs";
import { normalizeVisualSettings } from "../shared/visual-effects.mjs";

const sharedCover = { id: "shared-cover" };
const suggestedCover = { id: "track-cover" };
const albumCover = { id: "album-cover" };
const coverOverride = { id: "manual-track-cover" };

test("artwork resolver keeps album cover, per-track cover and disabled cover scopes separate", () => {
  const track = {
    suggestedCover,
    albumCoverSuggestion: albumCover,
    useSuggestedCover: true,
  };

  assert.equal(resolveTrackArtwork(track, sharedCover), sharedCover);
  assert.equal(resolveAlbumArtwork(track, sharedCover), sharedCover);
  assert.equal(
    resolveTrackArtwork({ ...track, coverOverride }, sharedCover),
    coverOverride,
  );
  assert.equal(resolveTrackArtwork(track, null), suggestedCover);
  assert.equal(resolveAlbumArtwork(track, null), albumCover);

  const disabled = { ...track, useSuggestedCover: false };
  assert.equal(resolveTrackArtwork(disabled, null), null);
  assert.equal(resolveAlbumArtwork(disabled, null), null);
});

test("current cover-series scope forks only the selected track from its effective settings", () => {
  const defaults = { enabled: true, x: 30, y: 40, color: "#ffffff" };
  const tracks = [
    { id: "a", coverSeriesOverride: null },
    { id: "b", coverSeriesOverride: { enabled: true, x: 70, y: 40 } },
  ];

  const result = applyCoverSeriesScopePatch(
    tracks,
    defaults,
    { x: 55 },
    {
      scope: "current",
      trackId: "a",
    },
  );

  assert.deepEqual(result.coverSeriesSettings, defaults);
  assert.deepEqual(result.tracks[0].coverSeriesOverride, {
    enabled: true,
    x: 55,
    y: 40,
    color: "#ffffff",
  });
  assert.equal(result.tracks[1], tracks[1]);
  assert.deepEqual(resolveCoverSeriesSettings(result.tracks[0], defaults), {
    enabled: true,
    x: 55,
    y: 40,
    color: "#ffffff",
  });
});

test("all cover-series scope updates defaults and keeps existing overrides in sync", () => {
  const defaults = { enabled: true, x: 30, y: 40, color: "#ffffff" };
  const tracks = [
    { id: "a", coverSeriesOverride: null },
    { id: "b", coverSeriesOverride: { enabled: true, x: 70, y: 40 } },
  ];

  const result = applyCoverSeriesScopePatch(
    tracks,
    defaults,
    { y: 64 },
    {
      scope: "all",
    },
  );

  assert.deepEqual(result.coverSeriesSettings, {
    enabled: true,
    x: 30,
    y: 64,
    color: "#ffffff",
  });
  assert.equal(result.tracks[0], tracks[0]);
  assert.deepEqual(result.tracks[1].coverSeriesOverride, {
    enabled: true,
    x: 70,
    y: 64,
  });
});

test("cover-series override can be cleared without touching other tracks", () => {
  const tracks = [
    { id: "a", coverSeriesOverride: { x: 10 } },
    { id: "b", coverSeriesOverride: { x: 20 } },
  ];

  const next = clearCoverSeriesScopeOverride(tracks, "a");

  assert.deepEqual(next[0], { id: "a", coverSeriesOverride: null });
  assert.equal(next[1], tracks[1]);
});

test("cover-series meta style patch targets one field or every complementary text", () => {
  const settings = {
    metaStyles: {
      title: { fontWeight: 720, color: "#ffffff" },
      album: { fontWeight: 560, color: "#cccccc" },
      artist: { fontWeight: 620, color: "#aaaaaa" },
    },
  };

  const titleOnly = applyCoverSeriesMetaStylePatch(
    settings,
    "title",
    { color: "#ffcc00" },
    { target: "field" },
  );

  assert.deepEqual(titleOnly.metaStyles.title, {
    fontWeight: 720,
    color: "#ffcc00",
  });
  assert.equal(titleOnly.metaStyles.album, settings.metaStyles.album);
  assert.equal(titleOnly.metaStyles.artist, settings.metaStyles.artist);

  const allFields = applyCoverSeriesMetaStylePatch(
    settings,
    "title",
    { fontWeight: 800 },
    { target: "all" },
  );

  assert.deepEqual(
    Object.values(allFields.metaStyles).map((style) => style.fontWeight),
    [800, 800, 800],
  );
  assert.equal(allFields.metaStyles.title.color, "#ffffff");
  assert.equal(allFields.metaStyles.album.color, "#cccccc");
});

test("selected text settings apply only to selected batch targets and are cloned", () => {
  const sourceText = { fields: { title: true }, order: ["title"] };
  const tracks = [
    { id: "source", selectedForBatch: true, textSettings: sourceText },
    { id: "target", selectedForBatch: true, textSettings: { order: [] } },
    { id: "other", selectedForBatch: false, textSettings: { order: [] } },
  ];

  const next = applySelectedTextSettingsToBatch(tracks, "source");

  assert.notEqual(next[0].textSettings, sourceText);
  assert.deepEqual(next[0].textSettings, sourceText);
  assert.notEqual(next[1].textSettings, sourceText);
  assert.deepEqual(next[1].textSettings, sourceText);
  assert.equal(next[2], tracks[2]);

  next[1].textSettings.fields.title = false;
  assert.equal(next[0].textSettings.fields.title, true);
});

test("position-only batch apply copies placement but keeps each track's style", () => {
  const sourceText = {
    x: 50,
    y: 80,
    align: "center",
    verticalAnchor: "bottom",
    fontSize: 54,
    order: ["title", "artist"],
    fieldStyles: { title: { color: "#fff" } },
  };
  const targetText = {
    x: 5,
    y: 7,
    align: "left",
    verticalAnchor: "top",
    fontSize: 28,
    order: ["title"],
    fieldStyles: { title: { color: "#000" } },
  };
  const tracks = [
    { id: "source", selectedForBatch: true, textSettings: sourceText },
    { id: "target", selectedForBatch: true, textSettings: targetText },
  ];

  const next = applySelectedTextSettingsToBatch(
    tracks,
    "source",
    undefined,
    "position",
  );

  // Placement copied from the source.
  assert.equal(next[1].textSettings.x, 50);
  assert.equal(next[1].textSettings.y, 80);
  assert.equal(next[1].textSettings.align, "center");
  assert.equal(next[1].textSettings.verticalAnchor, "bottom");
  // Style left untouched.
  assert.equal(next[1].textSettings.fontSize, 28);
  assert.deepEqual(next[1].textSettings.order, ["title"]);
  assert.equal(next[1].textSettings.fieldStyles.title.color, "#000");
});

test("style-only batch apply copies look but preserves each track's position", () => {
  const sourceText = {
    x: 50,
    y: 80,
    align: "center",
    verticalAnchor: "bottom",
    fontSize: 54,
    order: ["title", "artist"],
    fieldStyles: { title: { color: "#fff" } },
  };
  const targetText = {
    x: 5,
    y: 7,
    align: "left",
    verticalAnchor: "top",
    fontSize: 28,
    order: ["title"],
    fieldStyles: { title: { color: "#000" } },
  };
  const tracks = [
    { id: "source", selectedForBatch: true, textSettings: sourceText },
    { id: "target", selectedForBatch: true, textSettings: targetText },
  ];

  const next = applySelectedTextSettingsToBatch(
    tracks,
    "source",
    undefined,
    "style",
  );

  // Style copied from the source (and cloned).
  assert.equal(next[1].textSettings.fontSize, 54);
  assert.deepEqual(next[1].textSettings.order, ["title", "artist"]);
  assert.equal(next[1].textSettings.fieldStyles.title.color, "#fff");
  assert.notEqual(next[1].textSettings.fieldStyles, sourceText.fieldStyles);
  // Position preserved from the target.
  assert.equal(next[1].textSettings.x, 5);
  assert.equal(next[1].textSettings.y, 7);
  assert.equal(next[1].textSettings.align, "left");
  assert.equal(next[1].textSettings.verticalAnchor, "top");
});

test("default batch apply mode still clones the full source settings", () => {
  const sourceText = {
    x: 50,
    align: "center",
    fontSize: 54,
    order: ["title"],
    fieldStyles: { title: { color: "#fff" } },
  };
  const tracks = [
    { id: "source", selectedForBatch: true, textSettings: sourceText },
    {
      id: "target",
      selectedForBatch: true,
      textSettings: { x: 5, order: [] },
    },
  ];

  const next = applySelectedTextSettingsToBatch(
    tracks,
    "source",
    undefined,
    "all",
  );

  assert.deepEqual(next[1].textSettings, sourceText);
  assert.notEqual(next[1].textSettings, sourceText);
  assert.notEqual(next[1].textSettings.fieldStyles, sourceText.fieldStyles);
});

test("mergeTextSettingsByMode supports selective text profile application", () => {
  const current = {
    x: 5,
    y: 7,
    align: "left",
    verticalAnchor: "top",
    fontSize: 28,
    order: ["title"],
    fieldStyles: { title: { color: "#000" } },
  };
  const template = {
    x: 50,
    y: 80,
    align: "center",
    verticalAnchor: "bottom",
    fontSize: 54,
    order: ["title", "artist"],
    fieldStyles: { title: { color: "#fff" } },
  };

  const position = mergeTextSettingsByMode(current, template, "position");
  assert.equal(position.x, 50);
  assert.equal(position.y, 80);
  assert.equal(position.fontSize, 28);
  assert.equal(position.fieldStyles.title.color, "#000");

  const style = mergeTextSettingsByMode(current, template, "style");
  assert.equal(style.x, 5);
  assert.equal(style.y, 7);
  assert.equal(style.fontSize, 54);
  assert.equal(style.fieldStyles.title.color, "#fff");
  assert.notEqual(style.fieldStyles, template.fieldStyles);
});

test("effective composition reads scene/text/layers/metadata from the track and resolves cover", () => {
  const track = {
    scene: { id: "scene" },
    textSettings: { order: ["title"] },
    layers: [{ id: "l1" }],
    metadata: { title: "T" },
    suggestedCover,
    useSuggestedCover: true,
  };

  const comp = resolveEffectiveComposition(track, {
    sharedCover: null,
    showMetadata: true,
  });

  // Preview and export must read the exact same per-track objects.
  assert.equal(comp.scene, track.scene);
  assert.equal(comp.textSettings, track.textSettings);
  assert.equal(comp.layers, track.layers);
  assert.equal(comp.metadata, track.metadata);
  assert.equal(comp.cover, suggestedCover);
  assert.equal(comp.showMetadata, true);
});

test("effective composition carries stacked atmosphere scene unchanged", () => {
  const scene = normalizeVisualSettings({
    id: "liquid-mesh",
    atmosphereLayers: [
      { scene: { id: "liquid-mesh" } },
      {
        scene: { id: "volumetric-clouds" },
        opacity: 55,
        blendMode: "screen",
      },
    ],
  });
  const track = {
    scene,
    textSettings: { order: [] },
    layers: [],
    metadata: { title: "Stacked" },
  };

  const comp = resolveEffectiveComposition(track, {});

  assert.equal(comp.scene, scene);
  assert.equal(comp.scene.atmosphereLayers.length, 2);
  assert.equal(comp.scene.atmosphereLayers[1].blendMode, "screen");
});

test("effective composition prefers the shared cover and honors a disabled cover", () => {
  const track = { suggestedCover, useSuggestedCover: true };
  assert.equal(
    resolveEffectiveComposition(track, { sharedCover }).cover,
    sharedCover,
  );
  assert.equal(
    resolveEffectiveComposition({ ...track, useSuggestedCover: false }, {})
      .cover,
    null,
  );
});

test("effective composition falls back to provided defaults when track or fields are missing", () => {
  const fallbacks = {
    scene: { id: "base" },
    textSettings: { order: [] },
    metadata: { title: "" },
    layers: [],
  };

  const comp = resolveEffectiveComposition(null, { fallbacks });
  assert.equal(comp.scene, fallbacks.scene);
  assert.equal(comp.textSettings, fallbacks.textSettings);
  assert.equal(comp.metadata, fallbacks.metadata);
  assert.deepEqual(comp.layers, []);
  assert.equal(comp.cover, null);
  // showMetadata defaults to false when not provided.
  assert.equal(comp.showMetadata, false);
});
