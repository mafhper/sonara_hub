export type VideoOutputConflictMode = "backup" | "overwrite" | "clear";

export const VIDEO_OUTPUT_ASSETS_DIRECTORY: string;
export const VIDEO_OUTPUT_BACKUP_DIRECTORY: string;
export const videoOutputConflictModes: VideoOutputConflictMode[];

export function normalizeVideoOutputConflictMode(
  value: unknown,
): VideoOutputConflictMode;

export function videoOutputProjectDirectoryName(
  metadata?: Record<string, unknown>,
  fallbackProjectName?: string,
): string;

export function prepareVideoOutputProject<TDirectoryHandle>(
  rootHandle: TDirectoryHandle,
  projectName: string,
  options?: {
    backupStamp?: string;
    conflictMode?: VideoOutputConflictMode;
  },
): Promise<{
  assets: TDirectoryHandle;
  backup: TDirectoryHandle | null;
  backupName: string;
  project: TDirectoryHandle;
  projectName: string;
}>;

export function safeOutputDirectoryName(
  value: unknown,
  fallback?: string,
): string;
