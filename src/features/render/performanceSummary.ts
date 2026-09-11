export interface WorkflowStageStat {
  domain: string;
  label: string;
  pipeline: string;
  stage?: string;
  sampleCount: number;
  averageMs: number;
  medianMs: number;
  p95Ms: number;
  totalMs: number;
}

export interface WorkflowBenchmarkSummary {
  enabled: boolean;
  generatedAt: string;
  sampleCount: number;
  pipelines: WorkflowStageStat[];
  stages: WorkflowStageStat[];
}

const RENDER_EXPORT_PIPELINE = "render-export";

export function renderExportStageStats(
  summary: WorkflowBenchmarkSummary | null,
): WorkflowStageStat[] {
  if (!summary?.enabled) return [];
  return summary.stages.filter(
    (stage) => stage.pipeline === RENDER_EXPORT_PIPELINE,
  );
}

export function renderExportPipelineStats(
  summary: WorkflowBenchmarkSummary | null,
): WorkflowStageStat | null {
  if (!summary?.enabled) return null;
  return (
    summary.pipelines.find(
      (pipeline) => pipeline.pipeline === RENDER_EXPORT_PIPELINE,
    ) ?? null
  );
}

export function formatWorkflowDuration(ms: number): string {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "0ms";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}
