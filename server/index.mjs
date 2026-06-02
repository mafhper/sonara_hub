import crypto from "node:crypto";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import ffmpegPath from "ffmpeg-static";
import { parseFile } from "music-metadata";
import multer from "multer";
import sharp from "sharp";
import { renderWebglBackgroundVideo } from "./webgl-export.mjs";
import { sampleAudioEnvelope } from "./audio-envelope.mjs";
import {
  analyzeAudioQuality,
  buildTreatedAlbumDirectoryName,
  buildTreatedFileName,
  createAlbumFolderCover,
  createNumberedCover,
  inferAudioTags,
  processMp3Copy,
} from "./audio-library.mjs";
import { createPresetStore, PresetStoreError } from "./preset-store.mjs";
import { loadJobHistory, saveJobHistory } from "./job-store.mjs";
import { renderCanvasSize, renderTiming } from "./render-profile.mjs";
import { safeSvgBuffer } from "./svg-safety.mjs";
import {
  cleanupOwnedStorage,
  summarizeOwnedStorage,
} from "./storage-cleanup.mjs";
import { createTempFileRegistry } from "./temp-files.mjs";
import { buildWebglMuxArgs } from "./video-mux.mjs";
import { validateVideoAudioAnalysis } from "./video-quality.mjs";
import { normalizeVisualSettings } from "../shared/visual-effects.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const inputDir = path.join(rootDir, "input");
const uploadDir = path.join(rootDir, ".dev", "uploads");
const workDir = path.join(rootDir, ".dev", "work");
const artworkPreviewDir = path.join(rootDir, ".dev", "artwork-previews");
const outputDir = path.join(rootDir, "outputs");
const treatedOutputDir = path.join(outputDir, "audio");
const customPresetPath = path.join(
  rootDir,
  "data",
  "custom-presets.local.json",
);
const jobHistoryPath = path.join(rootDir, "data", "jobs.local.json");
const port = Number(process.env.PORT ?? 4175);

await Promise.all([
  fs.mkdir(uploadDir, { recursive: true }),
  fs.mkdir(workDir, { recursive: true }),
  fs.mkdir(artworkPreviewDir, { recursive: true }),
  fs.mkdir(outputDir, { recursive: true }),
  fs.mkdir(treatedOutputDir, { recursive: true }),
]);

const app = express();
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 250 * 1024 * 1024 },
});
const tempFiles = createTempFileRegistry(uploadDir);
const jobs = new Map(
  (await loadJobHistory(jobHistoryPath)).map((job) => [job.id, job]),
);
let jobHistoryWriteQueue = Promise.resolve();
if (jobs.size) {
  await saveJobHistory(jobHistoryPath, Array.from(jobs.values()));
}
let queuePaused = false;
const queueWaiters = new Set();
const presetStore = createPresetStore(customPresetPath);
let renderQueue = Promise.resolve();

app.use(express.json({ limit: "5mb" }));
app.use("/outputs", express.static(outputDir));

app.get("/api/visual-presets", async (_req, res) => {
  res.json({ presets: await presetStore.listAll() });
});

app.post("/api/visual-presets", async (req, res) => {
  try {
    res.status(201).json(await presetStore.create(req.body));
  } catch (error) {
    handlePresetStoreError(error, res);
  }
});

app.put("/api/visual-presets/:id", async (req, res) => {
  try {
    res.json(await presetStore.update(req.params.id, req.body));
  } catch (error) {
    handlePresetStoreError(error, res);
  }
});

app.delete("/api/visual-presets/:id", async (req, res) => {
  try {
    await presetStore.remove(req.params.id);
    res.status(204).end();
  } catch (error) {
    handlePresetStoreError(error, res);
  }
});

app.get("/api/audio/:fileName", async (req, res) => {
  const audioPath = await resolveInputAudio(req.params.fileName);
  if (!audioPath) {
    res.status(404).json({ error: "Áudio não encontrado." });
    return;
  }
  res.sendFile(audioPath);
});

app.post(
  "/api/audio/artwork-preview",
  upload.single("audio"),
  async (req, res) => {
    const audioPath =
      req.file?.path || (await resolveInputAudio(req.body.inputAudio));
    if (!audioPath) {
      res
        .status(400)
        .json({ error: "Envie ou selecione um arquivo de áudio." });
      return;
    }
    try {
      const metadata = await parseFile(audioPath, { skipCovers: false });
      const picture = metadata.common.picture?.[0];
      if (!picture?.data) {
        res.json({ artworkUrl: null });
        return;
      }
      const token = `${crypto.randomUUID()}.jpg`;
      await sharp(picture.data)
        .resize(512, 512, { fit: "cover", position: "center" })
        .jpeg({ quality: 88 })
        .toFile(path.join(artworkPreviewDir, token));
      res.json({
        artworkUrl: `/api/audio/artwork-preview/${encodeURIComponent(token)}`,
      });
    } finally {
      await tempFiles.cleanup(req.file);
    }
  },
);

app.get("/api/audio/artwork-preview/:token", async (req, res) => {
  const token = String(req.params.token ?? "");
  if (!/^[0-9a-f-]{36}\.jpg$/i.test(token)) {
    res.status(404).json({ error: "Prévia de arte não encontrada." });
    return;
  }
  const filePath = path.resolve(artworkPreviewDir, token);
  if (!filePath.startsWith(`${artworkPreviewDir}${path.sep}`)) {
    res.status(404).json({ error: "Prévia de arte não encontrada." });
    return;
  }
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error("not-file");
    res.type("image/jpeg").send(await fs.readFile(filePath));
  } catch {
    res.status(404).json({ error: "Prévia de arte não encontrada." });
  }
});

if (fssync.existsSync(path.join(rootDir, "dist"))) {
  app.use(express.static(path.join(rootDir, "dist")));
}

app.get("/api/project", async (_req, res) => {
  const audioPath = await findDefaultAudio();
  const lyricsPath = path.join(rootDir, "lyrics.txt");
  const lyricsText = await readTextIfExists(lyricsPath);
  const parsedLyrics = parseLyrics(lyricsText);
  const audio = audioPath ? await analyzeAudio(audioPath) : null;

  res.json({
    projectRoot: rootDir,
    defaultAudio: audioPath ? path.basename(audioPath) : null,
    inputAudios: await listInputAudios(),
    audio,
    lyrics: parsedLyrics,
    hasLicense: fssync.existsSync(path.join(rootDir, "Commercial_license.pdf")),
    defaultMetadata: buildDefaultMetadata(parsedLyrics, audio),
  });
});

app.post("/api/audio-metadata", upload.single("audio"), async (req, res) => {
  if (!req.file?.path) {
    res.status(400).json({ error: "Envie um arquivo de áudio." });
    return;
  }
  try {
    res.json(await readAudioMetadataSummary(req.file.path));
  } finally {
    await tempFiles.cleanup(req.file);
  }
});

app.post("/api/audio/analyze", upload.single("audio"), async (req, res) => {
  const audioPath =
    req.file?.path ??
    (await resolveInputAudio(req.body.inputAudio)) ??
    (await findDefaultAudio());
  if (!audioPath) {
    res.status(400).json({ error: "Envie um arquivo de áudio." });
    return;
  }
  try {
    const metadata = await readAudioMetadataSummary(audioPath);
    const suggestions = inferAudioTags(
      req.body.relativePath || req.file?.originalname || audioPath,
    );
    if (String(req.body.quick ?? "false") === "true") {
      res.json({ metadata, suggestions, analysis: null });
      return;
    }
    res.json({
      metadata,
      analysis: await analyzeAudioQuality(audioPath),
      suggestions,
    });
  } catch (error) {
    res.status(422).json({
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await tempFiles.cleanup(req.file);
  }
});

app.post(
  "/api/audio/process",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "cover", maxCount: 1 },
    { name: "albumCover", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files ?? {};
    const audioFile = Array.isArray(files.audio) ? files.audio[0] : null;
    const coverFile = Array.isArray(files.cover) ? files.cover[0] : null;
    const albumCoverFile = Array.isArray(files.albumCover)
      ? files.albumCover[0]
      : null;
    const audioPath =
      audioFile?.path ??
      (await resolveInputAudio(req.body.inputAudio)) ??
      (await findDefaultAudio());
    if (!audioPath) {
      await tempFiles.cleanup(files);
      res.status(400).json({ error: "Envie um arquivo MP3 para tratar." });
      return;
    }
    const draft = normalizeAudioDraft(req.body.draft, audioPath);
    const jobId = crypto.randomUUID();
    const outputName = buildTreatedFileName(draft);
    setJob(jobId, {
      id: jobId,
      kind: "audio-process",
      status: "queued",
      progress: 0,
      message: "Na fila de tratamento",
      outputUrl: null,
      sidecarUrl: null,
      thumbnailUrl: null,
      albumArtworkUrl: null,
      metadata: draft,
      createdAt: new Date().toISOString(),
    });
    enqueueAudioProcess({
      jobId,
      audioPath,
      audioName: audioFile?.originalname ?? audioPath,
      coverFile,
      albumCoverFile,
      coverSeries: String(req.body.coverSeries ?? "false") === "true",
      coverStyle: req.body.coverStyle === "arabic" ? "arabic" : "roman",
      coverSeriesSettings: parseJsonObject(req.body.coverSeriesSettings),
      draft,
      outputName,
      uploadedFiles: files,
    });
    res.json({ jobId });
  },
);

app.post(
  "/api/audio/process-batch",
  upload.fields([
    { name: "audioBatch", maxCount: 50 },
    { name: "cover", maxCount: 1 },
    { name: "albumCover", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files ?? {};
    const audioFiles = Array.isArray(files.audioBatch) ? files.audioBatch : [];
    const coverFile = Array.isArray(files.cover) ? files.cover[0] : null;
    const albumCoverFile = Array.isArray(files.albumCover)
      ? files.albumCover[0]
      : null;
    const drafts = parseJsonArray(req.body.drafts);
    if (!audioFiles.length) {
      await tempFiles.cleanup(files);
      res.status(400).json({ error: "Envie ao menos um MP3 para o lote." });
      return;
    }
    const jobIds = [];
    for (const [index, audioFile] of audioFiles.entries()) {
      const draft = normalizeAudioDraft(drafts[index], audioFile.originalname);
      const jobId = crypto.randomUUID();
      const outputName = buildTreatedFileName(draft);
      setJob(jobId, {
        id: jobId,
        kind: "audio-process",
        status: "queued",
        progress: 0,
        message: `Na fila de tratamento: ${audioFile.originalname}`,
        outputUrl: null,
        sidecarUrl: null,
        thumbnailUrl: null,
        albumArtworkUrl: null,
        metadata: draft,
        createdAt: new Date().toISOString(),
      });
      enqueueAudioProcess({
        jobId,
        audioPath: audioFile.path,
        audioName: audioFile.originalname,
        coverFile,
        albumCoverFile,
        coverSeries: String(req.body.coverSeries ?? "false") === "true",
        coverStyle: req.body.coverStyle === "arabic" ? "arabic" : "roman",
        coverSeriesSettings: parseJsonObject(req.body.coverSeriesSettings),
        draft,
        outputName,
        uploadedFiles: [audioFile, coverFile, albumCoverFile],
      });
      jobIds.push(jobId);
    }
    res.json({ jobIds });
  },
);

app.post(
  "/api/analyze",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "lyricsFile", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files ?? {};
    const audioFile = Array.isArray(files.audio) ? files.audio[0] : null;
    const lyricsFile = Array.isArray(files.lyricsFile)
      ? files.lyricsFile[0]
      : null;
    const audioPath =
      audioFile?.path ??
      (await resolveInputAudio(req.body.inputAudio)) ??
      (await findDefaultAudio());
    const lyricsText =
      (lyricsFile
        ? await fs.readFile(lyricsFile.path, "utf8")
        : String(req.body.lyrics ?? "")) ||
      (await readTextIfExists(path.join(rootDir, "lyrics.txt")));

    try {
      res.json({
        audio: audioPath ? await analyzeAudio(audioPath) : null,
        lyrics: parseLyrics(lyricsText),
      });
    } finally {
      await tempFiles.cleanup(files);
    }
  },
);

app.post(
  "/api/render",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "background", maxCount: 1 },
    { name: "mediaLayers", maxCount: 3 },
    { name: "cover", maxCount: 1 },
    { name: "lyricsFile", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files ?? {};
    const audioFile = Array.isArray(files.audio) ? files.audio[0] : null;
    const backgroundFile = Array.isArray(files.background)
      ? files.background[0]
      : null;
    const coverFile = Array.isArray(files.cover) ? files.cover[0] : null;
    const mediaLayerFiles = Array.isArray(files.mediaLayers)
      ? files.mediaLayers
      : [];
    const lyricsFile = Array.isArray(files.lyricsFile)
      ? files.lyricsFile[0]
      : null;
    const audioPath =
      audioFile?.path ??
      (await resolveInputAudio(req.body.inputAudio)) ??
      (await findDefaultAudio());

    if (!audioPath) {
      await tempFiles.cleanup(files);
      res.status(400).json({ error: "Nenhum áudio foi encontrado." });
      return;
    }

    const lyricsText =
      (lyricsFile
        ? await fs.readFile(lyricsFile.path, "utf8")
        : String(req.body.lyrics ?? "")) ||
      (await readTextIfExists(path.join(rootDir, "lyrics.txt")));
    const settings = normalizeSettings(req.body);
    const metadata = normalizeMetadata(req.body);
    const jobId = crypto.randomUUID();
    const outputName = buildOutputFileName(metadata);
    const outputPath = path.join(outputDir, outputName);

    setJob(jobId, {
      id: jobId,
      kind: "video-render",
      status: "queued",
      progress: 0,
      message: "Na fila de renderizacao",
      outputUrl: null,
      sidecarUrl: null,
      thumbnailUrl: null,
      metadata,
      createdAt: new Date().toISOString(),
    });

    enqueueRender({
      jobId,
      audioPath,
      backgroundFile,
      mediaLayerFiles,
      coverFile,
      lyricsText,
      settings,
      metadata,
      outputPath,
      outputName,
      uploadedFiles: files,
    });

    res.json({ jobId });
  },
);

app.post(
  "/api/render-batch",
  upload.fields([
    { name: "audioBatch", maxCount: 50 },
    { name: "background", maxCount: 1 },
    { name: "mediaLayers", maxCount: 3 },
    { name: "cover", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files ?? {};
    const uploadedAudioFiles = Array.isArray(files.audioBatch)
      ? files.audioBatch
      : [];
    const selectedInputFiles = await resolveInputAudioBatch(req.body);
    const audioFiles = [
      ...uploadedAudioFiles,
      ...selectedInputFiles.map((filePath) => ({
        path: filePath,
        originalname: path.basename(filePath),
      })),
    ];
    const backgroundFile = Array.isArray(files.background)
      ? files.background[0]
      : null;
    const coverFile = Array.isArray(files.cover) ? files.cover[0] : null;
    const mediaLayerFiles = Array.isArray(files.mediaLayers)
      ? files.mediaLayers
      : [];

    if (audioFiles.length === 0) {
      await tempFiles.cleanup(files);
      res.status(400).json({ error: "Nenhum áudio foi enviado para o lote." });
      return;
    }

    const settings = normalizeSettings(req.body);
    const commonMetadata = normalizeMetadata(req.body);
    const trackSettings = parseTrackSettings(req.body.trackSettings);
    const jobIds = [];

    for (const [index, audioFile] of audioFiles.entries()) {
      const audioInfo = await analyzeAudio(audioFile.path);
      const track = trackSettings[path.basename(audioFile.originalname)] ?? {};
      const title =
        track.title ||
        audioInfo.title ||
        titleFromFile(audioFile.originalname, commonMetadata.album, index + 1);
      const metadata = {
        ...commonMetadata,
        artist: track.artist || commonMetadata.artist || audioInfo.artist || "",
        album: track.album || commonMetadata.album || audioInfo.album || "",
        genre: track.genre || commonMetadata.genre || audioInfo.genre || "",
        version: track.version || "",
        outputFileName:
          track.outputFileName || commonMetadata.outputFileName || "",
        title:
          String(req.body.applyAlbumTitle ?? "false") === "true"
            ? `${commonMetadata.album} - ${title}`
            : title,
      };
      const jobId = crypto.randomUUID();
      const outputName = buildOutputFileName(metadata, index + 1);
      const outputPath = path.join(outputDir, outputName);

      setJob(jobId, {
        id: jobId,
        kind: "video-render",
        status: "queued",
        progress: 0,
        message: `Na fila do lote: ${audioFile.originalname}`,
        outputUrl: null,
        sidecarUrl: null,
        thumbnailUrl: null,
        metadata,
        createdAt: new Date().toISOString(),
      });
      jobIds.push(jobId);

      enqueueRender({
        jobId,
        audioPath: audioFile.path,
        backgroundFile,
        mediaLayerFiles,
        coverFile,
        lyricsText: "",
        settings,
        metadata,
        outputPath,
        outputName,
        uploadedFiles: [
          uploadedAudioFiles[index],
          backgroundFile,
          coverFile,
          mediaLayerFiles,
        ],
      });
    }

    res.json({ jobIds });
  },
);

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job não encontrado." });
    return;
  }
  res.json(job);
});

app.get("/api/jobs", (_req, res) => {
  res.json({
    jobs: recentJobs(),
    queuePaused,
  });
});

app.delete("/api/jobs", async (req, res) => {
  const scope = String(req.query.scope ?? "terminal");
  if (!["terminal", "video-render"].includes(scope)) {
    res.status(400).json({ error: "Escopo de histórico inválido." });
    return;
  }
  let removed = 0;
  for (const [jobId, job] of jobs) {
    if (isActiveJob(job)) continue;
    if (scope === "video-render" && job.kind !== "video-render") continue;
    jobs.delete(jobId);
    removed += 1;
  }
  await persistJobSnapshot();
  res.json({ jobs: recentJobs(), queuePaused, removed });
});

app.get("/api/storage/usage", async (_req, res) => {
  res.json(await storageUsage());
});

app.post("/api/storage/cleanup", async (req, res) => {
  const scope = String(req.body?.scope ?? "");
  if (!["temporary", "generated", "all"].includes(scope)) {
    res.status(400).json({ error: "Escopo de limpeza inválido." });
    return;
  }
  if (Array.from(jobs.values()).some(isActiveJob)) {
    res.status(409).json({
      error: "Aguarde ou cancele os processamentos ativos antes de limpar.",
    });
    return;
  }
  const deleted = await cleanupOwnedStorage({
    scope,
    uploadDir,
    workDir,
    artworkPreviewDir,
    outputDir,
    treatedOutputDir,
  });
  res.json({ scope, deleted, usage: await storageUsage() });
});

app.post("/api/jobs/pause", (_req, res) => {
  queuePaused = true;
  for (const job of jobs.values()) {
    if (job.status === "queued") {
      updateJob(job.id, {
        status: "paused",
        message: "Fila pausada antes de iniciar",
      });
    }
  }
  res.json({ queuePaused });
});

app.post("/api/jobs/resume", (_req, res) => {
  queuePaused = false;
  for (const job of jobs.values()) {
    if (job.status === "paused") {
      updateJob(job.id, {
        status: "queued",
        message: "Na fila",
      });
    }
  }
  for (const resume of queueWaiters) resume();
  queueWaiters.clear();
  res.json({ queuePaused });
});

app.post("/api/jobs/cancel-all", (_req, res) => {
  for (const job of jobs.values()) requestJobCancel(job.id);
  res.json({ jobs: recentJobs() });
});

app.post("/api/jobs/:id/cancel", (req, res) => {
  const job = requestJobCancel(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job não encontrado." });
    return;
  }
  res.json(job);
});

app.use((req, res, next) => {
  const distIndex = path.join(rootDir, "dist", "index.html");
  if (!fssync.existsSync(distIndex)) {
    next();
    return;
  }
  res.sendFile(distIndex);
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Sonara Hub API em http://127.0.0.1:${port}`);
});

function enqueueRender(options) {
  const releaseTempFiles = tempFiles.retain(options.uploadedFiles);
  renderQueue = renderQueue
    .then(() => runQueuedJob(options.jobId, () => renderVideo(options)))
    .catch((error) => {
      if (isCanceledError(error)) return;
      updateJob(options.jobId, {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        errorCode: error?.code ? String(error.code) : "VIDEO_RENDER_ERROR",
        errorDetail:
          error?.detail ??
          (error instanceof Error
            ? error.stack || error.message
            : String(error)),
      });
    })
    .finally(async () => {
      await releaseTempFiles();
      await fs.rm(path.join(workDir, options.jobId), {
        recursive: true,
        force: true,
      });
    });
}

function enqueueAudioProcess(options) {
  const releaseTempFiles = tempFiles.retain(options.uploadedFiles);
  renderQueue = renderQueue
    .then(() => runQueuedJob(options.jobId, () => processAudio(options)))
    .catch((error) => {
      if (isCanceledError(error)) return;
      updateJob(options.jobId, {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        errorCode: error?.code ? String(error.code) : "AUDIO_PROCESS_ERROR",
        errorDetail:
          error?.detail ??
          (error instanceof Error
            ? error.stack || error.message
            : String(error)),
      });
    })
    .finally(async () => {
      await releaseTempFiles();
      await fs.rm(path.join(workDir, options.jobId), {
        recursive: true,
        force: true,
      });
    });
}

async function runQueuedJob(jobId, worker) {
  await waitForQueue(jobId);
  assertJobNotCanceled(jobId);
  await worker();
}

async function waitForQueue(jobId) {
  while (queuePaused) {
    const job = jobs.get(jobId);
    if (!job || job.status === "canceled" || job.cancelRequested) {
      throw canceledError();
    }
    if (job.status === "queued") {
      updateJob(jobId, {
        status: "paused",
        message: "Fila pausada antes de iniciar",
      });
    }
    await new Promise((resolve) => queueWaiters.add(resolve));
  }
  const job = jobs.get(jobId);
  if (job?.status === "paused") {
    updateJob(jobId, { status: "queued", message: "Na fila" });
  }
}

function requestJobCancel(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  if (["done", "error", "canceled"].includes(job.status)) return job;
  const next =
    job.status === "running"
      ? {
          ...job,
          cancelRequested: true,
          message: "Cancelamento solicitado",
        }
      : {
          ...job,
          status: "canceled",
          progress: 0,
          cancelRequested: true,
          message: "Cancelado",
        };
  setJob(jobId, { ...next, updatedAt: new Date().toISOString() });
  for (const resume of queueWaiters) resume();
  queueWaiters.clear();
  return jobs.get(jobId);
}

function assertJobNotCanceled(jobId) {
  const job = jobs.get(jobId);
  if (!job || job.status === "canceled" || job.cancelRequested) {
    if (job && job.status !== "canceled") {
      updateJob(jobId, {
        status: "canceled",
        progress: job.progress ?? 0,
        message: "Cancelado",
      });
    }
    throw canceledError();
  }
}

function canceledError() {
  const error = new Error("Job cancelado");
  error.code = "JOB_CANCELED";
  return error;
}

function isCanceledError(error) {
  return error?.code === "JOB_CANCELED";
}

async function processAudio({
  jobId,
  audioPath,
  audioName,
  coverFile,
  albumCoverFile,
  coverSeries,
  coverStyle,
  coverSeriesSettings,
  draft,
  outputName,
}) {
  assertJobNotCanceled(jobId);
  updateJob(jobId, {
    status: "running",
    progress: 12,
    message: "Preparando pacote MP3",
  });
  const jobWorkDir = path.join(workDir, jobId);
  await fs.mkdir(jobWorkDir, { recursive: true });
  const albumCoverPath = albumCoverFile?.path ?? coverFile?.path ?? null;
  let coverPath = coverFile?.path ?? null;
  if (coverPath && coverSeries) {
    const seriesSettings = normalizeCoverSeriesSettings(
      coverSeriesSettings,
      coverStyle,
    );
    coverPath = await createNumberedCover(
      coverPath,
      path.join(
        jobWorkDir,
        `${String(draft.trackNumber).padStart(2, "0")}.jpg`,
      ),
      {
        index: draft.trackNumber,
        style: seriesSettings.style,
        label: coverSeriesLabel(draft, seriesSettings),
        sublines: coverSeriesSublines(draft, seriesSettings),
        fontSize: seriesSettings.fontSize,
        color: seriesSettings.color,
        opacity: seriesSettings.opacity,
        x: seriesSettings.x,
        y: seriesSettings.y,
        letterSpacing: seriesSettings.letterSpacing,
        metaFontSize: seriesSettings.metaFontSize,
        metaGap: seriesSettings.metaGap,
      },
    );
  }
  assertJobNotCanceled(jobId);
  updateJob(jobId, { progress: 42, message: "Gravando metadados limpos" });
  const albumDirectoryName = buildTreatedAlbumDirectoryName(draft);
  const albumOutputDir = path.join(treatedOutputDir, albumDirectoryName);
  await fs.mkdir(albumOutputDir, { recursive: true });
  const outputPath = path.join(albumOutputDir, outputName);
  const result = await processMp3Copy({
    inputPath: audioPath,
    inputName: audioName,
    outputPath,
    draft,
    coverPath,
    normalizationEnabled: draft.normalizationEnabled,
  });
  assertJobNotCanceled(jobId);
  let thumbnailUrl = null;
  if (coverPath) {
    const thumbnailName = `${path.basename(outputName, ".mp3")}.cover.jpg`;
    await fs.copyFile(coverPath, path.join(albumOutputDir, thumbnailName));
    thumbnailUrl = outputUrl("audio", albumDirectoryName, thumbnailName);
  }
  let albumArtworkUrl = null;
  if (albumCoverPath) {
    const albumArtworkName = "folder.jpg";
    await createAlbumFolderCover(
      albumCoverPath,
      path.join(albumOutputDir, albumArtworkName),
    );
    albumArtworkUrl = outputUrl("audio", albumDirectoryName, albumArtworkName);
  }
  updateJob(jobId, {
    status: "done",
    progress: 100,
    message: "Copia tratada validada",
    outputUrl: outputUrl("audio", albumDirectoryName, outputName),
    thumbnailUrl,
    albumArtworkUrl,
    analysis: result.analysis,
  });
}

async function renderVideo({
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
}) {
  assertJobNotCanceled(jobId);
  updateJob(jobId, {
    status: "running",
    progress: 1,
    message: "Analisando áudio",
  });
  const audio = await analyzeAudio(audioPath);
  const sourceAnalysis = await analyzeAudioQuality(audioPath);
  assertJobNotCanceled(jobId);
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
    ? await prepareCover(coverFile, jobWorkDir, size)
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

  assertJobNotCanceled(jobId);
  updateJob(jobId, { progress: 4, message: "Preparando cena" });
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
      metadata,
      showMetadata: settings.showMetadata,
      textSettings: settings.compositionSettings.textSettings,
    },
    onProgress: (progress, message) => updateJob(jobId, { progress, message }),
  });
  assertJobNotCanceled(jobId);
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
  assertJobNotCanceled(jobId);
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
  updateJob(jobId, {
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

async function findDefaultAudio() {
  const roots = [rootDir, path.join(rootDir, "input")];
  for (const currentRoot of roots) {
    try {
      const entries = await fs.readdir(currentRoot);
      const audio = entries
        .filter((entry) => /\.(mp3|wav|m4a|flac|aac)$/i.test(entry))
        .sort((a, b) => a.localeCompare(b, "pt-BR"))[0];
      if (audio) {
        return path.join(currentRoot, audio);
      }
    } catch {
      // Optional input folder.
    }
  }
  return null;
}

async function listInputAudios() {
  try {
    await fs.mkdir(inputDir, { recursive: true });
    const entries = await fs.readdir(inputDir);
    const audios = [];

    for (const entry of entries
      .filter((fileName) => /\.(mp3|wav|m4a|flac|aac)$/i.test(fileName))
      .sort((a, b) => a.localeCompare(b, "pt-BR"))) {
      const filePath = path.join(inputDir, entry);
      const stat = await fs.stat(filePath);
      const metadata = await readAudioMetadataSummary(filePath);
      audios.push({
        name: entry,
        sizeBytes: stat.size,
        metadata,
      });
    }

    return audios;
  } catch {
    return [];
  }
}

async function resolveInputAudio(fileName) {
  const requested = Array.isArray(fileName) ? fileName[0] : fileName;
  if (!requested) {
    return null;
  }

  const safeName = path.basename(String(requested));
  const filePath = path.resolve(inputDir, safeName);
  if (!filePath.startsWith(inputDir)) {
    return null;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isFile() && /\.(mp3|wav|m4a|flac|aac)$/i.test(filePath)) {
      return filePath;
    }
  } catch {
    return null;
  }

  return null;
}

async function resolveInputAudioBatch(body) {
  if (String(body.useAllInput ?? "false") === "true") {
    return (await listInputAudios()).map((audio) =>
      path.join(inputDir, audio.name),
    );
  }

  const raw = body.inputBatch;
  const names = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const resolved = await Promise.all(
    names.map((name) => resolveInputAudio(name)),
  );
  return resolved.filter(Boolean);
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

async function readAudioMetadataSummary(filePath) {
  try {
    const metadata = await parseFile(filePath, {
      duration: true,
      skipCovers: false,
    });
    const common = metadata.common;
    return {
      title: common.title ?? "",
      artist: common.artist ?? "",
      album: common.album ?? "",
      albumArtist: common.albumartist ?? "",
      genre: common.genre?.join(", ") ?? "",
      comment: common.comment?.map((item) => item.text).join("\n") ?? "",
      year: common.year ?? "",
      date: common.date ?? "",
      track: common.track?.no ?? "",
      disk: common.disk?.no ?? "",
      composer: common.composer?.join(", ") ?? "",
      hasEmbeddedCover: Boolean(common.picture?.length),
      durationSeconds: metadata.format.duration ?? null,
      bitrate: metadata.format.bitrate ?? null,
      codec: metadata.format.codec ?? metadata.format.container ?? "",
    };
  } catch {
    return {
      title: "",
      artist: "",
      album: "",
      albumArtist: "",
      genre: "",
      comment: "",
      year: "",
      date: "",
      track: "",
      disk: "",
      composer: "",
      hasEmbeddedCover: false,
      durationSeconds: null,
      bitrate: null,
      codec: "",
    };
  }
}

function parseLyrics(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const lines = normalized
    ? normalized
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  const title = lines[0] ?? "";
  const genre = lines[1] ?? "";
  const summary = lines[2] ?? "";
  const lyricLines = lines.slice(3);
  const chorusLine =
    lyricLines.find((line) =>
      line.toLocaleLowerCase("pt-BR").startsWith("ô,"),
    ) ??
    lyricLines[0] ??
    "";

  return {
    title,
    genre,
    summary,
    text: normalized,
    lyricLines,
    lineCount: lyricLines.length,
    estimatedVerses: Math.max(1, Math.round(lyricLines.length / 4)),
    chorusLine,
  };
}

function buildDefaultMetadata(lyrics, audio) {
  const title = lyrics.title || audio?.title || "Nova faixa";
  const genre = lyrics.genre || audio?.genre || "";
  const description = [
    `${title} - ${lyrics.summary || genre}`,
    "",
    "Música criada com inteligência artificial e visual ambientado gerado localmente pelo Sonara Hub.",
    "",
    "Letra:",
    lyrics.lyricLines.slice(0, 16).join("\n"),
  ].join("\n");

  return {
    title,
    version: "",
    artist: audio?.artist || "",
    genre,
    description,
    tags: [title, genre, "AI music"].filter(Boolean),
    visibility: "unlisted",
    category: "Music",
    categoryId: "10",
    album: audio?.album || "",
    language: "pt-BR",
    recordingDate: "",
    copyright: "",
    outputFileName: "",
    useEmbeddedCover: Boolean(audio?.hasEmbeddedCover),
    containsSyntheticMedia: true,
    madeForKids: false,
  };
}

function normalizeSettings(body) {
  const visualSettings = normalizeVisualSettings(body);
  const compositionSettings = normalizeCompositionSettings(body);
  const qualityProfile = ["auto", "fast", "final"].includes(body.qualityProfile)
    ? body.qualityProfile
    : "auto";
  const renderMode = body.renderMode === "batch" ? "batch" : "single";
  const timing = renderTiming({ qualityProfile, renderMode });
  return {
    preset: String(body.preset ?? "youtube-1080p"),
    effect: visualSettings.rendererId,
    visualSettings,
    compositionSettings,
    includeLyrics: String(body.includeLyrics ?? "false") === "true",
    showMetadata: String(body.showMetadata ?? "true") === "true",
    waveform: visualSettings.waveform.visible,
    reducedHeadroomAcknowledged:
      String(body.reducedHeadroomAcknowledged ?? "false") === "true",
    audioOnlyVisual: String(body.audioOnlyVisual ?? "false") === "true",
    webglFps: clampNumber(Number(body.webglFps ?? timing.webglFps), 12, 30),
    outputFps: timing.outputFps,
    encoderPreset: timing.encoderPreset,
    textPosition: "top-left",
    intensity: visualSettings.common.intensity,
    speed: visualSettings.common.speed,
    brightness: visualSettings.common.brightness,
    direction: visualSettings.common.direction,
    colorA: visualSettings.colors.base,
    colorB: visualSettings.colors.effect,
    accentColor: visualSettings.colors.light,
    qualityProfile,
    renderMode,
    durationFallback: Number(body.durationFallback ?? 180),
    crf: Number(
      body.crf ??
        (qualityProfile === "fast" ? 26 : qualityProfile === "final" ? 18 : 22),
    ),
  };
}

function normalizeCompositionSettings(body) {
  const raw = parseJsonObject(body.compositionSettings);
  const mediaLayers = Array.isArray(raw.mediaLayers)
    ? raw.mediaLayers.slice(0, 3).map((layer, index) => ({
        id: String(layer.id ?? `layer-${index + 1}`),
        kind: ["image", "svg", "video"].includes(layer.kind)
          ? layer.kind
          : "image",
        opacity: clampNumber(Number(layer.opacity ?? 100), 0, 100),
        scale: clampNumber(Number(layer.scale ?? 100), 10, 220),
        x: clampNumber(Number(layer.x ?? 50), 0, 100),
        y: clampNumber(Number(layer.y ?? 50), 0, 100),
        rotation: clampNumber(Number(layer.rotation ?? 0), -180, 180),
        blur: clampNumber(Number(layer.blur ?? 0), 0, 48),
        maskOpacity: clampNumber(Number(layer.maskOpacity ?? 0), 0, 90),
        shadow: {
          opacity: clampNumber(
            Number(layer.shadow?.opacity ?? layer.shadowOpacity ?? 0),
            0,
            100,
          ),
          blur: clampNumber(
            Number(layer.shadow?.blur ?? layer.shadowBlur ?? 18),
            0,
            80,
          ),
          x: clampNumber(
            Number(layer.shadow?.x ?? layer.shadowX ?? 0),
            -80,
            80,
          ),
          y: clampNumber(
            Number(layer.shadow?.y ?? layer.shadowY ?? 12),
            -80,
            80,
          ),
        },
        visible: String(layer.visible ?? "true") !== "false",
        fit: layer.fit === "contain" ? "contain" : "cover",
        blendMode: ["normal", "screen", "multiply", "overlay"].includes(
          layer.blendMode,
        )
          ? layer.blendMode
          : "normal",
        loop: String(layer.loop ?? "true") !== "false",
        order: index,
      }))
    : [];
  return {
    mediaLayers,
    textSettings: normalizeTextSettings(raw.textSettings),
  };
}

function normalizeTextSettings(value = {}) {
  const fields = value.fields ?? {};
  return {
    fields: {
      title: fields.title !== false,
      artist: fields.artist !== false,
      album: fields.album === true,
      year: fields.year === true,
      version: fields.version === true,
    },
    preset: ["top-left", "bottom-center", "cover-left"].includes(value.preset)
      ? value.preset
      : "top-left",
    fontFamily: ["Inter", "Georgia", "Arial"].includes(value.fontFamily)
      ? value.fontFamily
      : "Inter",
    fontSize: clampNumber(Number(value.fontSize ?? 42), 18, 96),
    fontWeight: clampNumber(Number(value.fontWeight ?? 650), 300, 850),
    letterSpacing: clampNumber(Number(value.letterSpacing ?? 0), 0, 16),
    lineHeight: clampNumber(Number(value.lineHeight ?? 118), 90, 180),
    color: isHexColor(value.color) ? value.color : "#f7f8fb",
    opacity: clampNumber(Number(value.opacity ?? 94), 20, 100),
    x: clampNumber(Number(value.x ?? 5), 0, 100),
    y: clampNumber(Number(value.y ?? 7), 0, 100),
    align: ["left", "center", "right"].includes(value.align)
      ? value.align
      : "left",
    shadow: clampNumber(Number(value.shadow ?? 48), 0, 100),
  };
}

function normalizeCoverSeriesSettings(value = {}, fallbackStyle = "roman") {
  const metaFontSize = clampNumber(Number(value.metaFontSize ?? 34), 18, 72);
  const metaStyles = {
    title: normalizeCoverSeriesMetaStyle(value.metaStyles?.title, {
      fontSize: Math.max(38, metaFontSize),
      color: value.color,
      opacity: 88,
    }),
    album: normalizeCoverSeriesMetaStyle(value.metaStyles?.album, {
      fontSize: metaFontSize,
      color: value.color,
      opacity: 76,
    }),
    artist: normalizeCoverSeriesMetaStyle(value.metaStyles?.artist, {
      fontSize: Math.max(18, metaFontSize - 2),
      color: value.color,
      opacity: 72,
    }),
    year: normalizeCoverSeriesMetaStyle(value.metaStyles?.year, {
      fontSize: Math.max(18, metaFontSize - 6),
      color: value.color,
      opacity: 68,
    }),
  };
  return {
    enabled: value.enabled !== false,
    style: ["roman", "arabic", "custom"].includes(value.style)
      ? value.style
      : fallbackStyle === "arabic"
        ? "arabic"
        : "roman",
    sequence: String(value.sequence ?? "I, II, III, IV, V").slice(0, 300),
    fontSize: clampNumber(Number(value.fontSize ?? 112), 38, 240),
    color: isHexColor(value.color) ? value.color : "#fffaf1",
    opacity: clampNumber(Number(value.opacity ?? 92), 20, 100),
    x: clampNumber(Number(value.x ?? 50), 8, 92),
    y: clampNumber(Number(value.y ?? 89), 8, 94),
    letterSpacing: clampNumber(Number(value.letterSpacing ?? 18), 0, 80),
    includeTitle: value.includeTitle === true,
    includeAlbum: value.includeAlbum === true,
    includeArtist: value.includeArtist === true,
    includeYear: value.includeYear === true,
    metaOrder: normalizeCoverSeriesMetaOrder(value.metaOrder),
    metaFontSize,
    metaGap: clampNumber(Number(value.metaGap ?? 10), 0, 48),
    metaStyles,
  };
}

function normalizeCoverSeriesMetaStyle(value = {}, fallback = {}) {
  return {
    fontSize: clampNumber(
      Number(value.fontSize ?? fallback.fontSize ?? 34),
      18,
      72,
    ),
    color: isHexColor(value.color)
      ? value.color
      : isHexColor(fallback.color)
        ? fallback.color
        : "#fffaf1",
    opacity: clampNumber(
      Number(value.opacity ?? fallback.opacity ?? 76),
      20,
      100,
    ),
    offsetX: clampNumber(Number(value.offsetX ?? 0), -320, 320),
    offsetY: clampNumber(Number(value.offsetY ?? 0), -320, 320),
  };
}

function normalizeCoverSeriesMetaOrder(value) {
  const allowed = new Set(["title", "album", "artist", "year"]);
  const entries = String(value ?? "title, album, artist, year")
    .split(/[\n,;|]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => allowed.has(entry));
  return [...new Set([...entries, "title", "album", "artist", "year"])];
}

function coverSeriesLabel(draft, settings) {
  if (settings.style !== "custom") return "";
  const entries = settings.sequence
    .split(/[\n,;|]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return (
    entries[Math.max(0, Number(draft.trackNumber || 1) - 1)] ?? entries[0] ?? ""
  );
}

function coverSeriesSublines(draft, settings) {
  const values = {
    title: settings.includeTitle && draft.title,
    album: settings.includeAlbum && draft.album,
    artist: settings.includeArtist && (draft.albumArtist || draft.artist),
    year: settings.includeYear && draft.year,
  };
  return settings.metaOrder
    .filter((role) => values[role])
    .map((role) => ({
      role,
      text: values[role],
      ...settings.metaStyles[role],
    }));
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? ""));
}

function normalizeMetadata(body) {
  return {
    title: String(body.title ?? "Nova faixa"),
    version: String(body.version ?? ""),
    artist: String(body.artist ?? ""),
    genre: String(body.genre ?? ""),
    album: String(body.album ?? ""),
    albumArtist: String(body.albumArtist ?? ""),
    composer: String(body.composer ?? ""),
    year: String(body.year ?? ""),
    trackNumber: clampNumber(Number(body.trackNumber || 1), 1, 999),
    trackTotal: clampNumber(Number(body.trackTotal || 1), 1, 999),
    diskNumber: clampNumber(Number(body.diskNumber || 1), 1, 99),
    diskTotal: clampNumber(Number(body.diskTotal || 1), 1, 99),
    lyrics: String(body.lyrics ?? ""),
    lyricsLanguage: /^[a-z]{3}$/i.test(String(body.lyricsLanguage ?? ""))
      ? String(body.lyricsLanguage)
      : "und",
    normalizationEnabled:
      String(body.normalizationEnabled ?? "false") === "true",
    description: String(body.description ?? ""),
    comment: String(body.comment ?? ""),
    tags: String(body.tags ?? ""),
    visibility: String(body.visibility ?? "unlisted"),
    category: String(body.category ?? "Music"),
    categoryId: String(body.categoryId ?? "10"),
    language: String(body.language ?? "pt-BR"),
    recordingDate: String(body.recordingDate ?? ""),
    copyright: String(body.copyright ?? ""),
    outputFileName: String(body.outputFileName ?? ""),
    useEmbeddedCover: String(body.useEmbeddedCover ?? "false") === "true",
    containsSyntheticMedia:
      String(body.containsSyntheticMedia ?? "true") === "true",
    madeForKids: String(body.madeForKids ?? "false") === "true",
  };
}

function parseTrackSettings(value) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function parseJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeAudioDraft(value, audioPath) {
  const raw =
    typeof value === "string" ? parseJsonObject(value) : (value ?? {});
  const suggestions = inferAudioTags(audioPath);
  return {
    title: String(raw.title || suggestions.title || "Nova faixa").trim(),
    artist: String(raw.artist || suggestions.artist || "").trim(),
    album: String(raw.album || suggestions.album || "").trim(),
    albumArtist: String(
      raw.albumArtist || raw.artist || suggestions.albumArtist || "",
    ).trim(),
    genre: String(raw.genre ?? "").trim(),
    composer: String(raw.composer ?? "").trim(),
    comment: String(raw.comment ?? "").trim(),
    copyright: String(raw.copyright ?? "").trim(),
    year: String(raw.year ?? "").trim(),
    trackNumber: clampNumber(
      Number(raw.trackNumber || suggestions.trackNumber || 1),
      1,
      999,
    ),
    trackTotal: clampNumber(Number(raw.trackTotal || 1), 1, 999),
    diskNumber: clampNumber(Number(raw.diskNumber || 1), 1, 99),
    diskTotal: clampNumber(Number(raw.diskTotal || 1), 1, 99),
    lyrics: String(raw.lyrics ?? ""),
    lyricsLanguage: /^[a-z]{3}$/i.test(String(raw.lyricsLanguage ?? ""))
      ? String(raw.lyricsLanguage)
      : "und",
    normalizationEnabled:
      String(raw.normalizationEnabled ?? "false") === "true",
    cleanPackage: true,
  };
}

function buildOutputFileName(metadata, index = null) {
  const base =
    metadata.outputFileName ||
    [metadata.artist, metadata.title, metadata.version]
      .filter(Boolean)
      .join(" - ");
  const suffix = index ? `-${String(index).padStart(2, "0")}` : "";
  return `${slugify(base || "sonara-hub-video")}${suffix}.mp4`;
}

function titleFromFile(fileName, album, index) {
  const base = path.basename(fileName, path.extname(fileName));
  return base || `${album || "Faixa"} ${index}`;
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(value, fallback) {
  const color = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
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
  const originalName = file.originalname || "";
  const ext = path.extname(originalName).toLowerCase();
  const mime = file.mimetype || "";

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
    if (!picture?.data) {
      return null;
    }
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
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static não forneceu um binário de ffmpeg.");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      const match = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (match) {
        const seconds =
          Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
        const progress = Math.max(
          5,
          Math.min(98, Math.round((seconds / duration) * 100)),
        );
        onProgress(progress, `Renderizando ${progress}%`);
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`ffmpeg terminou com codigo ${code}: ${stderr.slice(-2000)}`),
      );
    });
  });
}

function assertPlayableOutput(outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      ["-v", "error", "-i", outputPath, "-f", "null", "-"],
      { windowsHide: true },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`MP4 final invalido ou sem streams: ${stderr.slice(-2000)}`),
      );
    });
  });
}

function presetSize(preset) {
  switch (preset) {
    case "youtube-720p":
      return { width: 1280, height: 720 };
    case "youtube-2k":
      return { width: 2560, height: 1440 };
    case "youtube-4k":
      return { width: 3840, height: 2160 };
    case "shorts-1080x1920":
      return { width: 1080, height: 1920 };
    case "youtube-1080p":
    default:
      return { width: 1920, height: 1080 };
  }
}

function updateJob(jobId, patch) {
  const current = jobs.get(jobId);
  if (!current) {
    return;
  }
  setJob(jobId, {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

function setJob(jobId, job) {
  jobs.set(jobId, job);
  void persistJobSnapshot();
}

function persistJobSnapshot() {
  const snapshot = Array.from(jobs.values());
  jobHistoryWriteQueue = jobHistoryWriteQueue
    .then(() => saveJobHistory(jobHistoryPath, snapshot))
    .catch((error) => {
      console.error("Falha ao persistir historico de jobs:", error);
    });
  return jobHistoryWriteQueue;
}

function recentJobs() {
  return Array.from(jobs.values()).slice(-50).reverse();
}

function outputUrl(...segments) {
  return `/outputs/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function isActiveJob(job) {
  return ["queued", "paused", "running"].includes(job.status);
}

async function storageUsage() {
  return {
    ...(await summarizeOwnedStorage({
      uploadDir,
      workDir,
      artworkPreviewDir,
      outputDir,
    })),
    jobs: {
      active: Array.from(jobs.values()).filter(isActiveJob).length,
      terminal: Array.from(jobs.values()).filter((job) => !isActiveJob(job))
        .length,
    },
  };
}

function handlePresetStoreError(error, res) {
  if (error instanceof PresetStoreError) {
    res.status(404).json({ error: error.message, code: error.code });
    return;
  }
  res.status(500).json({
    error: error instanceof Error ? error.message : String(error),
  });
}

function formatAssTime(seconds) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
}

function assAlignment(position) {
  switch (position) {
    case "top":
      return 8;
    case "left":
      return 4;
    case "right":
      return 6;
    case "center":
      return 5;
    case "bottom":
    default:
      return 2;
  }
}

function escapeAss(value) {
  return value.replace(/[{}]/g, "").replace(/\n/g, "\\N");
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}
