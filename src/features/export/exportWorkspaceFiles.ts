import { fetchOptional } from "../../../shared/local-api.mjs";
import { treatedAlbumArtworkFileName } from "../../../shared/artwork-convention.mjs";
import { prepareVideoOutputProject } from "../../../shared/video-output-folder.mjs";
import type { VideoOutputConflictMode } from "../../../shared/video-output-folder.mjs";
import type { PreparedPublicationOutputProject } from "../../app/appTypes";

export async function copyUrlToDirectory(
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

export async function preparePublicationOutputProject(
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

export function publicationAssetDirectoryForUrl(
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

export async function getWorkspaceFile(
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

export async function writeBlobToWorkspacePath(
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

export function albumFolderArtworkSourceKey(sourceKey: string) {
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

export function backupFileName(sourceKey: string, stamp: string) {
  return `${stamp}-${workspaceRelativeSegments(sourceKey, "").join("__")}`;
}

export function videoOutputBackupStamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, "")
    .replace(/[-:]/g, "")
    .replace("T", "-");
}

export async function copyFileToDirectory(
  handle: FileSystemDirectoryHandle,
  file: File,
  fileName = file.name,
) {
  const output = await handle.getFileHandle(fileName, { create: true });
  const writable = await output.createWritable();
  await file.stream().pipeTo(writable);
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
