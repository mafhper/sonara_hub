export function validateVideoAudioAnalysis(analysis) {
  if (analysis?.risk === "overload") {
    throw new Error(
      `O AAC final excedeu 0 dBTP (${Number(analysis.truePeakDbtp).toFixed(2)} dBTP). Trate ou normalize a fonte antes de exportar novamente.`,
    );
  }
}
