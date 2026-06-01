import fs from "node:fs/promises";
import path from "node:path";

const cleanupScopes = new Set(["temporary", "generated", "all"]);

export async function summarizeOwnedStorage({
  uploadDir,
  workDir,
  artworkPreviewDir,
  outputDir,
}) {
  return {
    temporary: await summarizeDirectories([
      uploadDir,
      workDir,
      artworkPreviewDir,
    ]),
    generated: await summarizeDirectories([outputDir]),
  };
}

export async function cleanupOwnedStorage({
  scope,
  uploadDir,
  workDir,
  artworkPreviewDir,
  outputDir,
  treatedOutputDir,
}) {
  if (!cleanupScopes.has(scope)) {
    throw new Error("Escopo de limpeza inválido.");
  }

  const directories =
    scope === "temporary"
      ? [uploadDir, workDir, artworkPreviewDir]
      : scope === "generated"
        ? [outputDir]
        : [uploadDir, workDir, artworkPreviewDir, outputDir];
  const deleted = await summarizeDirectories(directories);

  for (const directory of directories) {
    await clearDirectoryContents(directory);
  }
  await Promise.all([
    fs.mkdir(uploadDir, { recursive: true }),
    fs.mkdir(workDir, { recursive: true }),
    fs.mkdir(artworkPreviewDir, { recursive: true }),
    fs.mkdir(outputDir, { recursive: true }),
    fs.mkdir(treatedOutputDir, { recursive: true }),
  ]);

  return deleted;
}

export async function summarizeDirectories(directories) {
  const summary = { files: 0, bytes: 0 };
  for (const directory of directories) {
    const current = await summarizeDirectory(directory);
    summary.files += current.files;
    summary.bytes += current.bytes;
  }
  return summary;
}

export async function clearDirectoryContents(directory) {
  const root = path.resolve(directory);
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const target = path.resolve(root, entry.name);
    if (!isPathInside(root, target)) {
      throw new Error("Caminho recusado durante a limpeza local.");
    }
    await fs.rm(target, { recursive: true, force: true });
  }
}

async function summarizeDirectory(directory) {
  const root = path.resolve(directory);
  const summary = { files: 0, bytes: 0 };
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return summary;
    throw error;
  }

  for (const entry of entries) {
    const target = path.resolve(root, entry.name);
    if (!isPathInside(root, target)) continue;
    if (entry.isDirectory()) {
      const nested = await summarizeDirectory(target);
      summary.files += nested.files;
      summary.bytes += nested.bytes;
      continue;
    }
    if (!entry.isFile()) continue;
    const stat = await fs.stat(target);
    summary.files += 1;
    summary.bytes += stat.size;
  }
  return summary;
}

function isPathInside(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return (
    Boolean(relative) &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}
