// Shared audio-band extraction for the live-preview (Web Audio AnalyserNode) path.
//
// Keeps key parity with the offline envelope in server/audio-envelope.mjs so the
// live preview and the exported video drive the SAME shader uniforms
// (energy/bass/mid/high/samples/spectrum). Band edges are expressed in Hz and
// converted to FFT bins via the analyser sample rate, so "bass" means bass
// regardless of fftSize (the two preview analysers use 512 and 2048 and would
// otherwise disagree about which frequencies a bin index covers).
//
// The contiguous edges bracket the envelope's Goertzel band centers
// (bass 70-160 Hz, mid 360-1200 Hz, high 2100-3100 Hz).

export const PREVIEW_BAND_HZ = {
  bass: [20, 180],
  mid: [180, 1400],
  high: [1400, 5000],
};

/**
 * Compute normalized audio bands from raw analyser byte arrays.
 * Pure (no DOM / AnalyserNode) so it is unit-testable in node.
 *
 * @param {Uint8Array|number[]} frequency byte FFT magnitudes (0-255)
 * @param {Uint8Array|number[]} waveform  byte time-domain samples (0-255, centered at 128)
 * @param {number} sampleRate AudioContext sample rate in Hz
 * @param {number} fftSize    analyser fftSize (frequency.length === fftSize / 2)
 * @returns {{ energy: number, bass: number, mid: number, high: number, samples: number[], spectrum: number[] }}
 */
export function computeAudioBands(frequency, waveform, sampleRate, fftSize) {
  const binCount = frequency.length;
  const binHz = fftSize > 0 ? sampleRate / fftSize : 1;

  const averageBins = (fromBin, toBin) => {
    const start = Math.max(0, Math.min(binCount, Math.floor(fromBin)));
    const end = Math.max(start + 1, Math.min(binCount, Math.ceil(toBin)));
    let total = 0;
    for (let index = start; index < end; index += 1) total += frequency[index];
    return total / (end - start) / 255;
  };

  const band = ([lowHz, highHz]) => averageBins(lowHz / binHz, highHz / binHz);

  let squareSum = 0;
  for (let index = 0; index < waveform.length; index += 1) {
    const centered = (waveform[index] - 128) / 128;
    squareSum += centered * centered;
  }
  const energy = waveform.length
    ? Math.min(1, Math.sqrt(squareSum / waveform.length))
    : 0;

  const samples = [];
  for (let index = 0; index < waveform.length; index += 6) {
    samples.push((waveform[index] - 128) / 128);
  }

  const spectrum = Array.from({ length: 24 }, (_, index) => {
    const start = Math.floor(Math.pow(index / 24, 2.15) * binCount);
    const end = Math.max(
      start + 1,
      Math.floor(Math.pow((index + 1) / 24, 2.15) * binCount),
    );
    return averageBins(start, end);
  });

  // Spectral centroid (brightness) — stateless, so the live preview can react
  // to it too. flux/onset/beat/beatPhase need temporal history and are only
  // computed offline in server/audio-envelope.mjs; here they stay 0 (the shader
  // uniforms read `?? 0`) while keeping the AudioFrameV2 keys present so preview
  // and export share one contract.
  let centroidWeighted = 0;
  let centroidTotal = 0;
  for (let index = 0; index < spectrum.length; index += 1) {
    centroidWeighted += index * spectrum[index];
    centroidTotal += spectrum[index];
  }
  const centroid =
    centroidTotal > 1e-6
      ? centroidWeighted / centroidTotal / Math.max(1, spectrum.length - 1)
      : 0;

  return {
    energy,
    bass: band(PREVIEW_BAND_HZ.bass),
    mid: band(PREVIEW_BAND_HZ.mid),
    high: band(PREVIEW_BAND_HZ.high),
    centroid,
    flux: 0,
    onset: 0,
    beat: 0,
    beatPhase: 0,
    samples,
    spectrum,
  };
}
