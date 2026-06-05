export function isArtworkName(name: string): boolean;
export function albumArtworkDirectoryPaths(audioPaths: string[]): string[];
export function singleTrackArtworkFileName(audioPath: string): string;
export const treatedAlbumArtworkFileName: string;
export const treatedTrackArtworkDirectoryName: string;
export function treatedTrackArtworkFileName(audioPath: string): string;
export function treatedTrackArtworkPath(audioPath: string): string;
export function chooseArtworkForTrack(options: {
  audioPath: string;
  audioPaths: string[];
  artworkPaths: string[];
  trackNumber?: number;
}): string | null;
export function chooseAlbumArtworkForTrack(options: {
  audioPath: string;
  artworkPaths: string[];
}): string | null;
export function listArtworkOptionsForTrack(options: {
  audioPath: string;
  audioPaths: string[];
  artworkPaths: string[];
  trackNumber?: number;
}): string[];
