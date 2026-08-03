import fs from "node:fs/promises";
import path from "node:path";

export async function assertOwnedPath(rootDirectory, candidate) {
  const root = path.resolve(rootDirectory);
  const target = path.resolve(candidate);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Caminho fora do diretório permitido.");
  }
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error("Links simbólicos não são aceitos.");
      }
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
  return target;
}
