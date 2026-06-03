import fs from "node:fs/promises";
import path from "node:path";

export function createTempFileRegistry(directory) {
  const root = path.resolve(directory);
  const references = new Map();

  return {
    async cleanup(files) {
      const release = this.retain(files);
      await release();
    },

    retain(files) {
      const tempPaths = collectTempPaths(root, files);
      for (const filePath of tempPaths) {
        references.set(filePath, (references.get(filePath) ?? 0) + 1);
      }
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        for (const filePath of tempPaths) {
          const remaining = (references.get(filePath) ?? 1) - 1;
          if (remaining > 0) {
            references.set(filePath, remaining);
            continue;
          }
          references.delete(filePath);
          await removeFileResilient(filePath);
        }
      };
    },
  };
}

// On Windows an uploaded file can still hold a lock (music-metadata, sharp or
// ffmpeg release the handle a beat after we finish) which makes fs.rm throw
// EBUSY/EPERM. A failed cleanup must never crash the server, so we retry with a
// short backoff and then give up quietly — a leftover temp file is harmless and
// gets swept by the storage cleanup endpoint.
async function removeFileResilient(
  filePath,
  { retries = 8, delayMs = 120 } = {},
) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await fs.rm(filePath, { force: true });
      return;
    } catch (error) {
      const retryable =
        error?.code === "EBUSY" ||
        error?.code === "EPERM" ||
        error?.code === "ENOTEMPTY";
      if (!retryable || attempt === retries) {
        if (error?.code !== "ENOENT") {
          console.warn(
            `Não foi possível remover o arquivo temporário ${filePath}: ${error?.code ?? error}`,
          );
        }
        return;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, delayMs * (attempt + 1)),
      );
    }
  }
}

function collectTempPaths(root, files) {
  return [
    ...new Set(
      flatten(files)
        .map((file) => (typeof file === "string" ? file : file?.path))
        .filter(Boolean)
        .map((filePath) => path.resolve(filePath))
        .filter((filePath) => isPathInside(root, filePath)),
    ),
  ];
}

function flatten(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (typeof value === "object" && !("path" in value)) {
    return Object.values(value).flatMap(flatten);
  }
  return [value];
}

function isPathInside(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return (
    Boolean(relative) &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}
