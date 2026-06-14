export function revokeObjectUrl(url: string) {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Revocation is best-effort; stale or environment-specific blob URLs should
    // not break the editing session.
  }
}
