export type LyricsMatchConfidence = "high" | "medium";

export type LyricsMatchedBy =
  | "audio-stem"
  | "track-title"
  | "numbered-title"
  | "numbered-audio-stem"
  | "title-with-prefix"
  | "stem-with-prefix"
  | "track-number";

export type LyricsPathSuggestion = {
  relativePath: string;
  confidence: LyricsMatchConfidence;
  matchedBy: LyricsMatchedBy;
  score: number;
};

export function isLyricsTextPath(value: string): boolean;

export function listLyricsOptionsForTrack(args: {
  audioPath: string;
  lyricPaths: string[];
  trackTitle?: string;
  trackNumber?: number;
}): LyricsPathSuggestion[];

export function autoLyricsPathForTrack(args: {
  audioPath: string;
  lyricPaths: string[];
  trackTitle?: string;
  trackNumber?: number;
}): string | null;
