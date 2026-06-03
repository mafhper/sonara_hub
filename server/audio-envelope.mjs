import { spawn } from "node:child_process";
import {
  normalizeFfmpegSpawnError,
  resolveFfmpegPath,
} from "./ffmpeg-tool.mjs";

const emptyFrame = { energy: 0, bass: 0, mid: 0, high: 0 };

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
    frames.push({
      energy: round(energy),
      bass: round(bandEnergy(frame, sampleRate, [70, 90, 120, 160])),
      mid: round(bandEnergy(frame, sampleRate, [360, 700, 1200])),
      high: round(bandEnergy(frame, sampleRate, [2100, 3100])),
      samples: temporalSamples(frame),
      spectrum: spectrumBands(frame, sampleRate),
    });
  }

  return { frameRate, frames: smoothFrames(frames) };
}

export function interpolateAudioEnvelope(envelope, seconds) {
  if (!envelope?.frames?.length) return { ...emptyFrame };
  const position = Math.max(0, seconds * envelope.frameRate);
  const leftIndex = Math.min(envelope.frames.length - 1, Math.floor(position));
  const rightIndex = Math.min(envelope.frames.length - 1, leftIndex + 1);
  const mix = position - leftIndex;
  const left = envelope.frames[leftIndex];
  const right = envelope.frames[rightIndex];
  return {
    energy: round(lerp(left.energy, right.energy, mix)),
    bass: round(lerp(left.bass, right.bass, mix)),
    mid: round(lerp(left.mid, right.mid, mix)),
    high: round(lerp(left.high, right.high, mix)),
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
