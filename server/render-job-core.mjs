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
  normalizePublicationBookletTheme,
  normalizePublicationLyricsMode,
  publicationBookletThemeById,
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
    message: "Analisando áudio e preparando assets",
  });
  const outputSize = presetSize(settings.preset);
  const size = renderCanvasSize(outputSize, settings);
  const jobWorkDir = path.join(workDir, jobId);
  await fs.mkdir(jobWorkDir, { recursive: true });

  const [audio, sourceAnalysis, audioEnvelope, background, mediaLayers, cover] =
    await Promise.all([
      analyzeAudio(audioPath),
      analyzeAudioQuality(audioPath),
      sampleAudioEnvelope(audioPath),
      backgroundFile
        ? prepareBackground(backgroundFile, jobWorkDir, size)
        : Promise.resolve({ type: "generated", path: null }),
      prepareMediaLayers(
        mediaLayerFiles,
        settings.compositionSettings.mediaLayers,
        jobWorkDir,
        size,
      ),
      coverFile
        ? prepareCover(coverFile, jobWorkDir)
        : metadata.useEmbeddedCover
          ? prepareEmbeddedCover(audioPath, jobWorkDir)
          : Promise.resolve(null),
    ]);
  assertNotCanceled(shouldCancel);
  const duration = Math.max(
    1,
    audio.durationSeconds ?? Number(settings.durationFallback),
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
  lyricsPosition = "bottom",
  lyricsStyle = "minimal",
  bookletTheme = preset.bookletTheme,
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
    message: "Preparando áudio e assets",
  });
  const outputSize = { width: preset.width, height: preset.height };
  const size = renderCanvasSize(outputSize, settings);
  const jobWorkDir = path.join(workDir, jobId);
  await fs.mkdir(jobWorkDir, { recursive: true });

  const [audio, audioEnvelope, background, mediaLayers, cover] =
    await Promise.all([
      analyzeAudio(audioPath),
      sampleAudioEnvelope(audioPath),
      backgroundFile
        ? prepareBackground(backgroundFile, jobWorkDir, size)
        : Promise.resolve({ type: "generated", path: null }),
      prepareMediaLayers(
        mediaLayerFiles,
        settings.compositionSettings.mediaLayers,
        jobWorkDir,
        size,
      ),
      coverFile
        ? prepareCover(coverFile, jobWorkDir)
        : metadata.useEmbeddedCover
          ? prepareEmbeddedCover(audioPath, jobWorkDir)
          : Promise.resolve(null),
    ]);
  assertNotCanceled(shouldCancel);
  const normalizedBookletTheme = normalizePublicationBookletTheme(
    bookletTheme ?? preset.bookletTheme,
  );
  const duration =
    preset.kind === "clip"
      ? Math.min(
          clipDuration,
          Math.max(
            1,
            Number(audio.durationSeconds ?? clipDuration) - clipStart,
          ),
        )
      : preset.kind === "booklet"
        ? Math.max(0, Number(audio.durationSeconds ?? 0))
        : 1;
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

  assertNotCanceled(shouldCancel);
  stages.enter(
    preset.kind === "image"
      ? "poster-render"
      : preset.kind === "booklet"
        ? "booklet-render"
        : "webgl-render",
    {
      progress: 4,
      message:
        preset.kind === "booklet"
          ? "Preparando encarte digital"
          : "Renderizando divulgação",
    },
  );
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

  if (preset.kind === "booklet") {
    stages.enter("booklet-render", {
      progress: 90,
      message: "Gerando encarte digital",
    });
    await writeDigitalBookletHtml({
      outputPath,
      metadata,
      preset,
      coverPath: cover?.path ?? null,
      duration,
      lyricsMode,
      lyricsExcerpt,
      lyricsHideTags,
      lyricsLineSpacing,
      bookletTheme: normalizedBookletTheme,
    });
  } else if (preset.kind === "image") {
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
    // Burn the chosen lyrics onto the clip, honoring the position/style preset.
    // Before this, lyrics only reached the data manifest and never the video.
    const clipLyricsText = publicationLyricsTextForSettings(metadata.lyrics, {
      lyricsMode,
      lyricsExcerpt,
      lyricsHideTags,
      includeLyrics: includeFullLyrics,
    });
    const clipLyricLines = clipLyricsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const subtitlePath =
      clipLyricLines.length > 0
        ? await writeAssOverlay({
            filePath: path.join(jobWorkDir, "lyrics.ass"),
            lines: clipLyricLines,
            duration,
            width: outputSize.width,
            height: outputSize.height,
            position: lyricsPosition,
            style: lyricsStyle,
          })
        : null;
    const muxArgs = buildWebglMuxArgs({
      audioPath,
      audioStartSeconds: clipStart,
      duration,
      metadata,
      outputPath,
      outputSize,
      settings: publicationConstrainedMuxSettings(settings, preset, duration),
      subtitlePath,
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

  if (preset.kind !== "clip") {
    stages.enter("output-validation", {
      progress: 97,
      message: "Medindo asset final",
    });
  }
  const fileSizeValidation = await validatePublicationFileSize(
    outputPath,
    preset,
  );
  const warnings = publicationFileSizeWarnings(fileSizeValidation, preset);

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
      bookletTheme: normalizedBookletTheme,
      fileSizeValidation,
      warnings,
    });
  }
  stages.finish({
    status: "done",
    progress: 100,
    message: warnings.length
      ? "Asset concluído com alerta de tamanho"
      : "Asset de divulgação concluído",
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
    publicationValidation: {
      fileSize: fileSizeValidation,
    },
    warnings,
  });
}

function assertNotCanceled(shouldCancel) {
  if (typeof shouldCancel === "function" && shouldCancel()) {
    throw createCanceledJobError();
  }
}

function publicationConstrainedMuxSettings(settings, preset, duration) {
  const maxFileSizeBytes = Number(preset?.constraints?.maxFileSizeBytes);
  if (
    preset?.kind !== "clip" ||
    !Number.isFinite(maxFileSizeBytes) ||
    maxFileSizeBytes <= 0 ||
    !Number.isFinite(Number(duration)) ||
    Number(duration) <= 0
  ) {
    return settings;
  }
  // Reserve room for audio, container overhead, and faststart metadata. This is
  // intentionally conservative; exact file-size targeting would need multi-pass
  // encoding, which is too slow for the local queue.
  const totalKbps = (maxFileSizeBytes * 8) / Number(duration) / 1000;
  const videoBitrateKbps = Math.max(250, Math.floor(totalKbps * 0.86 - 192));
  return {
    ...settings,
    videoBitrateKbps,
  };
}

async function validatePublicationFileSize(outputPath, preset) {
  const stat = await fs.stat(outputPath);
  const actualBytes = stat.size;
  const maxBytes = Number(preset?.constraints?.maxFileSizeBytes);
  const hasLimit = Number.isFinite(maxBytes) && maxBytes > 0;
  const overBytes = hasLimit ? Math.max(0, actualBytes - maxBytes) : 0;
  return {
    status: hasLimit ? (overBytes > 0 ? "exceeded" : "ok") : "unbounded",
    actualBytes,
    actualLabel: formatPublicationBytes(actualBytes),
    maxBytes: hasLimit ? maxBytes : null,
    maxLabel: hasLimit ? formatPublicationBytes(maxBytes) : null,
    overBytes,
    overLabel: overBytes > 0 ? formatPublicationBytes(overBytes) : null,
  };
}

function publicationFileSizeWarnings(validation, preset) {
  if (validation.status !== "exceeded") return [];
  return [
    `Tamanho final acima do limite de ${preset.label}: ${validation.actualLabel} de ${validation.maxLabel} (+${validation.overLabel}).`,
  ];
}

function formatPublicationBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
  bookletTheme,
  fileSizeValidation,
  warnings = [],
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
  const normalizedBookletTheme = normalizePublicationBookletTheme(bookletTheme);
  const theme =
    preset.kind === "booklet"
      ? publicationBookletThemeById(normalizedBookletTheme)
      : null;
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
    theme,
    includeFullLyrics: normalizedLyricsMode === "full",
    validation: {
      fileSize: fileSizeValidation,
      warnings,
    },
    files: [
      {
        kind: preset.kind,
        path: `${preset.directory}/${outputName}`,
        url: `/outputs/${outputName}`,
        sizeBytes: fileSizeValidation.actualBytes,
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
  const fileSize = manifest.validation?.fileSize;
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
    fileSize ? `- Tamanho final: ${fileSize.actualLabel}` : "",
    fileSize?.maxBytes
      ? `- Limite de tamanho: ${fileSize.maxLabel} (${fileSize.status === "ok" ? "dentro" : "excedido"})`
      : "",
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
    ...(manifest.validation?.warnings ?? []).map(
      (warning) => `- Alerta: ${warning}`,
    ),
    manifest.theme ? `- Tema: ${manifest.theme.label}` : "",
    metadata.lyrics ? `\n## Letra\n\n${metadata.lyrics}` : "",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function writeDigitalBookletHtml({
  outputPath,
  metadata,
  preset,
  coverPath,
  duration,
  lyricsMode,
  lyricsExcerpt,
  lyricsHideTags,
  lyricsLineSpacing,
  bookletTheme,
}) {
  const theme = publicationBookletThemeById(bookletTheme);
  const includedLyrics = publicationLyricsTextForSettings(metadata.lyrics, {
    includeLyrics: lyricsMode !== "none",
    lyricsExcerpt,
    lyricsHideTags,
    lyricsLineSpacing,
    lyricsMode,
  });
  const coverDataUri = coverPath ? await fileDataUri(coverPath) : "";
  const tags = metadata.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const title = metadata.title || "Faixa sem título";
  const artist = metadata.artist || metadata.albumArtist || "";
  const album = metadata.album || title;
  const description = metadata.description || "";
  const html = `<!doctype html>
<html lang="${escapeHtml(metadata.language || "pt-BR")}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(album)} · Encarte digital</title>
  <style>
    :root {
      color-scheme: ${theme.id === "studio" ? "light" : "dark"};
      --booklet-bg: ${theme.background};
      --booklet-surface: ${theme.surface};
      --booklet-text: ${theme.text};
      --booklet-muted: ${theme.muted};
      --booklet-accent: ${theme.accent};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--booklet-bg);
      color: var(--booklet-text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.55;
    }
    main {
      width: min(960px, calc(100% - 32px));
      margin: 0 auto;
      padding: 40px 0 56px;
    }
    header {
      display: grid;
      grid-template-columns: minmax(220px, 360px) 1fr;
      gap: 32px;
      align-items: end;
      min-height: 56vh;
      border-bottom: 1px solid color-mix(in srgb, var(--booklet-text), transparent 78%);
      padding-bottom: 32px;
    }
    .cover {
      width: 100%;
      aspect-ratio: 1;
      background: var(--booklet-surface);
      border: 1px solid color-mix(in srgb, var(--booklet-text), transparent 82%);
      object-fit: cover;
    }
    .cover.empty {
      display: grid;
      place-items: center;
      color: var(--booklet-muted);
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: .14em;
    }
    h1 {
      margin: 0;
      font-size: clamp(42px, 8vw, 96px);
      line-height: .92;
      letter-spacing: 0;
    }
    .artist {
      color: var(--booklet-muted);
      font-size: clamp(18px, 2vw, 28px);
      margin: 18px 0 0;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      margin: 32px 0;
    }
    .meta div,
    section {
      background: var(--booklet-surface);
      border: 1px solid color-mix(in srgb, var(--booklet-text), transparent 84%);
      padding: 18px;
    }
    dt {
      color: var(--booklet-muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .1em;
    }
    dd {
      margin: 8px 0 0;
      font-weight: 700;
    }
    h2 {
      color: var(--booklet-accent);
      font-size: 13px;
      margin: 0 0 14px;
      text-transform: uppercase;
      letter-spacing: .12em;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }
    .tags span {
      border: 1px solid color-mix(in srgb, var(--booklet-accent), transparent 45%);
      color: var(--booklet-accent);
      padding: 4px 8px;
      font-size: 12px;
    }
    .lyrics {
      white-space: pre-wrap;
      line-height: ${clampPublicationLyricsLineSpacing(lyricsLineSpacing) / 100};
    }
    @media (max-width: 720px) {
      header,
      .meta {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      ${
        coverDataUri
          ? `<img class="cover" src="${coverDataUri}" alt="">`
          : `<div class="cover empty">Sem capa</div>`
      }
      <div>
        <h1>${escapeHtml(album)}</h1>
        <p class="artist">${escapeHtml(artist || "Artista")}</p>
      </div>
    </header>
    <dl class="meta">
      ${metadataBlock("Faixa", title)}
      ${metadataBlock("Ano", metadata.year || "-")}
      ${metadataBlock("Gênero", metadata.genre || "-")}
      ${metadataBlock("Duração", formatDuration(duration))}
    </dl>
    ${
      description
        ? `<section><h2>Notas</h2><p>${escapeHtml(description)}</p></section>`
        : ""
    }
    <section>
      <h2>Créditos</h2>
      <p>${escapeHtml(artist || metadata.albumArtist || "-")}</p>
      ${
        tags.length
          ? `<div class="tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`
          : ""
      }
    </section>
    ${
      includedLyrics
        ? `<section><h2>Letra</h2><div class="lyrics">${escapeHtml(includedLyrics)}</div></section>`
        : ""
    }
    <section>
      <h2>Arquivo</h2>
      <p>${escapeHtml(preset.label)} · ${escapeHtml(theme.label)}</p>
    </section>
  </main>
</body>
</html>`;
  await fs.writeFile(outputPath, html, "utf8");
}

function metadataBlock(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

async function fileDataUri(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mime =
    extension === ".png"
      ? "image/png"
      : extension === ".webp"
        ? "image/webp"
        : "image/jpeg";
  const data = await fs.readFile(filePath);
  return `data:${mime};base64,${data.toString("base64")}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "-";
  const minutes = Math.floor(value / 60);
  const rest = Math.round(value % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
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

// Style presets for the burned-in lyrics overlay. BorderStyle 1 = outline,
// BorderStyle 3 = opaque box behind the text.
const assStylePresets = {
  minimal: { borderStyle: 1, outline: 3, shadow: 1 },
  shadow: { borderStyle: 1, outline: 2, shadow: 4 },
  boxed: { borderStyle: 3, outline: 6, shadow: 0 },
};

async function writeAssOverlay({
  filePath,
  lines,
  duration,
  width,
  height,
  position,
  style = "minimal",
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
  const stylePreset = assStylePresets[style] ?? assStylePresets.minimal;
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},&H00F7F3E8,&H000000FF,&HBA101513,&H7A101513,0,0,0,0,100,100,0,0,${stylePreset.borderStyle},${stylePreset.outline},${stylePreset.shadow},${alignment},80,80,${marginV},1

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
