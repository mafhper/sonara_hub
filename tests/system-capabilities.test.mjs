import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSystemCapabilitiesCache,
  computeRenderRecommendations,
  readSystemCapabilities,
} from "../server/system-capabilities.mjs";
import { normalizeGpuInfo } from "../server/webgl-export.mjs";

const hardwareGpu = () =>
  Promise.resolve(
    normalizeGpuInfo({
      available: true,
      vendor: "AMD",
      renderer: "ANGLE (AMD, AMD Radeon RX 7600)",
    }),
  );

const amfEncoders = () => ({
  ffmpegPath: "ffmpeg",
  platform: "win32",
  available: ["h264_amf"],
  h264: "h264_amf",
  errorCode: null,
  probeError: null,
  exitCode: 0,
});

test("recommendations follow detected hardware and stay safe without it", () => {
  const withHardware = computeRenderRecommendations({
    gpu: { isHardware: true },
    ffmpeg: { preferred: "h264_amf" },
  });
  assert.deepEqual(withHardware, {
    gpuMode: "hardware",
    capturePacing: "adaptive",
    encoderMode: "auto",
  });

  const softwareOnly = computeRenderRecommendations({
    gpu: { isHardware: false },
    ffmpeg: { preferred: null },
  });
  assert.deepEqual(softwareOnly, {
    gpuMode: "software",
    capturePacing: "adaptive",
    encoderMode: "software",
  });

  assert.deepEqual(computeRenderRecommendations(), {
    gpuMode: "software",
    capturePacing: "adaptive",
    encoderMode: "software",
  });
});

test("readSystemCapabilities combines probes into a single snapshot", async () => {
  clearSystemCapabilitiesCache();
  try {
    const capabilities = await readSystemCapabilities({
      cpuModel: "AMD Ryzen 9",
      parallelism: 16,
      platform: "win32",
      renderConcurrency: 2,
      audioConcurrency: 4,
      probeGpu: hardwareGpu,
      detectEncoders: amfEncoders,
    });

    assert.equal(capabilities.platform, "win32");
    assert.deepEqual(capabilities.cpu, { cores: 16, model: "AMD Ryzen 9" });
    assert.equal(capabilities.gpu.isHardware, true);
    assert.match(capabilities.gpu.renderer ?? "", /RX 7600/u);
    assert.deepEqual(capabilities.ffmpeg.hardwareEncoders, ["h264_amf"]);
    assert.equal(capabilities.ffmpeg.preferred, "h264_amf");
    assert.deepEqual(capabilities.concurrency, { render: 2, audio: 4 });
    assert.deepEqual(capabilities.recommendations, {
      gpuMode: "hardware",
      capturePacing: "adaptive",
      encoderMode: "auto",
    });
    assert.ok(capabilities.detectedAt);
  } finally {
    clearSystemCapabilitiesCache();
  }
});

test("readSystemCapabilities reports probe failures without throwing", async () => {
  clearSystemCapabilitiesCache();
  try {
    const capabilities = await readSystemCapabilities({
      probeGpu: () => Promise.reject(new Error("browser crashed")),
      detectEncoders: () => ({
        available: [],
        h264: null,
        errorCode: "FFMPEG_MISSING",
      }),
    });

    assert.equal(capabilities.gpu.available, false);
    assert.match(capabilities.gpu.probeError ?? "", /browser crashed/u);
    assert.equal(capabilities.gpu.isHardware, false);
    assert.equal(capabilities.ffmpeg.available, false);
    assert.deepEqual(capabilities.recommendations, {
      gpuMode: "software",
      capturePacing: "adaptive",
      encoderMode: "software",
    });
  } finally {
    clearSystemCapabilitiesCache();
  }
});

test("readSystemCapabilities caches the snapshot until cleared or refreshed", async () => {
  clearSystemCapabilitiesCache();
  let probes = 0;
  const countingProbe = () => {
    probes += 1;
    return hardwareGpu();
  };
  try {
    const first = await readSystemCapabilities({
      probeGpu: countingProbe,
      detectEncoders: amfEncoders,
      cpuModel: null,
    });
    const second = await readSystemCapabilities();
    assert.equal(second, first);
    assert.equal(probes, 1);

    const refreshed = await readSystemCapabilities({
      forceRefresh: true,
      probeGpu: countingProbe,
      detectEncoders: amfEncoders,
      cpuModel: null,
    });
    assert.notEqual(refreshed, first);
    assert.equal(probes, 2);
  } finally {
    clearSystemCapabilitiesCache();
  }
});
