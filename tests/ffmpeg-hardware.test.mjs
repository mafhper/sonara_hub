import assert from "node:assert/strict";
import test from "node:test";
import ffmpegStaticPath from "ffmpeg-static";
import {
  clearHardwareEncoderCache,
  detectHardwareEncoders,
  hardwareEncoderPreference,
  selectHardwareH264Encoder,
} from "../server/ffmpeg-hardware.mjs";

const encoderListOutput = [
  " V....D libx264                 libx264 H.264 / MPEG-4 AVC / MPEG-4 part 10",
  " V....D h264_amf                AMD AMF H.264 Encoder",
  " V....D h264_nvenc              NVIDIA NVENC H.264 Encoder",
  " V....D h264_amf2               not an encoder boundary match",
  " V....D h264_qsv_extra          not an encoder boundary match",
].join("\n");

test("hardware encoder preference orders by platform and appends the rest", () => {
  assert.deepEqual(hardwareEncoderPreference("win32"), [
    "h264_amf",
    "h264_qsv",
    "h264_nvenc",
    "h264_videotoolbox",
  ]);
  assert.deepEqual(hardwareEncoderPreference("darwin"), [
    "h264_videotoolbox",
    "h264_amf",
    "h264_nvenc",
    "h264_qsv",
  ]);
  assert.deepEqual(hardwareEncoderPreference("linux"), [
    "h264_qsv",
    "h264_nvenc",
    "h264_amf",
    "h264_videotoolbox",
  ]);
  assert.deepEqual(
    hardwareEncoderPreference("unknown-platform"),
    hardwareEncoderPreference("linux"),
  );
});

test("encoder selection honors explicit names and platform preference", () => {
  const available = ["h264_nvenc", "h264_amf"];
  assert.equal(
    selectHardwareH264Encoder({ available, platform: "win32" }),
    "h264_amf",
  );
  assert.equal(
    selectHardwareH264Encoder({ available, platform: "linux" }),
    "h264_nvenc",
  );
  assert.equal(
    selectHardwareH264Encoder({ available: [], platform: "win32" }),
    null,
  );
  assert.equal(
    selectHardwareH264Encoder({
      available,
      requestedName: "H264_NVENC",
      platform: "win32",
    }),
    "h264_nvenc",
  );
  assert.equal(
    selectHardwareH264Encoder({
      available,
      requestedName: "h264_videotoolbox",
      platform: "win32",
    }),
    null,
  );
});

test("probe parsing matches whole encoder names only", () => {
  const result = detectHardwareEncoders({
    ffmpegPath: "ffmpeg-test",
    platform: "win32",
    runner: () => ({
      output: encoderListOutput,
      errorCode: null,
      probeError: null,
      exitCode: 0,
    }),
  });

  assert.deepEqual(result.available, ["h264_amf", "h264_nvenc"]);
  assert.equal(result.available.includes("libx264"), false);
  assert.equal(result.h264, "h264_amf");
  assert.equal(result.errorCode, null);
});

test("probe failures surface stable codes instead of encoders", () => {
  const result = detectHardwareEncoders({
    ffmpegPath: "ffmpeg-missing",
    platform: "win32",
    runner: () => ({
      output: "",
      errorCode: "FFMPEG_PROBE_FAILED",
      probeError: "boom",
      exitCode: 1,
    }),
  });

  assert.deepEqual(result.available, []);
  assert.equal(result.h264, null);
  assert.equal(result.errorCode, "FFMPEG_PROBE_FAILED");
  assert.equal(result.probeError, "boom");
});

test("detection caches results per ffmpeg binary until cleared", () => {
  clearHardwareEncoderCache();
  const first = detectHardwareEncoders({
    ffmpegPath: ffmpegStaticPath,
    platform: process.platform,
  });
  const second = detectHardwareEncoders({
    ffmpegPath: ffmpegStaticPath,
    platform: process.platform,
  });
  assert.equal(second, first);
  assert.ok(Array.isArray(first.available));
  assert.ok(first.h264 === null || first.available.includes(first.h264));

  clearHardwareEncoderCache();
  const third = detectHardwareEncoders({
    ffmpegPath: ffmpegStaticPath,
    platform: process.platform,
  });
  assert.notEqual(third, first);
});
