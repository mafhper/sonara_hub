import assert from "node:assert/strict";
import test from "node:test";
import { createGpuTelemetryLogger } from "../server/render-job-core.mjs";

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
  const logger = createGpuTelemetryLogger("job-1", {
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
  const logger = createGpuTelemetryLogger("job-2", {
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
  const logger = createGpuTelemetryLogger("job-3", {
    emit: (line) => lines.push(line),
  });

  logger({ phase: "scene-record" });
  logger(null);

  assert.equal(lines.length, 0);
});
