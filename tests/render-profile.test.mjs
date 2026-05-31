import assert from "node:assert/strict";
import test from "node:test";
import { renderCanvasSize, renderTiming } from "../server/render-profile.mjs";

const fourK = { width: 3840, height: 2160 };

test("final profile preserves the requested export resolution", () => {
  assert.deepEqual(
    renderCanvasSize(fourK, { qualityProfile: "final", renderMode: "single" }),
    fourK,
  );
});

test("automatic single export caps the internal canvas at 1080p", () => {
  assert.deepEqual(
    renderCanvasSize(fourK, { qualityProfile: "auto", renderMode: "single" }),
    { width: 1920, height: 1080 },
  );
});

test("automatic batch export uses a balanced 720p internal canvas", () => {
  assert.deepEqual(
    renderCanvasSize(fourK, { qualityProfile: "auto", renderMode: "batch" }),
    { width: 1280, height: 720 },
  );
});

test("fast profile uses a 720p internal canvas", () => {
  assert.deepEqual(
    renderCanvasSize(
      { width: 2560, height: 1440 },
      {
        qualityProfile: "fast",
        renderMode: "single",
      },
    ),
    { width: 1280, height: 720 },
  );
});

test("automatic batch profile captures fewer frames while publishing smooth CFR video", () => {
  assert.deepEqual(
    renderTiming({ qualityProfile: "auto", renderMode: "batch" }),
    { webglFps: 12, outputFps: 24, encoderPreset: "ultrafast" },
  );
});

test("final profile preserves higher frame rate and encoder quality", () => {
  assert.deepEqual(
    renderTiming({ qualityProfile: "final", renderMode: "single" }),
    { webglFps: 30, outputFps: 30, encoderPreset: "veryfast" },
  );
});
