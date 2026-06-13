import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import NodeID3 from "node-id3";
import sharp from "sharp";
import {
  normalizeFfmpegSpawnError,
  resolveFfmpegPath,
} from "./ffmpeg-tool.mjs";
import { buildNameFromPattern } from "../shared/file-naming.mjs";

export function inferAudioTags(filePath) {
  const pathApi = /(^[a-z]:|\\)/i.test(String(filePath))
    ? path.win32
    : path.posix;
  const parent = pathApi.dirname(filePath);
  const parentName = parent === "." ? "" : pathApi.basename(parent);
  const side = parseDiscFolder(parentName);
  const albumDir = side ? pathApi.dirname(parent) : parent;
  const artistDir = albumDir === "." ? "." : pathApi.dirname(albumDir);
  const album = albumDir === "." ? "" : pathApi.basename(albumDir);
  const artist =
    artistDir === "." || artistDir === albumDir
      ? ""
      : pathApi.basename(artistDir);
  const baseName = pathApi.basename(filePath, pathApi.extname(filePath)).trim();
  const match = baseName.match(/^(\d{1,3})\s+(.+)$/);
  const trackNumber = Number(match?.[1] ?? 0);
  const withoutOrder = String(match?.[2] ?? baseName).trim();
  const albumPrefix = album
    ? new RegExp(`^${escapeRegex(album)}\\s*-\\s*`, "i")
    : null;
  const inferred = {
    title: albumPrefix
      ? withoutOrder.replace(albumPrefix, "").trim()
      : withoutOrder,
    artist,
    album,
    albumArtist: artist,
    trackNumber,
  };
  if (side) inferred.diskNumber = side;
  return inferred;
}

function parseDiscFolder(value) {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  const letter = normalized.match(/^(?:lado|side)\s*([a-z])$/i)?.[1];
  if (letter) return letter.toLowerCase().charCodeAt(0) - 96;
  const number = normalized.match(/^(?:disco|disc|disk|cd)\s*(\d{1,2})$/)?.[1];
  return number ? Number(number) : 0;
}

export function buildTreatedFileName(tags, pattern) {
  // pattern is optional; when absent the default reproduces the historical
  // "Álbum - 01 - Música" layout.
  const base = buildNameFromPattern(pattern, tags, safeName);
  return `${base || safeName(tags.title) || "tratado"}.mp3`;
}

export function buildTreatedAlbumDirectoryName(tags) {
  return safeName(tags.album || tags.albumArtist || tags.artist || "Tratados");
}

export function classifyAudioRisk(truePeakDbtp) {
  if (!Number.isFinite(truePeakDbtp)) {
    return { risk: "decode-error", recommendation: "consider-normalization" };
  }
  if (truePeakDbtp >= 0) {
    return { risk: "overload", recommendation: "consider-normalization" };
  }
  if (truePeakDbtp > -1) {
    return {
      risk: "reduced-headroom",
      recommendation: "consider-normalization",
    };
  }
  return { risk: "safe", recommendation: "none" };
}

export function normalizedMp3TruePeakTarget(attempt = 0) {
  return attempt > 0 ? -2.5 : -2;
}

export function validateNormalizedAnalysis(analysis) {
  if (analysis?.risk !== "safe") {
    throw new Error(
      "A cópia normalizada não atingiu margem segura após o encode MP3.",
    );
  }
}

export function normalizePodcastAudioProcessing(value = {}) {
  const voiceProfile = normalizePodcastVoiceProfile(
    firstText(value.voiceProfile, value.podcastVoiceProfile),
  );
  const playbackSpeed = clampNumber(
    Number(value.playbackSpeed ?? value.podcastPlaybackSpeed ?? 1),
    0.8,
    1.2,
    1,
  );
  const trimSilence = booleanValue(
    value.trimSilence ?? value.podcastTrimSilence,
  );
  const voiceBoost = booleanValue(value.voiceBoost ?? value.podcastVoiceBoost);
  return {
    voiceProfile,
    trimSilence,
    voiceBoost,
    playbackSpeed,
    enabled:
      trimSilence ||
      voiceBoost ||
      voiceProfile !== "natural" ||
      playbackSpeed !== 1,
  };
}

export function buildPodcastAudioFilters(value = {}) {
  const processing = normalizePodcastAudioProcessing(value);
  const filters = [];
  if (processing.trimSilence) {
    filters.push(
      "silenceremove=start_periods=1:start_silence=0.15:start_threshold=-50dB:stop_periods=1:stop_silence=0.3:stop_threshold=-50dB",
    );
  }
  filters.push(...voiceProfileFilters(processing.voiceProfile));
  if (processing.voiceBoost) {
    filters.push(
      processing.voiceProfile === "natural"
        ? "acompressor=threshold=-18dB:ratio=2:attack=5:release=100:makeup=2"
        : "volume=1.5dB",
    );
  }
  if (processing.playbackSpeed !== 1) {
    filters.push(`atempo=${formatFilterNumber(processing.playbackSpeed)}`);
  }
  return filters;
}

export function normalizePodcastAudioInserts(value = {}) {
  const intro = firstText(value.intro, value.podcastIntroInsert);
  const ad = firstText(value.ad, value.midroll, value.podcastAdInsert);
  const outro = firstText(value.outro, value.podcastOutroInsert);
  return {
    intro,
    ad,
    outro,
    enabled: Boolean(intro || ad || outro),
  };
}

export async function writeCleanMp3Tags(filePath, draft, coverBuffer) {
  const tags = {
    title: String(draft.title ?? ""),
    artist: String(draft.artist ?? ""),
    album: String(draft.album ?? ""),
    performerInfo: String(draft.albumArtist ?? ""),
    genre: String(draft.genre ?? ""),
    composer: String(draft.composer ?? ""),
    copyright: String(draft.copyright ?? ""),
    year: String(draft.year ?? ""),
    trackNumber: pair(draft.trackNumber, draft.trackTotal),
    partOfSet: pair(draft.diskNumber, draft.diskTotal),
    language: normalizeLanguage(draft.lyricsLanguage),
  };
  if (String(draft.lyrics ?? "").trim()) {
    tags.unsynchronisedLyrics = {
      language: normalizeLanguage(draft.lyricsLanguage),
      text: String(draft.lyrics),
    };
  }
  if (String(draft.comment ?? "").trim()) {
    tags.comment = {
      language: normalizeLanguage(draft.lyricsLanguage),
      text: String(draft.comment),
    };
  }
  if (coverBuffer?.length) {
    tags.image = {
      mime: "image/jpeg",
      type: { id: 3 },
      description: "Album cover",
      imageBuffer: coverBuffer,
    };
  }
  const result = NodeID3.write(tags, filePath);
  if (result instanceof Error) throw result;
}

export function parseLoudnormReport(stderr) {
  const matches = [...String(stderr).matchAll(/\{[\s\S]*?\}/g)];
  for (const match of matches.reverse()) {
    try {
      const report = JSON.parse(match[0]);
      const integratedLufs = Number(report.input_i);
      const truePeakDbtp = Number(report.input_tp);
      const loudnessRangeLu = Number(report.input_lra);
      if (
        ![integratedLufs, truePeakDbtp, loudnessRangeLu].every(Number.isFinite)
      ) {
        continue;
      }
      return {
        integratedLufs,
        truePeakDbtp,
        loudnessRangeLu,
        samplePeakDbfs: truePeakDbtp,
        ...classifyAudioRisk(truePeakDbtp),
      };
    } catch {
      // Ignore unrelated ffmpeg JSON fragments.
    }
  }
  return {
    integratedLufs: Number.NaN,
    truePeakDbtp: Number.NaN,
    loudnessRangeLu: Number.NaN,
    samplePeakDbfs: Number.NaN,
    ...classifyAudioRisk(Number.NaN),
  };
}

export async function analyzeAudioQuality(filePath) {
  const [loudness, peaks] = await Promise.all([
    runFfmpeg([
      "-hide_banner",
      "-i",
      filePath,
      "-af",
      "loudnorm=I=-14:TP=-1:LRA=11:print_format=json",
      "-f",
      "null",
      "-",
    ]),
    runFfmpeg([
      "-hide_banner",
      "-i",
      filePath,
      "-af",
      "astats=metadata=0:reset=0",
      "-f",
      "null",
      "-",
    ]),
  ]);
  const analysis = parseLoudnormReport(loudness.stderr);
  return {
    ...analysis,
    samplePeakDbfs: parseSamplePeakReport(peaks.stderr, analysis.truePeakDbtp),
  };
}

export function parseSamplePeakReport(stderr, fallback = Number.NaN) {
  const matches = [
    ...String(stderr).matchAll(/Peak level dB:\s*(-?(?:\d+(?:\.\d+)?|inf))/gi),
  ];
  const value = Number(matches.at(-1)?.[1]);
  return Number.isFinite(value) ? value : fallback;
}

export function romanNumeral(value) {
  let remaining = Math.max(0, Math.floor(Number(value) || 0));
  const pairs = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let output = "";
  for (const [number, numeral] of pairs) {
    while (remaining >= number) {
      output += numeral;
      remaining -= number;
    }
  }
  return output;
}

export async function createNumberedCover(
  basePath,
  outputPath,
  {
    index = 1,
    style = "roman",
    includeNumber = true,
    label,
    sublines = [],
    fontSize = 112,
    color = "#fffaf1",
    opacity = 92,
    x = 50,
    y = 89,
    letterSpacing = 18,
    metaFontSize = 34,
    metaGap = 10,
  } = {},
) {
  const numeral =
    includeNumber === false
      ? ""
      : label || (style === "arabic" ? String(index) : romanNumeral(index));
  const safeMetaFontSize = Math.max(
    18,
    Math.min(72, Number(metaFontSize) || 34),
  );
  const safeMetaGap = Math.max(0, Math.min(48, Number(metaGap) || 0));
  const safeSublines = sublines
    .map((line) => {
      const candidate =
        line && typeof line === "object" ? line : { text: line };
      const role = String(candidate.role ?? "meta");
      const maxFontSize = role === "series" ? 240 : 72;
      return {
        role,
        text: String(candidate.text ?? "").trim(),
        fontSize: Math.max(
          18,
          Math.min(maxFontSize, Number(candidate.fontSize) || safeMetaFontSize),
        ),
        color: /^#[0-9a-f]{6}$/i.test(String(candidate.color ?? ""))
          ? candidate.color
          : color,
        fontWeight: Math.max(
          300,
          Math.min(900, Number(candidate.fontWeight) || 520),
        ),
        fontStyle: candidate.fontStyle === "italic" ? "italic" : "normal",
        textAnchor:
          candidate.align === "left"
            ? "start"
            : candidate.align === "right"
              ? "end"
              : "middle",
        opacity: Math.max(
          0.1,
          Math.min(1, (Number(candidate.opacity) || 76) / 100),
        ),
        letterSpacing: Math.max(
          0,
          Math.min(80, Number(candidate.letterSpacing) || 5),
        ),
        offsetX: Math.max(-320, Math.min(320, Number(candidate.offsetX) || 0)),
        offsetY: Math.max(-320, Math.min(320, Number(candidate.offsetY) || 0)),
      };
    })
    .filter((line) => line.text)
    .slice(0, 5);
  const mainY = Math.round(
    (Math.max(8, Math.min(94, Number(y) || 89)) / 100) * 1600,
  );
  const mainX = Math.round(
    (Math.max(8, Math.min(92, Number(x) || 50)) / 100) * 1600,
  );
  const safeFontSize = Math.max(38, Math.min(240, Number(fontSize) || 112));
  const safeOpacity = Math.max(0.1, Math.min(1, (Number(opacity) || 92) / 100));
  const safeLetterSpacing = Math.max(
    0,
    Math.min(80, Number(letterSpacing) || 18),
  );
  const mainLine = numeral
    ? [
        {
          role: "series",
          text: numeral,
          fontSize: safeFontSize,
          color,
          fontWeight: 400,
          fontStyle: "normal",
          textAnchor: "middle",
          opacity: safeOpacity,
          letterSpacing: safeLetterSpacing,
          offsetX: 0,
          offsetY: 0,
        },
      ]
    : [];
  const lines = [...mainLine, ...safeSublines].slice(0, 5);
  let lineY = mainY;
  const overlay = Buffer.from(`
    <svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
      <style>
        .series { font-family: "Georgia", "Times New Roman", serif; }
        .meta { font-family: "Inter", "Arial", sans-serif; }
      </style>
      ${lines
        .map((line) => {
          const y = lineY + line.offsetY;
          lineY +=
            line.role === "series"
              ? Math.round(line.fontSize * 0.48) + safeMetaGap
              : line.fontSize + safeMetaGap;
          const cssClass = line.role === "series" ? "series" : "meta";
          return `<text x="${mainX + line.offsetX}" y="${y}" text-anchor="${line.textAnchor}" class="${cssClass}" font-size="${line.fontSize}px" font-weight="${line.fontWeight}" font-style="${line.fontStyle}" letter-spacing="${line.letterSpacing}px" fill="${escapeXml(line.color)}" fill-opacity="${line.opacity}">${escapeXml(line.text)}</text>`;
        })
        .join("")}
    </svg>
  `);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(basePath)
    .resize(1600, 1600, { fit: "cover" })
    .composite([{ input: overlay }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toFile(outputPath);
  return outputPath;
}

export async function createAlbumFolderCover(basePath, outputPath) {
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${crypto.randomUUID()}.tmp.jpg`,
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await sharp(basePath)
      .resize(1600, 1600, { fit: "cover" })
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toFile(temporaryPath);
    await fs.rm(outputPath, { force: true });
    await fs.rename(temporaryPath, outputPath);
    return outputPath;
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function processMp3Copy({
  inputPath,
  inputName = inputPath,
  outputPath,
  draft,
  coverPath,
  normalizationEnabled = false,
}) {
  if (!isEditableMp3(inputName)) {
    throw new Error("A edicao embutida da v1.0.0 aceita apenas arquivos MP3.");
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${crypto.randomUUID()}.tmp.mp3`,
  );
  const mainTemporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${crypto.randomUUID()}.main.mp3`,
  );
  const mixedTemporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${crypto.randomUUID()}.mixed.mp3`,
  );
  try {
    const coverBuffer = coverPath
      ? await sharp(coverPath)
          .resize(1600, 1600, { fit: "cover" })
          .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
          .toBuffer()
      : null;
    let analysis;
    let tags;
    const attempts = normalizationEnabled ? 2 : 1;
    const podcastAudioFilters = buildPodcastAudioFilters(draft);
    const podcastAudioInserts = await resolvePodcastAudioInserts(
      draft,
      inputPath,
    );
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (podcastAudioInserts.enabled) {
        if (podcastAudioFilters.length) {
          await processMp3WithAudioFilters(
            inputPath,
            mainTemporaryPath,
            podcastAudioFilters,
          );
        } else {
          await fs.copyFile(inputPath, mainTemporaryPath);
        }
        await mixPodcastAudioInserts(
          mainTemporaryPath,
          mixedTemporaryPath,
          podcastAudioInserts,
        );
        if (normalizationEnabled) {
          await normalizeMp3(
            mixedTemporaryPath,
            temporaryPath,
            normalizedMp3TruePeakTarget(attempt),
          );
        } else {
          await fs.copyFile(mixedTemporaryPath, temporaryPath);
        }
      } else if (normalizationEnabled) {
        await normalizeMp3(
          inputPath,
          temporaryPath,
          normalizedMp3TruePeakTarget(attempt),
          podcastAudioFilters,
        );
      } else if (podcastAudioFilters.length) {
        await processMp3WithAudioFilters(
          inputPath,
          temporaryPath,
          podcastAudioFilters,
        );
      } else {
        await fs.copyFile(inputPath, temporaryPath);
      }
      await writeCleanMp3Tags(temporaryPath, draft, coverBuffer);
      await assertDecodedAudio(temporaryPath);
      tags = NodeID3.read(temporaryPath);
      if (String(tags.title ?? "") !== String(draft.title ?? "")) {
        throw new Error("Validacao ID3 falhou para o titulo tratado.");
      }
      analysis = await analyzeAudioQuality(temporaryPath);
      if (!normalizationEnabled || analysis.risk === "safe") break;
    }
    if (normalizationEnabled) validateNormalizedAnalysis(analysis);
    await fs.rm(outputPath, { force: true });
    await fs.rename(temporaryPath, outputPath);
    return { outputPath, analysis, tags };
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  } finally {
    await Promise.all([
      fs.rm(mainTemporaryPath, { force: true }).catch(() => {}),
      fs.rm(mixedTemporaryPath, { force: true }).catch(() => {}),
    ]);
  }
}

export function isEditableMp3(inputName) {
  return path.extname(inputName).toLowerCase() === ".mp3";
}

export async function normalizeMp3(
  inputPath,
  outputPath,
  truePeakDbtp = -2,
  preFilters = [],
) {
  const firstPass = await runFfmpeg([
    "-hide_banner",
    "-i",
    inputPath,
    "-af",
    audioFilterArgument([
      ...preFilters,
      `loudnorm=I=-14:TP=${truePeakDbtp}:LRA=11:print_format=json`,
    ]),
    "-f",
    "null",
    "-",
  ]);
  const report = parseLoudnormJson(firstPass.stderr);
  const loudnormFilter = [
    `loudnorm=I=-14:TP=${truePeakDbtp}:LRA=11`,
    `measured_I=${report.input_i}`,
    `measured_LRA=${report.input_lra}`,
    `measured_TP=${report.input_tp}`,
    `measured_thresh=${report.input_thresh}`,
    `offset=${report.target_offset}`,
    "linear=true",
    "print_format=summary",
  ].join(":");
  const filter = audioFilterArgument([...preFilters, loudnormFilter]);
  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    "-map_metadata",
    "-1",
    "-af",
    filter,
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "0",
    outputPath,
  ]);
}

async function processMp3WithAudioFilters(inputPath, outputPath, filters) {
  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    "-map_metadata",
    "-1",
    "-af",
    audioFilterArgument(filters),
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "0",
    outputPath,
  ]);
}

async function resolvePodcastAudioInserts(draft, inputPath) {
  const inserts = normalizePodcastAudioInserts(draft);
  if (!inserts.enabled) return inserts;
  const baseDirectory = path.dirname(inputPath);
  return {
    intro: await resolvePodcastInsertPath(
      inserts.intro,
      baseDirectory,
      "Insert de abertura",
    ),
    ad: await resolvePodcastInsertPath(
      inserts.ad,
      baseDirectory,
      "Insert de intervalo",
    ),
    outro: await resolvePodcastInsertPath(
      inserts.outro,
      baseDirectory,
      "Insert de encerramento",
    ),
    enabled: true,
  };
}

async function resolvePodcastInsertPath(source, baseDirectory, label) {
  const value = firstText(source);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    throw new Error(`${label} precisa apontar para um arquivo de audio local.`);
  }
  const candidates = path.isAbsolute(value)
    ? [value]
    : [path.resolve(baseDirectory, value), path.resolve(process.cwd(), value)];
  for (const candidate of candidates) {
    if (await isReadableAudioInsert(candidate)) return candidate;
  }
  throw new Error(`${label} nao encontrado: ${value}`);
}

async function isReadableAudioInsert(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && isPodcastInsertAudioFile(filePath);
  } catch {
    return false;
  }
}

function isPodcastInsertAudioFile(filePath) {
  return [".aac", ".flac", ".m4a", ".mp3", ".ogg", ".opus", ".wav"].includes(
    path.extname(filePath).toLowerCase(),
  );
}

async function mixPodcastAudioInserts(mainPath, outputPath, inserts) {
  const inputs = [];
  let introIndex = -1;
  let mainIndex = -1;
  let adIndex = -1;
  let outroIndex = -1;
  if (inserts.intro) {
    introIndex = inputs.push(inserts.intro) - 1;
  }
  mainIndex = inputs.push(mainPath) - 1;
  if (inserts.ad) {
    adIndex = inputs.push(inserts.ad) - 1;
  }
  if (inserts.outro) {
    outroIndex = inputs.push(inserts.outro) - 1;
  }

  const filter =
    adIndex >= 0
      ? await podcastMidrollFilter({
          adIndex,
          introIndex,
          mainIndex,
          mainPath,
          outroIndex,
        })
      : podcastConcatFilter({ introIndex, mainIndex, outroIndex });
  const args = ["-y", "-hide_banner"];
  for (const input of inputs) {
    args.push("-i", input);
  }
  await runFfmpeg([
    ...args,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-map_metadata",
    "-1",
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "0",
    outputPath,
  ]);
}

function podcastConcatFilter({
  adIndex = -1,
  introIndex,
  mainIndex,
  outroIndex,
}) {
  const filters = [];
  const labels = [];
  if (introIndex >= 0) {
    filters.push(podcastSegmentFilter(introIndex, "intro"));
    labels.push("[intro]");
  }
  filters.push(podcastSegmentFilter(mainIndex, "main"));
  labels.push("[main]");
  if (adIndex >= 0) {
    filters.push(podcastSegmentFilter(adIndex, "ad"));
    labels.push("[ad]");
  }
  if (outroIndex >= 0) {
    filters.push(podcastSegmentFilter(outroIndex, "outro"));
    labels.push("[outro]");
  }
  filters.push(`${labels.join("")}concat=n=${labels.length}:v=0:a=1[out]`);
  return filters.join(";");
}

async function podcastMidrollFilter({
  adIndex,
  introIndex,
  mainIndex,
  mainPath,
  outroIndex,
}) {
  const duration = await audioDurationSeconds(mainPath);
  if (!Number.isFinite(duration) || duration <= 0.25) {
    return podcastConcatFilter({ adIndex, introIndex, mainIndex, outroIndex });
  }
  const midpoint = formatFilterNumber(duration / 2);
  const filters = [];
  const labels = [];
  if (introIndex >= 0) {
    filters.push(podcastSegmentFilter(introIndex, "intro"));
    labels.push("[intro]");
  }
  filters.push(
    `[${mainIndex}:a]${podcastSegmentFormat()},asplit=2[main_before][main_after]`,
  );
  filters.push(
    `[main_before]atrim=start=0:end=${midpoint},asetpts=PTS-STARTPTS[main_pre]`,
  );
  filters.push(
    `[main_after]atrim=start=${midpoint},asetpts=PTS-STARTPTS[main_post]`,
  );
  filters.push(podcastSegmentFilter(adIndex, "ad"));
  labels.push("[main_pre]", "[ad]", "[main_post]");
  if (outroIndex >= 0) {
    filters.push(podcastSegmentFilter(outroIndex, "outro"));
    labels.push("[outro]");
  }
  filters.push(`${labels.join("")}concat=n=${labels.length}:v=0:a=1[out]`);
  return filters.join(";");
}

async function audioDurationSeconds(filePath) {
  const result = await runFfmpeg([
    "-hide_banner",
    "-i",
    filePath,
    "-f",
    "null",
    "-",
  ]);
  const match = result.stderr.match(
    /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/,
  );
  if (!match) return Number.NaN;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function podcastSegmentFilter(index, label) {
  return `[${index}:a]${podcastSegmentFormat()}[${label}]`;
}

function podcastSegmentFormat() {
  return "aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo";
}

function audioFilterArgument(filters) {
  return filters.filter(Boolean).join(",");
}

function normalizePodcastVoiceProfile(value) {
  const id = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["broadcast", "warm", "clear"].includes(id) ? id : "natural";
}

function voiceProfileFilters(profile) {
  return (
    {
      broadcast: [
        "highpass=f=80",
        "lowpass=f=14000",
        "acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=2",
      ],
      warm: [
        "highpass=f=65",
        "lowpass=f=12000",
        "bass=g=2:f=160:w=0.8",
        "acompressor=threshold=-20dB:ratio=1.8:attack=12:release=160:makeup=1.5",
      ],
      clear: [
        "highpass=f=95",
        "lowpass=f=15000",
        "equalizer=f=3200:t=q:w=1.1:g=2",
        "acompressor=threshold=-19dB:ratio=2:attack=6:release=100:makeup=1.5",
      ],
    }[profile] ?? []
  );
}

function booleanValue(value) {
  return value === true || String(value ?? "").toLowerCase() === "true";
}

function clampNumber(value, min, max, fallback) {
  return Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function formatFilterNumber(value) {
  return String(Math.round(Number(value) * 1000) / 1000);
}

async function assertDecodedAudio(filePath) {
  await runFfmpeg(["-v", "error", "-i", filePath, "-f", "null", "-"]);
}

function parseLoudnormJson(stderr) {
  const matches = [...String(stderr).matchAll(/\{[\s\S]*?\}/g)];
  for (const match of matches.reverse()) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed.input_i && parsed.input_tp && parsed.input_lra) return parsed;
    } catch {
      // Ignore unrelated ffmpeg output.
    }
  }
  throw new Error("Não foi possível interpretar a análise loudnorm do ffmpeg.");
}

function runFfmpeg(args) {
  const ffmpegPath = resolveFfmpegPath();
  return new Promise((resolve, reject) => {
    let stderr = "";
    let stdout = "";
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) =>
      reject(normalizeFfmpegSpawnError(error, ffmpegPath)),
    );
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`ffmpeg terminou com codigo ${code}: ${stderr}`));
    });
  });
}

function pair(value, total) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  const count = Number(total);
  return Number.isFinite(count) && count > 0
    ? `${number}/${count}`
    : `${number}`;
}

function normalizeLanguage(value) {
  return /^[a-z]{3}$/i.test(String(value ?? "")) ? String(value) : "und";
}

function safeName(value) {
  return (
    String(value ?? "")
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "") || "Sem titulo"
  );
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(value) {
  return String(value).replace(
    /[<>&'"]/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[character],
  );
}
