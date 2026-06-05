export const VIDEO_OUTPUT_ASSETS_DIRECTORY = "assets";
export const VIDEO_OUTPUT_BACKUP_DIRECTORY = "backup";

export const videoOutputConflictModes = ["backup", "overwrite", "clear"];

export function normalizeVideoOutputConflictMode(value) {
  return videoOutputConflictModes.includes(value) ? value : "backup";
}

export function videoOutputProjectDirectoryName(
  metadata = {},
  fallbackProjectName = "",
) {
  return safeOutputDirectoryName(
    metadata.album ||
      metadata.project ||
      fallbackProjectName ||
      metadata.albumArtist ||
      metadata.artist ||
      "Projeto Sonara",
  );
}

export async function prepareVideoOutputProject(
  rootHandle,
  projectName,
  { backupStamp = outputBackupStamp(), conflictMode = "backup" } = {},
) {
  const safeProjectName = safeOutputDirectoryName(projectName);
  const mode = normalizeVideoOutputConflictMode(conflictMode);
  const project = await rootHandle.getDirectoryHandle(safeProjectName, {
    create: true,
  });
  let backup = null;
  const hasContent = await directoryHasEntries(project);

  if (hasContent && mode === "backup") {
    const backupRoot = await rootHandle.getDirectoryHandle(
      VIDEO_OUTPUT_BACKUP_DIRECTORY,
      { create: true },
    );
    const backupName = await uniqueBackupDirectoryName(
      backupRoot,
      `${backupStamp}-${safeProjectName}`,
    );
    backup = await backupRoot.getDirectoryHandle(backupName, { create: true });
    await moveDirectoryContents(project, backup);
  } else if (hasContent && mode === "clear") {
    await clearDirectoryContents(project);
  }

  const assets = await project.getDirectoryHandle(
    VIDEO_OUTPUT_ASSETS_DIRECTORY,
    {
      create: true,
    },
  );
  return {
    assets,
    backup,
    backupName: backup?.name ?? "",
    project,
    projectName: safeProjectName,
  };
}

export function safeOutputDirectoryName(value, fallback = "Projeto Sonara") {
  const output = String(value ?? "")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return output || fallback;
}

function outputBackupStamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, "")
    .replace(/[-:]/g, "")
    .replace("T", "-");
}

async function uniqueBackupDirectoryName(rootHandle, baseName) {
  for (let index = 1; index < 1000; index += 1) {
    const candidate = index === 1 ? baseName : `${baseName}-${index}`;
    try {
      await rootHandle.getDirectoryHandle(candidate);
    } catch {
      return candidate;
    }
  }
  return `${baseName}-${crypto.randomUUID().slice(0, 8)}`;
}

async function directoryHasEntries(handle) {
  for await (const _entry of handle.entries()) return true;
  return false;
}

async function moveDirectoryContents(source, target) {
  for await (const [name, entry] of source.entries()) {
    if (entry.kind === "directory") {
      const targetChild = await target.getDirectoryHandle(name, {
        create: true,
      });
      await moveDirectoryContents(entry, targetChild);
      await source.removeEntry(name, { recursive: true });
      continue;
    }
    const file = await entry.getFile();
    await writeFileToDirectory(target, name, file);
    await source.removeEntry(name);
  }
}

async function clearDirectoryContents(handle) {
  for await (const [name, entry] of handle.entries()) {
    await handle.removeEntry(name, { recursive: entry.kind === "directory" });
  }
}

async function writeFileToDirectory(handle, fileName, file) {
  const output = await handle.getFileHandle(fileName, { create: true });
  const writable = await output.createWritable();
  await writable.write(file);
  await writable.close();
}
