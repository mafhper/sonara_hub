type TrackArtworkScope<TArtwork> = {
  suggestedCover?: TArtwork | null;
  coverOverride?: TArtwork | null;
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

export function applyCoverSeriesMetaStylePatch<
  TSettings extends { metaStyles?: Record<string, unknown> },
  TKey extends keyof NonNullable<TSettings["metaStyles"]> & string,
  TStyle extends NonNullable<TSettings["metaStyles"]>[TKey],
>(
  settings: TSettings,
  key: TKey,
  patch: Partial<TStyle>,
  options?: { target?: "field" | "all" },
): TSettings;

export function applySelectedTextSettingsToBatch<
  TTextSettings,
  TTrack extends TextScopedTrack<TTextSettings>,
>(
  tracks: TTrack[],
  selectedTrackId: string,
  clone?: (settings: TTextSettings) => TTextSettings,
): TTrack[];

type EffectiveCompositionTrack<TScene, TText, TLayer, TMeta, TArtwork> =
  TrackArtworkScope<TArtwork> & {
    scene?: TScene | null;
    textSettings?: TText | null;
    layers?: TLayer[];
    metadata?: TMeta | null;
  };

export function resolveEffectiveComposition<
  TScene,
  TText,
  TLayer,
  TMeta,
  TArtwork,
>(
  track:
    | EffectiveCompositionTrack<TScene, TText, TLayer, TMeta, TArtwork>
    | null
    | undefined,
  context?: {
    sharedCover?: TArtwork | null;
    showMetadata?: boolean;
    fallbacks?: {
      scene?: TScene | null;
      textSettings?: TText | null;
      layers?: TLayer[];
      metadata?: TMeta | null;
    };
  },
): {
  scene: TScene | null;
  textSettings: TText | null;
  layers: TLayer[];
  metadata: TMeta | null;
  cover: TArtwork | null;
  showMetadata: boolean;
};
