import assert from "node:assert/strict";
import test from "node:test";
import {
  captureDurationSeconds,
  mergeCaptureDurationMetrics,
  mergeDurationMetrics,
  readOutputDurationSeconds,
} from "../server/render-duration.mjs";

test("capture duration derives from captured frames and webgl fps", () => {
  assert.equal(captureDurationSeconds(720, 24), 30);
});

test("capture duration keeps fractional precision for imperfect captures", () => {
  assert.equal(captureDurationSeconds(31, 24), 1.2917);
});

test("capture duration guards invalid inputs", () => {
  assert.equal(captureDurationSeconds(-1, 24), null);
  assert.equal(captureDurationSeconds(100, 0), null);
  assert.equal(captureDurationSeconds("nope", 24), null);
  assert.equal(captureDurationSeconds(100, "nope"), null);
});

test("zero captured frames measures as zero, the render is truthfully incomplete", () => {
  assert.equal(captureDurationSeconds(0, 24), 0);
});

test("merge starts empty and accumulates requested duration", () => {
  assert.deepEqual(
    mergeDurationMetrics(null, { requestedDurationSeconds: 120 }),
    {
      requestedDurationSeconds: 120,
      captureRatio: null,
      captureToMuxDeltaSeconds: null,
    },
  );
});

test("merge computes capture ratio from requested and captured", () => {
  const metrics = mergeDurationMetrics(
    { requestedDurationSeconds: 120 },
    { actualCaptureDurationSeconds: 119.87 },
  );
  assert.deepEqual(metrics, {
    requestedDurationSeconds: 120,
    actualCaptureDurationSeconds: 119.87,
    captureRatio: 0.9989,
    captureToMuxDeltaSeconds: null,
  });
});

test("perfect capture yields a capture ratio of exactly one", () => {
  const metrics = mergeDurationMetrics(
    { requestedDurationSeconds: 30 },
    { actualCaptureDurationSeconds: 30 },
  );
  assert.equal(metrics.captureRatio, 1);
});

test("mux-capture delta exposes post-capture drift as a diagnostic, not a failure", () => {
  const metrics = mergeDurationMetrics(
    mergeDurationMetrics(
      { requestedDurationSeconds: 120 },
      { actualCaptureDurationSeconds: 119.87 },
    ),
    { actualMuxDurationSeconds: 117.31 },
  );
  assert.equal(metrics.requestedDurationSeconds, 120);
  assert.equal(metrics.actualCaptureDurationSeconds, 119.87);
  assert.equal(metrics.actualMuxDurationSeconds, 117.31);
  assert.equal(metrics.captureToMuxDeltaSeconds, -2.56);
});

test("mux-capture delta stays null until both capture and mux are known", () => {
  const onlyRequested = mergeDurationMetrics(null, {
    requestedDurationSeconds: 120,
  });
  const withMux = mergeDurationMetrics(onlyRequested, {
    actualMuxDurationSeconds: 119.9,
  });
  assert.equal(withMux.captureToMuxDeltaSeconds, null);
  assert.equal(withMux.captureRatio, null);
});

test("merge keeps prior metrics when a later field is added", () => {
  const metrics = mergeDurationMetrics(
    mergeDurationMetrics(null, { requestedDurationSeconds: 30 }),
    { actualMuxDurationSeconds: 29.99 },
  );
  assert.equal(metrics.requestedDurationSeconds, 30);
  assert.equal(metrics.actualMuxDurationSeconds, 29.99);
  assert.equal(metrics.captureToMuxDeltaSeconds, null);
});

test("merge ignores invalid numeric patches without corrupting the record", () => {
  const metrics = mergeDurationMetrics(
    { requestedDurationSeconds: 30 },
    { actualMuxDurationSeconds: "invalid" },
  );
  assert.equal(metrics.requestedDurationSeconds, 30);
  assert.equal(metrics.actualMuxDurationSeconds, null);
});

test("merge treats an empty patch as a no-op copy", () => {
  const base = { requestedDurationSeconds: 30 };
  const metrics = mergeDurationMetrics(base, {});
  assert.notEqual(metrics, base);
  assert.deepEqual(metrics, {
    ...base,
    captureRatio: null,
    captureToMuxDeltaSeconds: null,
  });
});

test("duration invariants hold across sources (diagnostics never go negative)", () => {
  assert.equal(captureDurationSeconds(-1, 24), null);
  assert.equal(readDurationInvariant(captureDurationSeconds(0, 24)), 0);
});

function readDurationInvariant(value) {
  assert.ok(Number.isFinite(value) && value >= 0, "duration must be >= 0");
  return value;
}

test("capture health merge records the captured duration from a frame-count event", () => {
  const metrics = mergeCaptureDurationMetrics(
    { requestedDurationSeconds: 6 },
    { type: "capture-frame-count", capturedFrames: 90 },
    24,
  );
  assert.equal(metrics.actualCaptureDurationSeconds, 3.75);
  assert.equal(metrics.captureRatio, 0.625);
});

test("capture health merge ignores non-capture events without touching the record", () => {
  const base = { requestedDurationSeconds: 6 };
  const metrics = mergeCaptureDurationMetrics(
    base,
    { type: "context-lost" },
    24,
  );
  assert.equal(metrics.actualCaptureDurationSeconds, undefined);
  assert.equal(metrics.requestedDurationSeconds, 6);
});

test("read of a missing file reports no muxed duration instead of throwing", async () => {
  const seconds = await readOutputDurationSeconds(
    "C:\\definitely-not-here-9f4b2.mkv",
  );
  assert.equal(seconds, null);
});
