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

// Keys that describe WHERE the text block sits (vs. how it looks). Used to copy
// only the position or only the style across the batch, so applying one track's
// look to the rest no longer forces its placement (or vice-versa).
export const TEXT_POSITION_KEYS = ["x", "y", "align", "verticalAnchor"];

function pickKeys(source, keys) {
  const picked = {};
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) {
      picked[key] = source[key];
    }
  }
  return picked;
}

export function applySelectedTextSettingsToBatch(
  tracks,
  selectedTrackId,
  clone = cloneValue,
  mode = "all",
) {
  const source = tracks.find((track) => track.id === selectedTrackId);
  if (!source) return tracks;
  const template = source.textSettings;
  return tracks.map((track) => {
    if (!track.selectedForBatch) return track;
    return {
      ...track,
      textSettings: mergeTextSettingsByMode(
        track.textSettings,
        template,
        mode,
        clone,
      ),
    };
  });
}

export function mergeTextSettingsByMode(
  current,
  template,
  mode = "all",
  clone = cloneValue,
) {
  if (mode === "position") {
    // Keep the current typography; overwrite only placement.
    return {
      ...clone(current),
      ...pickKeys(template, TEXT_POSITION_KEYS),
    };
  }
  if (mode === "style") {
    // Adopt the template look but preserve the current placement.
    return {
      ...clone(template),
      ...pickKeys(current, TEXT_POSITION_KEYS),
    };
  }
  return clone(template);
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
