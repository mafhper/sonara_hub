export type PublicationAssetKind = "image" | "clip";

export type PublicationAssetPreset = {
  id: string;
  kind: PublicationAssetKind;
  label: string;
  platform: string;
  width: number;
  height: number;
  directory: "imagens" | "clips";
  extension: "jpg" | "mp4";
  maxDurationSeconds?: number;
};

export type PublicationAssetManifest = {
  schemaVersion: 1;
  generatedAt: string;
  preset: PublicationAssetPreset;
  metadata: Record<string, unknown>;
  includeFullLyrics: boolean;
  files: Array<{ kind: string; path: string; url: string | null }>;
};

export type PublicationLyricsMode = "none" | "full" | "excerpt";

export type PublicationAssetSettings = {
  clipStart: number;
  clipDuration: number;
  includeLyrics: boolean;
  lyricsMode: PublicationLyricsMode;
  lyricsExcerpt: string;
  lyricsHideTags: boolean;
  lyricsLineSpacing: number;
};

export type PublicationAssetOverride = Partial<PublicationAssetSettings>;
export type PublicationAssetOverrideMap = Record<
  string,
  PublicationAssetOverride
>;

export const publicationAssetKinds: PublicationAssetKind[];
export const publicationAssetPresets: PublicationAssetPreset[];
export function publicationAssetPresetById(id: string): PublicationAssetPreset;
export function publicationAssetPresetLabel(id: string): string;
export function clampPublicationClipDuration(value: unknown): number;
export function clampPublicationClipStart(value: unknown): number;
export function normalizePublicationLyricsMode(
  value: unknown,
  includeLyrics?: boolean,
): PublicationLyricsMode;
export function sanitizePublicationLyricsExcerpt(value: unknown): string;
export function clampPublicationLyricsLineSpacing(value: unknown): number;
export function stripPublicationLyricsTags(value: unknown): string;
export function publicationLyricsTextForSettings(
  sourceLyrics: unknown,
  settings?: Partial<PublicationAssetSettings>,
): string;
export function normalizePublicationAssetOverrides(
  value?: unknown,
): PublicationAssetOverrideMap;
export function publicationAssetSettingsForPreset(
  presetId: string,
  defaults?: Partial<PublicationAssetSettings>,
  overrides?: PublicationAssetOverrideMap,
): PublicationAssetSettings;
export function sanitizePublicationFilePart(
  value: unknown,
  fallback?: string,
): string;
