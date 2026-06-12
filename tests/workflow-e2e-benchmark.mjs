import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { fetchJsonWithRetry } from "../shared/local-api.mjs";
import {
  createMp3,
  decodeFinalFrame,
  downloadJsonOutput,
  downloadOutput,
  finiteNumber,
  openWithFfmpeg,
  removeOutputUrl,
  round,
  stageTimingMs,
  waitForCondition,
  waitForJob,
} from "./workflow-flow-helpers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const benchRoot = path.join(root, ".dev", "bench");
const runsDir = path.join(benchRoot, "runs");
const historyPath = path.join(benchRoot, "render-history.jsonl");
const latestReportPath = path.join(benchRoot, "latest-workflow-e2e-report.md");
const configPath =
  option("config") ??
  process.env.SONARA_WORKFLOW_E2E_CONFIG ??
  path.join(benchRoot, "workflow-e2e-config.json");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = path.join(runsDir, `${runId}-workflow-e2e`);
const artifactsDir = path.join(runDir, "artifacts");
const screenshotDir = path.join(runDir, "screenshots");
const clientUrl = process.env.SONARA_CLIENT_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.SONARA_API_URL ?? defaultApiUrl(clientUrl);
const selectedSources = normalizeSources(
  option("source") ?? process.env.SONARA_WORKFLOW_E2E_SOURCE ?? "both",
);
const fixtureCoverBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR42mNk+M+ABzDhkQAP/wL+zKxQfAAAAABJRU5ErkJggg==";
const thresholds = {
  totalMs: 1.3,
  audioProcessMs: 1.35,
  videoRenderMs: 1.35,
  publicationAssetMs: 1.35,
  artifactBytes: 1.5,
};

await fs.mkdir(artifactsDir, { recursive: true });
await fs.mkdir(screenshotDir, { recursive: true });
await fetchJsonWithRetry(`${apiUrl}/api/visual-presets`, undefined, {
  attempts: 5,
  delayMs: 300,
});

const history = await readHistory(historyPath);
const inputConfig = selectedSources.includes("input")
  ? await loadInputConfig(configPath)
  : null;
const run = {
  runId,
  kind: "workflow-e2e-benchmark",
  profile: "workflow-e2e",
  testKey: "workflow.e2e",
  testLabel: "Workflow E2E",
  domain: "workflow",
  pipeline: "full-workflow",
  suiteId: option("suite-id") ?? process.env.SONARA_BENCH_SUITE_ID ?? "",
  suiteKind:
    option("suite-kind") ?? process.env.SONARA_BENCH_SUITE_KIND ?? "separate",
  repeat: 1,
  createdAt: new Date().toISOString(),
  git: gitInfo(),
  environment: environmentInfo(),
  audioSource: {
    kind: selectedSources.join("+"),
    label: workflowSourceLabel(selectedSources, inputConfig),
  },
  thresholds,
  cases: [],
  medians: [],
  warnings: [],
};

console.log("Sonara Workflow E2E benchmark");
console.log(`Client: ${clientUrl}`);
console.log(`API: ${apiUrl}`);
console.log(`Sources: ${selectedSources.join(", ")}`);
console.log(`Artifacts: ${path.relative(root, runDir)}`);

for (const source of selectedSources) {
  const result = await runWorkflowCase(source, inputConfig);
  result.warnings = compareWithHistory(result, history, thresholds);
  run.cases.push(result);
  run.warnings.push(
    ...result.warnings.map((warning) => `${result.id}: ${warning}`),
  );
  const status = result.warnings.length ? "WARN" : "OK";
  console.log(
    `${status} ${result.id}: ${formatMs(result.totalMs)} total, ${formatMs(result.audioProcessMs)} audio, ${formatMs(result.videoRenderMs)} video, ${formatMs(result.publicationAssetMs)} asset, ${result.artifactBytes} bytes`,
  );
}

await fs.writeFile(
  path.join(runDir, "workflow-e2e.json"),
  JSON.stringify(run, null, 2),
);
await fs.appendFile(historyPath, `${JSON.stringify(run)}\n`);
await fs.writeFile(latestReportPath, renderMarkdown(run));

console.log(`Report: ${path.relative(root, latestReportPath)}`);
if (run.warnings.length) {
  console.warn("Performance warnings:");
  for (const warning of run.warnings) console.warn(`- ${warning}`);
}

async function runWorkflowCase(source, inputConfig) {
  const caseStarted = performance.now();
  const caseId = `workflow-e2e.${source}`;
  const caseDir = path.join(artifactsDir, source);
  const workDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `sonara-workflow-e2e-${source}-`),
  );
  await fs.mkdir(caseDir, { recursive: true });
  const prepared = await prepareSource(source, inputConfig, workDir);
  const trackTitles = prepared.tracks.map((track) => track.title);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
  });
  const errors = [];
  const failedRequests = [];
  const cleanupUrls = [];
  const downloadedArtifacts = [];

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (failure?.errorText === "net::ERR_ABORTED") {
      return;
    }
    failedRequests.push(
      `${request.method()} ${request.url()} ${failure?.errorText}`,
    );
  });

  try {
    await page.addInitScript(() => {
      window.localStorage.removeItem("sonara-hub-panel-widths");
    });
    await page.goto(clientUrl, { waitUntil: "networkidle" });
    await waitForStableTrackList(page);

    for (const track of prepared.tracks) {
      const rowsBeforeImport = await page
        .locator(".track-row", { hasText: track.title })
        .count();
      await page
        .locator('input[accept="audio/*"]')
        .first()
        .setInputFiles(track.file);
      await page.waitForFunction(
        ({ title, rowsBefore }) =>
          [...document.querySelectorAll(".track-row")].filter((row) =>
            row.textContent?.includes(title),
          ).length > rowsBefore,
        { title: track.title, rowsBefore: rowsBeforeImport },
        { timeout: 20_000 },
      );
    }

    await page.getByRole("button", { name: "Biblioteca de áudio" }).click();
    await selectPreparedTracks(page, prepared.tracks);

    const batchMode = prepared.tracks.length >= 2;
    if (batchMode) {
      const batch = page.getByRole("group", { name: "Dados comuns do lote" });
      await batch.getByLabel("Artista principal").fill("Benchmark Artist");
      await batch.getByLabel("Álbum", { exact: true }).fill(prepared.album);
      await batch.getByLabel("Artista do álbum").fill("Benchmark Artist");
      await batch.getByLabel("Ano").fill("2026");
      await batch
        .getByLabel("Comentário ID3")
        .fill(`Workflow E2E ${source} gerado em ${runId}.`);
      await batch
        .getByRole("button", { name: "Sobrescrever informados" })
        .click();
      await batch
        .getByRole("button", { name: "Aplicar aos selecionados" })
        .click();
      await page
        .getByRole("status")
        .getByText("com sobrescrita dos campos informados", { exact: false })
        .waitFor();
    } else {
      await applySingleTrackMetadata(page, prepared.album, source);
    }
    await page
      .locator('input[type="file"][accept="image/*,.svg"]')
      .setInputFiles(prepared.coverPath);
    await page.screenshot({
      path: path.join(screenshotDir, `${source}-01-audio-ready.png`),
      fullPage: true,
    });

    const audioResponses = [];
    const audioCollector = collectPostResponses(
      page,
      "/api/audio/process",
      audioResponses,
    );
    await page.getByRole("tab", { name: "Qualidade" }).click();
    await page
      .locator(".inspector-panel")
      .getByRole("button", { name: /Processar/u })
      .click();
    await page
      .getByRole("status")
      .getByText(/Processamento iniciado/u)
      .waitFor({ timeout: 10_000 });

    await waitForCondition(
      () => audioResponses.length >= prepared.tracks.length,
      "workflow audio responses",
      20_000,
    );
    page.off("response", audioCollector);
    const audioJobs = [];
    for (const response of audioResponses.slice(0, prepared.tracks.length)) {
      assert.ok(response.ok(), `audio response status ${response.status()}`);
      const { jobId } = await response.json();
      audioJobs.push(await waitForJob(apiUrl, jobId, 180_000));
    }
    for (const job of audioJobs) {
      assert.equal(job.status, "done", JSON.stringify(job, null, 2));
      assert.ok(
        trackTitles.includes(job.metadata?.title),
        `unexpected audio job title ${job.metadata?.title}`,
      );
      cleanupJobUrls(cleanupUrls, job);
      await validateAudioJob(job, caseDir, downloadedArtifacts);
    }

    await page.waitForFunction(
      (count) =>
        [...document.querySelectorAll(".track-row")].filter((row) =>
          row.textContent?.includes("Tratado"),
        ).length >= count,
      prepared.tracks.length,
      { timeout: 30_000 },
    );
    await selectSidebarTracks(page, prepared.tracks, { preferTreated: true });
    await page.screenshot({
      path: path.join(screenshotDir, `${source}-02-audio-done.png`),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Estúdio visual" }).click();
    await page.locator(".steps button").filter({ hasText: "Visual" }).click();
    await page
      .locator('select:has(option[value="audio-dark"])')
      .selectOption("audio-dark");
    await page.getByText("Waveform", { exact: true }).click();
    await page.getByText("Mostrar waveform").click();
    await page
      .locator('select:has(option[value="spectrum-bars"])')
      .selectOption("spectrum-bars");
    await page
      .locator('input[type="file"][accept="image/*,video/*,.svg"]')
      .setInputFiles(prepared.layerPath);
    await page.waitForFunction(
      () => document.querySelectorAll(".layer-row").length >= 1,
      undefined,
      { timeout: 10_000 },
    );
    await page.locator(".cover-layer-apply select").selectOption("right");
    await page
      .locator(".cover-layer-apply")
      .getByRole("button", { name: "Aplicar capa" })
      .click();
    const coverLayer = page
      .locator(".layer-row", { hasText: "Capa - Direita" })
      .first();
    await coverLayer.waitFor({ timeout: 10_000 });
    await coverLayer.locator("summary").click();
    await coverLayer.getByLabel("Fade-out da capa").check();
    await coverLayer.getByLabel("Tipo de fade").selectOption("timed");
    if (batchMode) {
      await page
        .getByRole("button", { name: "Aplicar visual ao lote" })
        .click();
      await page
        .getByRole("status")
        .getByText("Visual aplicado ao lote selecionado.")
        .waitFor();
    }
    await page.locator(".steps button").filter({ hasText: "Texto" }).click();
    const showYear = page.getByRole("button", { name: "Mostrar Ano" });
    if ((await showYear.count()) > 0) await showYear.click();
    await page.getByLabel("Fade-out de Música").check();
    await page
      .locator(".text-fade-controls", { hasText: "Fade-out de Música" })
      .getByLabel("Tipo de fade")
      .selectOption("timed");
    if (batchMode) {
      await page.getByRole("button", { name: "Aplicar a todos" }).click();
      await page
        .getByRole("status")
        .getByText("Texto do vídeo aplicado ao lote selecionado.")
        .waitFor();
    }
    await page.screenshot({
      path: path.join(screenshotDir, `${source}-03-visual-ready.png`),
      fullPage: true,
    });

    const renderResponses = [];
    const renderCollector = collectPostResponses(
      page,
      "/api/render",
      renderResponses,
    );
    await page.locator(".steps button").filter({ hasText: "Fila" }).click();
    await page.getByLabel("Resolução").selectOption(prepared.resolution);
    await page
      .getByLabel("Perfil de qualidade")
      .selectOption(prepared.qualityProfile);
    await page
      .getByRole("button", {
        name: batchMode ? "Exportar lote" : "Exportar vídeo",
      })
      .click();
    await page
      .getByText("Processamento de vídeos", { exact: true })
      .waitFor({ timeout: 20_000 });
    await waitForCondition(
      () => renderResponses.length >= prepared.tracks.length,
      "workflow render responses",
      20_000,
    );
    page.off("response", renderCollector);
    const renderJobs = [];
    for (const response of renderResponses.slice(0, prepared.tracks.length)) {
      assert.ok(response.ok(), `render response status ${response.status()}`);
      const { jobId } = await response.json();
      renderJobs.push(await waitForJob(apiUrl, jobId, 420_000));
    }
    for (const job of renderJobs) {
      assert.equal(job.status, "done", JSON.stringify(job, null, 2));
      assert.ok(job.outputUrl?.endsWith(".mp4"), JSON.stringify(job, null, 2));
      cleanupJobUrls(cleanupUrls, job);
      await validateRenderJob(job, caseDir, downloadedArtifacts);
    }
    await page.screenshot({
      path: path.join(screenshotDir, `${source}-04-video-done.png`),
      fullPage: true,
    });

    const publicationResponses = [];
    const publicationCollector = collectPostResponses(
      page,
      "/api/publication-assets",
      publicationResponses,
    );
    await page.getByRole("button", { name: "Divulgação" }).click();
    await page.getByText("Assets de publicação").waitFor({ timeout: 20_000 });
    await page
      .getByLabel("Formato base")
      .selectOption(prepared.publicationPresetId);
    await page.getByRole("button", { name: "Gerar assets" }).click();
    await waitForCondition(
      () => publicationResponses.length >= prepared.tracks.length,
      "workflow publication responses",
      20_000,
    );
    page.off("response", publicationCollector);
    const publicationJobs = [];
    for (const response of publicationResponses.slice(
      0,
      prepared.tracks.length,
    )) {
      assert.ok(
        response.ok(),
        `publication response status ${response.status()}`,
      );
      const { jobId } = await response.json();
      publicationJobs.push(await waitForJob(apiUrl, jobId, 180_000));
    }
    for (const job of publicationJobs) {
      assert.equal(job.status, "done", JSON.stringify(job, null, 2));
      cleanupJobUrls(cleanupUrls, job);
      await validatePublicationJob(
        job,
        prepared.publicationPresetId,
        caseDir,
        downloadedArtifacts,
      );
    }
    await page.screenshot({
      path: path.join(screenshotDir, `${source}-05-publication-done.png`),
      fullPage: true,
    });

    assert.deepEqual(errors, []);
    assert.deepEqual(failedRequests, []);
    const totalMs = performance.now() - caseStarted;
    const artifactBytes = sumArtifactBytes(downloadedArtifacts);
    return {
      id: caseId,
      outputId: caseId,
      repeatIndex: 1,
      paramsHash: hash({
        source,
        input: prepared.inputTrackPaths,
        publicationPresetId: prepared.publicationPresetId,
        qualityProfile: prepared.qualityProfile,
        resolution: prepared.resolution,
      }),
      sceneId: "audio-dark",
      rendererId: "workflow-e2e",
      category: source,
      domain: "workflow",
      pipeline: "full-workflow",
      outputSize: outputPresetSize(prepared.resolution),
      internalSize: outputPresetSize(prepared.resolution),
      duration: round(
        sumNumbers(prepared.tracks.map((track) => track.duration)),
      ),
      webglFps: 0,
      outputFps: 0,
      qualityProfile: prepared.qualityProfile,
      totalMs: round(totalMs),
      audioProcessMs: round(sumJobDurations(audioJobs)),
      videoRenderMs: round(sumJobDurations(renderJobs)),
      publicationAssetMs: round(sumJobDurations(publicationJobs)),
      jobCount: audioJobs.length + renderJobs.length + publicationJobs.length,
      artifactBytes,
      mp4Bytes: sumArtifactsByExtension(downloadedArtifacts, ".mp4"),
      peakRssMb: 0,
      webglRetryCount: sumNumbers(
        renderJobs.map((job) => job.retryHistory?.length),
      ),
      retryWebgl: renderJobs.some((job) => (job.retryHistory ?? []).length > 0),
      sourceTrackPaths: prepared.inputTrackPaths,
      artifacts: downloadedArtifacts.map((artifact) => ({
        kind: artifact.kind,
        path: path.relative(root, artifact.path),
        bytes: artifact.bytes,
      })),
      warnings: [],
    };
  } finally {
    await browser.close();
    await Promise.allSettled(
      cleanupUrls
        .filter(Boolean)
        .map((outputUrl) => removeOutputUrl(root, outputUrl)),
    );
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function selectPreparedTracks(page, tracks) {
  await waitForStableTrackList(page);
  const reviewButton = page.getByRole("button", {
    name: /Revisar e processar|Revisar lote/u,
  });
  if (
    (await reviewButton.count()) > 0 &&
    (await reviewButton.first().isVisible())
  ) {
    await reviewButton.first().click();
  }
  await page.getByText("Revisão e tratamento do lote").waitFor({
    timeout: 20_000,
  });
  await selectSidebarTracks(page, tracks);
}

async function selectSidebarTracks(
  page,
  tracks,
  { preferTreated = false } = {},
) {
  const checkboxes = page.locator('.track-list input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();
  for (let index = 0; index < checkboxCount; index += 1) {
    const checkbox = checkboxes.nth(index);
    if (await checkbox.isChecked()) await checkbox.uncheck();
  }
  for (const track of tracks) {
    const matchingRows = page.locator(".track-row", { hasText: track.title });
    const treatedRows = matchingRows.filter({ hasText: "Tratado" });
    const row =
      preferTreated && (await treatedRows.count()) > 0
        ? treatedRows.last()
        : matchingRows.last();
    await row.waitFor({ timeout: 20_000 });
    await row.click();
    await row.locator('input[type="checkbox"]').check();
  }
  await page.waitForFunction(
    (count) =>
      [
        ...document.querySelectorAll('.track-list input[type="checkbox"]'),
      ].filter((input) => input.checked).length === count,
    tracks.length,
    { timeout: 10_000 },
  );
}

async function applySingleTrackMetadata(page, album, source) {
  const inspector = page.locator(".inspector-panel");
  await inspector
    .getByLabel("Artista", { exact: true })
    .fill("Benchmark Artist");
  await inspector.getByLabel("Álbum", { exact: true }).fill(album);
  await inspector.getByLabel("Artista do álbum").fill("Benchmark Artist");
  await inspector.getByLabel("Ano", { exact: true }).fill("2026");
  await inspector
    .getByLabel("Comentário ID3")
    .fill(`Workflow E2E ${source} gerado em ${runId}.`);
}

async function waitForStableTrackList(page, timeoutMs = 30_000) {
  await page.waitForFunction(
    () => document.querySelectorAll(".track-row").length > 0,
    undefined,
    { timeout: timeoutMs },
  );
  const started = Date.now();
  let previousCount = -1;
  let stableTicks = 0;
  while (Date.now() - started < timeoutMs) {
    const count = await page.locator(".track-row").count();
    const importing = await page.getByText(/Importando/u).count();
    if (count === previousCount && importing === 0) {
      stableTicks += 1;
    } else {
      stableTicks = 0;
      previousCount = count;
    }
    if (stableTicks >= 3) return;
    await page.waitForTimeout(350);
  }
  throw new Error("Timed out waiting for stable track list");
}

async function prepareSource(source, inputConfig, workDir) {
  const coverPath = path.join(workDir, "album-cover.png");
  const layerPath = path.join(workDir, "overlay-layer.png");
  await fs.writeFile(coverPath, Buffer.from(fixtureCoverBase64, "base64"));
  await fs.writeFile(layerPath, Buffer.from(fixtureCoverBase64, "base64"));

  if (source === "synthetic") {
    const tracks = [
      { frequency: 246, name: `01 Workflow E2E ${runId} Alpha.mp3` },
      { frequency: 392, name: `02 Workflow E2E ${runId} Beta.mp3` },
    ];
    for (const track of tracks) {
      createMp3(path.join(workDir, track.name), track.frequency, {
        duration: 2,
      });
    }
    return {
      album: `Workflow E2E Synthetic ${runId}`,
      coverPath,
      inputTrackPaths: [],
      layerPath,
      publicationPresetId: "youtube-thumbnail",
      qualityProfile: "fast",
      resolution: "youtube-720p",
      tracks: tracks.map((track) => ({
        duration: 2,
        file: path.join(workDir, track.name),
        title: track.name.replace(/^\d+\s+/u, "").replace(/\.mp3$/u, ""),
      })),
    };
  }

  const normalized = normalizeInputConfig(inputConfig);
  const tracks = [];
  for (const [index, relativeTrackPath] of normalized.trackPaths.entries()) {
    const sourcePath = resolveInputPath(relativeTrackPath);
    await assertReadableFile(
      sourcePath,
      `Faixa configurada ausente: ${relativeTrackPath}`,
    );
    const extension = path.extname(sourcePath) || ".mp3";
    const title = path.basename(sourcePath, extension);
    const file = path.join(
      workDir,
      `${String(index + 1).padStart(2, "0")} ${title}${extension}`,
    );
    await fs.copyFile(sourcePath, file);
    tracks.push({ duration: 0, file, title });
  }

  return {
    album: normalized.projectId,
    coverPath:
      (await firstExistingInputCover(normalized.projectId)) ?? coverPath,
    inputTrackPaths: normalized.trackPaths,
    layerPath,
    publicationPresetId: normalized.publicationPresetId,
    qualityProfile: normalized.qualityProfile,
    resolution: normalized.resolution,
    tracks,
  };
}

async function loadInputConfig(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `Configuração real ausente: ${path.relative(root, filePath)}. Crie o JSON com projectId e trackPaths relativos a input/.`,
      );
    }
    throw error;
  }
}

function normalizeInputConfig(config) {
  const projectId = String(config?.projectId ?? "").trim();
  if (!projectId) {
    throw new Error("workflow-e2e-config.json precisa de projectId.");
  }
  const trackPaths = Array.isArray(config?.trackPaths)
    ? config.trackPaths.map((item) => String(item).trim()).filter(Boolean)
    : [];
  if (trackPaths.length < 1 || trackPaths.length > 2) {
    throw new Error(
      "workflow-e2e-config.json precisa de 1 ou 2 trackPaths relativos a input/.",
    );
  }
  return {
    projectId,
    trackPaths,
    publicationPresetId: String(
      config?.publicationPresetId ?? "youtube-thumbnail",
    ),
    qualityProfile: String(config?.qualityProfile ?? "fast"),
    resolution: String(config?.resolution ?? "youtube-720p"),
  };
}

function resolveInputPath(relativeTrackPath) {
  const inputRoot = path.resolve(root, "input");
  const target = path.resolve(inputRoot, relativeTrackPath);
  if (!target.startsWith(`${inputRoot}${path.sep}`)) {
    throw new Error(`trackPath fora de input/: ${relativeTrackPath}`);
  }
  return target;
}

async function assertReadableFile(filePath, message) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error(message);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(message);
    throw error;
  }
}

async function firstExistingInputCover(projectId) {
  const projectRoot = path.resolve(root, "input", projectId);
  const candidates = [
    path.join(projectRoot, "album.png"),
    path.join(projectRoot, "album.jpg"),
    path.join(projectRoot, "folder.jpg"),
    path.join(projectRoot, "art", "album.png"),
    path.join(projectRoot, "art", "album.jpg"),
    path.join(projectRoot, "art", "folder.jpg"),
  ];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return null;
}

async function validateAudioJob(job, caseDir, artifacts) {
  assert.ok(job.outputUrl?.endsWith(".mp3"), JSON.stringify(job, null, 2));
  const output = await downloadArtifact(
    job.outputUrl,
    caseDir,
    "audio-output",
    artifacts,
  );
  openWithFfmpeg(output.path);
  if (job.sidecarUrl) {
    const sidecar = await downloadJsonOutput(apiUrl, job.sidecarUrl);
    assert.equal(
      sidecar.upload.endpoint,
      "POST https://api.soundcloud.com/tracks",
    );
    await downloadArtifact(job.sidecarUrl, caseDir, "audio-sidecar", artifacts);
  }
  if (job.thumbnailUrl) {
    await downloadArtifact(
      job.thumbnailUrl,
      caseDir,
      "audio-thumbnail",
      artifacts,
    );
  }
  if (job.albumArtworkUrl) {
    await downloadArtifact(
      job.albumArtworkUrl,
      caseDir,
      "album-artwork",
      artifacts,
    );
  }
}

async function validateRenderJob(job, caseDir, artifacts) {
  const mp4 = await downloadArtifact(
    job.outputUrl,
    caseDir,
    "video-output",
    artifacts,
  );
  openWithFfmpeg(mp4.path);
  const finalFramePath = path.join(
    caseDir,
    `${safeName(path.basename(mp4.path, path.extname(mp4.path)))}.final-frame.png`,
  );
  decodeFinalFrame(mp4.path, finalFramePath);
  const frameStat = await fs.stat(finalFramePath);
  assert.ok(frameStat.size > 100, "decoded final frame should be non-empty");
  artifacts.push({
    bytes: frameStat.size,
    kind: "video-final-frame",
    path: finalFramePath,
  });

  if (job.sidecarUrl) {
    const sidecar = await downloadJsonOutput(apiUrl, job.sidecarUrl);
    assert.equal(sidecar.export.visualSettings.rendererId, "audio-dark");
    assert.equal(sidecar.export.visualSettings.waveform.visible, true);
    assert.equal(sidecar.export.visualSettings.waveform.type, "spectrum-bars");
    await downloadArtifact(job.sidecarUrl, caseDir, "video-sidecar", artifacts);
  }
  if (job.thumbnailUrl) {
    await downloadArtifact(
      job.thumbnailUrl,
      caseDir,
      "video-thumbnail",
      artifacts,
    );
  }
}

async function validatePublicationJob(job, presetId, caseDir, artifacts) {
  assert.match(job.outputUrl ?? "", /\.(jpe?g|png|mp4)$/u);
  await downloadArtifact(
    job.outputUrl,
    caseDir,
    "publication-output",
    artifacts,
  );
  if (job.sidecarUrl) {
    const manifest = await downloadJsonOutput(apiUrl, job.sidecarUrl);
    assert.equal(manifest.preset.id, presetId);
    assert.equal(manifest.files?.[0]?.kind, "image");
    await downloadArtifact(
      job.sidecarUrl,
      caseDir,
      "publication-sidecar",
      artifacts,
    );
  }
  if (job.markdownUrl) {
    await downloadArtifact(
      job.markdownUrl,
      caseDir,
      "publication-markdown",
      artifacts,
    );
  }
}

async function downloadArtifact(outputUrl, directory, prefix, artifacts) {
  const extension = outputExtension(outputUrl);
  const index = String(artifacts.length + 1).padStart(2, "0");
  const filePath = path.join(directory, `${index}-${prefix}${extension}`);
  await downloadOutput(apiUrl, outputUrl, filePath);
  const stat = await fs.stat(filePath);
  assert.ok(stat.size > 0, `${prefix} should not be empty`);
  const artifact = { bytes: stat.size, kind: prefix, path: filePath };
  artifacts.push(artifact);
  return artifact;
}

function cleanupJobUrls(cleanupUrls, job) {
  cleanupUrls.push(
    job.outputUrl,
    job.sidecarUrl,
    job.thumbnailUrl,
    job.markdownUrl,
  );
  if (Array.isArray(job.assetUrls)) cleanupUrls.push(...job.assetUrls);
}

function collectPostResponses(page, pathname, target) {
  const collector = (response) => {
    if (
      response.url().endsWith(pathname) &&
      response.request().method() === "POST"
    ) {
      target.push(response);
    }
  };
  page.on("response", collector);
  return collector;
}

function compareWithHistory(result, history, thresholdConfig) {
  const previous = [...history]
    .reverse()
    .find(
      (entry) =>
        entry.testKey === "workflow.e2e" &&
        Array.isArray(entry.cases) &&
        entry.cases.some((item) => item.id === result.id),
    );
  const previousCase = previous?.cases?.find((item) => item.id === result.id);
  if (!previousCase) return [];
  const warnings = [];
  for (const [key, multiplier] of Object.entries(thresholdConfig)) {
    const currentValue = finiteNumber(result[key]);
    const previousValue = finiteNumber(previousCase[key]);
    if (previousValue > 0 && currentValue > previousValue * multiplier) {
      warnings.push(
        `${key} ${formatMs(currentValue)} excede baseline anterior ${formatMs(previousValue)}`,
      );
    }
  }
  return warnings;
}

async function readHistory(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return text
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function renderMarkdown(run) {
  const lines = [
    "# Sonara Workflow E2E Benchmark",
    "",
    `- Run: ${run.runId}`,
    `- Teste: ${run.testLabel} (${run.testKey})`,
    `- Suite: ${run.suiteKind || "separate"}`,
    `- Commit: ${run.git.commit}${run.git.dirty ? " (dirty)" : ""}`,
    "",
    "| Caso | Total | Audio | Video | Asset | Jobs | Artefatos |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const item of run.cases) {
    lines.push(
      `| ${item.id} | ${formatMs(item.totalMs)} | ${formatMs(item.audioProcessMs)} | ${formatMs(item.videoRenderMs)} | ${formatMs(item.publicationAssetMs)} | ${item.jobCount} | ${formatBytes(item.artifactBytes)} |`,
    );
  }
  if (run.warnings.length) {
    lines.push("", "## Avisos", "");
    for (const warning of run.warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join("\n")}\n`;
}

function normalizeSources(value) {
  const normalized = String(value ?? "both")
    .trim()
    .toLowerCase();
  if (normalized === "both" || normalized === "all")
    return ["synthetic", "input"];
  if (normalized === "synthetic") return ["synthetic"];
  if (normalized === "input") return ["input"];
  throw new Error(`Fonte desconhecida para Workflow E2E: ${value}`);
}

function defaultApiUrl(url) {
  const parsed = new URL(url);
  if (parsed.port === "5173") {
    return `${parsed.protocol}//${parsed.hostname}:4175`;
  }
  return parsed.origin;
}

function option(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function outputPresetSize(preset) {
  return (
    {
      "youtube-720p": { width: 1280, height: 720 },
      "square-1080": { width: 1080, height: 1080 },
      "vertical-1080": { width: 1080, height: 1920 },
    }[preset] ?? { width: 1280, height: 720 }
  );
}

function outputExtension(outputUrl) {
  try {
    const extension = path.extname(new URL(outputUrl, apiUrl).pathname);
    return extension || ".bin";
  } catch {
    return ".bin";
  }
}

function sumJobDurations(jobs) {
  return sumNumbers(jobs.map((job) => stageTimingMs(job) || elapsedJobMs(job)));
}

function elapsedJobMs(job) {
  const started = Date.parse(job.createdAt);
  const ended = Date.parse(job.updatedAt);
  return Number.isFinite(started) && Number.isFinite(ended)
    ? Math.max(0, ended - started)
    : 0;
}

function sumArtifactBytes(artifacts) {
  return sumNumbers(artifacts.map((artifact) => artifact.bytes));
}

function sumArtifactsByExtension(artifacts, extension) {
  return sumNumbers(
    artifacts
      .filter(
        (artifact) => path.extname(artifact.path).toLowerCase() === extension,
      )
      .map((artifact) => artifact.bytes),
  );
}

function sumNumbers(values) {
  return values.reduce((total, value) => total + finiteNumber(value), 0);
}

function safeName(value) {
  return String(value ?? "artifact").replace(/[^a-z0-9._-]+/giu, "-");
}

function hash(value) {
  return crypto.createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

function formatMs(value) {
  return `${round(value)}ms`;
}

function formatBytes(value) {
  if (value > 1024 * 1024) return `${round(value / 1024 / 1024)} MB`;
  if (value > 1024) return `${round(value / 1024)} KB`;
  return `${value} B`;
}

function workflowSourceLabel(sources, inputConfig) {
  if (sources.length === 1 && sources[0] === "synthetic") return "synthetic";
  if (sources.length === 1 && sources[0] === "input") {
    return `input/${inputConfig?.projectId ?? ""}`;
  }
  return `synthetic + input/${inputConfig?.projectId ?? "configurado"}`;
}

function gitInfo() {
  return {
    branch: git("rev-parse --abbrev-ref HEAD"),
    commit: git("rev-parse HEAD").slice(0, 12),
    dirty: Boolean(git("status --short").trim()),
    status: git("status --short"),
  };
}

function git(args) {
  const result = spawnSync("git", args.split(" "), {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function environmentInfo() {
  return {
    platform: process.platform,
    node: process.version,
    cpus: os.cpus().length,
    totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
  };
}
