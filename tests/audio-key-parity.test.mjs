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

test("envelope exposes rhythm/timbre features in valid ranges", () => {
  const length = SAMPLE_RATE * 2;
  const samples = new Int16Array(length);
  // Alternating tone bursts so the spectrum changes frame-to-frame (-> flux).
  for (let index = 0; index < length; index += 1) {
    const frequency = Math.floor((index / 8000) * 4) % 2 === 0 ? 220 : 1500;
    samples[index] = Math.round(
      10000 * Math.sin((2 * Math.PI * frequency * index) / 8000),
    );
  }
  const { frames } = analyzePcmEnvelope(samples, 8000, 12);
  assert.ok(frames.length > 4, "expected several frames");
  let sawFlux = false;
  for (const frame of frames) {
    for (const key of ["centroid", "flux", "onset", "beatPhase"]) {
      assert.ok(frame[key] >= 0 && frame[key] <= 1, `${key} in [0,1]`);
    }
    assert.ok(frame.beat === 0 || frame.beat === 1, "beat is 0|1");
    if (frame.flux > 0) sawFlux = true;
  }
  assert.ok(sawFlux, "a spectrum-changing signal should produce flux");
});

test("envelope rhythm features are zero for silence", () => {
  const { frames } = analyzePcmEnvelope(new Int16Array(SAMPLE_RATE), 8000, 12);
  for (const frame of frames) {
    assert.equal(frame.flux, 0);
    assert.equal(frame.onset, 0);
    assert.equal(frame.beat, 0);
    assert.equal(frame.centroid, 0);
  }
});

test("preview centroid is in range and zero without spectral energy", () => {
  const bright = computeAudioBands(
    frequencyLoudInHz(...PREVIEW_BAND_HZ.high),
    sineWaveform(3000),
    SAMPLE_RATE,
    FFT_SIZE,
  );
  assert.ok(bright.centroid > 0 && bright.centroid <= 1, "centroid in (0,1]");

  const silent = computeAudioBands(
    new Uint8Array(BIN_COUNT),
    new Uint8Array(FFT_SIZE).fill(128),
    SAMPLE_RATE,
    FFT_SIZE,
  );
  assert.equal(silent.centroid, 0, "no spectral energy -> centroid 0");
  // Rhythm features are stateless-zero in the live preview path.
  assert.equal(silent.flux, 0);
  assert.equal(silent.beat, 0);
});
