import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWebglMuxArgs,
  buildWebglMuxPlan,
  normalizeEncoderMode,
  resolveEncoderMode,
  resolveVideoEncoder,
  videoEncoderModes,
} from "../server/video-mux.mjs";

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

test("mux uses constrained bitrate when platform size limit applies", () => {
  const args = buildWebglMuxArgs({
    audioPath: "input.wav",
    duration: 30,
    metadata: { title: "Teste", artist: "", genre: "", album: "" },
    outputPath: "output.mp4",
    outputSize: { width: 1080, height: 1920 },
    settings: {
      crf: 20,
      encoderPreset: "veryfast",
      outputFps: 24,
      videoBitrateKbps: 2300,
      webglFps: 24,
    },
    subtitlePath: null,
    webglVideoPath: "scene.webm",
  });

  assert.equal(valueAfter(args, "-b:v"), "2300k");
  assert.equal(valueAfter(args, "-maxrate"), "2300k");
  assert.equal(valueAfter(args, "-bufsize"), "4600k");
  assert.equal(args.includes("-crf"), false);
});

test("encoder mode defaults to software and normalizes overrides", () => {
  assert.deepEqual(videoEncoderModes, ["auto", "hardware", "software"]);
  assert.equal(normalizeEncoderMode(undefined), "software");
  assert.equal(normalizeEncoderMode("WARP"), "software");
  assert.equal(normalizeEncoderMode(" AUTO "), "auto");
  assert.equal(normalizeEncoderMode(null, "hardware"), "hardware");
  assert.equal(resolveEncoderMode({}), "software");
  assert.equal(
    resolveEncoderMode({ SONARA_ENCODER_MODE: "hardware" }),
    "hardware",
  );
});

test("resolveVideoEncoder keeps the software default without probing hardware", () => {
  let probes = 0;
  const selection = resolveVideoEncoder({
    environment: {},
    detector: () => {
      probes += 1;
      return { platform: "win32", available: [] };
    },
    settings: { crf: 22 },
  });

  assert.equal(probes, 0);
  assert.deepEqual(selection, {
    modeRequested: "software",
    modeResolved: "software",
    encoder: "libx264",
    profile: null,
    fallbackReason: null,
    availableEncoders: [],
  });
});

test("resolveVideoEncoder picks the preferred available hardware encoder", () => {
  const selection = resolveVideoEncoder({
    environment: { SONARA_ENCODER_MODE: "hardware" },
    detector: () => ({
      platform: "win32",
      available: ["h264_nvenc", "h264_amf"],
    }),
    settings: { crf: 20 },
  });

  assert.equal(selection.modeRequested, "hardware");
  assert.equal(selection.modeResolved, "hardware");
  assert.equal(selection.encoder, "h264_amf");
  assert.equal(selection.profile, "balanced");
  assert.equal(selection.fallbackReason, null);
  assert.deepEqual(selection.availableEncoders, ["h264_nvenc", "h264_amf"]);
});

test("quality profile and explicit encoder name are honored", () => {
  const quality = resolveVideoEncoder({
    environment: {
      SONARA_ENCODER_MODE: "hardware",
      SONARA_HARDWARE_QUALITY: "QUALITY",
    },
    detector: () => ({ platform: "win32", available: ["h264_amf"] }),
  });
  assert.equal(quality.profile, "quality");

  const named = resolveVideoEncoder({
    environment: {
      SONARA_ENCODER_MODE: "auto",
      SONARA_ENCODER_NAME: "H264_NVENC",
    },
    detector: () => ({ platform: "win32", available: ["h264_nvenc"] }),
  });
  assert.equal(named.encoder, "h264_nvenc");
  assert.equal(named.modeResolved, "hardware");
});

test("auto mode falls back to software with observable reasons", () => {
  const none = resolveVideoEncoder({
    environment: { SONARA_ENCODER_MODE: "auto" },
    detector: () => ({ platform: "win32", available: [] }),
  });
  assert.equal(none.modeResolved, "software");
  assert.equal(none.fallbackReason, "no-hardware-h264-encoder");

  const probeFailed = resolveVideoEncoder({
    environment: { SONARA_ENCODER_MODE: "auto" },
    detector: () => ({
      platform: "win32",
      available: [],
      errorCode: "FFMPEG_PROBE_FAILED",
    }),
  });
  assert.equal(probeFailed.modeResolved, "software");
  assert.equal(probeFailed.fallbackReason, "hardware-encoder-probe-failed");

  const requestedMissing = resolveVideoEncoder({
    environment: {
      SONARA_ENCODER_MODE: "auto",
      SONARA_ENCODER_NAME: "h264_qsv",
    },
    detector: () => ({ platform: "win32", available: [] }),
  });
  assert.equal(requestedMissing.modeResolved, "software");
  assert.equal(
    requestedMissing.fallbackReason,
    "requested-hardware-encoder-unavailable",
  );
});

test("hardware mode fails loudly instead of falling back silently", () => {
  assert.throws(
    () =>
      resolveVideoEncoder({
        environment: { SONARA_ENCODER_MODE: "hardware" },
        detector: () => ({
          platform: "win32",
          available: [],
          ffmpegPath: "ffmpeg-x",
        }),
      }),
    (error) => {
      assert.equal(error.code, "FFMPEG_HARDWARE_ENCODER_UNAVAILABLE");
      assert.deepEqual(error.details.availableEncoders, []);
      assert.equal(error.details.ffmpegPath, "ffmpeg-x");
      assert.match(error.message, /FFMPEG_HARDWARE_ENCODER_UNAVAILABLE/);
      return true;
    },
  );
});

test("mux plan reports the resolved encoder alongside its arguments", () => {
  const plan = buildWebglMuxPlan({
    audioPath: "input.wav",
    duration: 2,
    metadata: { title: "Teste", artist: "", genre: "", album: "" },
    outputPath: "output.mp4",
    outputSize: { width: 1280, height: 720 },
    settings: {
      crf: 22,
      encoderPreset: "veryfast",
      outputFps: 24,
      webglFps: 12,
    },
    subtitlePath: null,
    webglVideoPath: "scene.webm",
  });

  assert.equal(plan.encoder.modeResolved, "software");
  assert.equal(plan.encoder.encoder, "libx264");
  assert.equal(valueAfter(plan.args, "-c:v"), "libx264");
  assert.equal(valueAfter(plan.args, "-preset"), "veryfast");
});

test("hardware mux args map rate control per encoder family", () => {
  const base = {
    audioPath: "input.wav",
    duration: 2,
    metadata: { title: "Teste", artist: "", genre: "", album: "" },
    outputPath: "output.mp4",
    outputSize: { width: 1280, height: 720 },
    subtitlePath: null,
    webglVideoPath: "scene.webm",
  };

  const amfArgs = buildWebglMuxPlan({
    ...base,
    settings: { crf: 22, outputFps: 24, webglFps: 24 },
    encoderSelection: hardwareSelection("h264_amf"),
  }).args;
  assert.equal(valueAfter(amfArgs, "-c:v"), "h264_amf");
  assert.equal(valueAfter(amfArgs, "-quality"), "balanced");
  assert.equal(valueAfter(amfArgs, "-rc"), "cqp");
  assert.equal(valueAfter(amfArgs, "-qp_i"), "22");
  assert.equal(valueAfter(amfArgs, "-qp_p"), "24");

  const nvencArgs = buildWebglMuxPlan({
    ...base,
    settings: { crf: 20, outputFps: 24, webglFps: 24 },
    encoderSelection: hardwareSelection("h264_nvenc"),
  }).args;
  assert.equal(valueAfter(nvencArgs, "-preset"), "p4");
  assert.equal(valueAfter(nvencArgs, "-rc"), "constqp");
  assert.equal(valueAfter(nvencArgs, "-qp"), "20");

  const qsvArgs = buildWebglMuxPlan({
    ...base,
    settings: {
      crf: 18,
      encoderPreset: "veryfast",
      outputFps: 24,
      webglFps: 24,
    },
    encoderSelection: hardwareSelection("h264_qsv"),
  }).args;
  assert.equal(valueAfter(qsvArgs, "-preset"), "veryfast");
  assert.equal(valueAfter(qsvArgs, "-global_quality"), "18");

  const videotoolboxArgs = buildWebglMuxPlan({
    ...base,
    settings: { outputFps: 24, webglFps: 24 },
    encoderSelection: hardwareSelection("h264_videotoolbox"),
  }).args;
  assert.equal(valueAfter(videotoolboxArgs, "-c:v"), "h264_videotoolbox");
  assert.equal(valueAfter(videotoolboxArgs, "-b:v"), "14500k");
});

test("configured bitrate wins over CRF-derived rate control on hardware", () => {
  const args = buildWebglMuxPlan({
    audioPath: "input.wav",
    duration: 2,
    metadata: { title: "Teste", artist: "", genre: "", album: "" },
    outputPath: "output.mp4",
    outputSize: { width: 1280, height: 720 },
    settings: { crf: 22, videoBitrateKbps: 2300, outputFps: 24, webglFps: 24 },
    subtitlePath: null,
    webglVideoPath: "scene.webm",
    encoderSelection: hardwareSelection("h264_amf"),
  }).args;

  assert.equal(valueAfter(args, "-b:v"), "2300k");
  assert.equal(valueAfter(args, "-maxrate"), "2300k");
  assert.equal(valueAfter(args, "-bufsize"), "4600k");
  assert.equal(args.includes("-rc"), false);
});

function hardwareSelection(encoder) {
  return {
    modeRequested: "auto",
    modeResolved: "hardware",
    encoder,
    profile: "balanced",
    fallbackReason: null,
    availableEncoders: [encoder],
    crf: null,
  };
}

function valueAfter(args, flag) {
  return args[args.indexOf(flag) + 1];
}
