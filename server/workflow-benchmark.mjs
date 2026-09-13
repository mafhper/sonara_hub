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
      resource: stageResourceFor(sample, stage.stage),
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
    stages: withStageResourceAggregate(
      groupedWorkflowStats(
        stageSamples,
        (stage) => `${stage.domain}:${stage.pipeline}:${stage.stage}`,
        (stage) => ({
          domain: stage.domain,
          label: jobStageLabelForBenchmark(stage.stage),
          pipeline: stage.pipeline,
          stage: stage.stage,
        }),
      ),
      stageSamples,
    ),
    health: healthAggregate(samples),
  };
}

function compactWorkflowSample(job) {
  const kind = String(job.kind ?? "unknown");
  const domain = workflowKindDomain(kind);
  const pipeline = workflowKindPipeline(kind);
  const captureFrameCount = job.renderHealth?.captureFrameCount;
  const health = {
    contextLostCount: finiteNumber(job.renderHealth?.contextLostCount, 0),
    captureFrameCount: captureFrameCount
      ? {
          capturedFrames: finiteNumber(captureFrameCount.capturedFrames),
          expectedFrames: finiteNumber(captureFrameCount.expectedFrames),
          ok: Boolean(captureFrameCount.ok),
          ratio: finiteNumber(captureFrameCount.ratio),
        }
      : null,
  };
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
    stageResources: (Array.isArray(job.stageResources)
      ? job.stageResources
      : []
    )
      .map(normalizeStageResources)
      .filter((entry) => entry.stage),
    health,
  };
}

function normalizeStageResources(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    stage: String(entry.stage ?? ""),
    sampleCount: finiteNumber(entry.sampleCount, 0),
    durationMs: finiteNumber(entry.durationMs),
    cpu: {
      avg: finiteNumber(entry.cpu?.avg),
      peak: finiteNumber(entry.cpu?.peak),
    },
    gpu3d: { avg: finiteNumber(entry.gpu3d?.avg) },
    vramUsedBytes: { avg: finiteNumber(entry.vramUsedBytes?.avg) },
    vramUsedPct: {
      avg: finiteNumber(entry.vramUsedPct?.avg),
      peak: finiteNumber(entry.vramUsedPct?.peak),
    },
    rss: { avg: finiteNumber(entry.rss?.avg) },
  };
}

function stageResourceFor(sample, stageName) {
  const entry = sample.stageResources?.find((item) => item.stage === stageName);
  if (!entry) return null;
  return {
    cpuAvg: entry.cpu.avg,
    cpuPeak: entry.cpu.peak,
    samples: finiteNumber(entry.sampleCount, 0),
    durationMs: finiteNumber(entry.durationMs),
    gpu3dAvg: entry.gpu3d.avg,
    rssAvg: entry.rss.avg,
    vramUsedBytesAvg: entry.vramUsedBytes.avg,
    vramUsedPctAvg: entry.vramUsedPct.avg,
    vramUsedPctPeak: entry.vramUsedPct.peak,
  };
}

function withStageResourceAggregate(groups, stageSamples) {
  const buckets = new Map();
  for (const item of stageSamples) {
    if (!item.resource) continue;
    const key = `${item.domain}:${item.pipeline}:${item.stage}`;
    const current = buckets.get(key) ?? [];
    current.push(item.resource);
    buckets.set(key, current);
  }
  return groups.map((group) => {
    const entries = buckets.get(
      `${group.domain}:${group.pipeline}:${group.stage}`,
    );
    return entries ? { ...group, resource: resourceAggregate(entries) } : group;
  });
}

function resourceAggregate(entries) {
  const series = (key) =>
    entries.map((entry) => entry[key]).filter((v) => v > 0);
  const medians = {
    cpuAvg: percentile(series("cpuAvg"), 0.5),
    cpuPeak: percentile(series("cpuPeak"), 0.5),
    gpu3dAvg: percentile(series("gpu3dAvg"), 0.5),
    rssAvg: percentile(series("rssAvg"), 0.5),
    vramUsedBytesAvg: percentile(series("vramUsedBytesAvg"), 0.5),
    vramUsedPctAvg: percentile(series("vramUsedPctAvg"), 0.5),
    vramUsedPctPeak: percentile(series("vramUsedPctPeak"), 0.5),
  };
  const peaks = series("vramUsedPctPeak");
  return {
    jobs: entries.length,
    samples: sumNumbers(entries.map((entry) => entry.samples)),
    ...medians,
    vramUsedPctPeakMax: peaks.length ? Math.max(...peaks) : 0,
  };
}

function healthAggregate(samples) {
  const ratios = samples
    .map((sample) => sample.health?.captureFrameCount?.ratio)
    .filter((ratio) => Number.isFinite(ratio) && ratio > 0);
  const okJobs = samples.filter(
    (sample) => sample.health?.captureFrameCount?.ok,
  ).length;
  const ratioSamples = samples.filter(
    (sample) => sample.health?.captureFrameCount,
  ).length;
  return {
    sampleCount: samples.length,
    contextLostJobs: samples.filter(
      (sample) => sample.health?.contextLostCount > 0,
    ).length,
    captureFrameRatio: {
      samples: ratioSamples,
      okRatio: ratioSamples ? okJobs / ratioSamples : 0,
      medianRatio: ratios.length ? percentile(ratios, 0.5) : 0,
    },
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
  if (/audio/iu.test(stage)) return "audio";
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
