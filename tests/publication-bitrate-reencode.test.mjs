import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  MAX_REENCODES,
  MIN_VIDEO_BITRATE_KBPS,
  REENCODE_FACTOR,
  muxPublicationClipWithBoundedReencode,
  nextVideoBitrateKbps,
  publicationConstrainedMuxSettings,
  publicationDurationSizeWarning,
  publicationFileSizeWarnings,
  validatePublicationFileSize,
} from "../server/render-job-core.mjs";
import { publicationAssetPresetById } from "../shared/publication-assets.mjs";

// Evita sondagem de hardware nos testes de orquestração (default de CI é
// software, mas o ambiente local pode ter SONARA_ENCODER_MODE=hardware).
process.env.SONARA_ENCODER_MODE = "software";

const MB = 1024 * 1024;
const WHATSAPP = publicationAssetPresetById("whatsapp-status-clip");

const mb = (value) => Math.round(value * MB);

test("A: nextVideoBitrateKbps reduz monotonicamente com piso", () => {
  assert.equal(nextVideoBitrateKbps(1200), 960);
  assert.equal(nextVideoBitrateKbps(960), 768);
  assert.equal(nextVideoBitrateKbps(768), 614);
  assert.equal(nextVideoBitrateKbps(614), 491); // só alcançável se MAX_REENCODES aumentasse
  assert.equal(nextVideoBitrateKbps(300), 250);
  // Piso: retorna o mesmo valor → o loop deve parar (nunca re-codificar igual).
  assert.equal(nextVideoBitrateKbps(250), 250);
  assert.equal(nextVideoBitrateKbps(250), MIN_VIDEO_BITRATE_KBPS);
});

test("A: constantes operacionais expostas", () => {
  assert.equal(MAX_REENCODES, 3);
  assert.equal(REENCODE_FACTOR, 0.8);
  assert.equal(MIN_VIDEO_BITRATE_KBPS, 250);
});

test("A: publicationConstrainedMuxSettings calcula bitrate inicial conservador", () => {
  const settings = { crf: 22, encoderPreset: "veryfast", webglFps: 24 };
  // whatsapp-status-clip (10 MB) em 30s → orçamento sustentável.
  const constrained = publicationConstrainedMuxSettings(settings, WHATSAPP, 30);
  assert.equal(constrained.videoBitrateKbps, 2212);
  assert.deepEqual(
    { ...constrained, videoBitrateKbps: undefined },
    { ...settings, videoBitrateKbps: undefined },
  );

  // Não-clip: settings permanecem intactas.
  const image = publicationAssetPresetById("youtube-thumbnail");
  assert.equal(
    publicationConstrainedMuxSettings(settings, image, 30),
    settings,
  );

  // Duração longa demais → piso do algoritmo.
  const long = publicationConstrainedMuxSettings(settings, WHATSAPP, 300);
  assert.equal(long.videoBitrateKbps, MIN_VIDEO_BITRATE_KBPS);
});

test("B: validatePublicationFileSize e warnings", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-size-"));
  try {
    const exceededPath = path.join(tempDir, "exceeded.mp4");
    await fs.writeFile(exceededPath, Buffer.alloc(mb(12)));
    const exceeded = await validatePublicationFileSize(exceededPath, WHATSAPP);
    assert.equal(exceeded.status, "exceeded");
    assert.equal(exceeded.maxBytes, 10 * MB);
    assert.equal(exceeded.overBytes, mb(12) - 10 * MB);
    assert.equal(exceeded.maxLabel, "10.0 MB");
    assert.equal(publicationFileSizeWarnings(exceeded, WHATSAPP).length, 1);

    const okPath = path.join(tempDir, "ok.mp4");
    await fs.writeFile(okPath, Buffer.alloc(mb(8)));
    const ok = await validatePublicationFileSize(okPath, WHATSAPP);
    assert.equal(ok.status, "ok");
    assert.equal(publicationFileSizeWarnings(ok, WHATSAPP).length, 0);

    const noLimitPreset = publicationAssetPresetById("clip-vertical");
    const unbounded = await validatePublicationFileSize(okPath, noLimitPreset);
    assert.equal(unbounded.status, "unbounded");
    assert.equal(unbounded.maxBytes, null);
    assert.equal(
      publicationFileSizeWarnings(unbounded, noLimitPreset).length,
      0,
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("B: warning de duração deriva da matemática, não de regra fixa", () => {
  const exceeded = {
    status: "exceeded",
    actualBytes: 12 * MB,
    actualLabel: "12.0 MB",
    maxBytes: 10 * MB,
    maxLabel: "10.0 MB",
    overBytes: 2 * MB,
    overLabel: "2.0 MB",
  };
  // 300s: orçamento sustentável < piso → não atingível → warning em qualquer duração.
  const long = publicationDurationSizeWarning(WHATSAPP, 300, exceeded);
  assert.ok(long, "deveria acusar duração longa demais");
  assert.match(long, /longa demais/);
  // 30s: orçamento sustentável bem acima do piso → sem warning.
  assert.equal(publicationDurationSizeWarning(WHATSAPP, 30, exceeded), null);
  // Nunca quando o arquivo cabe.
  const ok = { ...exceeded, status: "ok" };
  assert.equal(publicationDurationSizeWarning(WHATSAPP, 300, ok), null);
  // Nunca para não-clip.
  const imagePreset = publicationAssetPresetById("youtube-thumbnail");
  assert.equal(
    publicationDurationSizeWarning(imagePreset, 300, exceeded),
    null,
  );
});

function createFakeStages() {
  const entries = [];
  return {
    entries,
    enter(stage, patch = {}) {
      entries.push({ stage, patch });
    },
  };
}

function createMuxBase(tempDir, preset, duration, outputName = "clip.mp4") {
  const outputPath = path.join(tempDir, outputName);
  const baseSettings = {
    crf: 22,
    encoderPreset: "veryfast",
    outputFps: 24,
    webglFps: 12,
  };
  return {
    jobId: "clip-test",
    webglVideoPath: "scene.webm",
    audioPath: "input.wav",
    audioStartSeconds: 0,
    duration,
    metadata: {
      title: "Faixa",
      artist: "Artista",
      genre: "Rock",
      album: "Álbum",
    },
    outputPath,
    outputSize: { width: 1080, height: 1920 },
    settings: publicationConstrainedMuxSettings(baseSettings, preset, duration),
    subtitlePath: null,
    preset,
    updateJob: () => {},
    stages: createFakeStages(),
    shouldCancel: () => false,
  };
}

test("C: cabe no primeiro encode → zero re-encodes", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-reencode-"));
  try {
    const sizeFor = new Map([[1200, mb(8)]]);
    const result = await muxPublicationClipWithBoundedReencode({
      ...createMuxBase(tempDir, WHATSAPP, 51.8),
      runFfmpegImpl: async (args) => {
        await fs.writeFile(args.at(-1), Buffer.alloc(sizeFor.get(1200)));
      },
      validateOutputImpl: async () => {},
    });
    assert.equal(result.reencodeCount, 0);
    assert.equal(result.initialVideoBitrateKbps, 1200);
    assert.equal(result.finalVideoBitrateKbps, 1200);
    assert.equal(result.fileSizeValidation.status, "ok");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("C: 1200 → 960 (ex) → 768 (cabe) para no 2º ajuste", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-reencode-"));
  try {
    const sizeFor = new Map([
      [1200, mb(14.2)],
      [960, mb(11.8)],
      [768, mb(9.6)],
    ]);
    const calls = [];
    const base = createMuxBase(tempDir, WHATSAPP, 51.8);
    const result = await muxPublicationClipWithBoundedReencode({
      ...base,
      runFfmpegImpl: async (args) => {
        const bitrate = Number(valueAfter(args, "-b:v").replace(/k$/, ""));
        calls.push(bitrate);
        await fs.writeFile(args.at(-1), Buffer.alloc(sizeFor.get(bitrate)));
      },
      validateOutputImpl: async () => {},
    });
    assert.equal(result.reencodeCount, 2);
    assert.equal(result.initialVideoBitrateKbps, 1200);
    assert.equal(result.finalVideoBitrateKbps, 768);
    assert.equal(result.fileSizeValidation.status, "ok");
    assert.deepEqual(calls, [1200, 960, 768]);
    const stageNames = base.stages.entries.map((entry) => entry.stage);
    assert.deepEqual(stageNames, [
      "ffmpeg-mux",
      "output-validation",
      "optimizing-size",
      "ffmpeg-mux",
      "output-validation",
      "optimizing-size",
      "ffmpeg-mux",
      "output-validation",
    ]);
    const leftovers = await fs.readdir(tempDir);
    assert.deepEqual(leftovers, ["clip.mp4"]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("C: máximo de tentativas 1200→960→768→614 com reencodeCount 3 e warning", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-reencode-"));
  try {
    const sizeFor = new Map([
      [1200, mb(15)],
      [960, mb(12)],
      [768, mb(10.5)],
      [614, mb(10.3)],
    ]);
    const calls = [];
    const base = createMuxBase(tempDir, WHATSAPP, 51.8);
    const result = await muxPublicationClipWithBoundedReencode({
      ...base,
      runFfmpegImpl: async (args) => {
        const bitrate = Number(valueAfter(args, "-b:v").replace(/k$/, ""));
        calls.push(bitrate);
        await fs.writeFile(args.at(-1), Buffer.alloc(sizeFor.get(bitrate)));
      },
      validateOutputImpl: async () => {},
    });
    assert.equal(result.reencodeCount, 3);
    assert.equal(result.finalVideoBitrateKbps, 1200); // nenhum candidato coube
    assert.equal(result.fileSizeValidation.status, "exceeded");
    // Sem quarta tentativa (491 não existe).
    assert.deepEqual(calls, [1200, 960, 768, 614]);
    assert.equal(calls.length, 1 + MAX_REENCODES);
    assert.equal(
      publicationFileSizeWarnings(result.fileSizeValidation, WHATSAPP).length,
      1,
    );
    const leftovers = await fs.readdir(tempDir);
    assert.deepEqual(leftovers, ["clip.mp4"]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("C: piso 300 → 250 → stop (next === current), reencodeCount 1", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-reencode-"));
  try {
    const floorPreset = {
      ...WHATSAPP,
      constraints: { ...WHATSAPP.constraints, maxFileSizeBytes: 71600 },
    };
    const sizeFor = new Map([
      [300, mb(10)],
      [250, mb(10)],
    ]);
    const calls = [];
    const base = createMuxBase(tempDir, floorPreset, 1);
    const result = await muxPublicationClipWithBoundedReencode({
      ...base,
      runFfmpegImpl: async (args) => {
        const bitrate = Number(valueAfter(args, "-b:v").replace(/k$/, ""));
        calls.push(bitrate);
        await fs.writeFile(args.at(-1), Buffer.alloc(sizeFor.get(bitrate)));
      },
      validateOutputImpl: async () => {},
    });
    assert.equal(result.reencodeCount, 1);
    assert.equal(result.initialVideoBitrateKbps, 300);
    assert.equal(result.finalVideoBitrateKbps, 300);
    assert.equal(result.fileSizeValidation.status, "exceeded");
    // Uma só codificação adicional a 250; NÃO existe segunda a 250 (mesmo valor).
    assert.deepEqual(calls, [300, 250]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("C: falha de encode em tentativa adicional preserva candidato anterior", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-reencode-"));
  try {
    const base = createMuxBase(tempDir, WHATSAPP, 51.8);
    const outputPath = base.outputPath;
    const first = mb(14.2);
    let calls = 0;
    const result = await muxPublicationClipWithBoundedReencode({
      ...base,
      runFfmpegImpl: async (args) => {
        calls += 1;
        if (calls > 1)
          throw new Error("encodificador falhou na tentativa extra");
        await fs.writeFile(args.at(-1), Buffer.alloc(first));
      },
      validateOutputImpl: async () => {},
    });
    assert.equal(calls, 2); // primeiro + 1 tentativa adicional que falhou
    assert.equal(result.reencodeCount, 1);
    assert.equal(result.finalVideoBitrateKbps, 1200);
    assert.equal(result.fileSizeValidation.status, "exceeded");
    const stat = await fs.stat(outputPath);
    assert.equal(stat.size, first); // candidato anterior intacto — job não fica sem arquivo
    const leftovers = await fs.readdir(tempDir);
    assert.deepEqual(leftovers, ["clip.mp4"]); // candidato falho limpo
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("C: preset sem limite não entra no loop", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-reencode-"));
  try {
    const clipNoLimit = publicationAssetPresetById("clip-vertical");
    const calls = [];
    const base = createMuxBase(tempDir, clipNoLimit, 51.8);
    const result = await muxPublicationClipWithBoundedReencode({
      ...base,
      runFfmpegImpl: async (args) => {
        calls.push(args.at(-1));
        await fs.writeFile(args.at(-1), Buffer.alloc(mb(1)));
      },
      validateOutputImpl: async () => {},
    });
    assert.equal(result.reencodeCount, 0);
    assert.equal(calls.length, 1); // só o primeiro encode
    assert.equal(result.fileSizeValidation.status, "unbounded");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

function valueAfter(args, flag) {
  return args[args.indexOf(flag) + 1];
}
