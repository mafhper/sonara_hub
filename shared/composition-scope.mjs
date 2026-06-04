export function resolveTrackArtwork(track, sharedCover = null) {
  if (sharedCover) return sharedCover;
  if (track?.useSuggestedCover === false) return null;
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

function cloneValue(value) {
  return value == null ? value : structuredClone(value);
}
