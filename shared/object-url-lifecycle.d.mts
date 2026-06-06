type ObjectUrlSource = {
  src?: string | null;
};

type TrackObjectUrlSource = {
  albumCoverSuggestion?: ObjectUrlSource | null;
  artworkOptions?: ObjectUrlSource[];
  coverOverride?: ObjectUrlSource | null;
  layers?: ObjectUrlSource[];
  sourceUrl?: string | null;
  suggestedCover?: ObjectUrlSource | null;
};

export function collectActiveObjectUrls(
  tracks?: TrackObjectUrlSource[],
  cover?: ObjectUrlSource | null,
  layersUndo?: { layers?: ObjectUrlSource[] } | null,
): Set<string>;

export function diffObjectUrls(
  previous?: Iterable<string>,
  next?: Iterable<string>,
): string[];
