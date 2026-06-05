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
  coverFadeOut?: {
    enabled: boolean;
    endPercent: number;
  };
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
  order: TextFieldKey[];
  fieldStyles: Record<TextFieldKey, TextFieldStyle>;
  preset:
    | "top-left"
    | "bottom-center"
    | "cover-left"
    | "side-left"
    | "side-right"
    | "editorial-stack"
    | "quiet-album";
  fontFamily: "Inter" | "Georgia" | "Arial";
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  lineHeight: number;
  color: string;
  opacity: number;
  x: number;
  y: number;
  align: "left" | "center" | "right" | "justify";
  verticalAnchor: "top" | "middle" | "bottom";
  shadow: number;
};

export type TextFieldKey = "title" | "artist" | "album" | "year" | "version";

export type TextFieldStyle = {
  fontFamily: "Inter" | "Georgia" | "Arial";
  fontSize: number;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  letterSpacing: number;
  lineHeight: number;
  color: string;
  opacity: number;
  fadeOut?: {
    enabled: boolean;
    endPercent: number;
  };
  align: "left" | "center" | "right";
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
  includeNumber: boolean;
  includeTitle: boolean;
  includeAlbum: boolean;
  includeArtist: boolean;
  includeYear: boolean;
  embedAlbumCover: boolean;
  metaOrder: string;
  metaFontSize: number;
  metaGap: number;
  metaStyles: Record<CoverSeriesMetaKey, CoverSeriesMetaStyle>;
};

export type CoverSeriesMetaKey =
  | "series"
  | "title"
  | "album"
  | "artist"
  | "year";

export type CoverSeriesMetaStyle = {
  fontSize: number;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  align: "left" | "center" | "right";
  color: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
};

export type ArtworkSuggestion = {
  file: File;
  src: string;
  relativePath: string;
  source: "folder" | "manual";
};

export type LyricsSuggestion = {
  file?: File;
  relativePath: string;
  fileName: string;
  preview: string;
  confidence: "high" | "medium";
  matchedBy:
    | "audio-stem"
    | "track-title"
    | "numbered-title"
    | "numbered-audio-stem"
    | "title-with-prefix"
    | "stem-with-prefix"
    | "track-number";
  autoApplied?: boolean;
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
  coverOverride?: ArtworkSuggestion | null;
  artworkOptions?: ArtworkSuggestion[];
  albumCoverSuggestion?: ArtworkSuggestion;
  useSuggestedCover?: boolean;
  lyricsOptions?: LyricsSuggestion[];
  lyricsSourcePath?: string;
  thumbnailPreviewMode: "composition" | "cover";
  // Per-track override for the numbered cover series. When null/undefined the
  // track follows the global coverSeriesSettings; when set, it wins for this
  // track only (preview and output).
  coverSeriesOverride?: CoverSeriesSettings | null;
};

export type RenderJob = {
  id: string;
  kind?: "audio-process" | "video-render" | "publication-asset";
  status: "queued" | "paused" | "running" | "done" | "error" | "canceled";
  progress: number;
  message: string;
  errorCode?: string;
  errorDetail?: string;
  outputUrl: string | null;
  sidecarUrl: string | null;
  thumbnailUrl: string | null;
  markdownUrl?: string | null;
  assetUrls?: string[];
  albumArtworkUrl?: string | null;
  analysis?: AudioTechnicalAnalysis;
  metadata?: Partial<AudioTagDraft & TrackMetadata>;
  cancelRequested?: boolean;
};

export type ProjectAssetManifestEntry = {
  id: string;
  fileName: string;
  originalName: string;
  path: string;
  hash: string;
  type: string;
  size: number;
  lastModified: number;
};

export type ProjectAssetManifest = {
  schemaVersion: 1;
  files: ProjectAssetManifestEntry[];
};

export type ProjectSnapshotLayer = Omit<MediaLayerV2, "src" | "file"> & {
  file?: File;
  assetId?: string;
};

export type ProjectSnapshotArtwork = Omit<ArtworkSuggestion, "file"> & {
  file?: File;
};

export type ProjectSnapshot = {
  schemaVersion: 3 | 4;
  workspaceMode: "audio" | "visual";
  workflowMode: "single" | "batch";
  activeStep: "music" | "visual" | "text" | "export";
  audioStageView?: "edit" | "catalog" | "videos";
  visualStageView?: "editor" | "videos" | "promotion" | "queue";
  publicationPresetId?: string;
  publicationClipStart?: number;
  publicationClipDuration?: number;
  publicationIncludeLyrics?: boolean;
  publicationAssetMode?: "single" | "group" | "all";
  assetManifest?: ProjectAssetManifest;
  coverAssetId?: string;
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
    layers: ProjectSnapshotLayer[];
    textSettings?: TextOverlaySettings;
    selectedForBatch: boolean;
    packageStatus?: TrackDraft["packageStatus"];
    useSuggestedCover?: boolean;
    lyricsOptions?: LyricsSuggestion[];
    lyricsSourcePath?: string;
    coverOverride?: ProjectSnapshotArtwork | null;
    coverOverrideAssetId?: string;
    thumbnailPreviewMode?: TrackDraft["thumbnailPreviewMode"];
    coverSeriesOverride?: CoverSeriesSettings | null;
  }>;
};
