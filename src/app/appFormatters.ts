export function formatDuration(seconds?: number | null) {
  if (!Number.isFinite(seconds)) return "--:--";
  const safe = Number(seconds);
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

export function formatUsage(usage?: { files: number; bytes: number }) {
  if (!usage) return "Calculando uso local...";
  return `${formatFileCount(usage.files)} · ${formatBytes(usage.bytes)}`;
}

export function formatFileCount(files: number) {
  return `${files} ${files === 1 ? "arquivo" : "arquivos"}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
