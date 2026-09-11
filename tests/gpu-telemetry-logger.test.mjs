import assert from "node:assert/strict";
import test from "node:test";
import {
  createGpuTelemetryLogger,
  createPipelineTelemetryLogger,
} from "../server/render-job-core.mjs";

const gpuInfoEvent = {
  phase: "gpu-info",
  gpuModeRequested: "hardware",
  gpuModeResolved: "hardware",
  gpuFallbackReason: null,
  renderer: "ANGLE (AMD, AMD Radeon RX 7600 (0x00007480) Direct3D11)",
};

const fallbackEvent = {
  phase: "gpu-fallback",
  fromMode: "hardware",
  toMode: "software",
  reason: "webm-output-invalid",
};

test("gpu telemetry logger emits one info line with mode and renderer", () => {
  const lines = [];
  const logger = createPipelineTelemetryLogger("job-1", {
    emit: (line, level) => lines.push({ level, line }),
  });

  logger(gpuInfoEvent);
  logger(gpuInfoEvent);

  assert.equal(lines.length, 1);
  assert.equal(lines[0].level, "info");
  assert.match(
    lines[0].line,
    /\[render:job-1\] GPU mode=hardware resolved=hardware/u,
  );
  assert.match(lines[0].line, /fallback=-/u);
  assert.match(lines[0].line, /RX 7600/u);
});

test("gpu telemetry logger warns on every fallback event", () => {
  const lines = [];
  const logger = createPipelineTelemetryLogger("job-2", {
    emit: (line, level) => lines.push({ level, line }),
  });

  logger(fallbackEvent);
  logger(fallbackEvent);

  assert.equal(lines.length, 2);
  assert.equal(lines[0].level, "warn");
  assert.match(
    lines[0].line,
    /GPU fallback hardware->software: webm-output-invalid/u,
  );
});

test("gpu telemetry logger ignores unrelated phases", () => {
  const lines = [];
  const logger = createPipelineTelemetryLogger("job-3", {
    emit: (line) => lines.push(line),
  });

  logger({ phase: "scene-record" });
  logger(null);

  assert.equal(lines.length, 0);
});

test("pipeline profiler decomposes the frame loop into draw/requestFrame/pacing", () => {
  const lines = [];
  const logger = createPipelineTelemetryLogger("job-4", {
    emit: (line, level) => lines.push({ level, line }),
  });

  logger({
    phase: "browser:canvas-frame-loop-complete",
    totalFrames: 1000,
    renderMs: 10350.4,
    requestFrameMs: 8120.9,
    delayMs: 32000,
    targetDelayMs: 32,
    pacingMode: "adaptive",
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0].level, "info");
  const line = lines[0].line;
  assert.match(line, /CAPTURE frames=1000 /u);
  // Per-frame averages: 10350.4/1000 = 10.4ms/f; 32000/1000 = 32.0ms/f.
  assert.match(line, /draw=10350ms \(10\.4ms\/f\)/u);
  assert.match(line, /requestFrame=8121ms \(8\.1ms\/f\)/u);
  assert.match(line, /pacing=32000ms \(32\.0ms\/f, target=32ms\/f\)/u);
  assert.match(line, /mode=adaptive/u);
});

test("pipeline profiler handles zero-frame events without dividing by zero", () => {
  const lines = [];
  const logger = createPipelineTelemetryLogger("job-5", {
    emit: (line) => lines.push(line),
  });

  logger({
    phase: "browser:canvas-frame-loop-complete",
    totalFrames: 0,
    renderMs: 12,
    requestFrameMs: 3,
    delayMs: 0,
    targetDelayMs: 32,
  });

  assert.equal(lines.length, 1);
  assert.match(lines[0], /frames=0 draw=12ms \(n\/a\)/u);
  assert.match(lines[0], /mode=legacy/u);
});

test("pipeline profiler reports recorder volume for the intermediate codec", () => {
  const lines = [];
  const logger = createPipelineTelemetryLogger("job-6", {
    emit: (line, level) => lines.push({ level, line }),
  });

  logger({
    phase: "browser:chunks-flush-complete",
    chunks: 240,
    chunkBytes: 184223901,
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0].level, "info");
  assert.match(lines[0].line, /RECORDER chunks=240 bytes=175\.7MB/u);
});

test("legacy gpu logger alias keeps the previous entry point working", () => {
  assert.equal(createGpuTelemetryLogger, createPipelineTelemetryLogger);
});
