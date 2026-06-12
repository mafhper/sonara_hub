import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { fetchJsonWithRetry } from "../shared/local-api.mjs";
import {
  createMp3,
  decodeFinalFrame,
  downloadJsonOutput,
  downloadOutput,
  openWithFfmpeg,
  removeOutputUrl,
  waitForAudioJobs,
  waitForCondition,
  waitForJob,
} from "./workflow-flow-helpers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = String(Date.now()).slice(-6);
const clientUrl = process.env.SONARA_CLIENT_URL ?? "http://127.0.0.1:5173";
const apiUrl = "http://127.0.0.1:4175";
const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-hub-flow-"));
const screenshotDir = path.join(root, ".dev", "flow-smoke");
const coverPath = path.join(workDir, "album-cover.png");
const layerPath = path.join(workDir, "overlay-layer.png");
await fs.mkdir(screenshotDir, { recursive: true });
await fs.writeFile(
  coverPath,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR42mNk+M+ABzDhkQAP/wL+zKxQfAAAAABJRU5ErkJggg==",
    "base64",
  ),
);
await fs.writeFile(
  layerPath,
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
  const failureText = request.failure()?.errorText ?? "";
  if (failureText === "net::ERR_ABORTED" && request.url().startsWith("blob:")) {
    return;
  }
  failedRequests.push(`${request.method()} ${request.url()} ${failureText}`);
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

  const audioJobs = await waitForAudioJobs(
    apiUrl,
    tracks.map((track) => track.title),
  );
  for (const job of audioJobs) {
    assert.equal(job.status, "done", JSON.stringify(job, null, 2));
    if (job.outputUrl) cleanupUrls.push(job.outputUrl);
    if (job.sidecarUrl) {
      cleanupUrls.push(job.sidecarUrl);
      assert.match(job.sidecarUrl, /\.mp3\.soundcloud\.json$/);
      const sidecar = await downloadJsonOutput(apiUrl, job.sidecarUrl);
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
  const waveformStackRow = page
    .locator(".composition-stack-row", { hasText: "Waveform" })
    .first();
  await waveformStackRow.waitFor();
  const showWaveform = waveformStackRow.getByRole("button", {
    name: "Mostrar Waveform",
  });
  if ((await showWaveform.count()) > 0) await showWaveform.click();
  await waveformStackRow.getByRole("option").click();
  await page
    .locator('.stack-detail select:has(option[value="spectrum-bars"])')
    .selectOption("spectrum-bars");
  await page
    .locator('input[type="file"][accept="image/*,video/*,.svg"]')
    .setInputFiles(layerPath);
  await page
    .locator(".composition-stack-row", { hasText: "overlay-layer.png" })
    .waitFor({ timeout: 10_000 });
  await page.locator(".stack-add-menu > summary").click();
  await page.locator(".cover-layer-apply select").selectOption("right");
  await page
    .locator(".cover-layer-apply")
    .getByRole("button", { name: "Aplicar capa" })
    .click();
  const coverLayer = page
    .locator(".composition-stack-row", { hasText: "Capa - Direita" })
    .first();
  await coverLayer.waitFor({ timeout: 10_000 });
  await coverLayer.getByRole("option").click();
  const coverDetail = page.locator(".stack-detail", {
    hasText: "Capa - Direita",
  });
  await coverDetail.getByLabel("Fade-out da capa").check();
  await coverDetail.getByLabel("Tipo de fade").selectOption("timed");
  await page
    .locator(".composition-stack-row", { hasText: "Fundo visual" })
    .first()
    .getByRole("option")
    .click();
  await page
    .getByRole("button", { name: "Aplicar fundo visual ao lote" })
    .click();
  await page
    .getByRole("status")
    .getByText("Fundo visual e cores aplicados ao lote.")
    .waitFor();
  await page.getByRole("button", { name: "Aplicar mídias ao lote" }).click();
  await page
    .getByRole("status")
    .getByText("Camadas desta faixa copiadas", { exact: false })
    .waitFor();
  await page.locator(".steps button").filter({ hasText: "Texto" }).click();
  const showYear = page.getByRole("button", { name: "Mostrar Ano" });
  if ((await showYear.count()) > 0) await showYear.click();
  await page.getByLabel("Fade-out de Música").check();
  await page
    .locator(".text-fade-controls", { hasText: "Fade-out de Música" })
    .getByLabel("Tipo de fade")
    .selectOption("timed");
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
    renderJobs.push(await waitForJob(apiUrl, jobId, 180_000));
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
  await downloadOutput(apiUrl, renderJobs[0].outputUrl, mp4Path);
  openWithFfmpeg(mp4Path);
  const finalFramePath = path.join(screenshotDir, "full-flow-final-frame.png");
  decodeFinalFrame(mp4Path, finalFramePath);
  assert.ok(
    (await fs.stat(finalFramePath)).size > 100,
    "decoded final frame should be non-empty",
  );
  for (const renderJob of renderJobs) {
    const sidecar = await downloadJsonOutput(apiUrl, renderJob.sidecarUrl);
    assert.equal(sidecar.export.visualSettings.rendererId, "audio-dark");
    assert.equal(sidecar.export.visualSettings.waveform.visible, true);
    assert.equal(sidecar.export.visualSettings.waveform.type, "spectrum-bars");
    assert.equal(
      sidecar.export.compositionSettings.textSettings.fields.year,
      true,
    );
    assert.equal(sidecar.export.metadata.year, "2026");
    const mediaLayers = sidecar.export.compositionSettings.mediaLayers ?? [];
    assert.equal(
      mediaLayers.length,
      2,
      "render sidecar should preserve manual layer plus cover layer",
    );
    assert.ok(
      mediaLayers.some((layer) => layer.kind === "image"),
      "render sidecar should preserve a manual image layer",
    );
    const fadedCover = mediaLayers.find((layer) => layer.coverFadeOut?.enabled);
    assert.equal(fadedCover?.coverFadeOut?.mode, "timed");
    assert.equal(fadedCover?.coverFadeOut?.startPercent, 10);
    assert.equal(fadedCover?.coverFadeOut?.durationSeconds, 2);
    const titleFade =
      sidecar.export.compositionSettings.textSettings.fieldStyles.title.fadeOut;
    assert.equal(titleFade.enabled, true);
    assert.equal(titleFade.mode, "timed");
    assert.equal(titleFade.startPercent, 10);
    assert.equal(titleFade.durationSeconds, 2);
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
  await Promise.allSettled(
    cleanupUrls
      .filter(Boolean)
      .map((outputUrl) => removeOutputUrl(root, outputUrl)),
  );
  await fs.rm(workDir, { recursive: true, force: true });
}
