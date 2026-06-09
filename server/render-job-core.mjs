import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parseFile } from "music-metadata";
import sharp from "sharp";
import {
  renderWebglBackgroundVideo,
  renderWebglScenePoster,
} from "./webgl-export.mjs";
import { sampleAudioEnvelope } from "./audio-envelope.mjs";
import { analyzeAudioQuality } from "./audio-library.mjs";
import {
  createCanceledJobError,
  createJobStageTracker,
} from "./job-service.mjs";
import { renderCanvasSize } from "./render-profile.mjs";
import { safeSvgBuffer } from "./svg-safety.mjs";
import { buildWebglMuxArgs } from "./video-mux.mjs";
import { validateVideoAudioAnalysis } from "./video-quality.mjs";
import {
  createFfmpegProcessError,
  normalizeFfmpegSpawnError,
  resolveFfmpegPath,
} from "./ffmpeg-tool.mjs";
import {
  clampPublicationLyricsLineSpacing,
  normalizePublicationLyricsMode,
  publicationLyricsTextForSettings,
} from "../shared/publication-assets.mjs";

export async function renderVideoJob({
  jobId,
  audioPath,
  backgroundFile,
  mediaLayerFiles = [],
  coverFile,
  lyricsText,
  settings,
  metadata,
  outputPath,
  outputName,
  workDir,
  updateJob,
  shouldCancel,
}) {
  const stages = createJobStageTracker({ jobId, updateJob });
  assertNotCanceled(shouldCancel);
  stages.enter("audio-analysis", {
    status: "running",
    progress: 1,
    message: "Analisando áudio",
  });
  const audio = await analyzeAudio(audioPath);
  const sourceAnalysis = await analyzeAudioQuality(audioPath);
  assertNotCanceled(shouldCancel);
  const duration = Math.max(
    1,
    audio.durationSeconds ?? Number(settings.durationFallback),
  );
  const outputSize = presetSize(settings.preset);
  const size = renderCanvasSize(outputSize, settings);
  const jobWorkDir = path.join(workDir, jobId);
  await fs.mkdir(jobWorkDir, { recursive: true });

  const background = backgroundFile
    ? await prepareBackground(backgroundFile, jobWorkDir, size)
    : { type: "generated", path: null };
  const mediaLayers = await prepareMediaLayers(
    mediaLayerFiles,
    settings.compositionSettings.mediaLayers,
    jobWorkDir,
    size,
  );
  if (background.type !== "generated" && mediaLayers.length === 0) {
    mediaLayers.push({
      ...background,
      opacity: 100,
      scale: 100,
      x: 50,
      y: 50,
      rotation: 0,
      shadow: { opacity: 0, blur: 18, x: 0, y: 12 },
      visible: true,
      fit: "cover",
      blendMode: "normal",
      loop: true,
      order: 0,
    });
  }
  const cover = coverFile
    ? await prepareCover(coverFile, jobWorkDir)
    : metadata.useEmbeddedCover
      ? await prepareEmbeddedCover(audioPath, jobWorkDir)
      : null;
  const lyrics = parseLyrics(lyricsText);
  const subtitlePath =
    settings.includeLyrics && lyrics.lyricLines.length > 0
      ? await writeAssOverlay({
          filePath: path.join(jobWorkDir, "lyrics.ass"),
          lines: lyrics.lyricLines,
          duration,
          width: outputSize.width,
          height: outputSize.height,
          position: "bottom",
        })
      : null;

  assertNotCanceled(shouldCancel);
  stages.enter("webgl-render", { progress: 4, message: "Preparando cena" });
  const webglVideoPath = path.join(jobWorkDir, "webgl-background.webm");
  const audioEnvelope = await sampleAudioEnvelope(audioPath);
  await renderWebglBackgroundVideo({
    outputPath: webglVideoPath,
    size,
    duration,
    settings,
    audioEnvelope,
    composition: {
      layers: mediaLayers.map(toCanvasLayer),
      coverSrc: cover?.path ? pathToFileURL(cover.path).href : "",
      durationSeconds: settings.compositionSettings.durationSeconds || duration,
      metadata,
      showMetadata: settings.showMetadata,
      textSettings: settings.compositionSettings.textSettings,
    },
    onProgress: (progress, message) => updateJob(jobId, { progress, message }),
    shouldCancel,
  });
  assertNotCanceled(shouldCancel);
  stages.enter("ffmpeg-mux", { progress: 92, message: "Finalizando mux" });
  const muxArgs = buildWebglMuxArgs({
    audioPath,
    duration,
    metadata,
    outputPath,
    outputSize,
    settings,
    subtitlePath,
    webglVideoPath,
  });
  await runFfmpeg(muxArgs, duration, (progress, message) =>
    updateJob(jobId, {
      progress: Math.max(92, progress),
      message: message.replace("Renderizando", "Finalizando"),
    }),
  );
  assertNotCanceled(shouldCancel);
  stages.enter("output-validation", {
    progress: 97,
    message: "Validando arquivo final",
  });
  await assertPlayableOutput(outputPath);
  const outputAnalysis = await analyzeAudioQuality(outputPath);
  try {
    validateVideoAudioAnalysis(outputAnalysis);
  } catch (error) {
    await fs.rm(outputPath, { force: true });
    throw error;
  }
  const thumbnailPath = cover?.path ? `${outputPath}.cover.png` : null;
  if (thumbnailPath) {
    await fs.copyFile(cover.path, thumbnailPath);
  }
  await writeYoutubeSidecar(
    outputPath,
    metadata,
    settings,
    thumbnailPath,
    sourceAnalysis,
    outputAnalysis,
  );
  stages.finish({
    status: "done",
    progress: 100,
    message: "Renderização concluída",
    outputUrl: `/outputs/${outputName}`,
    sidecarUrl: `/outputs/${outputName}.youtube.json`,
    thumbnailUrl: thumbnailPath
      ? `/outputs/${path.basename(thumbnailPath)}`
      : null,
  });
}

export async function renderPublicationAssetJob({
  jobId,
  audioPath,
  backgroundFile,
  mediaLayerFiles = [],
  coverFile,
  settings,
  metadata,
  preset,
  clipStart,
  clipDuration,
  includeFullLyrics,
  lyricsMode,
  lyricsExcerpt,
  lyricsHideTags,
  lyricsLineSpacing,
  generateDataFiles = true,
  outputPath,
  outputName,
  workDir,
  updateJob,
  shouldCancel,
}) {
  const stages = createJobStageTracker({ jobId, updateJob });
  assertNotCanceled(shouldCancel);
  stages.enter("asset-prepare", {
    status: "running",
    progress: 1,
    message: "Preparando asset",
  });
  const audio = await analyzeAudio(audioPath);
  const duration =
    preset.kind === "clip"
      ? Math.min(
          clipDuration,
          Math.max(
            1,
            Number(audio.durationSeconds ?? clipDuration) - clipStart,
          ),
        )
      : 1;
  const outputSize = { width: preset.width, height: preset.height };
  const size = renderCanvasSize(outputSize, settings);
  const jobWorkDir = path.join(workDir, jobId);
  await fs.mkdir(jobWorkDir, { recursive: true });

  const background = backgroundFile
    ? await prepareBackground(backgroundFile, jobWorkDir, size)
    : { type: "generated", path: null };
  const mediaLayers = await prepareMediaLayers(
    mediaLayerFiles,
    settings.compositionSettings.mediaLayers,
    jobWorkDir,
    size,
  );
  if (background.type !== "generated" && mediaLayers.length === 0) {
    mediaLayers.push({
      ...background,
      opacity: 100,
      scale: 100,
      x: 50,
      y: 50,
      rotation: 0,
      shadow: { opacity: 0, blur: 18, x: 0, y: 12 },
      visible: true,
      fit: "cover",
      blendMode: "normal",
      loop: true,
      order: 0,
    });
  }
  const cover = coverFile
    ? await prepareCover(coverFile, jobWorkDir)
    : metadata.useEmbeddedCover
      ? await prepareEmbeddedCover(audioPath, jobWorkDir)
      : null;

  assertNotCanceled(shouldCancel);
  stages.enter(preset.kind === "image" ? "poster-render" : "webgl-render", {
    progress: 4,
    message: "Renderizando divulgação",
  });
  const audioEnvelope = await sampleAudioEnvelope(audioPath);
  const composition = {
    layers: mediaLayers.map(toCanvasLayer),
    coverSrc: cover?.path ? pathToFileURL(cover.path).href : "",
    durationSeconds:
      settings.compositionSettings.durationSeconds ||
      audio.durationSeconds ||
      duration,
    metadata,
    showMetadata: settings.showMetadata,
    textSettings: settings.compositionSettings.textSettings,
  };

  if (preset.kind === "image") {
    await renderWebglScenePoster({
      outputPath,
      size,
      settings,
      audioEnvelope,
      composition,
      posterTime: clipStart,
      onProgress: (progress, message) =>
        updateJob(jobId, {
          progress: Math.max(4, Math.min(90, progress)),
          message,
        }),
    });
  } else {
    const webglVideoPath = path.join(jobWorkDir, "publication-background.webm");
    await renderWebglBackgroundVideo({
      outputPath: webglVideoPath,
      size,
      duration,
      startTime: clipStart,
      settings,
      audioEnvelope,
      composition,
      onProgress: (progress, message) =>
        updateJob(jobId, { progress, message }),
      shouldCancel,
    });
    assertNotCanceled(shouldCancel);
    stages.enter("ffmpeg-mux", { progress: 92, message: "Finalizando mux" });
    const muxArgs = buildWebglMuxArgs({
      audioPath,
      audioStartSeconds: clipStart,
      duration,
      metadata,
      outputPath,
      outputSize,
      settings,
      subtitlePath: null,
      webglVideoPath,
    });
    await runFfmpeg(muxArgs, duration, (progress, message) =>
      updateJob(jobId, {
        progress: Math.max(92, progress),
        message: message.replace("Renderizando", "Finalizando"),
      }),
    );
    stages.enter("output-validation", {
      progress: 97,
      message: "Validando asset final",
    });
    await assertPlayableOutput(outputPath);
  }

  // Data files (json/markdown manifest) are optional — sometimes the user only
  // wants the clip/image itself.
  let manifestPath = null;
  let markdownPath = null;
  if (generateDataFiles !== false) {
    stages.enter("manifest", {
      progress: 98,
      message: "Gravando manifesto de divulgação",
    });
    manifestPath = `${outputPath}.manifest.json`;
    markdownPath = `${outputPath}.manifest.md`;
    await writePublicationManifest({
      manifestPath,
      markdownPath,
      outputName,
      metadata,
      preset,
      clipStart,
      duration,
      includeFullLyrics,
      lyricsMode,
      lyricsExcerpt,
      lyricsHideTags,
      lyricsLineSpacing,
    });
  }
  stages.finish({
    status: "done",
    progress: 100,
    message: "Asset de divulgação concluído",
    outputUrl: `/outputs/${outputName}`,
    sidecarUrl: manifestPath ? `/outputs/${path.basename(manifestPath)}` : null,
    markdownUrl: markdownPath
      ? `/outputs/${path.basename(markdownPath)}`
      : null,
    thumbnailUrl: preset.kind === "image" ? `/outputs/${outputName}` : null,
    assetUrls: [
      `/outputs/${outputName}`,
      ...(manifestPath ? [`/outputs/${path.basename(manifestPath)}`] : []),
      ...(markdownPath ? [`/outputs/${path.basename(markdownPath)}`] : []),
    ],
  });
}

function assertNotCanceled(shouldCancel) {
  if (typeof shouldCancel === "function" && shouldCancel()) {
    throw createCanceledJobError();
  }
}

async function analyzeAudio(filePath) {
  const metadata = await parseFile(filePath);
  const stat = await fs.stat(filePath);
  const common = metadata.common;
  return {
    fileName: path.basename(filePath),
    sizeBytes: stat.size,
    durationSeconds: metadata.format.duration ?? null,
    bitrate: metadata.format.bitrate ?? null,
    sampleRate: metadata.format.sampleRate ?? null,
    channels: metadata.format.numberOfChannels ?? null,
    codec: metadata.format.codec ?? metadata.format.container ?? null,
    title: common.title ?? null,
    artist: common.artist ?? null,
    album: common.album ?? null,
    albumArtist: common.albumartist ?? null,
    genre: common.genre?.join(", ") ?? null,
    year: common.year ?? null,
    date: common.date ?? null,
    track: common.track?.no ?? null,
    disk: common.disk?.no ?? null,
    composer: common.composer?.join(", ") ?? null,
    hasEmbeddedCover: Boolean(common.picture?.length),
  };
}

function parseLyrics(text = "") {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const lines = normalized
    ? normalized
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  const lyricLines = lines.slice(3);
  return {
    text: normalized,
    lyricLines,
    lineCount: lyricLines.length,
  };
}

async function writePublicationManifest({
  manifestPath,
  markdownPath,
  outputName,
  metadata,
  preset,
  clipStart,
  duration,
  includeFullLyrics,
  lyricsMode,
  lyricsExcerpt,
  lyricsHideTags,
  lyricsLineSpacing,
}) {
  const normalizedLyricsMode = normalizePublicationLyricsMode(
    lyricsMode,
    includeFullLyrics,
  );
  const normalizedLyricsLineSpacing =
    clampPublicationLyricsLineSpacing(lyricsLineSpacing);
  const includedLyrics = publicationLyricsTextForSettings(metadata.lyrics, {
    includeLyrics: normalizedLyricsMode !== "none",
    lyricsExcerpt,
    lyricsHideTags,
    lyricsLineSpacing: normalizedLyricsLineSpacing,
    lyricsMode: normalizedLyricsMode,
  });
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    preset,
    timing: {
      startSeconds: clipStart,
      durationSeconds: duration,
    },
    metadata: {
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      albumArtist: metadata.albumArtist,
      year: metadata.year,
      genre: metadata.genre,
      language: metadata.language,
      description: metadata.description,
      tags: metadata.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      hasLyrics: Boolean(metadata.lyrics?.trim()),
      lyricsMode: normalizedLyricsMode,
      lyricsExcerpt:
        normalizedLyricsMode === "excerpt" ? includedLyrics : undefined,
      lyricsHideTags: Boolean(lyricsHideTags),
      lyricsLineSpacing: normalizedLyricsLineSpacing,
      lyrics: includedLyrics || undefined,
    },
    includeFullLyrics: normalizedLyricsMode === "full",
    files: [
      {
        kind: preset.kind,
        path: `${preset.directory}/${outputName}`,
        url: `/outputs/${outputName}`,
      },
      {
        kind: "manifest-json",
        path: `dados/${path.basename(manifestPath)}`,
        url: `/outputs/${path.basename(manifestPath)}`,
      },
      {
        kind: "manifest-markdown",
        path: `dados/${path.basename(markdownPath)}`,
        url: `/outputs/${path.basename(markdownPath)}`,
      },
    ],
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  await fs.writeFile(
    markdownPath,
    publicationManifestMarkdown(manifest),
    "utf8",
  );
}

function publicationManifestMarkdown(manifest) {
  const metadata = manifest.metadata;
  const tags = metadata.tags.length ? metadata.tags.join(", ") : "-";
  const lyricsModeLabel =
    {
      full: "completa",
      excerpt: "trecho editado",
      none: "sem letra",
    }[metadata.lyricsMode] ?? "sem letra";
  return [
    `# ${metadata.album || metadata.title || "Asset de divulgação"}`,
    "",
    `- Preset: ${manifest.preset.label}`,
    `- Formato: ${manifest.preset.width}x${manifest.preset.height}`,
    `- Arquivo: ${manifest.files[0].path}`,
    `- Trecho: ${manifest.timing.startSeconds}s + ${manifest.timing.durationSeconds}s`,
    `- Faixa: ${metadata.title || "-"}`,
    `- Artista: ${metadata.artist || metadata.albumArtist || "-"}`,
    `- Álbum: ${metadata.album || "-"}`,
    `- Ano: ${metadata.year || "-"}`,
    `- Tags: ${tags}`,
    `- Letra disponível: ${metadata.hasLyrics ? "sim" : "não"}`,
    `- Letra incluída: ${lyricsModeLabel}`,
    `- Tags ocultas: ${metadata.lyricsHideTags ? "sim" : "não"}`,
    `- Espaçamento da letra: ${metadata.lyricsLineSpacing}%`,
    metadata.lyrics ? `\n## Letra\n\n${metadata.lyrics}` : "",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function writeYoutubeSidecar(
  outputPath,
  metadata,
  settings,
  thumbnailPath = null,
  sourceAnalysis = null,
  outputAnalysis = null,
) {
  const sidecar = {
    api: "YouTube Data API v3",
    upload: {
      endpoint: "videos.insert",
      part: ["snippet", "status"],
      body: {
        snippet: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          categoryId: metadata.categoryId,
          defaultLanguage: metadata.language,
          defaultAudioLanguage: metadata.language,
        },
        status: {
          privacyStatus: metadata.visibility,
          selfDeclaredMadeForKids: metadata.madeForKids,
          containsSyntheticMedia: metadata.containsSyntheticMedia,
        },
        recordingDetails: metadata.recordingDate
          ? { recordingDate: metadata.recordingDate }
          : undefined,
      },
    },
    thumbnail: {
      endpoint: "thumbnails.set",
      fileName: thumbnailPath ? path.basename(thumbnailPath) : null,
      note: "Enviar a capa escolhida depois do upload do video, se aplicavel.",
    },
    youtubeMusic: {
      note: "YouTube Music não possui fluxo público equivalente de upload de vídeo via Data API; use os metadados de música, capa e álbum como referência para upload/distribuição manual.",
    },
    export: {
      outputFileName: path.basename(outputPath),
      version: metadata.version,
      metadata: {
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        albumArtist: metadata.albumArtist,
        year: metadata.year,
        genre: metadata.genre,
        language: metadata.language,
      },
      preset: settings.preset,
      visualPreset: settings.effect,
      visualSettings: settings.visualSettings,
      compositionSettings: settings.compositionSettings,
      qualityProfile: settings.qualityProfile,
      audioSource: {
        analysis: sourceAnalysis,
        reducedHeadroomAcknowledged: Boolean(
          settings.reducedHeadroomAcknowledged,
        ),
      },
      audioOutput: {
        analysis: outputAnalysis,
      },
    },
  };

  await fs.writeFile(
    `${outputPath}.youtube.json`,
    JSON.stringify(sidecar, null, 2),
    "utf8",
  );
}

async function prepareBackground(file, jobWorkDir, size) {
  const originalName = file?.originalname || "";
  const ext = path.extname(originalName).toLowerCase();
  const mime = file?.mimetype || "";

  if (ext === ".svg" || mime.includes("svg")) {
    const svg = await safeSvgBuffer(file.path);
    const pngPath = path.join(jobWorkDir, `svg-${crypto.randomUUID()}.png`);
    await sharp(svg)
      .resize(size.width, size.height, { fit: "cover", position: "center" })
      .png()
      .toFile(pngPath);
    return { type: "image", path: pngPath };
  }

  if (
    mime.startsWith("video/") ||
    /\.(mp4|mov|webm|mkv|avi)$/i.test(originalName)
  ) {
    return { type: "video", path: file.path };
  }

  return { type: "image", path: file.path };
}

async function prepareMediaLayers(files, layerSettings, jobWorkDir, size) {
  const prepared = [];
  for (const [index, file] of files.slice(0, 3).entries()) {
    const media = await prepareBackground(file, jobWorkDir, size);
    const settings = layerSettings[index] ?? {};
    prepared.push({
      ...media,
      id: settings.id ?? `layer-${index + 1}`,
      opacity: settings.opacity ?? 100,
      scale: settings.scale ?? 100,
      x: settings.x ?? 50,
      y: settings.y ?? 50,
      rotation: settings.rotation ?? 0,
      blur: settings.blur ?? 0,
      maskOpacity: settings.maskOpacity ?? 0,
      coverFadeOut: settings.coverFadeOut,
      shadow: {
        opacity: settings.shadow?.opacity ?? settings.shadowOpacity ?? 0,
        blur: settings.shadow?.blur ?? settings.shadowBlur ?? 18,
        x: settings.shadow?.x ?? settings.shadowX ?? 0,
        y: settings.shadow?.y ?? settings.shadowY ?? 12,
      },
      visible: settings.visible ?? true,
      fit: settings.fit ?? "contain",
      blendMode: settings.blendMode ?? "normal",
      loop: settings.loop ?? true,
      order: index,
    });
  }
  return prepared;
}

function toCanvasLayer(layer) {
  return {
    ...layer,
    kind: layer.type === "video" ? "video" : "image",
    src: pathToFileURL(layer.path).href,
  };
}

async function prepareCover(file, jobWorkDir) {
  const coverPath = path.join(jobWorkDir, "cover.png");
  const input =
    path.extname(file.originalname || "").toLowerCase() === ".svg"
      ? await safeSvgBuffer(file.path)
      : file.path;
  await sharp(input)
    .resize(1200, 1200, { fit: "cover", position: "center" })
    .png()
    .toFile(coverPath);
  return { type: "image", path: coverPath };
}

async function prepareEmbeddedCover(audioPath, jobWorkDir) {
  try {
    const metadata = await parseFile(audioPath, { skipCovers: false });
    const picture = metadata.common.picture?.[0];
    if (!picture?.data) return null;
    const coverPath = path.join(jobWorkDir, "embedded-cover.png");
    await sharp(picture.data)
      .resize(1200, 1200, { fit: "cover", position: "center" })
      .png()
      .toFile(coverPath);
    return { type: "image", path: coverPath };
  } catch {
    return null;
  }
}

async function writeAssOverlay({
  filePath,
  lines,
  duration,
  width,
  height,
  position,
}) {
  const cleanLines = lines.filter((line) => line.length > 0);
  const chunks = [];

  for (let index = 0; index < cleanLines.length; index += 3) {
    chunks.push(cleanLines.slice(index, index + 3).join("\\N"));
  }

  const events = [
    `Dialogue: 0,${formatAssTime(0)},${formatAssTime(duration)},Default,,0,0,0,,${escapeAss(chunks[0] ?? "")}`,
  ];
  const fontSize = Math.round(width >= 1900 ? 54 : width >= 1200 ? 42 : 32);
  const alignment = assAlignment(position);
  const marginV = Math.round(height * 0.06);
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},&H00F7F3E8,&H000000FF,&HBA101513,&H7A101513,0,0,0,0,100,100,0,0,1,3,1,${alignment},80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;

  await fs.writeFile(filePath, ass, "utf8");
  return filePath;
}

function runFfmpeg(args, duration, onProgress) {
  const ffmpegPath = resolveFfmpegPath();

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      const match = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (match && onProgress) {
        const seconds =
          Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
        const progress = Math.max(
          5,
          Math.min(98, Math.round((seconds / duration) * 100)),
        );
        onProgress(progress, `Renderizando ${progress}%`);
      }
    });

    child.on("error", (error) =>
      reject(normalizeFfmpegSpawnError(error, ffmpegPath)),
    );
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(createFfmpegProcessError({ code, stderr }));
    });
  });
}

function assertPlayableOutput(outputPath) {
  const ffmpegPath = resolveFfmpegPath();
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      ["-v", "error", "-i", outputPath, "-f", "null", "-"],
      { windowsHide: true },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) =>
      reject(normalizeFfmpegSpawnError(error, ffmpegPath)),
    );
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        createFfmpegProcessError({
          code,
          kind: "output-validation",
          stderr,
        }),
      );
    });
  });
}

function presetSize(preset) {
  switch (preset) {
    case "youtube-720p":
      return { width: 1280, height: 720 };
    case "shorts-1080x1920":
      return { width: 1080, height: 1920 };
    case "youtube-1080p":
    default:
      return { width: 1920, height: 1080 };
  }
}

function formatAssTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.floor((safe % 1) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function assAlignment(position) {
  return position === "top" ? 8 : position === "center" ? 5 : 2;
}

function escapeAss(value) {
  return String(value ?? "")
    .replace(/[{}]/g, "")
    .replace(/\n/g, "\\N");
}
