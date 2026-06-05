export function resolveTrackArtwork(track, sharedCover = null) {
  if (track?.useSuggestedCover === false) return null;
  if (track?.coverOverride) return track.coverOverride;
  if (sharedCover) return sharedCover;
  return track?.suggestedCover ?? null;
}

export function resolveAlbumArtwork(track, sharedCover = null) {
  if (sharedCover) return sharedCover;
  if (track?.useSuggestedCover === false) return null;
  return track?.albumCoverSuggestion ?? track?.suggestedCover ?? null;
}

export function resolveCoverSeriesSettings(track, coverSeriesSettings) {
  return track?.coverSeriesOverride ?? coverSeriesSettings;
}

export function applyCoverSeriesScopePatch(
  tracks,
  coverSeriesSettings,
  patch,
  { scope, trackId } = {},
) {
  if (scope === "current" && trackId) {
    return {
      coverSeriesSettings,
      tracks: tracks.map((track) =>
        track.id === trackId
          ? {
              ...track,
              coverSeriesOverride: {
                ...resolveCoverSeriesSettings(track, coverSeriesSettings),
                ...patch,
              },
            }
          : track,
      ),
    };
  }

  return {
    coverSeriesSettings: { ...coverSeriesSettings, ...patch },
    tracks: tracks.map((track) =>
      track.coverSeriesOverride
        ? {
            ...track,
            coverSeriesOverride: { ...track.coverSeriesOverride, ...patch },
          }
        : track,
    ),
  };
}

export function clearCoverSeriesScopeOverride(tracks, trackId) {
  return tracks.map((track) =>
    track.id === trackId ? { ...track, coverSeriesOverride: null } : track,
  );
}

export function applyCoverSeriesMetaStylePatch(
  settings,
  key,
  patch,
  { target = "field" } = {},
) {
  const metaStyles = settings?.metaStyles ?? {};
  if (!metaStyles[key]) return settings;
  const entries =
    target === "all"
      ? Object.keys(metaStyles)
      : Object.keys(metaStyles).filter((item) => item === key);
  return {
    ...settings,
    metaStyles: {
      ...metaStyles,
      ...Object.fromEntries(
        entries.map((entry) => [
          entry,
          {
            ...metaStyles[entry],
            ...patch,
          },
        ]),
      ),
    },
  };
}

export function applySelectedTextSettingsToBatch(
  tracks,
  selectedTrackId,
  clone = cloneValue,
) {
  const source = tracks.find((track) => track.id === selectedTrackId);
  if (!source) return tracks;
  const template = clone(source.textSettings);
  return tracks.map((track) =>
    track.selectedForBatch
      ? { ...track, textSettings: clone(template) }
      : track,
  );
}

// Single source of truth for the composition a track contributes to a render.
// Both the live preview and the export payload derive from this, so the scene,
// text, layers, metadata and cover they show/encode can never drift apart (the
// #13 class of preview/export divergence). Consumers adapt the returned cover
// object as needed (preview reads `.src`, export reads `.file`). `fallbacks`
// covers the UI's no-track-selected state; the export path always passes a real
// track so its fallbacks stay unused.
export function resolveEffectiveComposition(track, context = {}) {
  const { sharedCover = null, showMetadata = false, fallbacks = {} } = context;
  return {
    scene: track?.scene ?? fallbacks.scene ?? null,
    textSettings: track?.textSettings ?? fallbacks.textSettings ?? null,
    layers: track?.layers ?? fallbacks.layers ?? [],
    metadata: track?.metadata ?? fallbacks.metadata ?? null,
    cover: resolveTrackArtwork(track, sharedCover),
    showMetadata: Boolean(showMetadata),
  };
}

function cloneValue(value) {
  return value == null ? value : structuredClone(value);
}
