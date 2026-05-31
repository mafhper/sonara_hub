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
  Maximize2,
  Minimize2,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ChangeEvent,
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
  loadDirectoryHandle,
  loadSnapshot,
  saveDirectoryHandle,
  saveSnapshot,
} from "./storage";
import type {
  AudioInfo,
  AudioTagDraft,
  AudioTechnicalAnalysis,
  MediaLayerV2,
  ProjectSnapshot,
  RenderJob,
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

const emptyBands: AudioBands = {
  energy: 0,
  bass: 0,
  mid: 0,
  high: 0,
  samples: [],
  spectrum: [],
};
const outputPresets = [
  ["youtube-720p", "720p", "1280 x 720"],
  ["youtube-1080p", "1080p", "1920 x 1080"],
  ["youtube-2k", "2K", "2560 x 1440"],
  ["youtube-4k", "4K", "3840 x 2160"],
];
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

function App() {
  const [tracks, setTracks] = useState<TrackDraft[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [workflowMode, setWorkflowMode] = useState<"single" | "batch">(
    "single",
  );
  const [activeStep, setActiveStep] = useState<ActiveStep>("visual");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("audio");
  const [visualPresets, setVisualPresets] =
    useState<ScenePresetV3[]>(builtinVisualPresets);
  const [outputPreset, setOutputPreset] = useState("youtube-1080p");
  const [qualityProfile, setQualityProfile] = useState("auto");
  const [showMetadata, setShowMetadata] = useState(true);
  const [cover, setCover] = useState<{ file: File; src: string } | null>(null);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [error, setError] = useState("");
  const [folderName, setFolderName] = useState("Pasta input");
  const [outputFolderName, setOutputFolderName] = useState("outputs interno");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [panelsSwapped, setPanelsSwapped] = useState(false);
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
  const [batchCommon, setBatchCommon] = useState({
    artist: "Matheus Lima",
    album: "The Beauty of Almost",
    albumArtist: "Matheus Lima",
    composer: "Matheus Lima",
    genre: "",
    year: "2026",
    copyright: "2026 Matheus Lima",
    comment: "Feito usando IA com curadoria humana.",
    trackTotal: 5,
    diskNumber: 1,
    diskTotal: 1,
    normalizationEnabled: false,
  });
  const [audioBands, setAudioBands] = useState<AudioBands>(emptyBands);
  const [coverSeries, setCoverSeries] = useState(true);
  const [coverStyle, setCoverStyle] = useState<"roman" | "arabic">("roman");
  const [processedAudioOutputs, setProcessedAudioOutputs] = useState<
    Record<string, string>
  >({});
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
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef(0);

  const selectedTrack =
    tracks.find((track) => track.id === selectedTrackId) ?? tracks[0];
  const selectedScene = selectedTrack?.scene ?? builtinVisualPresets[0];
  const selectedOutput =
    outputPresets.find(([value]) => value === outputPreset) ?? outputPresets[1];
  const audioSrc = selectedTrack
    ? (selectedTrack.sourceUrl ??
      (selectedTrack.source === "input"
        ? `/api/audio/${encodeURIComponent(selectedTrack.sourceKey)}`
        : ""))
    : "";

  useEffect(() => {
    void loadInitialWorkspace();
    void restoreOutputDirectory();
  }, []);

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 980px)");
    const collapsePanels = () => {
      if (!narrow.matches) return;
      setLeftCollapsed(true);
      setRightCollapsed(true);
    };
    collapsePanels();
    narrow.addEventListener("change", collapsePanels);
    return () => narrow.removeEventListener("change", collapsePanels);
  }, []);

  useEffect(() => {
    audioBandsRef.current = audioBands;
  }, [audioBands]);

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
    workspaceMode,
  ]);

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
    await readMusicDirectory(handle, snapshot);
    return true;
  }

  async function restoreOutputDirectory() {
    const handle = await loadDirectoryHandle("output-directory");
    if (!handle) return;
    outputDirectoryRef.current = handle;
    setOutputFolderName(handle.name);
  }

  async function chooseMusicDirectory() {
    if (!window.showDirectoryPicker) {
      fallbackFolderInputRef.current?.click();
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({
        id: "sonara-hub-music",
        mode: "readwrite",
        startIn: "music",
      });
      await saveDirectoryHandle("music-directory", handle);
      musicDirectoryRef.current = handle;
      await readMusicDirectory(handle);
    } catch (reason) {
      if ((reason as DOMException)?.name !== "AbortError")
        setError(messageOf(reason));
    }
  }

  async function chooseOutputDirectory() {
    if (!window.showDirectoryPicker) {
      setError(
        "O navegador atual nao oferece escolha persistente de pasta de saida.",
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
    const entries: Array<{ name: string; file: File }> = [];
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind !== "file" || !isAudioName(name)) continue;
      const file = await entry.getFile();
      entries.push({ name, file });
    }
    const next: TrackDraft[] = [];
    setFolderImportProgress({
      current: 0,
      total: entries.length,
      name: handle.name,
    });
    for (const [index, entry] of entries.entries()) {
      setFolderImportProgress({
        current: index + 1,
        total: entries.length,
        name: entry.name,
      });
      const info = await readUploadedAudioMetadata(entry.file);
      next.push(trackFromFile(entry.file, info));
    }
    next.sort((first, second) =>
      first.sourceKey.localeCompare(second.sourceKey, "pt-BR"),
    );
    setFolderName(handle.name);
    setWorkspaceTracks(finalizeImportedTracks(next), snapshot);
    setFolderImportProgress(null);
  }

  async function readUploadedAudioMetadata(file: File) {
    const formData = new FormData();
    formData.append("audio", file);
    formData.append("relativePath", file.webkitRelativePath || file.name);
    try {
      const payload = await fetchJsonWithRetry<{
        metadata: AudioInfo;
        analysis: AudioTechnicalAnalysis;
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
        analysis: payload.analysis,
        suggestions: payload.suggestions,
      };
    } catch (reason) {
      setError(localApiMessage(reason, "ler os metadados do audio"));
      return undefined;
    }
  }

  async function onFallbackFolder(files: FileList | null) {
    const audioFiles = Array.from(files ?? []).filter(
      (file) =>
        isAudioName(file.name) &&
        !file.webkitRelativePath
          .split("/")
          .some((segment) => ["Tratados", "art"].includes(segment)),
    );
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
      next.push(trackFromFile(file, await readUploadedAudioMetadata(file)));
    }
    setFolderName("Pasta selecionada");
    const finalized = finalizeImportedTracks(next);
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

  function toggleLeftPanel() {
    const next = !leftCollapsed;
    setLeftCollapsed(next);
    if (!next && window.innerWidth <= 980) setRightCollapsed(true);
  }

  function toggleRightPanel() {
    const next = !rightCollapsed;
    setRightCollapsed(next);
    if (!next && window.innerWidth <= 980) setLeftCollapsed(true);
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

  async function analyzeSelectedAudio() {
    if (!selectedTrack) return;
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
      setError(localApiMessage(reason, "analisar a qualidade do audio"));
    }
  }

  async function processReviewedAudio() {
    if (!selectedTrack) return;
    const selected =
      workflowMode === "batch"
        ? tracks.filter((track) => track.selectedForBatch)
        : [selectedTrack];
    setBatchFeedback(
      workflowMode === "batch"
        ? `Processamento iniciado para ${selected.length} arquivo${selected.length === 1 ? "" : "s"}.`
        : "Processamento iniciado.",
    );
    for (const track of selected) await submitAudioProcess(track);
  }

  async function submitAudioProcess(track: TrackDraft) {
    const formData = new FormData();
    if (track.sourceFile) formData.append("audio", track.sourceFile);
    else formData.append("inputAudio", track.sourceKey);
    if (cover) formData.append("cover", cover.file);
    formData.append(
      "draft",
      JSON.stringify(audioDraftFromMetadata(track.metadata)),
    );
    formData.append("coverSeries", String(coverSeries));
    formData.append("coverStyle", coverStyle);
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
    } catch (reason) {
      setError(localApiMessage(reason, "iniciar o tratamento do audio"));
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
    const patch: Partial<TrackMetadata> = {
      artist: batchCommon.artist,
      album: batchCommon.album,
      albumArtist: batchCommon.albumArtist,
      composer: batchCommon.composer,
      genre: batchCommon.genre,
      year: batchCommon.year,
      copyright: batchCommon.copyright,
      comment: batchCommon.comment,
      trackTotal: batchCommon.trackTotal,
      diskNumber: batchCommon.diskNumber,
      diskTotal: batchCommon.diskTotal,
      normalizationEnabled: batchCommon.normalizationEnabled,
    };
    setTracks((current) =>
      current.map((track) =>
        track.selectedForBatch
          ? { ...track, metadata: { ...track.metadata, ...patch } }
          : track,
      ),
    );
    setBatchFeedback("Dados comuns aplicados aos arquivos selecionados.");
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
    setBatchFeedback("Dados de publicacao aplicados ao lote.");
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
    if (cover) formData.append("cover", cover.file);
    formData.append("visualSettings", JSON.stringify(track.scene));
    formData.append(
      "compositionSettings",
      JSON.stringify({ mediaLayers: track.layers.map(stripLayerFile) }),
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
      setError(localApiMessage(reason, "iniciar a exportacao"));
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
              setError(localApiMessage(reason, "integrar a copia tratada")),
            );
          } else {
            void copyOutput(job).catch((reason) =>
              setError(
                localApiMessage(reason, "copiar os arquivos exportados"),
              ),
            );
          }
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
                  message: "Servidor local indisponivel",
                }
              : item,
          ),
        );
        setError(localApiMessage(reason, "acompanhar a exportacao"));
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
      throw new Error("A pasta de saida precisa de permissao para escrita.");
    }
    await copyUrlToDirectory(handle, job.outputUrl);
    await copyUrlToDirectory(handle, job.sidecarUrl);
    if (job.thumbnailUrl) await copyUrlToDirectory(handle, job.thumbnailUrl);
  }

  async function integrateTreatedAudio(job: RenderJob) {
    if (!job.outputUrl || integratedAudioJobsRef.current.has(job.id)) return;
    integratedAudioJobsRef.current.add(job.id);
    const directory = musicDirectoryRef.current;
    if (directory) {
      let permission = await directory.queryPermission?.({ mode: "readwrite" });
      if (permission !== "granted") {
        permission = await directory.requestPermission?.({ mode: "readwrite" });
      }
      if (permission === "granted") {
        const treatedDirectory = await directory.getDirectoryHandle(
          "Tratados",
          {
            create: true,
          },
        );
        await copyUrlToDirectory(treatedDirectory, job.outputUrl);
        if (job.thumbnailUrl) {
          const artDirectory = await treatedDirectory.getDirectoryHandle(
            "art",
            {
              create: true,
            },
          );
          await copyUrlToDirectory(artDirectory, job.thumbnailUrl);
        }
      }
    }
    const response = await fetchOptional(job.outputUrl);
    if (!response) throw new Error("A copia tratada nao esta disponivel.");
    const blob = await response.blob();
    const fileName = decodeURIComponent(
      job.outputUrl.split("/").pop() ?? "tratado.mp3",
    );
    const sourceFile = new File([blob], fileName, { type: "audio/mpeg" });
    const originId = audioJobOriginsRef.current.get(job.id);
    const origin =
      tracks.find((track) => track.id === originId) ?? selectedTrack;
    if (!origin) return;
    setProcessedAudioOutputs((current) => ({
      ...current,
      [origin.id]: job.outputUrl!,
    }));
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
        useEmbeddedCover: Boolean(cover),
      },
      audioInfo: {
        ...origin.audioInfo,
        fileName,
        durationSeconds: origin.audioInfo?.durationSeconds ?? null,
        bitrate: origin.audioInfo?.bitrate ?? null,
        codec: origin.audioInfo?.codec ?? null,
        hasEmbeddedCover: Boolean(cover),
        analysis: job.analysis,
      },
      selectedForBatch: false,
    };
    setTracks((current) => [...current, treated]);
    if (workflowMode !== "batch") setSelectedTrackId(treated.id);
  }

  async function overwriteSelectedOriginal() {
    if (!selectedTrack || selectedTrack.packageStatus === "treated") return;
    const outputUrl = processedAudioOutputs[selectedTrack.id];
    const directory = musicDirectoryRef.current;
    if (!outputUrl || !directory) return;
    if (
      !window.confirm(
        `Substituir ${selectedTrack.sourceKey}? O original sera preservado em Backup-originais/.`,
      )
    ) {
      return;
    }
    let permission = await directory.queryPermission?.({ mode: "readwrite" });
    if (permission !== "granted") {
      permission = await directory.requestPermission?.({ mode: "readwrite" });
    }
    if (permission !== "granted") {
      throw new Error("A pasta de musicas precisa de permissao para escrita.");
    }
    const backupDirectory = await directory.getDirectoryHandle(
      "Backup-originais",
      { create: true },
    );
    const originalHandle = await directory.getFileHandle(
      selectedTrack.sourceKey,
    );
    const original = await originalHandle.getFile();
    await copyFileToDirectory(
      backupDirectory,
      original,
      `${Date.now()}-${selectedTrack.sourceKey}`,
    );
    await copyUrlToDirectory(directory, outputUrl, selectedTrack.sourceKey);
  }

  function createSnapshot(): ProjectSnapshot {
    return {
      schemaVersion: 3,
      workspaceMode,
      workflowMode,
      activeStep,
      selectedTrackId,
      outputPreset,
      qualityProfile,
      showMetadata,
      coverFile: cover?.file,
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
        selectedForBatch: track.selectedForBatch,
        packageStatus: track.packageStatus,
      })),
    };
  }

  function applySnapshotSettings(snapshot?: ProjectSnapshot) {
    if (!snapshot) return;
    setWorkflowMode(snapshot.workflowMode);
    setWorkspaceMode(snapshot.workspaceMode ?? "visual");
    setActiveStep(snapshot.activeStep);
    setOutputPreset(snapshot.outputPreset);
    setQualityProfile(snapshot.qualityProfile);
    setShowMetadata(snapshot.showMetadata);
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
      className={`studio-shell ${leftCollapsed ? "left-hidden" : ""} ${rightCollapsed ? "right-hidden" : ""} ${panelsSwapped ? "panels-swapped" : ""}`}
    >
      <header className="topbar">
        <div className="brand">SONARA HUB</div>
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
              Biblioteca de audio
            </button>
            <button
              className={workspaceMode === "visual" ? "active" : ""}
              type="button"
              onClick={() => setWorkspaceMode("visual")}
            >
              Estudio visual
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
          <IconButton label="Recolher biblioteca" onClick={toggleLeftPanel}>
            {leftCollapsed ? <ChevronRight /> : <ChevronLeft />}
          </IconButton>
          <IconButton label="Recolher inspetor" onClick={toggleRightPanel}>
            {rightCollapsed ? <ChevronLeft /> : <ChevronRight />}
          </IconButton>
          <IconButton
            label="Inverter barras laterais"
            onClick={() => setPanelsSwapped((current) => !current)}
          >
            <SlidersHorizontal />
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
                ? void processReviewedAudio()
                : setActiveStep("export")
            }
          >
            <Check />
            {workspaceMode === "audio"
              ? "Revisar e processar"
              : workflowMode === "batch"
                ? "Revisar lote"
                : "Revisar exportacao"}
          </button>
        </div>
      </header>

      <aside className="library-panel">
        <div className="library-header">
          <span className="overline">Pasta de trabalho</span>
          <div>
            <strong>{folderName}</strong>
            <button type="button" onClick={() => void chooseMusicDirectory()}>
              Trocar
            </button>
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
            Faixa unica
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
          <span>{tracks.length} musicas</span>
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
                <Music2 />
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
            className="dashed-action"
            type="button"
            onClick={() => void chooseMusicDirectory()}
          >
            <FolderOpen /> Abrir pasta com escrita
          </button>
          <button
            className="quiet-action"
            type="button"
            onClick={() => fallbackFolderInputRef.current?.click()}
          >
            <FolderOpen /> Importar pasta
          </button>
          <button
            className="quiet-action"
            type="button"
            onClick={() => audioInputRef.current?.click()}
          >
            <Plus /> Adicionar arquivo
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
      </aside>

      <section className="preview-workspace">
        {workspaceMode === "audio" ? (
          <AudioLibraryWorkspace
            audioBands={audioBands}
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
            onBatchCommon={setBatchCommon}
            onCancelAllJobs={() => void cancelAllJobs()}
            onCancelJob={(id) => void cancelJob(id)}
            onPauseQueue={() => void pauseQueue()}
            onProcess={() => void processReviewedAudio()}
            onResumeQueue={() => void resumeQueue()}
            onSelectTrack={setSelectedTrackId}
            onToggleTrack={toggleTrackBatchSelection}
            onTrackMetadata={updateTrackMetadata}
          />
        ) : (
          <div className="canvas-table">
            <div className="preview-frame">
              <ScenePreview
                audioBandsRef={audioBandsRef}
                coverSrc={cover?.src}
                layers={selectedTrack?.layers ?? []}
                metadata={selectedTrack?.metadata ?? defaultMetadata}
                scene={selectedScene}
                showMetadata={showMetadata}
              />
            </div>
          </div>
        )}
        <Transport
          audioRef={audioRef}
          audioSrc={audioSrc}
          onToggle={() => void togglePlayback()}
        />
      </section>

      <aside className="inspector-panel">
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
                cover={cover}
                coverSeries={coverSeries}
                coverStyle={coverStyle}
                metadata={selectedTrack.metadata}
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
                onClearCover={() => setCover(null)}
                onCoverSeries={setCoverSeries}
                onCoverStyle={setCoverStyle}
                onProcess={() => void processReviewedAudio()}
                canOverwrite={Boolean(
                  selectedTrack.packageStatus !== "treated" &&
                  processedAudioOutputs[selectedTrack.id] &&
                  musicDirectoryRef.current,
                )}
                onOverwrite={() =>
                  void overwriteSelectedOriginal().catch((reason) =>
                    setError(
                      localApiMessage(reason, "sobrescrever o original"),
                    ),
                  )
                }
              />
            ) : activeStep === "music" ? (
              <MusicInspector
                cover={cover}
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
                onClearCover={() => setCover(null)}
                onCreateVariation={createVariation}
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
                onColors={updateColors}
                onCommon={updateCommon}
                onDeletePreset={() => void deletePreset()}
                onDuplicatePreset={() => void duplicatePreset()}
                onMoveLayer={moveLayer}
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
                onChange={updateMetadata}
                onCommon={updateCommon}
                onToggle={setShowMetadata}
              />
            ) : (
              <ExportInspector
                coverName={cover?.file.name}
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
            Abra uma pasta de musicas para iniciar.
          </div>
        )}
      </aside>

      <footer className="statusbar">
        <span className="save-status">
          <Check /> Alteracoes salvas
        </span>
        {workspaceMode === "visual" ? (
          <nav className="steps" aria-label="Etapas do projeto">
            {(["music", "visual", "text", "export"] as ActiveStep[]).map(
              (step, index) => (
                <button
                  className={step === activeStep ? "active" : ""}
                  key={step}
                  type="button"
                  onClick={() => setActiveStep(step)}
                >
                  <span>{index + 1}</span>
                  {stepLabel(step)}
                </button>
              ),
            )}
          </nav>
        ) : (
          <span className="audio-flow">
            Analisar · revisar pacote · processar copia
          </span>
        )}
        <span className="project-state">Projeto atual · autosave local</span>
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
          if (file) setCover({ file, src: URL.createObjectURL(file) });
        }}
      />
      <audio ref={audioRef} src={audioSrc || undefined} />
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
  batchCommon,
  batchFeedback,
  folderImportProgress,
  jobs,
  onApplyBatchCommon,
  onBatchCommon,
  onCancelAllJobs,
  onCancelJob,
  onPauseQueue,
  onProcess,
  onResumeQueue,
  onSelectTrack,
  onToggleTrack,
  onTrackMetadata,
  queuePaused,
  selectedTrack,
  selectedTrackId,
  tracks,
  workflowMode,
}: {
  audioBands: AudioBands;
  batchCommon: BatchCommonDraft;
  batchFeedback: string;
  folderImportProgress: { current: number; total: number; name: string } | null;
  jobs: RenderJob[];
  onApplyBatchCommon: () => void;
  onBatchCommon: (patch: BatchCommonDraft) => void;
  onCancelAllJobs: () => void;
  onCancelJob: (id: string) => void;
  onPauseQueue: () => void;
  onProcess: () => void;
  onResumeQueue: () => void;
  onSelectTrack: (id: string) => void;
  onToggleTrack: (id: string, selected: boolean) => void;
  onTrackMetadata: (id: string, patch: Partial<TrackMetadata>) => void;
  queuePaused: boolean;
  selectedTrack?: TrackDraft;
  selectedTrackId: string;
  tracks: TrackDraft[];
  workflowMode: "single" | "batch";
}) {
  if (workflowMode === "batch") {
    const selectedCount = tracks.filter(
      (track) => track.selectedForBatch,
    ).length;
    return (
      <div className="audio-library batch-library">
        <header className="audio-library-heading">
          <div>
            <span className="overline">Biblioteca de audio</span>
            <h1>Revisao e tratamento do lote</h1>
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
        <section className="batch-toolbar" aria-label="Dados comuns do lote">
          <div className="batch-toolbar-head">
            <div>
              <span className="overline">Dados comuns do lote</span>
              <strong>Aplicar sem sobrescrever titulo e ordem</strong>
            </div>
            {batchFeedback && <em>{batchFeedback}</em>}
          </div>
          <div className="batch-toolbar-grid">
            <TextField
              label="Artista principal"
              value={batchCommon.artist}
              onChange={(artist) => onBatchCommon({ ...batchCommon, artist })}
            />
            <TextField
              label="Album"
              value={batchCommon.album}
              onChange={(album) => onBatchCommon({ ...batchCommon, album })}
            />
            <TextField
              label="Artista do album"
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
              label="Genero"
              value={batchCommon.genre}
              onChange={(genre) => onBatchCommon({ ...batchCommon, genre })}
            />
            <TextArea
              label="Comentario ID3"
              rows={2}
              value={batchCommon.comment}
              onChange={(comment) => onBatchCommon({ ...batchCommon, comment })}
            />
          </div>
          <div className="batch-toolbar-actions">
            <CheckField
              label="Normalizar copias"
              checked={batchCommon.normalizationEnabled}
              onChange={(normalizationEnabled) =>
                onBatchCommon({ ...batchCommon, normalizationEnabled })
              }
            />
            <TextField
              label="Total de faixas"
              value={String(batchCommon.trackTotal)}
              onChange={(value) =>
                onBatchCommon({
                  ...batchCommon,
                  trackTotal: Math.max(1, Number(value) || 1),
                })
              }
            />
            <button
              className="primary-action"
              type="button"
              onClick={onApplyBatchCommon}
            >
              <Check /> Aplicar aos selecionados
            </button>
            <button
              className="upload-action"
              disabled={selectedCount === 0}
              type="button"
              onClick={onProcess}
            >
              <FileAudio /> Processar selecionados
            </button>
          </div>
        </section>
        <BatchJobBoard
          jobs={jobs}
          onCancelAll={onCancelAllJobs}
          onCancelJob={onCancelJob}
          onPause={onPauseQueue}
          onResume={onResumeQueue}
          queuePaused={queuePaused}
        />
        <div className="batch-table-wrap">
          <table className="batch-table">
            <thead>
              <tr>
                <th></th>
                <th>Faixa</th>
                <th>Titulo</th>
                <th>Artista</th>
                <th>Album</th>
                <th>Arquivo tratado</th>
                <th>Pacote</th>
                <th>LUFS</th>
                <th>TP</th>
                <th>Normalizar</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <tr
                  className={track.id === selectedTrackId ? "selected" : ""}
                  key={track.id}
                  onClick={() => onSelectTrack(track.id)}
                >
                  <td>
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
                  <td>
                    <input
                      aria-label="Faixa"
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
                  </td>
                  <td>
                    <input
                      aria-label="Titulo"
                      value={track.metadata.title}
                      onChange={(event) =>
                        onTrackMetadata(track.id, {
                          title: event.target.value,
                        })
                      }
                    />
                  </td>
                  <td>
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
                  <td>
                    <input
                      aria-label="Album"
                      value={track.metadata.album}
                      onChange={(event) =>
                        onTrackMetadata(track.id, {
                          album: event.target.value,
                        })
                      }
                    />
                  </td>
                  <td>
                    <span className="filename-preview">
                      {previewTreatedFileName(track.metadata)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`quality-badge ${track.packageStatus ?? "original"}`}
                    >
                      {track.packageStatus === "treated"
                        ? "Tratado"
                        : "Original"}
                    </span>
                  </td>
                  <td>
                    {formatMetric(
                      track.audioInfo?.analysis?.integratedLufs,
                      " LUFS",
                    )}
                  </td>
                  <td>
                    {formatMetric(
                      track.audioInfo?.analysis?.truePeakDbtp,
                      " dBTP",
                    )}
                  </td>
                  <td>
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
              ))}
            </tbody>
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
          <span className="overline">Biblioteca de audio</span>
          <h1>{selectedTrack?.metadata.title || "Selecione uma faixa"}</h1>
        </div>
        {analysis && (
          <span className={`quality-badge ${analysis.risk}`}>
            {riskLabel(analysis.risk)}
          </span>
        )}
      </header>
      <div className="analytic-stage">
        <AnalyticalWaveform samples={audioBands.samples} />
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
        <Metric label="Codec" value={selectedTrack?.audioInfo?.codec || "--"} />
        <Metric
          label="Duracao"
          value={formatDuration(selectedTrack?.audioInfo?.durationSeconds)}
        />
      </dl>
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
  onCancelAll,
  onCancelJob,
  onPause,
  onResume,
  queuePaused,
}: {
  jobs: RenderJob[];
  onCancelAll: () => void;
  onCancelJob: (id: string) => void;
  onPause: () => void;
  onResume: () => void;
  queuePaused: boolean;
}) {
  const activeJobs = jobs.filter((job) => job.kind === "audio-process");
  return (
    <section className="batch-job-board">
      <header>
        <div>
          <span className="overline">Processamento do lote</span>
          <strong>
            {activeJobs.length
              ? `${activeJobs.length} item${activeJobs.length === 1 ? "" : "s"} na fila`
              : "Nenhum processamento iniciado"}
          </strong>
        </div>
        <div className="batch-job-actions">
          <button type="button" onClick={queuePaused ? onResume : onPause}>
            {queuePaused ? <Play /> : <Pause />}
            {queuePaused ? "Retomar fila" : "Pausar fila"}
          </button>
          <button type="button" onClick={onCancelAll}>
            <X /> Cancelar todos
          </button>
        </div>
      </header>
      {activeJobs.length === 0 ? (
        <p className="helper-copy">
          Ao processar, cada arquivo aparece aqui com etapa, progresso e
          controle de cancelamento.
        </p>
      ) : (
        <div className="batch-job-list">
          {activeJobs.map((job) => (
            <div className={`batch-job-row ${job.status}`} key={job.id}>
              <div>
                <strong>{job.metadata?.title || job.message}</strong>
                <small>
                  {jobStatusLabel(job.status)} · {job.message}
                </small>
              </div>
              <progress max={100} value={job.progress} />
              <span>{job.progress}%</span>
              <button
                disabled={["done", "error", "canceled"].includes(job.status)}
                type="button"
                onClick={() => onCancelJob(job.id)}
              >
                <X /> Cancelar
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AudioLibraryInspector({
  analysis,
  cover,
  coverSeries,
  coverStyle,
  metadata,
  workflowMode,
  onAnalyze,
  onApplySuggestions,
  onChange,
  onChooseCover,
  onClearCover,
  onCoverSeries,
  onCoverStyle,
  canOverwrite,
  onOverwrite,
  onProcess,
}: {
  analysis?: AudioTechnicalAnalysis;
  cover: { file: File; src: string } | null;
  coverSeries: boolean;
  coverStyle: "roman" | "arabic";
  metadata: TrackMetadata;
  workflowMode: "single" | "batch";
  onAnalyze: () => void;
  onApplySuggestions: () => void;
  onChange: (patch: Partial<TrackMetadata>) => void;
  onChooseCover: () => void;
  onClearCover: () => void;
  onCoverSeries: (value: boolean) => void;
  onCoverStyle: (value: "roman" | "arabic") => void;
  canOverwrite: boolean;
  onOverwrite: () => void;
  onProcess: () => void;
}) {
  return (
    <>
      <InspectorGroup title="Dados" open>
        <TextField
          label="Titulo"
          value={metadata.title}
          onChange={(title) => onChange({ title })}
        />
        <TextField
          label="Artista"
          value={metadata.artist}
          onChange={(artist) => onChange({ artist })}
        />
        <TextField
          label="Album"
          value={metadata.album}
          onChange={(album) => onChange({ album })}
        />
        <TextField
          label="Artista do album"
          value={metadata.albumArtist}
          onChange={(albumArtist) => onChange({ albumArtist })}
        />
        <TextField
          label="Genero"
          value={metadata.genre}
          onChange={(genre) => onChange({ genre })}
        />
        <TextField
          label="Compositor"
          value={metadata.composer}
          onChange={(composer) => onChange({ composer })}
        />
        <TextArea
          label="Comentario ID3"
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
          Aplicar sugestoes do arquivo
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
        <CheckField
          label="Gerar serie numerada"
          checked={coverSeries}
          onChange={onCoverSeries}
        />
        {coverSeries && (
          <SelectField
            label="Numeracao"
            value={coverStyle}
            onChange={(value) =>
              onCoverStyle(value === "arabic" ? "arabic" : "roman")
            }
          >
            <option value="roman">Romana · I a V</option>
            <option value="arabic">Arabica · 1 a 5</option>
          </SelectField>
        )}
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
          label="Normalizar copia tratada para -14 LUFS / -1 dBTP"
          checked={metadata.normalizationEnabled}
          onChange={(normalizationEnabled) =>
            onChange({ normalizationEnabled })
          }
        />
        <button className="quiet-action" type="button" onClick={onAnalyze}>
          <SlidersHorizontal /> Analisar qualidade
        </button>
        <button
          className="primary-action wide"
          type="button"
          onClick={onProcess}
        >
          <Check />{" "}
          {workflowMode === "batch"
            ? "Revisar e processar lote"
            : "Revisar e processar copia"}
        </button>
        {canOverwrite && (
          <button className="quiet-danger" type="button" onClick={onOverwrite}>
            Sobrescrever original com backup
          </button>
        )}
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
}: {
  audioBandsRef: React.MutableRefObject<AudioBands>;
  coverSrc?: string;
  layers: MediaLayerV2[];
  metadata: TrackMetadata;
  scene: ScenePresetV3;
  showMetadata: boolean;
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
    }).then((composition) => {
      if (!active) return;
      compositionRef.current = composition;
      runtimeRef.current?.setComposition(composition);
    });
    return () => {
      active = false;
    };
  }, [coverSrc, layers, metadata, showMetadata]);

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

function Transport({
  audioRef,
  audioSrc,
  onToggle,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioSrc: string;
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
      <IconButton
        label={playing ? "Pausar previa" : "Tocar previa"}
        onClick={onToggle}
      >
        {playing ? <Pause /> : <Play />}
      </IconButton>
      <strong>{formatDuration(time)}</strong>
      <input
        aria-label="Posicao da previa"
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
      <span>{formatDuration(duration)}</span>
      <small>Previa · Automatico</small>
    </div>
  );
}

function MusicInspector({
  cover,
  metadata,
  onApplySuggestions,
  onApplyCommonBatch,
  onChange,
  onChooseCover,
  onClearCover,
  onCreateVariation,
  onReplaceAudio,
}: {
  cover: { file: File; src: string } | null;
  metadata: TrackMetadata;
  onApplyCommonBatch?: () => void;
  onApplySuggestions: () => void;
  onChange: (patch: Partial<TrackMetadata>) => void;
  onChooseCover: () => void;
  onClearCover: () => void;
  onCreateVariation: () => void;
  onReplaceAudio?: () => void;
}) {
  return (
    <>
      <InspectorGroup title="Faixa" open>
        <TextField
          label="Titulo"
          value={metadata.title}
          onChange={(title) => onChange({ title })}
        />
        <TextField
          label="Artista"
          value={metadata.artist}
          onChange={(artist) => onChange({ artist })}
        />
        <TextField
          label="Album"
          value={metadata.album}
          onChange={(album) => onChange({ album })}
        />
        <TextField
          label="Versao"
          value={metadata.version}
          onChange={(version) => onChange({ version })}
        />
        <div className="inline-actions">
          <button type="button" onClick={onApplySuggestions}>
            <RotateCcw /> Usar dados do audio
          </button>
          <button type="button" onClick={onCreateVariation}>
            <Copy /> Criar variacao
          </button>
        </div>
        {onReplaceAudio && (
          <button
            className="upload-action"
            type="button"
            onClick={onReplaceAudio}
          >
            <FileAudio /> Trocar audio desta versao
          </button>
        )}
        {onApplyCommonBatch && (
          <button
            className="upload-action"
            type="button"
            onClick={onApplyCommonBatch}
          >
            <Layers3 /> Aplicar album e artista ao lote
          </button>
        )}
      </InspectorGroup>
      <InspectorGroup title="Arte do album" open>
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
      </InspectorGroup>
      <InspectorGroup title="Descricao e publicacao">
        <TextArea
          label="Descricao / letra manual"
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
  onColors: (key: "base" | "effect" | "light", value: string) => void;
  onCommon: (key: string, value: number) => void;
  onDeletePreset: () => void;
  onDuplicatePreset: () => void;
  onMoveLayer: (id: string, direction: -1 | 1) => void;
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
          label="Direcao"
          max={360}
          unit="°"
          value={scene.common.direction}
          onChange={(value) => props.onCommon("direction", value)}
        />
        <RangeField
          label="Reacao musical"
          value={scene.common.audioReaction}
          onChange={(value) => props.onCommon("audioReaction", value)}
        />
      </InspectorGroup>
      <InspectorGroup title="Ajustes avancados">
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
      <InspectorGroup title={`Camadas · ${props.layers.length}/3`} open>
        <LayerEditor {...props} />
      </InspectorGroup>
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
            </div>
            <div className="inspector-subsection">
              <p className="inspector-kicker">Aparencia</p>
              <ColorInput
                label="Cor"
                value={scene.waveform.color}
                onChange={(color) => props.onWaveform({ color })}
              />
              <RangeField
                label="Opacidade"
                value={scene.waveform.opacity}
                onChange={(opacity) => props.onWaveform({ opacity })}
              />
              <RangeField
                label="Altura"
                value={scene.waveform.height}
                onChange={(height) => props.onWaveform({ height })}
              />
              <RangeField
                label="Posicao"
                value={scene.waveform.position}
                onChange={(position) => props.onWaveform({ position })}
              />
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
              <RangeField
                label="Suavizacao"
                value={scene.waveform.smoothing}
                onChange={(smoothing) => props.onWaveform({ smoothing })}
              />
              <RangeField
                label="Reacao musical"
                value={scene.waveform.audioReaction}
                onChange={(audioReaction) =>
                  props.onWaveform({ audioReaction })
                }
              />
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
                    label="Rotacao"
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
                </>
              )}
            </div>
          </>
        )}
      </InspectorGroup>
    </>
  );
}

function LayerEditor(props: {
  layers: MediaLayerV2[];
  lastRemovedLayer: MediaLayerV2 | null;
  onAddLayer: () => void;
  onMoveLayer: (id: string, direction: -1 | 1) => void;
  onRemoveLayer: (id: string) => void;
  onUndoLayer: () => void;
  onUpdateLayer: (id: string, patch: Partial<MediaLayerV2>) => void;
}) {
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
            label="Rotacao"
            min={-180}
            max={180}
            unit="°"
            value={layer.rotation}
            onChange={(rotation) => props.onUpdateLayer(layer.id, { rotation })}
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
              label="Repetir video"
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
  onChange,
  onCommon,
  onToggle,
}: {
  metadata: TrackMetadata;
  scene: ScenePresetV3;
  showMetadata: boolean;
  onChange: (patch: Partial<TrackMetadata>) => void;
  onCommon: (key: string, value: number) => void;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <InspectorGroup title="Texto no video" open>
      <CheckField
        label="Mostrar titulo e artista"
        checked={showMetadata}
        onChange={onToggle}
      />
      <TextField
        label="Titulo"
        value={metadata.title}
        onChange={(title) => onChange({ title })}
      />
      <TextField
        label="Artista"
        value={metadata.artist}
        onChange={(artist) => onChange({ artist })}
      />
      <RangeField
        label="Escurecimento do fundo"
        value={scene.common.shade}
        onChange={(value) => onCommon("shade", value)}
      />
      <p className="helper-copy">
        O texto permanece discreto no topo esquerdo. A waveform, quando ativa,
        ocupa a faixa inferior.
      </p>
    </InspectorGroup>
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
  onExport: () => void;
  onApplyBatch?: () => void;
  onMetadata: (patch: Partial<TrackMetadata>) => void;
  onPreset: (value: string) => void;
  onQuality: (value: string) => void;
  onUseDarkAudio: () => void;
}) {
  const resolution =
    outputPresets.find(([value]) => value === outputPreset) ?? outputPresets[1];
  return (
    <>
      <InspectorGroup title="Resumo da exportacao" open>
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
        <SelectField label="Resolucao" value={outputPreset} onChange={onPreset}>
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
          <Disc3 /> Usar tela escura com audio
        </button>
        <button
          className="primary-action wide"
          disabled={workflowMode === "batch" && batchCount === 0}
          type="button"
          onClick={onExport}
        >
          <Video />{" "}
          {workflowMode === "batch" ? "Exportar lote" : "Exportar video"}
        </button>
      </InspectorGroup>
      <InspectorGroup title="Publicacao YouTube">
        <SelectField
          label="Privacidade"
          value={metadata.visibility}
          onChange={(visibility) => onMetadata({ visibility })}
        >
          <option value="private">Privado</option>
          <option value="unlisted">Nao listado</option>
          <option value="public">Publico</option>
        </SelectField>
        <TextField
          label="Idioma"
          value={metadata.language}
          onChange={(language) => onMetadata({ language })}
        />
        <TextArea
          label="Descricao"
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
            <Layers3 /> Aplicar publicacao ao lote
          </button>
        )}
        <p className="helper-copy">
          A exportacao inclui um arquivo `.youtube.json`. O upload por OAuth
          fica para uma etapa posterior.
        </p>
      </InspectorGroup>
      <InspectorGroup title={`Fila · ${jobs.length}`} open>
        {jobs.length === 0 ? (
          <p className="helper-copy">As exportacoes aparecem aqui.</p>
        ) : (
          jobs.map((job) => (
            <div className="job-row" key={job.id}>
              <span>
                <strong>{job.message}</strong>
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
  };
}

function trackFromFile(file: File, info?: AudioInfo): TrackDraft {
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
    sourceKey: file.name,
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
    layers: saved.layers.map((layer) => ({
      ...layer,
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
    useEmbeddedCover: Boolean(info?.hasEmbeddedCover),
  };
}

function finalizeImportedTracks(tracks: TrackDraft[]) {
  const total = Math.max(1, tracks.length);
  return tracks.map((track, index) => ({
    ...track,
    metadata: {
      ...track.metadata,
      trackNumber: track.metadata.trackNumber || index + 1,
      trackTotal: total,
    },
  }));
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
    "decode-error": "Falha na analise",
  }[risk];
}

function riskDescription(analysis: AudioTechnicalAnalysis) {
  if (analysis.risk === "reduced-headroom") {
    return `Margem reduzida: pico verdadeiro em ${analysis.truePeakDbtp.toFixed(2)} dBTP. Nao ha clipping confirmado; considere normalizar a copia tratada.`;
  }
  if (analysis.risk === "overload") {
    return `Sobrecarga detectada: pico verdadeiro em ${analysis.truePeakDbtp.toFixed(2)} dBTP. Revise antes de exportar.`;
  }
  if (analysis.risk === "safe") {
    return `Margem adequada: ${analysis.integratedLufs.toFixed(1)} LUFS e ${analysis.truePeakDbtp.toFixed(2)} dBTP.`;
  }
  return "Nao foi possivel decodificar o audio para a analise tecnica.";
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
    music: "Musica",
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
    done: "concluido",
    error: "falhou",
    canceled: "cancelado",
  }[status];
}

async function copyUrlToDirectory(
  handle: FileSystemDirectoryHandle,
  url: string,
  fileNameOverride?: string,
) {
  const response = await fetchOptional(url);
  if (!response) {
    throw new Error(`Arquivo exportado nao encontrado: ${url}`);
  }
  if (!response.body) {
    throw new Error(`Arquivo exportado sem conteudo: ${url}`);
  }
  const fileName =
    fileNameOverride ??
    decodeURIComponent(url.split("/").pop() ?? "export.bin");
  const file = await handle.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  await response.body.pipeTo(writable);
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
