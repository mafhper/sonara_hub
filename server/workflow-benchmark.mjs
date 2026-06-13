export function emptyWorkflowBenchmark() {
  return {
    enabled: false,
    generatedAt: new Date().toISOString(),
    sampleCount: 0,
    samples: [],
    pipelines: [],
    stages: [],
  };
}

export function summarizeWorkflowBenchmark(allJobs) {
  const samples = allJobs
    .filter((job) => !isActiveJob(job) && Array.isArray(job.stageTimings))
    .filter((job) => job.stageTimings.length > 0)
    .slice(-100)
    .map(compactWorkflowSample);
  const stageSamples = samples.flatMap((sample) =>
    sample.stageTimings.map((stage) => ({
      ...stage,
      jobId: sample.jobId,
      pipeline: sample.pipeline,
      status: sample.status,
    })),
  );
  return {
    enabled: true,
    generatedAt: new Date().toISOString(),
    sampleCount: samples.length,
    samples: samples.slice(-20).reverse(),
    pipelines: groupedWorkflowStats(
      samples,
      (sample) => `${sample.domain}:${sample.pipeline}`,
      (sample) => ({
        domain: sample.domain,
        label: workflowPipelineLabel(sample.pipeline),
        pipeline: sample.pipeline,
      }),
    ),
    stages: groupedWorkflowStats(
      stageSamples,
      (stage) => `${stage.domain}:${stage.pipeline}:${stage.stage}`,
      (stage) => ({
        domain: stage.domain,
        label: jobStageLabelForBenchmark(stage.stage),
        pipeline: stage.pipeline,
        stage: stage.stage,
      }),
    ),
  };
}

function compactWorkflowSample(job) {
  const kind = String(job.kind ?? "unknown");
  const domain = workflowKindDomain(kind);
  const pipeline = workflowKindPipeline(kind);
  const stageTimings = job.stageTimings.map((stage) => {
    const stageName = String(stage.stage ?? "");
    return {
      durationMs: finiteNumber(stage.durationMs),
      domain: workflowStageDomain(stageName, domain),
      endedAt: String(stage.endedAt ?? ""),
      interrupted: Boolean(stage.interrupted),
      label: String(stage.label ?? stageName),
      pipeline,
      stage: stageName,
      startedAt: String(stage.startedAt ?? ""),
    };
  });
  return {
    jobId: String(job.id ?? ""),
    kind,
    domain,
    pipeline,
    status: String(job.status ?? ""),
    title: String(job.metadata?.title ?? job.message ?? ""),
    createdAt: String(job.createdAt ?? ""),
    updatedAt: String(job.updatedAt ?? ""),
    durationMs: sumNumbers(stageTimings.map((stage) => stage.durationMs)),
    attempt: finiteNumber(job.attempt, 0),
    retryCount: Array.isArray(job.retryHistory) ? job.retryHistory.length : 0,
    stageTimings,
  };
}

function groupedWorkflowStats(items, keyForItem, metaForItem) {
  const groups = new Map();
  for (const item of items) {
    const key = keyForItem(item);
    const current = groups.get(key) ?? {
      ...metaForItem(item),
      sampleCount: 0,
      totalMs: 0,
      durations: [],
      statusCounts: {},
    };
    current.sampleCount += 1;
    current.totalMs += finiteNumber(item.durationMs);
    current.durations.push(finiteNumber(item.durationMs));
    if (item.status) {
      current.statusCounts[item.status] =
        (current.statusCounts[item.status] ?? 0) + 1;
    }
    groups.set(key, current);
  }
  return [...groups.values()]
    .map(({ durations, ...group }) => ({
      ...group,
      averageMs: round(group.totalMs / Math.max(1, group.sampleCount)),
      medianMs: round(percentile(durations, 0.5)),
      p95Ms: round(percentile(durations, 0.95)),
      totalMs: round(group.totalMs),
    }))
    .sort((first, second) => second.totalMs - first.totalMs);
}

function workflowKindDomain(kind) {
  return (
    {
      "audio-process": "audio",
      "podcast-feed": "podcast",
      "publication-asset": "asset",
      "video-render": "video",
    }[kind] ?? "system"
  );
}

function workflowKindPipeline(kind) {
  return (
    {
      "audio-process": "audio-processing",
      "podcast-feed": "podcast-feed",
      "publication-asset": "publication-assets",
      "video-render": "render-export",
    }[kind] ?? "workflow"
  );
}

function workflowPipelineLabel(pipeline) {
  return (
    {
      "audio-processing": "Processamento de audio",
      "podcast-feed": "Feeds de podcast",
      "publication-assets": "Assets de publicacao",
      "render-export": "Exportacao de video",
      workflow: "Workflow",
    }[pipeline] ?? pipeline
  );
}

function workflowStageDomain(stage, fallback) {
  if (/^audio-|audio/iu.test(stage)) return "audio";
  if (/podcast|feed|rss/iu.test(stage)) return "podcast";
  if (/asset|manifest|poster|cover|artwork/iu.test(stage)) return "asset";
  if (/webgl|ffmpeg|mux|validation|render/iu.test(stage)) return "video";
  return fallback || "system";
}

function jobStageLabelForBenchmark(stage) {
  return (
    {
      "asset-prepare": "Preparar assets",
      "audio-analysis": "Analise de audio",
      "audio-assets": "Assets de audio",
      "audio-prepare": "Preparar audio",
      "audio-tags": "Tags de audio",
      "feed-manifest": "Feed RSS",
      "ffmpeg-mux": "Mux FFmpeg",
      manifest: "Manifesto",
      "output-validation": "Validacao de saida",
      "poster-render": "Poster",
      "webgl-render": "Render WebGL",
    }[stage] ?? stage
  );
}

function isActiveJob(job) {
  return ["queued", "paused", "running"].includes(job.status);
}

function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  return sorted[index];
}

function sumNumbers(values) {
  return values.reduce((total, value) => total + finiteNumber(value), 0);
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
