import {
  DEFAULT_PROJECT_SAVE_ID,
  PROJECT_ASSETS_DIRECTORY,
  PROJECT_SAVES_DIRECTORY,
  PROJECT_STATE_DIRECTORY,
  PROJECT_STATE_FILE,
  defaultProjectSave,
} from "../../app/appDefaults";
import type { ProjectSaveOption } from "../../app/appTypes";
import type { ProjectAssetManifestEntry, ProjectSnapshot } from "../../types";

export async function loadProjectSnapshot(
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

export async function writeProjectSnapshot(
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

export async function removeProjectSnapshot(
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

export async function saveInternalProjectSnapshot(
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

export async function loadInternalProjectSnapshot(
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

export async function deleteInternalProjectSnapshot(
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

export async function listProjectSaves(
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

export async function listInternalProjectSaves(
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

export function projectSnapshotWithSave(
  snapshot: ProjectSnapshot,
  save: ProjectSaveOption,
): ProjectSnapshot {
  return {
    ...snapshot,
    saveId: save.id,
    saveName: save.name,
  };
}

export function projectSaveOptionFromSnapshot(
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

export function ensureProjectSaveOption(
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

export function sortProjectSaves(saves: ProjectSaveOption[]) {
  return saves.sort((first, second) => {
    if (first.id === DEFAULT_PROJECT_SAVE_ID) return -1;
    if (second.id === DEFAULT_PROJECT_SAVE_ID) return 1;
    return first.name.localeCompare(second.name, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export function normalizeProjectSaveName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function projectSaveIdFromName(value: string) {
  const normalized = normalizeProjectSaveName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || `save-${Date.now()}`;
}

export function projectSaveLabelFromId(id: string) {
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
