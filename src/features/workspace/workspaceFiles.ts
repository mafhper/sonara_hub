import type { InputProjectOption } from "../../app/appTypes";
import { isArtworkName } from "../../../shared/artwork-convention.mjs";
import { isLyricsTextPath } from "../../../shared/lyrics-convention.mjs";

export type DirectoryAssetEntry = { file: File; relativePath: string };

export async function collectDirectoryAssets(
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

export async function discoverInputProjects(
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

export async function countDirectAudioFiles(handle: FileSystemDirectoryHandle) {
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

export async function countAudioFiles(
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

export async function ensureAlbumArtworkDirectories(
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

export function isAudioName(name: string) {
  return /\.(mp3|wav|m4a|flac|aac|ogg)$/i.test(name);
}

export function isPrivateAudioPath(value: string) {
  return (
    isPrivateAssetPath(value) ||
    pathSegments(value).some((segment) => segment === "art")
  );
}

export function isPrivateAssetPath(value: string) {
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
