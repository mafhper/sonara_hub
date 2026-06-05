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

export const publicationAssetKinds: PublicationAssetKind[];
export const publicationAssetPresets: PublicationAssetPreset[];
export function publicationAssetPresetById(id: string): PublicationAssetPreset;
export function publicationAssetPresetLabel(id: string): string;
export function clampPublicationClipDuration(value: unknown): number;
export function clampPublicationClipStart(value: unknown): number;
export function sanitizePublicationFilePart(
  value: unknown,
  fallback?: string,
): string;
