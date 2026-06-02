import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Disc3,
  Download,
  Eye,
  EyeOff,
  FileAudio,
  FolderOpen,
  Image,
  Layers3,
  Loader2,
  Maximize2,
  Minimize2,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  Fragment,
  type CSSProperties,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  builtinVisualPresets,
  normalizeVisualSettings,
} from "../shared/visual-effects.mjs";
import type {
  CloudLightSettings,
  PlayfulContent,
  ScenePresetV3,
  WaveformType,
  WaveformV1,
} from "../shared/visual-effects.mjs";
import {
  createSceneRuntime,
  loadMediaElements,
} from "../shared/canvas-scene-runtime.mjs";
import type { SceneComposition } from "../shared/canvas-scene-runtime.mjs";
import {
  fetchJson,
  fetchJsonWithRetry,
  fetchOptional,
  localApiMessage,
} from "../shared/local-api.mjs";
import {
  applyCommonMetadata,
  groupAudioTracks,
} from "../shared/audio-batch.mjs";
import type { BatchApplyMode } from "../shared/audio-batch.mjs";
import {
  resolveDestructiveBatchState,
  writeReplacementsWithRollback,
} from "../shared/destructive-audio-batch.mjs";
import { directoryImportPrefix } from "../shared/audio-import.mjs";
import {
  albumArtworkDirectoryPaths,
  chooseArtworkForTrack,
  isArtworkName,
  singleTrackArtworkFileName,
} from "../shared/artwork-convention.mjs";
import {
  loadDirectoryHandle,
  loadSnapshot,
  saveDirectoryHandle,
  saveSnapshot,
} from "./storage";
import type {
  AudioInfo,
  AudioTagDraft,
  AudioTechnicalAnalysis,
  ArtworkSuggestion,
  CoverSeriesMetaKey,
  CoverSeriesMetaStyle,
  CoverSeriesSettings,
  MediaLayerV2,
  ProjectSnapshot,
  RenderJob,
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
  }
}

type ActiveStep = "music" | "visual" | "text" | "export";
type WorkspaceMode = "audio" | "visual";
type AudioStageView = "edit" | "catalog" | "videos";
type VisualStageView = "editor" | "videos";
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
type CoverLayerPreset = "background" | "left" | "center" | "right" | "corner";
type DestructiveAudioBatch = {
  jobIds: string[];
  finalizing: boolean;
};
type PlayfulPatch = Partial<Omit<PlayfulContent, "enabled" | "collections">> & {
  enabled?: Partial<PlayfulContent["enabled"]>;
  collections?: Partial<PlayfulContent["collections"]>;
};

const emptyBands: AudioBands = {
  energy: 0,
  bass: 0,
  mid: 0,
  high: 0,
  samples: [],
  spectrum: [],
};
const compositionThumbnailCache = new Map<string, string>();
const COMPOSITION_THUMBNAIL_CACHE_LIMIT = 60;
const outputPresets = [
  ["youtube-720p", "720p", "1280 x 720"],
  ["youtube-1080p", "1080p", "1920 x 1080"],
  ["youtube-2k", "2K", "2560 x 1440"],
  ["youtube-4k", "4K", "3840 x 2160"],
];

const PANEL_WIDTH_STORAGE_KEY = "sonara-hub-panel-widths";
const COVER_SERIES_STORAGE_KEY = "sonara-hub-cover-series-settings";
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
};
const defaultTextSettings: TextOverlaySettings = {
  fields: {
    title: true,
    artist: true,
    album: false,
    year: false,
    version: false,
  },
  preset: "top-left",
  fontFamily: "Inter",
  fontSize: 42,
  fontWeight: 650,
  letterSpacing: 0,
  lineHeight: 118,
  color: "#f7f8fb",
  opacity: 94,
  x: 5,
  y: 7,
  align: "left",
  verticalAnchor: "top",
  shadow: 48,
};
const defaultCoverSeriesSettings: CoverSeriesSettings = {
  enabled: true,
  style: "roman",
  sequence: "I, II, III, IV, V",
  fontSize: 112,
  color: "#fffaf1",
  opacity: 92,
  x: 50,
  y: 89,
  letterSpacing: 18,
  includeTitle: false,
  includeAlbum: false,
  includeArtist: false,
  includeYear: false,
  metaOrder: "title, album, artist, year",
  metaFontSize: 34,
  metaGap: 10,
  metaStyles: {
    title: {
      fontSize: 38,
      color: "#fffaf1",
      opacity: 88,
      offsetX: 0,
      offsetY: 0,
    },
    album: {
      fontSize: 34,
      color: "#fffaf1",
      opacity: 76,
      offsetX: 0,
      offsetY: 0,
    },
    artist: {
      fontSize: 32,
      color: "#fffaf1",
      opacity: 72,
      offsetX: 0,
      offsetY: 0,
    },
    year: {
      fontSize: 28,
      color: "#fffaf1",
      opacity: 68,
      offsetX: 0,
      offsetY: 0,
    },
  },
};
const coverLayerPresetLabels: Record<CoverLayerPreset, string> = {
  background: "Fundo",
  left: "Esquerda",
  center: "Centro",
  right: "Direita",
  corner: "Canto",
};
const childFriendlyPalettes: Array<{
  name: string;
  colors: ScenePresetV3["colors"];
}> = [
  {
    name: "Jardim",
    colors: { base: "#73b5c8", effect: "#ef8b7f", light: "#f4c85d" },
  },
  {
    name: "Céu",
    colors: { base: "#79b8db", effect: "#8d82cf", light: "#f6d36b" },
  },
  {
    name: "Pomar",
    colors: { base: "#7bbf9f", effect: "#ee9b73", light: "#f7d982" },
  },
];
const waveformStylePresets: Array<{
  name: string;
  patch: Partial<Omit<WaveformV1, "advanced">> & {
    advanced?: Partial<WaveformV1["advanced"]>;
  };
}> = [
  {
    name: "Visor âmbar",
    patch: {
      type: "spectrum-bars",
      colorMode: "gradient",
      color: "#76d6a6",
      secondaryColor: "#e3d06f",
      tertiaryColor: "#e79b66",
      opacity: 76,
      height: 26,
      position: 86,
      width: 88,
      thickness: 3,
      smoothing: 58,
      audioReaction: 74,
      advanced: {
        barGap: 38,
        barRadius: 28,
        barPeakHold: 82,
        barPeakDecay: 34,
      },
    },
  },
  {
    name: "Espectro colorido",
    patch: {
      type: "spectrum-bars",
      colorMode: "bands",
      color: "#70c7ff",
      secondaryColor: "#e9c769",
      tertiaryColor: "#e8799a",
      opacity: 78,
      height: 28,
      position: 86,
      width: 92,
      thickness: 4,
      smoothing: 52,
      audioReaction: 78,
      advanced: {
        barGap: 30,
        barRadius: 62,
        barPeakHold: 58,
        barPeakDecay: 48,
      },
    },
  },
  {
    name: "Anel editorial",
    patch: {
      type: "radial-ring",
      colorMode: "gradient",
      color: "#8bc8ff",
      secondaryColor: "#b4a3ff",
      tertiaryColor: "#f0c978",
      opacity: 84,
      height: 38,
      position: 53,
      width: 100,
      thickness: 4,
      smoothing: 48,
      audioReaction: 82,
      advanced: {
        radialRadius: 30,
        radialArc: 92,
        radialRotation: 0,
        radialGlow: 58,
      },
    },
  },
];
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
  const [workflowMode, setWorkflowMode] = useState<"single" | "batch">(
    "single",
  );
  const [activeStep, setActiveStep] = useState<ActiveStep>("visual");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("audio");
  const [audioStageView, setAudioStageView] = useState<AudioStageView>("edit");
  const [visualStageView, setVisualStageView] =
    useState<VisualStageView>("editor");
  const [visualPresets, setVisualPresets] =
    useState<ScenePresetV3[]>(builtinVisualPresets);
  const [outputPreset, setOutputPreset] = useState("youtube-1080p");
  const [qualityProfile, setQualityProfile] = useState("auto");
  const [showMetadata, setShowMetadata] = useState(true);
  const [cover, setCover] = useState<{ file: File; src: string } | null>(null);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [error, setError] = useState("");
  const [folderName, setFolderName] = useState("Pasta input");
  const [workspaceWriteEnabled, setWorkspaceWriteEnabled] = useState(false);
  const [outputFolderName, setOutputFolderName] = useState("outputs interno");
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
  const [lastRemovedLayer, setLastRemovedLayer] = useState<MediaLayerV2 | null>(
    null,
  );
  const [folderImportProgress, setFolderImportProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);
  const [batchFeedback, setBatchFeedback] = useState("");
  const [queuePaused, setQueuePaused] = useState(false);
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
  const [coverSeriesSettings, setCoverSeriesSettings] =
    useState<CoverSeriesSettings>(() => loadCoverSeriesSettings());
  const [analyzingTrackIds, setAnalyzingTrackIds] = useState<string[]>([]);
  const [embeddedArtworkByTrackId, setEmbeddedArtworkByTrackId] = useState<
    Record<string, string | null>
  >({});
  const [playerArtworkSource, setPlayerArtworkSource] = useState<
    "planned" | "embedded"
  >("planned");
  const audioBandsRef = useRef(audioBands);
  const audioRef = useRef<HTMLAudioElement>(null);
  const layerInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const variationAudioInputRef = useRef<HTMLInputElement>(null);
  const fallbackFolderInputRef = useRef<HTMLInputElement>(null);
  const outputDirectoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const musicDirectoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const audioJobOriginsRef = useRef(new Map<string, string>());
  const integratedAudioJobsRef = useRef(new Set<string>());
  const destructiveAudioBatchRef = useRef<DestructiveAudioBatch | null>(null);
  const embeddedArtworkRequestsRef = useRef(new Set<string>());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef(0);

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
  const playerArtworkSrc =
    playerArtworkSource === "embedded" && embeddedArtworkSrc
      ? embeddedArtworkSrc
      : plannedArtworkSrc || embeddedArtworkSrc;
  const playerArtworkLabel = playerArtworkSrc
    ? playerArtworkSrc === embeddedArtworkSrc && !plannedArtworkSrc
      ? "Embutida"
      : playerArtworkSource === "embedded" && embeddedArtworkSrc
        ? "Embutida"
        : "Planejada"
    : "";
  const selectedScene = selectedTrack?.scene ?? builtinVisualPresets[0];
  const selectedOutput =
    outputPresets.find(([value]) => value === outputPreset) ?? outputPresets[1];
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
  const treatedTrackCount = tracks.filter(
    (track) => track.packageStatus === "treated",
  ).length;
  const audioWarningCount = tracks.filter(
    (track) =>
      track.audioInfo?.analysis?.risk &&
      track.audioInfo.analysis.risk !== "safe",
  ).length;

  useEffect(() => {
    void loadInitialWorkspace();
    void restoreOutputDirectory();
    void restoreJobHistory();
  }, []);

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
    setPlayerArtworkSource("planned");
    if (selectedTrack?.audioInfo?.hasEmbeddedCover) {
      void loadEmbeddedArtwork(selectedTrack);
    }
  }, [selectedTrack?.id]);

  useEffect(() => {
    savePanelWidths({ left: leftRailWidth, right: rightRailWidth });
  }, [leftRailWidth, rightRailWidth]);

  useEffect(() => {
    if (!tracks.length) return;
    const timeout = window.setTimeout(() => {
      void saveSnapshot(createSnapshot());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [
    tracks,
    selectedTrackId,
    workflowMode,
    activeStep,
    outputPreset,
    qualityProfile,
    showMetadata,
    cover,
    coverSeriesSettings,
    workspaceMode,
    audioStageView,
    visualStageView,
  ]);

  useEffect(() => {
    if (!batchFeedback) return;
    const timeout = window.setTimeout(() => setBatchFeedback(""), 5_000);
    return () => window.clearTimeout(timeout);
  }, [batchFeedback]);

  async function loadInitialWorkspace() {
    try {
      const [snapshot, presetPayload] = await Promise.all([
        loadSnapshot(),
        fetchJsonWithRetry<{ presets?: ScenePresetV3[] }>(
          "/api/visual-presets",
        ),
      ]);
      setVisualPresets(
        (presetPayload.presets ?? builtinVisualPresets).map(
          (preset: ScenePresetV3) => normalizeVisualSettings(preset),
        ),
      );
      applySnapshotSettings(snapshot);
      const restored = await restoreMusicDirectory(snapshot);
      if (restored) return;
      const project = await fetchJsonWithRetry<{
        inputAudios?: Array<{ name: string; metadata: AudioInfo }>;
        defaultMetadata?: TrackMetadata;
      }>("/api/project");
      const inputTracks = (project.inputAudios ?? []).map(
        (audio: { name: string; metadata: AudioInfo }) =>
          trackFromInput(audio.name, audio.metadata, project.defaultMetadata),
      );
      setWorkspaceTracks(inputTracks, snapshot);
    } catch (reason) {
      setError(messageOf(reason));
    }
  }

  async function restoreMusicDirectory(snapshot?: ProjectSnapshot) {
    const handle = await loadDirectoryHandle("music-directory");
    if (!handle) return false;
    const permission = await handle.queryPermission?.({ mode: "read" });
    if (permission !== "granted") return false;
    musicDirectoryRef.current = handle;
    setWorkspaceWriteEnabled(false);
    await readMusicDirectory(handle, snapshot);
    return true;
  }

  async function restoreOutputDirectory() {
    const handle = await loadDirectoryHandle("output-directory");
    if (!handle) return;
    outputDirectoryRef.current = handle;
    setOutputFolderName(handle.name);
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

  async function clearCompletedJobs(scope: "terminal" | "video-render") {
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
      !window.confirm(
        `Excluir ${label}? A sessão e os arquivos já movidos para pastas externas serão preservados.`,
      )
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

  async function chooseMusicDirectory() {
    if (!window.showDirectoryPicker) {
      fallbackFolderInputRef.current?.click();
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({
        id: "sonara-hub-music",
        mode: "read",
        startIn: "music",
      });
      await saveDirectoryHandle("music-directory", handle);
      musicDirectoryRef.current = handle;
      setWorkspaceWriteEnabled(false);
      await readMusicDirectory(handle);
    } catch (reason) {
      if ((reason as DOMException)?.name !== "AbortError")
        setError(messageOf(reason));
    }
  }

  async function enableWorkspaceWrites() {
    const handle = musicDirectoryRef.current;
    if (!handle) {
      await chooseMusicDirectory();
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
    );
  }

  function disableWorkspaceWrites() {
    setWorkspaceWriteEnabled(false);
    destructiveAudioBatchRef.current = null;
    setBatchFeedback(
      "Modo não destrutivo reativado. Processamentos futuros gerarão cópias sem substituir originais.",
    );
  }

  async function chooseOutputDirectory() {
    if (!window.showDirectoryPicker) {
      setError(
        "O navegador atual não oferece escolha persistente de pasta de saída.",
      );
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({
        id: "sonara-hub-output",
        mode: "readwrite",
        startIn: "videos",
      });
      await saveDirectoryHandle("output-directory", handle);
      outputDirectoryRef.current = handle;
      setOutputFolderName(handle.name);
    } catch (reason) {
      if ((reason as DOMException)?.name !== "AbortError")
        setError(messageOf(reason));
    }
  }

  async function readMusicDirectory(
    handle: FileSystemDirectoryHandle,
    snapshot?: ProjectSnapshot,
  ) {
    setError("");
    setFolderImportProgress({ current: 0, total: 0, name: "Lendo pasta" });
    const { audioEntries, artworkEntries } = await collectDirectoryAssets(
      handle,
      directoryImportPrefix(handle.name),
    );
    const next: TrackDraft[] = [];
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
      );
      next.push(trackFromFile(entry.file, info, entry.relativePath));
    }
    next.sort((first, second) =>
      first.sourceKey.localeCompare(second.sourceKey, "pt-BR"),
    );
    setFolderName(handle.name);
    setWorkspaceTracks(
      attachSuggestedArtwork(finalizeImportedTracks(next), artworkEntries),
      snapshot,
    );
    setFolderImportProgress(null);
  }

  async function readUploadedAudioMetadata(
    file: File,
    relativePath?: string,
    quick = false,
  ) {
    const formData = new FormData();
    formData.append("audio", file);
    formData.append(
      "relativePath",
      relativePath || file.webkitRelativePath || file.name,
    );
    formData.append("quick", String(quick));
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
        analysis: payload.analysis ?? undefined,
        suggestions: payload.suggestions,
      };
    } catch (reason) {
      setError(localApiMessage(reason, "ler os metadados do áudio"));
      return undefined;
    }
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
    if (track.sourceFile) {
      formData.append("audio", track.sourceFile);
    } else if (track.source === "input") {
      formData.append("inputAudio", track.sourceKey);
    } else {
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
    if (cover) return cover;
    return track?.useSuggestedCover === false
      ? null
      : (track?.suggestedCover ?? null);
  }

  function updateCoverSeriesSettingsPatch(patch: Partial<CoverSeriesSettings>) {
    setCoverSeriesSettings((current) => ({ ...current, ...patch }));
  }

  function saveCoverSeriesDefault() {
    saveCoverSeriesSettings(coverSeriesSettings);
    setBatchFeedback("Série visual salva como padrão local.");
  }

  function updateTextSettings(patch: Partial<TextOverlaySettings>) {
    if (!selectedTrack) return;
    updateSelectedTrack({
      textSettings: mergeTextSettings(selectedTrack.textSettings, patch),
    });
  }

  function applyTextToBatch() {
    if (!selectedTrack) return;
    const template = cloneTextSettings(selectedTrack.textSettings);
    setTracks((current) =>
      current.map((track) =>
        track.selectedForBatch
          ? { ...track, textSettings: cloneTextSettings(template) }
          : track,
      ),
    );
    setBatchFeedback("Texto do vídeo aplicado ao lote selecionado.");
  }

  function addCoverLayerPreset(preset: CoverLayerPreset) {
    if (!selectedTrack) return;
    const nextLayers = layersWithCoverPreset(selectedTrack, preset);
    if (!nextLayers) {
      setError("Escolha uma capa planejada ou oferecida pela pasta antes.");
      return;
    }
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
  ) {
    const artwork = coverForTrack(track);
    if (!artwork) return null;
    const existing = track.layers.find(isCoverLayer);
    const layer = coverLayerFromArtwork(artwork, preset, template ?? existing);
    const remaining = track.layers.filter((item) => !isCoverLayer(item));
    const ordered =
      preset === "background"
        ? [layer, ...remaining]
        : [...remaining.slice(0, 2), layer];
    return ordered.slice(0, 3).map((item, order) => ({ ...item, order }));
  }

  function clearSelectedCover() {
    setCover(null);
    if (selectedTrack?.suggestedCover) {
      updateSelectedTrack({ useSuggestedCover: false });
    }
  }

  function restoreSuggestedCover(trackId = selectedTrack?.id) {
    const track = tracks.find((item) => item.id === trackId);
    if (!track?.suggestedCover) return;
    setCover(null);
    updateTrackDraft(track.id, { useSuggestedCover: true });
  }

  function chooseCatalogCover(trackId: string) {
    setSelectedTrackId(trackId);
    coverInputRef.current?.click();
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
    if (!selectedTrack) return;
    updateSelectedTrack({ metadata: { ...selectedTrack.metadata, ...patch } });
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

  function openAudioReview() {
    setWorkspaceMode("audio");
    setAudioStageView("edit");
    if (tracks.length > 1) setWorkflowMode("batch");
  }

  function openArtworkEditor(trackId = selectedTrack?.id) {
    if (trackId) setSelectedTrackId(trackId);
    setWorkspaceMode("audio");
    setAudioStageView("edit");
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

  function applyPalette(colors: ScenePresetV3["colors"]) {
    updateScene({ ...selectedScene, colors });
  }

  async function analyzeSelectedAudio() {
    if (!selectedTrack) return;
    const trackId = selectedTrack.id;
    setAnalyzingTrackIds((current) =>
      current.includes(trackId) ? current : [...current, trackId],
    );
    const formData = new FormData();
    if (selectedTrack.sourceFile) {
      formData.append("audio", selectedTrack.sourceFile);
      formData.append(
        "relativePath",
        selectedTrack.sourceFile.webkitRelativePath || selectedTrack.sourceKey,
      );
    } else {
      formData.append("inputAudio", selectedTrack.sourceKey);
    }
    try {
      const payload = await fetchJson<{
        metadata: AudioInfo;
        analysis: AudioTechnicalAnalysis;
        suggestions: Partial<AudioTagDraft>;
      }>("/api/audio/analyze", { method: "POST", body: formData });
      updateSelectedTrack({
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
      setBatchFeedback("Selecione ao menos uma faixa para processar.");
      return;
    }
    destructiveAudioBatchRef.current = null;
    setBatchFeedback(
      workflowMode === "batch"
        ? `Processamento iniciado para ${selected.length} arquivo${selected.length === 1 ? "" : "s"}.`
        : "Processamento iniciado.",
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
      );
    }
  }

  async function submitAudioProcess(track: TrackDraft) {
    const formData = new FormData();
    if (track.sourceFile) formData.append("audio", track.sourceFile);
    else formData.append("inputAudio", track.sourceKey);
    const trackCover = coverForTrack(track);
    if (trackCover) formData.append("cover", trackCover.file);
    formData.append(
      "draft",
      JSON.stringify(audioDraftFromMetadata(track.metadata)),
    );
    formData.append("coverSeries", String(coverSeriesSettings.enabled));
    formData.append("coverStyle", coverSeriesSettings.style);
    formData.append("coverSeriesSettings", JSON.stringify(coverSeriesSettings));
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
    const name = window.prompt(
      "Nome do preset personalizado",
      `${selectedScene.name} personalizado`,
    );
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
    if (selectedScene.source !== "custom") return;
    try {
      await fetchJson(`/api/visual-presets/${selectedScene.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(selectedScene),
      });
    } catch (reason) {
      setError(localApiMessage(reason, "salvar o preset"));
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
    const removed =
      selectedTrack.layers.find((layer) => layer.id === id) ?? null;
    setLastRemovedLayer(removed);
    updateSelectedTrack({
      layers: selectedTrack.layers
        .filter((layer) => layer.id !== id)
        .map((layer, order) => ({ ...layer, order })),
    });
  }

  function undoRemoveLayer() {
    if (!selectedTrack || !lastRemovedLayer || selectedTrack.layers.length >= 3)
      return;
    updateSelectedTrack({
      layers: [...selectedTrack.layers, lastRemovedLayer],
    });
    setLastRemovedLayer(null);
  }

  function moveLayer(id: string, direction: -1 | 1) {
    if (!selectedTrack) return;
    const layers = [...selectedTrack.layers];
    const index = layers.findIndex((layer) => layer.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= layers.length) return;
    [layers[index], layers[target]] = [layers[target], layers[index]];
    updateSelectedTrack({
      layers: layers.map((layer, order) => ({ ...layer, order })),
    });
  }

  function applyMusicToBatch() {
    if (!selectedTrack) return;
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
    } = selectedTrack.metadata;
    setTracks((current) =>
      current.map((track) =>
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
      ),
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
    if (!selectedTrack) return;
    setTracks((current) =>
      current.map((track) =>
        track.selectedForBatch
          ? {
              ...track,
              scene: normalizeVisualSettings(selectedTrack.scene),
              layers: selectedTrack.layers.map((layer) => ({
                ...layer,
                id: crypto.randomUUID(),
              })),
            }
          : track,
      ),
    );
    setBatchFeedback("Visual aplicado ao lote selecionado.");
  }

  function applyPublicationToBatch() {
    if (!selectedTrack) return;
    const {
      categoryId,
      containsSyntheticMedia,
      description,
      language,
      madeForKids,
      tags,
      visibility,
    } = selectedTrack.metadata;
    setTracks((current) =>
      current.map((track) =>
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
      ),
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
    if (workflowMode === "batch") {
      const selected = tracks.filter((track) => track.selectedForBatch);
      for (const track of selected) await submitRender(track);
    } else {
      await submitRender(selectedTrack);
    }
  }

  async function submitRender(track: TrackDraft) {
    const formData = new FormData();
    if (track.sourceFile) formData.append("audio", track.sourceFile);
    else formData.append("inputAudio", track.sourceKey);
    for (const layer of track.layers)
      formData.append("mediaLayers", layer.file);
    const trackCover = coverForTrack(track);
    if (trackCover) formData.append("cover", trackCover.file);
    formData.append("visualSettings", JSON.stringify(track.scene));
    formData.append(
      "compositionSettings",
      JSON.stringify({
        mediaLayers: track.layers.map(stripLayerFile),
        textSettings: track.textSettings,
      }),
    );
    formData.append("preset", outputPreset);
    formData.append("qualityProfile", qualityProfile);
    formData.append("renderMode", workflowMode);
    formData.append("showMetadata", String(showMetadata));
    for (const [key, value] of Object.entries(track.metadata)) {
      formData.append(key, String(value));
    }
    try {
      const data = await fetchJson<{ jobId: string }>("/api/render", {
        method: "POST",
        body: formData,
      });
      const job: RenderJob = {
        id: data.jobId,
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

  function pollJob(id: string) {
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
        setJobs((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "error",
                  message: "Servidor local indisponível",
                }
              : item,
          ),
        );
        setError(localApiMessage(reason, "acompanhar a exportação"));
      }
    }, 900);
  }

  async function cancelJob(id: string) {
    try {
      const job = await fetchJson<RenderJob>(`/api/jobs/${id}/cancel`, {
        method: "POST",
      });
      setJobs((current) =>
        current.map((item) => (item.id === id ? job : item)),
      );
      setBatchFeedback("Cancelamento solicitado.");
    } catch (reason) {
      setError(localApiMessage(reason, "cancelar o processamento"));
    }
  }

  async function cancelAllJobs() {
    try {
      const payload = await fetchJson<{ jobs: RenderJob[] }>(
        "/api/jobs/cancel-all",
        { method: "POST" },
      );
      setJobs(payload.jobs);
      setBatchFeedback("Todos os processamentos pendentes foram cancelados.");
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
      setBatchFeedback("Fila retomada.");
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
    await copyUrlToDirectory(handle, job.outputUrl);
    await copyUrlToDirectory(handle, job.sidecarUrl);
    if (job.thumbnailUrl) await copyUrlToDirectory(handle, job.thumbnailUrl);
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
      selectedForBatch: false,
    };
    setTracks((current) => [...current, treated]);
    if (workflowMode !== "batch") setSelectedTrackId(treated.id);
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
      activeStep,
      selectedTrackId,
      outputPreset,
      qualityProfile,
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
        thumbnailPreviewMode: track.thumbnailPreviewMode,
      })),
    };
  }

  function applySnapshotSettings(snapshot?: ProjectSnapshot) {
    if (!snapshot) return;
    setWorkflowMode(snapshot.workflowMode);
    setWorkspaceMode(snapshot.workspaceMode ?? "visual");
    setAudioStageView(snapshot.audioStageView ?? "edit");
    setVisualStageView(snapshot.visualStageView ?? "editor");
    setActiveStep(snapshot.activeStep);
    setOutputPreset(snapshot.outputPreset);
    setQualityProfile(snapshot.qualityProfile);
    setShowMetadata(snapshot.showMetadata);
    setCoverSeriesSettings(
      normalizeCoverSeriesClient(snapshot.coverSeriesSettings),
    );
    if (snapshot.coverFile) {
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
    setTracks(restored);
    setSelectedTrackId(
      restored.some((track) => track.id === snapshot.selectedTrackId)
        ? snapshot.selectedTrackId
        : (restored[0]?.id ?? ""),
    );
  }

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
          <IconButton
            label={leftCollapsed ? "Mostrar biblioteca" : "Ocultar biblioteca"}
            onClick={toggleLeftPanel}
          >
            {leftCollapsed ? <ChevronRight /> : <ChevronLeft />}
          </IconButton>
          <IconButton
            label={rightCollapsed ? "Mostrar inspetor" : "Ocultar inspetor"}
            onClick={toggleRightPanel}
          >
            {rightCollapsed ? <ChevronLeft /> : <ChevronRight />}
          </IconButton>
          <IconButton
            label="Inverter barras laterais"
            onClick={() => setPanelsSwapped((current) => !current)}
          >
            <SlidersHorizontal />
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
        <div className="library-header">
          <span className="overline">Pasta de trabalho</span>
          <div>
            <strong>{folderName}</strong>
            <button type="button" onClick={() => void chooseMusicDirectory()}>
              Abrir pasta
            </button>
          </div>
          <div className="library-mode-row">
            <small className={workspaceWriteEnabled ? "write" : ""}>
              {workspaceWriteEnabled
                ? "Substitui originais ao finalizar"
                : "Não destrutivo"}
            </small>
            {workspaceWriteEnabled && (
              <button
                className="library-mode-cancel"
                type="button"
                onClick={disableWorkspaceWrites}
              >
                <X /> Cancelar substituição
              </button>
            )}
          </div>
        </div>
        <div
          className="mode-switch"
          role="tablist"
          aria-label="Modo de processamento"
        >
          <button
            className={workflowMode === "single" ? "active" : ""}
            type="button"
            onClick={() => setWorkflowMode("single")}
          >
            Faixa única
          </button>
          <button
            className={workflowMode === "batch" ? "active" : ""}
            type="button"
            onClick={() => setWorkflowMode("batch")}
          >
            Lote
          </button>
        </div>
        <div className="library-caption">
          <span>
            {tracks.length === 1 ? "1 música" : `${tracks.length} músicas`}
          </span>
          {workflowMode === "batch" && (
            <span>
              {tracks.filter((track) => track.selectedForBatch).length}{" "}
              selecionadas
            </span>
          )}
        </div>
        <div className="track-list">
          {tracks.map((track) => (
            <button
              className={`track-row ${workflowMode === "batch" ? "batch" : ""} ${track.id === selectedTrack?.id ? "selected" : ""}`}
              key={track.id}
              type="button"
              onClick={() => setSelectedTrackId(track.id)}
            >
              {workflowMode === "batch" && (
                <input
                  aria-label={`Selecionar ${track.metadata.title}`}
                  checked={track.selectedForBatch}
                  type="checkbox"
                  onChange={(event) => {
                    event.stopPropagation();
                    setTracks((current) =>
                      current.map((item) =>
                        item.id === track.id
                          ? { ...item, selectedForBatch: event.target.checked }
                          : item,
                      ),
                    );
                  }}
                />
              )}
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
                    {track.packageStatus === "treated" ? "Tratado" : "Original"}
                  </em>
                  {track.metadata.version && <em>{track.metadata.version}</em>}
                </small>
              </span>
              <span className="track-status" />
            </button>
          ))}
        </div>
        <div className="library-actions">
          <button
            className="upload-action"
            type="button"
            onClick={() => void chooseMusicDirectory()}
          >
            <FolderOpen /> Abrir pasta
          </button>
          {musicDirectoryRef.current && !workspaceWriteEnabled && (
            <button
              className="quiet-action"
              type="button"
              onClick={() => void enableWorkspaceWrites()}
            >
              <FolderOpen /> Permitir substituir ao finalizar
            </button>
          )}
          {workspaceWriteEnabled && (
            <p className="library-mode-note">
              Os originais só serão trocados se todos os itens selecionados
              terminarem. Cancelar ou falhar preserva a pasta.
            </p>
          )}
          {typeof window !== "undefined" && !window.showDirectoryPicker && (
            <button
              className="quiet-action"
              type="button"
              onClick={() => fallbackFolderInputRef.current?.click()}
            >
              <FolderOpen /> Importar arquivos
            </button>
          )}
          <button
            className="quiet-action"
            type="button"
            onClick={() => audioInputRef.current?.click()}
          >
            <Plus /> Adicionar áudio
          </button>
        </div>
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
            batchApplyMode={batchApplyMode}
            batchCommon={batchCommon}
            batchFeedback={batchFeedback}
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
            coverSeriesSettings={coverSeriesSettings}
            onChooseCover={chooseCatalogCover}
            onRestoreSuggestedCover={restoreSuggestedCover}
            onSelectTrack={setSelectedTrackId}
            tracks={reviewTracks}
          />
        ) : (workspaceMode === "audio" && audioStageView === "videos") ||
          (workspaceMode === "visual" && visualStageView === "videos") ? (
          <VideoReviewGrid
            coverForTrack={coverForTrack}
            selectedTrackId={selectedTrackId}
            onEditVisual={openVisualEditor}
            onSelectTrack={setSelectedTrackId}
            onThumbnailMode={(trackId, thumbnailPreviewMode) =>
              updateTrackDraft(trackId, { thumbnailPreviewMode })
            }
            outputLabel={selectedOutput[1]}
            showMetadata={showMetadata}
            tracks={reviewTracks}
          />
        ) : (
          <div className="canvas-table">
            <div className="preview-frame">
              <ScenePreview
                audioBandsRef={audioBandsRef}
                coverSrc={selectedCover?.src}
                layers={selectedTrack?.layers ?? []}
                metadata={selectedTrack?.metadata ?? defaultMetadata}
                scene={selectedScene}
                showMetadata={showMetadata}
                textSettings={
                  selectedTrack?.textSettings ?? defaultTextSettings
                }
              />
            </div>
          </div>
        )}
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
          canToggleArtwork={Boolean(plannedArtworkSrc && embeddedArtworkSrc)}
          onNext={() => selectAdjacentTrack(1)}
          onPrevious={() => selectAdjacentTrack(-1)}
          onToggleArtwork={() =>
            setPlayerArtworkSource((current) =>
              current === "planned" ? "embedded" : "planned",
            )
          }
          onEditArtwork={() => openArtworkEditor()}
          onEditVisual={() => openVisualEditor()}
          onToggle={() => void togglePlayback()}
        />
      </section>

      <aside className="inspector-panel">
        <PanelResizeHandle
          active={resizingPanel === "inspector"}
          className="inspector-resize"
          label="Redimensionar inspetor"
          onPointerDown={(event) => startPanelResize("inspector", event)}
          onReset={() => setRightRailWidth(DEFAULT_RIGHT_RAIL_WIDTH)}
        />
        <div className="inspector-header">
          <strong>Ajustes</strong>
          <span>
            {workspaceMode === "audio" ? "Biblioteca" : stepLabel(activeStep)}
          </span>
        </div>
        {selectedTrack ? (
          <div className="inspector-scroll">
            {workspaceMode === "audio" ? (
              <AudioLibraryInspector
                analysis={selectedTrack.audioInfo?.analysis}
                artworkHint={artworkConventionHint(selectedTrack)}
                cover={selectedCover}
                coverSeriesSettings={coverSeriesSettings}
                metadata={selectedTrack.metadata}
                suggestedCover={selectedTrack.suggestedCover}
                workflowMode={workflowMode}
                onAnalyze={() => void analyzeSelectedAudio()}
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
                onChooseCover={() => coverInputRef.current?.click()}
                onClearCover={clearSelectedCover}
                onCoverSeriesSettings={updateCoverSeriesSettingsPatch}
                onRestoreSuggestedCover={restoreSuggestedCover}
                onSaveCoverSeriesDefault={saveCoverSeriesDefault}
                onProcess={() => void processReviewedAudio()}
                isAnalyzing={analyzingTrackIds.includes(selectedTrack.id)}
              />
            ) : activeStep === "music" ? (
              <MusicInspector
                artworkHint={artworkConventionHint(selectedTrack)}
                cover={selectedCover}
                suggestedCover={selectedTrack.suggestedCover}
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
                onChooseCover={() => coverInputRef.current?.click()}
                onClearCover={clearSelectedCover}
                onCreateVariation={createVariation}
                onRestoreSuggestedCover={restoreSuggestedCover}
                onApplyCommonBatch={
                  workflowMode === "batch" ? applyMusicToBatch : undefined
                }
                onReplaceAudio={
                  selectedTrack.variantOf
                    ? () => variationAudioInputRef.current?.click()
                    : undefined
                }
              />
            ) : activeStep === "visual" ? (
              <VisualInspector
                layers={selectedTrack.layers}
                lastRemovedLayer={lastRemovedLayer}
                presets={visualPresets}
                scene={selectedScene}
                onAddLayer={() => layerInputRef.current?.click()}
                onAdvanced={updateAdvanced}
                onApplyCoverLayer={addCoverLayerPreset}
                onApplyCoverLayerBatch={
                  workflowMode === "batch"
                    ? applyCoverLayerPresetToBatch
                    : undefined
                }
                onCloudLight={updateCloudLight}
                onColors={updateColors}
                onCommon={updateCommon}
                onDeletePreset={() => void deletePreset()}
                onDuplicatePreset={() => void duplicatePreset()}
                onMoveLayer={moveLayer}
                onPalette={applyPalette}
                onPlayful={updatePlayful}
                onRemoveLayer={removeLayer}
                onSavePreset={() => void savePreset()}
                onUndoLayer={undoRemoveLayer}
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
                outputPreset={outputPreset}
                qualityProfile={qualityProfile}
                scene={selectedScene}
                metadata={selectedTrack.metadata}
                workflowMode={workflowMode}
                onChooseOutput={() => void chooseOutputDirectory()}
                onClearCompleted={() => void clearCompletedJobs("video-render")}
                onExport={() => void exportSelected()}
                onMetadata={updateMetadata}
                onPreset={setOutputPreset}
                onQuality={setQualityProfile}
                onUseDarkAudio={() => selectPreset("audio-dark")}
                onApplyBatch={
                  workflowMode === "batch" ? applyPublicationToBatch : undefined
                }
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
            {(["music", "visual", "text", "export"] as ActiveStep[]).map(
              (step, index) => (
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
                  <span>{index + 1}</span>
                  {stepLabel(step)}
                </button>
              ),
            )}
            <button
              className={visualStageView === "videos" ? "active" : ""}
              type="button"
              onClick={() => setVisualStageView("videos")}
            >
              <Video />
              Conferir vídeos
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
              className={audioStageView === "catalog" ? "active" : ""}
              type="button"
              onClick={() => setAudioStageView("catalog")}
            >
              <Disc3 /> Catálogo
            </button>
            <button
              className={audioStageView === "videos" ? "active" : ""}
              type="button"
              onClick={() => setAudioStageView("videos")}
            >
              <Video /> Vídeos
            </button>
          </nav>
        )}
        <span className="project-state">
          {workspaceMode === "audio"
            ? `${reviewTracks.length} selecionada${reviewTracks.length === 1 ? "" : "s"} · ${treatedTrackCount} tratada${treatedTrackCount === 1 ? "" : "s"} · ${audioWarningCount} alerta${audioWarningCount === 1 ? "" : "s"}`
            : `${selectedOutput[1]} · ${selectedTrack?.layers.length ?? 0}/3 camadas · waveform ${selectedScene.waveform.visible ? "ativa" : "desligada"}`}
        </span>
      </footer>

      {batchFeedback && (
        <p className="operation-feedback" role="status">
          <Check /> {batchFeedback}
        </p>
      )}

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
          if (file) setCover({ file, src: URL.createObjectURL(file) });
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
      {error && (
        <button
          className="error-toast"
          type="button"
          onClick={() => setError("")}
        >
          {error}
          <X />
        </button>
      )}
    </main>
  );
}

function AudioLibraryWorkspace({
  audioBands,
  batchApplyMode,
  batchCommon,
  batchFeedback,
  folderImportProgress,
  jobs,
  onApplyBatchCommon,
  onBatchApplyMode,
  onBatchCommon,
  onCancelAllJobs,
  onCancelJob,
  onClearTerminalJobs,
  onPauseQueue,
  onResumeQueue,
  onSelectTrack,
  onToggleTrack,
  onToggleTracks,
  onTrackMetadata,
  queuePaused,
  selectedTrack,
  selectedTrackId,
  tracks,
  workflowMode,
}: {
  audioBands: AudioBands;
  batchApplyMode: BatchApplyMode;
  batchCommon: BatchCommonDraft;
  batchFeedback: string;
  folderImportProgress: { current: number; total: number; name: string } | null;
  jobs: RenderJob[];
  onApplyBatchCommon: () => void;
  onBatchApplyMode: (mode: BatchApplyMode) => void;
  onBatchCommon: (patch: BatchCommonDraft) => void;
  onCancelAllJobs: () => void;
  onCancelJob: (id: string) => void;
  onClearTerminalJobs: () => void;
  onPauseQueue: () => void;
  onResumeQueue: () => void;
  onSelectTrack: (id: string) => void;
  onToggleTrack: (id: string, selected: boolean) => void;
  onToggleTracks: (ids: string[], selected: boolean) => void;
  onTrackMetadata: (id: string, patch: Partial<TrackMetadata>) => void;
  queuePaused: boolean;
  selectedTrack?: TrackDraft;
  selectedTrackId: string;
  tracks: TrackDraft[];
  workflowMode: "single" | "batch";
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  if (workflowMode === "batch") {
    const selectedCount = tracks.filter(
      (track) => track.selectedForBatch,
    ).length;
    const groups = groupAudioTracks(tracks);
    const toggleGroup = (id: string) =>
      setCollapsedGroups((current) =>
        current.includes(id)
          ? current.filter((groupId) => groupId !== id)
          : [...current, id],
      );
    const toggleRow = (id: string) =>
      setExpandedRows((current) =>
        current.includes(id)
          ? current.filter((trackId) => trackId !== id)
          : [...current, id],
      );
    return (
      <div className="audio-library batch-library">
        <header className="audio-library-heading">
          <div>
            <span className="overline">Biblioteca de áudio</span>
            <h1>Revisão e tratamento do lote</h1>
          </div>
          <strong>{selectedCount} selecionadas</strong>
        </header>
        {folderImportProgress && (
          <div className="batch-progress-note">
            <span>
              Importando {folderImportProgress.current}/
              {folderImportProgress.total || "--"}
            </span>
            <strong>{folderImportProgress.name}</strong>
          </div>
        )}
        <details
          className="batch-toolbar"
          aria-label="Dados comuns do lote"
          open
        >
          <summary className="batch-toolbar-head">
            <div>
              <span className="overline">Dados comuns do lote</span>
              <strong>
                Preencha uma vez e aplique nas linhas selecionadas
              </strong>
            </div>
            <ChevronDown />
          </summary>
          <div className="batch-toolbar-body">
            <div className="batch-apply-mode" aria-label="Modo de aplicação">
              <button
                className={batchApplyMode === "fill-empty" ? "active" : ""}
                type="button"
                onClick={() => onBatchApplyMode("fill-empty")}
              >
                Preencher vazios
              </button>
              <button
                className={batchApplyMode === "overwrite" ? "active" : ""}
                type="button"
                onClick={() => onBatchApplyMode("overwrite")}
              >
                Sobrescrever informados
              </button>
            </div>
            <p className="batch-mode-note">
              {batchApplyMode === "fill-empty"
                ? "Mantém valores já revisados em cada linha e completa somente lacunas."
                : "Substitui os campos preenchidos abaixo nos arquivos selecionados."}
            </p>
            <div className="batch-toolbar-grid">
              <TextField
                label="Artista principal"
                value={batchCommon.artist}
                onChange={(artist) => onBatchCommon({ ...batchCommon, artist })}
              />
              <TextField
                label="Álbum"
                value={batchCommon.album}
                onChange={(album) => onBatchCommon({ ...batchCommon, album })}
              />
              <TextField
                label="Artista do álbum"
                value={batchCommon.albumArtist}
                onChange={(albumArtist) =>
                  onBatchCommon({ ...batchCommon, albumArtist })
                }
              />
              <TextField
                label="Compositor"
                value={batchCommon.composer}
                onChange={(composer) =>
                  onBatchCommon({ ...batchCommon, composer })
                }
              />
              <TextField
                label="Ano"
                value={batchCommon.year}
                onChange={(year) => onBatchCommon({ ...batchCommon, year })}
              />
              <TextField
                label="Copyright"
                value={batchCommon.copyright}
                onChange={(copyright) =>
                  onBatchCommon({ ...batchCommon, copyright })
                }
              />
              <TextField
                label="Gênero"
                value={batchCommon.genre}
                onChange={(genre) => onBatchCommon({ ...batchCommon, genre })}
              />
              <TextArea
                label="Comentário ID3"
                rows={2}
                value={batchCommon.comment}
                onChange={(comment) =>
                  onBatchCommon({ ...batchCommon, comment })
                }
              />
            </div>
            <div className="batch-toolbar-actions">
              <CheckField
                label="Normalizar cópias"
                checked={batchCommon.normalizationEnabled}
                onChange={(normalizationEnabled) =>
                  onBatchCommon({ ...batchCommon, normalizationEnabled })
                }
              />
              <TextField
                label="Total de faixas"
                value={
                  batchCommon.trackTotal ? String(batchCommon.trackTotal) : ""
                }
                onChange={(value) =>
                  onBatchCommon({
                    ...batchCommon,
                    trackTotal: Math.max(0, Number(value) || 0),
                  })
                }
              />
              <button
                className="primary-action"
                disabled={selectedCount === 0}
                type="button"
                onClick={onApplyBatchCommon}
              >
                <Check /> Aplicar aos selecionados
              </button>
            </div>
            {batchFeedback && <p className="batch-feedback">{batchFeedback}</p>}
          </div>
        </details>
        <BatchJobBoard
          jobs={jobs}
          onCancelAll={onCancelAllJobs}
          onCancelJob={onCancelJob}
          onClearTerminal={onClearTerminalJobs}
          onPause={onPauseQueue}
          onResume={onResumeQueue}
          queuePaused={queuePaused}
        />
        <div className="batch-table-wrap">
          <div className="batch-table-toolbar">
            <div>
              <span className="overline">Arquivos revisáveis</span>
              <strong>
                {tracks.length} arquivo{tracks.length === 1 ? "" : "s"} em{" "}
                {groups.length} grupo{groups.length === 1 ? "" : "s"}
              </strong>
            </div>
            <div className="batch-table-actions">
              <button
                type="button"
                onClick={() =>
                  onToggleTracks(
                    tracks.map((track) => track.id),
                    true,
                  )
                }
              >
                <Check /> Selecionar todos
              </button>
              <button
                type="button"
                onClick={() =>
                  onToggleTracks(
                    tracks.map((track) => track.id),
                    false,
                  )
                }
              >
                <X /> Limpar seleção
              </button>
            </div>
          </div>
          <table className="batch-table">
            <thead>
              <tr>
                <th className="batch-col-select"></th>
                <th className="batch-col-expand"></th>
                <th className="batch-col-track">Faixa</th>
                <th className="batch-col-disk">Disco</th>
                <th className="batch-col-title">Título</th>
                <th className="batch-col-artist">Artista</th>
                <th className="batch-col-album">Álbum</th>
                <th className="batch-col-package">Pacote</th>
                <th className="batch-col-lufs">LUFS</th>
                <th className="batch-col-tp">TP</th>
                <th className="batch-col-normalize">Normalizar</th>
              </tr>
            </thead>
            {groups.map((group) => {
              const collapsed = collapsedGroups.includes(group.id);
              return (
                <tbody className="batch-table-group" key={group.id}>
                  <tr className="batch-group-row">
                    <td colSpan={11}>
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
                      >
                        {collapsed ? <ChevronRight /> : <ChevronDown />}
                        <strong>{group.label}</strong>
                        <span>
                          {group.selectedCount}/{group.trackCount} selecionadas
                        </span>
                      </button>
                    </td>
                  </tr>
                  {!collapsed &&
                    group.tracks.map((track) => {
                      const expanded = expandedRows.includes(track.id);
                      return (
                        <Fragment key={track.id}>
                          <tr
                            className={`batch-main-row ${track.id === selectedTrackId ? "selected" : ""} ${expanded ? "is-expanded" : ""}`}
                            onClick={() => onSelectTrack(track.id)}
                          >
                            <td className="batch-col-select">
                              <input
                                aria-label={`Selecionar ${track.metadata.title}`}
                                checked={track.selectedForBatch}
                                type="checkbox"
                                onChange={(event) =>
                                  onToggleTrack(track.id, event.target.checked)
                                }
                                onClick={(event) => event.stopPropagation()}
                              />
                            </td>
                            <td className="batch-col-expand">
                              <button
                                aria-label={
                                  expanded
                                    ? `Recolher detalhes de ${track.metadata.title}`
                                    : `Expandir detalhes de ${track.metadata.title}`
                                }
                                className="batch-row-expand"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onSelectTrack(track.id);
                                  toggleRow(track.id);
                                }}
                              >
                                <ChevronDown className="expand-closed-icon" />
                                <ChevronUp className="expand-open-icon" />
                              </button>
                            </td>
                            <td className="batch-col-track">
                              <input
                                aria-label="Faixa"
                                className="batch-wide-field"
                                value={String(track.metadata.trackNumber)}
                                onChange={(event) =>
                                  onTrackMetadata(track.id, {
                                    trackNumber: Math.max(
                                      1,
                                      Number(event.target.value) || 1,
                                    ),
                                  })
                                }
                              />
                              <span className="batch-compact-value">
                                {track.metadata.trackNumber}
                              </span>
                            </td>
                            <td className="batch-col-disk">
                              <input
                                aria-label="Disco"
                                value={String(track.metadata.diskNumber)}
                                onChange={(event) =>
                                  onTrackMetadata(track.id, {
                                    diskNumber: Math.max(
                                      1,
                                      Number(event.target.value) || 1,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td className="batch-col-title">
                              <input
                                aria-label="Título"
                                className="batch-wide-field"
                                value={track.metadata.title}
                                onChange={(event) =>
                                  onTrackMetadata(track.id, {
                                    title: event.target.value,
                                  })
                                }
                              />
                              <strong className="batch-compact-value">
                                {track.metadata.title || "Título ausente"}
                              </strong>
                            </td>
                            <td className="batch-col-artist">
                              <input
                                aria-label="Artista"
                                value={track.metadata.artist}
                                onChange={(event) =>
                                  onTrackMetadata(track.id, {
                                    artist: event.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="batch-col-album">
                              <input
                                aria-label="Álbum"
                                value={track.metadata.album}
                                onChange={(event) =>
                                  onTrackMetadata(track.id, {
                                    album: event.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="batch-col-package">
                              <span
                                className={`quality-badge ${track.packageStatus ?? "original"}`}
                              >
                                {track.packageStatus === "treated"
                                  ? "Tratado"
                                  : "Original"}
                              </span>
                            </td>
                            <td className="batch-col-lufs">
                              {formatMetric(
                                track.audioInfo?.analysis?.integratedLufs,
                                " LUFS",
                              )}
                            </td>
                            <td className="batch-col-tp">
                              {formatMetric(
                                track.audioInfo?.analysis?.truePeakDbtp,
                                " dBTP",
                              )}
                            </td>
                            <td className="batch-col-normalize">
                              <input
                                aria-label="Normalizar"
                                checked={track.metadata.normalizationEnabled}
                                type="checkbox"
                                onChange={(event) =>
                                  onTrackMetadata(track.id, {
                                    normalizationEnabled: event.target.checked,
                                  })
                                }
                                onClick={(event) => event.stopPropagation()}
                              />
                            </td>
                          </tr>
                          <tr
                            className={`batch-detail-row ${expanded ? "is-expanded" : ""} ${track.id === selectedTrackId ? "is-focused" : ""}`}
                          >
                            <td colSpan={11}>
                              <div className="batch-row-details">
                                <label className="batch-detail-edit batch-detail-track">
                                  <span>Faixa</span>
                                  <input
                                    aria-label="Faixa detalhada"
                                    value={String(track.metadata.trackNumber)}
                                    onChange={(event) =>
                                      onTrackMetadata(track.id, {
                                        trackNumber: Math.max(
                                          1,
                                          Number(event.target.value) || 1,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <label className="batch-detail-edit batch-detail-title">
                                  <span>Título</span>
                                  <input
                                    aria-label="Título detalhado"
                                    value={track.metadata.title}
                                    onChange={(event) =>
                                      onTrackMetadata(track.id, {
                                        title: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <label className="batch-detail-edit batch-detail-disk">
                                  <span>Disco</span>
                                  <input
                                    aria-label="Disco detalhado"
                                    value={String(track.metadata.diskNumber)}
                                    onChange={(event) =>
                                      onTrackMetadata(track.id, {
                                        diskNumber: Math.max(
                                          1,
                                          Number(event.target.value) || 1,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <label className="batch-detail-edit batch-detail-artist">
                                  <span>Artista</span>
                                  <input
                                    aria-label="Artista detalhado"
                                    value={track.metadata.artist}
                                    onChange={(event) =>
                                      onTrackMetadata(track.id, {
                                        artist: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <label className="batch-detail-edit batch-detail-album">
                                  <span>Álbum</span>
                                  <input
                                    aria-label="Álbum detalhado"
                                    value={track.metadata.album}
                                    onChange={(event) =>
                                      onTrackMetadata(track.id, {
                                        album: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <div className="batch-detail-file">
                                  <span>Arquivo tratado</span>
                                  <strong>
                                    {previewTreatedFileName(track.metadata)}
                                  </strong>
                                </div>
                                <div className="batch-detail-metric">
                                  <span>LUFS</span>
                                  <strong>
                                    {formatMetric(
                                      track.audioInfo?.analysis?.integratedLufs,
                                      " LUFS",
                                    )}
                                  </strong>
                                </div>
                                <div className="batch-detail-metric">
                                  <span>TP</span>
                                  <strong>
                                    {formatMetric(
                                      track.audioInfo?.analysis?.truePeakDbtp,
                                      " dBTP",
                                    )}
                                  </strong>
                                </div>
                                <CheckField
                                  label="Normalizar cópia"
                                  checked={track.metadata.normalizationEnabled}
                                  onChange={(normalizationEnabled) =>
                                    onTrackMetadata(track.id, {
                                      normalizationEnabled,
                                    })
                                  }
                                />
                              </div>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                </tbody>
              );
            })}
          </table>
        </div>
      </div>
    );
  }
  const analysis = selectedTrack?.audioInfo?.analysis;
  return (
    <div className="audio-library">
      <header className="audio-library-heading">
        <div>
          <span className="overline">Biblioteca de áudio</span>
          <h1>{selectedTrack?.metadata.title || "Selecione uma faixa"}</h1>
        </div>
        {analysis && (
          <span className={`quality-badge ${analysis.risk}`}>
            {riskLabel(analysis.risk)}
          </span>
        )}
      </header>
      {jobs.some((job) => job.kind === "audio-process") && (
        <BatchJobBoard
          jobs={jobs}
          title="Historico de processamento"
          onCancelAll={onCancelAllJobs}
          onCancelJob={onCancelJob}
          onClearTerminal={onClearTerminalJobs}
          onPause={onPauseQueue}
          onResume={onResumeQueue}
          queuePaused={queuePaused}
        />
      )}
      <section className="audio-stage-section waveform-section">
        <div className="audio-stage-title">
          <div>
            <span className="overline">Forma de onda</span>
            <strong>Preview técnico da faixa</strong>
          </div>
          <small>{selectedTrack?.metadata.artist || "Sem artista"}</small>
        </div>
        <div className="analytic-stage">
          <AnalyticalWaveform samples={audioBands.samples} />
        </div>
      </section>
      <section className="audio-stage-section metrics-section">
        <div className="audio-stage-title">
          <div>
            <span className="overline">Qualidade</span>
            <strong>Leitura técnica antes do tratamento</strong>
          </div>
          {analysis && <small>{riskLabel(analysis.risk)}</small>}
        </div>
        <dl className="metric-strip">
          <Metric
            label="LUFS integrado"
            value={formatMetric(analysis?.integratedLufs, " LUFS")}
          />
          <Metric
            label="True peak"
            value={formatMetric(analysis?.truePeakDbtp, " dBTP")}
          />
          <Metric
            label="Faixa dinamica"
            value={formatMetric(analysis?.loudnessRangeLu, " LU")}
          />
          <Metric
            label="Codec"
            value={selectedTrack?.audioInfo?.codec || "--"}
          />
          <Metric
            label="Duracao"
            value={formatDuration(selectedTrack?.audioInfo?.durationSeconds)}
          />
        </dl>
      </section>
    </div>
  );
}

function AnalyticalWaveform({ samples }: { samples: number[] }) {
  const points = (
    samples.length ? samples : Array.from({ length: 64 }, () => 0)
  )
    .map((sample, index, values) => {
      const x = (index / Math.max(1, values.length - 1)) * 1000;
      const y = 100 - sample * 62;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      className="analytic-waveform"
      viewBox="0 0 1000 200"
      preserveAspectRatio="none"
    >
      <line x1="0" x2="1000" y1="100" y2="100" />
      <polyline points={points} />
    </svg>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function BatchJobBoard({
  jobs,
  title = "Processamento do lote",
  onCancelAll,
  onCancelJob,
  onClearTerminal,
  onPause,
  onResume,
  queuePaused,
}: {
  jobs: RenderJob[];
  title?: string;
  onCancelAll: () => void;
  onCancelJob: (id: string) => void;
  onClearTerminal: () => void;
  onPause: () => void;
  onResume: () => void;
  queuePaused: boolean;
}) {
  const activeJobs = jobs.filter((job) => job.kind === "audio-process");
  const jobCounts = {
    running: activeJobs.filter((job) => job.status === "running").length,
    waiting: activeJobs.filter((job) =>
      ["queued", "paused"].includes(job.status),
    ).length,
    done: activeJobs.filter((job) => job.status === "done").length,
    failed: activeJobs.filter((job) =>
      ["error", "canceled"].includes(job.status),
    ).length,
  };
  return (
    <section className="batch-job-board">
      <header>
        <div>
          <span className="overline">{title}</span>
          <strong>
            {activeJobs.length
              ? `${activeJobs.length} processamento${activeJobs.length === 1 ? "" : "s"} registrado${activeJobs.length === 1 ? "" : "s"}`
              : "Nenhum processamento iniciado"}
          </strong>
        </div>
        <div className="batch-job-actions">
          {jobCounts.done + jobCounts.failed > 0 && (
            <button type="button" onClick={onClearTerminal}>
              <Trash2 /> Limpar concluídos
            </button>
          )}
          <button type="button" onClick={queuePaused ? onResume : onPause}>
            {queuePaused ? <Play /> : <Pause />}
            {queuePaused ? "Retomar fila" : "Pausar fila"}
          </button>
          <button type="button" onClick={onCancelAll}>
            <X /> Cancelar todos
          </button>
        </div>
      </header>
      {activeJobs.length > 0 && (
        <div className="batch-job-summary">
          <span>
            <b>{jobCounts.running}</b> em andamento
          </span>
          <span>
            <b>{jobCounts.waiting}</b> aguardando
          </span>
          <span>
            <b>{jobCounts.done}</b> concluídos
          </span>
          <span>
            <b>{jobCounts.failed}</b> interrompidos
          </span>
        </div>
      )}
      {activeJobs.length === 0 ? (
        <p className="helper-copy">
          Ao processar, cada arquivo aparece aqui com etapa, progresso e
          controle de cancelamento.
        </p>
      ) : (
        <div className="batch-job-list">
          {activeJobs.map((job) => {
            const terminal = ["done", "error", "canceled"].includes(job.status);
            return (
              <div className={`batch-job-row ${job.status}`} key={job.id}>
                <div>
                  <strong>
                    {job.metadata?.title || readableJobMessage(job.message)}
                  </strong>
                  <small>
                    {jobStatusLabel(job.status)} ·{" "}
                    {readableJobMessage(job.message)}
                  </small>
                </div>
                <progress max={100} value={job.progress} />
                <span>{job.progress}%</span>
                {terminal ? (
                  <span className="job-terminal-state">
                    {jobStatusLabel(job.status)}
                  </span>
                ) : (
                  <button type="button" onClick={() => onCancelJob(job.id)}>
                    <X /> Cancelar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AudioLibraryInspector({
  analysis,
  artworkHint,
  cover,
  coverSeriesSettings,
  metadata,
  workflowMode,
  onAnalyze,
  onApplySuggestions,
  onChange,
  onChooseCover,
  onClearCover,
  onCoverSeriesSettings,
  isAnalyzing,
  onProcess,
  onRestoreSuggestedCover,
  onSaveCoverSeriesDefault,
  suggestedCover,
}: {
  analysis?: AudioTechnicalAnalysis;
  artworkHint: string;
  cover: { file: File; src: string } | null;
  coverSeriesSettings: CoverSeriesSettings;
  metadata: TrackMetadata;
  workflowMode: "single" | "batch";
  onAnalyze: () => void;
  onApplySuggestions: () => void;
  onChange: (patch: Partial<TrackMetadata>) => void;
  onChooseCover: () => void;
  onClearCover: () => void;
  onCoverSeriesSettings: (patch: Partial<CoverSeriesSettings>) => void;
  isAnalyzing: boolean;
  onProcess: () => void;
  onRestoreSuggestedCover: () => void;
  onSaveCoverSeriesDefault: () => void;
  suggestedCover?: ArtworkSuggestion;
}) {
  return (
    <>
      <InspectorGroup title="Dados" open>
        <TextField
          label="Título"
          value={metadata.title}
          onChange={(title) => onChange({ title })}
        />
        <TextField
          label="Artista"
          value={metadata.artist}
          onChange={(artist) => onChange({ artist })}
        />
        <TextField
          label="Álbum"
          value={metadata.album}
          onChange={(album) => onChange({ album })}
        />
        <TextField
          label="Artista do álbum"
          value={metadata.albumArtist}
          onChange={(albumArtist) => onChange({ albumArtist })}
        />
        <TextField
          label="Gênero"
          value={metadata.genre}
          onChange={(genre) => onChange({ genre })}
        />
        <TextField
          label="Compositor"
          value={metadata.composer}
          onChange={(composer) => onChange({ composer })}
        />
        <TextArea
          label="Comentário ID3"
          rows={3}
          value={metadata.comment}
          onChange={(comment) => onChange({ comment })}
        />
        <TextField
          label="Ano"
          value={metadata.year}
          onChange={(year) => onChange({ year })}
        />
        <div className="two-columns">
          <TextField
            label="Faixa"
            value={String(metadata.trackNumber)}
            onChange={(value) =>
              onChange({ trackNumber: Math.max(1, Number(value) || 1) })
            }
          />
          <TextField
            label="Total"
            value={String(metadata.trackTotal)}
            onChange={(value) =>
              onChange({ trackTotal: Math.max(1, Number(value) || 1) })
            }
          />
        </div>
        <button
          className="quiet-action"
          type="button"
          onClick={onApplySuggestions}
        >
          Aplicar sugestões do arquivo
        </button>
      </InspectorGroup>
      <InspectorGroup title="Arte">
        {cover ? (
          <div className="cover-preview">
            <img alt="" src={cover.src} />
            <div>
              <small>{cover.file.name}</small>
              <button type="button" onClick={onClearCover}>
                <Trash2 /> Remover
              </button>
            </div>
          </div>
        ) : (
          <button
            className="upload-action"
            type="button"
            onClick={onChooseCover}
          >
            <Image /> Escolher arte
          </button>
        )}
        {suggestedCover && (
          <p className="helper-copy">
            Arte oferecida pela pasta: {suggestedCover.relativePath}
          </p>
        )}
        {suggestedCover && cover?.file !== suggestedCover.file && (
          <button
            className="quiet-action"
            type="button"
            onClick={onRestoreSuggestedCover}
          >
            <RotateCcw /> Usar arte oferecida
          </button>
        )}
        {!suggestedCover && <p className="helper-copy">{artworkHint}</p>}
        <div className="inspector-subsection">
          <p className="inspector-kicker">Série visual</p>
          <CheckField
            label="Gerar série numerada na capa tratada"
            checked={coverSeriesSettings.enabled}
            onChange={(enabled) => onCoverSeriesSettings({ enabled })}
          />
          {coverSeriesSettings.enabled && (
            <>
              <p className="inspector-kicker cover-series-kicker">
                Numeração principal
              </p>
              <SelectField
                label="Sequência"
                value={coverSeriesSettings.style}
                onChange={(value) =>
                  onCoverSeriesSettings({
                    style:
                      value === "custom" || value === "arabic"
                        ? value
                        : "roman",
                  })
                }
              >
                <option value="roman">Romana · I, II, III</option>
                <option value="arabic">Arábica · 1, 2, 3</option>
                <option value="custom">Personalizada</option>
              </SelectField>
              {coverSeriesSettings.style === "custom" && (
                <TextArea
                  label="Itens personalizados"
                  rows={3}
                  value={coverSeriesSettings.sequence}
                  onChange={(sequence) => onCoverSeriesSettings({ sequence })}
                />
              )}
              <div className="two-columns">
                <RangeField
                  label="Tamanho"
                  max={180}
                  min={32}
                  value={coverSeriesSettings.fontSize}
                  onChange={(fontSize) => onCoverSeriesSettings({ fontSize })}
                />
                <ColorInput
                  label="Cor"
                  value={coverSeriesSettings.color}
                  onChange={(color) => onCoverSeriesSettings({ color })}
                />
              </div>
              <RangeField
                label="Opacidade"
                value={coverSeriesSettings.opacity}
                onChange={(opacity) => onCoverSeriesSettings({ opacity })}
              />
              <div className="two-columns">
                <RangeField
                  label="Horizontal"
                  value={coverSeriesSettings.x}
                  onChange={(x) => onCoverSeriesSettings({ x })}
                />
                <RangeField
                  label="Vertical"
                  value={coverSeriesSettings.y}
                  onChange={(y) => onCoverSeriesSettings({ y })}
                />
              </div>
              <RangeField
                label="Espaçamento"
                max={48}
                unit="px"
                value={coverSeriesSettings.letterSpacing}
                onChange={(letterSpacing) =>
                  onCoverSeriesSettings({ letterSpacing })
                }
              />
              <div className="cover-series-meta">
                <p className="inspector-kicker">Textos complementares</p>
                <p className="helper-copy">
                  Ajuste cada tipo separadamente. A ordem é aplicada de cima
                  para baixo.
                </p>
                <TextField
                  label="Ordem dos campos"
                  value={coverSeriesSettings.metaOrder}
                  onChange={(metaOrder) => onCoverSeriesSettings({ metaOrder })}
                />
                <RangeField
                  label="Espaço entre linhas"
                  max={48}
                  unit="px"
                  value={coverSeriesSettings.metaGap}
                  onChange={(metaGap) => onCoverSeriesSettings({ metaGap })}
                />
                <CoverSeriesMetaControls
                  enabled={coverSeriesSettings.includeTitle}
                  label="Nome da música"
                  onEnabled={(includeTitle) =>
                    onCoverSeriesSettings({ includeTitle })
                  }
                  onStyle={(patch) =>
                    onCoverSeriesSettings({
                      metaStyles: {
                        ...coverSeriesSettings.metaStyles,
                        title: {
                          ...coverSeriesSettings.metaStyles.title,
                          ...patch,
                        },
                      },
                    })
                  }
                  style={coverSeriesSettings.metaStyles.title}
                />
                <CoverSeriesMetaControls
                  enabled={coverSeriesSettings.includeAlbum}
                  label="Nome do álbum"
                  onEnabled={(includeAlbum) =>
                    onCoverSeriesSettings({ includeAlbum })
                  }
                  onStyle={(patch) =>
                    onCoverSeriesSettings({
                      metaStyles: {
                        ...coverSeriesSettings.metaStyles,
                        album: {
                          ...coverSeriesSettings.metaStyles.album,
                          ...patch,
                        },
                      },
                    })
                  }
                  style={coverSeriesSettings.metaStyles.album}
                />
                <CoverSeriesMetaControls
                  enabled={coverSeriesSettings.includeArtist}
                  label="Autor"
                  onEnabled={(includeArtist) =>
                    onCoverSeriesSettings({ includeArtist })
                  }
                  onStyle={(patch) =>
                    onCoverSeriesSettings({
                      metaStyles: {
                        ...coverSeriesSettings.metaStyles,
                        artist: {
                          ...coverSeriesSettings.metaStyles.artist,
                          ...patch,
                        },
                      },
                    })
                  }
                  style={coverSeriesSettings.metaStyles.artist}
                />
                <CoverSeriesMetaControls
                  enabled={coverSeriesSettings.includeYear}
                  label="Ano"
                  onEnabled={(includeYear) =>
                    onCoverSeriesSettings({ includeYear })
                  }
                  onStyle={(patch) =>
                    onCoverSeriesSettings({
                      metaStyles: {
                        ...coverSeriesSettings.metaStyles,
                        year: {
                          ...coverSeriesSettings.metaStyles.year,
                          ...patch,
                        },
                      },
                    })
                  }
                  style={coverSeriesSettings.metaStyles.year}
                />
              </div>
              <button
                className="quiet-action"
                type="button"
                onClick={onSaveCoverSeriesDefault}
              >
                <Save /> Salvar como padrão
              </button>
            </>
          )}
        </div>
      </InspectorGroup>
      <InspectorGroup title="Letra">
        <TextArea
          label="Letra manual sem sincronizacao"
          value={metadata.lyrics}
          onChange={(lyrics) => onChange({ lyrics })}
        />
        <TextField
          label="Idioma ID3"
          value={metadata.lyricsLanguage}
          onChange={(lyricsLanguage) => onChange({ lyricsLanguage })}
        />
      </InspectorGroup>
      <InspectorGroup title="Qualidade" open>
        {analysis ? (
          <p className={`quality-callout ${analysis.risk}`}>
            {riskDescription(analysis)}
          </p>
        ) : (
          <p className="helper-copy">
            Analise a faixa para medir loudness e margem de pico.
          </p>
        )}
        <CheckField
          label="Normalizar cópia tratada para -14 LUFS / -1 dBTP"
          checked={metadata.normalizationEnabled}
          onChange={(normalizationEnabled) =>
            onChange({ normalizationEnabled })
          }
        />
        <button
          className="quiet-action"
          disabled={isAnalyzing}
          type="button"
          onClick={onAnalyze}
        >
          <SlidersHorizontal />{" "}
          {isAnalyzing ? "Analisando qualidade..." : "Analisar qualidade"}
        </button>
        <button
          className="primary-action wide"
          type="button"
          onClick={onProcess}
        >
          <Check />{" "}
          {workflowMode === "batch"
            ? "Processar selecionados"
            : "Processar cópia"}
        </button>
      </InspectorGroup>
    </>
  );
}

function ScenePreview({
  audioBandsRef,
  coverSrc,
  layers,
  metadata,
  scene,
  showMetadata,
  textSettings,
}: {
  audioBandsRef: React.MutableRefObject<AudioBands>;
  coverSrc?: string;
  layers: MediaLayerV2[];
  metadata: TrackMetadata;
  scene: ScenePresetV3;
  showMetadata: boolean;
  textSettings: TextOverlaySettings;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<ReturnType<typeof createSceneRuntime> | undefined>(
    undefined,
  );
  const sceneRef = useRef(scene);
  const compositionRef = useRef<SceneComposition>({});

  useEffect(() => {
    sceneRef.current = scene;
    runtimeRef.current?.setScene(scene);
  }, [scene]);

  useEffect(() => {
    let active = true;
    void loadMediaElements({
      coverSrc,
      layers: layers.map((layer) => ({ ...layer, src: layer.src })),
      metadata,
      showMetadata,
      textSettings,
    }).then((composition) => {
      if (!active) return;
      compositionRef.current = composition;
      runtimeRef.current?.setComposition(composition);
    });
    return () => {
      active = false;
    };
  }, [coverSrc, layers, metadata, showMetadata, textSettings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const runtime = createSceneRuntime(
      canvas,
      sceneRef.current,
      compositionRef.current,
    );
    runtimeRef.current = runtime;
    let frame = 0;
    const started = performance.now();
    const draw = () => {
      const scale = Math.min(1.5, window.devicePixelRatio || 1);
      runtime.resize(canvas.clientWidth * scale, canvas.clientHeight * scale);
      runtime.setAudio(audioBandsRef.current);
      runtime.render((performance.now() - started) / 1000);
      frame = window.requestAnimationFrame(draw);
    };
    draw();
    return () => {
      window.cancelAnimationFrame(frame);
      runtime.destroy();
    };
  }, [audioBandsRef]);

  return <canvas className="scene-canvas" ref={canvasRef} />;
}

function CatalogPreview({
  coverForTrack,
  coverSeriesSettings,
  onChooseCover,
  onRestoreSuggestedCover,
  onSelectTrack,
  tracks,
}: {
  coverForTrack: (track?: TrackDraft) => { file: File; src: string } | null;
  coverSeriesSettings: CoverSeriesSettings;
  onChooseCover: (trackId: string) => void;
  onRestoreSuggestedCover: (trackId?: string) => void;
  onSelectTrack: (trackId: string) => void;
  tracks: TrackDraft[];
}) {
  const [artworkTrackId, setArtworkTrackId] = useState("");
  const [showSeries, setShowSeries] = useState(true);
  const albums = groupCatalogTracks(tracks);
  const artworkTrack = tracks.find((track) => track.id === artworkTrackId);

  function inspectArtwork(track: TrackDraft) {
    onSelectTrack(track.id);
    setArtworkTrackId(track.id);
    setShowSeries(true);
  }

  return (
    <div className="review-stage catalog-review">
      <header className="review-stage-header">
        <div>
          <span className="overline">Conferência musical</span>
          <h1>Catálogo planejado</h1>
          <p>Visualize as tags como uma página de álbum antes do tratamento.</p>
        </div>
        <strong>
          {tracks.length} faixa{tracks.length === 1 ? "" : "s"}
        </strong>
      </header>
      <div className="catalog-scroll">
        {albums.length ? (
          albums.map((album) => {
            const leadTrack = album.tracks[0];
            const artwork = coverForTrack(leadTrack)?.src;
            return (
              <section className="catalog-album" key={album.id}>
                <header className="catalog-album-header">
                  <CatalogArtworkButton
                    artworkSrc={artwork}
                    coverSeriesSettings={coverSeriesSettings}
                    onClick={() => inspectArtwork(leadTrack)}
                    track={leadTrack}
                  />
                  <div>
                    <span className="overline">Álbum</span>
                    <h2>{album.album || "Álbum não informado"}</h2>
                    <p>{album.artist || "Artista não informado"}</p>
                    <small>
                      {[
                        album.year || "Ano ausente",
                        album.genre || "Gênero ausente",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {" · "}
                      {album.tracks.length} faixa
                      {album.tracks.length === 1 ? "" : "s"}
                    </small>
                  </div>
                </header>
                <div className="catalog-track-list">
                  {album.tracks.map((track) => (
                    <button
                      className="catalog-track"
                      key={track.id}
                      type="button"
                      onClick={() => onSelectTrack(track.id)}
                    >
                      <span className="catalog-track-number">
                        {track.metadata.diskNumber > 1
                          ? `${track.metadata.diskNumber}.`
                          : ""}
                        {track.metadata.trackNumber || "–"}
                      </span>
                      <span>
                        <strong>
                          {track.metadata.title || "Título ausente"}
                        </strong>
                        <small>
                          {track.metadata.version ||
                            (track.packageStatus === "treated"
                              ? "Cópia tratada"
                              : "Arquivo original")}
                        </small>
                      </span>
                      <span className="catalog-track-duration">
                        {formatDuration(track.audioInfo?.durationSeconds)}
                      </span>
                      <em>
                        {track.packageStatus === "treated"
                          ? "Tratado"
                          : "Original"}
                      </em>
                    </button>
                  ))}
                </div>
              </section>
            );
          })
        ) : (
          <EmptyReviewState />
        )}
      </div>
      {artworkTrack && (
        <div
          className="catalog-artwork-overlay"
          role="presentation"
          onMouseDown={() => setArtworkTrackId("")}
        >
          <section
            aria-labelledby="catalog-artwork-title"
            aria-modal="true"
            className="catalog-artwork-dialog"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="overline">Prévia da capa tratada</span>
                <h2 id="catalog-artwork-title">
                  {artworkTrack.metadata.title || "Faixa sem título"}
                </h2>
              </div>
              <button
                aria-label="Fechar inspeção da capa"
                className="icon-button"
                type="button"
                onClick={() => setArtworkTrackId("")}
              >
                <X />
              </button>
            </header>
            <div className="catalog-artwork-dialog-layout">
              <CoverSeriesArtwork
                artworkSrc={coverForTrack(artworkTrack)?.src}
                className="catalog-artwork-expanded"
                coverSeriesSettings={coverSeriesSettings}
                showSeries={showSeries}
                track={artworkTrack}
              />
              <aside>
                <div>
                  <span className="overline">Série visual</span>
                  <strong>
                    {coverSeriesSettings.enabled
                      ? "Prévia ao vivo ativa"
                      : "Série visual desativada"}
                  </strong>
                  <p>
                    A capa tratada usa os mesmos ajustes exibidos aqui. Altere
                    os controles no inspetor para conferir o resultado na hora.
                  </p>
                </div>
                <div className="catalog-artwork-actions">
                  <button
                    className="upload-action"
                    type="button"
                    onClick={() => onChooseCover(artworkTrack.id)}
                  >
                    <Image /> Trocar imagem
                  </button>
                  {artworkTrack.suggestedCover && (
                    <button
                      className="quiet-action"
                      type="button"
                      onClick={() => onRestoreSuggestedCover(artworkTrack.id)}
                    >
                      <RotateCcw /> Usar arte oferecida
                    </button>
                  )}
                  <button
                    className="quiet-action"
                    type="button"
                    onClick={() => setShowSeries((current) => !current)}
                  >
                    {showSeries ? <EyeOff /> : <Eye />}
                    {showSeries ? "Ver arte base" : "Ver com série visual"}
                  </button>
                </div>
                <div className="catalog-artwork-series-list">
                  <span className="overline">Capas da série</span>
                  {tracks.map((track) => (
                    <button
                      className={track.id === artworkTrack.id ? "active" : ""}
                      key={track.id}
                      type="button"
                      onClick={() => {
                        onSelectTrack(track.id);
                        setArtworkTrackId(track.id);
                      }}
                    >
                      <strong>
                        {coverSeriesPreviewLabel(track, coverSeriesSettings) ||
                          track.metadata.trackNumber ||
                          "–"}
                      </strong>
                      <span>{track.metadata.title || "Faixa sem título"}</span>
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function CatalogArtworkButton({
  artworkSrc,
  coverSeriesSettings,
  onClick,
  track,
}: {
  artworkSrc?: string;
  coverSeriesSettings: CoverSeriesSettings;
  onClick: () => void;
  track: TrackDraft;
}) {
  return (
    <button
      aria-label={`Inspecionar arte de ${track.metadata.album || track.metadata.title || "álbum"}`}
      className="catalog-artwork-button"
      type="button"
      onClick={onClick}
    >
      <span aria-hidden="true" className="catalog-artwork-vinyl" />
      <ArtworkSquare
        artworkSrc={artworkSrc}
        coverSeriesSettings={coverSeriesSettings}
        track={track}
      />
      <span className="catalog-artwork-edit">
        <Maximize2 /> Conferir
      </span>
    </button>
  );
}

function VideoReviewGrid({
  coverForTrack,
  selectedTrackId,
  onEditVisual,
  onSelectTrack,
  onThumbnailMode,
  outputLabel,
  showMetadata,
  tracks,
}: {
  coverForTrack: (track?: TrackDraft) => { file: File; src: string } | null;
  selectedTrackId: string;
  onEditVisual: (trackId: string) => void;
  onSelectTrack: (trackId: string) => void;
  onThumbnailMode: (
    trackId: string,
    mode: TrackDraft["thumbnailPreviewMode"],
  ) => void;
  outputLabel: string;
  showMetadata: boolean;
  tracks: TrackDraft[];
}) {
  return (
    <div className="review-stage video-review">
      <header className="review-stage-header">
        <div>
          <span className="overline">Conferência de vídeos</span>
          <h1>Grade de publicação</h1>
          <p>Confira títulos, capas e frames antes de exportar.</p>
        </div>
        <strong>
          {tracks.length} vídeo{tracks.length === 1 ? "" : "s"}
        </strong>
      </header>
      {tracks.length ? (
        <div className="youtube-grid">
          {tracks.map((track) => {
            const coverSrc = coverForTrack(track)?.src;
            const selected = track.id === selectedTrackId;
            return (
              <article
                className={`youtube-card ${selected ? "selected" : ""}`}
                key={track.id}
              >
                <button
                  className="youtube-thumbnail"
                  type="button"
                  onClick={() => onSelectTrack(track.id)}
                >
                  {track.thumbnailPreviewMode === "composition" ? (
                    <CompositionThumbnail
                      coverSrc={coverSrc}
                      fingerprint={thumbnailFingerprint(
                        track,
                        coverSrc,
                        showMetadata,
                      )}
                      layers={track.layers}
                      metadata={track.metadata}
                      scene={track.scene}
                      showMetadata={showMetadata}
                      textSettings={track.textSettings}
                    />
                  ) : (
                    <ArtworkFrame artworkSrc={coverSrc} />
                  )}
                  <span className="youtube-duration">
                    {formatDuration(track.audioInfo?.durationSeconds)}
                  </span>
                </button>
                <div className="youtube-card-copy">
                  <strong>
                    {track.metadata.title || "Título não informado"}
                  </strong>
                  <span>
                    {track.metadata.artist || "Artista não informado"}
                  </span>
                  <small>
                    {outputLabel} ·{" "}
                    {track.metadata.visibility === "public"
                      ? "Público"
                      : track.metadata.visibility === "private"
                        ? "Privado"
                        : "Não listado"}
                  </small>
                </div>
                <div
                  className="thumbnail-mode-switch"
                  role="group"
                  aria-label={`Miniatura de ${track.metadata.title}`}
                >
                  <button
                    className={
                      track.thumbnailPreviewMode === "composition"
                        ? "active"
                        : ""
                    }
                    type="button"
                    onClick={() => onThumbnailMode(track.id, "composition")}
                  >
                    Frame
                  </button>
                  <button
                    className={
                      track.thumbnailPreviewMode === "cover" ? "active" : ""
                    }
                    type="button"
                    onClick={() => onThumbnailMode(track.id, "cover")}
                  >
                    Capa
                  </button>
                </div>
                {selected && (
                  <div className="video-card-options">
                    <button
                      aria-label="Usar frame da composição"
                      className="quiet-action"
                      type="button"
                      onClick={() => onThumbnailMode(track.id, "composition")}
                    >
                      <Video />
                      <span>
                        <strong>Frame</strong>
                        <small>Composição</small>
                      </span>
                    </button>
                    <button
                      aria-label="Usar capa"
                      className="quiet-action"
                      type="button"
                      onClick={() => onThumbnailMode(track.id, "cover")}
                    >
                      <Image />
                      <span>
                        <strong>Capa</strong>
                        <small>Arte da faixa</small>
                      </span>
                    </button>
                    <button
                      aria-label="Ajustar visual"
                      className="primary-action"
                      type="button"
                      onClick={() => onEditVisual(track.id)}
                    >
                      <SlidersHorizontal />
                      <span>
                        <strong>Configurar frame</strong>
                        <small>Abrir Estúdio visual</small>
                      </span>
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyReviewState />
      )}
    </div>
  );
}

function CompositionThumbnail({
  coverSrc,
  fingerprint,
  layers,
  metadata,
  scene,
  showMetadata,
  textSettings,
}: {
  coverSrc?: string;
  fingerprint: string;
  layers: MediaLayerV2[];
  metadata: TrackMetadata;
  scene: ScenePresetV3;
  showMetadata: boolean;
  textSettings: TextOverlaySettings;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [previewSrc, setPreviewSrc] = useState(
    () => compositionThumbnailCache.get(fingerprint) ?? "",
  );

  useEffect(() => {
    let active = true;
    let runtime: ReturnType<typeof createSceneRuntime> | undefined;
    const cached = compositionThumbnailCache.get(fingerprint);
    setFailed(false);
    if (cached) {
      setPreviewSrc(cached);
      return;
    }
    setPreviewSrc("");
    const timeout = window.setTimeout(() => {
      void loadMediaElements({
        coverSrc,
        layers: layers.map((layer) => ({ ...layer, src: layer.src })),
        metadata,
        showMetadata,
        textSettings,
      })
        .then((composition) => {
          const canvas = canvasRef.current;
          if (!active || !canvas) return;
          runtime = createSceneRuntime(canvas, scene, composition);
          runtime.resize(320, 180);
          runtime.render(7.5);
          const nextPreview = canvas.toDataURL("image/jpeg", 0.82);
          compositionThumbnailCache.set(fingerprint, nextPreview);
          if (
            compositionThumbnailCache.size > COMPOSITION_THUMBNAIL_CACHE_LIMIT
          ) {
            compositionThumbnailCache.delete(
              compositionThumbnailCache.keys().next().value ?? "",
            );
          }
          setPreviewSrc(nextPreview);
          runtime.destroy();
          runtime = undefined;
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    }, 140);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      runtime?.destroy();
    };
  }, [
    coverSrc,
    fingerprint,
    layers,
    metadata,
    scene,
    showMetadata,
    textSettings,
  ]);

  if (failed) return <ArtworkFrame artworkSrc={coverSrc} />;
  if (previewSrc) {
    return <img alt="" className="composition-thumbnail" src={previewSrc} />;
  }
  return (
    <span className="composition-thumbnail composition-thumbnail-loading">
      {coverSrc ? <img alt="" src={coverSrc} /> : <Video />}
      <span>
        <Loader2 />
        Gerando frame
      </span>
      <canvas aria-hidden="true" height="180" ref={canvasRef} width="320" />
    </span>
  );
}

function ArtworkSquare({
  artworkSrc,
  coverSeriesSettings,
  track,
}: {
  artworkSrc?: string;
  coverSeriesSettings?: CoverSeriesSettings;
  track?: TrackDraft;
}) {
  return (
    <CoverSeriesArtwork
      artworkSrc={artworkSrc}
      className="artwork-square"
      coverSeriesSettings={coverSeriesSettings}
      track={track}
    />
  );
}

function CoverSeriesArtwork({
  artworkSrc,
  className,
  coverSeriesSettings,
  showSeries = true,
  track,
}: {
  artworkSrc?: string;
  className: string;
  coverSeriesSettings?: CoverSeriesSettings;
  showSeries?: boolean;
  track?: TrackDraft;
}) {
  return (
    <span className={`cover-series-artwork ${className}`}>
      {artworkSrc ? <img alt="" src={artworkSrc} /> : <Disc3 />}
      {showSeries && track && coverSeriesSettings?.enabled && (
        <CoverSeriesOverlay settings={coverSeriesSettings} track={track} />
      )}
    </span>
  );
}

function CoverSeriesOverlay({
  settings,
  track,
}: {
  settings: CoverSeriesSettings;
  track: TrackDraft;
}) {
  const lines = coverSeriesPreviewLines(track, settings);
  let lineY = coverSeriesAxis(settings.y, 8, 94) + settings.fontSize * 0.48;
  return (
    <svg
      aria-hidden="true"
      className="cover-series-overlay"
      viewBox="0 0 1600 1600"
    >
      <text
        dominantBaseline="auto"
        fill={settings.color}
        fillOpacity={settings.opacity / 100}
        fontFamily="Georgia, Times New Roman, serif"
        fontSize={settings.fontSize}
        fontWeight="400"
        letterSpacing={settings.letterSpacing}
        textAnchor="middle"
        x={coverSeriesAxis(settings.x, 8, 92)}
        y={coverSeriesAxis(settings.y, 8, 94)}
      >
        {coverSeriesPreviewLabel(track, settings)}
      </text>
      {lines.map((line) => {
        const y = lineY + line.style.offsetY;
        lineY += line.style.fontSize + settings.metaGap;
        return (
          <text
            fill={line.style.color}
            fillOpacity={line.style.opacity / 100}
            fontFamily="Inter, Arial, sans-serif"
            fontSize={line.style.fontSize}
            fontWeight="520"
            key={line.key}
            letterSpacing="5"
            textAnchor="middle"
            x={coverSeriesAxis(settings.x, 8, 92) + line.style.offsetX}
            y={y}
          >
            {line.text}
          </text>
        );
      })}
    </svg>
  );
}

function ArtworkFrame({ artworkSrc }: { artworkSrc?: string }) {
  return (
    <span className="artwork-frame">
      {artworkSrc ? <img alt="" src={artworkSrc} /> : <Disc3 />}
    </span>
  );
}

function coverSeriesPreviewLabel(
  track: TrackDraft,
  settings: CoverSeriesSettings,
) {
  if (settings.style === "arabic") {
    return String(track.metadata.trackNumber || 1);
  }
  if (settings.style === "roman") {
    return romanNumeral(track.metadata.trackNumber || 1);
  }
  const entries = settings.sequence
    .split(/[\n,;|]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return (
    entries[Math.max(0, Number(track.metadata.trackNumber || 1) - 1)] ??
    entries[0] ??
    ""
  );
}

function coverSeriesPreviewLines(
  track: TrackDraft,
  settings: CoverSeriesSettings,
) {
  const metadata: Record<CoverSeriesMetaKey, string> = {
    title: track.metadata.title,
    album: track.metadata.album,
    artist: track.metadata.albumArtist || track.metadata.artist,
    year: track.metadata.year,
  };
  const visibility: Record<CoverSeriesMetaKey, boolean> = {
    title: settings.includeTitle,
    album: settings.includeAlbum,
    artist: settings.includeArtist,
    year: settings.includeYear,
  };
  return coverSeriesMetaOrder(settings.metaOrder)
    .filter((key) => visibility[key] && metadata[key])
    .map((key) => ({
      key,
      text: metadata[key],
      style: settings.metaStyles[key],
    }));
}

function coverSeriesMetaOrder(value: string): CoverSeriesMetaKey[] {
  const allowed = new Set<CoverSeriesMetaKey>([
    "title",
    "album",
    "artist",
    "year",
  ]);
  const parsed = String(value ?? "")
    .split(/[\n,;|]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is CoverSeriesMetaKey =>
      allowed.has(entry as CoverSeriesMetaKey),
    );
  return [
    ...new Set<CoverSeriesMetaKey>([
      ...parsed,
      "title",
      "album",
      "artist",
      "year",
    ]),
  ];
}

function coverSeriesAxis(value: number, min: number, max: number) {
  return (Math.max(min, Math.min(max, Number(value) || min)) / 100) * 1600;
}

function romanNumeral(value: number) {
  let remaining = Math.max(0, Math.floor(Number(value) || 0));
  const pairs: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let output = "";
  for (const [number, numeral] of pairs) {
    while (remaining >= number) {
      output += numeral;
      remaining -= number;
    }
  }
  return output;
}

function EmptyReviewState() {
  return (
    <div className="empty-review-state">
      <Disc3 />
      <strong>Nenhuma faixa no escopo atual</strong>
      <span>
        Selecione arquivos no lote ou escolha uma faixa na biblioteca.
      </span>
    </div>
  );
}

function Transport({
  audioRef,
  audioSrc,
  artworkLabel,
  artworkSrc,
  canNext,
  canPrevious,
  canToggleArtwork,
  trackArtist,
  trackCount,
  trackIndex,
  trackTitle,
  onEditArtwork,
  onEditVisual,
  onNext,
  onPrevious,
  onToggleArtwork,
  onToggle,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioSrc: string;
  artworkLabel: string;
  artworkSrc: string;
  canNext: boolean;
  canPrevious: boolean;
  canToggleArtwork: boolean;
  trackArtist: string;
  trackCount: number;
  trackIndex: number;
  trackTitle: string;
  onEditArtwork: () => void;
  onEditVisual: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleArtwork: () => void;
  onToggle: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const sync = () => setTime(audio.currentTime);
    const metadata = () => setDuration(audio.duration || 0);
    const play = () => setPlaying(true);
    const pause = () => setPlaying(false);
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("loadedmetadata", metadata);
    audio.addEventListener("play", play);
    audio.addEventListener("pause", pause);
    return () => {
      audio.removeEventListener("timeupdate", sync);
      audio.removeEventListener("loadedmetadata", metadata);
      audio.removeEventListener("play", play);
      audio.removeEventListener("pause", pause);
    };
  }, [audioRef, audioSrc]);

  return (
    <div className="transport">
      <div className="transport-controls" aria-label="Navegacao da faixa">
        <IconButton
          disabled={!canPrevious}
          label="Faixa anterior"
          onClick={onPrevious}
        >
          <SkipBack />
        </IconButton>
        <IconButton
          label={playing ? "Pausar prévia" : "Tocar prévia"}
          onClick={onToggle}
        >
          {playing ? <Pause /> : <Play />}
        </IconButton>
        <IconButton disabled={!canNext} label="Proxima faixa" onClick={onNext}>
          <SkipForward />
        </IconButton>
      </div>
      <div className="transport-artwork">
        <button
          aria-label={
            canToggleArtwork
              ? artworkLabel === "Planejada"
                ? "Mostrar capa embutida"
                : "Mostrar capa planejada"
              : "Capa da faixa"
          }
          className="transport-artwork-button"
          disabled={!canToggleArtwork}
          title={
            canToggleArtwork
              ? artworkLabel === "Planejada"
                ? "Mostrar capa embutida"
                : "Mostrar capa planejada"
              : artworkLabel || "Sem capa"
          }
          type="button"
          onClick={onToggleArtwork}
        >
          {artworkSrc ? <img alt="" src={artworkSrc} /> : <Music2 />}
        </button>
        {artworkLabel && <small>{artworkLabel}</small>}
        <div className="transport-artwork-popover">
          <div className="transport-artwork-preview">
            {artworkSrc ? <img alt="" src={artworkSrc} /> : <Music2 />}
          </div>
          <strong>{trackTitle || "Nenhuma faixa selecionada"}</strong>
          <span>Prévia ampliada da arte atual</span>
          <div className="transport-artwork-actions">
            <button type="button" onClick={onEditArtwork}>
              <Image /> Ajustar capa
            </button>
            <button type="button" onClick={onEditVisual}>
              <SlidersHorizontal /> Visual
            </button>
          </div>
        </div>
      </div>
      <div className="transport-track">
        <strong>{trackTitle || "Nenhuma faixa selecionada"}</strong>
        <small>
          {trackArtist || "Sem artista"}
          {trackCount > 0 && ` · ${Math.max(0, trackIndex) + 1}/${trackCount}`}
        </small>
      </div>
      <strong className="transport-time">{formatDuration(time)}</strong>
      <input
        aria-label="Posição da prévia"
        max={duration || 0}
        min="0"
        step="0.1"
        type="range"
        value={time}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (audioRef.current) audioRef.current.currentTime = next;
          setTime(next);
        }}
      />
      <span className="transport-time">{formatDuration(duration)}</span>
    </div>
  );
}

function CoverSeriesMetaControls({
  enabled,
  label,
  onEnabled,
  onStyle,
  style,
}: {
  enabled: boolean;
  label: string;
  onEnabled: (enabled: boolean) => void;
  onStyle: (patch: Partial<CoverSeriesMetaStyle>) => void;
  style: CoverSeriesMetaStyle;
}) {
  return (
    <details className="cover-series-meta-field" open={enabled}>
      <summary>
        <span>{label}</span>
        <small>{enabled ? "Ativo" : "Oculto"}</small>
      </summary>
      <div>
        <CheckField
          checked={enabled}
          label={`Exibir ${label.toLowerCase()}`}
          onChange={onEnabled}
        />
        {enabled && (
          <>
            <div className="two-columns">
              <RangeField
                label="Tamanho"
                max={72}
                min={18}
                unit="px"
                value={style.fontSize}
                onChange={(fontSize) => onStyle({ fontSize })}
              />
              <ColorInput
                label="Cor"
                value={style.color}
                onChange={(color) => onStyle({ color })}
              />
            </div>
            <RangeField
              label="Opacidade"
              value={style.opacity}
              onChange={(opacity) => onStyle({ opacity })}
            />
            <div className="two-columns">
              <RangeField
                label="Deslocamento X"
                max={160}
                min={-160}
                unit="px"
                value={style.offsetX}
                onChange={(offsetX) => onStyle({ offsetX })}
              />
              <RangeField
                label="Deslocamento Y"
                max={160}
                min={-160}
                unit="px"
                value={style.offsetY}
                onChange={(offsetY) => onStyle({ offsetY })}
              />
            </div>
          </>
        )}
      </div>
    </details>
  );
}

function MusicInspector({
  artworkHint,
  cover,
  metadata,
  onApplySuggestions,
  onApplyCommonBatch,
  onChange,
  onChooseCover,
  onClearCover,
  onCreateVariation,
  onReplaceAudio,
  onRestoreSuggestedCover,
  suggestedCover,
}: {
  artworkHint: string;
  cover: { file: File; src: string } | null;
  metadata: TrackMetadata;
  onApplyCommonBatch?: () => void;
  onApplySuggestions: () => void;
  onChange: (patch: Partial<TrackMetadata>) => void;
  onChooseCover: () => void;
  onClearCover: () => void;
  onCreateVariation: () => void;
  onReplaceAudio?: () => void;
  onRestoreSuggestedCover: () => void;
  suggestedCover?: ArtworkSuggestion;
}) {
  return (
    <>
      <InspectorGroup title="Faixa" open>
        <TextField
          label="Título"
          value={metadata.title}
          onChange={(title) => onChange({ title })}
        />
        <TextField
          label="Artista"
          value={metadata.artist}
          onChange={(artist) => onChange({ artist })}
        />
        <TextField
          label="Álbum"
          value={metadata.album}
          onChange={(album) => onChange({ album })}
        />
        <TextField
          label="Versão"
          value={metadata.version}
          onChange={(version) => onChange({ version })}
        />
        <div className="inline-actions">
          <button type="button" onClick={onApplySuggestions}>
            <RotateCcw /> Usar dados do áudio
          </button>
          <button type="button" onClick={onCreateVariation}>
            <Copy /> Criar variação
          </button>
        </div>
        {onReplaceAudio && (
          <button
            className="upload-action"
            type="button"
            onClick={onReplaceAudio}
          >
            <FileAudio /> Trocar áudio desta versão
          </button>
        )}
        {onApplyCommonBatch && (
          <button
            className="upload-action"
            type="button"
            onClick={onApplyCommonBatch}
          >
            <Layers3 /> Aplicar álbum e artista ao lote
          </button>
        )}
      </InspectorGroup>
      <InspectorGroup title="Arte do álbum" open>
        {cover ? (
          <div className="cover-preview">
            <img alt="" src={cover.src} />
            <button type="button" onClick={onClearCover}>
              <Trash2 /> Remover
            </button>
          </div>
        ) : (
          <button
            className="upload-action"
            type="button"
            onClick={onChooseCover}
          >
            <Image /> Escolher capa
          </button>
        )}
        {suggestedCover && (
          <p className="helper-copy">
            Arte oferecida pela pasta: {suggestedCover.relativePath}
          </p>
        )}
        {suggestedCover && cover?.file !== suggestedCover.file && (
          <button
            className="quiet-action"
            type="button"
            onClick={onRestoreSuggestedCover}
          >
            <RotateCcw /> Usar arte oferecida
          </button>
        )}
        {!suggestedCover && <p className="helper-copy">{artworkHint}</p>}
      </InspectorGroup>
      <InspectorGroup title="Descrição e publicação">
        <TextArea
          label="Descrição / letra manual"
          value={metadata.description}
          onChange={(description) => onChange({ description })}
        />
        <TextField
          label="Tags"
          value={metadata.tags}
          onChange={(tags) => onChange({ tags })}
        />
      </InspectorGroup>
    </>
  );
}

function VisualInspector(props: {
  layers: MediaLayerV2[];
  lastRemovedLayer: MediaLayerV2 | null;
  presets: ScenePresetV3[];
  scene: ScenePresetV3;
  onAddLayer: () => void;
  onAdvanced: (key: string, value: number) => void;
  onApplyBatch?: () => void;
  onApplyCoverLayer: (preset: CoverLayerPreset) => void;
  onApplyCoverLayerBatch?: (preset: CoverLayerPreset) => void;
  onCloudLight: (patch: Partial<CloudLightSettings>) => void;
  onColors: (key: "base" | "effect" | "light", value: string) => void;
  onCommon: (key: string, value: number) => void;
  onDeletePreset: () => void;
  onDuplicatePreset: () => void;
  onMoveLayer: (id: string, direction: -1 | 1) => void;
  onPalette: (colors: ScenePresetV3["colors"]) => void;
  onPlayful: (patch: PlayfulPatch) => void;
  onRemoveLayer: (id: string) => void;
  onSavePreset: () => void;
  onSelectPreset: (id: string) => void;
  onUndoLayer: () => void;
  onUpdateLayer: (id: string, patch: Partial<MediaLayerV2>) => void;
  onWaveform: (patch: Partial<WaveformV1>) => void;
}) {
  const { scene } = props;
  return (
    <>
      <InspectorGroup title="Atmosfera" open>
        <SelectField
          label="Preset"
          value={scene.id}
          onChange={props.onSelectPreset}
        >
          {groupPresets(props.presets).map(([category, presets]) => (
            <optgroup key={category} label={category}>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        <p className="preset-note">{scene.note}</p>
        <div className="preset-actions">
          <button type="button" onClick={props.onDuplicatePreset}>
            <Copy /> Duplicar
          </button>
          <button
            disabled={scene.source !== "custom"}
            type="button"
            onClick={props.onSavePreset}
          >
            <Save /> Salvar
          </button>
          <button
            disabled={scene.source !== "custom"}
            type="button"
            onClick={props.onDeletePreset}
          >
            <Trash2 /> Excluir
          </button>
        </div>
        {props.onApplyBatch && (
          <button
            className="upload-action"
            type="button"
            onClick={props.onApplyBatch}
          >
            <Layers3 /> Aplicar visual ao lote
          </button>
        )}
        <div className="color-row">
          {(["base", "effect", "light"] as const).map((key) => (
            <label key={key}>
              <span>{key}</span>
              <input
                aria-label={`Cor ${key}`}
                type="color"
                value={scene.colors[key]}
                onChange={(event) => props.onColors(key, event.target.value)}
              />
            </label>
          ))}
        </div>
        {["playful-shapes", "color-mesh", "piano-ribbons"].includes(
          scene.rendererId,
        ) && (
          <div className="inspector-subsection">
            <p className="inspector-kicker">Paletas infantis</p>
            <div className="preset-chip-grid">
              {childFriendlyPalettes.map((palette) => (
                <button
                  key={palette.name}
                  type="button"
                  onClick={() => props.onPalette(palette.colors)}
                >
                  {palette.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </InspectorGroup>
      <InspectorGroup title="Movimento" open>
        <RangeField
          label="Intensidade"
          value={scene.common.intensity}
          onChange={(value) => props.onCommon("intensity", value)}
        />
        <RangeField
          label="Velocidade"
          value={scene.common.speed}
          onChange={(value) => props.onCommon("speed", value)}
        />
        <RangeField
          label="Direção"
          max={360}
          unit="°"
          value={scene.common.direction}
          onChange={(value) => props.onCommon("direction", value)}
        />
        <RangeField
          label="Reação musical"
          value={scene.common.audioReaction}
          onChange={(value) => props.onCommon("audioReaction", value)}
        />
      </InspectorGroup>
      <InspectorGroup title="Ajustes avançados">
        {scene.controls.map((control) => (
          <RangeField
            key={control.key}
            label={control.label}
            min={control.min}
            max={control.max}
            unit={control.unit}
            value={scene.advanced[control.key]}
            onChange={(value) => props.onAdvanced(control.key, value)}
          />
        ))}
      </InspectorGroup>
      {scene.rendererId === "playful-shapes" && scene.playful && (
        <InspectorGroup title="Conteúdo lúdico" open>
          <SelectField
            label="Movimento"
            value={scene.playful.motionMode}
            onChange={(motionMode) =>
              props.onPlayful({
                motionMode: motionMode as PlayfulContent["motionMode"],
              })
            }
          >
            <option value="calm">Calmo</option>
            <option value="soft-rhythm">Ritmo suave</option>
            <option value="play">Brincadeira</option>
          </SelectField>
          <RangeField
            label="Seed"
            max={999999}
            value={scene.playful.seed}
            onChange={(seed) => props.onPlayful({ seed })}
          />
          <div className="check-stack">
            <CheckField
              label="Retângulos"
              checked={scene.playful.enabled.rectangles}
              onChange={(rectangles) =>
                props.onPlayful({ enabled: { rectangles } })
              }
            />
            <CheckField
              label="Letras"
              checked={scene.playful.enabled.letters}
              onChange={(letters) => props.onPlayful({ enabled: { letters } })}
            />
            <CheckField
              label="Números"
              checked={scene.playful.enabled.numbers}
              onChange={(numbers) => props.onPlayful({ enabled: { numbers } })}
            />
            <CheckField
              label="Emojis"
              checked={scene.playful.enabled.emojis}
              onChange={(emojis) => props.onPlayful({ enabled: { emojis } })}
            />
          </div>
          {scene.playful.enabled.letters && (
            <TextField
              label="Letras personalizadas"
              value={scene.playful.collections.letters}
              onChange={(letters) =>
                props.onPlayful({ collections: { letters } })
              }
            />
          )}
          {scene.playful.enabled.numbers && (
            <TextField
              label="Números personalizados"
              value={scene.playful.collections.numbers}
              onChange={(numbers) =>
                props.onPlayful({ collections: { numbers } })
              }
            />
          )}
          {scene.playful.enabled.emojis && (
            <TextField
              label="Emojis personalizados"
              value={scene.playful.collections.emojis}
              onChange={(emojis) =>
                props.onPlayful({ collections: { emojis } })
              }
            />
          )}
          <button
            className="quiet-action"
            type="button"
            onClick={() =>
              props.onPlayful({
                collections: {
                  letters: "A B C D E",
                  numbers: "1 2 3 4 5",
                  emojis: "☀️ 🎈 🌱 ⭐ 🎵",
                },
              })
            }
          >
            <RotateCcw /> Restaurar coleções
          </button>
        </InspectorGroup>
      )}
      {scene.rendererId === "volumetric-clouds" && scene.cloudLight && (
        <InspectorGroup title="Foco solar">
          <CheckField
            label="Mostrar foco solar"
            checked={scene.cloudLight.enabled}
            onChange={(enabled) => props.onCloudLight({ enabled })}
          />
          {scene.cloudLight.enabled && (
            <>
              <RangeField
                label="Intensidade solar"
                value={scene.cloudLight.intensity}
                onChange={(intensity) => props.onCloudLight({ intensity })}
              />
              <RangeField
                label="Posição horizontal"
                value={scene.cloudLight.x}
                onChange={(x) => props.onCloudLight({ x })}
              />
              <RangeField
                label="Posição vertical"
                value={scene.cloudLight.y}
                onChange={(y) => props.onCloudLight({ y })}
              />
              <RangeField
                label="Raio"
                value={scene.cloudLight.radius}
                onChange={(radius) => props.onCloudLight({ radius })}
              />
              <RangeField
                label="Difusão"
                value={scene.cloudLight.diffusion}
                onChange={(diffusion) => props.onCloudLight({ diffusion })}
              />
            </>
          )}
        </InspectorGroup>
      )}
      <InspectorGroup title="Waveform">
        <CheckField
          label="Mostrar waveform"
          checked={scene.waveform.visible}
          onChange={(visible) => props.onWaveform({ visible })}
        />
        {scene.waveform.visible && (
          <>
            <div className="inspector-subsection">
              <p className="inspector-kicker">Estilo</p>
              <SelectField
                label="Tipo"
                value={scene.waveform.type}
                onChange={(type) =>
                  props.onWaveform({ type: type as WaveformType })
                }
              >
                <option value="mirror-line">Linha espelhada</option>
                <option value="single-line">Linha simples</option>
                <option value="filled-ribbon">Faixa preenchida</option>
                <option value="spectrum-bars">Barras espectrais</option>
                <option value="radial-ring">Anel radial</option>
              </SelectField>
              <div className="waveform-preset-grid">
                {waveformStylePresets.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      props.onWaveform({
                        ...preset.patch,
                        advanced: {
                          ...scene.waveform.advanced,
                          ...preset.patch.advanced,
                        },
                      })
                    }
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="inspector-subsection">
              <p className="inspector-kicker">Aparência</p>
              <SelectField
                label="Modo de cor"
                value={scene.waveform.colorMode}
                onChange={(colorMode) =>
                  props.onWaveform({
                    colorMode: colorMode as WaveformV1["colorMode"],
                  })
                }
              >
                <option value="single">Cor única</option>
                <option value="gradient">Gradiente</option>
                <option value="bands">Cores por banda</option>
              </SelectField>
              <div className="waveform-color-grid">
                <ColorInput
                  label="Principal"
                  value={scene.waveform.color}
                  onChange={(color) => props.onWaveform({ color })}
                />
                <ColorInput
                  label="Cor 2"
                  value={scene.waveform.secondaryColor}
                  onChange={(secondaryColor) =>
                    props.onWaveform({ secondaryColor })
                  }
                />
                <ColorInput
                  label="Cor 3"
                  value={scene.waveform.tertiaryColor}
                  onChange={(tertiaryColor) =>
                    props.onWaveform({ tertiaryColor })
                  }
                />
              </div>
              <RangeField
                label="Opacidade"
                value={scene.waveform.opacity}
                onChange={(opacity) => props.onWaveform({ opacity })}
              />
              <div className="two-columns">
                <RangeField
                  label="Altura"
                  value={scene.waveform.height}
                  onChange={(height) => props.onWaveform({ height })}
                />
                <RangeField
                  label="Posição"
                  value={scene.waveform.position}
                  onChange={(position) => props.onWaveform({ position })}
                />
              </div>
              <div className="two-columns">
                <RangeField
                  label="Largura"
                  value={scene.waveform.width}
                  onChange={(width) => props.onWaveform({ width })}
                />
                <RangeField
                  label="Espessura"
                  min={1}
                  max={6}
                  unit="px"
                  value={scene.waveform.thickness}
                  onChange={(thickness) => props.onWaveform({ thickness })}
                />
              </div>
              <div className="two-columns">
                <RangeField
                  label="Suavização"
                  value={scene.waveform.smoothing}
                  onChange={(smoothing) => props.onWaveform({ smoothing })}
                />
                <RangeField
                  label="Reação musical"
                  value={scene.waveform.audioReaction}
                  onChange={(audioReaction) =>
                    props.onWaveform({ audioReaction })
                  }
                />
              </div>
            </div>
            <div className="inspector-subsection">
              <p className="inspector-kicker">Ajustes do tipo</p>
              {scene.waveform.type === "filled-ribbon" && (
                <RangeField
                  label="Preenchimento"
                  value={scene.waveform.advanced.fillOpacity}
                  onChange={(fillOpacity) =>
                    props.onWaveform({
                      advanced: { ...scene.waveform.advanced, fillOpacity },
                    })
                  }
                />
              )}
              {scene.waveform.type === "spectrum-bars" && (
                <>
                  <RangeField
                    label="Espacamento"
                    value={scene.waveform.advanced.barGap}
                    onChange={(barGap) =>
                      props.onWaveform({
                        advanced: { ...scene.waveform.advanced, barGap },
                      })
                    }
                  />
                  <RangeField
                    label="Arredondamento"
                    value={scene.waveform.advanced.barRadius}
                    onChange={(barRadius) =>
                      props.onWaveform({
                        advanced: { ...scene.waveform.advanced, barRadius },
                      })
                    }
                  />
                  <RangeField
                    label="Pico decrescente"
                    value={scene.waveform.advanced.barPeakHold}
                    onChange={(barPeakHold) =>
                      props.onWaveform({
                        advanced: {
                          ...scene.waveform.advanced,
                          barPeakHold,
                        },
                      })
                    }
                  />
                  <RangeField
                    label="Velocidade do pico"
                    value={scene.waveform.advanced.barPeakDecay}
                    onChange={(barPeakDecay) =>
                      props.onWaveform({
                        advanced: {
                          ...scene.waveform.advanced,
                          barPeakDecay,
                        },
                      })
                    }
                  />
                </>
              )}
              {scene.waveform.type === "radial-ring" && (
                <>
                  <RangeField
                    label="Raio"
                    value={scene.waveform.advanced.radialRadius}
                    onChange={(radialRadius) =>
                      props.onWaveform({
                        advanced: { ...scene.waveform.advanced, radialRadius },
                      })
                    }
                  />
                  <RangeField
                    label="Arco"
                    value={scene.waveform.advanced.radialArc}
                    onChange={(radialArc) =>
                      props.onWaveform({
                        advanced: { ...scene.waveform.advanced, radialArc },
                      })
                    }
                  />
                  <RangeField
                    label="Rotação"
                    min={-180}
                    max={180}
                    unit="deg"
                    value={scene.waveform.advanced.radialRotation}
                    onChange={(radialRotation) =>
                      props.onWaveform({
                        advanced: {
                          ...scene.waveform.advanced,
                          radialRotation,
                        },
                      })
                    }
                  />
                  <RangeField
                    label="Brilho"
                    value={scene.waveform.advanced.radialGlow}
                    onChange={(radialGlow) =>
                      props.onWaveform({
                        advanced: {
                          ...scene.waveform.advanced,
                          radialGlow,
                        },
                      })
                    }
                  />
                </>
              )}
            </div>
          </>
        )}
      </InspectorGroup>
      <InspectorGroup title={`Camadas · ${props.layers.length}/3`} open>
        <LayerEditor {...props} />
      </InspectorGroup>
    </>
  );
}

function LayerEditor(props: {
  layers: MediaLayerV2[];
  lastRemovedLayer: MediaLayerV2 | null;
  onAddLayer: () => void;
  onApplyCoverLayer: (preset: CoverLayerPreset) => void;
  onApplyCoverLayerBatch?: (preset: CoverLayerPreset) => void;
  onMoveLayer: (id: string, direction: -1 | 1) => void;
  onRemoveLayer: (id: string) => void;
  onUndoLayer: () => void;
  onUpdateLayer: (id: string, patch: Partial<MediaLayerV2>) => void;
}) {
  const [coverPreset, setCoverPreset] =
    useState<CoverLayerPreset>("background");
  return (
    <div className="layer-editor">
      <div className="inline-actions">
        <button
          disabled={props.layers.length >= 3}
          type="button"
          onClick={props.onAddLayer}
        >
          <Upload /> Adicionar
        </button>
        {props.lastRemovedLayer && (
          <button type="button" onClick={props.onUndoLayer}>
            <RotateCcw /> Desfazer
          </button>
        )}
      </div>
      <div className="inspector-subsection">
        <p className="inspector-kicker">Capa no vídeo</p>
        <div className="cover-layer-apply">
          <SelectField
            label="Posição"
            value={coverPreset}
            onChange={(preset) => setCoverPreset(preset as CoverLayerPreset)}
          >
            {(Object.keys(coverLayerPresetLabels) as CoverLayerPreset[]).map(
              (preset) => (
                <option key={preset} value={preset}>
                  {coverLayerPresetLabels[preset]}
                </option>
              ),
            )}
          </SelectField>
          <button
            className="upload-action"
            type="button"
            onClick={() => props.onApplyCoverLayer(coverPreset)}
          >
            <Image /> Aplicar capa
          </button>
        </div>
        {props.onApplyCoverLayerBatch && (
          <button
            className="quiet-action"
            type="button"
            onClick={() => props.onApplyCoverLayerBatch?.(coverPreset)}
          >
            <Layers3 /> Aplicar capa ao lote
          </button>
        )}
        <p className="helper-copy">
          O lote preserva escala, posição, sombra e máscara, trocando apenas o
          arquivo de capa de cada faixa quando disponível.
        </p>
      </div>
      {props.layers.map((layer, index) => (
        <details className="layer-row" key={layer.id}>
          <summary>
            <span>{layer.name}</span>
            <span className="layer-buttons">
              <IconButton
                label={layer.visible ? "Ocultar camada" : "Mostrar camada"}
                onClick={() =>
                  props.onUpdateLayer(layer.id, { visible: !layer.visible })
                }
              >
                {layer.visible ? <Eye /> : <EyeOff />}
              </IconButton>
              <IconButton
                disabled={index === 0}
                label="Mover camada para baixo"
                onClick={() => props.onMoveLayer(layer.id, -1)}
              >
                <ChevronDown />
              </IconButton>
              <IconButton
                disabled={index === props.layers.length - 1}
                label="Mover camada para cima"
                onClick={() => props.onMoveLayer(layer.id, 1)}
              >
                <ChevronUp />
              </IconButton>
              <IconButton
                label="Remover camada"
                onClick={() => props.onRemoveLayer(layer.id)}
              >
                <Trash2 />
              </IconButton>
            </span>
          </summary>
          <RangeField
            label="Opacidade"
            value={layer.opacity}
            onChange={(opacity) => props.onUpdateLayer(layer.id, { opacity })}
          />
          <RangeField
            label="Escala"
            max={220}
            value={layer.scale}
            onChange={(scale) => props.onUpdateLayer(layer.id, { scale })}
          />
          <RangeField
            label="Horizontal"
            value={layer.x}
            onChange={(x) => props.onUpdateLayer(layer.id, { x })}
          />
          <RangeField
            label="Vertical"
            value={layer.y}
            onChange={(y) => props.onUpdateLayer(layer.id, { y })}
          />
          <RangeField
            label="Rotação"
            min={-180}
            max={180}
            unit="°"
            value={layer.rotation}
            onChange={(rotation) => props.onUpdateLayer(layer.id, { rotation })}
          />
          <RangeField
            label="Desfoque da camada"
            max={48}
            value={layer.blur}
            onChange={(blur) => props.onUpdateLayer(layer.id, { blur })}
          />
          <RangeField
            label="Máscara escura"
            max={90}
            value={layer.maskOpacity}
            onChange={(maskOpacity) =>
              props.onUpdateLayer(layer.id, { maskOpacity })
            }
          />
          <RangeField
            label="Sombra"
            value={layer.shadow.opacity}
            onChange={(opacity) =>
              props.onUpdateLayer(layer.id, {
                shadow: { ...layer.shadow, opacity },
              })
            }
          />
          <RangeField
            label="Desfoque da sombra"
            max={80}
            value={layer.shadow.blur}
            onChange={(blur) =>
              props.onUpdateLayer(layer.id, {
                shadow: { ...layer.shadow, blur },
              })
            }
          />
          <RangeField
            label="Sombra horizontal"
            min={-80}
            max={80}
            value={layer.shadow.x}
            onChange={(x) =>
              props.onUpdateLayer(layer.id, {
                shadow: { ...layer.shadow, x },
              })
            }
          />
          <RangeField
            label="Sombra vertical"
            min={-80}
            max={80}
            value={layer.shadow.y}
            onChange={(y) =>
              props.onUpdateLayer(layer.id, {
                shadow: { ...layer.shadow, y },
              })
            }
          />
          {layer.kind === "video" && (
            <CheckField
              label="Repetir vídeo"
              checked={layer.loop}
              onChange={(loop) => props.onUpdateLayer(layer.id, { loop })}
            />
          )}
          <div className="two-columns">
            <SelectField
              label="Encaixe"
              value={layer.fit}
              onChange={(fit) =>
                props.onUpdateLayer(layer.id, {
                  fit: fit as MediaLayerV2["fit"],
                })
              }
            >
              <option value="contain">Conter</option>
              <option value="cover">Cobrir</option>
            </SelectField>
            <SelectField
              label="Mistura"
              value={layer.blendMode}
              onChange={(blendMode) =>
                props.onUpdateLayer(layer.id, {
                  blendMode: blendMode as MediaLayerV2["blendMode"],
                })
              }
            >
              <option value="normal">Normal</option>
              <option value="screen">Tela</option>
              <option value="multiply">Multiplicar</option>
              <option value="overlay">Sobrepor</option>
            </SelectField>
          </div>
        </details>
      ))}
    </div>
  );
}

function TextInspector({
  metadata,
  scene,
  showMetadata,
  textSettings,
  onChange,
  onCommon,
  onTextSettings,
  onToggle,
  onApplyBatch,
}: {
  metadata: TrackMetadata;
  scene: ScenePresetV3;
  showMetadata: boolean;
  textSettings: TextOverlaySettings;
  onChange: (patch: Partial<TrackMetadata>) => void;
  onCommon: (key: string, value: number) => void;
  onTextSettings: (patch: Partial<TextOverlaySettings>) => void;
  onToggle: (checked: boolean) => void;
  onApplyBatch?: () => void;
}) {
  return (
    <>
      <InspectorGroup title="Texto no vídeo" open>
        <CheckField
          label="Mostrar texto no vídeo"
          checked={showMetadata}
          onChange={onToggle}
        />
        <div className="check-stack">
          <CheckField
            label="Título"
            checked={textSettings.fields.title}
            onChange={(title) =>
              onTextSettings({ fields: { ...textSettings.fields, title } })
            }
          />
          <CheckField
            label="Artista"
            checked={textSettings.fields.artist}
            onChange={(artist) =>
              onTextSettings({ fields: { ...textSettings.fields, artist } })
            }
          />
          <CheckField
            label="Álbum"
            checked={textSettings.fields.album}
            onChange={(album) =>
              onTextSettings({ fields: { ...textSettings.fields, album } })
            }
          />
          <CheckField
            label="Ano"
            checked={textSettings.fields.year}
            onChange={(year) =>
              onTextSettings({ fields: { ...textSettings.fields, year } })
            }
          />
          <CheckField
            label="Versão"
            checked={textSettings.fields.version}
            onChange={(version) =>
              onTextSettings({ fields: { ...textSettings.fields, version } })
            }
          />
        </div>
        <TextField
          label="Título"
          value={metadata.title}
          onChange={(title) => onChange({ title })}
        />
        <TextField
          label="Artista"
          value={metadata.artist}
          onChange={(artist) => onChange({ artist })}
        />
        <TextField
          label="Álbum"
          value={metadata.album}
          onChange={(album) => onChange({ album })}
        />
        <div className="two-columns">
          <TextField
            label="Ano"
            value={metadata.year}
            onChange={(year) => onChange({ year })}
          />
          <TextField
            label="Versão"
            value={metadata.version}
            onChange={(version) => onChange({ version })}
          />
        </div>
      </InspectorGroup>
      <InspectorGroup title="Tipografia e posição" open>
        <SelectField
          label="Preset"
          value={textSettings.preset}
          onChange={(preset) =>
            onTextSettings(
              textPresetPatch(preset as TextOverlaySettings["preset"]),
            )
          }
        >
          <option value="top-left">Topo esquerdo</option>
          <option value="bottom-center">Base central</option>
          <option value="cover-left">Capa à esquerda</option>
          <option value="side-left">Lado a lado · texto à esquerda</option>
          <option value="side-right">Lado a lado · texto à direita</option>
        </SelectField>
        <SelectField
          label="Fonte"
          value={textSettings.fontFamily}
          onChange={(fontFamily) =>
            onTextSettings({
              fontFamily: fontFamily as TextOverlaySettings["fontFamily"],
            })
          }
        >
          <option value="Inter">Inter</option>
          <option value="Georgia">Georgia</option>
          <option value="Arial">Arial</option>
        </SelectField>
        <div className="two-columns">
          <RangeField
            label="Tamanho"
            max={88}
            min={12}
            unit="px"
            value={textSettings.fontSize}
            onChange={(fontSize) => onTextSettings({ fontSize })}
          />
          <RangeField
            label="Peso"
            max={900}
            min={300}
            value={textSettings.fontWeight}
            onChange={(fontWeight) => onTextSettings({ fontWeight })}
          />
        </div>
        <div className="two-columns">
          <RangeField
            label="Espaçamento"
            max={24}
            min={-2}
            unit="px"
            value={textSettings.letterSpacing}
            onChange={(letterSpacing) => onTextSettings({ letterSpacing })}
          />
          <RangeField
            label="Altura"
            max={180}
            min={90}
            unit="%"
            value={textSettings.lineHeight}
            onChange={(lineHeight) => onTextSettings({ lineHeight })}
          />
        </div>
        <ColorInput
          label="Cor"
          value={textSettings.color}
          onChange={(color) => onTextSettings({ color })}
        />
        <RangeField
          label="Opacidade"
          value={textSettings.opacity}
          onChange={(opacity) => onTextSettings({ opacity })}
        />
        <div className="two-columns">
          <RangeField
            label="Horizontal"
            value={textSettings.x}
            onChange={(x) => onTextSettings({ x })}
          />
          <RangeField
            label="Vertical"
            value={textSettings.y}
            onChange={(y) => onTextSettings({ y })}
          />
        </div>
        <SelectField
          label="Alinhamento"
          value={textSettings.align}
          onChange={(align) =>
            onTextSettings({ align: align as TextOverlaySettings["align"] })
          }
        >
          <option value="left">Esquerda</option>
          <option value="center">Centro</option>
          <option value="right">Direita</option>
          <option value="justify">Justificado</option>
        </SelectField>
        <SelectField
          label="Âncora vertical"
          value={textSettings.verticalAnchor}
          onChange={(verticalAnchor) =>
            onTextSettings({
              verticalAnchor:
                verticalAnchor as TextOverlaySettings["verticalAnchor"],
            })
          }
        >
          <option value="top">Topo</option>
          <option value="middle">Centro</option>
          <option value="bottom">Base</option>
        </SelectField>
        <RangeField
          label="Sombra"
          value={textSettings.shadow}
          onChange={(shadow) => onTextSettings({ shadow })}
        />
        <RangeField
          label="Escurecimento do fundo"
          value={scene.common.shade}
          onChange={(value) => onCommon("shade", value)}
        />
        {onApplyBatch && (
          <button
            className="upload-action"
            type="button"
            onClick={onApplyBatch}
          >
            <Layers3 /> Aplicar texto ao lote
          </button>
        )}
      </InspectorGroup>
    </>
  );
}

function ExportInspector({
  batchCount,
  coverName,
  jobs,
  layerCount,
  metadata,
  outputFolderName,
  outputPreset,
  qualityProfile,
  scene,
  workflowMode,
  onChooseOutput,
  onClearCompleted,
  onExport,
  onApplyBatch,
  onMetadata,
  onPreset,
  onQuality,
  onUseDarkAudio,
}: {
  batchCount: number;
  coverName?: string;
  jobs: RenderJob[];
  layerCount: number;
  metadata: TrackMetadata;
  outputFolderName: string;
  outputPreset: string;
  qualityProfile: string;
  scene: ScenePresetV3;
  workflowMode: "single" | "batch";
  onChooseOutput: () => void;
  onClearCompleted: () => void;
  onExport: () => void;
  onApplyBatch?: () => void;
  onMetadata: (patch: Partial<TrackMetadata>) => void;
  onPreset: (value: string) => void;
  onQuality: (value: string) => void;
  onUseDarkAudio: () => void;
}) {
  const resolution =
    outputPresets.find(([value]) => value === outputPreset) ?? outputPresets[1];
  const renderJobs = jobs.filter((job) => job.kind === "video-render");
  const hasCompletedRenderJobs = renderJobs.some((job) =>
    ["done", "error", "canceled"].includes(job.status),
  );
  return (
    <>
      <InspectorGroup title="Resumo da exportação" open>
        <dl className="export-summary">
          <div>
            <dt>{workflowMode === "batch" ? "Lote" : "Faixa"}</dt>
            <dd>
              {workflowMode === "batch"
                ? `${batchCount} ${batchCount === 1 ? "faixa selecionada" : "faixas selecionadas"}`
                : metadata.title || "Sem titulo"}
            </dd>
          </div>
          <div>
            <dt>Arte</dt>
            <dd>{coverName || "Sem capa"}</dd>
          </div>
          <div>
            <dt>Visual</dt>
            <dd>{scene.name}</dd>
          </div>
          <div>
            <dt>Waveform</dt>
            <dd>
              {scene.waveform.visible
                ? `${waveformTypeLabel(scene.waveform.type)} ativa`
                : "Desligada"}
            </dd>
          </div>
          <div>
            <dt>Camadas</dt>
            <dd>{layerCount}/3</dd>
          </div>
          <div>
            <dt>Saida</dt>
            <dd>
              {resolution[1]} · {outputFolderName}
            </dd>
          </div>
        </dl>
      </InspectorGroup>
      <InspectorGroup title="Arquivo final" open>
        <TextField
          label="Nome do arquivo"
          value={metadata.outputFileName}
          onChange={(outputFileName) => onMetadata({ outputFileName })}
        />
        <SelectField label="Resolução" value={outputPreset} onChange={onPreset}>
          {outputPresets.map(([value, label, dimensions]) => (
            <option key={value} value={value}>
              {label} · {dimensions}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Perfil de qualidade"
          value={qualityProfile}
          onChange={onQuality}
        >
          <option value="auto">Automatico</option>
          <option value="fast">Rapido</option>
          <option value="final">Final</option>
        </SelectField>
        <button
          className="upload-action"
          type="button"
          onClick={onChooseOutput}
        >
          <FolderOpen /> {outputFolderName}
        </button>
        <button
          className="upload-action"
          type="button"
          onClick={onUseDarkAudio}
        >
          <Disc3 /> Usar tela escura com áudio
        </button>
        <button
          className="primary-action wide"
          disabled={workflowMode === "batch" && batchCount === 0}
          type="button"
          onClick={onExport}
        >
          <Video />{" "}
          {workflowMode === "batch" ? "Exportar lote" : "Exportar vídeo"}
        </button>
      </InspectorGroup>
      <InspectorGroup title="Publicação YouTube">
        <SelectField
          label="Privacidade"
          value={metadata.visibility}
          onChange={(visibility) => onMetadata({ visibility })}
        >
          <option value="private">Privado</option>
          <option value="unlisted">Não listado</option>
          <option value="public">Publico</option>
        </SelectField>
        <TextField
          label="Idioma"
          value={metadata.language}
          onChange={(language) => onMetadata({ language })}
        />
        <TextArea
          label="Descrição"
          value={metadata.description}
          onChange={(description) => onMetadata({ description })}
        />
        <TextField
          label="Tags"
          value={metadata.tags}
          onChange={(tags) => onMetadata({ tags })}
        />
        <CheckField
          label="Declarar midia sintetica / IA"
          checked={metadata.containsSyntheticMedia}
          onChange={(containsSyntheticMedia) =>
            onMetadata({ containsSyntheticMedia })
          }
        />
        {onApplyBatch && (
          <button
            className="upload-action"
            type="button"
            onClick={onApplyBatch}
          >
            <Layers3 /> Aplicar publicação ao lote
          </button>
        )}
        <p className="helper-copy">
          A exportação inclui um arquivo `.youtube.json`. O upload por OAuth
          fica para uma etapa posterior.
        </p>
      </InspectorGroup>
      <InspectorGroup title={`Fila de exportação · ${renderJobs.length}`} open>
        {hasCompletedRenderJobs && (
          <button
            className="quiet-action queue-clear-action"
            type="button"
            onClick={onClearCompleted}
          >
            <Trash2 /> Limpar concluídos
          </button>
        )}
        {renderJobs.length === 0 ? (
          <p className="helper-copy">As exportações aparecem aqui.</p>
        ) : (
          renderJobs.map((job) => (
            <div className="job-row" key={job.id}>
              <span>
                <strong>{readableJobMessage(job.message)}</strong>
                <small>
                  {job.progress}% · {jobStatusLabel(job.status)}
                </small>
              </span>
              <progress max={100} value={job.progress} />
              {job.outputUrl && (
                <a href={job.outputUrl} download title="Baixar MP4">
                  <Download />
                </a>
              )}
            </div>
          ))
        )}
      </InspectorGroup>
    </>
  );
}

function InspectorGroup({
  children,
  title,
  open = false,
}: {
  children: ReactNode;
  title: string;
  open?: boolean;
}) {
  return (
    <details className="inspector-group" open={open}>
      <summary>
        {title}
        <ChevronDown />
      </summary>
      <div className="inspector-body">{children}</div>
    </details>
  );
}

function RangeField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  unit = "",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <b>
          {Math.round(value)}
          {unit}
        </b>
      </span>
      <input
        min={min}
        max={max}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({
  label,
  rows = 5,
  value,
  onChange,
}: {
  label: string;
  rows?: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  children,
  label,
  value,
  onChange,
}: {
  children: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function CheckField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="check-field">
      <input
        checked={checked}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="color-input">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function PanelResizeHandle({
  active,
  className,
  label,
  onPointerDown,
  onReset,
}: {
  active: boolean;
  className: string;
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onReset: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-orientation="vertical"
      className={`panel-resize-handle ${className} ${active ? "active" : ""}`}
      title={`${label}. Duplo clique redefine o tamanho.`}
      type="button"
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onReset();
      }}
      onPointerDown={onPointerDown}
    />
  );
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="icon-button"
      disabled={disabled}
      title={label}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function trackFromInput(
  name: string,
  info?: AudioInfo,
  defaults?: TrackMetadata,
): TrackDraft {
  const metadata = metadataFromAudio(
    info,
    { ...defaultMetadata, ...defaults },
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
  return {
    ...base,
    ...saved,
    sourceFile,
    sourceUrl: sourceFile ? URL.createObjectURL(sourceFile) : base.sourceUrl,
    scene: normalizeVisualSettings(saved.scene),
    thumbnailPreviewMode: saved.thumbnailPreviewMode ?? "composition",
    textSettings: cloneTextSettings(saved.textSettings),
    layers: saved.layers.map((layer) => ({
      ...layer,
      blur: layer.blur ?? 0,
      maskOpacity: layer.maskOpacity ?? 0,
      src: URL.createObjectURL(layer.file),
    })),
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
    artist: info?.artist || suggestions?.artist || fallback.artist,
    album: info?.album || suggestions?.album || fallback.album,
    albumArtist:
      info?.albumArtist || suggestions?.albumArtist || fallback.albumArtist,
    genre: info?.genre || suggestions?.genre || fallback.genre,
    comment: info?.comment || suggestions?.comment || fallback.comment,
    composer: suggestions?.composer || fallback.composer,
    year: suggestions?.year || fallback.year,
    trackNumber: suggestions?.trackNumber || fallback.trackNumber,
    diskNumber: suggestions?.diskNumber || fallback.diskNumber,
    useEmbeddedCover: Boolean(info?.hasEmbeddedCover),
  };
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
  const finalized = new Map<string, TrackDraft>();
  for (const group of groups.values()) {
    const ordered = [...group].sort((first, second) =>
      first.sourceKey.localeCompare(second.sourceKey, "pt-BR", {
        numeric: true,
        sensitivity: "base",
      }),
    );
    const explicitNumbers = new Set(
      ordered
        .map((track) => Number(track.audioInfo?.suggestions?.trackNumber ?? 0))
        .filter((value) => value > 0),
    );
    const duplicateExplicit = explicitNumbers.size !== ordered.length;
    const diskNumbers = new Set(
      ordered
        .map((track) => Number(track.metadata.diskNumber || 1))
        .filter((value) => value > 0),
    );
    for (const [index, track] of ordered.entries()) {
      const explicit = Number(track.audioInfo?.suggestions?.trackNumber ?? 0);
      finalized.set(track.id, {
        ...track,
        metadata: {
          ...track.metadata,
          trackNumber:
            explicit > 0 && !duplicateExplicit ? explicit : index + 1,
          trackTotal: ordered.length,
          diskNumber: track.metadata.diskNumber || 1,
          diskTotal: Math.max(1, diskNumbers.size),
        },
      });
    }
  }
  return tracks.map((track) => finalized.get(track.id) ?? track);
}

type DirectoryAssetEntry = { file: File; relativePath: string };

async function collectDirectoryAssets(
  handle: FileSystemDirectoryHandle,
  prefix = "",
): Promise<{
  audioEntries: DirectoryAssetEntry[];
  artworkEntries: DirectoryAssetEntry[];
}> {
  const audioEntries: DirectoryAssetEntry[] = [];
  const artworkEntries: DirectoryAssetEntry[] = [];
  for await (const [name, entry] of handle.entries()) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (entry.kind === "file") {
      if (isPrivateAssetPath(relativePath)) continue;
      if (isArtworkName(name)) {
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
  }
  return {
    audioEntries: audioEntries.sort(compareDirectoryEntries),
    artworkEntries: artworkEntries.sort(compareDirectoryEntries),
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
    const relativePath = chooseArtworkForTrack({
      audioPath: track.sourceKey,
      audioPaths,
      artworkPaths: artworkEntries.map((entry) => entry.relativePath),
      trackNumber: track.metadata.trackNumber,
    });
    if (!relativePath) return track;
    const artwork = artworkByPath.get(relativePath);
    if (!artwork) return track;
    let src = srcByPath.get(relativePath);
    if (!src) {
      src = URL.createObjectURL(artwork.file);
      srcByPath.set(relativePath, src);
    }
    return {
      ...track,
      suggestedCover: {
        file: artwork.file,
        src,
        relativePath,
        source: "folder" as const,
      },
      useSuggestedCover: track.useSuggestedCover ?? true,
    };
  });
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

function artworkConventionHint(track: TrackDraft) {
  if (track.metadata.trackTotal > 1) {
    return "Para automatizar as capas, use art/ na pasta do álbum. Arquivos iniciados pelo número da faixa vencem a capa geral album.* ou cover.*.";
  }
  return `Para automatizar esta capa, use ${singleTrackArtworkFileName(track.sourceKey)} ao lado do MP3.`;
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
    cleanPackage: true,
  };
}

function stripLayerFile(layer: MediaLayerV2) {
  const { file: _file, src: _src, name: _name, ...settings } = layer;
  return settings;
}

function cloneTextSettings(settings?: TextOverlaySettings) {
  return mergeTextSettings(settings);
}

function mergeTextSettings(
  base?: Partial<TextOverlaySettings>,
  patch: Partial<TextOverlaySettings> = {},
): TextOverlaySettings {
  return {
    ...defaultTextSettings,
    ...base,
    ...patch,
    fields: {
      ...defaultTextSettings.fields,
      ...(base?.fields ?? {}),
      ...(patch.fields ?? {}),
    },
  };
}

function textPresetPatch(
  preset: TextOverlaySettings["preset"],
): Partial<TextOverlaySettings> {
  if (preset === "bottom-center") {
    return {
      preset,
      x: 50,
      y: 78,
      align: "center",
      verticalAnchor: "top",
      fontSize: 34,
      shadow: 58,
    };
  }
  if (preset === "cover-left") {
    return {
      preset,
      x: 58,
      y: 34,
      align: "left",
      verticalAnchor: "top",
      fontSize: 38,
      shadow: 52,
    };
  }
  if (preset === "side-left") {
    return {
      preset,
      x: 7,
      y: 50,
      align: "left",
      verticalAnchor: "middle",
      fontSize: 36,
      shadow: 54,
    };
  }
  if (preset === "side-right") {
    return {
      preset,
      x: 64,
      y: 50,
      align: "left",
      verticalAnchor: "middle",
      fontSize: 36,
      shadow: 54,
    };
  }
  return {
    preset,
    x: 5,
    y: 7,
    align: "left",
    verticalAnchor: "top",
    fontSize: 42,
    shadow: 48,
  };
}

function coverLayerFromArtwork(
  artwork: { file: File; src: string },
  preset: CoverLayerPreset,
  template?: MediaLayerV2,
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

function isCoverLayer(layer: MediaLayerV2) {
  return layer.id.startsWith("cover-layer-") || layer.name.startsWith("Capa -");
}

function groupPresets(presets: ScenePresetV3[]) {
  const groups = new Map<string, ScenePresetV3[]>();
  for (const preset of presets)
    groups.set(preset.category, [
      ...(groups.get(preset.category) ?? []),
      preset,
    ]);
  return Array.from(groups.entries());
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

function normalizeCoverSeriesClient(value: unknown): CoverSeriesSettings {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<CoverSeriesSettings>)
      : {};
  const metaFontSize = clampNumber(
    Number(candidate.metaFontSize ?? defaultCoverSeriesSettings.metaFontSize),
    18,
    72,
    defaultCoverSeriesSettings.metaFontSize,
  );
  return {
    ...defaultCoverSeriesSettings,
    ...candidate,
    enabled: candidate.enabled ?? defaultCoverSeriesSettings.enabled,
    style: ["roman", "arabic", "custom"].includes(String(candidate.style))
      ? (candidate.style as CoverSeriesSettings["style"])
      : defaultCoverSeriesSettings.style,
    color: /^#[0-9a-f]{6}$/i.test(String(candidate.color ?? ""))
      ? String(candidate.color)
      : defaultCoverSeriesSettings.color,
    metaOrder: String(
      candidate.metaOrder ?? defaultCoverSeriesSettings.metaOrder,
    ),
    metaFontSize,
    metaGap: clampNumber(
      Number(candidate.metaGap ?? defaultCoverSeriesSettings.metaGap),
      0,
      48,
      defaultCoverSeriesSettings.metaGap,
    ),
    metaStyles: {
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
): CoverSeriesMetaStyle {
  return {
    fontSize: clampNumber(
      Number(value?.fontSize ?? fallback.fontSize),
      18,
      72,
      fallback.fontSize,
    ),
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

function clampNumber(value: number, min: number, max: number, fallback = min) {
  return Math.min(
    Math.max(Number.isFinite(value) ? value : fallback, min),
    max,
  );
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

function groupCatalogTracks(tracks: TrackDraft[]) {
  const albums = new Map<
    string,
    {
      id: string;
      album: string;
      artist: string;
      genre: string;
      year: string;
      tracks: TrackDraft[];
    }
  >();
  for (const track of tracks) {
    const artist = track.metadata.albumArtist || track.metadata.artist;
    const id = `${artist}\u0000${track.metadata.album}`;
    const album = albums.get(id) ?? {
      id,
      album: track.metadata.album,
      artist,
      genre: track.metadata.genre,
      year: track.metadata.year,
      tracks: [],
    };
    album.tracks.push(track);
    albums.set(id, album);
  }
  return [...albums.values()].map((album) => ({
    ...album,
    tracks: album.tracks.sort(
      (first, second) =>
        first.metadata.diskNumber - second.metadata.diskNumber ||
        first.metadata.trackNumber - second.metadata.trackNumber ||
        first.metadata.title.localeCompare(second.metadata.title, "pt-BR"),
    ),
  }));
}

function thumbnailFingerprint(
  track: TrackDraft,
  coverSrc: string | undefined,
  showMetadata: boolean,
) {
  return JSON.stringify({
    coverSrc,
    layers: track.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      opacity: layer.opacity,
      order: layer.order,
      rotation: layer.rotation,
      scale: layer.scale,
      blur: layer.blur,
      maskOpacity: layer.maskOpacity,
      visible: layer.visible,
      x: layer.x,
      y: layer.y,
    })),
    metadata: track.metadata,
    scene: track.scene,
    showMetadata,
    textSettings: track.textSettings,
  });
}

function formatDuration(seconds?: number | null) {
  if (!Number.isFinite(seconds)) return "--:--";
  const safe = Number(seconds);
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

function formatMetric(value?: number | null, unit = "") {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)}${unit}` : "--";
}

function previewTreatedFileName(metadata: TrackMetadata) {
  const track = String(metadata.trackNumber || 0).padStart(2, "0");
  return `${safeFilePart(metadata.album || "Album")} - ${track} - ${safeFilePart(metadata.title || "Faixa")}.mp3`;
}

function safeFilePart(value: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Sem titulo";
}

function riskLabel(risk: AudioTechnicalAnalysis["risk"]) {
  return {
    safe: "Margem adequada",
    "reduced-headroom": "Margem reduzida",
    overload: "Sobrecarga detectada",
    "decode-error": "Falha na análise",
  }[risk];
}

function riskDescription(analysis: AudioTechnicalAnalysis) {
  if (analysis.risk === "reduced-headroom") {
    return `Margem reduzida: pico verdadeiro em ${analysis.truePeakDbtp.toFixed(2)} dBTP. Não há clipping confirmado; considere normalizar a cópia tratada.`;
  }
  if (analysis.risk === "overload") {
    return `Sobrecarga detectada: pico verdadeiro em ${analysis.truePeakDbtp.toFixed(2)} dBTP. Revise antes de exportar.`;
  }
  if (analysis.risk === "safe") {
    return `Margem adequada: ${analysis.integratedLufs.toFixed(1)} LUFS e ${analysis.truePeakDbtp.toFixed(2)} dBTP.`;
  }
  return "Não foi possível decodificar o áudio para a análise técnica.";
}

function waveformTypeLabel(type: WaveformType) {
  return {
    "mirror-line": "Linha espelhada",
    "single-line": "Linha simples",
    "filled-ribbon": "Faixa preenchida",
    "spectrum-bars": "Barras espectrais",
    "radial-ring": "Anel radial",
  }[type];
}

function stepLabel(step: ActiveStep) {
  return {
    music: "Música",
    visual: "Visual",
    text: "Texto",
    export: "Exportar",
  }[step];
}

function jobStatusLabel(status: RenderJob["status"]) {
  return {
    queued: "na fila",
    paused: "pausado",
    running: "processando",
    done: "concluído",
    error: "falhou",
    canceled: "cancelado",
  }[status];
}

function readableJobMessage(message: string) {
  return message
    .replaceAll("Renderizacao", "Renderização")
    .replaceAll("concluida", "concluída")
    .replaceAll("concluido", "concluído")
    .replaceAll("Analisando audio", "Analisando áudio")
    .replaceAll("Servidor local indisponivel", "Servidor local indisponível");
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

function backupFileName(sourceKey: string, stamp: string) {
  return `${stamp}-${workspaceRelativeSegments(sourceKey, "").join("__")}`;
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

export default App;
