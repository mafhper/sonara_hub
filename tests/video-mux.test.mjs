import assert from "node:assert/strict";
import test from "node:test";
import { buildWebglMuxArgs } from "../server/video-mux.mjs";

test("mux constrains Chromium WebM output to the configured frame rate", () => {
  const args = buildWebglMuxArgs({
    audioPath: "input.wav",
    duration: 2,
    metadata: { title: "Teste", artist: "", genre: "", album: "" },
    outputPath: "output.mp4",
    outputSize: { width: 2560, height: 1440 },
    settings: {
      crf: 22,
      encoderPreset: "ultrafast",
      outputFps: 24,
      webglFps: 12,
    },
    subtitlePath: null,
    webglVideoPath: "scene.webm",
  });

  assert.equal(
    valueAfter(args, "-vf"),
    "setpts=N/(12*TB),fps=24,scale=2560:1440:flags=lanczos,format=yuv420p",
  );
  assert.equal(valueAfter(args, "-preset"), "ultrafast");
});

test("mux keeps subtitles after frame rate normalization", () => {
  const args = buildWebglMuxArgs({
    audioPath: "input.wav",
    duration: 2,
    metadata: { title: "Teste", artist: "", genre: "", album: "" },
    outputPath: "output.mp4",
    outputSize: { width: 1920, height: 1080 },
    settings: {
      crf: 18,
      encoderPreset: "veryfast",
      outputFps: 30,
      webglFps: 30,
    },
    subtitlePath: "D:\\render\\lyrics.ass",
    webglVideoPath: "scene.webm",
  });

  assert.equal(
    valueAfter(args, "-vf"),
    "setpts=N/(30*TB),fps=30,scale=1920:1080:flags=lanczos,subtitles='D\\:/render/lyrics.ass',format=yuv420p",
  );
});

function valueAfter(args, flag) {
  return args[args.indexOf(flag) + 1];
}
