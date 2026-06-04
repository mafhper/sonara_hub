import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCoverSeriesScopePatch,
  applySelectedTextSettingsToBatch,
  clearCoverSeriesScopeOverride,
  resolveAlbumArtwork,
  resolveCoverSeriesSettings,
  resolveEffectiveComposition,
  resolveTrackArtwork,
} from "../shared/composition-scope.mjs";

const sharedCover = { id: "shared-cover" };
const suggestedCover = { id: "track-cover" };
const albumCover = { id: "album-cover" };

test("artwork resolver keeps album cover, per-track cover and disabled cover scopes separate", () => {
  const track = {
    suggestedCover,
    albumCoverSuggestion: albumCover,
    useSuggestedCover: true,
  };

  assert.equal(resolveTrackArtwork(track, sharedCover), sharedCover);
  assert.equal(resolveAlbumArtwork(track, sharedCover), sharedCover);
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
