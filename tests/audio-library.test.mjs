import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import NodeID3 from "node-id3";
import sharp from "sharp";
import {
  buildTreatedFileName,
  buildTreatedAlbumDirectoryName,
  classifyAudioRisk,
  createAlbumFolderCover,
  createNumberedCover,
  inferAudioTags,
  isEditableMp3,
  normalizedMp3TruePeakTarget,
  parseLoudnormReport,
  parseSamplePeakReport,
  romanNumeral,
  validateNormalizedAnalysis,
  writeCleanMp3Tags,
} from "../server/audio-library.mjs";

test("audio library infers album, artist, order and clean title from folders", () => {
  const inferred = inferAudioTags(
    "D:\\Music\\Matheus Lima\\The Beauty of Almost\\02 The Beauty of Almost -The Light Through the Kitchen Window.mp3",
  );

  assert.equal(inferred.artist, "Matheus Lima");
  assert.equal(inferred.album, "The Beauty of Almost");
  assert.equal(inferred.trackNumber, 2);
  assert.equal(inferred.title, "The Light Through the Kitchen Window");
});

test("audio library treats side folders as disc folders, not as albums", () => {
  const inferred = inferAudioTags(
    "D:\\Music\\Matheus Lima\\Jardim dos Ventos\\Lado A\\O Menino e o Vento.mp3",
  );

  assert.equal(inferred.artist, "Matheus Lima");
  assert.equal(inferred.album, "Jardim dos Ventos");
  assert.equal(inferred.albumArtist, "Matheus Lima");
  assert.equal(inferred.diskNumber, 1);
  assert.equal(inferred.title, "O Menino e o Vento");
});

test("audio library understands POSIX side folders for CI parity", () => {
  const inferred = inferAudioTags(
    "/home/runner/Music/Matheus Lima/Jardim dos Ventos/Side B/O E que Não Queria Parar Quieto.mp3",
  );

  assert.equal(inferred.artist, "Matheus Lima");
  assert.equal(inferred.album, "Jardim dos Ventos");
  assert.equal(inferred.diskNumber, 2);
});

test("standalone uploads do not infer dot folders as metadata", () => {
  assert.deepEqual(inferAudioTags("01 Standalone title.mp3"), {
    title: "Standalone title",
    artist: "",
    album: "",
    albumArtist: "",
    trackNumber: 1,
  });
});

test("treated MP3 filename includes album, padded order and title", () => {
  assert.equal(
    buildTreatedFileName({
      album: "The Beauty of Almost",
      title: "When the Clock Grows Tired",
      trackNumber: 1,
    }),
    "The Beauty of Almost - 01 - When the Clock Grows Tired.mp3",
  );
});

test("treated album directory uses a player-compatible stable album name", () => {
  assert.equal(
    buildTreatedAlbumDirectoryName({
      album: "Jardim dos Ventos",
      artist: "Matheus Lima",
    }),
    "Jardim dos Ventos",
  );
  assert.equal(
    buildTreatedAlbumDirectoryName({ artist: "Matheus Lima" }),
    "Matheus Lima",
  );
});

test("temporary uploads validate the original MP3 name instead of the multer path", () => {
  assert.equal(isEditableMp3("D:\\.dev\\uploads\\8ff0ce"), false);
  assert.equal(isEditableMp3("Track treated.MP3"), true);
});

test("headroom classification distinguishes warning from confirmed overload", () => {
  assert.deepEqual(classifyAudioRisk(-0.64), {
    risk: "reduced-headroom",
    recommendation: "consider-normalization",
  });
  assert.deepEqual(classifyAudioRisk(-1.2), {
    risk: "safe",
    recommendation: "none",
  });
  assert.deepEqual(classifyAudioRisk(0.1), {
    risk: "overload",
    recommendation: "consider-normalization",
  });
});

test("MP3 normalization reserves codec headroom and retries more conservatively", () => {
  assert.equal(normalizedMp3TruePeakTarget(0), -2);
  assert.equal(normalizedMp3TruePeakTarget(1), -2.5);
});

test("normalized MP3 validation rejects a package that still has reduced headroom", () => {
  assert.throws(
    () => validateNormalizedAnalysis({ risk: "reduced-headroom" }),
    /margem segura/,
  );
  assert.doesNotThrow(() => validateNormalizedAnalysis({ risk: "safe" }));
});

test("clean MP3 package replaces old tags and writes cover plus unsynchronised lyrics", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-id3-"));
  const target = path.join(directory, "fixture.mp3");
  await fs.writeFile(target, Buffer.from([0xff, 0xfb, 0x90, 0x64]));
  NodeID3.write(
    {
      title: "Lixo antigo",
      userDefinedText: [{ description: "old", value: "remove" }],
    },
    target,
  );

  await writeCleanMp3Tags(
    target,
    {
      title: "When the Clock Grows Tired",
      artist: "Matheus Lima",
      album: "The Beauty of Almost",
      albumArtist: "Matheus Lima",
      genre: "Ambient",
      composer: "",
      comment: "Feito usando IA com curadoria humana.",
      copyright: "2026 Matheus Lima",
      year: "2026",
      trackNumber: 1,
      trackTotal: 5,
      diskNumber: 1,
      diskTotal: 1,
      lyrics: "Primeira linha\nSegunda linha",
      lyricsLanguage: "por",
      normalizationEnabled: false,
      cleanPackage: true,
    },
    Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  );

  const tags = NodeID3.read(target);
  assert.equal(tags.title, "When the Clock Grows Tired");
  assert.equal(tags.performerInfo, "Matheus Lima");
  assert.equal(tags.trackNumber, "1/5");
  assert.equal(tags.partOfSet, "1/1");
  assert.equal(tags.comment.language, "por");
  assert.equal(tags.comment.text, "Feito usando IA com curadoria humana.");
  assert.equal(tags.unsynchronisedLyrics.language, "por");
  assert.equal(tags.unsynchronisedLyrics.text, "Primeira linha\nSegunda linha");
  assert.equal(tags.image.mime, "image/jpeg");
  assert.equal(tags.raw.TXXX, undefined);
});

test("loudnorm parser exposes technical metrics and reduced headroom warning", () => {
  const analysis = parseLoudnormReport(`
    [Parsed_loudnorm_0 @ 000001] {
      "input_i" : "-13.40",
      "input_tp" : "-0.58",
      "input_lra" : "5.20",
      "input_thresh" : "-23.80",
      "target_offset" : "-0.11"
    }
  `);

  assert.deepEqual(analysis, {
    integratedLufs: -13.4,
    truePeakDbtp: -0.58,
    loudnessRangeLu: 5.2,
    samplePeakDbfs: -0.58,
    risk: "reduced-headroom",
    recommendation: "consider-normalization",
  });
});

test("sample peak parser keeps dBFS separate from true peak dBTP", () => {
  assert.equal(
    parseSamplePeakReport(`
      [Parsed_astats_0] Peak level dB: -0.845500
      [Parsed_astats_0] Overall
      [Parsed_astats_0] Peak level dB: -0.770677
    `),
    -0.770677,
  );
});

test("cover series renders deterministic editorial roman numeral variants", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-cover-"));
  const base = path.join(directory, "base.png");
  const first = path.join(directory, "first.jpg");
  const second = path.join(directory, "second.jpg");
  await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: "#8a6644",
    },
  })
    .png()
    .toFile(base);

  assert.equal(romanNumeral(4), "IV");
  await createNumberedCover(base, first, { index: 4, style: "roman" });
  await createNumberedCover(base, second, { index: 4, style: "roman" });
  const [firstBuffer, secondBuffer] = await Promise.all([
    fs.readFile(first),
    fs.readFile(second),
  ]);
  assert.equal(firstBuffer.equals(secondBuffer), true);
  assert.equal((await sharp(first).metadata()).format, "jpeg");
});

test("album folder artwork is emitted as a standard square JPEG", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "sonara-folder-cover-"),
  );
  const base = path.join(directory, "base.webp");
  const folderCover = path.join(directory, "folder.jpg");
  await sharp({
    create: {
      width: 640,
      height: 360,
      channels: 3,
      background: "#435f78",
    },
  })
    .webp()
    .toFile(base);

  await createAlbumFolderCover(base, folderCover);
  const metadata = await sharp(folderCover).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 1600);
});

test("cover series renders ordered metadata lines with independent styles", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "sonara-cover-meta-"),
  );
  const base = path.join(directory, "base.png");
  const plain = path.join(directory, "plain.jpg");
  const styled = path.join(directory, "styled.jpg");
  await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: "#23435f",
    },
  })
    .png()
    .toFile(base);

  await createNumberedCover(base, plain, {
    index: 2,
    style: "roman",
  });
  await createNumberedCover(base, styled, {
    index: 2,
    style: "roman",
    metaGap: 18,
    sublines: [
      {
        text: "The Light Through the Kitchen Window",
        fontSize: 42,
        fontWeight: 760,
        fontStyle: "italic",
        align: "right",
        color: "#f4d58d",
        opacity: 86,
        offsetX: -34,
        offsetY: 12,
      },
      {
        text: "The Beauty of Almost",
        fontSize: 30,
        fontWeight: 560,
        fontStyle: "normal",
        align: "left",
        color: "#c7d9e8",
        opacity: 72,
        offsetX: 28,
        offsetY: 6,
      },
    ],
  });

  const [plainBuffer, styledBuffer] = await Promise.all([
    fs.readFile(plain),
    fs.readFile(styled),
  ]);
  assert.equal(plainBuffer.equals(styledBuffer), false);
  assert.equal((await sharp(styled).metadata()).format, "jpeg");
});
