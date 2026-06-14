import type { TextFieldStyle } from "../types";

export type ActiveStep = "music" | "visual" | "text" | "export";
export type WorkspaceMode = "audio" | "visual";
export type WorkspaceFolderKind = "internal" | "external";
export type AudioStageView =
  | "edit"
  | "artwork"
  | "podcast"
  | "catalog"
  | "audio-export";
export type VisualStageView =
  | "editor"
  | "review"
  | "promotion"
  | "publication-export";
export type TextFadeOutSettings = NonNullable<TextFieldStyle["fadeOut"]>;
export type TextFadeInSettings = NonNullable<TextFieldStyle["fadeIn"]>;

export type PreparedVideoOutputProject = {
  assets: FileSystemDirectoryHandle;
  backup: FileSystemDirectoryHandle | null;
  backupName: string;
  project: FileSystemDirectoryHandle;
  projectName: string;
};

export type PreparedPublicationOutputProject = PreparedVideoOutputProject & {
  clips: FileSystemDirectoryHandle;
  dados: FileSystemDirectoryHandle;
  encartes: FileSystemDirectoryHandle;
  imagens: FileSystemDirectoryHandle;
  publicacao: FileSystemDirectoryHandle;
};

export type InputProjectOption = {
  id: string;
  name: string;
  path: string;
  handle?: FileSystemDirectoryHandle;
  source: "browser" | "internal";
  trackCount: number;
};

export type BrowserInputProjectOption = InputProjectOption & {
  handle: FileSystemDirectoryHandle;
  source: "browser";
};

export type InternalInputProject = {
  id: string;
  name: string;
  path: string;
  trackCount: number;
};

export type InternalInputAsset = {
  name: string;
};

export type ProjectCleanupScope = "current" | "selected" | "all";

export type BatchCommonDraft = {
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

export type AudioBands = {
  energy: number;
  bass: number;
  mid: number;
  high: number;
  centroid: number;
  flux: number;
  onset: number;
  beat: number;
  beatPhase: number;
  samples: number[];
  spectrum: number[];
};

export type StorageUsage = {
  temporary: { files: number; bytes: number };
  generated: { files: number; bytes: number };
  jobs: { active: number; terminal: number };
};

export type DestructiveAudioBatch = {
  jobIds: string[];
  finalizing: boolean;
};

export type ProjectSaveOption = {
  id: string;
  name: string;
  isDefault?: boolean;
};
