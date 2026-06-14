import {
  chooseAlbumArtworkForTrack,
  chooseArtworkForTrack,
  listArtworkOptionsForTrack,
} from "../../../shared/artwork-convention.mjs";
import { listLyricsOptionsForTrack } from "../../../shared/lyrics-convention.mjs";
import type { LyricsPathSuggestion } from "../../../shared/lyrics-convention.mjs";
import type {
  ArtworkSuggestion,
  LyricsSuggestion,
  TrackDraft,
} from "../../types";
import type { DirectoryAssetEntry } from "./workspaceFiles";

export function attachSuggestedArtwork(
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

export async function attachSuggestedLyrics(
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

export function lyricPreview(value: string) {
  const lines = String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(0, 3).join(" / ").slice(0, 160);
}
