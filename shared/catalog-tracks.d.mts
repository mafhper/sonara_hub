export type CatalogTrackMetadata = {
  album?: string;
  albumArtist?: string;
  artist?: string;
  diskNumber?: number;
  genre?: string;
  title?: string;
  trackNumber?: number;
  year?: string;
};

export type CatalogTrack = {
  metadata: CatalogTrackMetadata;
};

export type CatalogTrackGroup<TTrack> = {
  id: string;
  album: string;
  artist: string;
  genre: string;
  year: string;
  tracks: TTrack[];
};

export function groupCatalogTracks<TTrack extends CatalogTrack>(
  tracks: TTrack[],
): Array<CatalogTrackGroup<TTrack>>;
