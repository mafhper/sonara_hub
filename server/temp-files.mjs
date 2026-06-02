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
          await fs.rm(filePath, { force: true });
        }
      };
    },
  };
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
