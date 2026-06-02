export function resolveDestructiveBatchState(jobIds, jobs) {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const batchJobs = jobIds.map((id) => jobsById.get(id)).filter(Boolean);
  if (batchJobs.length !== jobIds.length) {
    return { state: "waiting", jobs: batchJobs };
  }
  if (batchJobs.some((job) => ["error", "canceled"].includes(job.status))) {
    return { state: "blocked", jobs: batchJobs };
  }
  if (!batchJobs.every((job) => job.status === "done")) {
    return { state: "waiting", jobs: batchJobs };
  }
  return { state: "ready", jobs: batchJobs };
}

export async function writeReplacementsWithRollback(
  replacements,
  { backup, write },
) {
  for (const replacement of replacements) {
    await backup(replacement);
  }
  const attempted = [];
  try {
    for (const replacement of replacements) {
      attempted.push(replacement);
      await write(replacement, replacement.blob);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const replacement of attempted.reverse()) {
      try {
        await write(replacement, replacement.original);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      throw new Error(
        `${messageOf(error)} Falha adicional ao restaurar ${rollbackErrors.length} arquivo(s) original(is).`,
      );
    }
    throw error;
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
