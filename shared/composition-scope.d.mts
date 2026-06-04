type TrackArtworkScope<TArtwork> = {
  suggestedCover?: TArtwork | null;
  albumCoverSuggestion?: TArtwork | null;
  useSuggestedCover?: boolean;
};

type CoverSeriesScopedTrack<TSettings> = {
  id: string;
  coverSeriesOverride?: TSettings | null;
};

type TextScopedTrack<TTextSettings> = {
  id: string;
  selectedForBatch?: boolean;
  textSettings: TTextSettings;
};

export function resolveTrackArtwork<TArtwork>(
  track?: TrackArtworkScope<TArtwork> | null,
  sharedCover?: TArtwork | null,
): TArtwork | null;

export function resolveAlbumArtwork<TArtwork>(
  track?: TrackArtworkScope<TArtwork> | null,
  sharedCover?: TArtwork | null,
): TArtwork | null;

export function resolveCoverSeriesSettings<TSettings>(
  track: CoverSeriesScopedTrack<TSettings> | null | undefined,
  coverSeriesSettings: TSettings,
): TSettings;

export function applyCoverSeriesScopePatch<
  TSettings,
  TTrack extends CoverSeriesScopedTrack<TSettings>,
>(
  tracks: TTrack[],
  coverSeriesSettings: TSettings,
  patch: Partial<TSettings>,
  options?: { scope?: "all" | "current"; trackId?: string },
): { tracks: TTrack[]; coverSeriesSettings: TSettings };

export function clearCoverSeriesScopeOverride<
  TSettings,
  TTrack extends CoverSeriesScopedTrack<TSettings>,
>(tracks: TTrack[], trackId: string): TTrack[];

export function applySelectedTextSettingsToBatch<
  TTextSettings,
  TTrack extends TextScopedTrack<TTextSettings>,
>(
  tracks: TTrack[],
  selectedTrackId: string,
  clone?: (settings: TTextSettings) => TTextSettings,
): TTrack[];
