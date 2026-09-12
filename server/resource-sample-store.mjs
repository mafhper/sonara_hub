// F4.1 — Buffer em memória de resource-samples por job, recebidos via IPC
// (`resource-sample`) do worker de render para o processo principal. Escopo
// mínimo deliberado: permite reconstruir `timestamp → jobId → stage →
// recursos` sem novo endpoint, sem persistência e sem decisões de scheduling.
// Fronteiras: maxJobs (descarta job mais antigo) e maxSamplesPerJob (descarta
// amostras mais antigas) — protegem o servidor contra job mal-comportado.
export function createResourceSampleStore({
  maxJobs = 32,
  maxSamplesPerJob = 2000,
} = {}) {
  const safeMaxJobs = Math.max(1, Math.floor(maxJobs) || 32);
  const safeMaxSamples = Math.max(1, Math.floor(maxSamplesPerJob) || 2000);
  const jobs = new Map();

  return {
    add(jobId, sample) {
      const id = String(jobId ?? "");
      if (!id || !sample || typeof sample !== "object") return false;
      const list = jobs.get(id) ?? [];
      list.push({ jobId: id, ...sample });
      if (list.length > safeMaxSamples) {
        list.splice(0, list.length - safeMaxSamples);
      }
      jobs.set(id, list);
      if (jobs.size > safeMaxJobs) {
        const oldest = jobs.keys().next().value;
        jobs.delete(oldest);
      }
      return true;
    },
    byJob(jobId) {
      const list = jobs.get(String(jobId ?? ""));
      return list ? list.map((entry) => ({ ...entry })) : [];
    },
    jobIds() {
      return Array.from(jobs.keys());
    },
    snapshot() {
      const out = {};
      for (const [id, list] of jobs) {
        out[id] = list.map((entry) => ({ ...entry }));
      }
      return out;
    },
    size() {
      return jobs.size;
    },
    sampleCount() {
      let total = 0;
      for (const list of jobs.values()) total += list.length;
      return total;
    },
    clear() {
      jobs.clear();
    },
  };
}
