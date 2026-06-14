import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePcmEnvelope,
  interpolateAudioEnvelope,
} from "../server/audio-envelope.mjs";

function sineWave({ frequency, seconds = 1, sampleRate = 8000, volume = 0.8 }) {
  const samples = new Int16Array(seconds * sampleRate);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] =
      Math.sin((index / sampleRate) * Math.PI * 2 * frequency) * volume * 32767;
  }
  return samples;
}

test("audio envelope identifies a bass-heavy signal", () => {
  const envelope = analyzePcmEnvelope(sineWave({ frequency: 90 }), 8000, 10);

  assert.ok(envelope.frames.length >= 9);
  assert.ok(envelope.frames[2].bass > envelope.frames[2].mid);
  assert.ok(envelope.frames[2].bass > envelope.frames[2].high);
  assert.ok(envelope.frames[2].energy > 0.5);
  assert.equal(envelope.frames[2].samples.length, 64);
  assert.equal(envelope.frames[2].spectrum.length, 24);
});

test("audio envelope interpolates stable values between frames", () => {
  const envelope = {
    frameRate: 2,
    frames: [
      { energy: 0, bass: 0, mid: 0, high: 0 },
      {
        energy: 1,
        bass: 0.8,
        mid: 0.6,
        high: 0.4,
        samples: [0, 1],
        spectrum: [0.2, 0.8],
      },
    ],
  };

  assert.deepEqual(interpolateAudioEnvelope(envelope, 0.25), {
    energy: 0.5,
    bass: 0.4,
    mid: 0.3,
    high: 0.2,
    centroid: 0,
    flux: 0,
    onset: 0,
    beat: 0,
    beatPhase: 0,
    samples: [0, 0.5],
    spectrum: [0.1, 0.4],
  });
});

test("audio envelope interpolates beat phase through wrap", () => {
  const envelope = {
    frameRate: 2,
    frames: [
      { energy: 0, bass: 0, mid: 0, high: 0, beat: 0, beatPhase: 0.9 },
      { energy: 0, bass: 0, mid: 0, high: 0, beat: 1, beatPhase: 0.1 },
    ],
  };

  assert.equal(interpolateAudioEnvelope(envelope, 0.25).beatPhase, 0);
  assert.equal(interpolateAudioEnvelope(envelope, 0.1).beat, 0);
  assert.equal(interpolateAudioEnvelope(envelope, 0.4).beat, 1);
});
