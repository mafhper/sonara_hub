import assert from "node:assert/strict";
import test from "node:test";

import { computeAudioBands, PREVIEW_BAND_HZ } from "../shared/audio-bands.mjs";
import { analyzePcmEnvelope } from "../server/audio-envelope.mjs";

const SAMPLE_RATE = 44100;
const FFT_SIZE = 2048;
const BIN_COUNT = FFT_SIZE / 2;
const BIN_HZ = SAMPLE_RATE / FFT_SIZE;

function frequencyLoudInHz(lowHz, highHz) {
  const frequency = new Uint8Array(BIN_COUNT);
  const start = Math.floor(lowHz / BIN_HZ);
  const end = Math.ceil(highHz / BIN_HZ);
  for (let index = start; index < end && index < BIN_COUNT; index += 1) {
    frequency[index] = 255;
  }
  return frequency;
}

function sineWaveform(frequencyHz) {
  const waveform = new Uint8Array(FFT_SIZE);
  for (let index = 0; index < FFT_SIZE; index += 1) {
    const phase = (2 * Math.PI * frequencyHz * index) / SAMPLE_RATE;
    waveform[index] = Math.round(128 + 100 * Math.sin(phase));
  }
  return waveform;
}

function envelopeFrame() {
  const length = SAMPLE_RATE; // ~1s of audio
  const samples = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    samples[index] = Math.round(
      12000 * Math.sin((2 * Math.PI * 110 * index) / 8000),
    );
  }
  const envelope = analyzePcmEnvelope(samples, 8000, 12);
  assert.ok(envelope.frames.length > 0, "envelope should produce frames");
  return envelope.frames[0];
}

test("preview bands expose the same keys as the export envelope frame", () => {
  const bands = computeAudioBands(
    frequencyLoudInHz(...PREVIEW_BAND_HZ.bass),
    sineWaveform(110),
    SAMPLE_RATE,
    FFT_SIZE,
  );
  const frame = envelopeFrame();
  assert.deepEqual(
    Object.keys(bands).sort(),
    Object.keys(frame).sort(),
    "preview and envelope must share the audio contract keys",
  );
});

test("bass is non-zero for low-frequency-dominant input (regression: low->bass)", () => {
  const bands = computeAudioBands(
    frequencyLoudInHz(...PREVIEW_BAND_HZ.bass),
    sineWaveform(110),
    SAMPLE_RATE,
    FFT_SIZE,
  );
  assert.ok(bands.bass > 0, "bass must react to low frequencies");
  assert.ok(bands.bass > bands.high, "bass-heavy input must read bass > high");
});

test("high outranks bass for treble-dominant input", () => {
  const bands = computeAudioBands(
    frequencyLoudInHz(...PREVIEW_BAND_HZ.high),
    sineWaveform(3000),
    SAMPLE_RATE,
    FFT_SIZE,
  );
  assert.ok(
    bands.high > bands.bass,
    "treble-heavy input must read high > bass",
  );
});

test("energy is an RMS value in [0,1] and zero for silence", () => {
  const loud = computeAudioBands(
    new Uint8Array(BIN_COUNT),
    sineWaveform(220),
    SAMPLE_RATE,
    FFT_SIZE,
  );
  assert.ok(loud.energy > 0 && loud.energy <= 1, "energy must be within (0,1]");

  const silentWaveform = new Uint8Array(FFT_SIZE).fill(128);
  const silent = computeAudioBands(
    new Uint8Array(BIN_COUNT),
    silentWaveform,
    SAMPLE_RATE,
    FFT_SIZE,
  );
  assert.equal(
    silent.energy,
    0,
    "centered (silent) waveform must yield zero energy",
  );
});

test("samples and spectrum match the export frame array lengths", () => {
  const bands = computeAudioBands(
    frequencyLoudInHz(...PREVIEW_BAND_HZ.mid),
    sineWaveform(440),
    SAMPLE_RATE,
    FFT_SIZE,
  );
  const frame = envelopeFrame();
  assert.equal(
    bands.spectrum.length,
    frame.spectrum.length,
    "spectrum length parity",
  );
  assert.equal(bands.samples.length, Math.ceil(FFT_SIZE / 6));
});
