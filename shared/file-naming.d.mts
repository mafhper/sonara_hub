export type FileNameToken =
  | "track"
  | "album"
  | "title"
  | "artist"
  | "albumArtist"
  | "year";

export type FileNamePattern = {
  tokens: string[];
  separator: string;
};

export const fileNameTokens: string[];
export const fileNameTokenLabels: Record<string, string>;
export const defaultFileNamePattern: FileNamePattern;
export function normalizeFileNamePattern(value: unknown): FileNamePattern;
export function buildNameFromPattern(
  pattern: unknown,
  tags: Record<string, unknown>,
  sanitize?: (value: string) => string,
): string;
