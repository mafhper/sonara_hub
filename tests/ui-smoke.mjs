import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";
import { fetchJsonWithRetry } from "../shared/local-api.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshotDir = path.join(root, ".dev", "screenshots");
const assetDir = path.join(root, ".dev", "ui-smoke-assets");
await fs.mkdir(screenshotDir, { recursive: true });
await fs.mkdir(assetDir, { recursive: true });
const audioPath = path.join(assetDir, "ui-smoke.wav");
const variationAudioPath = path.join(assetDir, "ui-smoke-variation.wav");
const pngPath = path.join(assetDir, "layer.png");
const svgPath = path.join(assetDir, "layer.svg");
const videoPath = path.join(assetDir, "layer.webm");
await fs.writeFile(audioPath, makeWave());
await fs.writeFile(variationAudioPath, makeWave(330));
await fs.writeFile(
  pngPath,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR42mNk+M+ABzDhkQAP/wL+zKxQfAAAAABJRU5ErkJggg==",
    "base64",
  ),
);
await fs.writeFile(
  svgPath,
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" rx="18" fill="#bfd1d9"/><circle cx="160" cy="90" r="54" fill="#556b78"/></svg>',
);
const ffmpeg = spawnSync(
  ffmpegPath,
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x526878:s=160x90:d=1",
    "-c:v",
    "libvpx",
    "-pix_fmt",
    "yuv420p",
    videoPath,
  ],
  { windowsHide: true },
);
if (ffmpeg.status !== 0) throw new Error(ffmpeg.stderr.toString());
await cleanupSmokePresets();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await page.addInitScript(() =>
  window.localStorage.removeItem("sonara-hub-panel-widths"),
);
const errors = [];
const failedRequests = [];
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
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await page
    .locator('input[accept="audio/*"]')
    .first()
    .setInputFiles(audioPath);
  await page.getByText("ui-smoke").first().waitFor();
  await page.getByText("Biblioteca de áudio", { exact: true }).last().waitFor();
  await page.getByText("LUFS integrado").waitFor();
  await assertPortugueseLabels(page);
  await assertReadableType(page, [
    [".brand", 12],
    [".workspace-switch button", 12],
    [".track-context", 12],
    [".track-copy strong", 12],
    [".track-copy small", 10],
    [".audio-library-heading h1", 20],
    [".metric-strip dt", 10],
    [".metric-strip dd", 15],
    [".inspector-header strong", 15],
    [".inspector-group summary", 13],
    [".field input", 12],
    [".helper-copy", 12],
    [".transport", 12],
    [".transport-track strong", 12],
    [".transport-controls button", 12],
  ]);
  await assertPanelResize(page);
  await assertFocusVisible(
    page,
    page.getByRole("button", { name: "Estúdio visual" }),
  );
  await assertTrackSelectionIsNotColorOnly(page);
  await page.getByRole("button", { name: "Estúdio visual" }).click();

  const presetSelect = page.locator('select:has(option[value="vector-aura"])');
  await presetSelect.selectOption("vector-aura");
  await page.waitForTimeout(450);
  const centerPixel = await page
    .locator("canvas.scene-canvas")
    .evaluate((canvas) => {
      const context = canvas.getContext("2d");
      return Array.from(
        context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data,
      );
    });
  assert.ok(centerPixel.slice(0, 3).some((value) => value > 10));

  await page.getByText("Ajustes avançados").click();
  await page.getByText("Presença").waitFor();
  await assertPortugueseLabels(page);
  await page.getByRole("button", { name: "Tocar prévia" }).click();
  await page.waitForTimeout(350);
  assert.equal(
    await page.getByRole("button", { name: "Pausar prévia" }).count(),
    1,
  );
  await page.locator('input[aria-label="Posição da prévia"]').fill("0.5");

  await page
    .locator('input[type="file"][accept="image/*,video/*,.svg"]')
    .setInputFiles([pngPath, svgPath, videoPath]);
  await page.getByText("Camadas · 3/3").waitFor();
  await page.locator(".layer-row summary").first().click();
  await page.locator(".layer-row").first().getByText("Rotação").waitFor();
  await page
    .locator(".layer-row")
    .first()
    .getByText("Desfoque da sombra")
    .waitFor();
  await page.locator(".layer-row summary").last().click();
  await page.locator(".layer-row").last().getByText("Repetir video").waitFor();
  await page.getByRole("button", { name: "Remover camada" }).first().click();
  await page.getByRole("button", { name: "Desfazer" }).click();
  await page.getByText("Camadas · 3/3").waitFor();
  await page.getByText("Waveform", { exact: true }).click();
  await page.getByText("Mostrar waveform").click();
  const waveformSelect = page.locator(
    'select:has(option[value="radial-ring"])',
  );
  assert.equal(await waveformSelect.locator("option").count(), 5);
  for (const type of [
    "single-line",
    "filled-ribbon",
    "spectrum-bars",
    "radial-ring",
    "mirror-line",
  ]) {
    await waveformSelect.selectOption(type);
    await page.waitForTimeout(120);
  }

  await page.getByRole("button", { name: "Biblioteca de áudio" }).click();
  await page.getByRole("button", { name: "Lote" }).click();
  await page.getByText("Dados comuns do lote").waitFor();
  await assertPortugueseLabels(page);
  const batchToolbar = page.getByRole("group", {
    name: "Dados comuns do lote",
  });
  await batchToolbar.getByLabel("Artista principal").fill("Matheus Lima");
  await batchToolbar
    .getByLabel("Comentário ID3")
    .fill("Feito usando IA com curadoria humana.");
  await batchToolbar
    .getByRole("button", { name: "Aplicar aos selecionados" })
    .click();
  await page.getByText("apenas onde havia campos vazios").waitFor();
  await batchToolbar
    .getByRole("button", { name: "Sobrescrever informados" })
    .click();
  await batchToolbar
    .getByRole("button", { name: "Aplicar aos selecionados" })
    .click();
  await page.getByText("com sobrescrita dos campos informados").waitFor();
  assert.equal(await page.locator(".batch-group-row").count(), 1);
  await page.locator(".batch-group-row button").click();
  assert.equal(await page.locator(".batch-table tbody tr").count(), 1);
  await page.locator(".batch-group-row button").click();
  await page.getByRole("button", { name: "Limpar seleção" }).click();
  assert.equal(
    await page.locator('.batch-table input[type="checkbox"]:checked').count(),
    0,
  );
  await page.getByRole("button", { name: "Selecionar todos" }).click();
  assert.equal(
    await page.locator('.batch-table input[type="checkbox"]:checked').count(),
    1,
  );
  await page
    .locator(".batch-table tbody tr:not(.batch-group-row)")
    .first()
    .locator('input[aria-label="Titulo"]')
    .fill("Smoke Batch Title");
  assert.equal(
    await page
      .locator(".batch-table tbody tr:not(.batch-group-row)")
      .first()
      .locator('input[aria-label="Titulo"]')
      .inputValue(),
    "Smoke Batch Title",
  );
  assert.equal(
    await page.locator('input[type="file"][webkitdirectory]').count(),
    1,
  );
  await page.getByText("Processamento do lote").waitFor();
  await page.getByRole("button", { name: "Pausar fila" }).waitFor();
  await page.getByRole("button", { name: "Cancelar todos" }).waitFor();
  await assertReadableType(page, [
    [".batch-table", 12],
    [".batch-table th", 10],
    [".batch-table input", 12],
    [".batch-toolbar-head strong", 13],
    [".batch-mode-note", 12],
    [".batch-job-board header strong", 13],
    [".batch-job-actions button", 12],
  ]);
  await assertFocusVisible(
    page,
    page
      .locator(".batch-table tbody tr:not(.batch-group-row)")
      .first()
      .locator('input[aria-label="Titulo"]'),
  );
  await assertStatusIndicators(page);
  await page.screenshot({
    path: path.join(screenshotDir, "sonara-hub-audio-batch.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Estúdio visual" }).click();
  await page.locator(".steps button").filter({ hasText: "Exportar" }).click();
  await page.getByText("1 faixa selecionada", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Exportar lote" }).waitFor();
  await page.getByRole("button", { name: "Faixa única" }).click();
  await page.getByText("Resumo da exportação").waitFor();
  await assertPortugueseLabels(page);
  await page.locator(".steps button").filter({ hasText: "Visual" }).click();
  await page.getByRole("button", { name: "Recolher biblioteca" }).click();
  await page.getByRole("button", { name: "Recolher inspetor" }).click();
  await page.screenshot({
    path: path.join(screenshotDir, "sonara-hub-fullscreen.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Recolher biblioteca" }).click();
  await page.getByRole("button", { name: "Recolher inspetor" }).click();

  page.once("dialog", async (dialog) => dialog.accept("Aura smoke UI"));
  await page.getByRole("button", { name: "Duplicar" }).click();
  await page.locator('option:has-text("Aura smoke UI")').waitFor({
    state: "attached",
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('option:has-text("Aura smoke UI")').waitFor({
    state: "attached",
  });
  assert.equal(
    await page.locator('option:has-text("Aura smoke UI")').count(),
    1,
  );
  await page.getByText("Camadas · 3/3").waitFor();
  await page.screenshot({
    path: path.join(screenshotDir, "sonara-hub-studio.png"),
    fullPage: true,
  });
  await page.locator(".steps button").filter({ hasText: "Música" }).click();
  await page
    .locator(".inspector-scroll label.field", { hasText: "Versao" })
    .locator("input")
    .fill("Original smoke");
  await page.getByRole("button", { name: "Criar variacao" }).click();
  await page
    .locator(".inspector-scroll label.field", { hasText: "Versao" })
    .locator("input")
    .fill("Alternativa smoke");
  await page
    .locator('input[accept="audio/*"]:not([multiple])')
    .nth(1)
    .setInputFiles(variationAudioPath);
  await page.waitForTimeout(1_600);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page.locator(".track-row").count(),
    2,
    "variation with a replaced audio file should survive autosave",
  );
  await page.locator(".track-row").first().click();
  await page.getByRole("button", { name: "Proxima faixa" }).click();
  assert.match(
    (await page.locator(".track-row").nth(1).getAttribute("class")) ?? "",
    /selected/,
    "transport next button should select the next track",
  );
  await page.getByRole("button", { name: "Faixa anterior" }).click();
  assert.match(
    (await page.locator(".track-row").first().getAttribute("class")) ?? "",
    /selected/,
    "transport previous button should return to the first track",
  );
  await page.getByRole("button", { name: "Proxima faixa" }).click();
  assert.ok(
    ((await page.locator(".track-row.selected .track-copy").boundingBox())
      ?.width ?? 0) > 100,
    "single-track rows should reserve useful width for title and version",
  );
  await page
    .getByRole("button", { name: "Trocar áudio desta versão" })
    .waitFor();
  await page.setViewportSize({ width: 760, height: 1080 });
  await page.waitForTimeout(250);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "narrow layout should not create document-level horizontal overflow",
  );
  await page.screenshot({
    path: path.join(screenshotDir, "sonara-hub-narrow.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
} finally {
  await cleanupSmokePresets();
  await browser.close();
}

function makeWave(frequency = 220) {
  const sampleRate = 8000;
  const seconds = 2;
  const data = Buffer.alloc(sampleRate * seconds * 2);
  for (let index = 0; index < sampleRate * seconds; index += 1) {
    data.writeInt16LE(
      Math.sin((index / sampleRate) * Math.PI * 2 * frequency) * 12000,
      index * 2,
    );
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function cleanupSmokePresets() {
  const { presets } = await fetchJsonWithRetry(
    "http://127.0.0.1:4175/api/visual-presets",
    undefined,
    { attempts: 5, delayMs: 300 },
  );
  await Promise.all(
    presets
      .filter((preset) => preset.name === "Aura smoke UI")
      .map((preset) =>
        fetchJsonWithRetry(
          `http://127.0.0.1:4175/api/visual-presets/${preset.id}`,
          { method: "DELETE" },
          { attempts: 5, delayMs: 300 },
        ),
      ),
  );
}

async function assertReadableType(page, rules) {
  for (const [selector, minimum] of rules) {
    const size = await page
      .locator(selector)
      .first()
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      );
    assert.ok(
      size >= minimum,
      `${selector} should use at least ${minimum}px, got ${size}px`,
    );
  }
}

async function assertPortugueseLabels(page) {
  const issues = await page.evaluate(() => {
    const patterns = [
      "Biblioteca de audio",
      "Estudio visual",
      "Faixa unica",
      "Adicionar audio",
      "Trocar audio",
      "Artista do album",
      "Comentario ID3",
      "Ajustes avancados",
      "Aparencia",
      "Posicao",
      "Direcao",
      "Reacao",
      "Rotacao",
      "Presenca",
      "Respiracao",
      "Suavizacao",
      "Resolucao",
      "Publicacao",
      "Descricao",
      "exportacao",
      "Renderizacao",
      "Alteracoes",
      "Fluxo liquido",
      "Revisao",
      "Genero",
      "tecnico",
      "tecnica",
      "Musica",
      "copia",
      "copias",
      "previa",
    ];
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    return [
      ...document.querySelectorAll(
        "button,label,summary,h1,h2,h3,span,p,th,dt,strong,small,option",
      ),
    ]
      .filter(isVisible)
      .flatMap((element) => {
        const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
        return patterns
          .filter((pattern) => text.includes(pattern))
          .map((pattern) => ({ pattern, text }));
      });
  });
  assert.deepEqual(issues, []);
}

async function assertFocusVisible(page, locator) {
  await locator.focus();
  const focus = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineStyle: style.outlineStyle,
      boxShadow: style.boxShadow,
    };
  });
  assert.ok(
    focus.outlineWidth >= 2 || focus.boxShadow !== "none",
    `focused control should have a visible outline or ring, got ${JSON.stringify(focus)}`,
  );
}

async function assertPanelResize(page) {
  const libraryPanel = page.locator(".library-panel");
  const libraryHandle = page.getByRole("button", {
    name: "Redimensionar biblioteca",
  });
  const libraryBefore = await libraryPanel.boundingBox();
  const libraryBox = await libraryHandle.boundingBox();
  assert.ok(
    libraryBefore && libraryBox,
    "library panel and resize handle should be visible",
  );
  await page.mouse.move(
    libraryBox.x + libraryBox.width / 2,
    libraryBox.y + libraryBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    libraryBox.x + libraryBox.width / 2 + 72,
    libraryBox.y + libraryBox.height / 2,
  );
  await page.mouse.up();
  const libraryAfter = await libraryPanel.boundingBox();
  assert.ok(
    libraryAfter,
    "library panel should still be measurable after resize",
  );
  assert.ok(
    libraryAfter.width > libraryBefore.width + 32 && libraryAfter.width <= 380,
    `library panel should resize within bounds, before=${libraryBefore.width}, after=${libraryAfter.width}`,
  );

  const inspectorPanel = page.locator(".inspector-panel");
  const inspectorHandle = page.getByRole("button", {
    name: "Redimensionar inspetor",
  });
  const inspectorBefore = await inspectorPanel.boundingBox();
  const inspectorBox = await inspectorHandle.boundingBox();
  assert.ok(
    inspectorBefore && inspectorBox,
    "inspector panel and resize handle should be visible",
  );
  await page.mouse.move(
    inspectorBox.x + inspectorBox.width / 2,
    inspectorBox.y + inspectorBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    inspectorBox.x + inspectorBox.width / 2 - 72,
    inspectorBox.y + inspectorBox.height / 2,
  );
  await page.mouse.up();
  const inspectorAfter = await inspectorPanel.boundingBox();
  assert.ok(
    inspectorAfter,
    "inspector panel should still be measurable after resize",
  );
  assert.ok(
    inspectorAfter.width > inspectorBefore.width + 32 &&
      inspectorAfter.width <= 620,
    `inspector panel should resize within bounds, before=${inspectorBefore.width}, after=${inspectorAfter.width}`,
  );
}

async function assertTrackSelectionIsNotColorOnly(page) {
  const selected = await page
    .locator(".track-row.selected")
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderLeftWidth: Number.parseFloat(style.borderLeftWidth),
        backgroundColor: style.backgroundColor,
      };
    });
  assert.ok(selected.borderLeftWidth >= 3);
  assert.notEqual(selected.backgroundColor, "rgba(0, 0, 0, 0)");
}

async function assertStatusIndicators(page) {
  const indicators = await page.evaluate(() => {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="batch-job-row done"><span></span></div>
      <div class="batch-job-row error"><span></span></div>
      <div class="batch-job-row canceled"><span></span></div>
      <span class="quality-badge safe">Seguro</span>
      <span class="quality-badge reduced-headroom">Margem reduzida</span>
      <span class="quality-badge overload">Sobrecarga</span>
    `;
    document.body.append(host);
    const rows = [...host.querySelectorAll(".batch-job-row")].map((element) => {
      const style = getComputedStyle(element);
      return Number.parseFloat(style.borderLeftWidth);
    });
    const badges = [...host.querySelectorAll(".quality-badge")].map(
      (element) => getComputedStyle(element, "::before").content,
    );
    host.remove();
    return { rows, badges };
  });
  assert.ok(indicators.rows.every((width) => width >= 4));
  assert.deepEqual(indicators.badges, ['"✓"', '"!"', '"×"']);
}
