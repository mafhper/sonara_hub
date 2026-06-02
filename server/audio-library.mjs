import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import NodeID3 from "node-id3";
import sharp from "sharp";

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

export function buildTreatedFileName(tags) {
  const track = String(tags.trackNumber || 0).padStart(2, "0");
  return `${safeName(tags.album)} - ${track} - ${safeName(tags.title)}.mp3`;
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
    label || (style === "arabic" ? String(index) : romanNumeral(index));
  const safeMetaFontSize = Math.max(
    18,
    Math.min(72, Number(metaFontSize) || 34),
  );
  const safeMetaGap = Math.max(0, Math.min(48, Number(metaGap) || 0));
  const safeSublines = sublines
    .map((line) => {
      const candidate =
        line && typeof line === "object" ? line : { text: line };
      return {
        text: String(candidate.text ?? "").trim(),
        fontSize: Math.max(
          18,
          Math.min(72, Number(candidate.fontSize) || safeMetaFontSize),
        ),
        color: /^#[0-9a-f]{6}$/i.test(String(candidate.color ?? ""))
          ? candidate.color
          : color,
        opacity: Math.max(
          0.1,
          Math.min(1, (Number(candidate.opacity) || 76) / 100),
        ),
        offsetX: Math.max(-320, Math.min(320, Number(candidate.offsetX) || 0)),
        offsetY: Math.max(-320, Math.min(320, Number(candidate.offsetY) || 0)),
      };
    })
    .filter((line) => line.text)
    .slice(0, 4);
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
  let metaY = mainY + Math.round(safeFontSize * 0.48);
  const overlay = Buffer.from(`
    <svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
      <style>
        .number { font-family: "Georgia", "Times New Roman", serif; font-size: ${safeFontSize}px; font-weight: 400; letter-spacing: ${safeLetterSpacing}px; }
        .meta { font-family: "Inter", "Arial", sans-serif; font-weight: 520; letter-spacing: 5px; }
      </style>
      <text x="${mainX}" y="${mainY}" text-anchor="middle" class="number" fill="${escapeXml(color)}" fill-opacity="${safeOpacity}">${escapeXml(numeral)}</text>
      ${safeSublines
        .map((line) => {
          const y = metaY + line.offsetY;
          metaY += line.fontSize + safeMetaGap;
          return `<text x="${mainX + line.offsetX}" y="${y}" text-anchor="middle" class="meta" font-size="${line.fontSize}px" fill="${escapeXml(line.color)}" fill-opacity="${line.opacity}">${escapeXml(line.text)}</text>`;
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
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (normalizationEnabled) {
        await normalizeMp3(
          inputPath,
          temporaryPath,
          normalizedMp3TruePeakTarget(attempt),
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
  }
}

export function isEditableMp3(inputName) {
  return path.extname(inputName).toLowerCase() === ".mp3";
}

export async function normalizeMp3(inputPath, outputPath, truePeakDbtp = -2) {
  const firstPass = await runFfmpeg([
    "-hide_banner",
    "-i",
    inputPath,
    "-af",
    `loudnorm=I=-14:TP=${truePeakDbtp}:LRA=11:print_format=json`,
    "-f",
    "null",
    "-",
  ]);
  const report = parseLoudnormJson(firstPass.stderr);
  const filter = [
    `loudnorm=I=-14:TP=${truePeakDbtp}:LRA=11`,
    `measured_I=${report.input_i}`,
    `measured_LRA=${report.input_lra}`,
    `measured_TP=${report.input_tp}`,
    `measured_thresh=${report.input_thresh}`,
    `offset=${report.target_offset}`,
    "linear=true",
    "print_format=summary",
  ].join(":");
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
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static não forneceu um binário de ffmpeg.");
  }
  return new Promise((resolve, reject) => {
    let stderr = "";
    let stdout = "";
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
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
