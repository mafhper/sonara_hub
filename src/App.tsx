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
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
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
  NotificationCenter,
  type ToastTone,
  ToastViewport,
} from "./ui/Feedback";
import { BatchJobBoard } from "./jobs/BatchJobBoard";
import { AudioExportWorkspace } from "./workspaces/AudioExportWorkspace";
import { AudioLibraryWorkspace } from "./workspaces/AudioLibraryWorkspace";
import { CatalogPreview } from "./workspaces/CatalogPreview";
import { ScenePreview } from "./workspaces/CompositionPreview";
import { CoverArtworkWorkspace } from "./workspaces/CoverArtworkWorkspace";
import {
  coverSeriesMetaStyleForKey,
  coverSeriesPreviewLines,
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
import { normalizeFileNamePattern } from "../shared/file-naming.mjs";
import {
  normalizeVideoOutputConflictMode,
  prepareVideoOutputProject,
  videoOutputProjectDirectoryName,
} from "../shared/video-output-folder.mjs";
import type { VideoOutputConflictMode } from "../shared/video-output-folder.mjs";
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
  isArtworkName,
} from "../shared/artwork-convention.mjs";
import {
  loadDirectoryHandle,
  loadSnapshot,
  saveDirectoryHandle,
  saveSnapshot,
} from "./storage";
import { CanvasInteractionOverlay } from "./CanvasInteractionOverlay";
import {
  appThemeLabels,
  normalizeThemePreference,
  normalizeUiScalePreference,
  themePreferenceOptions,
  uiScalePreferenceOptions,
} from "./theme";
import { AppShell } from "./app/AppShell";
import {
  DEFAULT_PROJECT_SAVE_ID,
  INPUT_PROJECT_STORAGE_KEY,
  PODCAST_METADATA_SLICE_BYTES,
  defaultMetadata,
  defaultProjectSave,
  emptyBands,
  versionSuggestions,
} from "./app/appDefaults";
import type {
  ActiveStep,
  AudioBands,
  AudioStageView,
  BatchCommonDraft,
  DestructiveAudioBatch,
  InputProjectOption,
  InternalInputAsset,
  InternalInputProject,
  PreparedPublicationOutputProject,
  PreparedVideoOutputProject,
  ProjectCleanupScope,
  ProjectSaveOption,
  StorageUsage,
  TextFadeInSettings,
  TextFadeOutSettings,
  VisualStageView,
  WorkspaceFolderKind,
  WorkspaceMode,
} from "./app/appTypes";
import {
  formatDuration,
  formatFileCount,
  formatUsage,
  messageOf,
} from "./app/appFormatters";
import { copyTextToClipboard, jobErrorReport } from "./app/appClipboard";
import {
  normalizeSnapshotNavigation,
  stepLabel,
  visualStageLabel,
} from "./app/appNavigation";
import {
  loadCoverSeriesSettings,
  normalizeCoverSeriesClient,
  saveCoverSeriesSettings,
} from "./features/visual/coverSeriesPreferences";
import {
  loadFileNamePattern,
  saveFileNamePattern,
} from "./features/export/fileNamePatternPreference";
import {
  albumFolderArtworkSourceKey,
  backupFileName,
  copyFileToDirectory,
  copyUrlToDirectory,
  getWorkspaceFile,
  preparePublicationOutputProject,
  publicationAssetDirectoryForUrl,
  videoOutputBackupStamp,
  writeBlobToWorkspacePath,
} from "./features/export/exportWorkspaceFiles";
import {
  loadPodcastEnabled,
  savePodcastEnabled,
} from "./features/audio/podcastPreference";
import {
  type ProjectMetadataDefaults,
  finalizeImportedTracks,
  metadataFromAudio,
  restoreTrack,
  trackBatchGroupKey,
  trackFromFile,
  trackFromInput,
} from "./features/audio/audioTrackDrafts";
import {
  deleteInternalProjectSnapshot,
  ensureProjectSaveOption,
  listInternalProjectSaves,
  listProjectSaves,
  loadInternalProjectSnapshot,
  loadProjectSnapshot,
  projectSaveIdFromName,
  projectSaveOptionFromSnapshot,
  removeProjectSnapshot,
  saveInternalProjectSnapshot,
  writeProjectSnapshot,
} from "./features/workspace/projectSnapshot.client";
import {
  type DirectoryAssetEntry,
  collectDirectoryAssets,
  discoverInputProjects,
  ensureAlbumArtworkDirectories,
  isAudioName,
  isPrivateAssetPath,
  isPrivateAudioPath,
} from "./features/workspace/workspaceFiles";
import {
  attachSuggestedArtwork,
  attachSuggestedLyrics,
} from "./features/workspace/trackSuggestions";
import {
  isBrowserInputProject,
  projectOptionLabel,
} from "./features/workspace/projectOptions";
import { audioDraftFromMetadata } from "./features/audio/audioTagDraft";
import {
  applyLayersTemplateToTracks,
  applyMusicTemplateToTracks,
  applyPublicationTemplateToTracks,
  applyVisualTemplateToTracks,
} from "./features/visual/trackTemplates";
import { stripLayerFile } from "./features/visual/layerSerialization";
import { coverLayerFromArtwork } from "./features/visual/coverLayerFactory";
import { useInteractionDialog } from "./hooks/useInteractionDialog";
import { useNotifications } from "./hooks/useNotifications";
import {
  DEFAULT_LEFT_RAIL_WIDTH,
  DEFAULT_RIGHT_RAIL_WIDTH,
  usePanelLayout,
} from "./hooks/usePanelLayout";
import { useThemePreference } from "./hooks/useThemePreference";
import type {
  AudioInfo,
  AudioTagDraft,
  AudioTechnicalAnalysis,
  ArtworkSuggestion,
  CoverSeriesMetaStyle,
  CoverSeriesSettings,
  LyricsSuggestion,
  MediaLayerV2,
  ProjectSnapshot,
  RenderJob,
  TextFieldKey,
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
  const {
    effectiveTheme,
    setThemePreference,
    setUiScalePreference,
    themePreference,
    uiScalePreference,
  } = useThemePreference();
  const {
    dismissToast,
    notificationLog,
    notificationsOpen,
    setBatchFeedback,
    setError,
    setNotificationLog,
    setNotificationsOpen,
    showToast,
    toasts,
  } = useNotifications();
  const {
    closeInteractionDialog,
    interactionDialog,
    requestConfirmation,
    requestTextInput,
  } = useInteractionDialog();
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
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
  const {
    floatingPanels,
    leftCollapsed,
    leftRailWidth,
    panelsSwapped,
    resizingPanel,
    rightCollapsed,
    rightRailWidth,
    setLeftCollapsed,
    setLeftRailWidth,
    setPanelsSwapped,
    setRightCollapsed,
    setRightRailWidth,
    shellStyle,
    startPanelResize,
    toggleLeftPanel,
    toggleRightPanel,
  } = usePanelLayout();
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
  const reviewTracks =
    workflowMode === "batch"
      ? tracks.filter((track) => track.selectedForBatch)
      : selectedTrack
        ? [selectedTrack]
        : [];
  // Divulgação exports use the same track scope as the main library/sidebar:
  // batch checkboxes when in batch mode, otherwise the active track.
  const effectivePublicationTracks = reviewTracks;
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
    audioBandsRef.current = audioBands;
  }, [audioBands]);

  useEffect(() => {
    if (selectedTrack?.audioInfo?.hasEmbeddedCover) {
      void loadEmbeddedArtwork(selectedTrack);
    }
  }, [selectedTrack?.id]);

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
    <AppShell
      floatingPanels={floatingPanels}
      leftCollapsed={leftCollapsed}
      onCloseFloatingPanels={() => {
        setLeftCollapsed(true);
        setRightCollapsed(true);
      }}
      panelsSwapped={panelsSwapped}
      resizingPanel={resizingPanel}
      rightCollapsed={rightCollapsed}
      shellStyle={shellStyle}
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
                batchTargetCount={selectedForBatchCount}
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
                showMetadata={showMetadata}
                textSettings={selectedTrack.textSettings}
                onChange={updateMetadata}
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
              <section className="settings-section settings-section-stack">
                <div>
                  <h3>Aparência</h3>
                  <p>
                    Escolha o tema da interface sem alterar cenas, cores de
                    vídeo ou presets de exportação.
                  </p>
                  <small>
                    Tema ativo: {appThemeLabels[effectiveTheme]} · Preferência
                    local deste navegador.
                  </small>
                </div>
                <div
                  aria-label="Tema da interface"
                  className="theme-preference-grid"
                  role="group"
                >
                  {themePreferenceOptions.map((option) => (
                    <button
                      aria-label={`${option.label}: ${option.description}`}
                      aria-pressed={themePreference === option.id}
                      className={
                        themePreference === option.id ? "selected" : ""
                      }
                      key={option.id}
                      type="button"
                      onClick={() =>
                        setThemePreference(normalizeThemePreference(option.id))
                      }
                    >
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </button>
                  ))}
                </div>
                <div
                  aria-label="Escala da interface"
                  className="ui-scale-grid"
                  role="group"
                >
                  {uiScalePreferenceOptions.map((option) => (
                    <button
                      aria-label={`${option.label}: ${option.description}`}
                      aria-pressed={uiScalePreference === option.id}
                      className={
                        uiScalePreference === option.id ? "selected" : ""
                      }
                      key={option.id}
                      type="button"
                      onClick={() =>
                        setUiScalePreference(
                          normalizeUiScalePreference(option.id),
                        )
                      }
                    >
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </button>
                  ))}
                </div>
              </section>
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
    </AppShell>
  );
}

export default App;
