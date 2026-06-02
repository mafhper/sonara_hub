import fs from "node:fs/promises";
import path from "node:path";

const activeStatuses = new Set(["queued", "paused", "running"]);

export async function loadJobHistory(filePath) {
  try {
    const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (!Array.isArray(payload)) return [];
    return restoreInterruptedJobs(payload);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveJobHistory(filePath, jobs, limit = 50) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const tempPath = `${filePath}.tmp`;
  const recent = [...jobs].slice(-limit);
  await fs.writeFile(tempPath, `${JSON.stringify(recent, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

export function restoreInterruptedJobs(jobs) {
  return jobs.map((job) =>
    activeStatuses.has(job.status)
      ? {
          ...job,
          status: "error",
          message:
            "Processamento interrompido pela reinicializacao do servidor local",
          updatedAt: new Date().toISOString(),
        }
      : job,
  );
}
