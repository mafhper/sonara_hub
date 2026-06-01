import type { ScenePresetV3 } from "../shared/visual-effects.mjs";

export type AudioInfo = {
  fileName: string;
  durationSeconds: number | null;
  bitrate: number | null;
  codec: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  albumArtist?: string | null;
  genre?: string | null;
  comment?: string | null;
  composer?: string | null;
  year?: string | number | null;
  track?: number | null;
  hasEmbeddedCover?: boolean;
  sampleRate?: number | null;
  channels?: number | null;
  analysis?: AudioTechnicalAnalysis;
  suggestions?: Partial<AudioTagDraft>;
};

export type AudioTechnicalAnalysis = {
  integratedLufs: number;
  truePeakDbtp: number;
  loudnessRangeLu: number;
  samplePeakDbfs: number;
  risk: "safe" | "reduced-headroom" | "overload" | "decode-error";
  recommendation: "none" | "consider-normalization";
};

export type AudioTagDraft = {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string;
  composer: string;
  comment: string;
  copyright: string;
  year: string;
  trackNumber: number;
  trackTotal: number;
  diskNumber: number;
  diskTotal: number;
  lyrics: string;
  lyricsLanguage: string;
  normalizationEnabled: boolean;
  cleanPackage: true;
};

export type TrackMetadata = {
  title: string;
  version: string;
  artist: string;
  album: string;
  genre: string;
  description: string;
  comment: string;
  tags: string;
  visibility: string;
  categoryId: string;
  language: string;
  recordingDate: string;
  copyright: string;
  outputFileName: string;
  useEmbeddedCover: boolean;
  containsSyntheticMedia: boolean;
  madeForKids: boolean;
  albumArtist: string;
  composer: string;
  year: string;
  trackNumber: number;
  trackTotal: number;
  diskNumber: number;
  diskTotal: number;
  lyrics: string;
  lyricsLanguage: string;
  normalizationEnabled: boolean;
};

export type MediaLayerV2 = {
  id: string;
  name: string;
  file: File;
  src: string;
  kind: "image" | "svg" | "video";
  visible: boolean;
  opacity: number;
  scale: number;
  x: number;
  y: number;
  rotation: number;
  blur: number;
  maskOpacity: number;
  shadow: { opacity: number; blur: number; x: number; y: number };
  fit: "cover" | "contain";
  blendMode: "normal" | "screen" | "multiply" | "overlay";
  loop: boolean;
  order: number;
};

export type TextOverlaySettings = {
  fields: {
    title: boolean;
    artist: boolean;
    album: boolean;
    year: boolean;
    version: boolean;
  };
  preset: "top-left" | "bottom-center" | "cover-left";
  fontFamily: "Inter" | "Georgia" | "Arial";
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  lineHeight: number;
  color: string;
  opacity: number;
  x: number;
  y: number;
  align: "left" | "center" | "right";
  shadow: number;
};

export type CoverSeriesSettings = {
  enabled: boolean;
  style: "roman" | "arabic" | "custom";
  sequence: string;
  fontSize: number;
  color: string;
  opacity: number;
  x: number;
  y: number;
  letterSpacing: number;
  includeAlbum: boolean;
  includeArtist: boolean;
  includeYear: boolean;
};

export type ArtworkSuggestion = {
  file: File;
  src: string;
  relativePath: string;
  source: "folder";
};

export type TrackDraft = {
  id: string;
  sourceKey: string;
  sourceFile?: File;
  sourceUrl?: string;
  source: "input" | "folder" | "upload";
  variantOf?: string;
  versionLabel: string;
  metadata: TrackMetadata;
  outputBaseName: string;
  scene: ScenePresetV3;
  layers: MediaLayerV2[];
  textSettings: TextOverlaySettings;
  audioInfo?: AudioInfo;
  selectedForBatch: boolean;
  packageStatus?: "original" | "treated";
  suggestedCover?: ArtworkSuggestion;
  useSuggestedCover?: boolean;
  thumbnailPreviewMode: "composition" | "cover";
};

export type RenderJob = {
  id: string;
  kind?: "audio-process" | "video-render";
  status: "queued" | "paused" | "running" | "done" | "error" | "canceled";
  progress: number;
  message: string;
  outputUrl: string | null;
  sidecarUrl: string | null;
  thumbnailUrl: string | null;
  analysis?: AudioTechnicalAnalysis;
  metadata?: Partial<AudioTagDraft & TrackMetadata>;
  cancelRequested?: boolean;
};

export type ProjectSnapshot = {
  schemaVersion: 3 | 4;
  workspaceMode: "audio" | "visual";
  workflowMode: "single" | "batch";
  activeStep: "music" | "visual" | "text" | "export";
  audioStageView?: "edit" | "catalog" | "videos";
  visualStageView?: "editor" | "videos";
  coverSeriesSettings?: CoverSeriesSettings;
  selectedTrackId: string;
  outputPreset: string;
  qualityProfile: string;
  showMetadata: boolean;
  coverFile?: File;
  tracks: Array<{
    id: string;
    sourceKey: string;
    source: TrackDraft["source"];
    variantOf?: string;
    versionLabel: string;
    metadata: TrackMetadata;
    outputBaseName: string;
    scene: ScenePresetV3;
    sourceFile?: File;
    audioInfo?: AudioInfo;
    layers: Array<Omit<MediaLayerV2, "src">>;
    textSettings?: TextOverlaySettings;
    selectedForBatch: boolean;
    packageStatus?: TrackDraft["packageStatus"];
    useSuggestedCover?: boolean;
    thumbnailPreviewMode?: TrackDraft["thumbnailPreviewMode"];
  }>;
};
