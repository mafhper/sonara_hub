export type BatchApplyMode = "fill-empty" | "overwrite";

export type BatchCommon = {
  artist: string;
  album: string;
  albumArtist: string;
  composer: string;
  genre: string;
  year: string;
  copyright: string;
  comment: string;
  trackTotal: number;
  diskNumber: number;
  diskTotal: number;
  normalizationEnabled: boolean;
};

export type BatchTrack<T> = {
  metadata: T;
  selectedForBatch: boolean;
};

export type AudioTrackGroup<T> = {
  id: string;
  artist: string;
  album: string;
  diskNumber: number;
  label: string;
  trackCount: number;
  selectedCount: number;
  tracks: T[];
};

export function applyCommonMetadata<T extends BatchTrack<object>>(
  tracks: T[],
  common: BatchCommon,
  mode?: BatchApplyMode,
): T[];

export function buildCommonMetadataPatch(
  common: BatchCommon,
): Record<string, string | number | boolean>;

export function groupAudioTracks<T extends BatchTrack<object>>(
  tracks: T[],
): Array<AudioTrackGroup<T>>;
