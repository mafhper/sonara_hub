import type { AudioBands } from "../../app/appTypes";
import type { TrackDraft } from "../../types";
import { trackAudioSrc } from "./audioSources";

function audioContextCtor() {
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext
  );
}

export async function decodeStaticWaveform(
  track: TrackDraft,
  buckets = 360,
): Promise<number[] | null> {
  const url = trackAudioSrc(track);
  if (!track.sourceFile && !url) return null;
  const arrayBuffer = track.sourceFile
    ? await track.sourceFile.arrayBuffer()
    : await (await fetch(url)).arrayBuffer();
  const AudioCtx = audioContextCtor();
  const context = new AudioCtx();
  const audio = await context.decodeAudioData(arrayBuffer);
  void context.close();
  const channel = audio.getChannelData(0);
  const bucketSize = Math.max(1, Math.floor(channel.length / buckets));
  const peaks: number[] = [];
  for (let index = 0; index < buckets; index += 1) {
    let max = 0;
    const start = index * bucketSize;
    for (let offset = 0; offset < bucketSize; offset += 1) {
      const value = Math.abs(channel[start + offset] ?? 0);
      if (value > max) max = value;
    }
    peaks.push(max);
  }
  const norm = Math.max(0.0001, ...peaks);
  return peaks.map((peak) => peak / norm);
}

export function audioBandsFromAnalyser(analyser: AnalyserNode): AudioBands {
  const frequency = new Uint8Array(analyser.frequencyBinCount);
  const waveform = new Uint8Array(analyser.fftSize);
  analyser.getByteFrequencyData(frequency);
  analyser.getByteTimeDomainData(waveform);
  const average = (from: number, to: number) =>
    Array.from(frequency.slice(from, to)).reduce(
      (sum, value) => sum + value,
      0,
    ) /
    Math.max(1, to - from) /
    255;
  return {
    energy: average(0, frequency.length),
    bass: average(0, 18),
    mid: average(18, 74),
    high: average(74, frequency.length),
    samples: Array.from(waveform)
      .filter((_, index) => index % 6 === 0)
      .map((value) => (value - 128) / 128),
    spectrum: Array.from({ length: 24 }, (_, index) => {
      const start = Math.floor(Math.pow(index / 24, 2.15) * frequency.length);
      const end = Math.max(
        start + 1,
        Math.floor(Math.pow((index + 1) / 24, 2.15) * frequency.length),
      );
      return average(start, Math.min(frequency.length, end));
    }),
  };
}
