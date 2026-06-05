import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";
import { fetchJsonWithRetry } from "../shared/local-api.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = String(Date.now()).slice(-6);
const clientUrl = process.env.SONARA_CLIENT_URL ?? "http://127.0.0.1:5173";
const apiUrl = "http://127.0.0.1:4175";
const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-hub-flow-"));
const screenshotDir = path.join(root, ".dev", "flow-smoke");
const coverPath = path.join(workDir, "album-cover.png");
await fs.mkdir(screenshotDir, { recursive: true });
await fs.writeFile(
  coverPath,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR42mNk+M+ABzDhkQAP/wL+zKxQfAAAAABJRU5ErkJggg==",
    "base64",
  ),
);

await fetchJsonWithRetry(`${apiUrl}/api/visual-presets`, undefined, {
  attempts: 5,
  delayMs: 300,
});

const tracks = [
  {
    file: path.join(workDir, `01 QA Flow ${runId} Alpha.mp3`),
    frequency: 220,
    title: `QA Flow ${runId} Alpha`,
  },
  {
    file: path.join(workDir, `02 QA Flow ${runId} Beta.mp3`),
    frequency: 330,
    title: `QA Flow ${runId} Beta`,
  },
];

for (const track of tracks) {
  createMp3(track.file, track.frequency);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const errors = [];
const failedRequests = [];
const cleanupUrls = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("requestfailed", (request) => {
  failedRequests.push(
    `${request.method()} ${request.url()} ${request.failure()?.errorText}`,
  );
});

try {
  await page.addInitScript(() => {
    window.localStorage.removeItem("sonara-hub-panel-widths");
  });
  await page.goto(clientUrl, { waitUntil: "networkidle" });

  for (const track of tracks) {
    await page
      .locator('input[accept="audio/*"]')
      .first()
      .setInputFiles(track.file);
    await page.getByText(track.title).first().waitFor({ timeout: 20_000 });
  }

  await page.getByRole("button", { name: "Biblioteca de áudio" }).click();
  await page.getByRole("button", { name: "Selecionar todos" }).click();

  const batch = page.getByRole("group", { name: "Dados comuns do lote" });
  await batch.getByLabel("Artista principal").fill("QA Artist");
  await batch
    .getByLabel("Álbum", { exact: true })
    .fill(`QA Complete Flow ${runId}`);
  await batch.getByLabel("Artista do álbum").fill("QA Artist");
  await batch.getByLabel("Ano").fill("2026");
  await batch
    .getByLabel("Comentário ID3")
    .fill("Fluxo completo de QA gerado localmente.");
  await batch.getByRole("button", { name: "Sobrescrever informados" }).click();
  await batch.getByRole("button", { name: "Aplicar aos selecionados" }).click();
  await page
    .getByRole("status")
    .getByText("com sobrescrita dos campos informados", { exact: false })
    .waitFor();
  await page
    .locator('input[type="file"][accept="image/*,.svg"]')
    .setInputFiles(coverPath);
  await page.screenshot({
    path: path.join(screenshotDir, "full-flow-01-batch-ready.png"),
    fullPage: true,
  });

  await page.getByRole("tab", { name: "Qualidade" }).click();
  await page
    .locator(".inspector-panel")
    .getByRole("button", { name: "Processar selecionados" })
    .click();
  await page
    .getByRole("status")
    .getByText(/Processamento iniciado para 2 arquivos/)
    .waitFor({ timeout: 10_000 });

  const audioJobs = await waitForJobs(tracks.map((track) => track.title));
  for (const job of audioJobs) {
    assert.equal(job.status, "done", JSON.stringify(job, null, 2));
    if (job.outputUrl) cleanupUrls.push(job.outputUrl);
    if (job.sidecarUrl) {
      cleanupUrls.push(job.sidecarUrl);
      assert.match(job.sidecarUrl, /\.mp3\.soundcloud\.json$/);
      const sidecar = await downloadJsonOutput(job.sidecarUrl);
      assert.equal(
        sidecar.upload.endpoint,
        "POST https://api.soundcloud.com/tracks",
      );
      assert.equal(
        sidecar.upload.fields["track[asset_data]"]?.endsWith(".mp3"),
        true,
      );
    }
    if (job.thumbnailUrl) {
      cleanupUrls.push(job.thumbnailUrl);
      assert.match(job.thumbnailUrl, /\/extras\/.+\.cover\.jpg$/);
    }
    if (job.albumArtworkUrl) {
      cleanupUrls.push(job.albumArtworkUrl);
      assert.match(
        job.albumArtworkUrl,
        /\/outputs\/audio\/QA%20Complete%20Flow%20\d+\/album\.jpg$/,
      );
      assert.equal(
        (await fetch(`${apiUrl}${job.albumArtworkUrl}`)).status,
        200,
      );
    }
  }

  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".track-row")].filter((row) =>
        row.textContent?.includes("Tratado"),
      ).length >= 2,
    undefined,
    { timeout: 30_000 },
  );
  await page.screenshot({
    path: path.join(screenshotDir, "full-flow-02-batch-done.png"),
    fullPage: true,
  });

  const treatedCount = await page
    .locator(".track-row", { hasText: "Tratado" })
    .count();
  assert.ok(
    treatedCount >= 2,
    `expected at least 2 treated tracks, got ${treatedCount}`,
  );

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
  await page.getByRole("button", { name: "Aplicar visual ao lote" }).click();
  await page
    .getByRole("status")
    .getByText("Visual aplicado ao lote selecionado.")
    .waitFor();
  await page.locator(".steps button").filter({ hasText: "Texto" }).click();
  const showYear = page.getByRole("button", { name: "Mostrar Ano" });
  if ((await showYear.count()) > 0) await showYear.click();
  await page.getByRole("button", { name: "Aplicar a todos" }).click();
  await page
    .getByRole("status")
    .getByText("Texto do vídeo aplicado ao lote selecionado.")
    .waitFor();
  await page.screenshot({
    path: path.join(screenshotDir, "full-flow-03-visual-ready.png"),
    fullPage: true,
  });

  await page.locator(".steps button").filter({ hasText: "Fila" }).click();
  await page.getByLabel("Resolução").selectOption("youtube-720p");
  await page.getByLabel("Perfil de qualidade").selectOption("fast");
  const renderResponses = [];
  const responseCollector = (response) => {
    if (
      response.url().endsWith("/api/render") &&
      response.request().method() === "POST"
    ) {
      renderResponses.push(response);
    }
  };
  page.on("response", responseCollector);
  await page.getByRole("button", { name: "Exportar lote" }).click();
  await page
    .getByText("Processamento de vídeos", { exact: true })
    .waitFor({ timeout: 20_000 });
  await waitForCondition(
    () => renderResponses.length >= 2,
    "batch render responses",
    20_000,
  );
  page.off("response", responseCollector);
  assert.equal(renderResponses.length, 2, "batch export should start 2 jobs");
  const renderJobs = [];
  for (const response of renderResponses) {
    assert.ok(response.ok(), `render response status ${response.status()}`);
    const { jobId } = await response.json();
    renderJobs.push(await waitForJob(jobId, 180_000));
  }
  for (const renderJob of renderJobs) {
    assert.equal(renderJob.status, "done", JSON.stringify(renderJob, null, 2));
    assert.ok(
      renderJob.outputUrl?.endsWith(".mp4"),
      JSON.stringify(renderJob, null, 2),
    );
    cleanupUrls.push(
      renderJob.outputUrl,
      renderJob.sidecarUrl,
      renderJob.thumbnailUrl,
    );
  }
  await page.waitForFunction(
    () =>
      !document.body.textContent?.includes("Finalizando 98%") &&
      document.body.textContent?.includes("Renderização concluída"),
    undefined,
    { timeout: 20_000 },
  );
  await page.screenshot({
    path: path.join(screenshotDir, "full-flow-04-render-done.png"),
    fullPage: true,
  });

  const mp4Path = path.join(workDir, "render-output.mp4");
  await downloadOutput(renderJobs[0].outputUrl, mp4Path);
  openWithFfmpeg(mp4Path);
  for (const renderJob of renderJobs) {
    const sidecar = await downloadJsonOutput(renderJob.sidecarUrl);
    assert.equal(sidecar.export.visualSettings.rendererId, "audio-dark");
    assert.equal(sidecar.export.visualSettings.waveform.visible, true);
    assert.equal(sidecar.export.visualSettings.waveform.type, "spectrum-bars");
    assert.equal(
      sidecar.export.compositionSettings.textSettings.fields.year,
      true,
    );
    assert.equal(sidecar.export.metadata.year, "2026");
  }

  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  console.log(
    JSON.stringify(
      {
        audioJobs: audioJobs.length,
        renderOutputs: renderJobs.map((job) => job.outputUrl),
        screenshots: screenshotDir,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await Promise.allSettled(cleanupUrls.filter(Boolean).map(removeOutputUrl));
  await fs.rm(workDir, { recursive: true, force: true });
}

function createMp3(filePath, frequency) {
  const result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${frequency}:duration=2`,
      "-ac",
      "2",
      "-ar",
      "44100",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      filePath,
    ],
    { windowsHide: true },
  );
  if (result.status !== 0) throw new Error(result.stderr.toString());
}

async function waitForJobs(titles, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { jobs } = await fetchJsonWithRetry(`${apiUrl}/api/jobs`);
    const matching = titles
      .map((title) =>
        jobs.find(
          (job) =>
            job.kind === "audio-process" && job.metadata?.title === title,
        ),
      )
      .filter(Boolean);
    if (
      matching.length === titles.length &&
      matching.every((job) =>
        ["done", "error", "canceled"].includes(job.status),
      )
    ) {
      return matching;
    }
    await delay(750);
  }
  throw new Error(`Timed out waiting for audio jobs: ${titles.join(", ")}`);
}

async function waitForJob(id, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await fetchJsonWithRetry(`${apiUrl}/api/jobs/${id}`);
    if (["done", "error", "canceled"].includes(job.status)) return job;
    await delay(1000);
  }
  throw new Error(`Timed out waiting for job ${id}`);
}

async function downloadOutput(outputUrl, filePath) {
  const response = await fetch(new URL(outputUrl, apiUrl));
  if (!response.ok) throw new Error(`download failed ${response.status}`);
  await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
}

async function downloadJsonOutput(outputUrl) {
  const response = await fetch(new URL(outputUrl, apiUrl));
  if (!response.ok) throw new Error(`json download failed ${response.status}`);
  return response.json();
}

function openWithFfmpeg(filePath) {
  const result = spawnSync(
    ffmpegPath,
    ["-v", "error", "-i", filePath, "-f", "null", "-"],
    { windowsHide: true },
  );
  if (result.status !== 0) throw new Error(result.stderr.toString());
}

async function removeOutputUrl(outputUrl) {
  if (!outputUrl?.startsWith("/outputs/")) return;
  const relativePath = decodeURIComponent(outputUrl.slice("/outputs/".length));
  const targetPath = path.resolve(root, "outputs", relativePath);
  const outputsRoot = path.resolve(root, "outputs");
  if (!targetPath.startsWith(outputsRoot + path.sep)) return;
  await fs.rm(targetPath, { force: true });
  let currentDirectory = path.dirname(targetPath);
  while (
    currentDirectory !== outputsRoot &&
    currentDirectory.startsWith(outputsRoot + path.sep)
  ) {
    try {
      await fs.rmdir(currentDirectory);
      currentDirectory = path.dirname(currentDirectory);
    } catch {
      break;
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(check, label, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
