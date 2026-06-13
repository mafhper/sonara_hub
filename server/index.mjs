import crypto from "node:crypto";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { availableParallelism } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { parseFile } from "music-metadata";
import multer from "multer";
import sharp from "sharp";
import {
  renderWebglBackgroundVideo,
  renderWebglScenePoster,
} from "./webgl-export.mjs";
import { sampleAudioEnvelope } from "./audio-envelope.mjs";
import {
  analyzeAudioQuality,
  buildTreatedAlbumDirectoryName,
  buildTreatedFileName,
  createAlbumFolderCover,
  createNumberedCover,
  inferAudioTags,
  normalizePodcastAudioProcessing,
  processMp3Copy,
  romanNumeral,
} from "./audio-library.mjs";
import { createPresetStore, PresetStoreError } from "./preset-store.mjs";
import { loadJobHistory, saveJobHistory } from "./job-store.mjs";
import { multipartJobRoute } from "./multipart-route.mjs";
import { renderCanvasSize, renderTiming } from "./render-profile.mjs";
import { safeSvgBuffer } from "./svg-safety.mjs";
import {
  cleanupOwnedStorage,
  summarizeOwnedStorage,
} from "./storage-cleanup.mjs";
import {
  cleanupJobWorkDir,
  createCanceledJobError,
  createJobQueue,
  createJobRunner,
  createJobStageTracker,
  isCanceledJobError,
  resolveJobConcurrency,
  runJobWithRetry,
} from "./job-service.mjs";
import {
  defaultRenderMaxAttempts,
  loadRenderJobPayload,
  persistRenderJobPayload,
} from "./job-payload.mjs";
import { createTempFileRegistry } from "./temp-files.mjs";
import { runRenderWorkerJob } from "./job-worker.mjs";
import { buildWebglMuxArgs } from "./video-mux.mjs";
import { validateVideoAudioAnalysis } from "./video-quality.mjs";
import { resolveServerPort } from "./server-port.mjs";
import {
  BenchmarkBaselineError,
  cleanupRenderBenchmarkData,
  loadBenchmarkCleanupPolicy,
  loadRenderBenchmarkReport,
  saveBenchmarkBaseline,
  saveBenchmarkCleanupPolicy,
} from "./benchmark-report.mjs";
import {
  emptyWorkflowBenchmark,
  summarizeWorkflowBenchmark,
} from "./workflow-benchmark.mjs";
import { normalizeVisualSettings } from "../shared/visual-effects.mjs";
import { normalizeTextSettings } from "../shared/text-settings.mjs";
import {
  isArtworkName,
  treatedAlbumArtworkFileName,
  treatedTrackArtworkPath,
} from "../shared/artwork-convention.mjs";
import { isLyricsTextPath } from "../shared/lyrics-convention.mjs";
import { buildNameFromPattern } from "../shared/file-naming.mjs";
import {
  clampPublicationClipDurationForPreset,
  clampPublicationClipStart,
  clampPublicationLyricsLineSpacing,
  normalizePublicationBookletTheme,
  normalizePublicationLyricsMode,
  normalizePublicationLyricsPosition,
  normalizePublicationLyricsStyle,
  publicationLyricsTextForSettings,
  publicationAssetPresetById,
  sanitizePublicationLyricsExcerpt,
  sanitizePublicationFilePart,
} from "../shared/publication-assets.mjs";
import {
  parsePodcastFeedOutputRequest,
  PodcastFeedOutputError,
  writePodcastFeedOutputs,
} from "./podcast-feed-output.mjs";
import {
  createFfmpegProcessError,
  normalizeFfmpegSpawnError,
  resolveFfmpegPath,
} from "./ffmpeg-tool.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const inputDir = path.join(rootDir, "input");
const uploadDir = path.join(rootDir, ".dev", "uploads");
const workDir = path.join(rootDir, ".dev", "work");
const artworkPreviewDir = path.join(rootDir, ".dev", "artwork-previews");
const outputDir = path.join(rootDir, "outputs");
const treatedOutputDir = path.join(outputDir, "audio");
const audioFilePattern = /\.(mp3|wav|m4a|flac|aac)$/i;
const lightweightAudioMetadataBytes = 8 * 1024 * 1024;
const benchmarkHistoryPath = path.join(
  rootDir,
  ".dev",
  "bench",
  "render-history.jsonl",
);
const benchmarkRunsDir = path.join(rootDir, ".dev", "bench", "runs");
const benchmarkBaselinePath = path.join(
  rootDir,
  ".dev",
  "bench",
  "baselines.json",
);
const benchmarkCleanupPolicyPath = path.join(
  rootDir,
  ".dev",
  "bench",
  "cleanup-policy.json",
);
const customPresetPath = path.join(
  rootDir,
  "data",
  "custom-presets.local.json",
);
const jobHistoryPath = path.join(rootDir, "data", "jobs.local.json");
const port = resolveServerPort();
const systemParallelism = Math.max(1, availableParallelism());
const audioJobConcurrency = resolveAudioJobConcurrency(systemParallelism);
const renderJobConcurrency = resolveRenderJobConcurrency(systemParallelism);

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
const jobSubmitRoute = (code, handler) =>
  multipartJobRoute({ code, handler, logUnexpectedError, tempFiles });
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
const renderJobQueue = createJobQueue({
  concurrency: renderJobConcurrency,
  onError: (error) => logUnexpectedError("render job queue", error),
});
const audioJobQueue = createJobQueue({
  concurrency: audioJobConcurrency,
  onError: (error) => logUnexpectedError("audio job queue", error),
});
const activeJobWorkers = new Map();
const benchmarkExecutions = new Map();

app.use(express.json({ limit: "5mb" }));
app.use("/outputs", express.static(outputDir));

app.get("/api/dev/benchmarks", async (req, res, next) => {
  try {
    const limit = clampNumber(Number(req.query.limit ?? 250), 1, 1000);
    const activeBaseline = String(req.query.baseline ?? "stable");
    const includeWorkflow = parseBoolean(
      req.query.workflow ?? req.query.includeWorkflow,
    );
    const report = await loadRenderBenchmarkReport(benchmarkHistoryPath, {
      activeBaseline,
      baselinePath: benchmarkBaselinePath,
      cleanupPolicyPath: benchmarkCleanupPolicyPath,
      currentGit: currentBenchmarkGit(),
      limit,
    });
    res.json({
      ...report,
      workflow: includeWorkflow
        ? summarizeWorkflowBenchmark(Array.from(jobs.values()))
        : emptyWorkflowBenchmark(),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/dev/benchmarks/cleanup-policy", async (req, res, next) => {
  try {
    res.json({
      cleanupPolicy: await saveBenchmarkCleanupPolicy(
        benchmarkCleanupPolicyPath,
        req.body,
      ),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/dev/benchmarks/baseline", async (req, res, next) => {
  try {
    res.json(
      await saveBenchmarkBaseline(benchmarkBaselinePath, {
        historyPath: benchmarkHistoryPath,
        runId: req.body?.runId,
        slot: req.body?.slot,
      }),
    );
  } catch (error) {
    if (error instanceof BenchmarkBaselineError) {
      res.status(error.statusCode).json({
        code: error.code,
        error: error.message,
      });
      return;
    }
    next(error);
  }
});

app.post("/api/dev/benchmarks/cleanup", async (req, res, next) => {
  try {
    const policy = {
      ...(await loadBenchmarkCleanupPolicy(benchmarkCleanupPolicyPath)),
      ...(req.body?.policy ?? {}),
    };
    res.json({
      cleanup: await cleanupRenderBenchmarkData({
        historyPath: benchmarkHistoryPath,
        mode: String(req.body?.mode ?? "policy"),
        policy,
        runId: String(req.body?.runId ?? ""),
        runsDir: benchmarkRunsDir,
      }),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/dev/benchmarks/run", async (req, res) => {
  const kind = normalizeBenchmarkRunKind(req.body?.kind);
  const running = [...benchmarkExecutions.values()].find(
    (item) => item.status === "running" || item.status === "queued",
  );
  if (running) {
    return res.status(409).json({
      error: "Ja existe um benchmark em execucao.",
      execution: publicBenchmarkExecution(running),
    });
  }
  const execution = createBenchmarkExecution(kind);
  benchmarkExecutions.set(execution.id, execution);
  void runBenchmarkExecution(execution);
  res.status(202).json({ execution: publicBenchmarkExecution(execution) });
});

app.get("/api/dev/benchmarks/run/:id", (req, res) => {
  const execution = benchmarkExecutions.get(req.params.id);
  if (!execution) {
    return res
      .status(404)
      .json({ error: "Execucao de benchmark nao encontrada." });
  }
  res.json({ execution: publicBenchmarkExecution(execution) });
});

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

app.get("/api/input-asset/:fileName", async (req, res) => {
  const filePath = await resolveInputAsset(req.params.fileName);
  if (!filePath) {
    res.status(404).json({ error: "Asset de entrada não encontrado." });
    return;
  }
  try {
    if (filePath.toLowerCase().endsWith(".svg")) {
      res.type("image/svg+xml").send(await safeSvgBuffer(filePath));
      return;
    }
    res.sendFile(filePath);
  } catch {
    res.status(404).json({ error: "Asset de entrada inválido." });
  }
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

app.get("/api/project", async (req, res) => {
  const inputProjects = await listInputProjects();
  const inputScope = await inputProjectScope(req.query.project);
  const inputAudios = await listInputAudios(inputScope);
  const audioPath = inputAudios[0]
    ? inputPathFromRelative(inputAudios[0].name)
    : await findDefaultAudio();
  const lyricsPath = path.join(rootDir, "lyrics.txt");
  const lyricsText = await readTextIfExists(lyricsPath);
  const parsedLyrics = parseLyrics(lyricsText);
  const audio = audioPath
    ? await readInputAudioMetadataSummary(audioPath)
    : null;

  res.json({
    projectRoot: rootDir,
    inputDirectory: "input",
    outputDirectory: "outputs",
    defaultAudio: audioPath ? inputRelativeAudioName(audioPath) : null,
    inputProject: inputScope.projectId,
    inputProjects,
    inputAudios,
    inputArtwork: await listInputAssets(inputScope, (relativePath) =>
      isArtworkName(relativePath),
    ),
    inputLyrics: await listInputAssets(inputScope, (relativePath) =>
      isLyricsTextPath(relativePath),
    ),
    audio,
    lyrics: parsedLyrics,
    hasLicense: fssync.existsSync(path.join(rootDir, "Commercial_license.pdf")),
    defaultMetadata: buildDefaultMetadata(parsedLyrics, audio),
  });
});

// Internal project snapshot persistence — read/write .sonara/project.json and
// .sonara/assets/ for projects inside input/ without needing a FileSystem
// Access API DirectoryHandle in the browser.

app.get("/api/internal-snapshot", async (req, res) => {
  const scope = await inputProjectScope(req.query.project);
  if (!scope.projectId || scope.projectId === ".") {
    return res.status(400).json({ error: "invalid-project" });
  }
  if (String(req.query.list ?? "") === "1") {
    return res.json({ saves: await listInternalProjectSaves(scope) });
  }
  const save = internalProjectSaveFromQuery(req.query);
  if (!save) return res.status(400).json({ error: "invalid-save" });
  const snapshotPath = internalProjectSnapshotPath(scope, save.id);
  try {
    const content = await fs.readFile(snapshotPath, "utf-8");
    res.type("application/json").send(content);
  } catch (err) {
    if (err?.code === "ENOENT")
      return res.status(404).json({ error: "not-found" });
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.put(
  "/api/internal-snapshot",
  express.json({ limit: "50mb" }),
  async (req, res) => {
    const scope = await inputProjectScope(req.query.project);
    if (!scope.projectId || scope.projectId === ".") {
      return res.status(400).json({ error: "invalid-project" });
    }
    const save = internalProjectSaveFromQuery(req.query, req.body);
    if (!save) return res.status(400).json({ error: "invalid-save" });
    const snapshotPath = internalProjectSnapshotPath(scope, save.id);
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await fs.writeFile(
      snapshotPath,
      JSON.stringify(
        { ...req.body, saveId: save.id, saveName: save.name },
        null,
        2,
      ),
    );
    res.json({ ok: true });
  },
);

app.delete("/api/internal-snapshot", async (req, res) => {
  const scope = await inputProjectScope(req.query.project);
  if (!scope.projectId || scope.projectId === ".") {
    return res.status(400).json({ error: "invalid-project" });
  }
  const sonaraDir = path.join(scope.directory, ".sonara");
  if (req.query.save != null) {
    const save = internalProjectSaveFromQuery(req.query);
    if (!save) return res.status(400).json({ error: "invalid-save" });
    try {
      await fs.rm(internalProjectSnapshotPath(scope, save.id), {
        force: true,
      });
    } catch {
      // Ignore — may not exist yet.
    }
    return res.json({ ok: true });
  }
  try {
    await fs.rm(sonaraDir, { recursive: true, force: true });
  } catch {
    // Ignore — may not exist yet.
  }
  res.json({ ok: true });
});

async function listInternalProjectSaves(scope) {
  const saves = new Map([
    ["default", { id: "default", name: "Padrão", isDefault: true }],
  ]);
  const savesDir = path.join(scope.directory, ".sonara", "saves");
  let entries = [];
  try {
    entries = await fs.readdir(savesDir, { withFileTypes: true });
  } catch {
    return Array.from(saves.values());
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) {
      continue;
    }
    const id = entry.name.replace(/\.json$/i, "");
    let save = { id, name: projectSaveLabelFromId(id) };
    try {
      const snapshot = JSON.parse(
        await fs.readFile(path.join(savesDir, entry.name), "utf8"),
      );
      save = {
        id,
        name: normalizeProjectSaveName(snapshot.saveName) || save.name,
      };
    } catch {
      // Keep the save visible so it can be repaired/deleted by the user.
    }
    saves.set(id, save);
  }
  return Array.from(saves.values()).sort((first, second) => {
    if (first.id === "default") return -1;
    if (second.id === "default") return 1;
    return first.name.localeCompare(second.name, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function internalProjectSnapshotPath(scope, saveId) {
  if (saveId === "default") {
    return path.join(scope.directory, ".sonara", "project.json");
  }
  return path.join(
    scope.directory,
    ".sonara",
    "saves",
    `${normalizeProjectSaveId(saveId)}.json`,
  );
}

function internalProjectSaveFromQuery(query, body = {}) {
  const rawSave = String(query.save ?? body.saveId ?? "default");
  const id =
    rawSave === "default" ? "default" : normalizeProjectSaveId(rawSave);
  if (!id) return null;
  const fallbackName = id === "default" ? "Padrão" : projectSaveLabelFromId(id);
  return {
    id,
    name:
      normalizeProjectSaveName(query.saveName ?? body.saveName) || fallbackName,
    isDefault: id === "default",
  };
}

function normalizeProjectSaveName(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalizeProjectSaveId(value) {
  return normalizeProjectSaveName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function projectSaveLabelFromId(id) {
  return id
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

app.post("/api/internal-asset", upload.single("file"), async (req, res) => {
  const scope = await inputProjectScope(req.query.project);
  if (!scope.projectId || scope.projectId === ".") {
    if (req.file?.path) await tempFiles.cleanup(req.file);
    return res.status(400).json({ error: "invalid-project" });
  }
  if (!req.file?.path) {
    return res.status(400).json({ error: "no-file" });
  }
  const rawFileName = String(req.query.fileName ?? "").trim();
  if (!rawFileName || rawFileName.includes("/") || rawFileName.includes("\\")) {
    await tempFiles.cleanup(req.file);
    return res.status(400).json({ error: "invalid-filename" });
  }
  const assetsDir = path.join(scope.directory, ".sonara", "assets");
  await fs.mkdir(assetsDir, { recursive: true });
  const destPath = path.join(assetsDir, rawFileName);
  try {
    await fs.rename(req.file.path, destPath);
  } catch (err) {
    if (err?.code === "EPERM" || err?.code === "EBUSY") {
      await fs.copyFile(req.file.path, destPath);
      await fs.unlink(req.file.path).catch(() => undefined);
    } else {
      await tempFiles.cleanup(req.file);
      throw err;
    }
  }
  res.json({ ok: true });
});

app.get("/api/internal-asset", async (req, res) => {
  const scope = await inputProjectScope(req.query.project);
  const rawFileName = String(req.query.file ?? "").trim();
  if (!rawFileName || rawFileName.includes("/") || rawFileName.includes("\\")) {
    return res.status(400).json({ error: "invalid-file" });
  }
  const assetPath = path.join(
    scope.directory,
    ".sonara",
    "assets",
    rawFileName,
  );
  try {
    await fs.access(assetPath);
    // Assets live under .sonara/ (a dot-directory). express/send defaults to
    // dotfiles:"ignore", which 404s any path containing a dot-segment — that is
    // why restored cover/external layers silently failed to load. Allow it.
    res.sendFile(assetPath, { dotfiles: "allow" });
  } catch {
    res.status(404).json({ error: "not-found" });
  }
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
    if (String(req.body.partial ?? "false") === "true") {
      const originalSizeBytes = Number(req.body.originalSizeBytes);
      if (Number.isFinite(originalSizeBytes) && originalSizeBytes > 0) {
        metadata.sizeBytes = originalSizeBytes;
        metadata.metadataPartial = true;
      }
    }
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
  jobSubmitRoute("AUDIO_PROCESS_SUBMIT_ERROR", async (req, res) => {
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
    const fileNamePattern = req.body.fileNamePattern
      ? parseJsonObject(req.body.fileNamePattern)
      : null;
    const jobId = crypto.randomUUID();
    const outputName = buildTreatedFileName(draft, fileNamePattern);
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
  }),
);

app.post(
  "/api/audio/process-batch",
  upload.fields([
    { name: "audioBatch", maxCount: 50 },
    { name: "cover", maxCount: 1 },
    { name: "albumCover", maxCount: 1 },
  ]),
  jobSubmitRoute("AUDIO_BATCH_SUBMIT_ERROR", async (req, res) => {
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
    const batchFileNamePattern = parseJsonObject(req.body.fileNamePattern);
    const jobIds = [];
    for (const [index, audioFile] of audioFiles.entries()) {
      const draft = normalizeAudioDraft(drafts[index], audioFile.originalname);
      const jobId = crypto.randomUUID();
      const outputName = buildTreatedFileName(draft, batchFileNamePattern);
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
  }),
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
  jobSubmitRoute("VIDEO_RENDER_SUBMIT_ERROR", async (req, res) => {
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

    if (!(await isAudioReadable(audioPath))) {
      await tempFiles.cleanup(files);
      res.status(400).json({
        error:
          "O arquivo de áudio está corrompido ou incompleto (envio interrompido?). Reabra a faixa e tente novamente.",
      });
      return;
    }

    const lyricsText =
      (lyricsFile
        ? await fs.readFile(lyricsFile.path, "utf8")
        : String(req.body.lyrics ?? "")) ||
      (await readTextIfExists(path.join(rootDir, "lyrics.txt")));
    const settings = normalizeSettings(req.body);
    const metadata = normalizeMetadata(req.body);
    const fileNamePattern = req.body.fileNamePattern
      ? parseJsonObject(req.body.fileNamePattern)
      : null;
    const jobId = crypto.randomUUID();
    const outputName = buildOutputFileName(metadata, null, fileNamePattern);
    const outputPath = path.join(outputDir, outputName);
    const jobOptions = await persistRenderOptions("video-render", {
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

    setJob(jobId, {
      id: jobId,
      kind: "video-render",
      attempt: 0,
      maxAttempts: jobOptions.maxAttempts,
      status: "queued",
      progress: 0,
      message: "Na fila de renderizacao",
      outputUrl: null,
      sidecarUrl: null,
      thumbnailUrl: null,
      payloadRef: jobOptions.payloadRef,
      metadata,
      createdAt: new Date().toISOString(),
    });

    enqueueRender(jobOptions);

    res.json({ jobId });
  }),
);

app.post(
  "/api/publication-assets",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "background", maxCount: 1 },
    { name: "mediaLayers", maxCount: 3 },
    { name: "cover", maxCount: 1 },
  ]),
  jobSubmitRoute("PUBLICATION_ASSET_SUBMIT_ERROR", async (req, res) => {
    const files = req.files ?? {};
    const audioFile = Array.isArray(files.audio) ? files.audio[0] : null;
    const backgroundFile = Array.isArray(files.background)
      ? files.background[0]
      : null;
    const coverFile = Array.isArray(files.cover) ? files.cover[0] : null;
    const mediaLayerFiles = Array.isArray(files.mediaLayers)
      ? files.mediaLayers
      : [];
    const audioPath =
      audioFile?.path ??
      (await resolveInputAudio(req.body.inputAudio)) ??
      (await findDefaultAudio());

    if (!audioPath) {
      await tempFiles.cleanup(files);
      res.status(400).json({ error: "Nenhum áudio foi encontrado." });
      return;
    }

    if (!(await isAudioReadable(audioPath))) {
      await tempFiles.cleanup(files);
      res.status(400).json({
        error:
          "O arquivo de áudio está corrompido ou incompleto (envio interrompido?). Reabra a faixa e tente novamente.",
      });
      return;
    }

    const settings = normalizeSettings(req.body);
    const metadata = normalizeMetadata(req.body);
    const preset = publicationAssetPresetById(req.body.publicationPresetId);
    const clipStart = clampPublicationClipStart(req.body.clipStart);
    const clipDuration = clampPublicationClipDurationForPreset(
      req.body.clipDuration,
      preset,
    );
    const includeFullLyrics =
      String(req.body.includeFullLyrics ?? "false") === "true";
    const lyricsMode = normalizePublicationLyricsMode(
      req.body.lyricsMode,
      includeFullLyrics,
    );
    const lyricsExcerpt = sanitizePublicationLyricsExcerpt(
      req.body.lyricsExcerpt,
    );
    const lyricsHideTags =
      String(req.body.lyricsHideTags ?? "false") === "true";
    const lyricsLineSpacing = clampPublicationLyricsLineSpacing(
      req.body.lyricsLineSpacing,
    );
    const bookletTheme = normalizePublicationBookletTheme(
      req.body.bookletTheme ?? preset.bookletTheme,
    );
    // Optional json/markdown data files; sometimes the user only wants the clip.
    const generateDataFiles =
      String(req.body.generateDataFiles ?? "true") !== "false";
    const lyricsPosition = normalizePublicationLyricsPosition(
      req.body.lyricsPosition,
    );
    const lyricsStyle = normalizePublicationLyricsStyle(req.body.lyricsStyle);
    const jobId = crypto.randomUUID();
    const outputName = publicationAssetOutputName(metadata, preset);
    const outputPath = path.join(outputDir, outputName);
    const jobOptions = await persistRenderOptions("publication-asset", {
      jobId,
      audioPath,
      backgroundFile,
      mediaLayerFiles,
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
      lyricsPosition,
      lyricsStyle,
      bookletTheme,
      generateDataFiles,
      outputPath,
      outputName,
      uploadedFiles: files,
    });

    setJob(jobId, {
      id: jobId,
      kind: "publication-asset",
      attempt: 0,
      maxAttempts: jobOptions.maxAttempts,
      status: "queued",
      progress: 0,
      message: "Na fila de divulgação",
      outputUrl: null,
      sidecarUrl: null,
      thumbnailUrl: null,
      markdownUrl: null,
      assetUrls: [],
      payloadRef: jobOptions.payloadRef,
      metadata,
      createdAt: new Date().toISOString(),
    });

    enqueuePublicationAsset(jobOptions);

    res.json({ jobId });
  }),
);

app.post("/api/podcast-feeds", async (req, res, next) => {
  let jobId = null;
  try {
    const { fileBaseName, sidecar } = parsePodcastFeedOutputRequest(req.body);
    const title = sidecar.feed?.title || "Podcast";
    const author = sidecar.feed?.author || "";
    jobId = crypto.randomUUID();
    setJob(jobId, {
      id: jobId,
      kind: "podcast-feed",
      status: "running",
      progress: 1,
      message: "Preparando feed de podcast",
      outputUrl: null,
      sidecarUrl: null,
      thumbnailUrl: null,
      assetUrls: [],
      metadata: {
        title,
        album: title,
        artist: author,
      },
      createdAt: new Date().toISOString(),
    });

    const stages = createJobStageTracker({ jobId, updateJob });
    stages.enter("feed-manifest", {
      status: "running",
      progress: 25,
      message: "Gravando RSS e sidecar",
    });
    const result = await writePodcastFeedOutputs({
      fileBaseName,
      outputDir,
      sidecar,
    });
    const rssUrl = outputUrl(result.rssFileName);
    const sidecarUrl = outputUrl(result.sidecarFileName);
    stages.finish({
      status: "done",
      progress: 100,
      message: result.ready
        ? "Feed de podcast gerado"
        : `Feed gerado com ${result.findingCount} pendência${result.findingCount === 1 ? "" : "s"}`,
      outputUrl: rssUrl,
      sidecarUrl,
      assetUrls: [rssUrl, sidecarUrl],
      metadata: {
        title: result.sidecar.feed.title,
        album: result.sidecar.feed.title,
        artist: result.sidecar.feed.author,
      },
    });
    res.json({ jobId });
  } catch (error) {
    if (jobId) {
      updateJob(jobId, {
        status: "error",
        progress: 0,
        message: "Falha ao gerar feed de podcast",
        errorCode:
          error instanceof PodcastFeedOutputError
            ? error.code
            : "PODCAST_FEED_ERROR",
        errorDetail:
          error instanceof Error ? error.stack || error.message : String(error),
      });
    }
    if (error instanceof PodcastFeedOutputError) {
      res.status(400).json({ error: error.message, code: error.code });
      return;
    }
    next(error);
  }
});

app.post(
  "/api/render-batch",
  upload.fields([
    { name: "audioBatch", maxCount: 50 },
    { name: "background", maxCount: 1 },
    { name: "mediaLayers", maxCount: 3 },
    { name: "cover", maxCount: 1 },
  ]),
  jobSubmitRoute("VIDEO_BATCH_SUBMIT_ERROR", async (req, res) => {
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
    const fileNamePattern = req.body.fileNamePattern
      ? parseJsonObject(req.body.fileNamePattern)
      : null;
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
      const outputName = buildOutputFileName(
        metadata,
        index + 1,
        fileNamePattern,
      );
      const outputPath = path.join(outputDir, outputName);
      const jobOptions = await persistRenderOptions("video-render", {
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

      setJob(jobId, {
        id: jobId,
        kind: "video-render",
        attempt: 0,
        maxAttempts: jobOptions.maxAttempts,
        status: "queued",
        progress: 0,
        message: `Na fila do lote: ${audioFile.originalname}`,
        outputUrl: null,
        sidecarUrl: null,
        thumbnailUrl: null,
        payloadRef: jobOptions.payloadRef,
        metadata,
        createdAt: new Date().toISOString(),
      });
      jobIds.push(jobId);

      enqueueRender(jobOptions);
    }

    res.json({ jobIds });
  }),
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
    queues: {
      audio: audioJobQueue.snapshot(),
      render: renderJobQueue.snapshot(),
    },
  });
});

app.delete("/api/jobs", async (req, res) => {
  const scope = String(req.query.scope ?? "terminal");
  if (
    !["terminal", "video-render", "publication-asset", "podcast-feed"].includes(
      scope,
    )
  ) {
    res.status(400).json({ error: "Escopo de histórico inválido." });
    return;
  }
  let removed = 0;
  for (const [jobId, job] of jobs) {
    if (isActiveJob(job)) continue;
    if (scope === "video-render" && job.kind !== "video-render") continue;
    if (scope === "publication-asset" && job.kind !== "publication-asset")
      continue;
    if (scope === "podcast-feed" && job.kind !== "podcast-feed") continue;
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

app.post("/api/jobs/pause", async (_req, res) => {
  queuePaused = true;
  for (const job of jobs.values()) {
    if (job.status === "queued") {
      updateJob(job.id, {
        status: "paused",
        message: "Fila pausada antes de iniciar",
      });
    }
  }
  await persistJobSnapshot();
  res.json({ queuePaused });
});

app.post("/api/jobs/resume", async (_req, res) => {
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
  await persistJobSnapshot();
  res.json({ queuePaused });
});

app.post("/api/jobs/cancel-all", async (_req, res) => {
  for (const job of jobs.values()) requestJobCancel(job.id);
  await persistJobSnapshot();
  res.json({ jobs: recentJobs() });
});

app.post("/api/jobs/:id/cancel", async (req, res) => {
  const job = requestJobCancel(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job não encontrado." });
    return;
  }
  await persistJobSnapshot();
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

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  logUnexpectedError(`${req.method} ${req.originalUrl}`, error);
  res.status(500).json({
    error: error instanceof Error ? error.message : String(error),
  });
});

app.listen(port, "127.0.0.1", () => {
  const servesApp = fssync.existsSync(path.join(rootDir, "dist", "index.html"));
  // When a build exists this process serves the full app (stable export mode,
  // no Vite/HMR). Otherwise it is just the API behind the dev client.
  console.log(
    servesApp
      ? `Sonara Hub (app + API) em http://127.0.0.1:${port}`
      : `Sonara Hub API em http://127.0.0.1:${port}`,
  );
});

// Keep the local dev server alive if a background job hits an unexpected
// rejection (e.g. a Windows file lock during cleanup) instead of exiting.
process.on("unhandledRejection", (reason) => {
  console.error("Rejeição não tratada (servidor mantido ativo):", reason);
});

for (const job of jobs.values()) {
  if (job.recovered && isActiveJob(job) && job.payloadRef) {
    enqueueRecoveredRenderJob(job);
  }
}

function enqueueRender(options) {
  enqueueJob(renderJobQueue, options, "VIDEO_RENDER_ERROR", (jobOptions) =>
    runRenderWorker("video-render", jobOptions),
  );
}

function enqueuePublicationAsset(options) {
  enqueueJob(renderJobQueue, options, "PUBLICATION_ASSET_ERROR", (jobOptions) =>
    runRenderWorker("publication-asset", jobOptions),
  );
}

function enqueueAudioProcess(options) {
  enqueueJob(audioJobQueue, options, "AUDIO_PROCESS_ERROR", processAudio);
}

async function persistRenderOptions(kind, options) {
  const { uploadedFiles: _uploadedFiles, ...payload } = options;
  const persisted = await persistRenderJobPayload({
    jobId: options.jobId,
    kind,
    payload,
    workDir,
  });
  return {
    ...options,
    ...persisted.payload,
    attempt: 0,
    maxAttempts: defaultRenderMaxAttempts,
    payloadRef: persisted.payloadRef,
  };
}

async function enqueueRecoveredRenderJob(job) {
  try {
    const restored = await loadRenderJobPayload(job.payloadRef);
    const options = {
      ...restored.payload,
      jobId: job.id,
      attempt: job.attempt ?? 0,
      maxAttempts: job.maxAttempts ?? defaultRenderMaxAttempts,
      payloadRef: job.payloadRef,
    };
    if (restored.kind === "publication-asset") {
      enqueuePublicationAsset(options);
    } else {
      enqueueRender(options);
    }
  } catch (error) {
    updateJob(job.id, {
      status: "error",
      message: "Payload persistente ausente; não foi possível retomar o job",
      errorCode: error?.code ? String(error.code) : "JOB_PAYLOAD_MISSING",
      errorDetail:
        error?.detail ??
        (error instanceof Error ? error.stack || error.message : String(error)),
    });
  }
}

function runRenderWorker(kind, options) {
  const { uploadedFiles: _uploadedFiles, ...payload } = options;
  return runJobWithRetry({
    getJob: (jobId) => jobs.get(jobId),
    jobId: options.jobId,
    maxAttempts: options.maxAttempts ?? defaultRenderMaxAttempts,
    updateJob,
    worker: () => {
      const current = jobs.get(options.jobId);
      const { uploadedFiles: _ignoredUploads, ...attemptPayload } = {
        ...payload,
        attempt: current?.attempt ?? options.attempt,
        maxAttempts: current?.maxAttempts ?? options.maxAttempts,
      };
      return runRenderWorkerJob({
        jobId: options.jobId,
        kind,
        payload: {
          ...attemptPayload,
          workDir,
        },
        updateJob,
        onWorkerStart: (controller) => {
          activeJobWorkers.set(options.jobId, controller);
        },
        onWorkerDone: () => {
          activeJobWorkers.delete(options.jobId);
        },
      });
    },
  });
}

function enqueueJob(queue, options, fallbackErrorCode, worker) {
  const releaseTempFiles = tempFiles.retain(options.uploadedFiles);
  const runJob = createJobRunner({
    cleanupWorkDir: (jobId) => cleanupJobWorkDir(workDir, jobId),
    fallbackErrorCode,
    isCanceled: isCanceledJobError,
    releaseTempFiles,
    runQueuedJob,
    updateJob,
  });
  queue.enqueue(() => runJob(options, worker));
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
  activeJobWorkers.get(jobId)?.cancel();
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
  return createCanceledJobError();
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
  const stages = createJobStageTracker({ jobId, updateJob });
  assertJobNotCanceled(jobId);
  stages.enter("audio-prepare", {
    status: "running",
    progress: 12,
    message: "Preparando pacote MP3",
  });
  const jobWorkDir = path.join(workDir, jobId);
  await fs.mkdir(jobWorkDir, { recursive: true });
  const albumCoverPath = albumCoverFile?.path ?? coverFile?.path ?? null;
  const originalCoverPath = coverFile?.path ?? null;
  let embeddedCoverPath = originalCoverPath;
  let trackArtworkPath = originalCoverPath;
  if (originalCoverPath && coverSeries) {
    const seriesSettings = normalizeCoverSeriesSettings(
      coverSeriesSettings,
      coverStyle,
    );
    const seriesCoverPath = await createNumberedCover(
      originalCoverPath,
      path.join(
        jobWorkDir,
        `${String(draft.trackNumber).padStart(2, "0")}.jpg`,
      ),
      {
        index: draft.trackNumber,
        style: seriesSettings.style,
        includeNumber: false,
        label: "",
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
    trackArtworkPath = seriesCoverPath;
    embeddedCoverPath = seriesSettings.embedAlbumCover
      ? (albumCoverPath ?? originalCoverPath)
      : seriesCoverPath;
  }
  assertJobNotCanceled(jobId);
  stages.enter("audio-tags", {
    progress: 42,
    message: "Gravando metadados limpos",
  });
  const albumDirectoryName = buildTreatedAlbumDirectoryName(draft);
  const albumOutputDir = path.join(treatedOutputDir, albumDirectoryName);
  await fs.mkdir(albumOutputDir, { recursive: true });
  const outputPath = path.join(albumOutputDir, outputName);
  const result = await processMp3Copy({
    inputPath: audioPath,
    inputName: audioName,
    outputPath,
    draft,
    coverPath: embeddedCoverPath,
    normalizationEnabled: draft.normalizationEnabled,
  });
  assertJobNotCanceled(jobId);
  stages.enter("audio-assets", {
    progress: 74,
    message: "Gerando capas e sidecars",
  });
  let thumbnailUrl = null;
  if (trackArtworkPath) {
    const thumbnailRelativePath = treatedTrackArtworkPath(outputName);
    const thumbnailPath = path.join(
      albumOutputDir,
      ...thumbnailRelativePath.split("/"),
    );
    await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });
    await fs.copyFile(trackArtworkPath, thumbnailPath);
    thumbnailUrl = outputUrl(
      "audio",
      albumDirectoryName,
      ...thumbnailRelativePath.split("/"),
    );
  }
  let albumArtworkUrl = null;
  let albumArtworkPath = null;
  if (albumCoverPath) {
    const albumArtworkName = treatedAlbumArtworkFileName;
    albumArtworkPath = path.join(albumOutputDir, albumArtworkName);
    await createAlbumFolderCover(albumCoverPath, albumArtworkPath);
    albumArtworkUrl = outputUrl("audio", albumDirectoryName, albumArtworkName);
  }
  await writeSoundCloudSidecar(outputPath, draft, {
    artworkPath: albumArtworkPath,
    sourceFileName: audioName,
    outputAnalysis: result.analysis,
  });
  stages.finish({
    status: "done",
    progress: 100,
    message: "Copia tratada validada",
    outputUrl: outputUrl("audio", albumDirectoryName, outputName),
    sidecarUrl: outputUrl(
      "audio",
      albumDirectoryName,
      `${outputName}.soundcloud.json`,
    ),
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
  const stages = createJobStageTracker({ jobId, updateJob });
  assertJobNotCanceled(jobId);
  stages.enter("audio-analysis", {
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
    shouldCancel: () => {
      const job = jobs.get(jobId);
      return Boolean(job?.cancelRequested) || job?.status === "canceled";
    },
  });
  assertJobNotCanceled(jobId);
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
  assertJobNotCanceled(jobId);
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

async function renderPublicationAsset({
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
  outputPath,
  outputName,
}) {
  const stages = createJobStageTracker({ jobId, updateJob });
  assertJobNotCanceled(jobId);
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
    ? await prepareCover(coverFile, jobWorkDir, size)
    : metadata.useEmbeddedCover
      ? await prepareEmbeddedCover(audioPath, jobWorkDir)
      : null;

  assertJobNotCanceled(jobId);
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
      shouldCancel: () => {
        const job = jobs.get(jobId);
        return Boolean(job?.cancelRequested) || job?.status === "canceled";
      },
    });
    assertJobNotCanceled(jobId);
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

  stages.enter("manifest", {
    progress: 98,
    message: "Gravando manifesto de divulgação",
  });
  const manifestPath = `${outputPath}.manifest.json`;
  const markdownPath = `${outputPath}.manifest.md`;
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
  stages.finish({
    status: "done",
    progress: 100,
    message: "Asset de divulgação concluído",
    outputUrl: `/outputs/${outputName}`,
    sidecarUrl: `/outputs/${path.basename(manifestPath)}`,
    markdownUrl: `/outputs/${path.basename(markdownPath)}`,
    thumbnailUrl: preset.kind === "image" ? `/outputs/${outputName}` : null,
    assetUrls: [
      `/outputs/${outputName}`,
      `/outputs/${path.basename(manifestPath)}`,
      `/outputs/${path.basename(markdownPath)}`,
    ],
  });
}

async function findDefaultAudio() {
  try {
    const entries = await fs.readdir(rootDir);
    const audio = entries
      .filter((entry) => audioFilePattern.test(entry))
      .sort((a, b) => a.localeCompare(b, "pt-BR"))[0];
    if (audio) return path.join(rootDir, audio);
  } catch {
    // Optional root audio.
  }
  try {
    const inputAudio = (await collectInputAudioFiles(inputDir))[0];
    if (inputAudio) {
      return path.join(inputDir, ...inputAudio.split("/"));
    }
  } catch {
    // Optional input folder.
  }
  return null;
}

function inputRelativeAudioName(filePath) {
  const relative = path.relative(inputDir, filePath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join("/");
  }
  return path.basename(filePath);
}

function inputPathFromRelative(relativePath) {
  return path.join(inputDir, ...String(relativePath).split("/"));
}

async function inputProjectScope(projectId) {
  await fs.mkdir(inputDir, { recursive: true });
  const requested = Array.isArray(projectId) ? projectId[0] : projectId;
  const raw = String(requested ?? "").trim();
  if (!raw || raw === ".") {
    return { directory: inputDir, prefix: "", projectId: "." };
  }
  const segments = safeInputSegments(raw);
  if (!segments) return { directory: inputDir, prefix: "", projectId: "." };
  const directory = path.resolve(inputDir, ...segments);
  const relative = path.relative(inputDir, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { directory: inputDir, prefix: "", projectId: "." };
  }
  try {
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) {
      return { directory: inputDir, prefix: "", projectId: "." };
    }
    const prefix = segments.join("/");
    return { directory, prefix, projectId: prefix };
  } catch {
    return { directory: inputDir, prefix: "", projectId: "." };
  }
}

async function listInputProjects() {
  try {
    await fs.mkdir(inputDir, { recursive: true });
    const projects = [];
    const directTrackCount = await countDirectInputAudioFiles(inputDir);
    if (directTrackCount > 0) {
      projects.push({
        id: ".",
        name: "input",
        path: ".",
        trackCount: directTrackCount,
      });
    }
    for (const entry of await fs.readdir(inputDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const fullPath = path.join(inputDir, entry.name);
      const trackCount = (await collectInputAudioFiles(fullPath, entry.name))
        .length;
      if (trackCount === 0) continue;
      projects.push({
        id: entry.name,
        name: entry.name,
        path: entry.name,
        trackCount,
      });
    }
    return projects.sort((first, second) =>
      first.name.localeCompare(second.name, "pt-BR", {
        numeric: true,
        sensitivity: "base",
      }),
    );
  } catch {
    return [];
  }
}

async function countDirectInputAudioFiles(directory) {
  let count = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && audioFilePattern.test(entry.name)) count += 1;
  }
  return count;
}

async function listInputAudios(scope = { directory: inputDir, prefix: "" }) {
  try {
    await fs.mkdir(inputDir, { recursive: true });
    const audios = [];

    for (const entry of await collectInputAudioFiles(
      scope.directory,
      scope.prefix,
    )) {
      const filePath = path.join(inputDir, ...entry.split("/"));
      const stat = await fs.stat(filePath);
      const metadata = await readInputAudioMetadataSummary(filePath);
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

async function listInputAssets(scope, predicate) {
  try {
    return (
      await collectInputFiles(scope.directory, scope.prefix, predicate)
    ).map((name) => ({ name }));
  } catch {
    return [];
  }
}

async function collectInputAudioFiles(directory, prefix = "") {
  return collectInputFiles(directory, prefix, (relativePath) =>
    audioFilePattern.test(relativePath),
  );
}

async function collectInputFiles(directory, prefix = "", predicate) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const matches = [];
  for (const entry of entries.sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    }),
  )) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (relativePath.split("/").some((segment) => segment.startsWith("."))) {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(
        ...(await collectInputFiles(fullPath, relativePath, predicate)),
      );
      continue;
    }
    if (entry.isFile() && predicate(relativePath)) {
      matches.push(relativePath);
    }
  }
  return matches;
}

async function resolveInputAudio(fileName) {
  const requested = Array.isArray(fileName) ? fileName[0] : fileName;
  if (!requested) {
    return null;
  }

  const safeSegments = safeInputSegments(requested);
  if (!safeSegments) {
    return null;
  }

  const filePath = path.resolve(inputDir, ...safeSegments);
  const relative = path.relative(inputDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  try {
    const stat = await fs.stat(filePath);
    if (stat.isFile() && audioFilePattern.test(filePath)) {
      return filePath;
    }
  } catch {
    return null;
  }

  return null;
}

async function resolveInputAsset(fileName) {
  const filePath = await resolveInputFile(fileName);
  if (!filePath) return null;
  const relative = inputRelativeAudioName(filePath);
  return isArtworkName(relative) || isLyricsTextPath(relative)
    ? filePath
    : null;
}

async function resolveInputFile(fileName) {
  const requested = Array.isArray(fileName) ? fileName[0] : fileName;
  if (!requested) {
    return null;
  }

  const safeSegments = safeInputSegments(requested);
  if (!safeSegments) {
    return null;
  }

  const filePath = path.resolve(inputDir, ...safeSegments);
  const relative = path.relative(inputDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

function safeInputSegments(value) {
  const raw = String(value).replace(/\\/g, "/").trim();
  if (!raw || path.isAbsolute(raw)) return null;
  const segments = raw.split("/").filter(Boolean);
  if (
    !segments.length ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }
  return segments;
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
    const stat = await fs.stat(filePath);
    const common = metadata.common;
    const comment = metadataText(common.comment);
    const lyrics = metadataText(common.lyrics);
    const description =
      firstMetadataText(common.description, common.subtitle, comment) || "";
    return {
      fileName: path.basename(filePath),
      sizeBytes: stat.size,
      title: common.title ?? "",
      artist: common.artist ?? "",
      album: common.album ?? "",
      albumArtist: common.albumartist ?? "",
      genre: common.genre?.join(", ") ?? "",
      description,
      comment,
      year: common.year ?? "",
      date: common.date ?? "",
      track: common.track?.no ?? "",
      trackTotal: common.track?.of ?? "",
      disk: common.disk?.no ?? "",
      diskTotal: common.disk?.of ?? "",
      composer: common.composer?.join(", ") ?? "",
      lyrics,
      hasEmbeddedCover: Boolean(common.picture?.length),
      durationSeconds: metadata.format.duration ?? null,
      bitrate: metadata.format.bitrate ?? null,
      codec: metadata.format.codec ?? metadata.format.container ?? "",
    };
  } catch {
    return {
      fileName: path.basename(filePath),
      sizeBytes: null,
      title: "",
      artist: "",
      album: "",
      albumArtist: "",
      genre: "",
      description: "",
      comment: "",
      year: "",
      date: "",
      track: "",
      trackTotal: "",
      disk: "",
      diskTotal: "",
      composer: "",
      lyrics: "",
      hasEmbeddedCover: false,
      durationSeconds: null,
      bitrate: null,
      codec: "",
    };
  }
}

async function readInputAudioMetadataSummary(filePath) {
  const stat = await fs.stat(filePath);
  if (stat.size <= lightweightAudioMetadataBytes) {
    return readAudioMetadataSummary(filePath);
  }
  await fs.mkdir(uploadDir, { recursive: true });
  const tempPath = path.join(
    uploadDir,
    `metadata-${crypto.randomUUID()}${path.extname(filePath) || ".audio"}`,
  );
  const readHandle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(lightweightAudioMetadataBytes);
    const { bytesRead } = await readHandle.read(
      buffer,
      0,
      lightweightAudioMetadataBytes,
      0,
    );
    await fs.writeFile(tempPath, buffer.subarray(0, bytesRead));
  } finally {
    await readHandle.close();
  }
  try {
    const metadata = await readAudioMetadataSummary(tempPath);
    const estimatedDurationSeconds = estimateDurationFromBitrate(
      stat.size,
      metadata.bitrate,
    );
    return {
      ...metadata,
      fileName: path.basename(filePath),
      sizeBytes: stat.size,
      durationSeconds:
        estimatedDurationSeconds ?? metadata.durationSeconds ?? null,
      metadataPartial: true,
    };
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

function estimateDurationFromBitrate(sizeBytes, bitrate) {
  const safeSizeBytes = Number(sizeBytes);
  const safeBitrate = Number(bitrate);
  if (
    !Number.isFinite(safeSizeBytes) ||
    safeSizeBytes <= 0 ||
    !Number.isFinite(safeBitrate) ||
    safeBitrate <= 0
  ) {
    return null;
  }
  return (safeSizeBytes * 8) / safeBitrate;
}

function firstMetadataText(...values) {
  for (const value of values) {
    const text = metadataText(value);
    if (text) return text;
  }
  return "";
}

function metadataText(value) {
  if (value == null) return "";
  const items = Array.isArray(value) ? value : [value];
  return items
    .map((item) => {
      if (item == null) return "";
      if (typeof item === "string" || typeof item === "number") {
        return String(item);
      }
      if (typeof item === "object") {
        return String(
          item.text ?? item.description ?? item.value ?? item.url ?? "",
        );
      }
      return "";
    })
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n");
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
        (qualityProfile === "fast" ? 24 : qualityProfile === "final" ? 18 : 20),
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
        coverFadeOut: normalizeCoverFadeOut(layer.coverFadeOut),
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
    durationSeconds: clampNumber(
      Number(raw.durationSeconds ?? 0),
      0,
      24 * 60 * 60,
    ),
    mediaLayers,
    textSettings: normalizeTextSettings(raw.textSettings),
  };
}

function normalizeCoverFadeOut(value = {}) {
  const mode = value?.mode === "timed" ? "timed" : "tail";
  return {
    enabled: value?.enabled === true,
    mode,
    endPercent: clampNumber(Number(value?.endPercent ?? 35), 5, 95),
    startPercent: clampNumber(Number(value?.startPercent ?? 10), 0, 95),
    durationSeconds: clampNumber(Number(value?.durationSeconds ?? 2), 0.25, 60),
  };
}

const coverSeriesMetaKeys = ["series", "title", "album", "artist", "year"];

function normalizeCoverSeriesSettings(value = {}, fallbackStyle = "roman") {
  const legacyColor = isHexColor(value.color) ? value.color : "#fffaf1";
  const metaFontSize = clampNumber(Number(value.metaFontSize ?? 34), 18, 72);
  const metaStyles = {
    series: normalizeCoverSeriesMetaStyle(
      value.metaStyles?.series,
      {
        fontSize: clampNumber(Number(value.fontSize ?? 112), 18, 180),
        fontWeight: 400,
        fontStyle: "normal",
        align: "center",
        color: legacyColor,
        opacity: clampNumber(Number(value.opacity ?? 92), 20, 100),
      },
      180,
    ),
    title: normalizeCoverSeriesMetaStyle(value.metaStyles?.title, {
      fontSize: Math.max(38, metaFontSize),
      fontWeight: 720,
      fontStyle: "normal",
      align: "center",
      color: legacyColor,
      opacity: 88,
    }),
    album: normalizeCoverSeriesMetaStyle(value.metaStyles?.album, {
      fontSize: metaFontSize,
      fontWeight: 560,
      fontStyle: "normal",
      align: "center",
      color: legacyColor,
      opacity: 76,
    }),
    artist: normalizeCoverSeriesMetaStyle(value.metaStyles?.artist, {
      fontSize: Math.max(18, metaFontSize - 2),
      fontWeight: 620,
      fontStyle: "normal",
      align: "center",
      color: legacyColor,
      opacity: 72,
    }),
    year: normalizeCoverSeriesMetaStyle(value.metaStyles?.year, {
      fontSize: Math.max(18, metaFontSize - 6),
      fontWeight: 640,
      fontStyle: "normal",
      align: "center",
      color: legacyColor,
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
    color: legacyColor,
    opacity: clampNumber(Number(value.opacity ?? 92), 20, 100),
    x: clampNumber(Number(value.x ?? 50), 8, 92),
    y: clampNumber(Number(value.y ?? 89), 8, 94),
    letterSpacing: clampNumber(Number(value.letterSpacing ?? 18), 0, 80),
    includeNumber: value.includeNumber !== false,
    includeTitle: value.includeTitle === true,
    includeAlbum: value.includeAlbum === true,
    includeArtist: value.includeArtist === true,
    includeYear: value.includeYear === true,
    embedAlbumCover: value.embedAlbumCover === true,
    metaOrder: normalizeCoverSeriesMetaOrder(value.metaOrder),
    metaFontSize,
    metaGap: clampNumber(Number(value.metaGap ?? 10), 0, 48),
    metaStyles,
  };
}

function normalizeCoverSeriesMetaStyle(
  value = {},
  fallback = {},
  maxFontSize = 72,
) {
  return {
    fontSize: clampNumber(
      Number(value.fontSize ?? fallback.fontSize ?? 34),
      18,
      maxFontSize,
    ),
    fontWeight: clampNumber(
      Number(value.fontWeight ?? fallback.fontWeight ?? 520),
      300,
      900,
    ),
    fontStyle: ["normal", "italic"].includes(value.fontStyle)
      ? value.fontStyle
      : fallback.fontStyle === "italic"
        ? "italic"
        : "normal",
    align: ["left", "center", "right"].includes(value.align)
      ? value.align
      : ["left", "center", "right"].includes(fallback.align)
        ? fallback.align
        : "center",
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
  const allowed = new Set(coverSeriesMetaKeys);
  const entries = String(value ?? "series, title, album, artist, year")
    .split(/[\n,;|]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => allowed.has(entry));
  const promoted = entries.includes("series")
    ? entries
    : ["series", ...entries];
  return [...new Set([...promoted, ...coverSeriesMetaKeys])];
}

function coverSeriesLabel(draft, settings) {
  if (settings.style === "arabic") return String(draft.trackNumber || 1);
  if (settings.style === "roman") return romanNumeral(draft.trackNumber || 1);
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
    series: settings.includeNumber && coverSeriesLabel(draft, settings),
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
      letterSpacing: role === "series" ? settings.letterSpacing : 5,
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
    podcastVoiceProfile: normalizePodcastVoiceProfile(raw.podcastVoiceProfile),
    podcastTrimSilence: String(raw.podcastTrimSilence ?? "false") === "true",
    podcastVoiceBoost: String(raw.podcastVoiceBoost ?? "false") === "true",
    podcastPlaybackSpeed: normalizePodcastPlaybackSpeed(
      raw.podcastPlaybackSpeed,
    ),
    podcastIntroInsert: String(raw.podcastIntroInsert ?? "").trim(),
    podcastOutroInsert: String(raw.podcastOutroInsert ?? "").trim(),
    podcastAdInsert: String(raw.podcastAdInsert ?? "").trim(),
    cleanPackage: true,
  };
}

function normalizePodcastVoiceProfile(value) {
  const id = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["broadcast", "warm", "clear"].includes(id) ? id : "natural";
}

function normalizePodcastPlaybackSpeed(value) {
  const speed = Number(value ?? 1);
  return Number.isFinite(speed) ? clampNumber(speed, 0.8, 1.2) : 1;
}

function buildOutputFileName(metadata, index = null, fileNamePattern = null) {
  const base =
    metadata.outputFileName ||
    (fileNamePattern
      ? buildNameFromPattern(fileNamePattern, metadata, slugify)
      : "") ||
    [metadata.artist, metadata.title, metadata.version]
      .filter(Boolean)
      .join(" - ");
  const suffix = index ? `-${String(index).padStart(2, "0")}` : "";
  return `${slugify(base || "sonara-hub-video")}${suffix}.mp4`;
}

function publicationAssetOutputName(metadata, preset) {
  const base = sanitizePublicationFilePart(
    [
      metadata.album || metadata.albumArtist || metadata.artist,
      metadata.title,
      preset.id,
    ]
      .filter(Boolean)
      .join(" - "),
    "sonara-publicacao",
  );
  return `${base}.${preset.extension}`;
}

function titleFromFile(fileName, album, index) {
  const base = path.basename(fileName, path.extname(fileName));
  return base || `${album || "Faixa"} ${index}`;
}

function normalizeBenchmarkRunKind(value) {
  return ["all", "audio", "full", "quick", "workflow-e2e"].includes(value)
    ? value
    : "quick";
}

function createBenchmarkExecution(kind) {
  const id = crypto.randomUUID();
  return {
    id,
    kind,
    label: benchmarkExecutionLabel(kind),
    status: "queued",
    startedAt: new Date().toISOString(),
    endedAt: "",
    exitCode: null,
    currentStep: "",
    logs: [],
  };
}

async function runBenchmarkExecution(execution) {
  execution.status = "running";
  appendBenchmarkLog(execution, `Iniciando ${execution.label}`);
  const steps =
    execution.kind === "all" ? ["quick", "full", "audio"] : [execution.kind];
  try {
    for (const step of steps) {
      execution.currentStep = benchmarkExecutionLabel(step);
      appendBenchmarkLog(execution, `> npm run ${benchmarkScriptName(step)}`);
      await runBenchmarkStep(execution, step);
    }
    execution.status = "completed";
    execution.exitCode = 0;
    appendBenchmarkLog(execution, "Benchmark concluido.");
  } catch (error) {
    execution.status = "failed";
    execution.exitCode = error?.exitCode ?? 1;
    appendBenchmarkLog(
      execution,
      `Benchmark falhou: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    execution.endedAt = new Date().toISOString();
    execution.currentStep = "";
  }
}

function runBenchmarkStep(execution, kind) {
  return new Promise((resolve, reject) => {
    const child = spawn(`npm run ${benchmarkScriptName(kind)}`, {
      cwd: rootDir,
      env: {
        ...process.env,
        SONARA_BENCH_STEP: kind,
        SONARA_BENCH_SUITE_ID: execution.id,
        SONARA_BENCH_SUITE_KIND: benchmarkSuiteKind(execution.kind),
        SONARA_BENCH_TEST_KEY: benchmarkTestKey(kind),
        SONARA_CLIENT_URL:
          process.env.SONARA_CLIENT_URL ?? `http://127.0.0.1:${port}`,
        SONARA_API_URL:
          process.env.SONARA_API_URL ?? `http://127.0.0.1:${port}`,
      },
      shell: true,
      windowsHide: true,
    });
    child.stdout.on("data", (chunk) =>
      appendBenchmarkLog(execution, chunk.toString()),
    );
    child.stderr.on("data", (chunk) =>
      appendBenchmarkLog(execution, chunk.toString()),
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const error = new Error(
          `${benchmarkScriptName(kind)} saiu com ${code}`,
        );
        error.exitCode = code;
        reject(error);
      }
    });
  });
}

function benchmarkScriptName(kind) {
  return {
    audio: "bench:render:audio",
    full: "bench:render:full",
    quick: "bench:render",
    "workflow-e2e": "bench:workflow:e2e",
  }[kind];
}

function benchmarkExecutionLabel(kind) {
  return {
    all: "todos os benchmarks de render",
    audio: "render com audio da pasta input",
    full: "render full",
    quick: "render quick",
    "workflow-e2e": "workflow E2E completo",
  }[kind];
}

function benchmarkSuiteKind(kind) {
  if (kind === "all") return "canonical";
  if (kind === "workflow-e2e") return "separate";
  return "partial";
}

function benchmarkTestKey(kind) {
  return kind === "workflow-e2e" ? "workflow.e2e" : `render.${kind}`;
}

function appendBenchmarkLog(execution, text) {
  const lines = String(text)
    .split(/\r?\n/u)
    .filter((line) => line.length);
  execution.logs.push(...lines);
  if (execution.logs.length > 500) {
    execution.logs.splice(0, execution.logs.length - 500);
  }
}

function publicBenchmarkExecution(execution) {
  return {
    id: execution.id,
    kind: execution.kind,
    label: execution.label,
    status: execution.status,
    startedAt: execution.startedAt,
    endedAt: execution.endedAt,
    exitCode: execution.exitCode,
    currentStep: execution.currentStep,
    logs: execution.logs,
  };
}

function currentBenchmarkGit() {
  return {
    branch: gitCommand(["branch", "--show-current"]),
    commit: gitCommand(["rev-parse", "HEAD"]),
    dirty: Boolean(gitCommand(["status", "--short"])),
  };
}

function gitCommand(args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function resolveAudioJobConcurrency(cores) {
  return resolveJobConcurrency({
    configured: process.env.SONARA_AUDIO_JOB_CONCURRENCY,
    defaultConcurrency: clampNumber(cores - 1, 1, 4),
    max: 4,
  });
}

function resolveRenderJobConcurrency(cores) {
  return resolveJobConcurrency({
    configured:
      process.env.SONARA_RENDER_JOB_CONCURRENCY ??
      process.env.SONARA_VISUAL_JOB_CONCURRENCY,
    defaultConcurrency: cores >= 4 ? 2 : 1,
    max: 4,
  });
}

function normalizeHexColor(value, fallback) {
  const color = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
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
  const tags = metadata.tags.length ? metadata.tags.join(", ") : "—";
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
    `- Faixa: ${metadata.title || "—"}`,
    `- Artista: ${metadata.artist || metadata.albumArtist || "—"}`,
    `- Álbum: ${metadata.album || "—"}`,
    `- Ano: ${metadata.year || "—"}`,
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

async function writeSoundCloudSidecar(
  outputPath,
  draft,
  { artworkPath = null, sourceFileName = "", outputAnalysis = null } = {},
) {
  const primaryGenre = soundCloudPrimaryGenre(draft);
  const tags = soundCloudTags(draft, primaryGenre);
  const sidecar = {
    api: "SoundCloud API",
    references: [
      "https://developers.soundcloud.com/docs/api/",
      "https://help.soundcloud.com/hc/en-us/articles/360039171614-Upload-Requirements",
      "https://help.soundcloud.com/hc/en-us/articles/46022345620123-Edit-and-customize-your-tracks",
    ],
    upload: {
      endpoint: "POST https://api.soundcloud.com/tracks",
      auth: "OAuth 2.1 Authorization Code; send Authorization: OAuth ACCESS_TOKEN",
      contentType: "multipart/form-data",
      fields: {
        "track[title]": soundCloudTrackTitle(draft),
        "track[asset_data]": path.basename(outputPath),
        "track[description]": soundCloudDescription(draft),
        "track[genre]": primaryGenre,
        "track[tag_list]": formatSoundCloudTagList(tags),
        "track[sharing]": "private",
        "track[artwork_data]": artworkPath ? path.basename(artworkPath) : null,
      },
    },
    metadata: {
      title: draft.title,
      artist: draft.artist,
      album: draft.album,
      albumArtist: draft.albumArtist,
      genre: draft.genre,
      year: draft.year,
      trackNumber: draft.trackNumber,
      trackTotal: draft.trackTotal,
      diskNumber: draft.diskNumber,
      diskTotal: draft.diskTotal,
      sourceFileName: path.basename(sourceFileName || outputPath),
    },
    quality: {
      outputFileName: path.basename(outputPath),
      preferredSource: "WAV, FLAC, AIFF or ALAC when a lossless master exists",
      acceptedSource:
        "MP3 is accepted, but this treated package is optimized for clean ID3 delivery, not as a lossless master.",
      headroomTarget:
        "Keep roughly -0.5 to -1 dBFS peak headroom before upload.",
      analysis: outputAnalysis,
      podcastProcessing: normalizePodcastAudioProcessing(draft),
    },
    artwork: {
      fileName: artworkPath ? path.basename(artworkPath) : null,
      recommendation: "JPG or PNG, square, at least 800x800, under 2 MB.",
    },
    notes: [
      "Use the first tag/genre as the main discoverability category.",
      "Prefer specific subgenres or moods, avoid duplicate near-synonyms, and keep multi-word tags together.",
      "SoundCloud transcodes uploads for streaming; enable downloads if listeners should receive the original uploaded file.",
    ],
  };
  await fs.writeFile(
    `${outputPath}.soundcloud.json`,
    JSON.stringify(sidecar, null, 2),
    "utf8",
  );
}

function soundCloudTrackTitle(draft) {
  const title = String(draft.title ?? "").trim() || "Untitled Track";
  return title.slice(0, 100);
}

function soundCloudDescription(draft) {
  const lines = [
    draft.comment,
    draft.album ? `Album: ${draft.album}` : "",
    draft.artist ? `Artist: ${draft.artist}` : "",
    draft.year ? `Year: ${draft.year}` : "",
  ]
    .map((line) => String(line ?? "").trim())
    .filter(Boolean);
  return lines.join("\n").slice(0, 4000);
}

function soundCloudPrimaryGenre(draft) {
  const [firstGenre] = String(draft.genre ?? "").split(/[,;|]+/);
  return soundCloudTag(firstGenre) || "Music";
}

function soundCloudTags(draft, primaryGenre) {
  return uniqueStrings(
    [
      primaryGenre,
      ...String(draft.genre ?? "")
        .split(/[,;|]+/)
        .map(soundCloudTag),
      soundCloudTag(draft.artist),
      soundCloudTag(draft.album),
      soundCloudTag(draft.year),
    ].filter(Boolean),
  ).slice(0, 12);
}

function soundCloudTag(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
}

function formatSoundCloudTagList(tags) {
  return tags.map((tag) => (/\s/.test(tag) ? `"${tag}"` : tag)).join(" ");
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = String(value).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
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
  const ffmpegPath = resolveFfmpegPath();

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

// Validate that ffmpeg can actually open and decode the audio before we queue a
// render. An aborted/truncated upload (multer "Request aborted") otherwise only
// fails deep in the mux with a cryptic "Invalid data found when processing
// input"; here we catch it upfront and return a clear message.
function isAudioReadable(audioPath) {
  const ffmpegPath = resolveFfmpegPath();
  return new Promise((resolve) => {
    const child = spawn(
      ffmpegPath,
      ["-v", "error", "-i", audioPath, "-f", "null", "-"],
      { windowsHide: true },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", () => resolve(false));
    child.on("close", (code) =>
      resolve(code === 0 && !/Invalid data/i.test(stderr)),
    );
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
      // youtube-2k / youtube-4k were removed (WebGL context loss); any unknown
      // or legacy preset degrades safely to 1080p.
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
  logUnexpectedError("visual preset store", error);
  res.status(500).json({
    error: error instanceof Error ? error.message : String(error),
  });
}

function logUnexpectedError(context, error) {
  console.error(
    `[server:500] ${context}`,
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
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
