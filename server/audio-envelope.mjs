import { spawn } from "node:child_process";
import {
  normalizeFfmpegSpawnError,
  resolveFfmpegPath,
} from "./ffmpeg-tool.mjs";

const emptyFrame = {
  energy: 0,
  bass: 0,
  mid: 0,
  high: 0,
  centroid: 0,
  flux: 0,
  onset: 0,
  beat: 0,
  beatPhase: 0,
};

export function analyzePcmEnvelope(samples, sampleRate = 8000, frameRate = 12) {
  const frameSize = Math.max(64, Math.floor(sampleRate / frameRate));
  const frames = [];

  for (let start = 0; start < samples.length; start += frameSize) {
    const frame = samples.subarray(
      start,
      Math.min(start + frameSize, samples.length),
    );
    if (frame.length < 32) continue;
    let squareSum = 0;
    for (const sample of frame) squareSum += sample * sample;
    const energy = Math.min(1, Math.sqrt(squareSum / frame.length) / 32768);
    const spectrum = spectrumBands(frame, sampleRate);
    frames.push({
      energy: round(energy),
      bass: round(bandEnergy(frame, sampleRate, [70, 90, 120, 160])),
      mid: round(bandEnergy(frame, sampleRate, [360, 700, 1200])),
      high: round(bandEnergy(frame, sampleRate, [2100, 3100])),
      centroid: round(spectralCentroid(spectrum)),
      samples: temporalSamples(frame),
      spectrum,
    });
  }

  return { frameRate, frames: smoothFrames(addRhythmFeatures(frames)) };
}

export function interpolateAudioEnvelope(envelope, seconds) {
  if (!envelope?.frames?.length) return { ...emptyFrame };
  const position = Math.max(0, seconds * envelope.frameRate);
  const leftIndex = Math.min(envelope.frames.length - 1, Math.floor(position));
  const rightIndex = Math.min(envelope.frames.length - 1, leftIndex + 1);
  const mix = position - leftIndex;
  const left = envelope.frames[leftIndex];
  const right = envelope.frames[rightIndex];
  // Continuous signals lerp; the discrete beat pulse snaps to the nearest frame.
  // beatPhase is cyclic, so interpolate through the wrap instead of smearing
  // 0.95 -> 0.05 backwards across the whole range.
  const nearest = (a, b) => (mix < 0.5 ? a : b);
  const lerpPhase = (a, b) => {
    let rightPhase = b;
    if (rightPhase - a > 0.5) rightPhase -= 1;
    if (a - rightPhase > 0.5) rightPhase += 1;
    const value = lerp(a, rightPhase, mix);
    return value - Math.floor(value);
  };
  return {
    energy: round(lerp(left.energy, right.energy, mix)),
    bass: round(lerp(left.bass, right.bass, mix)),
    mid: round(lerp(left.mid, right.mid, mix)),
    high: round(lerp(left.high, right.high, mix)),
    centroid: round(lerp(left.centroid ?? 0, right.centroid ?? 0, mix)),
    flux: round(lerp(left.flux ?? 0, right.flux ?? 0, mix)),
    onset: round(lerp(left.onset ?? 0, right.onset ?? 0, mix)),
    beat: nearest(left.beat ?? 0, right.beat ?? 0),
    beatPhase: round(lerpPhase(left.beatPhase ?? 0, right.beatPhase ?? 0)),
    samples: interpolateArray(left.samples, right.samples, mix),
    spectrum: interpolateArray(left.spectrum, right.spectrum, mix),
  };
}

export async function sampleAudioEnvelope(audioPath, frameRate = 12) {
  const ffmpegPath = resolveFfmpegPath();
  const sampleRate = 8000;
  const chunks = await new Promise((resolve, reject) => {
    const output = [];
    let stderr = "";
    const child = spawn(
      ffmpegPath,
      [
        "-v",
        "error",
        "-i",
        audioPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        "-f",
        "s16le",
        "-",
      ],
      { windowsHide: true },
    );
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) =>
      reject(normalizeFfmpegSpawnError(error, ffmpegPath)),
    );
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`Não foi possível analisar o áudio: ${stderr}`)),
    );
  });
  const pcm = Buffer.concat(chunks);
  const aligned = pcm.subarray(0, pcm.length - (pcm.length % 2));
  const samples = new Int16Array(
    aligned.buffer,
    aligned.byteOffset,
    aligned.byteLength / 2,
  );
  return analyzePcmEnvelope(samples, sampleRate, frameRate);
}

function bandEnergy(samples, sampleRate, frequencies) {
  return Math.min(
    1,
    Math.max(
      ...frequencies.map((frequency) =>
        goertzel(samples, sampleRate, frequency),
      ),
    ),
  );
}

function goertzel(samples, sampleRate, frequency) {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let previous = 0;
  let previous2 = 0;
  for (const sample of samples) {
    const current = sample + coeff * previous - previous2;
    previous2 = previous;
    previous = current;
  }
  const power =
    previous2 * previous2 + previous * previous - coeff * previous * previous2;
  return Math.min(
    1,
    (2 * Math.sqrt(Math.max(0, power))) / (samples.length * 32768),
  );
}

// Spectral centroid (brightness): the energy-weighted mean band index, mapped
// to 0..1. Brighter, treble-heavy frames read higher.
function spectralCentroid(spectrum) {
  let weighted = 0;
  let total = 0;
  for (let index = 0; index < spectrum.length; index += 1) {
    weighted += index * spectrum[index];
    total += spectrum[index];
  }
  if (total <= 1e-6) return 0;
  return weighted / total / Math.max(1, spectrum.length - 1);
}

// Derive rhythm features from the per-frame spectra. Computed once over the
// whole envelope so onset normalization and beat picking get global context.
// Kept at the 12 fps envelope rate (~83 ms granularity) — plenty for the
// slowcore catalog; raise frameRate later if a release needs tighter sync.
function addRhythmFeatures(frames) {
  const fluxRaw = frames.map((frame, index) => {
    if (index === 0) return 0;
    const previous = frames[index - 1].spectrum;
    let sum = 0;
    for (let band = 0; band < frame.spectrum.length; band += 1) {
      const delta = frame.spectrum[band] - (previous[band] ?? 0);
      if (delta > 0) sum += delta;
    }
    return sum;
  });
  const maxFlux = Math.max(1e-6, ...fluxRaw);
  const flux = fluxRaw.map((value) => Math.min(1, value / maxFlux));

  // Onset = flux novelty above a short trailing average (half-wave rectified).
  const onsetWindow = 3;
  const onsetRaw = flux.map((value, index) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, index - onsetWindow); j <= index; j += 1) {
      sum += flux[j];
      count += 1;
    }
    return Math.max(0, value - sum / Math.max(1, count));
  });
  const maxOnset = Math.max(1e-6, ...onsetRaw);
  const onset = onsetRaw.map((value) => Math.min(1, value / maxOnset));

  // Beat = adaptive local peak in the onset signal.
  const beatWindow = 4;
  const beats = onset.map((value, index) => {
    let localMax = 0;
    let sum = 0;
    let count = 0;
    for (
      let j = Math.max(0, index - beatWindow);
      j <= Math.min(onset.length - 1, index + beatWindow);
      j += 1
    ) {
      if (onset[j] > localMax) localMax = onset[j];
      sum += onset[j];
      count += 1;
    }
    const mean = sum / Math.max(1, count);
    return value >= localMax && value > mean + 0.12 && value > 0.2 ? 1 : 0;
  });

  // beatPhase = ramp 0->1 between consecutive detected beats.
  const beatIndices = [];
  beats.forEach((isBeat, index) => {
    if (isBeat) beatIndices.push(index);
  });
  const beatPhase = frames.map((_, index) => {
    let previousBeat = -1;
    let nextBeat = -1;
    for (const beatIndex of beatIndices) {
      if (beatIndex <= index) previousBeat = beatIndex;
      if (beatIndex > index) {
        nextBeat = beatIndex;
        break;
      }
    }
    if (previousBeat < 0 || nextBeat < 0) return 0;
    const span = nextBeat - previousBeat;
    return span > 0 ? (index - previousBeat) / span : 0;
  });

  return frames.map((frame, index) => ({
    ...frame,
    flux: round(flux[index]),
    onset: round(onset[index]),
    beat: beats[index],
    beatPhase: round(beatPhase[index]),
  }));
}

function smoothFrames(frames) {
  return frames.map((frame, index) => {
    const previous = frames[Math.max(0, index - 1)] ?? frame;
    const next = frames[Math.min(frames.length - 1, index + 1)] ?? frame;
    return {
      energy: round(
        previous.energy * 0.2 + frame.energy * 0.6 + next.energy * 0.2,
      ),
      bass: round(previous.bass * 0.2 + frame.bass * 0.6 + next.bass * 0.2),
      mid: round(previous.mid * 0.2 + frame.mid * 0.6 + next.mid * 0.2),
      high: round(previous.high * 0.2 + frame.high * 0.6 + next.high * 0.2),
      // Rhythm/timbre features are passed through unsmoothed: smoothing would
      // blur the 1-frame beat pulse and the onset peaks.
      centroid: frame.centroid,
      flux: frame.flux,
      onset: frame.onset,
      beat: frame.beat,
      beatPhase: frame.beatPhase,
      samples: frame.samples,
      spectrum: frame.spectrum,
    };
  });
}

function temporalSamples(samples) {
  return Array.from({ length: 64 }, (_, index) => {
    const position = Math.min(
      samples.length - 1,
      Math.floor((index / 63) * samples.length),
    );
    return round(samples[position] / 32768);
  });
}

function spectrumBands(samples, sampleRate) {
  const minimum = 55;
  const maximum = Math.min(3600, sampleRate / 2 - 100);
  return Array.from({ length: 24 }, (_, index) => {
    const frequency =
      minimum * Math.pow(maximum / minimum, index / Math.max(1, 23));
    return round(goertzel(samples, sampleRate, frequency));
  });
}

function interpolateArray(left = [], right = [], mix) {
  const length = Math.max(left.length, right.length);
  return Array.from({ length }, (_, index) =>
    round(lerp(left[index] ?? 0, right[index] ?? 0, mix)),
  );
}

function lerp(left, right, mix) {
  return left + (right - left) * mix;
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}
