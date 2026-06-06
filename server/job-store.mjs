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

export function restoreInterruptedJobs(jobs, now = new Date()) {
  const restoredAt = new Date(now);
  return jobs.map((job) => {
    if (!activeStatuses.has(job.status)) return job;
    const stagePatch = closeInterruptedStage(job, restoredAt);
    if (job.cancelRequested) {
      return {
        ...job,
        ...stagePatch,
        status: "canceled",
        message:
          "Processamento cancelado antes da reinicializacao do servidor local",
        updatedAt: restoredAt.toISOString(),
      };
    }
    return {
      ...job,
      ...stagePatch,
      status: "error",
      errorCode: job.errorCode ?? "server-restart",
      errorDetail:
        job.errorDetail ??
        "O servidor local foi encerrado antes de concluir este job.",
      message:
        "Processamento interrompido pela reinicializacao do servidor local",
      updatedAt: restoredAt.toISOString(),
    };
  });
}

function closeInterruptedStage(job, restoredAt) {
  if (!job.stage || !job.stageStartedAt) {
    return { stageStartedAt: null };
  }
  const startedAt = new Date(job.stageStartedAt);
  const durationMs = Number.isNaN(startedAt.getTime())
    ? 0
    : Math.max(0, Math.round(restoredAt.getTime() - startedAt.getTime()));
  return {
    stageStartedAt: null,
    stageTimings: [
      ...(Array.isArray(job.stageTimings) ? job.stageTimings : []),
      {
        durationMs,
        endedAt: restoredAt.toISOString(),
        interrupted: true,
        label: job.message || job.stage,
        stage: job.stage,
        startedAt: job.stageStartedAt,
      },
    ],
  };
}
