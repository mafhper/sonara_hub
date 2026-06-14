import { computeAudioBands } from "../../../shared/audio-bands.mjs";
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
  return computeAudioBands(
    frequency,
    waveform,
    analyser.context.sampleRate,
    analyser.fftSize,
  );
}
