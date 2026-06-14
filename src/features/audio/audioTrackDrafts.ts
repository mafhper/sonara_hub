import { cloneTextSettings } from "../../inspectors/text-presets";
import { defaultMetadata } from "../../app/appDefaults";
import { normalizeVisualSettings } from "../../../shared/visual-effects.mjs";
import type {
  AudioInfo,
  ArtworkSuggestion,
  ProjectSnapshot,
  TrackDraft,
  TrackMetadata,
} from "../../types";

export type ProjectMetadataDefaults = Partial<
  Omit<TrackMetadata, "tags" | "year">
> & {
  tags?: string | string[];
  year?: string | number;
};

export function trackFromInput(
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

export function trackFromFile(
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

export function restoreTrack(
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

export function metadataFromAudio(
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

export function trackBatchGroupKey(track: TrackDraft) {
  const metadata = track.metadata;
  return [
    metadata.artist || "Artista desconhecido",
    metadata.album || "Álbum sem nome",
    Math.max(1, Number(metadata.diskNumber) || 1),
  ]
    .map(normalizeBatchGroupKey)
    .join("\u0000");
}

export function finalizeImportedTracks(tracks: TrackDraft[]) {
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

function titleFromSourceKey(sourceKey: string) {
  const fileName = sourceKey.split(/[\\/]+/).pop() ?? sourceKey;
  return fileName.replace(/\.[^.]+$/, "") || defaultMetadata.title;
}

function normalizeBatchGroupKey(value: string | number) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
