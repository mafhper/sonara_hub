import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  Columns2,
  Copy,
  Disc3,
  Download,
  Eye,
  EyeOff,
  FileAudio,
  FileText,
  FolderOpen,
  Image,
  Italic,
  Layers3,
  Minimize2,
  Music2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Save,
  Settings,
  SlidersHorizontal,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ColorInput,
  IconButton,
  InspectorGroup,
  NumberStepField,
  RangeField,
  SelectField,
  TextArea,
  TextField,
  clampNumber,
} from "./inspectors/fields";
import { AudioLibraryInspector } from "./inspectors/AudioLibraryInspector";
import { ExportInspector, outputPresets } from "./inspectors/ExportInspector";
import {
  type FileNamePattern,
  FileNamePatternSection,
} from "./inspectors/FileNamePattern";
import { FadeInFields, LayerControls } from "./inspectors/LayerControls";
import { MusicInspector } from "./inspectors/MusicInspector";
import { PodcastInspector } from "./inspectors/PodcastInspector";
import { PublicationInspector } from "./inspectors/PublicationInspector";
import { TextInspector } from "./inspectors/TextInspector";
import { TextProfiles } from "./inspectors/TextProfiles";
import {
  type PositionPresetId,
  cloneTextSettings,
  defaultTextSettings,
  mergeTextSettings,
  normalizeTextFadeOut,
  normalizeTextOrder,
  positionPresetOptions,
  textFieldLabels,
  textFontOptions,
  textPositionPresets,
  textStylePresetLabels,
  textStylePresetPatch,
} from "./inspectors/text-presets";
import {
  InteractionDialog,
  type InteractionDialogState,
  NotificationCenter,
  type ToastNotice,
  type ToastTone,
  ToastViewport,
} from "./ui/Feedback";
import {
  BatchJobBoard,
  formatDurationMs,
  jobStageLabel,
} from "./jobs/BatchJobBoard";
import { AudioExportWorkspace } from "./workspaces/AudioExportWorkspace";
import { AudioLibraryWorkspace } from "./workspaces/AudioLibraryWorkspace";
import { CatalogPreview } from "./workspaces/CatalogPreview";
import { ScenePreview } from "./workspaces/CompositionPreview";
import { CoverArtworkWorkspace } from "./workspaces/CoverArtworkWorkspace";
import {
  coverSeriesMetaOrder,
  coverSeriesMetaStyleForKey,
  coverSeriesPreviewLines,
  defaultCoverSeriesSettings,
} from "./workspaces/CoverSeries";
import { PodcastWorkspace } from "./workspaces/PodcastWorkspace";
import { PublicationAssetsWorkspace } from "./workspaces/PublicationAssetsWorkspace";
import { ProjectSaveControls } from "./workspaces/ProjectSaveControls";
import { ProjectSwitcher } from "./workspaces/ProjectSwitcher";
import { PanelResizeHandle } from "./workspaces/ReviewPrimitives";
import { Transport } from "./workspaces/Transport";
import { VideoExportWorkspace } from "./workspaces/VideoExportWorkspace";
import { VideoReviewGrid } from "./workspaces/VideoReviewGrid";
import { usePageStatus } from "./lib/page-status";
import {
  type CoverFadeOutSettings,
  type LayerFadeInSettings,
  type LayerZoomSettings,
  isCoverLayer,
  normalizeFadeIn,
  normalizeLayerCoverFadeOut,
} from "./inspectors/layer-normalizers";
import { renderStackKey } from "./inspectors/CompositionStack";
import {
  publicationPresetsForMode,
  type PublicationAssetMode,
} from "./publication";
import {
  type CoverLayerPreset,
  type PlayfulPatch,
  VisualInspector,
  coverLayerPresetLabels,
  waveformTypeLabel,
} from "./inspectors/VisualInspector";
import {
  builtinVisualPresets,
  normalizeVisualPresetList,
  normalizeVisualSettings,
} from "../shared/visual-effects.mjs";
import type {
  CloudLightSettings,
  RenderStackItem,
  ScenePresetV3,
  VisualPalette,
  WaveformV1,
} from "../shared/visual-effects.mjs";
import {
  applyCoverSeriesScopePatch,
  applySelectedTextSettingsToBatch,
  clearCoverSeriesScopeOverride,
  mergeTextSettingsByMode,
  resolveAlbumArtwork,
  resolveCoverSeriesSettings,
  resolveEffectiveComposition,
  resolveTrackArtwork,
} from "../shared/composition-scope.mjs";
import type { TextBatchApplyMode } from "../shared/composition-scope.mjs";
import {
  fetchJson,
  fetchJsonWithRetry,
  fetchOptional,
  localApiMessage,
} from "../shared/local-api.mjs";
import { applyCommonMetadata } from "../shared/audio-batch.mjs";
import type { BatchApplyMode } from "../shared/audio-batch.mjs";
import {
  resolveDestructiveBatchState,
  writeReplacementsWithRollback,
} from "../shared/destructive-audio-batch.mjs";
import { directoryImportPrefix } from "../shared/audio-import.mjs";
import {
  defaultFileNamePattern,
  normalizeFileNamePattern,
} from "../shared/file-naming.mjs";
import {
  normalizeVideoOutputConflictMode,
  prepareVideoOutputProject,
  videoOutputProjectDirectoryName,
} from "../shared/video-output-folder.mjs";
import type { VideoOutputConflictMode } from "../shared/video-output-folder.mjs";
import {
  isLyricsTextPath,
  listLyricsOptionsForTrack,
} from "../shared/lyrics-convention.mjs";
import type { LyricsPathSuggestion } from "../shared/lyrics-convention.mjs";
import { collectActiveObjectUrls } from "../shared/object-url-lifecycle.mjs";
import {
  applyPublicationTextOverride,
  clampPublicationClipDuration,
  clampPublicationClipStart,
  normalizePublicationAssetOverrides,
  publicationLyricsTextForSettings,
  publicationAssetSettingsForPreset,
  publicationAssetPresetById,
  publicationAssetPresetLabel,
  publicationAssetPresets,
} from "../shared/publication-assets.mjs";
import type {
  PublicationAssetOverrideMap,
  PublicationAssetPreset,
  PublicationAssetSettings,
} from "../shared/publication-assets.mjs";
import type { PodcastFeedSidecar } from "../shared/podcast-feed.mjs";
import {
  albumArtworkDirectoryPaths,
  chooseAlbumArtworkForTrack,
  chooseArtworkForTrack,
  isArtworkName,
  listArtworkOptionsForTrack,
  treatedAlbumArtworkFileName,
} from "../shared/artwork-convention.mjs";
import {
  loadDirectoryHandle,
  loadSnapshot,
  saveDirectoryHandle,
  saveSnapshot,
} from "./storage";
import { CanvasInteractionOverlay } from "./CanvasInteractionOverlay";
import type {
  AudioInfo,
  AudioTagDraft,
  AudioTechnicalAnalysis,
  ArtworkSuggestion,
  CoverSeriesMetaStyle,
  CoverSeriesSettings,
  LyricsSuggestion,
  MediaLayerV2,
  ProjectAssetManifestEntry,
  ProjectSnapshot,
  RenderJob,
  TextFieldKey,
  TextFieldStyle,
  TextOverlaySettings,
  TrackDraft,
  TrackMetadata,
} from "./types";

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: string | FileSystemHandle;
    }) => Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemHandle {
    queryPermission?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<PermissionState>;
    requestPermission?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<PermissionState>;
  }

  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<
      [string, FileSystemFileHandle | FileSystemDirectoryHandle]
    >;
    getDirectoryHandle(
      name: string,
      options?: { create?: boolean },
    ): Promise<FileSystemDirectoryHandle>;
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  }
}

type ActiveStep = "music" | "visual" | "text" | "export";
type WorkspaceMode = "audio" | "visual";
type WorkspaceFolderKind = "internal" | "external";
type AudioStageView =
  | "edit"
  | "artwork"
  | "podcast"
  | "catalog"
  | "audio-export";
type VisualStageView = "editor" | "review" | "promotion" | "publication-export";
type TextFadeOutSettings = NonNullable<TextFieldStyle["fadeOut"]>;
type TextFadeInSettings = NonNullable<TextFieldStyle["fadeIn"]>;
type PreparedVideoOutputProject = {
  assets: FileSystemDirectoryHandle;
  backup: FileSystemDirectoryHandle | null;
  backupName: string;
  project: FileSystemDirectoryHandle;
  projectName: string;
};
type PreparedPublicationOutputProject = PreparedVideoOutputProject & {
  clips: FileSystemDirectoryHandle;
  dados: FileSystemDirectoryHandle;
  encartes: FileSystemDirectoryHandle;
  imagens: FileSystemDirectoryHandle;
  publicacao: FileSystemDirectoryHandle;
};
type InputProjectOption = {
  id: string;
  name: string;
  path: string;
  handle?: FileSystemDirectoryHandle;
  source: "browser" | "internal";
  trackCount: number;
};
type BrowserInputProjectOption = InputProjectOption & {
  handle: FileSystemDirectoryHandle;
  source: "browser";
};
type InternalInputProject = {
  id: string;
  name: string;
  path: string;
  trackCount: number;
};
type InternalInputAsset = {
  name: string;
};
type ProjectCleanupScope = "current" | "selected" | "all";
type BatchCommonDraft = {
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
type AudioBands = {
  energy: number;
  bass: number;
  mid: number;
  high: number;
  samples: number[];
  spectrum: number[];
};
type StorageUsage = {
  temporary: { files: number; bytes: number };
  generated: { files: number; bytes: number };
  jobs: { active: number; terminal: number };
};
type DestructiveAudioBatch = {
  jobIds: string[];
  finalizing: boolean;
};
type ProjectSaveOption = {
  id: string;
  name: string;
  isDefault?: boolean;
};

const emptyBands: AudioBands = {
  energy: 0,
  bass: 0,
  mid: 0,
  high: 0,
  samples: [],
  spectrum: [],
};
// ISO 639-2 codes the server accepts for the ID3 lyrics/language frame.
// Suggested track "version" labels (free text — users can type their own).
const versionSuggestions = [
  "Original",
  "Remix",
  "Ao vivo",
  "Acústico",
  "Instrumental",
  "Demo",
  "Remaster",
  "Edit",
  "Radio Edit",
  "Extended",
];

const PANEL_WIDTH_STORAGE_KEY = "sonara-hub-panel-widths";
const COVER_SERIES_STORAGE_KEY = "sonara-hub-cover-series-settings";
const FILE_NAME_PATTERN_STORAGE_KEY = "sonara-hub-file-name-pattern";
const INPUT_PROJECT_STORAGE_KEY = "sonara-hub-input-project";
const PODCAST_ENABLED_STORAGE_KEY = "sonara-hub-podcast-enabled";
const PODCAST_METADATA_SLICE_BYTES = 8 * 1024 * 1024;
const PROJECT_STATE_DIRECTORY = ".sonara";
const PROJECT_STATE_FILE = "project.json";
const PROJECT_ASSETS_DIRECTORY = "assets";
const PROJECT_SAVES_DIRECTORY = "saves";
const DEFAULT_PROJECT_SAVE_ID = "default";
const defaultProjectSave: ProjectSaveOption = {
  id: DEFAULT_PROJECT_SAVE_ID,
  name: "Padrão",
  isDefault: true,
};

const DEFAULT_LEFT_RAIL_WIDTH = 256;
const DEFAULT_RIGHT_RAIL_WIDTH = 456;
const PANEL_MIN_PREVIEW_WIDTH = 520;
const PANEL_FLOATING_STAGE_WIDTH = 620;
const LEFT_RAIL_BOUNDS = { min: 220, max: 380 };
const RIGHT_RAIL_BOUNDS = { min: 360, max: 620 };
const defaultMetadata: TrackMetadata = {
  title: "Nova faixa",
  version: "",
  artist: "",
  album: "",
  genre: "",
  description: "",
  comment: "",
  tags: "",
  visibility: "unlisted",
  categoryId: "10",
  language: "pt-BR",
  recordingDate: "",
  copyright: "",
  outputFileName: "",
  useEmbeddedCover: false,
  containsSyntheticMedia: true,
  madeForKids: false,
  albumArtist: "",
  composer: "",
  year: "",
  trackNumber: 1,
  trackTotal: 1,
  diskNumber: 1,
  diskTotal: 1,
  lyrics: "",
  lyricsLanguage: "und",
  normalizationEnabled: false,
  podcastVoiceProfile: "natural",
  podcastTrimSilence: false,
  podcastVoiceBoost: false,
  podcastPlaybackSpeed: 1,
  podcastIntroInsert: "",
  podcastOutroInsert: "",
  podcastAdInsert: "",
  podcastEpisodeArtworkUrl: "",
  podcastEpisodeLink: "",
  podcastEpisodeLinks: "",
  podcastDonationUrl: "",
};
function revokeObjectUrl(url: string) {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Revocation is best-effort; stale or environment-specific blob URLs should
    // not break the editing session.
  }
}
const defaultFadeIn: LayerFadeInSettings = {
  enabled: false,
  startPercent: 0,
  durationSeconds: 1.5,
};
const coverLayerPresets: Record<
  CoverLayerPreset,
  Pick<
    MediaLayerV2,
    | "opacity"
    | "scale"
    | "x"
    | "y"
    | "rotation"
    | "blur"
    | "maskOpacity"
    | "fit"
    | "blendMode"
    | "shadow"
  >
> = {
  background: {
    opacity: 72,
    scale: 156,
    x: 50,
    y: 50,
    rotation: 0,
    blur: 22,
    maskOpacity: 46,
    fit: "cover",
    blendMode: "normal",
    shadow: { opacity: 0, blur: 24, x: 0, y: 14 },
  },
  left: {
    opacity: 100,
    scale: 46,
    x: 22,
    y: 50,
    rotation: 0,
    blur: 0,
    maskOpacity: 0,
    fit: "contain",
    blendMode: "normal",
    shadow: { opacity: 48, blur: 34, x: 0, y: 18 },
  },
  center: {
    opacity: 100,
    scale: 52,
    x: 50,
    y: 50,
    rotation: 0,
    blur: 0,
    maskOpacity: 0,
    fit: "contain",
    blendMode: "normal",
    shadow: { opacity: 42, blur: 32, x: 0, y: 18 },
  },
  right: {
    opacity: 100,
    scale: 46,
    x: 78,
    y: 50,
    rotation: 0,
    blur: 0,
    maskOpacity: 0,
    fit: "contain",
    blendMode: "normal",
    shadow: { opacity: 48, blur: 34, x: 0, y: 18 },
  },
  corner: {
    opacity: 96,
    scale: 30,
    x: 18,
    y: 74,
    rotation: 0,
    blur: 0,
    maskOpacity: 0,
    fit: "contain",
    blendMode: "normal",
    shadow: { opacity: 38, blur: 26, x: 0, y: 14 },
  },
};

function App() {
  const [tracks, setTracks] = useState<TrackDraft[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  // Scope is no longer a manual toggle: it follows the sidebar selection —
  // tick several tracks → "batch", one or none → "single" (acts on the active
  // track). This unifies the old "Faixa única / Lote" screens into one catalog.
  const selectedForBatchCount = tracks.filter(
    (track) => track.selectedForBatch,
  ).length;
  const workflowMode: "single" | "batch" =
    selectedForBatchCount >= 2 ? "batch" : "single";
  const [activeStep, setActiveStep] = useState<ActiveStep>("visual");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("audio");
  const [audioStageView, setAudioStageView] = useState<AudioStageView>("edit");
  const [visualStageView, setVisualStageView] =
    useState<VisualStageView>("editor");
  const [podcastEnabled, setPodcastEnabled] = useState(() =>
    loadPodcastEnabled(),
  );
  // Item ativo da pilha de composição (chaves de renderStackKey). Vive no App
  // para futura sincronização com a seleção do canvas.
  const [selectedStackKey, setSelectedStackKey] =
    useState<string>("atmosphere");
  const [visualPresets, setVisualPresets] =
    useState<ScenePresetV3[]>(builtinVisualPresets);
  const [outputPreset, setOutputPreset] = useState("youtube-1080p");
  const [qualityProfile, setQualityProfile] = useState("auto");
  const [publicationPresetId, setPublicationPresetId] =
    useState("youtube-thumbnail");
  const [publicationClipStart, setPublicationClipStart] = useState(0);
  const [publicationClipDuration, setPublicationClipDuration] = useState(15);
  const [publicationIncludeLyrics, setPublicationIncludeLyrics] =
    useState(false);
  const [publicationAssetMode, setPublicationAssetMode] =
    useState<PublicationAssetMode>("single");
  const [publicationAssetOverrides, setPublicationAssetOverrides] =
    useState<PublicationAssetOverrideMap>({});
  // Explicit opt-in set of asset formats to export. Empty = just the focused
  // preset, so "Gerar assets" never silently fans out to all 13 formats.
  const [publicationSelectedPresetIds, setPublicationSelectedPresetIds] =
    useState<string[]>([]);
  // Track ids excluded from the in-scope review set for this export.
  const [publicationExcludedTrackIds, setPublicationExcludedTrackIds] =
    useState<string[]>([]);
  // Flipped by "Parar geração"/"Cancelar tudo" so the client-side export loop
  // stops enqueuing new jobs instead of running to completion.
  const publicationExportAbortRef = useRef(false);
  const [publicationExporting, setPublicationExporting] = useState(false);
  // Whether to also write the json/markdown data files alongside each asset.
  // Off = generate only the clip/image.
  const [publicationGenerateDataFiles, setPublicationGenerateDataFiles] =
    useState(true);
  const [showMetadata, setShowMetadata] = useState(true);
  const [cover, setCover] = useState<{ file: File; src: string } | null>(null);
  const [pendingCoverTrackId, setPendingCoverTrackId] = useState("");
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  // Session-wide history of every toast, so dismissed/expired notices remain
  // reachable from the bell in the topbar.
  const [notificationLog, setNotificationLog] = useState<ToastNotice[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [interactionDialog, setInteractionDialog] =
    useState<InteractionDialogState | null>(null);
  const [inputFolderName, setInputFolderName] = useState("input");
  const [inputFolderKind, setInputFolderKind] =
    useState<WorkspaceFolderKind>("internal");
  const [folderName, setFolderName] = useState("input");
  const [inputProjects, setInputProjects] = useState<InputProjectOption[]>([]);
  const [selectedInputProjectId, setSelectedInputProjectId] = useState("");
  const [cleanupProjectIds, setCleanupProjectIds] = useState<string[]>([]);
  const [projectStateStatus, setProjectStateStatus] = useState("");
  const [projectSaves, setProjectSaves] = useState<ProjectSaveOption[]>([
    defaultProjectSave,
  ]);
  const [selectedProjectSaveId, setSelectedProjectSaveId] = useState(
    DEFAULT_PROJECT_SAVE_ID,
  );
  const [projectSavesBusy, setProjectSavesBusy] = useState(false);
  const [workspaceWriteEnabled, setWorkspaceWriteEnabled] = useState(false);
  // Explicit-open flow: the app boots into a Setup card (no auto-loaded project)
  // and the user opens a work folder/project on purpose. This sidesteps the
  // flaky auto-restore of input/ that left projects half-loaded.
  const [setupPanelOpen, setSetupPanelOpen] = useState(true);
  // Force the user to confirm input + output folders before the project list is
  // offered, so a project never loads into an unconfirmed workspace (which led
  // to saving into "another save"). Reset each fresh boot.
  const [foldersReady, setFoldersReady] = useState(false);
  const [outputFolderName, setOutputFolderName] = useState("outputs");
  const [outputFolderKind, setOutputFolderKind] =
    useState<WorkspaceFolderKind>("internal");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [panelsSwapped, setPanelsSwapped] = useState(false);
  const [floatingPanels, setFloatingPanels] = useState(false);
  const [leftRailWidth, setLeftRailWidth] = useState(
    () => loadPanelWidths().left,
  );
  const [rightRailWidth, setRightRailWidth] = useState(
    () => loadPanelWidths().right,
  );
  const [resizingPanel, setResizingPanel] = useState<
    "library" | "inspector" | null
  >(null);
  // One-step undo for the whole layer list of a track, so a mis-click on
  // "Aplicar capa" (or remove/add) can be reverted without losing prior tweaks.
  const [layersUndo, setLayersUndo] = useState<{
    trackId: string;
    layers: MediaLayerV2[];
    label: string;
  } | null>(null);
  const [folderImportProgress, setFolderImportProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);
  const [queuePaused, setQueuePaused] = useState(false);
  // Cover artwork is edited in a first-class audio workspace, so every shortcut
  // can route to the same surface without duplicating sidebar controls.
  // Drive the favicon + tab title from the active step and the render queue.
  usePageStatus(activeStep, jobs);
  const [batchApplyMode, setBatchApplyMode] =
    useState<BatchApplyMode>("fill-empty");
  const [batchCommon, setBatchCommon] = useState({
    artist: "Matheus Lima",
    album: "",
    albumArtist: "Matheus Lima",
    composer: "Matheus Lima",
    genre: "",
    year: "2026",
    copyright: "2026 Matheus Lima",
    comment: "Feito usando IA com curadoria humana.",
    trackTotal: 0,
    diskNumber: 0,
    diskTotal: 0,
    normalizationEnabled: false,
  });
  const [audioBands, setAudioBands] = useState<AudioBands>(emptyBands);
  // Static full-track waveform peaks per track, decoded once on selection so
  // the technical preview shows the shape without needing playback.
  const [staticWaveforms, setStaticWaveforms] = useState<
    Record<string, number[]>
  >({});
  const staticWaveformRequestsRef = useRef(new Set<string>());
  const [coverSeriesSettings, setCoverSeriesSettings] =
    useState<CoverSeriesSettings>(() => loadCoverSeriesSettings());
  const [fileNamePattern, setFileNamePattern] = useState<FileNamePattern>(() =>
    loadFileNamePattern(),
  );
  const [videoOutputConflictMode, setVideoOutputConflictMode] =
    useState<VideoOutputConflictMode>("backup");
  const [analyzingTrackIds, setAnalyzingTrackIds] = useState<string[]>([]);
  const [embeddedArtworkByTrackId, setEmbeddedArtworkByTrackId] = useState<
    Record<string, string | null>
  >({});
  const audioBandsRef = useRef(audioBands);
  const audioRef = useRef<HTMLAudioElement>(null);
  const layerInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const variationAudioInputRef = useRef<HTMLInputElement>(null);
  const fallbackFolderInputRef = useRef<HTMLInputElement>(null);
  const outputDirectoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const videoOutputRunRef = useRef<{
    conflictMode: VideoOutputConflictMode;
    projects: Map<string, Promise<PreparedVideoOutputProject>>;
    stamp: string;
  }>({
    conflictMode: "backup",
    projects: new Map(),
    stamp: "",
  });
  const publicationOutputRunRef = useRef<{
    conflictMode: VideoOutputConflictMode;
    projects: Map<string, Promise<PreparedPublicationOutputProject>>;
    stamp: string;
  }>({
    conflictMode: "backup",
    projects: new Map(),
    stamp: "",
  });
  const inputDirectoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const musicDirectoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const projectSaveTimerRef = useRef<number | null>(null);
  const audioJobOriginsRef = useRef(new Map<string, string>());
  const integratedAudioJobsRef = useRef(new Set<string>());
  const destructiveAudioBatchRef = useRef<DestructiveAudioBatch | null>(null);
  const embeddedArtworkRequestsRef = useRef(new Set<string>());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef(0);
  const toastSequenceRef = useRef(0);
  const toastTimersRef = useRef(new Map<number, number>());
  const dialogSequenceRef = useRef(0);
  const activeObjectUrlsRef = useRef(new Set<string>());

  useEffect(() => {
    const nextUrls = collectActiveObjectUrls(tracks, cover, layersUndo);
    for (const url of activeObjectUrlsRef.current) {
      if (!nextUrls.has(url)) revokeObjectUrl(url);
    }
    activeObjectUrlsRef.current = nextUrls;
  }, [cover, layersUndo, tracks]);

  useEffect(
    () => () => {
      for (const url of activeObjectUrlsRef.current) revokeObjectUrl(url);
      activeObjectUrlsRef.current.clear();
    },
    [],
  );

  const selectedTrack =
    tracks.find((track) => track.id === selectedTrackId) ?? tracks[0];
  const selectedTrackIndex = selectedTrack
    ? tracks.findIndex((track) => track.id === selectedTrack.id)
    : -1;
  const selectedCover = coverForTrack(selectedTrack);
  const embeddedArtworkSrc = selectedTrack
    ? (embeddedArtworkByTrackId[selectedTrack.id] ?? "")
    : "";
  const plannedArtworkSrc = selectedCover?.src ?? "";
  const playerArtworkSrc = plannedArtworkSrc || embeddedArtworkSrc;
  const playerArtworkLabel = playerArtworkSrc
    ? plannedArtworkSrc
      ? "Planejada"
      : "Embutida"
    : "";
  const selectedScene = selectedTrack?.scene ?? builtinVisualPresets[0];
  // The preview reads the exact same effective composition the export encodes,
  // so what is shown and what is rendered stay locked together (handoff #13).
  const previewComposition = resolveEffectiveComposition(selectedTrack, {
    sharedCover: cover,
    showMetadata,
    fallbacks: {
      scene: builtinVisualPresets[0],
      textSettings: defaultTextSettings,
      metadata: defaultMetadata,
      layers: [],
    },
  });
  const selectedOutput =
    outputPresets.find(([value]) => value === outputPreset) ?? outputPresets[1];
  const selectedPublicationPreset =
    publicationAssetPresetById(publicationPresetId);
  const publicationDefaultSettings: PublicationAssetSettings = {
    clipStart: publicationClipStart,
    clipDuration: publicationClipDuration,
    includeLyrics: publicationIncludeLyrics,
    lyricsMode: publicationIncludeLyrics ? "full" : "none",
    lyricsExcerpt: "",
    lyricsHideTags: false,
    lyricsLineSpacing: 130,
    textScale: 1,
    textOffsetX: 0,
    textOffsetY: 0,
    hideText: false,
    lyricsPosition: "bottom",
    lyricsStyle: "minimal",
    bookletTheme: selectedPublicationPreset.bookletTheme ?? "midnight",
  };
  const selectedPublicationSettings = publicationAssetSettingsForPreset(
    publicationPresetId,
    publicationDefaultSettings,
    publicationAssetOverrides,
  );
  const selectedPublicationLyricsPreview = selectedTrack
    ? publicationLyricsTextForSettings(
        selectedTrack.metadata.lyrics,
        selectedPublicationSettings,
      )
    : "";
  const publicationPresetSelection = publicationPresetsForMode(
    selectedPublicationPreset,
    publicationAssetMode,
  );
  // Effective formats to export: the explicit opt-in set when non-empty,
  // otherwise just the focused preset. Order follows the catalog.
  const effectivePublicationPresets =
    publicationSelectedPresetIds.length > 0
      ? publicationAssetPresets.filter((preset) =>
          publicationSelectedPresetIds.includes(preset.id),
        )
      : [selectedPublicationPreset];
  const audioSrc = selectedTrack
    ? (selectedTrack.sourceUrl ??
      (selectedTrack.source === "input"
        ? `/api/audio/${encodeURIComponent(selectedTrack.sourceKey)}`
        : ""))
    : "";
  const shellStyle = {
    "--rail-left": `${leftRailWidth}px`,
    "--rail-right": `${rightRailWidth}px`,
  } as CSSProperties;
  const reviewTracks =
    workflowMode === "batch"
      ? tracks.filter((track) => track.selectedForBatch)
      : selectedTrack
        ? [selectedTrack]
        : [];
  // Tracks actually targeted by a divulgação export: the in-scope review set
  // minus any the user unchecked in the publication stage.
  const effectivePublicationTracks = reviewTracks.filter(
    (track) => !publicationExcludedTrackIds.includes(track.id),
  );
  const publicationExportCount =
    effectivePublicationTracks.length * effectivePublicationPresets.length;
  const treatedTrackCount = tracks.filter(
    (track) => track.packageStatus === "treated",
  ).length;
  const audioWarningCount = tracks.filter(
    (track) =>
      track.audioInfo?.analysis?.risk &&
      track.audioInfo.analysis.risk !== "safe",
  ).length;

  function dismissToast(id: number) {
    const timer = toastTimersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    toastTimersRef.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function showToast(
    message: string,
    tone: ToastTone = "success",
    options: { copyText?: string; persistent?: boolean } = {},
  ) {
    if (!message) return;
    const id = ++toastSequenceRef.current;
    const notice = { id, message, tone, copyText: options.copyText };
    setToasts((current) =>
      [
        ...current.filter(
          (toast) => toast.message !== message || toast.tone !== tone,
        ),
        notice,
      ].slice(-4),
    );
    setNotificationLog((current) => [notice, ...current].slice(0, 50));
    if (!options.persistent) {
      // Errors linger longer (10s) so they can be read/copied, but still clear
      // on their own; the bell keeps the full history.
      const duration =
        tone === "error" ? 10_000 : tone === "warning" ? 7_000 : 5_000;
      const timer = window.setTimeout(() => dismissToast(id), duration);
      toastTimersRef.current.set(id, timer);
    }
  }

  function setBatchFeedback(message: string, tone: ToastTone = "success") {
    showToast(message, tone);
  }

  function setError(message: string) {
    if (!message) {
      setToasts((current) => current.filter((toast) => toast.tone !== "error"));
      return;
    }
    showToast(message, "error", { copyText: message });
  }

  function requestConfirmation(options: {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: InteractionDialogState["tone"];
  }) {
    return new Promise<boolean>((resolve) => {
      setInteractionDialog({
        id: ++dialogSequenceRef.current,
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel ?? "Cancelar",
        tone: options.tone ?? "default",
        resolve: (value) => resolve(value === true),
      });
    });
  }

  function requestTextInput(options: {
    title: string;
    message: string;
    label: string;
    value: string;
    confirmLabel: string;
    cancelLabel?: string;
  }) {
    return new Promise<string | null>((resolve) => {
      setInteractionDialog({
        id: ++dialogSequenceRef.current,
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel ?? "Cancelar",
        tone: "default",
        input: { label: options.label, value: options.value },
        resolve: (value) =>
          resolve(typeof value === "string" ? value.trim() || null : null),
      });
    });
  }

  function closeInteractionDialog(value: string | boolean | null) {
    const dialog = interactionDialog;
    setInteractionDialog(null);
    dialog?.resolve(value);
  }

  useEffect(() => {
    void loadWorkspaceBaseline();
    void restoreOutputDirectory();
    void restoreJobHistory();
  }, []);

  // Once any open path produces tracks, leave the Setup card for the workspace.
  useEffect(() => {
    if (tracks.length > 0) setSetupPanelOpen(false);
  }, [tracks.length]);

  // Auto-analyze the active track's quality the first time it is selected, so
  // the Qualidade tab is populated without a manual "Analisar" click (runs once
  // per track, lazily, to avoid hammering ffmpeg for the whole library upfront).
  useEffect(() => {
    if (!selectedTrack) return;
    if (selectedTrack.audioInfo?.analysis) return;
    if (analyzingTrackIds.includes(selectedTrack.id)) return;
    void analyzeSelectedAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrackId]);

  // Decode a static waveform for the selected track (once) so the technical
  // preview shows the shape without playback.
  useEffect(() => {
    if (!selectedTrack) return;
    void computeStaticWaveform(selectedTrack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrackId]);

  async function computeStaticWaveform(track: TrackDraft) {
    if (
      !track ||
      staticWaveforms[track.id] ||
      staticWaveformRequestsRef.current.has(track.id)
    ) {
      return;
    }
    const url =
      track.sourceUrl ??
      (track.source === "input"
        ? `/api/audio/${encodeURIComponent(track.sourceKey)}`
        : "");
    if (!track.sourceFile && !url) return;
    staticWaveformRequestsRef.current.add(track.id);
    try {
      const arrayBuffer = track.sourceFile
        ? await track.sourceFile.arrayBuffer()
        : await (await fetch(url)).arrayBuffer();
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const context = new AudioCtx();
      const audio = await context.decodeAudioData(arrayBuffer);
      void context.close();
      const channel = audio.getChannelData(0);
      const buckets = 360;
      const bucketSize = Math.max(1, Math.floor(channel.length / buckets));
      const peaks: number[] = [];
      for (let index = 0; index < buckets; index += 1) {
        let max = 0;
        const start = index * bucketSize;
        for (let offset = 0; offset < bucketSize; offset += 1) {
          const value = Math.abs(channel[start + offset] ?? 0);
          if (value > max) max = value;
        }
        peaks.push(max);
      }
      const norm = Math.max(0.0001, ...peaks);
      setStaticWaveforms((current) => ({
        ...current,
        [track.id]: peaks.map((peak) => peak / norm),
      }));
    } catch {
      // A static waveform is a nice-to-have; ignore decode failures.
    } finally {
      staticWaveformRequestsRef.current.delete(track.id);
    }
  }

  useEffect(() => {
    const syncPanelMode = () => {
      const shouldFloat =
        window.innerWidth <= 980 ||
        window.innerWidth - leftRailWidth - rightRailWidth <
          PANEL_FLOATING_STAGE_WIDTH;
      setFloatingPanels((current) => {
        if (shouldFloat && !current) {
          setLeftCollapsed(true);
          setRightCollapsed(true);
        }
        return shouldFloat;
      });
    };
    syncPanelMode();
    window.addEventListener("resize", syncPanelMode);
    return () => window.removeEventListener("resize", syncPanelMode);
  }, [leftRailWidth, rightRailWidth]);

  useEffect(() => {
    if (!floatingPanels) return;
    if (!leftCollapsed && !rightCollapsed) {
      setLeftCollapsed(true);
      setRightCollapsed(true);
    }
  }, [floatingPanels, leftCollapsed, rightCollapsed]);

  useEffect(() => {
    audioBandsRef.current = audioBands;
  }, [audioBands]);

  useEffect(() => {
    if (selectedTrack?.audioInfo?.hasEmbeddedCover) {
      void loadEmbeddedArtwork(selectedTrack);
    }
  }, [selectedTrack?.id]);

  useEffect(() => {
    savePanelWidths({ left: leftRailWidth, right: rightRailWidth });
  }, [leftRailWidth, rightRailWidth]);

  useEffect(() => {
    savePodcastEnabled(podcastEnabled);
    if (!podcastEnabled && audioStageView === "podcast") {
      setAudioStageView("edit");
    }
  }, [podcastEnabled, audioStageView]);

  // setWorkspaceTracks marks the exact tracks array created by a project load.
  // The auto-save below skips only that loaded array, so a quick first edit made
  // before the debounce fires is still persisted instead of being mistaken for
  // hydration noise.
  const hydratingTracksRef = useRef<TrackDraft[] | null>(null);

  useEffect(() => {
    if (!tracks.length) return;
    const timeout = window.setTimeout(() => {
      if (hydratingTracksRef.current === tracks) {
        hydratingTracksRef.current = null;
        return;
      }
      hydratingTracksRef.current = null;
      const snapshot = createSnapshot();
      void saveSnapshot(snapshot);
      void saveActiveProjectSnapshot(snapshot);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [
    tracks,
    selectedTrackId,
    workflowMode,
    activeStep,
    outputPreset,
    qualityProfile,
    publicationPresetId,
    publicationClipStart,
    publicationClipDuration,
    publicationIncludeLyrics,
    publicationGenerateDataFiles,
    publicationAssetMode,
    publicationAssetOverrides,
    showMetadata,
    cover,
    coverSeriesSettings,
    workspaceMode,
    audioStageView,
    visualStageView,
    podcastEnabled,
    selectedInputProjectId,
  ]);

  useEffect(() => {
    return () => {
      cancelPendingProjectSnapshotSave();
      for (const timer of toastTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    const validProjectIds = new Set(inputProjects.map((project) => project.id));
    setCleanupProjectIds((current) => {
      const next = current.filter((projectId) =>
        validProjectIds.has(projectId),
      );
      return next.length === current.length ? current : next;
    });
  }, [inputProjects]);

  // Boot without auto-loading a project: fetch presets/settings and the list of
  // internal projects so the Setup picker is populated, then wait for the user
  // to open a folder/project explicitly.
  async function loadWorkspaceBaseline() {
    try {
      const [snapshot, presetPayload] = await Promise.all([
        loadSnapshot(),
        fetchJsonWithRetry<{ presets?: ScenePresetV3[] }>(
          "/api/visual-presets",
        ),
      ]);
      setVisualPresets(
        normalizeVisualPresetList(
          presetPayload.presets ?? builtinVisualPresets,
        ),
      );
      applySnapshotSettings(snapshot, { includeCover: false });
      try {
        const project = await fetchJsonWithRetry<{
          inputProjects?: InternalInputProject[];
          inputDirectory?: string;
          outputDirectory?: string;
        }>("/api/project");
        const projects = (project.inputProjects ?? []).map(
          (item): InputProjectOption => ({ ...item, source: "internal" }),
        );
        if (inputDirectoryRef.current || musicDirectoryRef.current) return;
        setInputProjects(projects);
        setInputFolderName(project.inputDirectory ?? "input");
        setInputFolderKind("internal");
        if (!outputDirectoryRef.current) {
          setOutputFolderName(project.outputDirectory ?? "outputs");
          setOutputFolderKind("internal");
        }
      } catch {
        // No server / offline: the user can still open an external folder or
        // import individual files from the Setup card.
      }
    } catch (reason) {
      setError(messageOf(reason));
    }
  }

  async function loadInitialWorkspace() {
    try {
      const [snapshot, presetPayload] = await Promise.all([
        loadSnapshot(),
        fetchJsonWithRetry<{ presets?: ScenePresetV3[] }>(
          "/api/visual-presets",
        ),
      ]);
      setVisualPresets(
        normalizeVisualPresetList(
          presetPayload.presets ?? builtinVisualPresets,
        ),
      );
      applySnapshotSettings(snapshot);
      const restoredInputProjects = await restoreInputDirectory();
      const savedProjectId = window.localStorage.getItem(
        INPUT_PROJECT_STORAGE_KEY,
      );
      const projectToRestore =
        restoredInputProjects.find(
          (project) => project.id === savedProjectId,
        ) ?? restoredInputProjects[0];
      if (projectToRestore) {
        await selectInputProject(projectToRestore.id, restoredInputProjects);
        return;
      }
      const restored = await restoreMusicDirectory(snapshot);
      if (restored) return;
      await loadInternalInputWorkspace();
    } catch (reason) {
      setError(messageOf(reason));
    }
  }

  async function loadInternalInputWorkspace({
    requestedProjectId = "",
    saveId = DEFAULT_PROJECT_SAVE_ID,
    notify = false,
    snapshotOverride,
    useSnapshotOverride = false,
  }: {
    requestedProjectId?: string;
    saveId?: string;
    notify?: boolean;
    snapshotOverride?: ProjectSnapshot;
    useSnapshotOverride?: boolean;
  } = {}) {
    type InternalProjectPayload = {
      inputDirectory?: string;
      outputDirectory?: string;
      inputProject?: string;
      inputProjects?: InternalInputProject[];
      inputAudios?: Array<{ name: string; metadata: AudioInfo }>;
      inputArtwork?: InternalInputAsset[];
      inputLyrics?: InternalInputAsset[];
      defaultMetadata?: ProjectMetadataDefaults;
    };
    const readProject = (projectId = "") =>
      fetchJsonWithRetry<InternalProjectPayload>(
        projectId
          ? `/api/project?project=${encodeURIComponent(projectId)}`
          : "/api/project",
      );
    let project = await readProject(requestedProjectId);
    const projects = (project.inputProjects ?? []).map(
      (item): InputProjectOption => ({
        ...item,
        source: "internal",
      }),
    );
    const savedProjectId = window.localStorage.getItem(
      INPUT_PROJECT_STORAGE_KEY,
    );
    const selectedProjectId =
      requestedProjectId ||
      projects.find((item) => item.id === savedProjectId)?.id ||
      projects[0]?.id ||
      "";
    if (!requestedProjectId && selectedProjectId) {
      project = await readProject(selectedProjectId);
    }
    const inputName = project.inputDirectory ?? "input";
    const outputName = project.outputDirectory ?? "outputs";
    const selectedProject = projects.find(
      (item) => item.id === selectedProjectId,
    );
    const baseTracks = (project.inputAudios ?? []).map(
      (audio: { name: string; metadata: AudioInfo }) =>
        trackFromInput(audio.name, audio.metadata, project.defaultMetadata),
    );
    const artworkEntries = await loadInternalAssetEntries(
      project.inputArtwork ?? [],
    );
    const lyricEntries = await loadInternalAssetEntries(
      project.inputLyrics ?? [],
    );
    const inputTracks = await attachSuggestedLyrics(
      attachSuggestedArtwork(
        finalizeImportedTracks(baseTracks),
        artworkEntries,
      ),
      lyricEntries,
    );
    // Prefer the project's own .sonara snapshot. A caller-provided snapshot is
    // only allowed for explicit migration/import flows; boot and normal project
    // selection must not let the global IndexedDB snapshot clobber project state.
    const activeSnapshot =
      (useSnapshotOverride ? snapshotOverride : undefined) ??
      (selectedProjectId && selectedProjectId !== "."
        ? await loadInternalProjectSnapshot(selectedProjectId, saveId)
        : undefined);
    const saves =
      selectedProjectId && selectedProjectId !== "."
        ? await listInternalProjectSaves(selectedProjectId)
        : [defaultProjectSave];
    inputDirectoryRef.current = null;
    musicDirectoryRef.current = null;
    setInputFolderName(inputName);
    setInputFolderKind("internal");
    setFolderName(selectedProject?.name ?? inputName);
    setInputProjects(projects);
    setSelectedInputProjectId(selectedProjectId);
    setProjectSaves(ensureProjectSaveOption(saves, saveId));
    setSelectedProjectSaveId(saveId);
    setCleanupProjectIds([]);
    setWorkspaceWriteEnabled(false);
    if (!outputDirectoryRef.current) {
      setOutputFolderName(outputName);
      setOutputFolderKind("internal");
    }
    if (activeSnapshot) applySnapshotSettings(activeSnapshot);
    setWorkspaceTracks(inputTracks, activeSnapshot);
    setProjectStateStatus(
      inputTracks.length
        ? selectedProject
          ? `Usando ${selectedProject.name} em ${inputName}/ interno da raiz do projeto.`
          : `Usando ${inputName}/ interno da raiz do projeto.`
        : selectedProject
          ? `${selectedProject.name} não tem áudios carregáveis.`
          : `${inputName}/ interno não tem áudios carregáveis.`,
    );
    if (notify) {
      setBatchFeedback(
        inputTracks.length
          ? `${inputTracks.length} áudio${inputTracks.length === 1 ? "" : "s"} carregado${inputTracks.length === 1 ? "" : "s"} de ${selectedProject?.name ?? `${inputName}/ interno`}.`
          : `${selectedProject?.name ?? `${inputName}/ interno`} não tem áudios. Use Importar arquivos ou adicione arquivos nessa pasta.`,
        inputTracks.length ? "info" : "warning",
      );
    }
  }

  async function loadInternalAssetEntries(
    assets: InternalInputAsset[],
  ): Promise<DirectoryAssetEntry[]> {
    const loaded = await Promise.all(
      assets.map(async (asset) => {
        try {
          const response = await fetch(
            `/api/input-asset/${encodeURIComponent(asset.name)}`,
          );
          if (!response.ok) return null;
          const blob = await response.blob();
          const fileName = asset.name.split(/[\\/]+/).at(-1) ?? "asset";
          return {
            file: new File([blob], fileName, { type: blob.type }),
            relativePath: asset.name,
          } satisfies DirectoryAssetEntry;
        } catch {
          return null;
        }
      }),
    );
    return loaded.filter((entry): entry is DirectoryAssetEntry =>
      Boolean(entry),
    );
  }

  async function restoreMusicDirectory(snapshot?: ProjectSnapshot) {
    const handle = await loadDirectoryHandle("music-directory");
    if (!handle) return false;
    const permission = await handle.queryPermission?.({ mode: "read" });
    if (permission !== "granted") return false;
    musicDirectoryRef.current = handle;
    setInputFolderKind("external");
    setWorkspaceWriteEnabled(false);
    setFolderName(handle.name);
    await readMusicDirectory(handle, snapshot);
    return true;
  }

  async function restoreInputDirectory() {
    const handle = await loadDirectoryHandle("input-directory");
    if (!handle) {
      useInternalInputDirectory();
      return [];
    }
    const permission = await handle.queryPermission?.({ mode: "readwrite" });
    if (permission !== "granted") {
      useInternalInputDirectory(
        "A pasta de entrada externa precisa ser reautorizada. Voltando para input/ interno.",
      );
      return [];
    }
    inputDirectoryRef.current = handle;
    setInputFolderName(handle.name);
    setInputFolderKind("external");
    const projects = await discoverInputProjects(handle);
    setInputProjects(projects);
    return projects;
  }

  async function restoreOutputDirectory() {
    const handle = await loadDirectoryHandle("output-directory");
    if (!handle) {
      useInternalOutputDirectory();
      return;
    }
    const permission = await handle.queryPermission?.({ mode: "readwrite" });
    if (permission !== "granted") {
      useInternalOutputDirectory(true, {
        message:
          "A pasta de saída externa precisa ser reautorizada. Voltando para outputs/ interno.",
        tone: "warning",
      });
      return;
    }
    outputDirectoryRef.current = handle;
    setOutputFolderName(handle.name);
    setOutputFolderKind("external");
  }

  async function restoreJobHistory() {
    try {
      const payload = await fetchJsonWithRetry<{
        jobs: RenderJob[];
        queuePaused: boolean;
      }>("/api/jobs");
      setJobs(payload.jobs);
      setQueuePaused(payload.queuePaused);
      for (const job of payload.jobs) {
        if (["queued", "paused", "running"].includes(job.status)) {
          pollJob(job.id);
        }
      }
    } catch (reason) {
      setError(localApiMessage(reason, "restaurar o historico de jobs"));
    }
  }

  async function loadStorageUsage() {
    try {
      setStorageUsage(await fetchJson<StorageUsage>("/api/storage/usage"));
    } catch (reason) {
      setError(localApiMessage(reason, "consultar o armazenamento local"));
    }
  }

  async function openLocalSettings() {
    setSettingsOpen(true);
    await loadStorageUsage();
  }

  async function clearCompletedJobs(
    scope: "terminal" | "video-render" | "publication-asset" | "podcast-feed",
  ) {
    try {
      const payload = await fetchJson<{
        jobs: RenderJob[];
        queuePaused: boolean;
        removed: number;
      }>(`/api/jobs?scope=${scope}`, { method: "DELETE" });
      setJobs(payload.jobs);
      setQueuePaused(payload.queuePaused);
      setBatchFeedback(
        payload.removed === 1
          ? "1 item concluído foi removido do histórico."
          : `${payload.removed} itens concluídos foram removidos do histórico.`,
      );
      await loadStorageUsage();
    } catch (reason) {
      setError(localApiMessage(reason, "limpar o histórico concluído"));
    }
  }

  async function cleanupLocalFiles(scope: "temporary" | "generated") {
    const label =
      scope === "temporary"
        ? "arquivos temporários"
        : "arquivos gerados locais que ainda permanecem no Sonara Hub";
    if (
      !(await requestConfirmation({
        title:
          scope === "temporary"
            ? "Excluir arquivos temporários?"
            : "Excluir arquivos gerados locais?",
        message: `Excluir ${label}? A sessão e os arquivos já movidos para pastas externas serão preservados.`,
        confirmLabel:
          scope === "temporary"
            ? "Excluir temporários"
            : "Excluir arquivos gerados",
        tone: "danger",
      }))
    ) {
      return;
    }
    setCleanupBusy(true);
    try {
      const payload = await fetchJson<{
        deleted: { files: number; bytes: number };
        usage: StorageUsage;
      }>("/api/storage/cleanup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      setStorageUsage(payload.usage);
      setBatchFeedback(
        `${formatFileCount(payload.deleted.files)} removido${payload.deleted.files === 1 ? "" : "s"} do armazenamento local.`,
      );
    } catch (reason) {
      setError(localApiMessage(reason, "limpar os arquivos locais"));
    } finally {
      setCleanupBusy(false);
    }
  }

  function toggleCleanupProjectSelection(projectId: string, selected: boolean) {
    setCleanupProjectIds((current) => {
      if (selected) {
        return current.includes(projectId) ? current : [...current, projectId];
      }
      return current.filter((item) => item !== projectId);
    });
  }

  async function cleanupProjectState(scope: ProjectCleanupScope) {
    const selectedProjectIds = new Set(cleanupProjectIds);
    const isCleanable = (project: InputProjectOption) =>
      isBrowserInputProject(project) ||
      (project.source === "internal" && project.id !== ".");
    const targets =
      scope === "current"
        ? inputProjects.filter(
            (project) =>
              project.id === selectedInputProjectId && isCleanable(project),
          )
        : scope === "selected"
          ? inputProjects.filter(
              (project) =>
                selectedProjectIds.has(project.id) && isCleanable(project),
            )
          : inputProjects.filter(isCleanable);
    if (!targets.length) {
      setBatchFeedback(
        scope === "selected"
          ? "Selecione ao menos um projeto para limpar."
          : "Nenhum projeto com preferências salvas encontrado.",
        "info",
      );
      return;
    }
    const label =
      scope === "current"
        ? `as preferências de ${targets[0].name}`
        : scope === "selected"
          ? `as preferências de ${targets.length} projeto${targets.length === 1 ? "" : "s"} selecionado${targets.length === 1 ? "" : "s"}`
          : `as preferências de ${targets.length} projetos`;
    if (
      !(await requestConfirmation({
        title:
          scope === "current"
            ? "Limpar projeto atual?"
            : scope === "selected"
              ? "Limpar projetos selecionados?"
              : "Limpar todos os projetos?",
        message: `Excluir ${label}? Arquivos de áudio, capas e backups não serão removidos.`,
        confirmLabel:
          scope === "current"
            ? "Limpar projeto"
            : scope === "selected"
              ? "Limpar selecionados"
              : "Limpar todos",
        tone: "danger",
      }))
    ) {
      return;
    }
    setCleanupBusy(true);
    try {
      cancelPendingProjectSnapshotSave();
      const cleanedProjectIds = new Set(targets.map((project) => project.id));
      await Promise.all(
        targets.map((project) =>
          isBrowserInputProject(project)
            ? removeProjectSnapshot(project.handle)
            : deleteInternalProjectSnapshot(project.id),
        ),
      );
      setCleanupProjectIds((current) =>
        current.filter((projectId) => !cleanedProjectIds.has(projectId)),
      );
      setProjectStateStatus(
        scope === "current"
          ? "Preferências do projeto atual limpas."
          : scope === "selected"
            ? "Preferências dos projetos selecionados limpas."
            : "Preferências dos projetos da entrada limpas.",
      );
      setBatchFeedback(
        scope === "current"
          ? "Preferências do projeto atual removidas."
          : scope === "selected"
            ? "Preferências dos projetos selecionados removidas."
            : "Preferências de todos os projetos detectados removidas.",
        "info",
      );
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setCleanupBusy(false);
    }
  }

  async function chooseInputDirectory() {
    if (!window.showDirectoryPicker) {
      await loadInternalInputWorkspace({ notify: true });
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({
        id: "sonara-hub-input",
        mode: "readwrite",
        startIn: "music",
      });
      let permission = await handle.queryPermission?.({ mode: "readwrite" });
      if (permission !== "granted") {
        permission = await handle.requestPermission?.({ mode: "readwrite" });
      }
      if (permission !== "granted") {
        if (tracks.length) {
          setBatchFeedback(
            "A pasta de entrada externa precisa de permissão. Mantive o workspace atual.",
            "warning",
          );
        } else {
          await loadInternalInputWorkspace({ notify: true });
        }
        return;
      }
      const projects = await discoverInputProjects(handle);
      if (!projects[0]) {
        setBatchFeedback(
          `${handle.name} não tem projetos com áudio carregável. Mantive o workspace atual.`,
          "warning",
        );
        return;
      }
      await saveDirectoryHandle("input-directory", handle);
      inputDirectoryRef.current = handle;
      setInputFolderName(handle.name);
      setInputFolderKind("external");
      setInputProjects(projects);
      setWorkspaceWriteEnabled(false);
      setCleanupProjectIds([]);
      if (projects[0]) {
        await selectInputProject(projects[0].id, projects);
      }
    } catch (reason) {
      if ((reason as DOMException)?.name !== "AbortError") {
        if (tracks.length) {
          setBatchFeedback(
            `Não foi possível abrir a pasta externa: ${messageOf(reason)}. Mantive o workspace atual.`,
            "warning",
          );
        } else {
          await loadInternalInputWorkspace({ notify: true });
        }
      }
    }
  }

  async function chooseMusicDirectory() {
    await chooseInputDirectory();
  }

  async function selectInputProject(
    projectId: string,
    candidates = inputProjects,
  ) {
    const project = candidates.find((item) => item.id === projectId);
    if (!project) return;
    setSelectedInputProjectId(project.id);
    window.localStorage.setItem(INPUT_PROJECT_STORAGE_KEY, project.id);
    if (project.source === "internal") {
      setProjectStateStatus(
        `Carregando ${project.name} em input/ interno da raiz do projeto...`,
      );
      await loadInternalInputWorkspace({ requestedProjectId: project.id });
      return;
    }
    if (!project.handle) return;
    setFolderName(project.name);
    setWorkspaceWriteEnabled(false);
    musicDirectoryRef.current = project.handle;
    setInputFolderKind("external");
    await saveDirectoryHandle("music-directory", project.handle);
    const saves = await listProjectSaves(project.handle);
    setProjectSaves(saves);
    setSelectedProjectSaveId(DEFAULT_PROJECT_SAVE_ID);
    const projectSnapshot = await loadProjectSnapshot(
      project.handle,
      DEFAULT_PROJECT_SAVE_ID,
    );
    applySnapshotSettings(projectSnapshot);
    await readMusicDirectory(project.handle, projectSnapshot);
    setProjectStateStatus(
      projectSnapshot
        ? "Preferências do projeto carregadas."
        : "Projeto sem preferências salvas ainda.",
    );
  }

  function selectedInputProjectName() {
    return (
      inputProjects.find((project) => project.id === selectedInputProjectId)
        ?.name ||
      folderName ||
      inputFolderName
    );
  }

  function selectedInputProject() {
    return inputProjects.find(
      (project) => project.id === selectedInputProjectId,
    );
  }

  async function selectProjectSave(saveId: string) {
    const project = selectedInputProject();
    if (!project) return;
    setProjectSavesBusy(true);
    try {
      cancelPendingProjectSnapshotSave();
      const snapshot = isBrowserInputProject(project)
        ? await loadProjectSnapshot(project.handle, saveId)
        : project.source === "internal" && project.id !== "."
          ? await loadInternalProjectSnapshot(project.id, saveId)
          : undefined;
      if (!snapshot) {
        setBatchFeedback(
          "Este save ainda não tem preferências salvas.",
          "warning",
        );
        return;
      }
      const saveOption =
        projectSaves.find((save) => save.id === saveId) ??
        projectSaveOptionFromSnapshot(saveId, snapshot);
      setSelectedProjectSaveId(saveId);
      setProjectSaves((current) =>
        ensureProjectSaveOption(current, saveOption),
      );
      if (isBrowserInputProject(project)) {
        applySnapshotSettings(snapshot);
        await readMusicDirectory(project.handle, snapshot);
      } else {
        await loadInternalInputWorkspace({
          requestedProjectId: project.id,
          saveId,
          snapshotOverride: snapshot,
          useSnapshotOverride: true,
        });
      }
      setProjectStateStatus(`Save "${saveOption.name}" carregado.`);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setProjectSavesBusy(false);
    }
  }

  async function saveProjectAs() {
    const project = selectedInputProject();
    if (!project || !tracks.length) {
      setBatchFeedback("Abra um projeto antes de criar um save.", "warning");
      return;
    }
    const name = await requestTextInput({
      title: "Salvar configuração",
      message:
        "Crie um save nomeado para testar outra configuração sem substituir o padrão.",
      label: "Nome do save",
      value: "",
      confirmLabel: "Salvar",
    });
    if (!name) return;
    const save = { id: projectSaveIdFromName(name), name };
    const exists = projectSaves.some((item) => item.id === save.id);
    if (
      exists &&
      !(await requestConfirmation({
        title: "Substituir save?",
        message: `Já existe um save chamado "${name}". Substituir o conteúdo dele pelo estado atual?`,
        confirmLabel: "Substituir",
      }))
    ) {
      return;
    }
    setProjectSavesBusy(true);
    try {
      cancelPendingProjectSnapshotSave();
      const snapshot = createSnapshot();
      if (isBrowserInputProject(project)) {
        await writeProjectSnapshot(project.handle, snapshot, save);
        setProjectSaves(await listProjectSaves(project.handle));
      } else if (project.source === "internal" && project.id !== ".") {
        await saveInternalProjectSnapshot(project.id, snapshot, save);
        setProjectSaves(await listInternalProjectSaves(project.id));
      }
      setSelectedProjectSaveId(save.id);
      setProjectStateStatus(`Save "${save.name}" criado.`);
      setBatchFeedback(`Save "${save.name}" criado.`);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setProjectSavesBusy(false);
    }
  }

  async function renameProjectSave() {
    const project = selectedInputProject();
    const currentSave = projectSaves.find(
      (save) => save.id === selectedProjectSaveId,
    );
    if (!project || !currentSave || currentSave.isDefault) return;
    const name = await requestTextInput({
      title: "Renomear save",
      message: "O conteúdo atual será mantido no novo nome.",
      label: "Novo nome",
      value: currentSave.name,
      confirmLabel: "Renomear",
    });
    if (!name || name === currentSave.name) return;
    const nextSave = { id: projectSaveIdFromName(name), name };
    const exists = projectSaves.some(
      (save) => save.id === nextSave.id && save.id !== currentSave.id,
    );
    if (
      exists &&
      !(await requestConfirmation({
        title: "Substituir save?",
        message: `Já existe um save chamado "${name}". Substituir pelo save atual?`,
        confirmLabel: "Substituir",
      }))
    ) {
      return;
    }
    setProjectSavesBusy(true);
    try {
      cancelPendingProjectSnapshotSave();
      const snapshot = createSnapshot();
      if (isBrowserInputProject(project)) {
        await writeProjectSnapshot(project.handle, snapshot, nextSave);
        await removeProjectSnapshot(project.handle, currentSave.id);
        setProjectSaves(await listProjectSaves(project.handle));
      } else if (project.source === "internal" && project.id !== ".") {
        await saveInternalProjectSnapshot(project.id, snapshot, nextSave);
        await deleteInternalProjectSnapshot(project.id, currentSave.id);
        setProjectSaves(await listInternalProjectSaves(project.id));
      }
      setSelectedProjectSaveId(nextSave.id);
      setProjectStateStatus(`Save renomeado para "${nextSave.name}".`);
      setBatchFeedback(`Save renomeado para "${nextSave.name}".`);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setProjectSavesBusy(false);
    }
  }

  async function deleteProjectSave() {
    const project = selectedInputProject();
    const currentSave = projectSaves.find(
      (save) => save.id === selectedProjectSaveId,
    );
    if (!project || !currentSave || currentSave.isDefault) return;
    if (
      !(await requestConfirmation({
        title: "Excluir save?",
        message: `Excluir o save "${currentSave.name}"? O áudio e outros arquivos do projeto não serão removidos.`,
        confirmLabel: "Excluir save",
        tone: "danger",
      }))
    ) {
      return;
    }
    setProjectSavesBusy(true);
    try {
      cancelPendingProjectSnapshotSave();
      if (isBrowserInputProject(project)) {
        await removeProjectSnapshot(project.handle, currentSave.id);
        setProjectSaves(await listProjectSaves(project.handle));
      } else if (project.source === "internal" && project.id !== ".") {
        await deleteInternalProjectSnapshot(project.id, currentSave.id);
        setProjectSaves(await listInternalProjectSaves(project.id));
      }
      setSelectedProjectSaveId(DEFAULT_PROJECT_SAVE_ID);
      setProjectStateStatus(`Save "${currentSave.name}" excluído.`);
      setBatchFeedback(`Save "${currentSave.name}" excluído.`);
      await selectProjectSave(DEFAULT_PROJECT_SAVE_ID);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setProjectSavesBusy(false);
    }
  }

  async function enableWorkspaceWrites() {
    const handle = musicDirectoryRef.current;
    if (!handle) {
      await chooseMusicDirectory();
      if (!musicDirectoryRef.current) {
        setError(
          "Substituir ao finalizar exige uma pasta escolhida com permissão de escrita. O input/ interno permanece em modo não destrutivo.",
        );
      }
      return;
    }
    let permission = await handle.queryPermission?.({ mode: "readwrite" });
    if (permission !== "granted") {
      permission = await handle.requestPermission?.({ mode: "readwrite" });
    }
    if (permission !== "granted") {
      setError("A pasta de trabalho precisa de permissão de escrita.");
      return;
    }
    setWorkspaceWriteEnabled(true);
    await ensureAlbumArtworkDirectories(
      handle,
      directoryImportPrefix(handle.name),
      albumArtworkDirectoryPaths(tracks.map((track) => track.sourceKey)),
    );
    setBatchFeedback(
      "Substituição ao finalizar ativada. Os originais só serão trocados se todo o processamento selecionado terminar.",
      "warning",
    );
  }

  function disableWorkspaceWrites() {
    setWorkspaceWriteEnabled(false);
    destructiveAudioBatchRef.current = null;
    setBatchFeedback(
      "Modo não destrutivo reativado. Processamentos futuros gerarão cópias sem substituir originais.",
      "info",
    );
  }

  async function chooseOutputDirectory() {
    if (!window.showDirectoryPicker) {
      useInternalOutputDirectory(true);
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({
        id: "sonara-hub-output",
        mode: "readwrite",
        startIn: "videos",
      });
      let permission = await handle.queryPermission?.({ mode: "readwrite" });
      if (permission !== "granted") {
        permission = await handle.requestPermission?.({ mode: "readwrite" });
      }
      if (permission !== "granted") {
        useInternalOutputDirectory(true, {
          message:
            "A pasta de saída externa precisa de permissão. Usando outputs/ interno.",
          tone: "warning",
        });
        return;
      }
      await saveDirectoryHandle("output-directory", handle);
      outputDirectoryRef.current = handle;
      setOutputFolderName(handle.name);
      setOutputFolderKind("external");
    } catch (reason) {
      if ((reason as DOMException)?.name !== "AbortError") {
        useInternalOutputDirectory(true);
      }
    }
  }

  function useInternalInputDirectory(message?: string) {
    inputDirectoryRef.current = null;
    musicDirectoryRef.current = null;
    setInputFolderName("input");
    setInputFolderKind("internal");
    setProjectSaves([defaultProjectSave]);
    setSelectedProjectSaveId(DEFAULT_PROJECT_SAVE_ID);
    setWorkspaceWriteEnabled(false);
    if (message) setBatchFeedback(message, "warning");
  }

  function useInternalOutputDirectory(
    notify = false,
    options: { message?: string; tone?: ToastTone } = {},
  ) {
    outputDirectoryRef.current = null;
    setOutputFolderName("outputs");
    setOutputFolderKind("internal");
    if (notify) {
      setBatchFeedback(
        options.message ??
          "Usando outputs/ interno da raiz do projeto. Para escolher outra pasta, abra em um navegador com suporte a seleção persistente.",
        options.tone ?? "info",
      );
    }
  }

  async function readMusicDirectory(
    handle: FileSystemDirectoryHandle,
    snapshot?: ProjectSnapshot,
  ) {
    setError("");
    setFolderImportProgress({ current: 0, total: 0, name: "Lendo pasta" });
    const { audioEntries, artworkEntries, lyricEntries } =
      await collectDirectoryAssets(handle, directoryImportPrefix(handle.name));
    const next: TrackDraft[] = [];
    const metadataMode = podcastEnabled ? "podcast" : "audio";
    setFolderImportProgress({
      current: 0,
      total: audioEntries.length,
      name: handle.name,
    });
    for (const [index, entry] of audioEntries.entries()) {
      setFolderImportProgress({
        current: index + 1,
        total: audioEntries.length,
        name: entry.relativePath,
      });
      const info = await readUploadedAudioMetadata(
        entry.file,
        entry.relativePath,
        true,
        metadataMode,
      );
      next.push(trackFromFile(entry.file, info, entry.relativePath));
    }
    next.sort((first, second) =>
      first.sourceKey.localeCompare(second.sourceKey, "pt-BR"),
    );
    setFolderName(handle.name);
    // Switching the work folder must drop artwork state from the previous one,
    // otherwise the manual cover override and embedded-art cache keep showing
    // the old image (coverForTrack returns the global `cover` first).
    setCover(null);
    setEmbeddedArtworkByTrackId({});
    embeddedArtworkRequestsRef.current.clear();
    const withArtwork = attachSuggestedArtwork(
      finalizeImportedTracks(next),
      artworkEntries,
    );
    const withLyrics = await attachSuggestedLyrics(withArtwork, lyricEntries);
    setWorkspaceTracks(withLyrics, snapshot);
    setFolderImportProgress(null);
    const detectedLyrics = withLyrics.filter(
      (track) => track.lyricsOptions?.length,
    ).length;
    const appliedLyrics = withLyrics.filter(
      (track) => track.lyricsSourcePath,
    ).length;
    if (lyricEntries.length) {
      setBatchFeedback(
        `${lyricEntries.length} arquivo${lyricEntries.length === 1 ? "" : "s"} de letra detectado${lyricEntries.length === 1 ? "" : "s"} · ${appliedLyrics} aplicado${appliedLyrics === 1 ? "" : "s"} automaticamente · ${detectedLyrics - appliedLyrics} para revisar.`,
        detectedLyrics === appliedLyrics ? "info" : "warning",
      );
    }
  }

  async function readUploadedAudioMetadata(
    file: File,
    relativePath?: string,
    quick = false,
    mode: "audio" | "podcast" = "audio",
  ) {
    const metadataFile = mode === "podcast" ? podcastMetadataSlice(file) : file;
    const metadataIsPartial = metadataFile.size !== file.size;
    const formData = new FormData();
    formData.append("audio", metadataFile);
    formData.append(
      "relativePath",
      relativePath || file.webkitRelativePath || file.name,
    );
    formData.append("quick", String(quick));
    if (metadataIsPartial) {
      formData.append("partial", "true");
      formData.append("originalSizeBytes", String(file.size));
    }
    try {
      const payload = await fetchJsonWithRetry<{
        metadata: AudioInfo;
        analysis?: AudioTechnicalAnalysis | null;
        suggestions: Partial<AudioTagDraft>;
      }>(
        "/api/audio/analyze",
        {
          method: "POST",
          body: formData,
        },
        { attempts: 3, delayMs: 350 },
      );
      return {
        ...payload.metadata,
        sizeBytes: metadataIsPartial ? file.size : payload.metadata.sizeBytes,
        durationSeconds: metadataIsPartial
          ? (estimateDurationFromBitrate(file.size, payload.metadata.bitrate) ??
            payload.metadata.durationSeconds)
          : payload.metadata.durationSeconds,
        metadataPartial: metadataIsPartial,
        analysis: payload.analysis ?? undefined,
        suggestions: payload.suggestions,
      };
    } catch (reason) {
      setError(localApiMessage(reason, "ler os metadados do áudio"));
      return undefined;
    }
  }

  function podcastMetadataSlice(file: File) {
    if (file.size <= PODCAST_METADATA_SLICE_BYTES) return file;
    const chunk = file.slice(0, PODCAST_METADATA_SLICE_BYTES, file.type);
    return new File([chunk], file.name, {
      lastModified: file.lastModified,
      type: file.type,
    });
  }

  function estimateDurationFromBitrate(
    sizeBytes: number,
    bitrate?: number | null,
  ) {
    const safeSizeBytes = Number(sizeBytes);
    const safeBitrate = Number(bitrate);
    if (
      !Number.isFinite(safeSizeBytes) ||
      safeSizeBytes <= 0 ||
      !Number.isFinite(safeBitrate) ||
      safeBitrate <= 0
    ) {
      return null;
    }
    return (safeSizeBytes * 8) / safeBitrate;
  }

  function appendTrackAudioSource(formData: FormData, track: TrackDraft) {
    if (track.source === "input") {
      formData.append("inputAudio", track.sourceKey);
      return true;
    }
    if (!track.sourceFile) return false;
    formData.append("audio", track.sourceFile);
    formData.append(
      "relativePath",
      track.sourceFile.webkitRelativePath || track.sourceKey,
    );
    return true;
  }

  async function loadEmbeddedArtwork(track: TrackDraft) {
    if (
      !track.audioInfo?.hasEmbeddedCover ||
      embeddedArtworkRequestsRef.current.has(track.id) ||
      Object.prototype.hasOwnProperty.call(embeddedArtworkByTrackId, track.id)
    ) {
      return;
    }
    embeddedArtworkRequestsRef.current.add(track.id);
    const formData = new FormData();
    if (!appendTrackAudioSource(formData, track)) {
      embeddedArtworkRequestsRef.current.delete(track.id);
      return;
    }
    try {
      const payload = await fetchJson<{ artworkUrl: string | null }>(
        "/api/audio/artwork-preview",
        {
          method: "POST",
          body: formData,
        },
      );
      setEmbeddedArtworkByTrackId((current) => ({
        ...current,
        [track.id]: payload.artworkUrl,
      }));
    } catch {
      setEmbeddedArtworkByTrackId((current) => ({
        ...current,
        [track.id]: null,
      }));
    } finally {
      embeddedArtworkRequestsRef.current.delete(track.id);
    }
  }

  async function onFallbackFolder(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    const audioFiles = selectedFiles.filter(
      (file) =>
        isAudioName(file.name) &&
        !isPrivateAudioPath(file.webkitRelativePath || file.name),
    );
    const artworkEntries = selectedFiles
      .filter(
        (file) =>
          isArtworkName(file.name) &&
          !isPrivateAssetPath(file.webkitRelativePath || file.name),
      )
      .map((file) => ({
        file,
        relativePath: file.webkitRelativePath || file.name,
      }));
    const next: TrackDraft[] = [];
    setFolderImportProgress({
      current: 0,
      total: audioFiles.length,
      name: "Importando pasta",
    });
    for (const [index, file] of audioFiles.entries()) {
      setFolderImportProgress({
        current: index + 1,
        total: audioFiles.length,
        name: file.name,
      });
      const relativePath = file.webkitRelativePath || file.name;
      next.push(
        trackFromFile(
          file,
          await readUploadedAudioMetadata(file, relativePath, true),
          relativePath,
        ),
      );
    }
    setFolderName("Pasta selecionada");
    const finalized = attachSuggestedArtwork(
      finalizeImportedTracks(next),
      artworkEntries,
    );
    setTracks(finalized);
    setSelectedTrackId(finalized[0]?.id ?? "");
    setFolderImportProgress(null);
  }

  async function addAudioFile(file: File | undefined) {
    if (!file) return;
    const track = trackFromFile(file, await readUploadedAudioMetadata(file));
    setTracks((current) => [...current, track]);
    setSelectedTrackId(track.id);
  }

  async function replaceSelectedAudio(file: File | undefined) {
    if (!file || !selectedTrack) return;
    const info = await readUploadedAudioMetadata(file);
    updateSelectedTrack({
      sourceKey: file.name,
      sourceFile: file,
      sourceUrl: URL.createObjectURL(file),
      source: "upload",
      audioInfo: info,
    });
  }

  function updateSelectedTrack(patch: Partial<TrackDraft>) {
    if (!selectedTrack) return;
    setTracks((current) =>
      current.map((track) =>
        track.id === selectedTrack.id ? { ...track, ...patch } : track,
      ),
    );
  }

  function updateTrackDraft(trackId: string, patch: Partial<TrackDraft>) {
    setTracks((current) =>
      current.map((track) =>
        track.id === trackId ? { ...track, ...patch } : track,
      ),
    );
  }

  function coverForTrack(track?: TrackDraft) {
    return resolveTrackArtwork(track, cover);
  }

  function albumCoverForTrack(track?: TrackDraft) {
    return resolveAlbumArtwork(track, cover);
  }

  // Effective series settings for a track: its own override wins, otherwise the
  // shared album-wide defaults.
  function seriesSettingsForTrack(track?: TrackDraft): CoverSeriesSettings {
    return resolveCoverSeriesSettings(track, coverSeriesSettings);
  }

  // Series edits are scoped: "all" writes the album-wide defaults (and keeps any
  // per-track overrides in sync so every preview moves), while "current" forks an
  // override for just this track, seeded from whatever it currently shows.
  function applyCoverSeriesPatch(
    patch: Partial<CoverSeriesSettings>,
    scope: "all" | "current",
    trackId?: string,
  ) {
    const options = { scope, trackId };
    if (scope === "current" && trackId) {
      setTracks(
        (current) =>
          applyCoverSeriesScopePatch(
            current,
            coverSeriesSettings,
            patch,
            options,
          ).tracks,
      );
      return;
    }
    setCoverSeriesSettings(
      (current) =>
        applyCoverSeriesScopePatch([], current, patch, options)
          .coverSeriesSettings,
    );
    setTracks(
      (current) =>
        applyCoverSeriesScopePatch(current, coverSeriesSettings, patch, options)
          .tracks,
    );
  }

  function clearCoverSeriesOverride(trackId: string) {
    setTracks((current) => clearCoverSeriesScopeOverride(current, trackId));
  }

  function saveCoverSeriesDefault(settings = coverSeriesSettings) {
    const normalized = normalizeCoverSeriesClient(settings);
    setCoverSeriesSettings(normalized);
    saveCoverSeriesSettings(normalized);
    setBatchFeedback("Série visual salva como padrão local.");
  }

  function updateFileNamePattern(next: FileNamePattern) {
    const normalized = normalizeFileNamePattern(next);
    setFileNamePattern(normalized);
    saveFileNamePattern(normalized);
  }

  function updateTextSettings(patch: Partial<TextOverlaySettings>) {
    const trackId = selectedTrackId;
    setTracks((current) =>
      current.map((track) =>
        track.id === trackId
          ? {
              ...track,
              textSettings: mergeTextSettings(track.textSettings, patch),
            }
          : track,
      ),
    );
  }

  function applyTextToBatch(mode: TextBatchApplyMode = "all") {
    setTracks((current) =>
      applySelectedTextSettingsToBatch(
        current,
        selectedTrackId,
        cloneTextSettings,
        mode,
      ),
    );
    const label =
      mode === "position"
        ? "Posição do texto aplicada ao lote selecionado."
        : mode === "style"
          ? "Estilo do texto aplicado ao lote (posição preservada)."
          : "Texto do vídeo aplicado ao lote selecionado.";
    setBatchFeedback(label);
  }

  function captureLayersUndo(label: string) {
    if (!selectedTrack) return;
    setLayersUndo({
      trackId: selectedTrack.id,
      layers: selectedTrack.layers,
      label,
    });
  }

  function undoLayers() {
    if (!layersUndo) return;
    const snapshot = layersUndo;
    setTracks((current) =>
      current.map((track) =>
        track.id === snapshot.trackId
          ? { ...track, layers: snapshot.layers }
          : track,
      ),
    );
    setLayersUndo(null);
  }

  function addCoverLayerPreset(preset: CoverLayerPreset) {
    if (!selectedTrack) return;
    const nextLayers = layersWithCoverPreset(selectedTrack, preset, undefined);
    if (!nextLayers) {
      setError("Escolha uma capa planejada ou oferecida pela pasta antes.");
      return;
    }
    captureLayersUndo("aplicar capa");
    updateSelectedTrack({ layers: nextLayers });
  }

  function applyCoverLayerPresetToBatch(preset: CoverLayerPreset) {
    if (!selectedTrack) return;
    const template = selectedTrack.layers.find(isCoverLayer);
    let applied = 0;
    setTracks((current) =>
      current.map((track) => {
        if (!track.selectedForBatch) return track;
        const nextLayers = layersWithCoverPreset(track, preset, template);
        if (!nextLayers) return track;
        applied += 1;
        return { ...track, layers: nextLayers };
      }),
    );
    setBatchFeedback(
      applied
        ? `Capa aplicada a ${applied} faixa${applied === 1 ? "" : "s"} selecionada${applied === 1 ? "" : "s"}.`
        : "Nenhuma faixa selecionada tinha capa disponível.",
    );
  }

  function layersWithCoverPreset(
    track: TrackDraft,
    preset: CoverLayerPreset,
    template?: MediaLayerV2,
    coverFadeOut?: CoverFadeOutSettings,
  ) {
    const artwork = coverForTrack(track);
    if (!artwork) return null;
    const existing = track.layers.find(isCoverLayer);
    const layer = coverLayerFromArtwork(
      artwork,
      preset,
      template ?? existing,
      coverFadeOut,
    );
    const remaining = track.layers.filter((item) => !isCoverLayer(item));
    const ordered =
      preset === "background"
        ? [layer, ...remaining]
        : [...remaining.slice(0, 2), layer];
    return ordered.slice(0, 3).map((item, order) => ({ ...item, order }));
  }

  function clearSelectedCover() {
    if (selectedTrack?.coverOverride) {
      updateSelectedTrack({ coverOverride: null });
      return;
    }
    setCover(null);
    if (selectedTrack?.suggestedCover) {
      updateSelectedTrack({ useSuggestedCover: false });
    }
  }

  function restoreSuggestedCover(trackId = selectedTrack?.id) {
    const track = tracks.find((item) => item.id === trackId);
    if (!track?.suggestedCover) return;
    updateTrackDraft(track.id, {
      coverOverride: { ...track.suggestedCover, source: "manual" },
      useSuggestedCover: true,
    });
  }

  function selectSuggestedCover(trackId: string, relativePath: string) {
    const track = tracks.find((item) => item.id === trackId);
    const suggestedCover = track?.artworkOptions?.find(
      (option) => option.relativePath === relativePath,
    );
    if (!track || !suggestedCover) return;
    updateTrackDraft(track.id, {
      suggestedCover,
      coverOverride: { ...suggestedCover, source: "manual" },
      useSuggestedCover: true,
    });
  }

  function chooseCatalogCover(trackId: string) {
    setPendingCoverTrackId(trackId);
    setSelectedTrackId(trackId);
    coverInputRef.current?.click();
  }

  function handleCoverFileSelected(file: File | undefined) {
    const trackId = pendingCoverTrackId;
    setPendingCoverTrackId("");
    if (!file) return;
    const src = URL.createObjectURL(file);
    if (trackId) {
      updateTrackDraft(trackId, {
        coverOverride: {
          file,
          src,
          relativePath: file.name,
          source: "manual",
        },
        useSuggestedCover: true,
      });
      return;
    }
    setCover({ file, src });
  }

  function toggleLeftPanel() {
    const next = !leftCollapsed;
    setLeftCollapsed(next);
    if (!next && floatingPanels) setRightCollapsed(true);
  }

  function toggleRightPanel() {
    const next = !rightCollapsed;
    setRightCollapsed(next);
    if (!next && floatingPanels) setLeftCollapsed(true);
  }

  function startPanelResize(
    panel: "library" | "inspector",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (floatingPanels) return;
    event.preventDefault();
    event.stopPropagation();
    setResizingPanel(panel);

    const startX = event.clientX;
    const startWidth = panel === "library" ? leftRailWidth : rightRailWidth;
    const otherWidth = panel === "library" ? rightRailWidth : leftRailWidth;
    const bounds = panel === "library" ? LEFT_RAIL_BOUNDS : RIGHT_RAIL_BOUNDS;
    const dragDirection =
      panel === "library" ? (panelsSwapped ? -1 : 1) : panelsSwapped ? 1 : -1;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - startX) * dragDirection;
      const nextWidth = clampPanelWidth(startWidth + delta, bounds, otherWidth);
      if (panel === "library") {
        setLeftRailWidth(nextWidth);
      } else {
        setRightRailWidth(nextWidth);
      }
    };
    const stopResize = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setResizingPanel(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  function selectAdjacentTrack(direction: -1 | 1) {
    if (!tracks.length) return;
    const currentIndex = selectedTrackIndex >= 0 ? selectedTrackIndex : 0;
    const nextTrack = tracks[currentIndex + direction];
    if (!nextTrack) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setSelectedTrackId(nextTrack.id);
  }

  function updateMetadata(patch: Partial<TrackMetadata>) {
    const trackId = selectedTrackId;
    setTracks((current) =>
      current.map((track) =>
        track.id === trackId
          ? { ...track, metadata: { ...track.metadata, ...patch } }
          : track,
      ),
    );
  }

  function updateTrackMetadata(trackId: string, patch: Partial<TrackMetadata>) {
    setTracks((current) =>
      current.map((track) =>
        track.id === trackId
          ? { ...track, metadata: { ...track.metadata, ...patch } }
          : track,
      ),
    );
    setBatchFeedback("Alteracao salva na linha.");
  }

  function reorderTrackInBatch(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setTracks((current) => {
      const source = current.find((track) => track.id === sourceId);
      const target = current.find((track) => track.id === targetId);
      if (!source || !target) return current;
      const groupKey = trackBatchGroupKey(source);
      if (groupKey !== trackBatchGroupKey(target)) return current;
      const groupTracks = current.filter(
        (track) => trackBatchGroupKey(track) === groupKey,
      );
      const sourceIndex = groupTracks.findIndex(
        (track) => track.id === sourceId,
      );
      const targetIndex = groupTracks.findIndex(
        (track) => track.id === targetId,
      );
      if (sourceIndex < 0 || targetIndex < 0) return current;

      const reordered = [...groupTracks];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      const total = reordered.length;
      const renumbered = reordered.map((track, index) => ({
        ...track,
        metadata: {
          ...track.metadata,
          trackNumber: index + 1,
          trackTotal: total,
        },
      }));
      let cursor = 0;
      return current.map((track) =>
        trackBatchGroupKey(track) === groupKey ? renumbered[cursor++] : track,
      );
    });
    setBatchFeedback("Ordem do lote atualizada.");
  }

  async function applyLyricsSuggestion(suggestion: LyricsSuggestion) {
    const trackId = selectedTrackId;
    if (!suggestion.file) {
      setError("O arquivo de letra detectado não está mais disponível.");
      return;
    }
    const lyrics = await suggestion.file.text();
    setTracks((current) =>
      current.map((track) =>
        track.id === trackId
          ? {
              ...track,
              metadata: { ...track.metadata, lyrics },
              lyricsSourcePath: suggestion.relativePath,
              lyricsOptions: (track.lyricsOptions ?? []).map((option) => ({
                ...option,
                autoApplied: option.relativePath === suggestion.relativePath,
              })),
            }
          : track,
      ),
    );
    setBatchFeedback(`Letra aplicada de ${suggestion.fileName}.`, "info");
  }

  function ignoreLyricsSuggestions() {
    const trackId = selectedTrackId;
    setTracks((current) =>
      current.map((track) =>
        track.id === trackId ? { ...track, lyricsOptions: [] } : track,
      ),
    );
    setBatchFeedback("Sugestões de letra ignoradas para esta faixa.", "info");
  }

  function openAudioReview() {
    setWorkspaceMode("audio");
    setAudioStageView("edit");
    // Many tracks → pre-select them all so the derived scope becomes "batch".
    if (tracks.length > 1)
      setTracks((current) =>
        current.map((track) => ({ ...track, selectedForBatch: true })),
      );
  }

  function openArtworkEditor(trackId = selectedTrack?.id) {
    if (trackId) setSelectedTrackId(trackId);
    setWorkspaceMode("audio");
    setAudioStageView("artwork");
  }

  function openVisualEditor(trackId = selectedTrack?.id) {
    if (trackId) setSelectedTrackId(trackId);
    setWorkspaceMode("visual");
    setVisualStageView("editor");
    setActiveStep("visual");
  }

  function toggleTrackBatchSelection(trackId: string, selected: boolean) {
    setTracks((current) =>
      current.map((track) =>
        track.id === trackId ? { ...track, selectedForBatch: selected } : track,
      ),
    );
  }

  function removeTrackFromQueue(trackId: string) {
    setTracks((current) => {
      const removed = current.find((track) => track.id === trackId);
      if (removed?.sourceUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(removed.sourceUrl);
      }
      const next = current.filter((track) => track.id !== trackId);
      if (selectedTrackId === trackId) {
        setSelectedTrackId(next[0]?.id ?? "");
      }
      return next;
    });
    setEmbeddedArtworkByTrackId((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, trackId)) {
        return current;
      }
      const next = { ...current };
      delete next[trackId];
      return next;
    });
  }

  function updateScene(scene: ScenePresetV3) {
    updateSelectedTrack({ scene });
  }

  function selectPreset(id: string) {
    const preset =
      visualPresets.find((item) => item.id === id) ?? builtinVisualPresets[0];
    updateScene(normalizeVisualSettings(preset));
  }

  function updateCommon(key: string, value: number) {
    updateScene({
      ...selectedScene,
      common: { ...selectedScene.common, [key]: value },
    });
  }

  function updateAdvanced(key: string, value: number) {
    updateScene({
      ...selectedScene,
      advanced: { ...selectedScene.advanced, [key]: value },
    });
  }

  function updateWaveform(patch: Partial<WaveformV1>) {
    updateScene({
      ...selectedScene,
      waveform: { ...selectedScene.waveform, ...patch },
    });
  }

  function updatePlayful(patch: PlayfulPatch) {
    updateScene(
      normalizeVisualSettings({
        ...selectedScene,
        playful: {
          ...selectedScene.playful,
          ...patch,
          enabled: {
            ...selectedScene.playful?.enabled,
            ...patch.enabled,
          },
          collections: {
            ...selectedScene.playful?.collections,
            ...patch.collections,
          },
        },
      }),
    );
  }

  function updateCloudLight(patch: Partial<CloudLightSettings>) {
    updateScene(
      normalizeVisualSettings({
        ...selectedScene,
        cloudLight: { ...selectedScene.cloudLight, ...patch },
      }),
    );
  }

  function computeRenderStack(): RenderStackItem[] {
    const scene = selectedScene;
    const layers = selectedTrack?.layers ?? [];
    const stack = defaultRenderStack(scene, layers);
    if (Array.isArray(scene.renderOrder) && scene.renderOrder.length > 0) {
      return reconcileRenderStack(scene.renderOrder, stack);
    }
    return stack;
  }

  function defaultRenderStack(
    scene: ScenePresetV3,
    layers: MediaLayerV2[],
  ): RenderStackItem[] {
    const stack: RenderStackItem[] = [];
    stack.push({ kind: "atmosphere" });
    if (scene.cloudLight && scene.rendererId !== "volumetric-clouds") {
      stack.push({ kind: "sun-focus" });
    }
    for (const layer of [...layers].reverse()) {
      stack.push({ kind: "media", layerId: layer.id, order: layer.order });
    }
    if (scene.rendererId === "vinyl") {
      stack.push({ kind: "vinyl" });
    }
    if (scene.waveform) {
      stack.push({ kind: "waveform" });
    }
    return stack;
  }

  function reconcileRenderStack(
    saved: RenderStackItem[],
    fallback: RenderStackItem[],
  ): RenderStackItem[] {
    const fallbackKeys = new Set(fallback.map(renderStackKey));
    const savedByKey = new Map(
      saved.map((item) => [renderStackKey(item), item]),
    );
    const next = saved.filter((item) => fallbackKeys.has(renderStackKey(item)));
    for (const item of fallback) {
      if (!savedByKey.has(renderStackKey(item))) next.push(item);
    }
    return next;
  }

  function moveRenderStackItem(
    stack: RenderStackItem[],
    fromIndex: number,
    direction: -1 | 1,
  ): RenderStackItem[] {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= stack.length) return stack;
    const newStack = [...stack];
    const temp = newStack[fromIndex];
    newStack[fromIndex] = newStack[toIndex];
    newStack[toIndex] = temp;
    return newStack;
  }

  // Reordena o array layers para refletir a pilha: itens de mídia pintados por
  // último (frente) ficam no índice 0, mantendo a convenção legada do array.
  function syncLayersWithStack(
    layers: MediaLayerV2[],
    stack: RenderStackItem[],
  ): MediaLayerV2[] {
    const orderedIds = stack
      .filter(
        (item): item is Extract<RenderStackItem, { kind: "media" }> =>
          item.kind === "media",
      )
      .map((item) => item.layerId)
      .reverse();
    const byId = new Map(layers.map((layer) => [layer.id, layer]));
    const ordered = orderedIds.flatMap((id) => {
      const layer = byId.get(id);
      return layer ? [layer] : [];
    });
    const missing = layers.filter((layer) => !orderedIds.includes(layer.id));
    return [...ordered, ...missing].map((layer, order) => ({
      ...layer,
      order,
    }));
  }

  function moveCompositionItem(key: string, direction: "forward" | "backward") {
    if (!selectedTrack) return;
    const stack = computeRenderStack();
    const index = stack.findIndex((item) => renderStackKey(item) === key);
    if (index < 0) return;
    // "forward" = pintado depois = mais à frente no vídeo.
    const next = moveRenderStackItem(
      stack,
      index,
      direction === "forward" ? 1 : -1,
    );
    if (next === stack) return;
    // renderOrder e layers precisam mudar no MESMO update para o preview e a
    // pilha nunca divergirem por um frame.
    updateSelectedTrack({
      scene: { ...selectedScene, renderOrder: next },
      layers: syncLayersWithStack(selectedTrack.layers, next),
    });
  }

  function applyPalette(palette: VisualPalette) {
    updateScene(
      normalizeVisualSettings({
        ...selectedScene,
        colors: palette.colors,
        common: { ...selectedScene.common, ...palette.common },
        advanced: { ...selectedScene.advanced, ...palette.advanced },
      }),
    );
  }

  async function analyzeSelectedAudio() {
    if (!selectedTrack) return;
    const trackId = selectedTrack.id;
    setAnalyzingTrackIds((current) =>
      current.includes(trackId) ? current : [...current, trackId],
    );
    const formData = new FormData();
    if (!appendTrackAudioSource(formData, selectedTrack)) {
      setAnalyzingTrackIds((current) =>
        current.filter((item) => item !== trackId),
      );
      setError("Fonte de áudio indisponível para análise.");
      return;
    }
    try {
      const payload = await fetchJson<{
        metadata: AudioInfo;
        analysis: AudioTechnicalAnalysis;
        suggestions: Partial<AudioTagDraft>;
      }>("/api/audio/analyze", { method: "POST", body: formData });
      // Target the track by id (not "selected"): the user may have switched
      // tracks while this analysis was in flight (auto-analysis runs on select).
      updateTrackDraft(trackId, {
        audioInfo: {
          ...selectedTrack.audioInfo,
          ...payload.metadata,
          analysis: payload.analysis,
          suggestions: payload.suggestions,
        },
      });
    } catch (reason) {
      setError(localApiMessage(reason, "analisar a qualidade do áudio"));
    } finally {
      setAnalyzingTrackIds((current) =>
        current.filter((item) => item !== trackId),
      );
    }
  }

  async function processReviewedAudio() {
    if (!selectedTrack) return;
    openAudioReview();
    const selected =
      workflowMode === "batch"
        ? tracks.filter((track) => track.selectedForBatch)
        : [selectedTrack];
    if (!selected.length) {
      setBatchFeedback(
        "Selecione ao menos uma faixa para processar.",
        "warning",
      );
      return;
    }
    destructiveAudioBatchRef.current = null;
    setBatchFeedback(
      workflowMode === "batch"
        ? `Processamento iniciado para ${selected.length} arquivo${selected.length === 1 ? "" : "s"}.`
        : "Processamento iniciado.",
      "info",
    );
    const jobIds: string[] = [];
    for (const track of selected) {
      const jobId = await submitAudioProcess(track);
      if (jobId) jobIds.push(jobId);
    }
    if (
      workspaceWriteEnabled &&
      musicDirectoryRef.current &&
      jobIds.length === selected.length
    ) {
      destructiveAudioBatchRef.current = { jobIds, finalizing: false };
      setBatchFeedback(
        `${jobIds.length} processamento${jobIds.length === 1 ? "" : "s"} iniciado${jobIds.length === 1 ? "" : "s"}. Substituição dos originais será feita apenas no final, se todos concluírem.`,
        "warning",
      );
    }
  }

  async function submitAudioProcess(track: TrackDraft) {
    const formData = new FormData();
    if (!appendTrackAudioSource(formData, track)) {
      setError("Fonte de áudio indisponível para tratamento.");
      return null;
    }
    const trackCover = coverForTrack(track);
    if (trackCover) formData.append("cover", trackCover.file);
    const albumCover = albumCoverForTrack(track);
    if (albumCover) formData.append("albumCover", albumCover.file);
    formData.append(
      "draft",
      JSON.stringify(audioDraftFromMetadata(track.metadata)),
    );
    const trackSeries = seriesSettingsForTrack(track);
    formData.append(
      "coverSeries",
      String(coverSeriesPreviewLines(track, trackSeries).length > 0),
    );
    formData.append("coverStyle", trackSeries.style);
    formData.append("coverSeriesSettings", JSON.stringify(trackSeries));
    formData.append("fileNamePattern", JSON.stringify(fileNamePattern));
    try {
      const data = await fetchJson<{ jobId: string }>("/api/audio/process", {
        method: "POST",
        body: formData,
      });
      audioJobOriginsRef.current.set(data.jobId, track.id);
      const job: RenderJob = {
        id: data.jobId,
        kind: "audio-process",
        status: "queued",
        progress: 0,
        message: `Na fila: ${track.metadata.title}`,
        outputUrl: null,
        sidecarUrl: null,
        thumbnailUrl: null,
        metadata: audioDraftFromMetadata(track.metadata),
      };
      setJobs((current) => [job, ...current]);
      pollJob(job.id);
      return job.id;
    } catch (reason) {
      setError(localApiMessage(reason, "iniciar o tratamento do áudio"));
      return null;
    }
  }

  function updateColors(key: "base" | "effect" | "light", value: string) {
    updateScene({
      ...selectedScene,
      colors: { ...selectedScene.colors, [key]: value },
    });
  }

  async function duplicatePreset() {
    const name = await requestTextInput({
      title: "Duplicar preset",
      message:
        "Crie uma cópia reutilizável com a atmosfera, a paleta e os ajustes atuais.",
      label: "Nome do preset personalizado",
      value: `${selectedScene.name} personalizado`,
      confirmLabel: "Duplicar preset",
    });
    if (!name) return;
    try {
      const created = await fetchJson<ScenePresetV3>("/api/visual-presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...selectedScene, name, source: "custom" }),
      });
      setVisualPresets((current) => [...current, created]);
      updateScene(created);
    } catch (reason) {
      setError(localApiMessage(reason, "duplicar o preset"));
    }
  }

  async function savePreset() {
    // Editing a custom preset: persist the current adjustments in place.
    if (selectedScene.source === "custom") {
      try {
        await fetchJson(`/api/visual-presets/${selectedScene.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(selectedScene),
        });
        setVisualPresets((current) =>
          current.map((preset) =>
            preset.id === selectedScene.id ? selectedScene : preset,
          ),
        );
        setBatchFeedback(`Preset "${selectedScene.name}" salvo.`);
      } catch (reason) {
        setError(localApiMessage(reason, "salvar o preset"));
      }
      return;
    }
    // Editing a builtin: "Salvar" immediately forks a new custom preset from the
    // current adjustments (no prompt) so tweaks are never lost. The new preset
    // persists until deleted from the preset UI or by storage cleanup. Use
    // "Duplicar" when you want to name the copy explicitly.
    try {
      const created = await fetchJson<ScenePresetV3>("/api/visual-presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...selectedScene,
          name: `${selectedScene.name} personalizado`,
          source: "custom",
        }),
      });
      setVisualPresets((current) => [...current, created]);
      updateScene(created);
      setBatchFeedback(`Preset "${created.name}" criado a partir dos ajustes.`);
    } catch (reason) {
      setError(localApiMessage(reason, "criar o preset"));
    }
  }

  async function deletePreset() {
    if (selectedScene.source !== "custom") return;
    try {
      await fetchJson(`/api/visual-presets/${selectedScene.id}`, {
        method: "DELETE",
      });
      setVisualPresets((current) =>
        current.filter((preset) => preset.id !== selectedScene.id),
      );
      updateScene(builtinVisualPresets[0]);
    } catch (reason) {
      setError(localApiMessage(reason, "excluir o preset"));
    }
  }

  function createVariation() {
    if (!selectedTrack) return;
    const id = crypto.randomUUID();
    const version = selectedTrack.metadata.version || "Variacao";
    const variation: TrackDraft = {
      ...selectedTrack,
      id,
      variantOf: selectedTrack.variantOf ?? selectedTrack.id,
      versionLabel: version,
      metadata: {
        ...selectedTrack.metadata,
        version,
        outputFileName: `${selectedTrack.metadata.outputFileName || selectedTrack.metadata.title}-${version}`,
      },
      layers: selectedTrack.layers.map((layer) => ({
        ...layer,
        id: crypto.randomUUID(),
      })),
      textSettings: cloneTextSettings(selectedTrack.textSettings),
      selectedForBatch: true,
    };
    setTracks((current) => [...current, variation]);
    setSelectedTrackId(id);
  }

  function addLayers(files: FileList | null) {
    if (!selectedTrack) return;
    const remaining = Math.max(0, 3 - selectedTrack.layers.length);
    const additions = Array.from(files ?? [])
      .slice(0, remaining)
      .map(
        (file, index): MediaLayerV2 => ({
          id: crypto.randomUUID(),
          name: file.name,
          file,
          src: URL.createObjectURL(file),
          kind: file.type.startsWith("video/")
            ? "video"
            : file.name.toLowerCase().endsWith(".svg")
              ? "svg"
              : "image",
          visible: true,
          opacity: 100,
          scale: 100,
          x: 50,
          y: 50,
          rotation: 0,
          blur: 0,
          maskOpacity: 0,
          shadow: { opacity: 0, blur: 18, x: 0, y: 12 },
          fit: "contain",
          blendMode: "normal",
          loop: true,
          order: selectedTrack.layers.length + index,
        }),
      );
    if (!additions.length) return;
    captureLayersUndo("adicionar mídia");
    updateSelectedTrack({ layers: [...selectedTrack.layers, ...additions] });
  }

  function updateLayer(id: string, patch: Partial<MediaLayerV2>) {
    if (!selectedTrack) return;
    updateSelectedTrack({
      layers: selectedTrack.layers.map((layer) =>
        layer.id === id ? { ...layer, ...patch } : layer,
      ),
    });
  }

  function removeLayer(id: string) {
    if (!selectedTrack) return;
    captureLayersUndo("remover camada");
    updateSelectedTrack({
      layers: selectedTrack.layers
        .filter((layer) => layer.id !== id)
        .map((layer, order) => ({ ...layer, order })),
    });
  }

  function applyMusicToBatch() {
    setTracks((current) =>
      applyMusicTemplateToTracks(current, selectedTrackId),
    );
    setBatchFeedback("Dados da faixa selecionada aplicados ao lote.");
  }

  function applyBatchCommon() {
    const selectedCount = tracks.filter(
      (track) => track.selectedForBatch,
    ).length;
    setTracks((current) =>
      applyCommonMetadata(current, batchCommon, batchApplyMode),
    );
    setBatchFeedback(
      batchApplyMode === "fill-empty"
        ? `${selectedCount} arquivo${selectedCount === 1 ? "" : "s"} atualizado${selectedCount === 1 ? "" : "s"} apenas onde havia campos vazios.`
        : `${selectedCount} arquivo${selectedCount === 1 ? "" : "s"} atualizado${selectedCount === 1 ? "" : "s"} com sobrescrita dos campos informados.`,
    );
  }

  function applyVisualToBatch() {
    setTracks((current) =>
      applyVisualTemplateToTracks(current, selectedTrackId),
    );
    setBatchFeedback(
      "Fundo visual e cores aplicados ao lote. As mídias de cada vídeo foram preservadas.",
    );
  }

  function applyLayersToBatch() {
    const targets = tracks.filter(
      (track) => track.selectedForBatch && track.id !== selectedTrackId,
    ).length;
    if (targets === 0) {
      setBatchFeedback(
        "Selecione ao menos um outro vídeo no lote para receber as camadas.",
        "info",
      );
      return;
    }
    setTracks((current) =>
      applyLayersTemplateToTracks(current, selectedTrackId),
    );
    setBatchFeedback(
      `Camadas desta faixa copiadas para ${targets} vídeo${targets === 1 ? "" : "s"} do lote.`,
    );
  }

  function applyLayerSet(layers: MediaLayerV2[]) {
    if (!selectedTrack) return;
    if (!layers.length) {
      setBatchFeedback(
        "Este conjunto não tinha imagens utilizáveis para aplicar.",
        "info",
      );
      return;
    }
    captureLayersUndo("aplicar conjunto");
    updateSelectedTrack({
      layers: layers.slice(0, 3).map((layer, order) => ({ ...layer, order })),
    });
    setBatchFeedback("Conjunto de camadas aplicado a esta faixa.");
  }

  function applyPublicationToBatch() {
    setTracks((current) =>
      applyPublicationTemplateToTracks(current, selectedTrackId),
    );
    setBatchFeedback("Dados de publicação aplicados ao lote.");
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await ensureAnalyser(audio);
      await audio.play();
      readAnalyser();
    } else {
      audio.pause();
      window.cancelAnimationFrame(animationRef.current);
    }
  }

  async function ensureAnalyser(audio: HTMLAudioElement) {
    if (analyserRef.current) return;
    const context = new AudioContext();
    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);
    analyser.connect(context.destination);
    analyserRef.current = analyser;
  }

  function readAnalyser() {
    const analyser = analyserRef.current;
    const audio = audioRef.current;
    if (!analyser || !audio || audio.paused) return;
    const frequency = new Uint8Array(analyser.frequencyBinCount);
    const waveform = new Uint8Array(analyser.fftSize);
    analyser.getByteFrequencyData(frequency);
    analyser.getByteTimeDomainData(waveform);
    const average = (from: number, to: number) =>
      Array.from(frequency.slice(from, to)).reduce(
        (sum, value) => sum + value,
        0,
      ) /
      Math.max(1, to - from) /
      255;
    setAudioBands({
      energy: average(0, frequency.length),
      bass: average(0, 18),
      mid: average(18, 74),
      high: average(74, frequency.length),
      samples: Array.from(waveform)
        .filter((_, index) => index % 6 === 0)
        .map((value) => (value - 128) / 128),
      spectrum: Array.from({ length: 24 }, (_, index) => {
        const start = Math.floor(Math.pow(index / 24, 2.15) * frequency.length);
        const end = Math.max(
          start + 1,
          Math.floor(Math.pow((index + 1) / 24, 2.15) * frequency.length),
        );
        return average(start, Math.min(frequency.length, end));
      }),
    });
    animationRef.current = window.requestAnimationFrame(readAnalyser);
  }

  async function exportSelected() {
    if (!selectedTrack) return;
    setError("");
    if (!(await confirmVideoOutputPolicy("vídeos"))) return;
    videoOutputRunRef.current = {
      conflictMode: videoOutputConflictMode,
      projects: new Map(),
      stamp: videoOutputBackupStamp(),
    };
    setWorkspaceMode("visual");
    setActiveStep("export");
    setVisualStageView("publication-export");
    if (workflowMode === "batch") {
      const selected = tracks.filter((track) => track.selectedForBatch);
      for (const track of selected) await submitRender(track);
    } else {
      await submitRender(selectedTrack);
    }
  }

  async function exportPublicationAssets() {
    if (!selectedTrack) return;
    const targets = effectivePublicationTracks;
    const presets = effectivePublicationPresets;
    if (targets.length === 0 || presets.length === 0) {
      setBatchFeedback(
        "Selecione ao menos uma faixa e um formato antes de gerar os assets.",
        "info",
      );
      return;
    }
    setError("");
    if (!(await confirmVideoOutputPolicy("assets de divulgação"))) return;
    publicationOutputRunRef.current = {
      conflictMode: videoOutputConflictMode,
      projects: new Map(),
      stamp: videoOutputBackupStamp(),
    };
    setWorkspaceMode("visual");
    setVisualStageView("publication-export");
    // Reset the abort latch for this run; "Parar geração"/"Cancelar tudo" flip
    // it so the loop stops enqueuing instead of pushing every track × format.
    publicationExportAbortRef.current = false;
    setPublicationExporting(true);
    let queued = 0;
    try {
      for (const track of targets) {
        if (publicationExportAbortRef.current) break;
        for (const preset of presets) {
          if (publicationExportAbortRef.current) break;
          await submitPublicationAsset(
            track,
            preset,
            publicationAssetSettingsForPreset(
              preset.id,
              publicationDefaultSettings,
              publicationAssetOverrides,
            ),
          );
          queued += 1;
        }
      }
    } finally {
      setPublicationExporting(false);
    }
    if (publicationExportAbortRef.current) {
      setBatchFeedback(
        `Geração interrompida após enfileirar ${queued} asset${queued === 1 ? "" : "s"}.`,
        "info",
      );
    }
  }

  function stopPublicationExport() {
    publicationExportAbortRef.current = true;
    setBatchFeedback("Parando a geração de divulgação…", "info");
  }

  // Toggle a format in the explicit export set. An empty set means "just the
  // focused preset", so unchecking everything falls back to the focused one.
  function togglePublicationPreset(id: string) {
    setPublicationSelectedPresetIds((current) => {
      const base = current.length ? current : [publicationPresetId];
      return base.includes(id)
        ? base.filter((value) => value !== id)
        : [...base, id];
    });
  }

  function setPublicationPresetScope(scope: PublicationAssetMode) {
    setPublicationAssetMode(scope);
    if (scope === "all") {
      setPublicationSelectedPresetIds(
        publicationAssetPresets.map((preset) => preset.id),
      );
    } else if (scope === "group") {
      setPublicationSelectedPresetIds(
        publicationAssetPresets
          .filter((preset) => preset.kind === selectedPublicationPreset.kind)
          .map((preset) => preset.id),
      );
    } else {
      setPublicationSelectedPresetIds([]);
    }
  }

  function togglePublicationTrack(id: string) {
    setPublicationExcludedTrackIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function setAllPublicationTracks(include: boolean) {
    setPublicationExcludedTrackIds(
      include ? [] : reviewTracks.map((track) => track.id),
    );
  }

  // Copy the focused asset's text override (scale/offset/hide) to every format
  // in the chosen scope, so "adjust one, a group, or all" is one click.
  function applyPublicationTextToScope(scope: "group" | "all") {
    const source = publicationAssetSettingsForPreset(
      publicationPresetId,
      publicationDefaultSettings,
      publicationAssetOverrides,
    );
    const textPatch = {
      textScale: source.textScale,
      textOffsetX: source.textOffsetX,
      textOffsetY: source.textOffsetY,
      hideText: source.hideText,
    };
    const targets =
      scope === "all"
        ? publicationAssetPresets
        : publicationAssetPresets.filter(
            (preset) => preset.kind === selectedPublicationPreset.kind,
          );
    setPublicationAssetOverrides((current) => {
      const next: PublicationAssetOverrideMap = { ...current };
      for (const preset of targets) {
        next[preset.id] = { ...(next[preset.id] ?? {}), ...textPatch };
      }
      return normalizePublicationAssetOverrides(next);
    });
    setBatchFeedback(
      scope === "all"
        ? "Texto aplicado a todos os formatos."
        : "Texto aplicado ao grupo do formato.",
      "info",
    );
  }

  function updatePublicationAssetOverride(
    presetId: string,
    patch: Partial<PublicationAssetSettings>,
  ) {
    setPublicationAssetOverrides((current) =>
      normalizePublicationAssetOverrides({
        ...current,
        [presetId]: {
          ...(current[presetId] ?? {}),
          ...patch,
        },
      }),
    );
  }

  function resetPublicationAssetOverride(presetId: string) {
    setPublicationAssetOverrides((current) => {
      if (!current[presetId]) return current;
      const next = { ...current };
      delete next[presetId];
      return next;
    });
  }

  async function confirmVideoOutputPolicy(subject = "vídeos") {
    if (!outputDirectoryRef.current || videoOutputConflictMode === "backup") {
      return true;
    }
    const projectName = videoOutputProjectDirectoryName(
      selectedTrack?.metadata,
      selectedInputProjectName(),
    );
    const destructive = videoOutputConflictMode === "clear";
    return requestConfirmation({
      title: destructive
        ? "Limpar destino antes de exportar?"
        : "Sobrescrever arquivos existentes?",
      message: destructive
        ? `A subpasta "${projectName}" dentro da Pasta de Saída será esvaziada antes de receber ${subject}. Outras pastas da saída não serão tocadas.`
        : `Arquivos novos serão gravados dentro de "${projectName}" e arquivos de mesmo nome serão substituídos. Outras pastas da saída não serão tocadas.`,
      confirmLabel: destructive ? "Limpar e exportar" : "Sobrescrever",
      tone: destructive ? "danger" : "default",
    });
  }

  async function submitRender(track: TrackDraft) {
    // Persist a snapshot of exactly what is being submitted before the render
    // starts, so a crash/restart mid-render never forces the user to redo edits.
    void saveSnapshot(createSnapshot());
    // Derive the exported composition from the same resolver the preview uses,
    // so what renders can never diverge from what was shown (handoff #13).
    const composition = resolveEffectiveComposition(track, {
      sharedCover: cover,
      showMetadata,
    });
    const formData = new FormData();
    if (!appendTrackAudioSource(formData, track)) {
      setError("Fonte de áudio indisponível para exportação.");
      return;
    }
    for (const layer of composition.layers)
      formData.append("mediaLayers", layer.file);
    if (composition.cover) formData.append("cover", composition.cover.file);
    formData.append("visualSettings", JSON.stringify(composition.scene));
    formData.append(
      "compositionSettings",
      JSON.stringify({
        mediaLayers: composition.layers.map(stripLayerFile),
        durationSeconds: track.audioInfo?.durationSeconds ?? null,
        textSettings: composition.textSettings,
      }),
    );
    formData.append("preset", outputPreset);
    formData.append("qualityProfile", qualityProfile);
    formData.append("renderMode", workflowMode);
    formData.append("showMetadata", String(composition.showMetadata));
    formData.append("fileNamePattern", JSON.stringify(fileNamePattern));
    if (composition.metadata) {
      for (const [key, value] of Object.entries(composition.metadata)) {
        formData.append(key, String(value));
      }
    }
    try {
      const data = await fetchJson<{ jobId: string }>("/api/render", {
        method: "POST",
        body: formData,
      });
      const job: RenderJob = {
        id: data.jobId,
        kind: "video-render",
        status: "queued",
        progress: 0,
        message: `Na fila: ${track.metadata.title}`,
        outputUrl: null,
        sidecarUrl: null,
        thumbnailUrl: null,
      };
      setJobs((current) => [job, ...current]);
      pollJob(job.id);
    } catch (reason) {
      setError(localApiMessage(reason, "iniciar a exportação"));
    }
  }

  async function submitPublicationAsset(
    track: TrackDraft,
    preset: PublicationAssetPreset,
    assetSettings: PublicationAssetSettings,
  ) {
    void saveSnapshot(createSnapshot());
    const composition = resolveEffectiveComposition(track, {
      sharedCover: cover,
      showMetadata,
    });
    const formData = new FormData();
    if (!appendTrackAudioSource(formData, track)) {
      setError("Fonte de áudio indisponível para exportação do asset.");
      return;
    }
    for (const layer of composition.layers)
      formData.append("mediaLayers", layer.file);
    if (composition.cover) formData.append("cover", composition.cover.file);
    formData.append("visualSettings", JSON.stringify(composition.scene));
    formData.append(
      "compositionSettings",
      JSON.stringify({
        mediaLayers: composition.layers.map(stripLayerFile),
        durationSeconds: track.audioInfo?.durationSeconds ?? null,
        // Bake the per-asset text override into the exported text settings so
        // the rendered file matches exactly what the preview showed.
        textSettings: applyPublicationTextOverride(
          composition.textSettings,
          assetSettings,
        ),
      }),
    );
    formData.append("preset", outputPreset);
    formData.append("qualityProfile", qualityProfile);
    formData.append("renderMode", workflowMode);
    formData.append("showMetadata", String(composition.showMetadata));
    formData.append("publicationPresetId", preset.id);
    formData.append("clipStart", String(assetSettings.clipStart));
    formData.append("clipDuration", String(assetSettings.clipDuration));
    formData.append(
      "includeFullLyrics",
      String(assetSettings.lyricsMode === "full"),
    );
    formData.append("lyricsMode", assetSettings.lyricsMode);
    formData.append("lyricsExcerpt", assetSettings.lyricsExcerpt);
    formData.append("lyricsHideTags", String(assetSettings.lyricsHideTags));
    formData.append(
      "lyricsLineSpacing",
      String(assetSettings.lyricsLineSpacing),
    );
    formData.append("generateDataFiles", String(publicationGenerateDataFiles));
    formData.append("lyricsPosition", assetSettings.lyricsPosition);
    formData.append("lyricsStyle", assetSettings.lyricsStyle);
    formData.append("bookletTheme", assetSettings.bookletTheme);
    if (composition.metadata) {
      for (const [key, value] of Object.entries(composition.metadata)) {
        formData.append(key, String(value));
      }
    }
    try {
      const data = await fetchJson<{ jobId: string }>(
        "/api/publication-assets",
        {
          method: "POST",
          body: formData,
        },
      );
      const job: RenderJob = {
        id: data.jobId,
        kind: "publication-asset",
        status: "queued",
        progress: 0,
        message: `Divulgação: ${preset.label} · ${track.metadata.title}`,
        outputUrl: null,
        sidecarUrl: null,
        thumbnailUrl: null,
        markdownUrl: null,
        assetUrls: [],
        metadata: track.metadata,
      };
      setJobs((current) => [job, ...current]);
      pollJob(job.id);
    } catch (reason) {
      setError(localApiMessage(reason, "iniciar a divulgação"));
    }
  }

  async function submitPodcastFeed(sidecar: PodcastFeedSidecar) {
    const title = sidecar.feed.title || "Podcast";
    try {
      const data = await fetchJson<{ jobId: string }>("/api/podcast-feeds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileBaseName: sidecar.rss.fileName,
          sidecar,
        }),
      });
      const job: RenderJob = {
        id: data.jobId,
        kind: "podcast-feed",
        status: "queued",
        progress: 0,
        message: `Podcast: ${title}`,
        outputUrl: null,
        sidecarUrl: null,
        thumbnailUrl: null,
        assetUrls: [],
        metadata: {
          title,
          album: title,
          artist: sidecar.feed.author,
        },
      };
      setJobs((current) => [job, ...current]);
      pollJob(job.id);
    } catch (reason) {
      setError(localApiMessage(reason, "gerar o feed de podcast"));
    }
  }

  async function copyJobError(job: RenderJob) {
    await copyTextToClipboard(jobErrorReport(job));
    setBatchFeedback("Erro copiado para a área de transferência.");
  }

  function pollJob(id: string, failures = 0) {
    // Backoff: first poll quick; once the connection is flaky, slow down to at
    // most 5s so a busy/restarting server isn't hammered.
    const delay = failures > 0 ? Math.min(5000, 900 + failures * 600) : 900;
    window.setTimeout(async () => {
      try {
        const job = await fetchJsonWithRetry<RenderJob>(
          `/api/jobs/${id}`,
          undefined,
          {
            attempts: 3,
            delayMs: 350,
            onRetry: () =>
              setJobs((current) =>
                current.map((item) =>
                  item.id === id
                    ? { ...item, message: "Reconectando ao servidor local" }
                    : item,
                ),
              ),
          },
        );
        setJobs((current) =>
          current.map((item) => (item.id === id ? job : item)),
        );
        if (job.status === "done") {
          if (job.kind === "audio-process") {
            void integrateTreatedAudio(job).catch((reason) =>
              setError(localApiMessage(reason, "integrar a cópia tratada")),
            );
            void maybeFinalizeDestructiveAudioBatch();
          } else if (job.kind === "publication-asset") {
            void copyPublicationOutput(job).catch((reason) =>
              setError(
                localApiMessage(reason, "copiar os assets de divulgação"),
              ),
            );
          } else if (job.kind === "podcast-feed") {
            setBatchFeedback(
              "Feed de podcast gerado com links RSS e JSON no histórico.",
              "info",
            );
          } else {
            void copyOutput(job).catch((reason) =>
              setError(
                localApiMessage(reason, "copiar os arquivos exportados"),
              ),
            );
          }
        } else if (["error", "canceled"].includes(job.status)) {
          if (job.kind === "audio-process")
            void maybeFinalizeDestructiveAudioBatch();
        } else if (!["error", "canceled"].includes(job.status)) {
          pollJob(id);
        }
      } catch (reason) {
        // Transient connectivity drop (server busy/restarting during a render).
        // Do NOT fail the job — it may still be running server-side. Keep its
        // status, show a reconnecting note, and keep polling with backoff.
        const nextFailures = failures + 1;
        setJobs((current) =>
          current.map((item) =>
            item.id === id &&
            !["done", "error", "canceled"].includes(item.status)
              ? { ...item, message: `Servidor reconectando… (${nextFailures})` }
              : item,
          ),
        );
        if (nextFailures >= 40) {
          // Prolonged outage: surface it once and stop polling. The job is left
          // in its last known status so it can be retried, not destroyed.
          setError(localApiMessage(reason, "acompanhar a exportação"));
          return;
        }
        pollJob(id, nextFailures);
      }
    }, delay);
  }

  async function cancelJob(id: string) {
    try {
      const job = await fetchJson<RenderJob>(`/api/jobs/${id}/cancel`, {
        method: "POST",
      });
      setJobs((current) =>
        current.map((item) => (item.id === id ? job : item)),
      );
      setBatchFeedback("Cancelamento solicitado.", "info");
    } catch (reason) {
      setError(localApiMessage(reason, "cancelar o processamento"));
    }
  }

  async function cancelAllJobs() {
    // Stop any in-flight publication export loop so cancel doesn't race against
    // the client still POSTing new jobs.
    publicationExportAbortRef.current = true;
    try {
      const payload = await fetchJson<{ jobs: RenderJob[] }>(
        "/api/jobs/cancel-all",
        { method: "POST" },
      );
      setJobs(payload.jobs);
      setBatchFeedback(
        "Todos os processamentos pendentes foram cancelados.",
        "info",
      );
    } catch (reason) {
      setError(localApiMessage(reason, "cancelar a fila"));
    }
  }

  async function pauseQueue() {
    try {
      const payload = await fetchJson<{ queuePaused: boolean }>(
        "/api/jobs/pause",
        { method: "POST" },
      );
      setQueuePaused(payload.queuePaused);
      setBatchFeedback(
        "Fila pausada. O item em andamento termina a etapa atual.",
        "info",
      );
    } catch (reason) {
      setError(localApiMessage(reason, "pausar a fila"));
    }
  }

  async function resumeQueue() {
    try {
      const payload = await fetchJson<{ queuePaused: boolean }>(
        "/api/jobs/resume",
        { method: "POST" },
      );
      setQueuePaused(payload.queuePaused);
      setBatchFeedback("Fila retomada.", "info");
      for (const job of jobs) {
        if (job.status === "paused" || job.status === "queued") pollJob(job.id);
      }
    } catch (reason) {
      setError(localApiMessage(reason, "retomar a fila"));
    }
  }

  async function copyOutput(job: RenderJob) {
    const handle = outputDirectoryRef.current;
    if (!handle || !job.outputUrl || !job.sidecarUrl) return;
    let permission = await handle.queryPermission?.({ mode: "readwrite" });
    if (permission !== "granted") {
      permission = await handle.requestPermission?.({ mode: "readwrite" });
    }
    if (permission !== "granted") {
      throw new Error("A pasta de saída precisa de permissão para escrita.");
    }
    const target = await videoOutputProjectForJob(handle, job);
    await copyUrlToDirectory(target.project, job.outputUrl);
    await copyUrlToDirectory(target.assets, job.sidecarUrl);
    if (job.thumbnailUrl) {
      await copyUrlToDirectory(target.assets, job.thumbnailUrl);
    }
    setBatchFeedback(
      target.backupName
        ? `Vídeo copiado para ${outputFolderName}\\${target.projectName}. Conteúdo anterior movido para backup\\${target.backupName}.`
        : `Vídeo copiado para ${outputFolderName}\\${target.projectName}.`,
      "info",
    );
  }

  async function copyPublicationOutput(job: RenderJob) {
    const handle = outputDirectoryRef.current;
    if (!handle || !job.outputUrl || !job.sidecarUrl) return;
    let permission = await handle.queryPermission?.({ mode: "readwrite" });
    if (permission !== "granted") {
      permission = await handle.requestPermission?.({ mode: "readwrite" });
    }
    if (permission !== "granted") {
      throw new Error("A pasta de saída precisa de permissão para escrita.");
    }
    const target = await publicationOutputProjectForJob(handle, job);
    const primaryDirectory = publicationAssetDirectoryForUrl(
      target,
      job.outputUrl,
    );
    await copyUrlToDirectory(primaryDirectory, job.outputUrl);
    await copyUrlToDirectory(target.dados, job.sidecarUrl);
    if (job.markdownUrl) {
      await copyUrlToDirectory(target.dados, job.markdownUrl);
    }
    setBatchFeedback(
      target.backupName
        ? `Asset copiado para ${outputFolderName}\\${target.projectName}\\assets\\publicacao. Conteúdo anterior movido para backup\\${target.backupName}.`
        : `Asset copiado para ${outputFolderName}\\${target.projectName}\\assets\\publicacao.`,
      "info",
    );
  }

  async function videoOutputProjectForJob(
    handle: FileSystemDirectoryHandle,
    job: RenderJob,
  ) {
    const run = videoOutputRunRef.current;
    if (!run.stamp) {
      run.stamp = videoOutputBackupStamp();
      run.conflictMode = videoOutputConflictMode;
    }
    const projectName = videoOutputProjectDirectoryName(
      job.metadata,
      selectedInputProjectName(),
    );
    const key = `${run.conflictMode}\u0000${projectName}`;
    let project = run.projects.get(key);
    if (!project) {
      project = prepareVideoOutputProject(handle, projectName, {
        backupStamp: run.stamp,
        conflictMode: run.conflictMode,
      });
      run.projects.set(key, project);
    }
    return project;
  }

  async function publicationOutputProjectForJob(
    handle: FileSystemDirectoryHandle,
    job: RenderJob,
  ) {
    const run = publicationOutputRunRef.current;
    if (!run.stamp) {
      run.stamp = videoOutputBackupStamp();
      run.conflictMode = videoOutputConflictMode;
    }
    const projectName = videoOutputProjectDirectoryName(
      job.metadata,
      selectedInputProjectName(),
    );
    const key = `${run.conflictMode}\u0000${projectName}`;
    let project = run.projects.get(key);
    if (!project) {
      project = preparePublicationOutputProject(handle, projectName, {
        backupStamp: run.stamp,
        conflictMode: run.conflictMode,
      });
      run.projects.set(key, project);
    }
    return project;
  }

  async function integrateTreatedAudio(job: RenderJob) {
    if (!job.outputUrl || integratedAudioJobsRef.current.has(job.id)) return;
    integratedAudioJobsRef.current.add(job.id);
    const response = await fetchOptional(job.outputUrl);
    if (!response) throw new Error("A cópia tratada não está disponível.");
    const blob = await response.blob();
    const fileName = decodeURIComponent(
      job.outputUrl.split("/").pop() ?? "tratado.mp3",
    );
    const sourceFile = new File([blob], fileName, { type: "audio/mpeg" });
    const originId = audioJobOriginsRef.current.get(job.id);
    const origin =
      tracks.find((track) => track.id === originId) ?? selectedTrack;
    if (!origin) return;
    const originCover = coverForTrack(origin);
    const treated: TrackDraft = {
      ...origin,
      id: crypto.randomUUID(),
      sourceKey: fileName,
      sourceFile,
      sourceUrl: URL.createObjectURL(sourceFile),
      source: "upload",
      variantOf: origin.variantOf ?? origin.id,
      versionLabel: "Tratado",
      packageStatus: "treated",
      metadata: {
        ...origin.metadata,
        version: origin.metadata.version || "Tratado",
        useEmbeddedCover: Boolean(originCover),
      },
      audioInfo: {
        ...origin.audioInfo,
        fileName,
        durationSeconds: origin.audioInfo?.durationSeconds ?? null,
        bitrate: origin.audioInfo?.bitrate ?? null,
        codec: origin.audioInfo?.codec ?? null,
        hasEmbeddedCover: Boolean(originCover),
        analysis: job.analysis,
      },
      // The treated copy is what the video step should use, so it lands
      // selected; the original is deselected so the scope moves to the treated
      // set and the originals visually collapse (dimmed in the sidebar).
      selectedForBatch: true,
    };
    setTracks((current) => [
      ...current.map((track) =>
        track.id === origin.id ? { ...track, selectedForBatch: false } : track,
      ),
      treated,
    ]);
    setSelectedTrackId(treated.id);
  }

  async function maybeFinalizeDestructiveAudioBatch() {
    const batch = destructiveAudioBatchRef.current;
    const directory = musicDirectoryRef.current;
    if (!batch || batch.finalizing || !workspaceWriteEnabled || !directory) {
      return;
    }
    const payload = await fetchJson<{ jobs: RenderJob[] }>("/api/jobs");
    const resolution = resolveDestructiveBatchState(batch.jobIds, payload.jobs);
    if (resolution.state === "waiting") return;
    if (resolution.state === "blocked") {
      destructiveAudioBatchRef.current = null;
      setBatchFeedback(
        "Substituição dos originais não executada: ao menos um processamento foi cancelado ou falhou.",
        "warning",
      );
      return;
    }
    batch.finalizing = true;
    try {
      await replaceOriginalsAfterCompletedBatch(directory, resolution.jobs);
      destructiveAudioBatchRef.current = null;
      setBatchFeedback(
        "Todos os processamentos terminaram. Originais substituídos com backup.",
      );
    } catch (reason) {
      batch.finalizing = false;
      setError(localApiMessage(reason, "substituir os originais ao finalizar"));
    }
  }

  async function replaceOriginalsAfterCompletedBatch(
    directory: FileSystemDirectoryHandle,
    batchJobs: RenderJob[],
  ) {
    let permission = await directory.queryPermission?.({ mode: "readwrite" });
    if (permission !== "granted") {
      permission = await directory.requestPermission?.({ mode: "readwrite" });
    }
    if (permission !== "granted") {
      throw new Error("A pasta de trabalho precisa de permissão de escrita.");
    }
    const replacements = await Promise.all(
      batchJobs.map(async (job) => {
        if (!job.outputUrl) throw new Error("Cópia tratada indisponível.");
        const originId = audioJobOriginsRef.current.get(job.id);
        const origin = tracks.find((track) => track.id === originId);
        if (!origin) throw new Error("Faixa original não encontrada.");
        const response = await fetchOptional(job.outputUrl);
        if (!response) throw new Error("Cópia tratada não encontrada.");
        const blob = await response.blob();
        const original = await getWorkspaceFile(directory, origin.sourceKey);
        return { blob, job, origin, original };
      }),
    );
    const backupDirectory = await directory.getDirectoryHandle(
      "Backup-originais",
      { create: true },
    );
    const stamp = new Date()
      .toISOString()
      .replaceAll(":", "-")
      .replaceAll(".", "-");
    await writeReplacementsWithRollback(replacements, {
      backup: (replacement) =>
        copyFileToDirectory(
          backupDirectory,
          replacement.original,
          backupFileName(replacement.origin.sourceKey, stamp),
        ),
      write: (replacement, payload) =>
        writeBlobToWorkspacePath(
          directory,
          replacement.origin.sourceKey,
          payload as Blob,
        ),
    });
    const albumArtworkTargets = new Map<string, string>();
    for (const replacement of replacements) {
      if (!replacement.job.albumArtworkUrl) continue;
      albumArtworkTargets.set(
        albumFolderArtworkSourceKey(replacement.origin.sourceKey),
        replacement.job.albumArtworkUrl,
      );
    }
    for (const [targetPath, artworkUrl] of albumArtworkTargets) {
      const response = await fetchOptional(artworkUrl);
      if (!response) {
        throw new Error("Capa principal do álbum não encontrada.");
      }
      await writeBlobToWorkspacePath(
        directory,
        targetPath,
        await response.blob(),
      );
    }
    setTracks((current) =>
      current.map((track) => {
        const matched = replacements.find(
          (replacement) => replacement.origin.id === track.id,
        );
        if (!matched) return track;
        return {
          ...track,
          packageStatus: "treated",
          audioInfo: {
            ...(track.audioInfo ?? {
              fileName: track.sourceKey,
              durationSeconds: null,
              bitrate: null,
              codec: null,
            }),
            analysis: matched.job.analysis,
            hasEmbeddedCover: Boolean(coverForTrack(track)),
          },
        };
      }),
    );
  }

  function createSnapshot(): ProjectSnapshot {
    return {
      schemaVersion: 4,
      workspaceMode,
      workflowMode,
      audioStageView,
      visualStageView,
      podcastEnabled,
      activeStep,
      selectedTrackId,
      outputPreset,
      qualityProfile,
      publicationPresetId,
      publicationClipStart,
      publicationClipDuration,
      publicationIncludeLyrics,
      publicationGenerateDataFiles,
      publicationAssetMode,
      publicationAssetOverrides,
      showMetadata,
      coverFile: cover?.file,
      coverSeriesSettings,
      tracks: tracks.map((track) => ({
        id: track.id,
        sourceKey: track.sourceKey,
        source: track.source,
        variantOf: track.variantOf,
        versionLabel: track.versionLabel,
        metadata: track.metadata,
        outputBaseName: track.outputBaseName,
        scene: track.scene,
        sourceFile: track.sourceFile,
        audioInfo: track.audioInfo,
        layers: track.layers.map(({ src: _src, ...layer }) => layer),
        textSettings: track.textSettings,
        selectedForBatch: track.selectedForBatch,
        packageStatus: track.packageStatus,
        useSuggestedCover: track.useSuggestedCover,
        lyricsSourcePath: track.lyricsSourcePath,
        coverOverride: track.coverOverride ?? null,
        thumbnailPreviewMode: track.thumbnailPreviewMode,
        coverSeriesOverride: track.coverSeriesOverride ?? null,
      })),
    };
  }

  function saveActiveProjectSnapshot(snapshot: ProjectSnapshot) {
    if (!snapshot.tracks.length) return;
    const handle = musicDirectoryRef.current;
    const projectId = selectedInputProjectId;
    const activeSave =
      projectSaves.find((save) => save.id === selectedProjectSaveId) ??
      defaultProjectSave;
    cancelPendingProjectSnapshotSave();
    if (handle && projectId) {
      // External project: save via FileSystem Access API.
      projectSaveTimerRef.current = window.setTimeout(async () => {
        try {
          const permission = await handle.queryPermission?.({
            mode: "readwrite",
          });
          if (permission !== "granted") return;
          await writeProjectSnapshot(handle, snapshot, activeSave);
          setProjectStateStatus("Preferências do projeto salvas.");
        } catch (reason) {
          setProjectStateStatus(
            `Não foi possível salvar o projeto: ${messageOf(reason)}`,
          );
        }
      }, 350);
    } else if (projectId && projectId !== ".") {
      // Internal project: save via server API to input/<id>/.sonara/.
      projectSaveTimerRef.current = window.setTimeout(async () => {
        try {
          await saveInternalProjectSnapshot(projectId, snapshot, activeSave);
          setProjectStateStatus("Preferências do projeto salvas.");
        } catch (reason) {
          setProjectStateStatus(
            `Não foi possível salvar o projeto: ${messageOf(reason)}`,
          );
        }
      }, 350);
    }
  }

  function cancelPendingProjectSnapshotSave() {
    if (!projectSaveTimerRef.current) return;
    window.clearTimeout(projectSaveTimerRef.current);
    projectSaveTimerRef.current = null;
  }

  function applySnapshotSettings(
    snapshot?: ProjectSnapshot,
    options: { includeCover?: boolean } = {},
  ) {
    if (!snapshot) return;
    const includeCover = options.includeCover ?? true;
    const navigation = normalizeSnapshotNavigation(snapshot);
    // workflowMode is derived from the restored per-track selection, not set.
    setPodcastEnabled(Boolean(snapshot.podcastEnabled));
    setWorkspaceMode(navigation.workspaceMode);
    setAudioStageView(navigation.audioStageView);
    setVisualStageView(navigation.visualStageView);
    setActiveStep(navigation.activeStep);
    // Old sessions may carry a now-removed preset (youtube-2k/4k) — fall back to
    // 1080p so we never re-submit an unsupported resolution.
    setOutputPreset(
      outputPresets.some(([value]) => value === snapshot.outputPreset)
        ? snapshot.outputPreset
        : "youtube-1080p",
    );
    setQualityProfile(snapshot.qualityProfile);
    setPublicationPresetId(
      publicationAssetPresets.some(
        (preset) => preset.id === snapshot.publicationPresetId,
      )
        ? snapshot.publicationPresetId!
        : "youtube-thumbnail",
    );
    setPublicationClipStart(
      clampPublicationClipStart(snapshot.publicationClipStart ?? 0),
    );
    setPublicationClipDuration(
      clampPublicationClipDuration(snapshot.publicationClipDuration ?? 15),
    );
    setPublicationIncludeLyrics(Boolean(snapshot.publicationIncludeLyrics));
    setPublicationGenerateDataFiles(
      snapshot.publicationGenerateDataFiles ?? true,
    );
    setPublicationAssetMode(
      ["single", "group", "all"].includes(String(snapshot.publicationAssetMode))
        ? snapshot.publicationAssetMode!
        : "single",
    );
    setPublicationAssetOverrides(
      normalizePublicationAssetOverrides(snapshot.publicationAssetOverrides),
    );
    setShowMetadata(snapshot.showMetadata);
    setCoverSeriesSettings(
      normalizeCoverSeriesClient(snapshot.coverSeriesSettings),
    );
    if (includeCover && snapshot.coverFile) {
      setCover({
        file: snapshot.coverFile,
        src: URL.createObjectURL(snapshot.coverFile),
      });
    }
  }

  function setWorkspaceTracks(
    baseTracks: TrackDraft[],
    snapshot?: ProjectSnapshot,
  ) {
    if (!snapshot) {
      hydratingTracksRef.current = baseTracks;
      setTracks(baseTracks);
      setSelectedTrackId(baseTracks[0]?.id ?? "");
      return;
    }
    const savedBaseTracks = snapshot.tracks.filter((track) => !track.variantOf);
    const restoredBase = baseTracks.map((track) => {
      const saved = savedBaseTracks.find(
        (candidate) => candidate.sourceKey === track.sourceKey,
      );
      return saved ? restoreTrack(track, saved) : track;
    });
    const restoredIds = new Set(restoredBase.map((track) => track.sourceKey));
    const restoredUploads = savedBaseTracks
      .filter((track) => track.sourceFile && !restoredIds.has(track.sourceKey))
      .map((track) =>
        restoreTrack(trackFromFile(track.sourceFile!, track.audioInfo), track),
      );
    const bases = [...restoredBase, ...restoredUploads];
    const variations = snapshot.tracks
      .filter((track) => track.variantOf)
      .flatMap((track) => {
        const base = bases.find(
          (candidate) => candidate.id === track.variantOf,
        );
        const source = track.sourceFile
          ? trackFromFile(track.sourceFile, track.audioInfo)
          : base;
        return source ? [restoreTrack(source, track)] : [];
      });
    const restored = [...bases, ...variations];
    hydratingTracksRef.current = restored;
    setTracks(restored);
    setSelectedTrackId(
      restored.some((track) => track.id === snapshot.selectedTrackId)
        ? snapshot.selectedTrackId
        : (restored[0]?.id ?? ""),
    );
  }

  const exportJobCount = jobs.filter(
    (job) => job.kind === "video-render" || job.kind === "publication-asset",
  ).length;
  const audioItemLabel = podcastEnabled ? "episódio" : "música";
  const audioItemPluralLabel = podcastEnabled ? "episódios" : "músicas";
  const audioItemsPossessiveLabel = podcastEnabled
    ? "seus episódios"
    : "suas músicas";
  const selectedAudioItemLabel =
    selectedForBatchCount === 1
      ? `1 ${audioItemLabel} selecionad${podcastEnabled ? "o" : "a"}`
      : `${selectedForBatchCount} ${audioItemPluralLabel} selecionad${podcastEnabled ? "os" : "as"}`;
  const inspectorContextLabel =
    workspaceMode === "audio"
      ? audioStageView === "podcast"
        ? "Podcast"
        : "Biblioteca"
      : visualStageLabel(visualStageView, activeStep);

  return (
    <main
      className={`studio-shell ${leftCollapsed ? "left-hidden" : ""} ${rightCollapsed ? "right-hidden" : ""} ${panelsSwapped ? "panels-swapped" : ""} ${floatingPanels ? "floating-panels" : ""} ${resizingPanel ? "resizing-panels" : ""}`}
      style={shellStyle}
    >
      <header className="topbar">
        <div className="brand" aria-label="Sonara Hub">
          <img
            className="brand-logo"
            src="/brand/sonara-mark.svg"
            alt=""
            width="24"
            height="24"
            aria-hidden="true"
          />
          <span>SONARA HUB</span>
        </div>
        <div className="track-context">
          <IconButton
            label={leftCollapsed ? "Mostrar biblioteca" : "Ocultar biblioteca"}
            onClick={toggleLeftPanel}
          >
            {leftCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </IconButton>
          <div
            className="workspace-switch"
            role="tablist"
            aria-label="Workspace"
          >
            <button
              className={workspaceMode === "audio" ? "active" : ""}
              type="button"
              onClick={() => setWorkspaceMode("audio")}
            >
              Biblioteca de áudio
            </button>
            <button
              className={workspaceMode === "visual" ? "active" : ""}
              type="button"
              onClick={() => setWorkspaceMode("visual")}
            >
              Estúdio visual
            </button>
          </div>
          <strong>
            {selectedTrack?.metadata.title ?? "Nenhuma faixa selecionada"}
          </strong>
          {selectedTrack?.metadata.album && (
            <span>{selectedTrack.metadata.album}</span>
          )}
        </div>
        <div className="top-actions">
          <div className="top-layout-actions" aria-label="Layout dos painéis">
            <IconButton
              label={rightCollapsed ? "Mostrar inspetor" : "Ocultar inspetor"}
              onClick={toggleRightPanel}
            >
              {rightCollapsed ? <PanelRightOpen /> : <PanelRightClose />}
            </IconButton>
            <IconButton
              label="Inverter barras laterais"
              onClick={() => setPanelsSwapped((current) => !current)}
            >
              <Columns2 />
            </IconButton>
          </div>
          <div className="notification-bell">
            <IconButton
              label="Notificações da sessão"
              onClick={() => setNotificationsOpen((current) => !current)}
            >
              <Bell />
            </IconButton>
            {notificationLog.length > 0 && (
              <span className="notification-bell-count">
                {Math.min(99, notificationLog.length)}
              </span>
            )}
            {notificationsOpen && (
              <NotificationCenter
                notifications={notificationLog}
                onClose={() => setNotificationsOpen(false)}
                onClear={() => {
                  setNotificationLog([]);
                  setNotificationsOpen(false);
                }}
                onCopy={(text) => {
                  void copyTextToClipboard(text);
                  showToast("Notificação copiada.", "info");
                }}
              />
            )}
          </div>
          <IconButton
            label="Benchmarks"
            onClick={() => {
              window.location.assign("/benchmarks");
            }}
          >
            <BarChart3 />
          </IconButton>
          <IconButton
            label="Configurações locais"
            onClick={() => void openLocalSettings()}
          >
            <Settings />
          </IconButton>
          {workspaceMode === "visual" && (
            <button
              className="top-select"
              type="button"
              onClick={() => setActiveStep("export")}
            >
              {selectedOutput[1]}
              <ChevronDown />
            </button>
          )}
          <button
            className="primary-action"
            type="button"
            onClick={() =>
              workspaceMode === "audio"
                ? openAudioReview()
                : setActiveStep("export")
            }
          >
            <Check />
            {workspaceMode === "audio"
              ? "Revisar e processar"
              : workflowMode === "batch"
                ? "Revisar lote"
                : "Revisar exportação"}
          </button>
        </div>
      </header>

      {floatingPanels && (!leftCollapsed || !rightCollapsed) && (
        <button
          aria-label="Fechar painel lateral"
          className="floating-panel-backdrop"
          type="button"
          onClick={() => {
            setLeftCollapsed(true);
            setRightCollapsed(true);
          }}
        />
      )}

      <aside className="library-panel">
        {setupPanelOpen ? (
          <div className="workspace-setup">
            <div className="workspace-setup-greeting">
              <h2>Bem-vindo ao Sonara Hub</h2>
              <p>
                Defina suas pastas de trabalho para começar. Nada é carregado
                sozinho — você abre o que quiser, quando quiser.
              </p>
            </div>
            <div className="setup-field">
              <span className="setup-field-label">Pasta de entrada</span>
              <div className="setup-field-row">
                <div className="setup-field-value">
                  <strong>{inputFolderName}</strong>
                  <small>
                    {inputFolderKind === "internal"
                      ? "input/ interno da raiz"
                      : "pasta autorizada"}
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => void chooseInputDirectory()}
                >
                  <FolderOpen />{" "}
                  {inputFolderKind === "internal"
                    ? "Escolher externa"
                    : "Trocar"}
                </button>
              </div>
            </div>
            <div className="setup-field">
              <span className="setup-field-label">Pasta de saída</span>
              <div className="setup-field-row">
                <div className="setup-field-value">
                  <strong>{outputFolderName}</strong>
                  <small>
                    {outputFolderKind === "internal"
                      ? "outputs/ interno da raiz"
                      : "pasta autorizada"}
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => void chooseOutputDirectory()}
                >
                  <FolderOpen />{" "}
                  {outputFolderKind === "internal"
                    ? "Escolher externa"
                    : "Trocar"}
                </button>
              </div>
            </div>
            {!foldersReady ? (
              <>
                <button
                  className="upload-action setup-confirm-folders"
                  type="button"
                  onClick={() => setFoldersReady(true)}
                >
                  Confirmar pastas e continuar
                </button>
                <p className="helper-copy">
                  Defina entrada e saída acima e confirme. Só então os projetos
                  ficam disponíveis — assim nada carrega num espaço de trabalho
                  indefinido.
                </p>
              </>
            ) : (
              <>
                <div className="setup-field">
                  <span className="setup-field-label">Projeto</span>
                  {inputProjects.length > 0 ? (
                    <>
                      <div className="setup-field-row">
                        <select
                          className="setup-project-select"
                          value={selectedInputProjectId}
                          onChange={(event) =>
                            void selectInputProject(event.target.value)
                          }
                        >
                          <option value="">Escolha um projeto…</option>
                          {inputProjects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {projectOptionLabel(project, audioItemLabel)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="helper-copy">
                        Abrir um projeto carrega {audioItemsPossessiveLabel} e
                        os ajustes salvos no .sonara dele.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="setup-field-row">
                        <button
                          type="button"
                          onClick={() => void loadWorkspaceBaseline()}
                        >
                          <RotateCcw /> Atualizar lista
                        </button>
                      </div>
                      <p className="helper-copy">
                        Nenhum projeto interno encontrado. Confirme que o
                        servidor está no ar (npm run dev) e que há projetos na
                        pasta de entrada — ou abra uma pasta/arquivo externo
                        abaixo.
                      </p>
                    </>
                  )}
                </div>
                {selectedInputProjectId && (
                  <ProjectSaveControls
                    busy={projectSavesBusy}
                    onDelete={() => void deleteProjectSave()}
                    onRename={() => void renameProjectSave()}
                    onSaveAs={() => void saveProjectAs()}
                    onSelect={(saveId) => void selectProjectSave(saveId)}
                    saves={projectSaves}
                    selectedSaveId={selectedProjectSaveId}
                  />
                )}
                <div className="setup-actions">
                  <button
                    type="button"
                    onClick={() => audioInputRef.current?.click()}
                  >
                    <Plus /> Abrir arquivo
                  </button>
                  {typeof window !== "undefined" &&
                    !window.showDirectoryPicker && (
                      <button
                        className="quiet-action"
                        type="button"
                        onClick={() => fallbackFolderInputRef.current?.click()}
                      >
                        <FolderOpen /> Importar arquivos
                      </button>
                    )}
                </div>
                <label className="check-field setup-write-toggle">
                  <input
                    checked={workspaceWriteEnabled}
                    type="checkbox"
                    onChange={(event) =>
                      event.target.checked
                        ? void enableWorkspaceWrites()
                        : disableWorkspaceWrites()
                    }
                  />
                  Substituir ao finalizar (modo destrutivo)
                </label>
                <p className="helper-copy">
                  {workspaceWriteEnabled
                    ? "Os originais só serão trocados se todos os itens selecionados terminarem; cancelar ou falhar preserva a pasta."
                    : "Modo não destrutivo: os arquivos originais nunca são alterados — tudo vai para a pasta de saída."}
                </p>
                {projectStateStatus && (
                  <small className="library-project-status">
                    {projectStateStatus}
                  </small>
                )}
                <button
                  className="quiet-action setup-restore"
                  type="button"
                  onClick={() => void loadInitialWorkspace()}
                >
                  <RotateCcw /> Restaurar última sessão
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <ProjectSwitcher
              coverSrc={coverForTrack(selectedTrack ?? tracks[0])?.src}
              folderName={folderName}
              onOpenSetup={() => setSetupPanelOpen(true)}
              onSelect={(projectId) => void selectInputProject(projectId)}
              projectLabel={(project) =>
                projectOptionLabel(project, audioItemLabel)
              }
              projects={inputProjects}
              selectedProjectId={selectedInputProjectId}
              subtitle={
                (selectedTrack ?? tracks[0])?.metadata.album ||
                (selectedTrack ?? tracks[0])?.metadata.artist ||
                "espaço de trabalho"
              }
            />
            {selectedInputProjectId && (
              <ProjectSaveControls
                busy={projectSavesBusy}
                compact
                onDelete={() => void deleteProjectSave()}
                onRename={() => void renameProjectSave()}
                onSaveAs={() => void saveProjectAs()}
                onSelect={(saveId) => void selectProjectSave(saveId)}
                saves={projectSaves}
                selectedSaveId={selectedProjectSaveId}
              />
            )}
            <div className="library-caption-block">
              <div className="library-caption">
                <span>
                  {tracks.length === 1
                    ? `1 ${audioItemLabel}`
                    : `${tracks.length} ${audioItemPluralLabel}`}
                </span>
                <span>
                  {selectedForBatchCount === 0
                    ? "fluxo individual"
                    : `${selectedAudioItemLabel} · lote`}
                </span>
              </div>
              <div className="track-list">
                {(() => {
                  // Originals that already produced a treated copy collapse (dim) so
                  // the eye goes to the treated set, which is what the video step uses.
                  const treatedOrigins = new Set(
                    tracks
                      .filter((track) => track.packageStatus === "treated")
                      .map((track) => track.variantOf),
                  );
                  return tracks.map((track) => (
                    <div
                      className={`track-row batch ${track.id === selectedTrack?.id ? "selected" : ""} ${treatedOrigins.has(track.id) ? "has-treated" : ""}`}
                      key={track.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedTrackId(track.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedTrackId(track.id);
                        }
                      }}
                    >
                      <input
                        aria-label={`Selecionar ${track.metadata.title} para o lote`}
                        checked={track.selectedForBatch}
                        type="checkbox"
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          event.stopPropagation();
                          setTracks((current) =>
                            current.map((item) =>
                              item.id === track.id
                                ? {
                                    ...item,
                                    selectedForBatch: event.target.checked,
                                  }
                                : item,
                            ),
                          );
                        }}
                      />
                      <span className="track-cover">
                        {coverForTrack(track)?.src ? (
                          <img alt="" src={coverForTrack(track)?.src} />
                        ) : (
                          <Music2 />
                        )}
                      </span>
                      <span className="track-copy">
                        <strong>{track.metadata.title}</strong>
                        <small>
                          <span>
                            {formatDuration(track.audioInfo?.durationSeconds)}
                          </span>
                          <em>
                            {track.packageStatus === "treated"
                              ? "Tratado"
                              : "Original"}
                          </em>
                          {track.metadata.version && (
                            <em>{track.metadata.version}</em>
                          )}
                        </small>
                      </span>
                      <button
                        aria-label={`Remover ${track.metadata.title} da fila`}
                        className="track-remove"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeTrackFromQueue(track.id);
                        }}
                      >
                        <Trash2 />
                      </button>
                      <span className="track-status" />
                    </div>
                  ));
                })()}
              </div>
              <div className="library-footer">
                {projectStateStatus && (
                  <small className="library-project-status">
                    {projectStateStatus}
                  </small>
                )}
                <button
                  className="library-footer-mode"
                  type="button"
                  title="Abrir Setup para alternar o modo de escrita"
                  onClick={() => setSetupPanelOpen(true)}
                >
                  <span
                    className={`library-mode-badge ${workspaceWriteEnabled ? "write" : ""}`}
                  >
                    {workspaceWriteEnabled
                      ? "Substituição ativa"
                      : "Não destrutivo"}
                  </span>
                </button>
              </div>
            </div>
          </>
        )}
        <input
          hidden
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          onChange={(event) => void addAudioFile(event.target.files?.[0])}
        />
        <input
          hidden
          multiple
          ref={fallbackFolderInputRef}
          type="file"
          accept="audio/*"
          {...({ webkitdirectory: "" } as Record<string, string>)}
          onChange={(event) => void onFallbackFolder(event.target.files)}
        />
        <PanelResizeHandle
          active={resizingPanel === "library"}
          className="library-resize"
          label="Redimensionar biblioteca"
          onPointerDown={(event) => startPanelResize("library", event)}
          onReset={() => setLeftRailWidth(DEFAULT_LEFT_RAIL_WIDTH)}
        />
      </aside>

      <section className="preview-workspace">
        {workspaceMode === "audio" && audioStageView === "edit" ? (
          <AudioLibraryWorkspace
            audioBands={audioBands}
            fileNamePattern={fileNamePattern}
            staticWaveformPeaks={
              selectedTrack ? staticWaveforms[selectedTrack.id] : undefined
            }
            batchApplyMode={batchApplyMode}
            batchCommon={batchCommon}
            folderImportProgress={folderImportProgress}
            jobs={jobs}
            queuePaused={queuePaused}
            tracks={tracks}
            selectedTrack={selectedTrack}
            selectedTrackId={selectedTrackId}
            workflowMode={workflowMode}
            onApplyBatchCommon={applyBatchCommon}
            onBatchApplyMode={setBatchApplyMode}
            onBatchCommon={setBatchCommon}
            onCancelAllJobs={() => void cancelAllJobs()}
            onCancelJob={(id) => void cancelJob(id)}
            onClearTerminalJobs={() => void clearCompletedJobs("terminal")}
            onPauseQueue={() => void pauseQueue()}
            onResumeQueue={() => void resumeQueue()}
            onReorderTrack={reorderTrackInBatch}
            onSelectTrack={setSelectedTrackId}
            onToggleTrack={toggleTrackBatchSelection}
            onToggleTracks={(ids, selected) =>
              setTracks((current) =>
                current.map((track) =>
                  ids.includes(track.id)
                    ? { ...track, selectedForBatch: selected }
                    : track,
                ),
              )
            }
            onTrackMetadata={updateTrackMetadata}
          />
        ) : workspaceMode === "audio" && audioStageView === "catalog" ? (
          <CatalogPreview
            coverForTrack={coverForTrack}
            seriesSettingsForTrack={seriesSettingsForTrack}
            onInspectArtwork={openArtworkEditor}
            onSelectTrack={setSelectedTrackId}
            tracks={reviewTracks}
          />
        ) : workspaceMode === "audio" && audioStageView === "artwork" ? (
          <CoverArtworkWorkspace
            albumCoverForTrack={albumCoverForTrack}
            coverForTrack={coverForTrack}
            coverSeriesSettings={coverSeriesSettings}
            selectedTrackId={selectedTrackId}
            seriesSettingsForTrack={seriesSettingsForTrack}
            onChooseCover={chooseCatalogCover}
            onClearCover={clearSelectedCover}
            onClearCoverSeriesOverride={clearCoverSeriesOverride}
            onCoverSeriesPatch={applyCoverSeriesPatch}
            onRestoreSuggestedCover={restoreSuggestedCover}
            onSaveCoverSeriesDefault={saveCoverSeriesDefault}
            onSelectTrack={setSelectedTrackId}
            onSelectSuggestedCover={selectSuggestedCover}
            tracks={reviewTracks}
          />
        ) : workspaceMode === "audio" && audioStageView === "podcast" ? (
          <PodcastWorkspace
            jobs={jobs}
            projectName={selectedInputProjectName()}
            queuePaused={queuePaused}
            selectedTrackId={selectedTrackId}
            tracks={tracks}
            onCancelAllJobs={() => void cancelAllJobs()}
            onCancelJob={(id) => void cancelJob(id)}
            onClearTerminalJobs={() => void clearCompletedJobs("podcast-feed")}
            onCreateFeed={(sidecar) => void submitPodcastFeed(sidecar)}
            onPauseQueue={() => void pauseQueue()}
            onResumeQueue={() => void resumeQueue()}
            onSelectTrack={setSelectedTrackId}
          />
        ) : workspaceMode === "audio" && audioStageView === "audio-export" ? (
          <AudioExportWorkspace
            jobs={jobs}
            queuePaused={queuePaused}
            selectedCount={reviewTracks.length}
            treatedCount={treatedTrackCount}
            onCancelAllJobs={() => void cancelAllJobs()}
            onCancelJob={(id) => void cancelJob(id)}
            onClearTerminalJobs={() => void clearCompletedJobs("terminal")}
            onPauseQueue={() => void pauseQueue()}
            onResumeQueue={() => void resumeQueue()}
          />
        ) : workspaceMode === "visual" && visualStageView === "review" ? (
          <VideoReviewGrid
            coverForTrack={coverForTrack}
            selectedTrackId={selectedTrackId}
            onEditVisual={openVisualEditor}
            onSelectTrack={setSelectedTrackId}
            onThumbnailMode={(trackId, thumbnailPreviewMode) =>
              updateTrackDraft(trackId, { thumbnailPreviewMode })
            }
            onThumbnailTime={(trackId, thumbnailTime) =>
              updateTrackDraft(trackId, { thumbnailTime })
            }
            outputLabel={selectedOutput[1]}
            showMetadata={showMetadata}
            tracks={reviewTracks}
          />
        ) : workspaceMode === "visual" && visualStageView === "promotion" ? (
          <PublicationAssetsWorkspace
            assetMode={publicationAssetMode}
            exportCount={publicationExportCount}
            exporting={publicationExporting}
            excludedTrackIds={publicationExcludedTrackIds}
            jobs={jobs}
            preset={selectedPublicationPreset}
            previewAudioSrc={audioSrc}
            previewComposition={selectedTrack ? previewComposition : null}
            previewTrack={selectedTrack}
            queuePaused={queuePaused}
            lyricsPreviewText={selectedPublicationLyricsPreview}
            selectedPresetIds={publicationSelectedPresetIds}
            selectedSettings={selectedPublicationSettings}
            tracks={reviewTracks}
            onAllTracks={setAllPublicationTracks}
            onCancelAllJobs={() => void cancelAllJobs()}
            onCancelJob={(id) => void cancelJob(id)}
            onClearTerminalJobs={() =>
              void clearCompletedJobs("publication-asset")
            }
            onCopyJobError={(job) => void copyJobError(job)}
            onExport={() => void exportPublicationAssets()}
            onPauseQueue={() => void pauseQueue()}
            onPreset={setPublicationPresetId}
            onPresetScope={setPublicationPresetScope}
            onResumeQueue={() => void resumeQueue()}
            onReviewVideos={() => setVisualStageView("review")}
            onStopExport={() => stopPublicationExport()}
            onTogglePreset={togglePublicationPreset}
            onToggleTrack={togglePublicationTrack}
            onAssetSettings={(patch) =>
              updatePublicationAssetOverride(publicationPresetId, patch)
            }
            onUpdateLayer={(trackId, patch) => updateTrackDraft(trackId, patch)}
          />
        ) : workspaceMode === "visual" &&
          visualStageView === "publication-export" ? (
          <VideoExportWorkspace
            jobs={jobs}
            outputLabel={selectedOutput[1]}
            queuePaused={queuePaused}
            selectedCount={reviewTracks.length}
            onCancelAllJobs={() => void cancelAllJobs()}
            onCancelJob={(id) => void cancelJob(id)}
            onClearPublicationJobs={() =>
              void clearCompletedJobs("publication-asset")
            }
            onClearVideoJobs={() => void clearCompletedJobs("video-render")}
            onCopyJobError={(job) => void copyJobError(job)}
            onPauseQueue={() => void pauseQueue()}
            onResumeQueue={() => void resumeQueue()}
            onVisualize={() => setVisualStageView("review")}
          />
        ) : (
          <div className="canvas-table">
            <div className="preview-frame">
              <ScenePreview
                audioBandsRef={audioBandsRef}
                audioRef={audioRef}
                coverSrc={previewComposition.cover?.src}
                durationSeconds={selectedTrack?.audioInfo?.durationSeconds}
                layers={previewComposition.layers}
                metadata={previewComposition.metadata ?? defaultMetadata}
                scene={previewComposition.scene ?? builtinVisualPresets[0]}
                showMetadata={previewComposition.showMetadata}
                textSettings={
                  previewComposition.textSettings ?? defaultTextSettings
                }
              />
              {selectedTrack && (
                <CanvasInteractionOverlay
                  layers={selectedTrack.layers}
                  showMetadata={previewComposition.showMetadata}
                  textSettings={
                    previewComposition.textSettings ?? defaultTextSettings
                  }
                  onUpdateLayer={updateLayer}
                  onUpdateTextSettings={updateTextSettings}
                  cloudLight={
                    selectedScene.cloudLight?.enabled &&
                    selectedScene.rendererId !== "volumetric-clouds"
                      ? {
                          x: selectedScene.cloudLight.x,
                          y: selectedScene.cloudLight.y,
                          enabled: true,
                        }
                      : null
                  }
                  onCloudLight={(patch) =>
                    selectedScene.cloudLight &&
                    updateCloudLight({
                      ...selectedScene.cloudLight,
                      ...patch,
                    })
                  }
                  waveform={
                    selectedScene.waveform?.visible
                      ? {
                          position: selectedScene.waveform.position,
                          width: selectedScene.waveform.width,
                          height: selectedScene.waveform.height,
                          visible: true,
                        }
                      : null
                  }
                  onWaveformDrag={(patch) =>
                    updateWaveform({
                      ...selectedScene.waveform,
                      ...patch,
                    })
                  }
                />
              )}
            </div>
          </div>
        )}
      </section>

      <div className="transport-dock">
        <Transport
          audioRef={audioRef}
          audioSrc={audioSrc}
          canNext={
            selectedTrackIndex >= 0 && selectedTrackIndex < tracks.length - 1
          }
          canPrevious={selectedTrackIndex > 0}
          trackArtist={selectedTrack?.metadata.artist ?? ""}
          trackCount={tracks.length}
          trackIndex={selectedTrackIndex}
          trackTitle={selectedTrack?.metadata.title ?? ""}
          artworkLabel={playerArtworkLabel}
          artworkSrc={playerArtworkSrc}
          onNext={() => selectAdjacentTrack(1)}
          onPrevious={() => selectAdjacentTrack(-1)}
          onEditArtwork={() => openArtworkEditor()}
          onToggle={() => void togglePlayback()}
        />
      </div>

      <aside
        className={`inspector-panel${workflowMode === "batch" ? " is-batch" : ""}`}
      >
        <PanelResizeHandle
          active={resizingPanel === "inspector"}
          className="inspector-resize"
          label="Redimensionar inspetor"
          onPointerDown={(event) => startPanelResize("inspector", event)}
          onReset={() => setRightRailWidth(DEFAULT_RIGHT_RAIL_WIDTH)}
        />
        <div className="inspector-header">
          <strong>Ajustes</strong>
          <span>{inspectorContextLabel}</span>
        </div>
        {selectedTrack ? (
          <div className="inspector-scroll">
            {workspaceMode === "audio" ? (
              audioStageView === "podcast" ? (
                <PodcastInspector
                  selectedTrack={selectedTrack}
                  tracks={tracks}
                  onChange={updateMetadata}
                  onSelectTrack={setSelectedTrackId}
                />
              ) : (
                <AudioLibraryInspector
                  analysis={selectedTrack.audioInfo?.analysis}
                  fileNamePattern={fileNamePattern}
                  lyricsOptions={selectedTrack.lyricsOptions ?? []}
                  lyricsSourcePath={selectedTrack.lyricsSourcePath}
                  metadata={selectedTrack.metadata}
                  workflowMode={workflowMode}
                  onAnalyze={() => void analyzeSelectedAudio()}
                  onApplyPublicationBatch={
                    workflowMode === "batch"
                      ? applyPublicationToBatch
                      : undefined
                  }
                  onApplySuggestions={() =>
                    updateMetadata(
                      metadataFromAudio(
                        selectedTrack.audioInfo,
                        selectedTrack.metadata,
                        true,
                      ),
                    )
                  }
                  onChange={updateMetadata}
                  onFileNamePattern={updateFileNamePattern}
                  onCreateVariation={createVariation}
                  onApplyLyricsSuggestion={(suggestion) =>
                    void applyLyricsSuggestion(suggestion)
                  }
                  onIgnoreLyricsSuggestions={ignoreLyricsSuggestions}
                  onProcess={() => void processReviewedAudio()}
                  onReplaceAudio={
                    selectedTrack.variantOf
                      ? () => variationAudioInputRef.current?.click()
                      : undefined
                  }
                  isAnalyzing={analyzingTrackIds.includes(selectedTrack.id)}
                  versionSuggestions={versionSuggestions}
                />
              )
            ) : visualStageView === "promotion" ? (
              <PublicationInspector
                assetMode={publicationAssetMode}
                assetSettings={selectedPublicationSettings}
                clipDuration={publicationClipDuration}
                clipStart={publicationClipStart}
                generateDataFiles={publicationGenerateDataFiles}
                includeLyrics={publicationIncludeLyrics}
                lyricsText={selectedTrack.metadata.lyrics}
                outputConflictMode={videoOutputConflictMode}
                outputFolderName={outputFolderName}
                presetId={publicationPresetId}
                presetOverrideActive={Boolean(
                  publicationAssetOverrides[publicationPresetId],
                )}
                selectedCount={reviewTracks.length}
                selectedPreset={selectedPublicationPreset}
                onApplyTextToScope={applyPublicationTextToScope}
                onAssetMode={setPublicationPresetScope}
                onAssetSettings={(patch) =>
                  updatePublicationAssetOverride(publicationPresetId, patch)
                }
                onChooseOutput={() => void chooseOutputDirectory()}
                onClipDuration={(value) =>
                  setPublicationClipDuration(
                    clampPublicationClipDuration(value),
                  )
                }
                onClipStart={(value) =>
                  setPublicationClipStart(clampPublicationClipStart(value))
                }
                onExport={() => void exportPublicationAssets()}
                onGenerateDataFiles={setPublicationGenerateDataFiles}
                onIncludeLyrics={setPublicationIncludeLyrics}
                onOutputConflictMode={(value) =>
                  setVideoOutputConflictMode(
                    normalizeVideoOutputConflictMode(value),
                  )
                }
                onPreset={setPublicationPresetId}
                onResetAssetSettings={() =>
                  resetPublicationAssetOverride(publicationPresetId)
                }
              />
            ) : activeStep === "music" ? (
              <MusicInspector
                metadata={selectedTrack.metadata}
                onApplySuggestions={() =>
                  updateMetadata(
                    metadataFromAudio(
                      selectedTrack.audioInfo,
                      selectedTrack.metadata,
                      true,
                    ),
                  )
                }
                onChange={updateMetadata}
                onCreateVariation={createVariation}
                onApplyCommonBatch={
                  workflowMode === "batch" ? applyMusicToBatch : undefined
                }
                onReplaceAudio={
                  selectedTrack.variantOf
                    ? () => variationAudioInputRef.current?.click()
                    : undefined
                }
                versionSuggestions={versionSuggestions}
              />
            ) : activeStep === "visual" ? (
              <VisualInspector
                layers={selectedTrack.layers}
                layerUndoLabel={
                  layersUndo && layersUndo.trackId === selectedTrack.id
                    ? layersUndo.label
                    : null
                }
                presets={visualPresets}
                renderStack={computeRenderStack()}
                scene={selectedScene}
                selectedStackKey={selectedStackKey}
                onSelectStackKey={setSelectedStackKey}
                onAddLayer={() => layerInputRef.current?.click()}
                onAdvanced={updateAdvanced}
                onApplyCoverLayer={addCoverLayerPreset}
                onApplyCoverLayerBatch={
                  workflowMode === "batch"
                    ? applyCoverLayerPresetToBatch
                    : undefined
                }
                onApplyLayersBatch={
                  workflowMode === "batch" ? applyLayersToBatch : undefined
                }
                onApplyLayerSet={applyLayerSet}
                onCloudLight={updateCloudLight}
                onColors={updateColors}
                onCommon={updateCommon}
                onDeletePreset={() => void deletePreset()}
                onDuplicatePreset={() => void duplicatePreset()}
                onMoveRenderStack={moveCompositionItem}
                onPalette={applyPalette}
                onPlayful={updatePlayful}
                onRemoveLayer={removeLayer}
                onSavePreset={() => void savePreset()}
                onUndoLayer={undoLayers}
                onUpdateLayer={updateLayer}
                onSelectPreset={selectPreset}
                onWaveform={updateWaveform}
                onApplyBatch={
                  workflowMode === "batch" ? applyVisualToBatch : undefined
                }
              />
            ) : activeStep === "text" ? (
              <TextInspector
                metadata={selectedTrack.metadata}
                scene={selectedScene}
                showMetadata={showMetadata}
                textSettings={selectedTrack.textSettings}
                onChange={updateMetadata}
                onCommon={updateCommon}
                onTextSettings={updateTextSettings}
                onToggle={setShowMetadata}
                versionSuggestions={versionSuggestions}
                onApplyBatch={
                  workflowMode === "batch" ? applyTextToBatch : undefined
                }
              />
            ) : (
              <ExportInspector
                coverName={selectedCover?.file.name}
                batchCount={
                  tracks.filter((track) => track.selectedForBatch).length
                }
                jobs={jobs}
                layerCount={selectedTrack.layers.length}
                outputFolderName={outputFolderName}
                outputConflictMode={videoOutputConflictMode}
                outputPreset={outputPreset}
                fileNamePattern={fileNamePattern}
                qualityProfile={qualityProfile}
                scene={selectedScene}
                metadata={selectedTrack.metadata}
                workflowMode={workflowMode}
                onChooseOutput={() => void chooseOutputDirectory()}
                onClearCompleted={() => void clearCompletedJobs("video-render")}
                onExport={() => void exportSelected()}
                onFileNamePattern={updateFileNamePattern}
                onMetadata={updateMetadata}
                onOutputConflictMode={(value) =>
                  setVideoOutputConflictMode(
                    normalizeVideoOutputConflictMode(value),
                  )
                }
                onPreset={setOutputPreset}
                onQuality={setQualityProfile}
              />
            )}
          </div>
        ) : (
          <div className="empty-inspector">
            Abra uma pasta de músicas para iniciar.
          </div>
        )}
      </aside>

      <footer className="statusbar">
        <span className="save-status">
          <Check /> Alterações salvas localmente
        </span>
        {workspaceMode === "visual" ? (
          <nav className="steps" aria-label="Etapas do projeto">
            {(["visual", "text"] as ActiveStep[]).map((step) => {
              const StepIcon = {
                music: Music2,
                visual: Image,
                text: FileText,
                export: Download,
              }[step];
              return (
                <button
                  className={
                    visualStageView === "editor" && step === activeStep
                      ? "active"
                      : ""
                  }
                  key={step}
                  type="button"
                  onClick={() => {
                    setVisualStageView("editor");
                    setActiveStep(step);
                  }}
                >
                  <StepIcon />
                  {stepLabel(step)}
                </button>
              );
            })}
            <button
              className={visualStageView === "promotion" ? "active" : ""}
              type="button"
              onClick={() => {
                setVisualStageView("promotion");
                setActiveStep("export");
              }}
            >
              <Image />
              Divulgação
            </button>
            <button
              className={visualStageView === "review" ? "active" : ""}
              type="button"
              onClick={() => setVisualStageView("review")}
            >
              <Video />
              Visualizar
            </button>
            <button
              className={
                visualStageView === "publication-export" ? "active" : ""
              }
              type="button"
              onClick={() => {
                setVisualStageView("publication-export");
                setActiveStep("export");
              }}
            >
              <Download />
              Exportar Divulgação
            </button>
          </nav>
        ) : (
          <nav
            className="stage-view-switch"
            aria-label="Conferência da biblioteca"
          >
            <button
              className={audioStageView === "edit" ? "active" : ""}
              type="button"
              onClick={() => setAudioStageView("edit")}
            >
              <SlidersHorizontal /> Editar
            </button>
            <button
              className={audioStageView === "artwork" ? "active" : ""}
              type="button"
              onClick={() => openArtworkEditor()}
            >
              <Image /> Capas
            </button>
            {podcastEnabled && (
              <button
                className={audioStageView === "podcast" ? "active" : ""}
                type="button"
                onClick={() => setAudioStageView("podcast")}
              >
                <FileAudio /> Podcast
              </button>
            )}
            <button
              className={audioStageView === "catalog" ? "active" : ""}
              type="button"
              onClick={() => setAudioStageView("catalog")}
            >
              <Disc3 /> Catálogo
            </button>
            <button
              className={audioStageView === "audio-export" ? "active" : ""}
              type="button"
              onClick={() => setAudioStageView("audio-export")}
            >
              <Download /> Exportar Áudio
            </button>
          </nav>
        )}
        <span className="project-state">
          {workspaceMode === "audio"
            ? `${reviewTracks.length} selecionada${reviewTracks.length === 1 ? "" : "s"} · ${treatedTrackCount} tratada${treatedTrackCount === 1 ? "" : "s"} · ${audioWarningCount} alerta${audioWarningCount === 1 ? "" : "s"}`
            : visualStageView === "promotion"
              ? `${publicationAssetPresetLabel(publicationPresetId)} · ${publicationPresetSelection.length} preset${publicationPresetSelection.length === 1 ? "" : "s"}`
              : visualStageView === "publication-export"
                ? `${exportJobCount} job${exportJobCount === 1 ? "" : "s"} · fila de exportação`
                : `${selectedOutput[1]} · ${selectedTrack?.layers.length ?? 0}/3 camadas · waveform ${selectedScene.waveform.visible ? "ativa" : "desligada"}`}
        </span>
      </footer>

      <input
        hidden
        ref={layerInputRef}
        multiple
        type="file"
        accept="image/*,video/*,.svg"
        onChange={(event) => addLayers(event.target.files)}
      />
      <input
        hidden
        ref={variationAudioInputRef}
        type="file"
        accept="audio/*"
        onChange={(event) => void replaceSelectedAudio(event.target.files?.[0])}
      />
      <input
        hidden
        ref={coverInputRef}
        type="file"
        accept="image/*,.svg"
        onChange={(event) => {
          const file = event.target.files?.[0];
          handleCoverFileSelected(file);
          event.currentTarget.value = "";
        }}
      />
      <audio ref={audioRef} src={audioSrc || undefined} />
      {settingsOpen && (
        <div
          className="settings-overlay"
          role="presentation"
          onMouseDown={() => setSettingsOpen(false)}
        >
          <section
            aria-labelledby="local-settings-title"
            aria-modal="true"
            className="settings-panel"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="settings-header">
              <div>
                <span className="overline">Preferências locais</span>
                <h2 id="local-settings-title">Armazenamento e sessão</h2>
              </div>
              <IconButton
                label="Fechar configurações"
                onClick={() => setSettingsOpen(false)}
              >
                <X />
              </IconButton>
            </header>
            <div className="settings-body">
              <section className="settings-section">
                <div>
                  <h3>Pastas do sistema</h3>
                  <p>
                    Defina a Pasta de Entrada com seus projetos e a Pasta de
                    Saída para vídeos e sidecars exportados.
                  </p>
                  <small>
                    Entrada: {inputFolderName} (
                    {inputFolderKind === "internal" ? "interno" : "autorizado"})
                    · Saída: {outputFolderName} (
                    {outputFolderKind === "internal" ? "interno" : "autorizado"}
                    )
                  </small>
                </div>
                <div className="settings-action-stack">
                  <button
                    className="quiet-action settings-action"
                    type="button"
                    onClick={() => void chooseInputDirectory()}
                  >
                    <FolderOpen /> Escolher entrada externa
                  </button>
                  <button
                    className="quiet-action settings-action"
                    type="button"
                    onClick={() => void chooseOutputDirectory()}
                  >
                    <FolderOpen /> Escolher saída externa
                  </button>
                </div>
              </section>
              <section className="settings-section">
                <div>
                  <h3>Podcast</h3>
                  <p>
                    Mostra uma guia dedicada na Biblioteca de Áudio para
                    episódios, temporadas, feed RSS, perfis de voz e inserts.
                  </p>
                  <small>
                    {podcastEnabled
                      ? "Guia Podcast habilitada neste workspace."
                      : "Desabilitado por padrão; projetos de música não migram automaticamente."}
                  </small>
                </div>
                <label className="check-field settings-toggle">
                  <input
                    aria-label="Habilitar Podcast"
                    checked={podcastEnabled}
                    type="checkbox"
                    onChange={(event) =>
                      setPodcastEnabled(event.target.checked)
                    }
                  />
                  <span>Habilitar guia Podcast</span>
                </label>
              </section>
              <section className="settings-section">
                <div className="settings-project-cleanup">
                  <div>
                    <h3>Dados dos projetos</h3>
                    <p>
                      Limpe apenas os saves `.sonara` gravados em cada projeto
                      da Pasta de Entrada.
                    </p>
                    <small>
                      {inputProjects.length
                        ? `${inputProjects.length} projeto${inputProjects.length === 1 ? "" : "s"} detectado${inputProjects.length === 1 ? "" : "s"}`
                        : "Nenhum projeto detectado"}
                    </small>
                  </div>
                  {inputProjects.length > 0 && (
                    <div
                      aria-label="Projetos para limpeza seletiva"
                      className="settings-project-list"
                    >
                      {inputProjects.map((project) => (
                        <label
                          className="settings-project-option"
                          key={project.id}
                        >
                          <input
                            aria-label={`Selecionar ${project.name} para limpeza`}
                            checked={cleanupProjectIds.includes(project.id)}
                            type="checkbox"
                            onChange={(event) =>
                              toggleCleanupProjectSelection(
                                project.id,
                                event.target.checked,
                              )
                            }
                          />
                          <span className="settings-project-copy">
                            <strong>{project.name}</strong>
                            <small>
                              {project.trackCount}{" "}
                              {project.trackCount === 1
                                ? audioItemLabel
                                : audioItemPluralLabel}
                            </small>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="settings-action-stack">
                  <button
                    className="quiet-action settings-action"
                    disabled={cleanupBusy || !selectedInputProjectId}
                    type="button"
                    onClick={() => void cleanupProjectState("current")}
                  >
                    <Trash2 /> Limpar projeto atual
                  </button>
                  <button
                    className="quiet-action settings-action danger-action"
                    disabled={cleanupBusy || cleanupProjectIds.length === 0}
                    type="button"
                    onClick={() => void cleanupProjectState("selected")}
                  >
                    <Trash2 /> Limpar selecionados
                  </button>
                  <button
                    className="quiet-action settings-action danger-action"
                    disabled={cleanupBusy || inputProjects.length === 0}
                    type="button"
                    onClick={() => void cleanupProjectState("all")}
                  >
                    <Trash2 /> Limpar todos os projetos
                  </button>
                </div>
              </section>
              <section className="settings-section">
                <div>
                  <h3>Histórico da fila</h3>
                  <p>
                    Remova registros concluídos sem alterar a sessão, as faixas
                    ou os arquivos locais.
                  </p>
                  <small>
                    {storageUsage
                      ? `${storageUsage.jobs.terminal} concluídos · ${storageUsage.jobs.active} ativos`
                      : "Calculando uso local..."}
                  </small>
                </div>
                <button
                  className="quiet-action settings-action"
                  type="button"
                  onClick={() => void clearCompletedJobs("terminal")}
                >
                  <Trash2 /> Limpar histórico concluído
                </button>
              </section>
              <section className="settings-section">
                <div>
                  <h3>Arquivos temporários</h3>
                  <p>
                    Limpe uploads transitórios, capturas interrompidas e prévias
                    locais quando desejar.
                  </p>
                  <small>{formatUsage(storageUsage?.temporary)}</small>
                </div>
                <button
                  className="quiet-action settings-action"
                  disabled={cleanupBusy}
                  type="button"
                  onClick={() => void cleanupLocalFiles("temporary")}
                >
                  <Trash2 /> Limpar temporários
                </button>
              </section>
              <section className="settings-section settings-section-danger">
                <div>
                  <h3>Arquivos gerados locais</h3>
                  <p>
                    Exclua vídeos, sidecars e cópias tratadas que permanecem no
                    armazenamento interno. Arquivos movidos para pastas externas
                    não serão tocados.
                  </p>
                  <small>{formatUsage(storageUsage?.generated)}</small>
                </div>
                <button
                  className="quiet-action settings-action danger-action"
                  disabled={cleanupBusy}
                  type="button"
                  onClick={() => void cleanupLocalFiles("generated")}
                >
                  <Trash2 /> Excluir arquivos gerados locais
                </button>
              </section>
            </div>
          </section>
        </div>
      )}
      <ToastViewport
        toasts={toasts}
        onCopy={(toast) => {
          void copyTextToClipboard(toast.copyText ?? toast.message);
          showToast("Mensagem copiada para a área de transferência.", "info");
        }}
        onDismiss={dismissToast}
      />
      {interactionDialog && (
        <InteractionDialog
          dialog={interactionDialog}
          key={interactionDialog.id}
          onCancel={() => closeInteractionDialog(null)}
          onConfirm={(value) => closeInteractionDialog(value)}
        />
      )}
    </main>
  );
}

function trackFromInput(
  name: string,
  info?: AudioInfo,
  defaults?: ProjectMetadataDefaults,
): TrackDraft {
  const projectDefaults = normalizeProjectMetadataDefaults(defaults);
  const metadata = metadataFromAudio(
    info,
    {
      ...defaultMetadata,
      ...projectDefaults,
      title: titleFromSourceKey(name),
    },
    true,
  );
  return {
    id: crypto.randomUUID(),
    sourceKey: name,
    source: "input",
    versionLabel: metadata.version,
    metadata,
    outputBaseName: "",
    scene: normalizeVisualSettings(),
    layers: [],
    audioInfo: info,
    selectedForBatch: true,
    packageStatus: "original",
    thumbnailPreviewMode: "composition",
    textSettings: cloneTextSettings(),
  };
}

type ProjectMetadataDefaults = Partial<Omit<TrackMetadata, "tags" | "year">> & {
  tags?: string | string[];
  year?: string | number;
};

function normalizeProjectMetadataDefaults(
  defaults?: ProjectMetadataDefaults,
): Partial<TrackMetadata> {
  if (!defaults) return {};
  return {
    ...defaults,
    tags: Array.isArray(defaults.tags)
      ? defaults.tags.join(", ")
      : (defaults.tags ?? ""),
    year: defaults.year == null ? "" : String(defaults.year),
  };
}

function trackFromFile(
  file: File,
  info?: AudioInfo,
  sourceKey = file.name,
): TrackDraft {
  const metadata = metadataFromAudio(
    info,
    {
      ...defaultMetadata,
      title: file.name.replace(/\.[^.]+$/, ""),
    },
    true,
  );
  return {
    id: crypto.randomUUID(),
    sourceKey,
    sourceFile: file,
    sourceUrl: URL.createObjectURL(file),
    source: "folder",
    versionLabel: metadata.version,
    metadata,
    outputBaseName: "",
    scene: normalizeVisualSettings(),
    layers: [],
    audioInfo: info,
    selectedForBatch: true,
    packageStatus: "original",
    thumbnailPreviewMode: "composition",
    textSettings: cloneTextSettings(),
  };
}

function restoreTrack(
  base: TrackDraft,
  saved: ProjectSnapshot["tracks"][number],
): TrackDraft {
  const sourceFile = base.sourceFile ?? saved.sourceFile;
  const coverOverride = restoreArtworkSuggestion(
    saved.coverOverride,
    base.artworkOptions,
  );
  const savedLyrics = saved.metadata?.lyrics?.trim();
  return {
    ...base,
    ...saved,
    metadata: {
      ...base.metadata,
      ...saved.metadata,
      lyrics: savedLyrics ? saved.metadata.lyrics : base.metadata.lyrics,
    },
    // The live base track (resolved now from the input project or an uploaded
    // file) owns the audio identity. A snapshot can carry a stale source
    // ("folder") and a dead blob sourceUrl from a past session; letting those
    // win leaves restored input projects silent (audioSrc "") until the folder
    // is re-confirmed, and also breaks export, which keys off source "input" +
    // sourceKey. So the audio plumbing always comes from base, never saved.
    source: base.source,
    sourceKey: base.sourceKey,
    audioInfo: base.audioInfo ?? saved.audioInfo,
    sourceFile,
    sourceUrl: sourceFile ? URL.createObjectURL(sourceFile) : base.sourceUrl,
    coverOverride,
    lyricsOptions: base.lyricsOptions,
    lyricsSourcePath: savedLyrics
      ? saved.lyricsSourcePath || base.lyricsSourcePath
      : base.lyricsSourcePath,
    scene: normalizeVisualSettings(saved.scene),
    thumbnailPreviewMode: saved.thumbnailPreviewMode ?? "composition",
    textSettings: cloneTextSettings(saved.textSettings),
    layers: saved.layers.flatMap((layer) =>
      layer.file
        ? [
            {
              ...layer,
              file: layer.file,
              blur: layer.blur ?? 0,
              maskOpacity: layer.maskOpacity ?? 0,
              src: URL.createObjectURL(layer.file),
            },
          ]
        : [],
    ),
  };
}

function restoreArtworkSuggestion(
  value: ProjectSnapshot["tracks"][number]["coverOverride"],
  options: ArtworkSuggestion[] = [],
): ArtworkSuggestion | null | undefined {
  if (!value) return value ?? null;
  const matched = options.find(
    (option) => option.relativePath === value.relativePath,
  );
  if (matched) return { ...matched, source: value.source };
  if (!value.file) return null;
  const file = value.file;
  return {
    ...value,
    file,
    src: URL.createObjectURL(file),
  };
}

function metadataFromAudio(
  info: AudioInfo | undefined,
  fallback: TrackMetadata,
  includeSuggestions = false,
): TrackMetadata {
  const suggestions = includeSuggestions ? info?.suggestions : undefined;
  return {
    ...fallback,
    title: info?.title || suggestions?.title || fallback.title,
    // Many files tag only the album artist; treat it as the track artist when the
    // track-level artist is empty so the field (and the video text) get filled.
    artist:
      info?.artist ||
      info?.albumArtist ||
      suggestions?.artist ||
      suggestions?.albumArtist ||
      fallback.artist,
    album: info?.album || suggestions?.album || fallback.album,
    albumArtist:
      info?.albumArtist || suggestions?.albumArtist || fallback.albumArtist,
    genre: info?.genre || suggestions?.genre || fallback.genre,
    description: info?.description || info?.comment || fallback.description,
    comment: info?.comment || suggestions?.comment || fallback.comment,
    composer: info?.composer || suggestions?.composer || fallback.composer,
    year: String(info?.year ?? suggestions?.year ?? fallback.year),
    recordingDate: String(info?.date ?? fallback.recordingDate),
    lyrics: info?.lyrics || fallback.lyrics,
    trackNumber:
      Number(info?.track) || suggestions?.trackNumber || fallback.trackNumber,
    trackTotal:
      Number(info?.trackTotal) ||
      suggestions?.trackTotal ||
      fallback.trackTotal,
    diskNumber:
      Number(info?.disk) || suggestions?.diskNumber || fallback.diskNumber,
    diskTotal:
      Number(info?.diskTotal) || suggestions?.diskTotal || fallback.diskTotal,
    useEmbeddedCover: Boolean(info?.hasEmbeddedCover),
  };
}

function titleFromSourceKey(sourceKey: string) {
  const fileName = sourceKey.split(/[\\/]+/).pop() ?? sourceKey;
  return fileName.replace(/\.[^.]+$/, "") || defaultMetadata.title;
}

function trackBatchGroupKey(track: TrackDraft) {
  const metadata = track.metadata;
  return [
    metadata.artist || "Artista desconhecido",
    metadata.album || "Álbum sem nome",
    Math.max(1, Number(metadata.diskNumber) || 1),
  ]
    .map(normalizeBatchGroupKey)
    .join("\u0000");
}

function normalizeBatchGroupKey(value: string | number) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function finalizeImportedTracks(tracks: TrackDraft[]) {
  const groups = new Map<string, TrackDraft[]>();
  for (const track of tracks) {
    const key = [
      track.metadata.artist,
      track.metadata.album,
      track.metadata.albumArtist,
    ].join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), track]);
  }
  const finalized: TrackDraft[] = [];
  for (const group of groups.values()) {
    const byFileName = [...group].sort((first, second) =>
      first.sourceKey.localeCompare(second.sourceKey, "pt-BR", {
        numeric: true,
        sensitivity: "base",
      }),
    );
    const explicitTrackNumbers = byFileName
      .map((track) => Number(track.metadata.trackNumber || 0))
      .filter((value) => value > 0);
    const uniqueExplicitTrackNumbers = new Set(explicitTrackNumbers);
    const hasCompleteExplicitTrackNumbers =
      explicitTrackNumbers.length === byFileName.length &&
      uniqueExplicitTrackNumbers.size === byFileName.length;
    const taggedTrackTotal = Math.max(
      0,
      ...byFileName.map((track) => Number(track.metadata.trackTotal || 0)),
    );
    const ordered = hasCompleteExplicitTrackNumbers
      ? [...byFileName].sort((first, second) => {
          const firstDisk = Number(first.metadata.diskNumber || 1);
          const secondDisk = Number(second.metadata.diskNumber || 1);
          if (firstDisk !== secondDisk) return firstDisk - secondDisk;
          const firstTrack = Number(first.metadata.trackNumber || 0);
          const secondTrack = Number(second.metadata.trackNumber || 0);
          if (firstTrack !== secondTrack) return firstTrack - secondTrack;
          return first.sourceKey.localeCompare(second.sourceKey, "pt-BR", {
            numeric: true,
            sensitivity: "base",
          });
        })
      : byFileName;
    const diskNumbers = new Set(
      ordered
        .map((track) => Number(track.metadata.diskNumber || 1))
        .filter((value) => value > 0),
    );
    const trackTotal = Math.max(taggedTrackTotal, ordered.length);
    for (const [index, track] of ordered.entries()) {
      const explicit = Number(track.metadata.trackNumber || 0);
      finalized.push({
        ...track,
        metadata: {
          ...track.metadata,
          trackNumber:
            explicit > 0 && hasCompleteExplicitTrackNumbers
              ? explicit
              : index + 1,
          trackTotal,
          diskNumber: track.metadata.diskNumber || 1,
          diskTotal:
            Math.max(
              0,
              ...ordered.map((item) => item.metadata.diskTotal || 0),
            ) || Math.max(1, diskNumbers.size),
        },
      });
    }
  }
  return finalized;
}

type DirectoryAssetEntry = { file: File; relativePath: string };

async function collectDirectoryAssets(
  handle: FileSystemDirectoryHandle,
  prefix = "",
): Promise<{
  audioEntries: DirectoryAssetEntry[];
  artworkEntries: DirectoryAssetEntry[];
  lyricEntries: DirectoryAssetEntry[];
}> {
  const audioEntries: DirectoryAssetEntry[] = [];
  const artworkEntries: DirectoryAssetEntry[] = [];
  const lyricEntries: DirectoryAssetEntry[] = [];
  for await (const [name, entry] of handle.entries()) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (entry.kind === "file") {
      if (isPrivateAssetPath(relativePath)) continue;
      if (isLyricsTextPath(relativePath)) {
        lyricEntries.push({ file: await entry.getFile(), relativePath });
      } else if (isArtworkName(name)) {
        artworkEntries.push({ file: await entry.getFile(), relativePath });
      } else if (isAudioName(name) && !isPrivateAudioPath(relativePath)) {
        audioEntries.push({ file: await entry.getFile(), relativePath });
      }
      continue;
    }
    if (isPrivateAssetPath(relativePath)) continue;
    const nested = await collectDirectoryAssets(entry, relativePath);
    audioEntries.push(...nested.audioEntries);
    artworkEntries.push(...nested.artworkEntries);
    lyricEntries.push(...nested.lyricEntries);
  }
  return {
    audioEntries: audioEntries.sort(compareDirectoryEntries),
    artworkEntries: artworkEntries.sort(compareDirectoryEntries),
    lyricEntries: lyricEntries.sort(compareDirectoryEntries),
  };
}

async function discoverInputProjects(
  handle: FileSystemDirectoryHandle,
): Promise<InputProjectOption[]> {
  const projects: InputProjectOption[] = [];
  const directTrackCount = await countDirectAudioFiles(handle);
  if (directTrackCount > 0) {
    projects.push({
      id: ".",
      name: handle.name,
      path: ".",
      handle,
      source: "browser",
      trackCount: directTrackCount,
    });
  }
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== "directory") continue;
    if (isPrivateAssetPath(name)) continue;
    const trackCount = await countAudioFiles(entry, name);
    if (trackCount === 0) continue;
    projects.push({
      id: name,
      name,
      path: name,
      handle: entry,
      source: "browser",
      trackCount,
    });
  }
  return projects.sort((first, second) =>
    first.name.localeCompare(second.name, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

async function countDirectAudioFiles(handle: FileSystemDirectoryHandle) {
  let count = 0;
  for await (const [name, entry] of handle.entries()) {
    if (
      entry.kind === "file" &&
      isAudioName(name) &&
      !isPrivateAudioPath(name)
    ) {
      count += 1;
    }
  }
  return count;
}

async function countAudioFiles(
  handle: FileSystemDirectoryHandle,
  prefix = "",
): Promise<number> {
  let count = 0;
  for await (const [name, entry] of handle.entries()) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (isPrivateAssetPath(relativePath)) continue;
    if (entry.kind === "file") {
      if (isAudioName(name) && !isPrivateAudioPath(relativePath)) count += 1;
      continue;
    }
    count += await countAudioFiles(entry, relativePath);
  }
  return count;
}

async function loadProjectSnapshot(
  handle: FileSystemDirectoryHandle,
  saveId = DEFAULT_PROJECT_SAVE_ID,
): Promise<ProjectSnapshot | undefined> {
  try {
    const directory = await handle.getDirectoryHandle(PROJECT_STATE_DIRECTORY);
    const fileHandle =
      saveId === DEFAULT_PROJECT_SAVE_ID
        ? await directory.getFileHandle(PROJECT_STATE_FILE)
        : await (
            await directory.getDirectoryHandle(PROJECT_SAVES_DIRECTORY)
          ).getFileHandle(projectSaveFileName(saveId));
    const file = await fileHandle.getFile();
    const snapshot = JSON.parse(await file.text()) as ProjectSnapshot;
    return hydrateProjectSnapshotAssets(handle, snapshot);
  } catch {
    return undefined;
  }
}

async function writeProjectSnapshot(
  handle: FileSystemDirectoryHandle,
  snapshot: ProjectSnapshot,
  save: ProjectSaveOption = defaultProjectSave,
) {
  const directory = await handle.getDirectoryHandle(PROJECT_STATE_DIRECTORY, {
    create: true,
  });
  const portableSnapshot = await createPortableProjectSnapshot(
    directory,
    projectSnapshotWithSave(snapshot, save),
  );
  const file =
    save.id === DEFAULT_PROJECT_SAVE_ID
      ? await directory.getFileHandle(PROJECT_STATE_FILE, { create: true })
      : await (
          await directory.getDirectoryHandle(PROJECT_SAVES_DIRECTORY, {
            create: true,
          })
        ).getFileHandle(projectSaveFileName(save.id), { create: true });
  const writable = await file.createWritable();
  await writable.write(JSON.stringify(portableSnapshot, null, 2));
  await writable.close();
}

async function removeProjectSnapshot(
  handle: FileSystemDirectoryHandle,
  saveId?: string,
) {
  let directory: FileSystemDirectoryHandle;
  try {
    directory = await handle.getDirectoryHandle(PROJECT_STATE_DIRECTORY);
  } catch {
    return;
  }
  if (saveId) {
    try {
      if (saveId === DEFAULT_PROJECT_SAVE_ID) {
        await directory.removeEntry(PROJECT_STATE_FILE);
      } else {
        const savesDirectory = await directory.getDirectoryHandle(
          PROJECT_SAVES_DIRECTORY,
        );
        await savesDirectory.removeEntry(projectSaveFileName(saveId));
      }
    } catch {
      // Save does not exist.
    }
    return;
  }
  try {
    await directory.removeEntry(PROJECT_STATE_FILE);
  } catch {
    // Project has no saved state.
  }
  try {
    await directory.removeEntry(PROJECT_ASSETS_DIRECTORY, { recursive: true });
  } catch {
    // Project has no persisted manual assets.
  }
}

// Internal project persistence — saves to input/<projectId>/.sonara/ via the
// server API so assets survive across browser sessions without a DirectoryHandle.

async function saveInternalProjectSnapshot(
  projectId: string,
  snapshot: ProjectSnapshot,
  save: ProjectSaveOption = defaultProjectSave,
): Promise<void> {
  const portable = await createInternalPortableSnapshot(
    projectId,
    projectSnapshotWithSave(snapshot, save),
  );
  await fetch(
    `/api/internal-snapshot?${internalSnapshotQuery(projectId, save)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(portable),
    },
  );
}

async function loadInternalProjectSnapshot(
  projectId: string,
  saveId = DEFAULT_PROJECT_SAVE_ID,
): Promise<ProjectSnapshot | undefined> {
  try {
    const res = await fetch(
      `/api/internal-snapshot?${internalSnapshotQuery(projectId, {
        id: saveId,
        name: projectSaveLabelFromId(saveId),
      })}`,
    );
    if (!res.ok) return undefined;
    const snapshot = (await res.json()) as ProjectSnapshot;
    return hydrateInternalProjectSnapshotAssets(projectId, snapshot);
  } catch {
    return undefined;
  }
}

async function deleteInternalProjectSnapshot(
  projectId: string,
  saveId?: string,
): Promise<void> {
  try {
    const query = saveId
      ? internalSnapshotQuery(projectId, {
          id: saveId,
          name: projectSaveLabelFromId(saveId),
        })
      : `project=${encodeURIComponent(projectId)}`;
    await fetch(`/api/internal-snapshot?${query}`, { method: "DELETE" });
  } catch {
    // Best-effort.
  }
}

async function listProjectSaves(
  handle: FileSystemDirectoryHandle,
): Promise<ProjectSaveOption[]> {
  const saves = new Map<string, ProjectSaveOption>([
    [defaultProjectSave.id, defaultProjectSave],
  ]);
  try {
    const directory = await handle.getDirectoryHandle(PROJECT_STATE_DIRECTORY);
    const savesDirectory = await directory.getDirectoryHandle(
      PROJECT_SAVES_DIRECTORY,
    );
    for await (const [name, entry] of savesDirectory.entries()) {
      if (entry.kind !== "file" || !name.toLowerCase().endsWith(".json")) {
        continue;
      }
      const id = name.replace(/\.json$/i, "");
      let option: ProjectSaveOption = {
        id,
        name: projectSaveLabelFromId(id),
      };
      try {
        const file = await entry.getFile();
        const snapshot = JSON.parse(await file.text()) as ProjectSnapshot;
        option = projectSaveOptionFromSnapshot(id, snapshot);
      } catch {
        // Keep a recoverable save option even if the file is temporarily bad.
      }
      saves.set(option.id, option);
    }
  } catch {
    // Project has no named saves yet.
  }
  return sortProjectSaves([...saves.values()]);
}

async function listInternalProjectSaves(
  projectId: string,
): Promise<ProjectSaveOption[]> {
  try {
    const res = await fetch(
      `/api/internal-snapshot?project=${encodeURIComponent(projectId)}&list=1`,
    );
    if (!res.ok) return [defaultProjectSave];
    const payload = (await res.json()) as { saves?: ProjectSaveOption[] };
    return sortProjectSaves(payload.saves ?? [defaultProjectSave]);
  } catch {
    return [defaultProjectSave];
  }
}

function projectSnapshotWithSave(
  snapshot: ProjectSnapshot,
  save: ProjectSaveOption,
): ProjectSnapshot {
  return {
    ...snapshot,
    saveId: save.id,
    saveName: save.name,
  };
}

function projectSaveOptionFromSnapshot(
  id: string,
  snapshot?: ProjectSnapshot,
): ProjectSaveOption {
  if (id === DEFAULT_PROJECT_SAVE_ID) return defaultProjectSave;
  return {
    id,
    name:
      normalizeProjectSaveName(snapshot?.saveName ?? "") ||
      projectSaveLabelFromId(id),
  };
}

function ensureProjectSaveOption(
  saves: ProjectSaveOption[],
  save: ProjectSaveOption | string,
) {
  const option =
    typeof save === "string"
      ? (saves.find((item) => item.id === save) ?? {
          id: save,
          name: projectSaveLabelFromId(save),
        })
      : save;
  const next = new Map(saves.map((item) => [item.id, item]));
  next.set(option.id, option);
  return sortProjectSaves([...next.values()]);
}

function sortProjectSaves(saves: ProjectSaveOption[]) {
  return saves.sort((first, second) => {
    if (first.id === DEFAULT_PROJECT_SAVE_ID) return -1;
    if (second.id === DEFAULT_PROJECT_SAVE_ID) return 1;
    return first.name.localeCompare(second.name, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function normalizeProjectSaveName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

function projectSaveIdFromName(value: string) {
  const normalized = normalizeProjectSaveName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || `save-${Date.now()}`;
}

function projectSaveLabelFromId(id: string) {
  if (id === DEFAULT_PROJECT_SAVE_ID) return defaultProjectSave.name;
  return id
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function projectSaveFileName(saveId: string) {
  return `${projectSaveIdFromName(saveId)}.json`;
}

function internalSnapshotQuery(projectId: string, save: ProjectSaveOption) {
  const params = new URLSearchParams({ project: projectId });
  if (save.id !== DEFAULT_PROJECT_SAVE_ID) {
    params.set("save", save.id);
    params.set("saveName", save.name);
  }
  return params.toString();
}

async function createInternalPortableSnapshot(
  projectId: string,
  snapshot: ProjectSnapshot,
): Promise<ProjectSnapshot> {
  const assetsById = new Map<string, ProjectAssetManifestEntry>();
  const registerAsset = async (file: File | undefined) => {
    if (!file) return undefined;
    const asset = await prepareProjectAsset(file);
    if (!asset) return undefined;
    if (!assetsById.has(asset.entry.id)) {
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([asset.buffer], { type: file.type }),
        file.name,
      );
      await fetch(
        `/api/internal-asset?project=${encodeURIComponent(projectId)}&fileName=${encodeURIComponent(asset.entry.fileName)}`,
        { method: "POST", body: formData },
      );
      assetsById.set(asset.entry.id, asset.entry);
    }
    return asset.entry.id;
  };
  const coverAssetId = await registerAsset(snapshot.coverFile);
  const tracks = [];
  for (const track of snapshot.tracks) {
    const coverOverrideAssetId = await registerAsset(track.coverOverride?.file);
    const layers = [];
    for (const layer of track.layers) {
      const { file, ...serializableLayer } = layer;
      const assetId = await registerAsset(file);
      if (!assetId) continue;
      layers.push({
        ...serializableLayer,
        assetId,
      });
    }
    tracks.push({
      ...track,
      sourceFile: undefined,
      coverOverrideAssetId,
      layers,
      coverOverride: serializeArtworkSuggestion(track.coverOverride),
    });
  }
  return {
    ...snapshot,
    coverFile: undefined,
    coverAssetId,
    assetManifest: { schemaVersion: 1, files: [...assetsById.values()] },
    tracks,
  };
}

async function hydrateInternalProjectSnapshotAssets(
  projectId: string,
  snapshot: ProjectSnapshot,
): Promise<ProjectSnapshot> {
  const entries = snapshot.assetManifest?.files ?? [];
  if (!entries.length) return snapshot;
  const filesById = new Map<string, File>();
  await Promise.all(
    entries.map(async (entry) => {
      try {
        const res = await fetch(
          `/api/internal-asset?project=${encodeURIComponent(projectId)}&file=${encodeURIComponent(entry.fileName)}`,
        );
        if (!res.ok) return;
        const blob = await res.blob();
        filesById.set(
          entry.id,
          new File([blob], entry.originalName, {
            type: entry.type,
            lastModified: entry.lastModified,
          }),
        );
      } catch {
        // Asset unavailable — layer will appear empty but not crash.
      }
    }),
  );
  const fileById = (id: string | undefined) =>
    id ? filesById.get(id) : undefined;
  return {
    ...snapshot,
    coverFile: snapshot.coverFile ?? fileById(snapshot.coverAssetId),
    tracks: snapshot.tracks.map((track) => {
      const coverOverrideFile = fileById(track.coverOverrideAssetId);
      return {
        ...track,
        coverOverride:
          track.coverOverride && coverOverrideFile
            ? { ...track.coverOverride, file: coverOverrideFile }
            : track.coverOverride,
        layers: track.layers.map((layer) => ({
          ...layer,
          file: layer.file ?? fileById(layer.assetId),
        })),
      };
    }),
  };
}

async function createPortableProjectSnapshot(
  directory: FileSystemDirectoryHandle,
  snapshot: ProjectSnapshot,
): Promise<ProjectSnapshot> {
  const assetsDirectory = await directory.getDirectoryHandle(
    PROJECT_ASSETS_DIRECTORY,
    { create: true },
  );
  const assetsById = new Map<string, ProjectAssetManifestEntry>();
  const registerAsset = async (file: File | undefined) => {
    if (!file) return undefined;
    const asset = await prepareProjectAsset(file);
    if (!asset) return undefined;
    if (!assetsById.has(asset.entry.id)) {
      await writeProjectAssetFile(
        assetsDirectory,
        asset.entry.fileName,
        asset.buffer,
      );
      assetsById.set(asset.entry.id, asset.entry);
    }
    return asset.entry.id;
  };
  const coverAssetId = await registerAsset(snapshot.coverFile);
  const tracks = [];
  for (const track of snapshot.tracks) {
    const coverOverrideAssetId = await registerAsset(track.coverOverride?.file);
    const layers = [];
    for (const layer of track.layers) {
      const { file, ...serializableLayer } = layer;
      const assetId = await registerAsset(file);
      if (!assetId) continue;
      layers.push({
        ...serializableLayer,
        assetId,
      });
    }
    tracks.push({
      ...track,
      sourceFile: undefined,
      coverOverrideAssetId,
      layers,
      coverOverride: serializeArtworkSuggestion(track.coverOverride),
    });
  }
  return {
    ...snapshot,
    coverFile: undefined,
    coverAssetId,
    assetManifest: { schemaVersion: 1, files: [...assetsById.values()] },
    tracks,
  };
}

async function hydrateProjectSnapshotAssets(
  handle: FileSystemDirectoryHandle,
  snapshot: ProjectSnapshot,
): Promise<ProjectSnapshot> {
  const entries = snapshot.assetManifest?.files ?? [];
  if (!entries.length) return snapshot;
  let assetsDirectory: FileSystemDirectoryHandle;
  try {
    const directory = await handle.getDirectoryHandle(PROJECT_STATE_DIRECTORY);
    assetsDirectory = await directory.getDirectoryHandle(
      PROJECT_ASSETS_DIRECTORY,
    );
  } catch {
    return snapshot;
  }
  const filesById = new Map<string, File>();
  await Promise.all(
    entries.map(async (entry) => {
      const file = await readProjectAssetFile(assetsDirectory, entry);
      if (file) filesById.set(entry.id, file);
    }),
  );
  const fileById = (id: string | undefined) =>
    id ? filesById.get(id) : undefined;
  return {
    ...snapshot,
    coverFile: snapshot.coverFile ?? fileById(snapshot.coverAssetId),
    tracks: snapshot.tracks.map((track) => {
      const coverOverrideFile = fileById(track.coverOverrideAssetId);
      return {
        ...track,
        coverOverride:
          track.coverOverride && coverOverrideFile
            ? { ...track.coverOverride, file: coverOverrideFile }
            : track.coverOverride,
        layers: track.layers.map((layer) => ({
          ...layer,
          file: layer.file ?? fileById(layer.assetId),
        })),
      };
    }),
  };
}

async function prepareProjectAsset(
  file: File,
): Promise<
  { entry: ProjectAssetManifestEntry; buffer: ArrayBuffer } | undefined
> {
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return undefined;
  }
  const hash = await hashBuffer(buffer);
  const fileName = projectAssetFileName(hash, file.name);
  return {
    entry: {
      id: hash,
      fileName,
      originalName: file.name,
      path: `${PROJECT_ASSETS_DIRECTORY}/${fileName}`,
      hash,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
    },
    buffer,
  };
}

async function hashBuffer(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function projectAssetFileName(hash: string, fileName: string) {
  const cleanName =
    fileName
      .split(/[\\/]+/)
      .at(-1)
      ?.replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "asset.bin";
  return `${hash.slice(0, 16)}-${cleanName}`;
}

async function writeProjectAssetFile(
  handle: FileSystemDirectoryHandle,
  fileName: string,
  buffer: ArrayBuffer,
) {
  const output = await handle.getFileHandle(fileName, { create: true });
  const writable = await output.createWritable();
  await writable.write(buffer);
  await writable.close();
}

async function readProjectAssetFile(
  handle: FileSystemDirectoryHandle,
  entry: ProjectAssetManifestEntry,
) {
  try {
    const stored = await (await handle.getFileHandle(entry.fileName)).getFile();
    return new File([stored], entry.originalName || stored.name, {
      type: entry.type || stored.type,
      lastModified: entry.lastModified ?? stored.lastModified,
    });
  } catch {
    return null;
  }
}

function serializeArtworkSuggestion(
  value: ProjectSnapshot["tracks"][number]["coverOverride"],
) {
  if (!value) return null;
  return {
    ...value,
    file: undefined,
    src: "",
  };
}

function isPrivateAudioPath(value: string) {
  return (
    isPrivateAssetPath(value) ||
    pathSegments(value).some((segment) => segment === "art")
  );
}

function isPrivateAssetPath(value: string) {
  return pathSegments(value).some((segment) =>
    [
      "tratados",
      "backup-originais",
      "outputs",
      "input",
      ".sonara",
      ".dev",
      "node_modules",
    ].includes(segment),
  );
}

function pathSegments(value: string) {
  const segments = value
    .split(/[\\/]+/)
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  return segments;
}

function compareDirectoryEntries(
  first: DirectoryAssetEntry,
  second: DirectoryAssetEntry,
) {
  return first.relativePath.localeCompare(second.relativePath, "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

function attachSuggestedArtwork(
  tracks: TrackDraft[],
  artworkEntries: DirectoryAssetEntry[],
) {
  const audioPaths = tracks.map((track) => track.sourceKey);
  const artworkByPath = new Map(
    artworkEntries.map((entry) => [entry.relativePath, entry]),
  );
  const srcByPath = new Map<string, string>();
  return tracks.map((track) => {
    const artworkPaths = artworkEntries.map((entry) => entry.relativePath);
    const relativePath = chooseArtworkForTrack({
      audioPath: track.sourceKey,
      audioPaths,
      artworkPaths,
      trackNumber: track.metadata.trackNumber,
    });
    if (!relativePath) return track;
    const optionPaths = listArtworkOptionsForTrack({
      audioPath: track.sourceKey,
      audioPaths,
      artworkPaths,
      trackNumber: track.metadata.trackNumber,
    });
    const albumCoverPath = chooseAlbumArtworkForTrack({
      audioPath: track.sourceKey,
      artworkPaths,
    });
    const suggestionForPath = (
      candidatePath: string | null,
    ): ArtworkSuggestion | undefined => {
      if (!candidatePath) return undefined;
      const artwork = artworkByPath.get(candidatePath);
      if (!artwork) return undefined;
      let src = srcByPath.get(candidatePath);
      if (!src) {
        src = URL.createObjectURL(artwork.file);
        srcByPath.set(candidatePath, src);
      }
      return {
        file: artwork.file,
        src,
        relativePath: candidatePath,
        source: "folder" as const,
      };
    };
    const artworkOptions = optionPaths
      .map((candidatePath) => suggestionForPath(candidatePath))
      .filter((candidate): candidate is ArtworkSuggestion =>
        Boolean(candidate),
      );
    const suggestedCover = suggestionForPath(relativePath);
    if (!suggestedCover) {
      return track;
    }
    return {
      ...track,
      suggestedCover,
      artworkOptions,
      albumCoverSuggestion: suggestionForPath(albumCoverPath),
      useSuggestedCover: track.useSuggestedCover ?? true,
    };
  });
}

async function attachSuggestedLyrics(
  tracks: TrackDraft[],
  lyricEntries: DirectoryAssetEntry[],
) {
  if (!lyricEntries.length) return tracks;
  const lyricsByPath = new Map(
    lyricEntries.map((entry) => [entry.relativePath, entry]),
  );
  const textByPath = new Map<string, string>();
  const readLyricsText = async (entry: DirectoryAssetEntry) => {
    let text = textByPath.get(entry.relativePath);
    if (text === undefined) {
      text = await entry.file.text();
      textByPath.set(entry.relativePath, text);
    }
    return text;
  };

  return Promise.all(
    tracks.map(async (track) => {
      const matches = listLyricsOptionsForTrack({
        audioPath: track.sourceKey,
        lyricPaths: lyricEntries.map((entry) => entry.relativePath),
        trackTitle: track.metadata.title,
        trackNumber: track.metadata.trackNumber,
      });
      if (!matches.length) return track;
      const suggestions = await Promise.all(
        matches.map(async (match: LyricsPathSuggestion) => {
          const entry = lyricsByPath.get(match.relativePath);
          const text = entry ? await readLyricsText(entry) : "";
          return {
            file: entry?.file,
            relativePath: match.relativePath,
            fileName: match.relativePath.split(/[\\/]+/).at(-1) ?? "letra.txt",
            preview: lyricPreview(text),
            confidence: match.confidence,
            matchedBy: match.matchedBy,
          } satisfies LyricsSuggestion;
        }),
      );
      const high = suggestions.filter(
        (suggestion) => suggestion.confidence === "high",
      );
      if (high.length !== 1 || track.metadata.lyrics.trim()) {
        return { ...track, lyricsOptions: suggestions };
      }
      const entry = lyricsByPath.get(high[0].relativePath);
      if (!entry) return { ...track, lyricsOptions: suggestions };
      return {
        ...track,
        metadata: {
          ...track.metadata,
          lyrics: await readLyricsText(entry),
        },
        lyricsOptions: suggestions.map((suggestion) => ({
          ...suggestion,
          autoApplied: suggestion.relativePath === high[0].relativePath,
        })),
        lyricsSourcePath: high[0].relativePath,
      };
    }),
  );
}

function lyricPreview(value: string) {
  const lines = String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(0, 3).join(" / ").slice(0, 160);
}

async function ensureAlbumArtworkDirectories(
  handle: FileSystemDirectoryHandle,
  rootPrefix: string,
  directoryPaths: string[],
) {
  const permission = await handle.queryPermission?.({ mode: "readwrite" });
  if (permission !== "granted") return;
  const prefix = pathSegments(rootPrefix);
  for (const directoryPath of directoryPaths) {
    const segments = directoryPath.split(/[\\/]+/).filter(Boolean);
    const relativeSegments = segments
      .slice(0, prefix.length)
      .every(
        (segment, index) =>
          segment.toLowerCase() === prefix[index]?.toLowerCase(),
      )
      ? segments.slice(prefix.length)
      : segments;
    let current = handle;
    for (const segment of relativeSegments) {
      current = await current.getDirectoryHandle(segment, { create: true });
    }
  }
}

function audioDraftFromMetadata(metadata: TrackMetadata): AudioTagDraft {
  return {
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    albumArtist: metadata.albumArtist,
    genre: metadata.genre,
    composer: metadata.composer,
    comment: metadata.comment,
    copyright: metadata.copyright,
    year: metadata.year,
    trackNumber: metadata.trackNumber,
    trackTotal: metadata.trackTotal,
    diskNumber: metadata.diskNumber,
    diskTotal: metadata.diskTotal,
    lyrics: metadata.lyrics,
    lyricsLanguage: metadata.lyricsLanguage,
    normalizationEnabled: metadata.normalizationEnabled,
    podcastVoiceProfile: metadata.podcastVoiceProfile,
    podcastTrimSilence: metadata.podcastTrimSilence,
    podcastVoiceBoost: metadata.podcastVoiceBoost,
    podcastPlaybackSpeed: metadata.podcastPlaybackSpeed,
    podcastIntroInsert: metadata.podcastIntroInsert,
    podcastOutroInsert: metadata.podcastOutroInsert,
    podcastAdInsert: metadata.podcastAdInsert,
    cleanPackage: true,
  };
}

function stripLayerFile(layer: MediaLayerV2) {
  const { file: _file, src: _src, name: _name, ...settings } = layer;
  return settings;
}

function selectedTrackFrom(tracks: TrackDraft[], selectedTrackId: string) {
  return tracks.find((track) => track.id === selectedTrackId) ?? null;
}

function projectOptionLabel(project: InputProjectOption, itemLabel = "música") {
  const plural =
    itemLabel === "episódio"
      ? "episódios"
      : `${itemLabel}${itemLabel.endsWith("s") ? "" : "s"}`;
  return `${project.name} (${project.trackCount} ${
    project.trackCount === 1 ? itemLabel : plural
  })`;
}

function isBrowserInputProject(
  project: InputProjectOption,
): project is BrowserInputProjectOption {
  return project.source === "browser" && Boolean(project.handle);
}

// Applies ONLY the atmosphere/colors (scene) to the batch. Layers are
// deliberately left untouched so each video keeps its own — copying layers is a
// separate, explicit action (applyLayersTemplateToTracks) to avoid the silent
// cross-video replication that confused users.
function applyVisualTemplateToTracks(
  tracks: TrackDraft[],
  selectedTrackId: string,
) {
  const source = selectedTrackFrom(tracks, selectedTrackId);
  if (!source) return tracks;
  const scene = normalizeVisualSettings(source.scene);
  return tracks.map((track) =>
    track.selectedForBatch
      ? {
          ...track,
          scene,
        }
      : track,
  );
}

// Copies the selected track's layers onto every batch-selected track, minting a
// fresh id per layer so each video owns an independent copy. This is the only
// path that propagates layers across videos, and it is always user-initiated.
function applyLayersTemplateToTracks(
  tracks: TrackDraft[],
  selectedTrackId: string,
) {
  const source = selectedTrackFrom(tracks, selectedTrackId);
  if (!source) return tracks;
  return tracks.map((track) =>
    track.selectedForBatch && track.id !== source.id
      ? {
          ...track,
          layers: source.layers.map((layer) => ({
            ...layer,
            id: crypto.randomUUID(),
          })),
        }
      : track,
  );
}

function applyMusicTemplateToTracks(
  tracks: TrackDraft[],
  selectedTrackId: string,
) {
  const source = selectedTrackFrom(tracks, selectedTrackId);
  if (!source) return tracks;
  const {
    album,
    albumArtist,
    artist,
    comment,
    composer,
    copyright,
    diskNumber,
    diskTotal,
    genre,
    normalizationEnabled,
    trackTotal,
    year,
  } = source.metadata;
  return tracks.map((track) =>
    track.selectedForBatch
      ? {
          ...track,
          metadata: {
            ...track.metadata,
            album,
            albumArtist,
            artist,
            comment,
            composer,
            copyright,
            diskNumber,
            diskTotal,
            genre,
            normalizationEnabled,
            trackTotal,
            year,
          },
        }
      : track,
  );
}

function applyPublicationTemplateToTracks(
  tracks: TrackDraft[],
  selectedTrackId: string,
) {
  const source = selectedTrackFrom(tracks, selectedTrackId);
  if (!source) return tracks;
  const {
    categoryId,
    containsSyntheticMedia,
    description,
    language,
    madeForKids,
    tags,
    visibility,
  } = source.metadata;
  return tracks.map((track) =>
    track.selectedForBatch
      ? {
          ...track,
          metadata: {
            ...track.metadata,
            categoryId,
            containsSyntheticMedia,
            description,
            language,
            madeForKids,
            tags,
            visibility,
          },
        }
      : track,
  );
}

function coverLayerFromArtwork(
  artwork: { file: File; src: string },
  preset: CoverLayerPreset,
  template?: MediaLayerV2,
  coverFadeOut?: CoverFadeOutSettings,
): MediaLayerV2 {
  const defaults = coverLayerPresets[preset];
  return {
    id:
      template?.id && isCoverLayer(template)
        ? template.id
        : `cover-layer-${crypto.randomUUID()}`,
    name: `Capa - ${coverLayerPresetLabels[preset]}`,
    file: artwork.file,
    src: artwork.src,
    kind: "image",
    visible: template?.visible ?? true,
    opacity: template?.opacity ?? defaults.opacity,
    scale: template?.scale ?? defaults.scale,
    x: template?.x ?? defaults.x,
    y: template?.y ?? defaults.y,
    rotation: template?.rotation ?? defaults.rotation,
    blur: template?.blur ?? defaults.blur,
    maskOpacity: template?.maskOpacity ?? defaults.maskOpacity,
    coverFadeOut: normalizeLayerCoverFadeOut(
      coverFadeOut ?? template?.coverFadeOut,
    ),
    fit: template?.fit ?? defaults.fit,
    blendMode: template?.blendMode ?? defaults.blendMode,
    loop: false,
    order: template?.order ?? 0,
    shadow: {
      ...defaults.shadow,
      ...(template?.shadow ?? {}),
    },
  };
}

function isAudioName(name: string) {
  return /\.(mp3|wav|m4a|flac|aac|ogg)$/i.test(name);
}

function loadPanelWidths() {
  const fallback = {
    left: DEFAULT_LEFT_RAIL_WIDTH,
    right: DEFAULT_RIGHT_RAIL_WIDTH,
  };
  try {
    const raw = window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      left: clampPanelWidth(
        Number(parsed.left) || fallback.left,
        LEFT_RAIL_BOUNDS,
        Number(parsed.right) || fallback.right,
      ),
      right: clampPanelWidth(
        Number(parsed.right) || fallback.right,
        RIGHT_RAIL_BOUNDS,
        Number(parsed.left) || fallback.left,
      ),
    };
  } catch {
    return fallback;
  }
}

function loadCoverSeriesSettings(): CoverSeriesSettings {
  if (typeof window === "undefined") return defaultCoverSeriesSettings;
  try {
    const raw = window.localStorage.getItem(COVER_SERIES_STORAGE_KEY);
    if (!raw) return defaultCoverSeriesSettings;
    return normalizeCoverSeriesClient(JSON.parse(raw));
  } catch {
    return defaultCoverSeriesSettings;
  }
}

function saveCoverSeriesSettings(settings: CoverSeriesSettings) {
  try {
    window.localStorage.setItem(
      COVER_SERIES_STORAGE_KEY,
      JSON.stringify(settings),
    );
  } catch {
    // A reusable visual-series preference is optional local state.
  }
}

function loadFileNamePattern(): FileNamePattern {
  if (typeof window === "undefined")
    return normalizeFileNamePattern(defaultFileNamePattern);
  try {
    const raw = window.localStorage.getItem(FILE_NAME_PATTERN_STORAGE_KEY);
    return normalizeFileNamePattern(
      raw ? JSON.parse(raw) : defaultFileNamePattern,
    );
  } catch {
    return normalizeFileNamePattern(defaultFileNamePattern);
  }
}

function saveFileNamePattern(pattern: FileNamePattern) {
  try {
    window.localStorage.setItem(
      FILE_NAME_PATTERN_STORAGE_KEY,
      JSON.stringify(pattern),
    );
  } catch {
    // The filename pattern is an optional local preference.
  }
}

function normalizeCoverSeriesClient(value: unknown): CoverSeriesSettings {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<CoverSeriesSettings>)
      : {};
  const legacyColor = /^#[0-9a-f]{6}$/i.test(String(candidate.color ?? ""))
    ? String(candidate.color)
    : defaultCoverSeriesSettings.color;
  const metaFontSize = clampNumber(
    Number(candidate.metaFontSize ?? defaultCoverSeriesSettings.metaFontSize),
    18,
    72,
    defaultCoverSeriesSettings.metaFontSize,
  );
  const seriesFallback = {
    ...defaultCoverSeriesSettings.metaStyles.series,
    fontSize: clampNumber(
      Number(candidate.fontSize ?? defaultCoverSeriesSettings.fontSize),
      18,
      180,
      defaultCoverSeriesSettings.metaStyles.series.fontSize,
    ),
    color: legacyColor,
    opacity: clampNumber(
      Number(candidate.opacity ?? defaultCoverSeriesSettings.opacity),
      20,
      100,
      defaultCoverSeriesSettings.metaStyles.series.opacity,
    ),
  };
  return {
    ...defaultCoverSeriesSettings,
    ...candidate,
    enabled: true,
    style: ["roman", "arabic", "custom"].includes(String(candidate.style))
      ? (candidate.style as CoverSeriesSettings["style"])
      : defaultCoverSeriesSettings.style,
    color: legacyColor,
    metaOrder: coverSeriesMetaOrder(
      String(candidate.metaOrder ?? defaultCoverSeriesSettings.metaOrder),
    ).join(", "),
    embedAlbumCover: candidate.embedAlbumCover === true,
    metaFontSize,
    metaGap: clampNumber(
      Number(candidate.metaGap ?? defaultCoverSeriesSettings.metaGap),
      0,
      48,
      defaultCoverSeriesSettings.metaGap,
    ),
    metaStyles: {
      series: normalizeCoverSeriesMetaStyleClient(
        candidate.metaStyles?.series,
        seriesFallback,
        180,
      ),
      title: normalizeCoverSeriesMetaStyleClient(candidate.metaStyles?.title, {
        ...defaultCoverSeriesSettings.metaStyles.title,
        fontSize: Math.max(38, metaFontSize),
      }),
      album: normalizeCoverSeriesMetaStyleClient(candidate.metaStyles?.album, {
        ...defaultCoverSeriesSettings.metaStyles.album,
        fontSize: metaFontSize,
      }),
      artist: normalizeCoverSeriesMetaStyleClient(
        candidate.metaStyles?.artist,
        {
          ...defaultCoverSeriesSettings.metaStyles.artist,
          fontSize: Math.max(18, metaFontSize - 2),
        },
      ),
      year: normalizeCoverSeriesMetaStyleClient(candidate.metaStyles?.year, {
        ...defaultCoverSeriesSettings.metaStyles.year,
        fontSize: Math.max(18, metaFontSize - 6),
      }),
    },
  };
}

function normalizeCoverSeriesMetaStyleClient(
  value: Partial<CoverSeriesMetaStyle> | undefined,
  fallback: CoverSeriesMetaStyle,
  maxFontSize = 72,
): CoverSeriesMetaStyle {
  return {
    fontSize: clampNumber(
      Number(value?.fontSize ?? fallback.fontSize),
      18,
      maxFontSize,
      fallback.fontSize,
    ),
    fontWeight: clampNumber(
      Number(value?.fontWeight ?? fallback.fontWeight),
      300,
      900,
      fallback.fontWeight,
    ),
    fontStyle: ["normal", "italic"].includes(String(value?.fontStyle))
      ? (value?.fontStyle as CoverSeriesMetaStyle["fontStyle"])
      : fallback.fontStyle,
    align: ["left", "center", "right"].includes(String(value?.align))
      ? (value?.align as CoverSeriesMetaStyle["align"])
      : fallback.align,
    color: /^#[0-9a-f]{6}$/i.test(String(value?.color ?? ""))
      ? String(value?.color)
      : fallback.color,
    opacity: clampNumber(
      Number(value?.opacity ?? fallback.opacity),
      20,
      100,
      fallback.opacity,
    ),
    offsetX: clampNumber(
      Number(value?.offsetX ?? fallback.offsetX),
      -320,
      320,
      fallback.offsetX,
    ),
    offsetY: clampNumber(
      Number(value?.offsetY ?? fallback.offsetY),
      -320,
      320,
      fallback.offsetY,
    ),
  };
}

function savePanelWidths(widths: { left: number; right: number }) {
  try {
    window.localStorage.setItem(
      PANEL_WIDTH_STORAGE_KEY,
      JSON.stringify(widths),
    );
  } catch {
    // Local layout preference can be ignored when storage is unavailable.
  }
}

function loadPodcastEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PODCAST_ENABLED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function savePodcastEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PODCAST_ENABLED_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    // Podcast is an opt-in UI preference; storage failures should not block use.
  }
}

function clampPanelWidth(
  value: number,
  bounds: { min: number; max: number },
  otherWidth: number,
) {
  const viewportWidth =
    typeof window === "undefined" ? 1440 : window.innerWidth;
  const viewportLimitedMax = Math.max(
    bounds.min,
    viewportWidth - otherWidth - PANEL_MIN_PREVIEW_WIDTH,
  );
  const max = Math.min(bounds.max, viewportLimitedMax);
  return Math.round(Math.min(Math.max(value, bounds.min), max));
}

function formatDuration(seconds?: number | null) {
  if (!Number.isFinite(seconds)) return "--:--";
  const safe = Number(seconds);
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

function stepLabel(step: ActiveStep) {
  return {
    music: "Música",
    visual: "Visual",
    text: "Texto",
    export: "Exportar",
  }[step];
}

function visualStageLabel(
  visualStageView: VisualStageView,
  activeStep: ActiveStep,
) {
  if (visualStageView === "promotion") return "Divulgação";
  if (visualStageView === "review") return "Visualizar";
  if (visualStageView === "publication-export") return "Exportar Divulgação";
  return stepLabel(activeStep);
}

function normalizeSnapshotNavigation(snapshot: ProjectSnapshot): {
  workspaceMode: WorkspaceMode;
  audioStageView: AudioStageView;
  visualStageView: VisualStageView;
  activeStep: ActiveStep;
} {
  const legacyAudioStageView = snapshot.audioStageView;
  const legacyVisualStageView = snapshot.visualStageView;
  let workspaceMode: WorkspaceMode =
    snapshot.workspaceMode === "audio" ? "audio" : "visual";
  let audioStageView: AudioStageView =
    legacyAudioStageView === "artwork" ||
    (legacyAudioStageView === "podcast" && snapshot.podcastEnabled === true) ||
    legacyAudioStageView === "catalog" ||
    legacyAudioStageView === "audio-export"
      ? legacyAudioStageView
      : "edit";
  let visualStageView: VisualStageView =
    legacyVisualStageView === "review" || legacyVisualStageView === "videos"
      ? "review"
      : legacyVisualStageView === "promotion"
        ? "promotion"
        : legacyVisualStageView === "publication-export" ||
            legacyVisualStageView === "queue"
          ? "publication-export"
          : "editor";
  let activeStep: ActiveStep =
    snapshot.activeStep === "text" ||
    snapshot.activeStep === "visual" ||
    snapshot.activeStep === "export"
      ? snapshot.activeStep
      : "visual";

  if (legacyAudioStageView === "videos") {
    workspaceMode = "visual";
    audioStageView = "edit";
    visualStageView = "review";
    activeStep = "visual";
  }
  if (
    visualStageView === "publication-export" ||
    visualStageView === "promotion"
  ) {
    activeStep = "export";
  }
  return { workspaceMode, audioStageView, visualStageView, activeStep };
}

function formatUsage(usage?: { files: number; bytes: number }) {
  if (!usage) return "Calculando uso local...";
  return `${formatFileCount(usage.files)} · ${formatBytes(usage.bytes)}`;
}

function formatFileCount(files: number) {
  return `${files} ${files === 1 ? "arquivo" : "arquivos"}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

async function copyUrlToDirectory(
  handle: FileSystemDirectoryHandle,
  url: string,
  fileNameOverride?: string,
) {
  const response = await fetchOptional(url);
  if (!response) {
    throw new Error(`Arquivo exportado não encontrado: ${url}`);
  }
  if (!response.body) {
    throw new Error(`Arquivo exportado sem conteúdo: ${url}`);
  }
  const fileName =
    fileNameOverride ??
    decodeURIComponent(url.split("/").pop() ?? "export.bin");
  const file = await handle.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  await response.body.pipeTo(writable);
}

async function preparePublicationOutputProject(
  rootHandle: FileSystemDirectoryHandle,
  projectName: string,
  options: { backupStamp: string; conflictMode: VideoOutputConflictMode },
): Promise<PreparedPublicationOutputProject> {
  const project = await prepareVideoOutputProject(rootHandle, projectName, {
    backupStamp: options.backupStamp,
    conflictMode: options.conflictMode,
  });
  const publicacao = await project.assets.getDirectoryHandle("publicacao", {
    create: true,
  });
  const imagens = await publicacao.getDirectoryHandle("imagens", {
    create: true,
  });
  const clips = await publicacao.getDirectoryHandle("clips", {
    create: true,
  });
  const dados = await publicacao.getDirectoryHandle("dados", {
    create: true,
  });
  const encartes = await publicacao.getDirectoryHandle("encartes", {
    create: true,
  });
  return { ...project, publicacao, imagens, clips, dados, encartes };
}

function publicationAssetDirectoryForUrl(
  target: PreparedPublicationOutputProject,
  url: string,
) {
  const fileName = decodeURIComponent(url.split("/").pop() ?? "").toLowerCase();
  if (fileName.endsWith(".mp4")) return target.clips;
  if (fileName.endsWith(".html")) return target.encartes;
  if (fileName.endsWith(".json") || fileName.endsWith(".md"))
    return target.dados;
  return target.imagens;
}

async function getWorkspaceFile(
  handle: FileSystemDirectoryHandle,
  sourceKey: string,
) {
  const { directory, fileName } = await resolveWorkspaceFileTarget(
    handle,
    sourceKey,
    false,
  );
  const file = await directory.getFileHandle(fileName);
  return file.getFile();
}

async function writeBlobToWorkspacePath(
  handle: FileSystemDirectoryHandle,
  sourceKey: string,
  blob: Blob,
) {
  const { directory, fileName } = await resolveWorkspaceFileTarget(
    handle,
    sourceKey,
    true,
  );
  const file = await directory.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  await blob.stream().pipeTo(writable);
}

async function resolveWorkspaceFileTarget(
  handle: FileSystemDirectoryHandle,
  sourceKey: string,
  createDirectories: boolean,
) {
  const segments = workspaceRelativeSegments(sourceKey, handle.name);
  const fileName = segments.pop() ?? sourceKey;
  let directory = handle;
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, {
      create: createDirectories,
    });
  }
  return { directory, fileName };
}

function workspaceRelativeSegments(sourceKey: string, rootName: string) {
  const segments = sourceKey.split(/[\\/]+/).filter(Boolean);
  if (
    segments[0] &&
    segments[0].localeCompare(rootName, "pt-BR", { sensitivity: "base" }) === 0
  ) {
    return segments.slice(1);
  }
  return segments;
}

function albumFolderArtworkSourceKey(sourceKey: string) {
  const segments = sourceKey.split(/[\\/]+/).filter(Boolean);
  segments.pop();
  if (
    segments.length &&
    /^(?:lado|side|disc|disk|disco|cd)\s*[-_.]?\s*[a-z0-9]+$/i.test(
      segments.at(-1) ?? "",
    )
  ) {
    segments.pop();
  }
  return [...segments, treatedAlbumArtworkFileName].join("/");
}

function backupFileName(sourceKey: string, stamp: string) {
  return `${stamp}-${workspaceRelativeSegments(sourceKey, "").join("__")}`;
}

function videoOutputBackupStamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, "")
    .replace(/[-:]/g, "")
    .replace("T", "-");
}

async function copyFileToDirectory(
  handle: FileSystemDirectoryHandle,
  file: File,
  fileName = file.name,
) {
  const output = await handle.getFileHandle(fileName, { create: true });
  const writable = await output.createWritable();
  await file.stream().pipeTo(writable);
}

function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

async function copyTextToClipboard(value: string) {
  const text = String(value || "").trim();
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function jobErrorReport(job: RenderJob) {
  return [
    `Job: ${job.id}`,
    `Tipo: ${job.kind ?? "desconhecido"}`,
    `Status: ${job.status}`,
    job.maxAttempts && job.maxAttempts > 1
      ? `Tentativa: ${job.attempt ?? 0}/${job.maxAttempts}`
      : "",
    job.stage ? `Etapa atual: ${jobStageLabel(job.stage)}` : "",
    job.stageTimings?.length
      ? `Tempos:\n${job.stageTimings
          .map(
            (item) =>
              `- ${jobStageLabel(item.stage)}: ${formatDurationMs(item.durationMs)}${item.interrupted ? " (interrompido)" : ""}`,
          )
          .join("\n")}`
      : "",
    job.retryHistory?.length
      ? `Retentativas:\n${job.retryHistory
          .map(
            (item) =>
              `- tentativa ${item.attempt}: ${item.errorCode} em ${item.stage ? jobStageLabel(item.stage) : "job"} (${item.message})`,
          )
          .join("\n")}`
      : "",
    job.errorCode ? `Código: ${job.errorCode}` : "",
    `Mensagem: ${job.message}`,
    job.errorDetail ? `Detalhe:\n${job.errorDetail}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export default App;
