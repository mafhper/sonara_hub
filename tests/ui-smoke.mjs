import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import NodeID3 from "node-id3";
import { chromium } from "playwright";
import { fetchJsonWithRetry } from "../shared/local-api.mjs";
import { publicationAssetPresets } from "../shared/publication-assets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientUrl = process.env.SONARA_CLIENT_URL ?? "http://127.0.0.1:5173";
const screenshotDir = path.join(root, ".dev", "screenshots");
const assetDir = path.join(root, ".dev", "ui-smoke-assets");
const publicationClipPresetCount = publicationAssetPresets.filter(
  (preset) => preset.kind === "clip",
).length;
await fs.mkdir(screenshotDir, { recursive: true });
await fs.mkdir(assetDir, { recursive: true });
const audioPath = path.join(assetDir, "ui-smoke.wav");
const coveredAudioPath = path.join(assetDir, "ui-smoke-covered.mp3");
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
const coveredAudio = spawnSync(
  ffmpegPath,
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:duration=2",
    "-q:a",
    "2",
    coveredAudioPath,
  ],
  { windowsHide: true },
);
if (coveredAudio.status !== 0) throw new Error(coveredAudio.stderr.toString());
if (
  !NodeID3.write(
    {
      artist: "Smoke Artist",
      image: pngPath,
      title: "ui-smoke",
      trackNumber: "7/9",
    },
    coveredAudioPath,
  )
) {
  throw new Error("Could not create APIC smoke fixture.");
}
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
await assertArtworkPreviewApi(audioPath, coveredAudioPath);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await page.addInitScript(() => {
  window.localStorage.removeItem("sonara-hub-panel-widths");
  window.localStorage.removeItem("sonara-hub-podcast-enabled");
});
const errors = [];
const failedRequests = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("requestfailed", (request) => {
  const failureText = request.failure()?.errorText ?? "";
  if (failureText === "net::ERR_ABORTED" && isBenignAbortedRequest(request)) {
    return;
  }
  failedRequests.push(`${request.method()} ${request.url()} ${failureText}`);
});

try {
  await page.goto(clientUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".studio-shell").waitFor();
  await assertLocalSettings(page);
  await page
    .locator('input[accept="audio/*"]')
    .first()
    .setInputFiles(coveredAudioPath);
  await page.getByText("ui-smoke").first().waitFor();
  await page.locator(".transport-artwork-button img").waitFor();
  await page
    .locator('input[type="file"][accept="image/*,.svg"]')
    .setInputFiles(pngPath);
  await page.locator(".transport-artwork").getByText("Planejada").waitFor();
  await page.getByRole("button", { name: "Abrir ajustes de capa" }).click();
  await page.getByText("Capa e série visual", { exact: true }).waitFor();
  await page
    .locator(".artwork-canvas")
    .locator(".cover-series-overlay")
    .first()
    .waitFor();
  assert.equal(
    await page.locator(".transport-artwork-actions button").count(),
    1,
    "transport artwork popover should expose a single cover action",
  );
  await page.getByRole("button", { name: "Ver arte base" }).click();
  await page.getByRole("button", { name: "Ver com série visual" }).waitFor();
  await page
    .locator(".stage-view-switch")
    .getByRole("button", { name: "Editar" })
    .click();
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
    [".audio-inspector-tabbar button", 10],
    [".transport", 12],
    [".transport-track strong", 12],
    [".transport-controls button", 12],
  ]);
  await page.getByRole("tab", { name: "Qualidade" }).click();
  await page.locator(".quality-callout, .helper-copy").first().waitFor();
  await assertReadableType(page, [[".quality-callout, .helper-copy", 12]]);
  await assertPanelResize(page);
  await assertFloatingPanelFallback(page);
  await ensurePanelOpen(page, "inspector");
  await assertFocusVisible(
    page,
    page.getByRole("button", { name: "Estúdio visual" }),
  );
  await assertTrackSelectionIsNotColorOnly(page);
  await assertButtonAffordance(page);
  await ensurePanelsClosed(page);
  await page
    .locator(".stage-view-switch")
    .getByRole("button", { name: "Catálogo" })
    .click();
  await page.getByText("Catálogo planejado", { exact: true }).waitFor();
  await page
    .locator(".catalog-tag", { hasText: "Faixa" })
    .locator(".catalog-tag-value", { hasText: "7/9" })
    .first()
    .waitFor();
  await page.getByRole("button", { name: /^Abrir Capas de / }).click();
  await page.getByText("Capa e série visual", { exact: true }).waitFor();
  await page.getByText("Série numérica", { exact: false }).waitFor();
  await page
    .locator(".artwork-canvas")
    .locator(".cover-series-overlay")
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Trocar imagem" }).waitFor();
  await page.getByRole("button", { name: "Estúdio visual" }).click();
  await ensurePanelOpen(page, "inspector");

  const presetSelect = page.locator('select:has(option[value="vector-aura"])');
  assert.equal(
    await presetSelect.locator('option[value="playful-shapes"]').count(),
    1,
  );
  assert.equal(
    await presetSelect.locator('option[value="color-mesh"]').count(),
    1,
  );
  assert.equal(
    await presetSelect.locator('option[value="piano-ribbons"]').count(),
    1,
  );
  for (const cloudPresetId of [
    "volumetric-clouds-dawn",
    "volumetric-clouds-noon",
    "volumetric-clouds-sunset",
    "volumetric-clouds-dusk",
    "volumetric-clouds-midnight",
  ]) {
    assert.equal(
      await presetSelect.locator(`option[value="${cloudPresetId}"]`).count(),
      1,
      `${cloudPresetId} should be available in the atmosphere picker`,
    );
  }
  await presetSelect.selectOption("playful-shapes");
  await page.getByText("Conteúdo lúdico", { exact: true }).waitFor();
  await page.getByText("Retângulos", { exact: true }).waitFor();
  await page
    .locator(".inspector-scroll label.field", {
      hasText: "Emojis personalizados",
    })
    .locator("input")
    .fill("🎈 🎵");
  await page
    .locator('select:has(option[value="soft-rhythm"])')
    .selectOption("play");
  await page.getByText("PALETAS", { exact: true }).waitFor();
  assert.equal(await page.locator(".palette-option-list button").count(), 4);
  await page.locator(".palette-option-list button").nth(1).click();
  await presetSelect.selectOption("volumetric-clouds-sunset");
  await page.getByText("Foco solar", { exact: true }).click();
  await page
    .locator(".inspector-group", { hasText: "Foco solar" })
    .locator('input[type="checkbox"]')
    .check();
  await page.getByText("Intensidade solar").waitFor();
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

  await page.getByText("Controles", { exact: true }).waitFor();
  await page.getByText("Presença").waitFor();
  await page.getByText("Escurecimento do fundo", { exact: true }).waitFor();
  assert.equal(
    await page
      .locator(".stack-detail")
      .getByText("Intensidade", { exact: true })
      .count(),
    0,
  );
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
  await page.getByText(/Pilha visual · \d+/).waitFor();
  const imageStackRow = page
    .locator(".composition-stack-row", { hasText: "layer.png" })
    .first();
  await imageStackRow.getByRole("option").click();
  await page.locator(".stack-detail").getByText("Rotação").waitFor();
  await page.locator(".stack-detail").getByText("Desfoque da sombra").waitFor();
  const videoStackRow = page
    .locator(".composition-stack-row", { hasText: "layer.webm" })
    .first();
  await videoStackRow.getByRole("option").click();
  await page.locator(".stack-detail").getByText("Repetir vídeo").waitFor();
  await imageStackRow
    .getByRole("button", { name: "Remover layer.png" })
    .click();
  await page.getByRole("button", { name: "Desfazer" }).click();
  await page
    .locator(".composition-stack-row", { hasText: "layer.png" })
    .waitFor();
  await page.locator(".stack-add-menu > summary").click();
  await page.locator(".cover-layer-apply select").selectOption("right");
  await page
    .locator(".cover-layer-apply")
    .getByRole("button", { name: "Aplicar capa" })
    .click();
  await page
    .locator(".composition-stack-label", { hasText: "Capa - Direita" })
    .waitFor();
  const coverStackRow = page
    .locator(".composition-stack-row", { hasText: "Capa - Direita" })
    .first();
  await coverStackRow
    .getByRole("button", { name: "Ocultar Capa - Direita" })
    .click();
  await coverStackRow
    .getByRole("button", { name: "Mostrar Capa - Direita" })
    .waitFor();
  assert.equal(
    await page
      .locator(".composition-stack-row", { hasText: "Capa - Direita" })
      .count(),
    1,
    "hidden composition media layer should stay in the stack",
  );
  await coverStackRow
    .getByRole("button", { name: "Mostrar Capa - Direita" })
    .click();
  await coverStackRow
    .getByRole("button", { name: "Ocultar Capa - Direita" })
    .waitFor();
  await coverStackRow.getByRole("option").click();
  const coverLayer = page.locator(".stack-detail", {
    hasText: "Capa - Direita",
  });
  assert.equal(
    await page.getByLabel("Fade-out da capa").count(),
    1,
    "cover fade-out should be configured only on the cover layer",
  );
  await coverLayer.getByLabel("Fade-out da capa").check();
  await coverLayer.getByText("Duração do fade").waitFor();
  await coverLayer.getByLabel("Tipo de fade").selectOption("timed");
  await coverLayer.getByText("Começa em").waitFor();
  await coverLayer.getByLabel("Duração", { exact: true }).waitFor();
  assert.equal(
    await page.locator(".composition-stack-row", { hasText: "Mídia" }).count(),
    3,
    "applying a cover preset should preserve the three-layer limit while keeping the cover",
  );
  await page.getByRole("button", { exact: true, name: "Texto" }).click();
  await page
    .getByText("Campos · ordem, visibilidade e estilo individual")
    .waitFor();
  await page.getByLabel("Fade-out de Música").check();
  const musicTextFade = page.locator(".text-fade-controls", {
    hasText: "Fade-out de Música",
  });
  await musicTextFade.getByText("Duração do fade").waitFor();
  await musicTextFade.getByLabel("Tipo de fade").selectOption("timed");
  await musicTextFade.getByText("Começa em").waitFor();
  await musicTextFade.getByLabel("Duração", { exact: true }).waitFor();
  await page.getByRole("button", { exact: true, name: "Visual" }).click();
  const waveformStackRow = page
    .locator(".composition-stack-row", { hasText: "Waveform" })
    .first();
  await waveformStackRow
    .getByRole("button", { name: "Mostrar Waveform" })
    .click();
  await waveformStackRow
    .getByRole("button", { name: "Ocultar Waveform" })
    .waitFor();
  await waveformStackRow
    .getByRole("button", { name: "Ocultar Waveform" })
    .click();
  await waveformStackRow
    .getByRole("button", { name: "Mostrar Waveform" })
    .waitFor();
  await waveformStackRow
    .getByRole("button", { name: "Mostrar Waveform" })
    .click();
  await waveformStackRow.getByRole("option").click();
  const waveformDetail = page.locator(".stack-detail", {
    hasText: "Waveform",
  });
  const waveformSelect = waveformDetail.locator(
    'select:has(option[value="radial-ring"])',
  );
  assert.equal(await waveformSelect.locator("option").count(), 5);
  await waveformDetail.getByRole("button", { name: "Visor âmbar" }).click();
  assert.equal(await waveformSelect.inputValue(), "spectrum-bars");
  await waveformDetail.getByRole("button", { name: "Anel editorial" }).click();
  assert.equal(await waveformSelect.inputValue(), "radial-ring");
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

  await ensurePanelsClosed(page);
  await page.getByRole("button", { name: "Biblioteca de áudio" }).click();
  await ensurePanelOpen(page, "library");
  await page
    .locator('input[accept="audio/*"]')
    .first()
    .setInputFiles(variationAudioPath);
  await page.locator(".track-row", { hasText: "ui-smoke-variation" }).waitFor();
  await ensureBatchMode(page);
  await ensurePanelsClosed(page);
  await page
    .locator(".stage-view-switch")
    .getByRole("button", { name: "Editar" })
    .click();
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
  await page
    .getByRole("status")
    .getByText("apenas onde havia campos vazios", { exact: false })
    .waitFor();
  await batchToolbar
    .getByRole("button", { name: "Sobrescrever informados" })
    .click();
  await batchToolbar
    .getByRole("button", { name: "Aplicar aos selecionados" })
    .click();
  await page
    .getByRole("status")
    .getByText("com sobrescrita dos campos informados", { exact: false })
    .waitFor();
  assert.equal(
    await batchToolbar
      .getByRole("button", { name: "Processar selecionados" })
      .count(),
    0,
  );
  await ensurePanelOpen(page, "inspector");
  await page.getByRole("tab", { name: "Qualidade" }).click();
  await page
    .locator(".inspector-panel")
    .getByRole("button", { name: "Processar selecionados" })
    .waitFor();
  await ensurePanelsClosed(page);
  assert.equal(await page.locator(".batch-group-row").count(), 1);
  assert.equal(await page.locator(".batch-main-row").count(), 2);
  await assertBatchDragReordersTracks(page);
  const batchTitleInput = await editableBatchTitleInput(page);
  await batchTitleInput.fill("Smoke Batch Title");
  assert.equal(await batchTitleInput.inputValue(), "Smoke Batch Title");
  await assertNoMainStageHorizontalOverflow(page);
  await page
    .getByRole("button", { name: "Expandir detalhes de Smoke Batch Title" })
    .click();
  await page.getByText("Arquivo tratado", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Catálogo" }).click();
  await page.getByText("Catálogo planejado").waitFor();
  await page
    .locator(".catalog-track-list")
    .getByText("Smoke Batch Title", { exact: true })
    .waitFor();
  await page
    .locator(".catalog-album", { hasText: "Smoke Batch Title" })
    .locator(".catalog-artwork-button")
    .first()
    .click();
  const artworkWorkspace = page.locator(".artwork-review");
  await artworkWorkspace
    .getByText("Série numérica", { exact: false })
    .waitFor();
  await artworkWorkspace.getByText("Estilo afeta", { exact: true }).waitFor();
  await assertCatalogArtworkLayout(page);
  await artworkWorkspace.getByRole("tab", { name: "Único" }).click();
  await artworkWorkspace
    .getByText("estilo exclusivo", { exact: false })
    .waitFor();
  assert.equal(
    await artworkWorkspace.getByRole("tab", { name: "Texto aberto" }).count(),
    0,
    "cover-series style scope should no longer target every text field from an opened row",
  );
  assert.equal(
    await artworkWorkspace.getByRole("tab", { name: "Todos" }).count(),
    0,
    "cover-series style scope should be track/series, not opened field/all fields",
  );
  await artworkWorkspace.getByRole("tab", { name: "Série" }).click();
  const overlay = artworkWorkspace
    .locator(".artwork-canvas .cover-series-overlay")
    .first();
  await overlay.waitFor();
  await artworkWorkspace
    .locator('select:has(option[value="bottom-left"])')
    .selectOption("bottom-left");
  await page.waitForFunction(
    () =>
      document
        .querySelector(".artwork-canvas .cover-series-overlay text")
        ?.getAttribute("text-anchor") === "start",
  );
  const initialNumberY = await overlay
    .locator("text")
    .first()
    .getAttribute("y");
  await artworkWorkspace
    .getByLabel("Vertical", { exact: true })
    .first()
    .evaluate((input) => {
      const nextValue = input.value === "72" ? "61" : "72";
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(input, nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await page.waitForFunction(
    ({ previous }) =>
      document
        .querySelector(".artwork-canvas .cover-series-overlay text")
        ?.getAttribute("y") !== previous,
    { previous: initialNumberY },
  );
  await page.screenshot({
    path: path.join(screenshotDir, "sonara-hub-catalog-artwork-editor.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Estúdio visual" }).click();
  await page.getByRole("button", { name: "Visualizar" }).click();
  await page.getByText("Grade de publicação").waitFor();
  await page.locator(".composition-thumbnail").first().waitFor();
  await page
    .locator(".youtube-card.selected .thumbnail-mode-switch")
    .getByRole("button", { name: "Capa" })
    .click();
  await page.locator(".youtube-thumbnail .artwork-frame").waitFor();
  assert.equal(
    await page
      .locator(".youtube-card.selected .thumbnail-mode-switch button")
      .count(),
    2,
    "the selected video should expose one compact Frame/Capa selector",
  );
  assert.equal(
    await page
      .locator(".youtube-card.selected .video-card-options button")
      .count(),
    1,
    "the selected video should not repeat Frame/Capa actions",
  );
  await page.getByRole("button", { name: "Ajustar visual" }).click();
  await page
    .locator(".steps button.active")
    .filter({ hasText: "Visual" })
    .waitFor();
  await ensurePanelOpen(page, "inspector");
  await page.locator(".stack-add-menu > summary").click();
  await page.locator(".cover-layer-apply select").selectOption("right");
  await page.getByRole("button", { name: "Aplicar capa ao lote" }).click();
  await page
    .locator(".inspector-panel .composition-stack-row", { hasText: "Capa" })
    .first()
    .waitFor();
  await ensurePanelsClosed(page);
  await page.getByRole("button", { name: "Biblioteca de áudio" }).click();
  await page
    .locator(".stage-view-switch")
    .getByRole("button", { name: "Editar", exact: true })
    .click();
  assert.equal(
    await page.locator('input[type="file"][webkitdirectory]').count(),
    1,
  );
  await page.getByText("Processamento do lote").waitFor();
  await page.getByRole("button", { name: "Pausar fila" }).waitFor();
  await page.getByRole("button", { name: "Cancelar todos" }).waitFor();
  await assertMainStageSectionSurfaces(page);
  await assertReadableType(page, [
    [".batch-table", 12],
    [".batch-table th", 10],
    [".batch-table input", 12],
    [".batch-toolbar-head strong", 13],
    [".batch-mode-note", 12],
    [".batch-job-board header strong", 13],
    [".batch-job-actions button", 12],
  ]);
  await ensurePanelOpen(page, "inspector");
  await assertInspectorControlSpacing(page);
  await ensurePanelsClosed(page);
  await assertFocusVisible(page, batchTitleInput);
  await assertStatusIndicators(page);
  await page.screenshot({
    path: path.join(screenshotDir, "sonara-hub-audio-batch.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Estúdio visual" }).click();
  await ensurePanelOpen(page, "inspector");
  await page
    .getByLabel("Etapas do projeto")
    .getByRole("button", { name: "Visualizar" })
    .click();
  await page.getByText("Grade de publicação").waitFor();
  await page.getByRole("button", { name: "Divulgação", exact: true }).click();
  await page.getByText("Assets de publicação").waitFor();
  await page.getByLabel("Formato base").selectOption("clip-vertical");
  await ensurePanelsClosed(page);
  const publicationFormatGroups = page.locator(".publication-format-group");
  assert.ok(
    (await publicationFormatGroups.count()) >= 5,
    "publication presets should be grouped into platform accordions",
  );
  const defaultFormatGroup = publicationFormatGroups.filter({
    has: page.locator(".publication-format-group-label", {
      hasText: "Padrões",
    }),
  });
  assert.equal(
    await defaultFormatGroup.evaluate((node) => node.open),
    true,
    "focused publication format group should be open",
  );
  await defaultFormatGroup
    .locator(".publication-format-row", { hasText: "Clip vertical" })
    .waitFor();
  const instagramFormatGroup = publicationFormatGroups.filter({
    has: page.locator(".publication-format-group-label", {
      hasText: "Instagram",
    }),
  });
  await instagramFormatGroup.locator("summary").click();
  await instagramFormatGroup
    .locator(".publication-format-row", { hasText: "Instagram story clip" })
    .waitFor();
  await ensurePanelOpen(page, "inspector");
  await page
    .locator(".publication-preview-panel .overline")
    .getByText("Prévia real · Clip vertical", { exact: true })
    .waitFor();
  await page.getByText("Ajustes deste asset").waitFor();
  await page.getByRole("spinbutton", { name: "Início deste asset" }).fill("10");
  await page.getByRole("spinbutton", { name: "Duração deste asset" }).fill("2");
  await page
    .locator(".publication-overview strong")
    .getByText("10s · 2s", { exact: true })
    .waitFor();
  await page.getByLabel("Letra deste asset").selectOption("excerpt");
  await page
    .getByLabel("Trecho editável da letra")
    .fill("[Verso]\nQuando o relógio cansa\n[Refrão]\nA estrada ainda canta");
  await page.getByLabel("Ocultar tags entre [ ]").check();
  await page
    .getByRole("spinbutton", { name: "Espaçamento da letra valor" })
    .fill("160");
  await page
    .locator(".publication-preview-settings")
    .getByText("trecho de letra")
    .waitFor();
  const lyricsPreview = page.locator(".publication-lyrics-preview");
  await lyricsPreview.getByText("A estrada ainda canta").waitFor();
  assert.equal((await lyricsPreview.textContent()).includes("[Refrão]"), false);
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Espaçamento da letra valor" })
      .inputValue(),
    "160",
  );
  await page.getByLabel("Disparar").selectOption("group");
  await page
    .locator(".publication-overview strong")
    .getByText(`2 faixas × ${publicationClipPresetCount} formatos`, {
      exact: true,
    })
    .waitFor();
  await page.getByLabel("Disparar").selectOption("all");
  await page
    .locator(".publication-overview strong")
    .getByText(`2 faixas × ${publicationAssetPresets.length} formatos`, {
      exact: true,
    })
    .waitFor();
  await page.getByLabel("Formato base").selectOption("instagram-story-clip");
  await page
    .getByText("Limites do formato: até 15s · H.264/AAC · 9:16.", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("spinbutton", { name: "Duração deste asset" })
    .fill("120");
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Duração deste asset" })
      .inputValue(),
    "15",
  );
  await page
    .getByLabel("Formato base")
    .selectOption("digital-booklet-editorial");
  await page
    .locator(".publication-preview-panel .overline")
    .getByText("Prévia real · Encarte digital editorial", { exact: true })
    .waitFor();
  await page.getByLabel("Tema do encarte").selectOption("contrast");
  await page
    .locator(".publication-booklet-preview")
    .getByText("Alto contraste", { exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".publication-text-override").count(),
    0,
    "booklet preset should hide canvas text override controls",
  );
  await page
    .getByLabel("Etapas do projeto")
    .getByRole("button", { name: "Visualizar" })
    .click();
  await page.getByRole("button", { name: "Revisar lote" }).click();
  await page.getByText("2 faixas selecionadas", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Exportar lote" }).waitFor();
  await page.getByRole("button", { name: "Exportar Divulgação" }).click();
  await page
    .getByRole("heading", { name: "Fila de exportação", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".video-export-stage .batch-job-board").count(),
    2,
    "export workspace should show video and publication asset queues",
  );
  assert.equal(
    await page.locator(".video-export-stage .export-dashboard-metric").count(),
    5,
    "visual export workspace should show consolidated dashboard metrics",
  );
  await page.getByRole("button", { name: "Biblioteca de áudio" }).click();
  await page.getByRole("button", { name: "Exportar Áudio" }).click();
  await page
    .getByRole("heading", { name: "Fila de áudio tratado", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".audio-export-stage .export-dashboard-metric").count(),
    4,
    "audio export workspace should show consolidated dashboard metrics",
  );
  await page.getByRole("button", { name: "Estúdio visual" }).click();
  await page.getByRole("button", { name: "Exportar Divulgação" }).click();
  await ensurePanelOpen(page, "library");
  await ensureSingleMode(page);
  await ensurePanelOpen(page, "inspector");
  await page.getByText("Resumo da exportação").waitFor();
  await assertPortugueseLabels(page);
  await page
    .getByLabel("Etapas do projeto")
    .getByRole("button", { name: "Visual", exact: true })
    .click();
  await ensurePanelsClosed(page);
  await page.screenshot({
    path: path.join(screenshotDir, "sonara-hub-fullscreen.png"),
    fullPage: true,
  });
  await ensurePanelOpen(page, "inspector");

  await page
    .locator(".composition-stack-row", { hasText: "Fundo visual" })
    .first()
    .getByRole("option")
    .click();
  await page.getByRole("button", { name: "Duplicar" }).click();
  const duplicatePresetDialog = page.getByRole("dialog", {
    name: "Duplicar preset",
  });
  await duplicatePresetDialog
    .getByLabel("Nome do preset personalizado")
    .fill("Aura smoke UI");
  await duplicatePresetDialog
    .getByRole("button", { name: "Duplicar preset" })
    .click();
  await page.locator('option:has-text("Aura smoke UI")').waitFor({
    state: "attached",
  });
  const presetPayload = await fetchJsonWithRetry(
    "http://127.0.0.1:4175/api/visual-presets",
    undefined,
    { attempts: 5, delayMs: 300 },
  );
  assert.equal(
    presetPayload.presets.filter((preset) => preset.name === "Aura smoke UI")
      .length,
    1,
  );
  await page.getByText(/Pilha visual · \d+/).waitFor();
  await page.screenshot({
    path: path.join(screenshotDir, "sonara-hub-studio.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Biblioteca de áudio" }).click();
  await page
    .locator(".stage-view-switch")
    .getByRole("button", { name: "Editar", exact: true })
    .click();
  await ensurePanelOpen(page, "inspector");
  await page.getByRole("tab", { name: "Dados" }).click();
  await page
    .locator(".inspector-scroll label.field", { hasText: "Versão" })
    .locator("input")
    .fill("Original smoke");
  await page.getByRole("button", { name: "Criar variação" }).click();
  await page
    .locator(".inspector-scroll label.field", { hasText: "Versão" })
    .locator("input")
    .fill("Alternativa smoke");
  await page
    .locator('input[accept="audio/*"]:not([multiple])')
    .nth(1)
    .setInputFiles(variationAudioPath);
  await page.waitForTimeout(1_600);
  await ensurePanelOpen(page, "library");
  await page.locator(".track-row").first().waitFor();
  assert.ok(
    (await page.locator(".track-row").count()) >= 3,
    "variation with a replaced audio file should stay in the active queue",
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
  await restoreDockedPanels(page);
  await page.getByRole("button", { name: "Biblioteca de áudio" }).click();
  await ensurePanelOpen(page, "library");
  await ensurePanelOpen(page, "inspector");
  await ensureBatchMode(page);
  await assertCompactAccordionRows(page);
  await page.getByRole("button", { name: "Estúdio visual" }).click();
  await page.setViewportSize({ width: 760, height: 1080 });
  await page.waitForTimeout(250);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "narrow layout should not create document-level horizontal overflow",
  );
  await assertNoMainStageHorizontalOverflow(page);
  await page.screenshot({
    path: path.join(screenshotDir, "sonara-hub-narrow.png"),
    fullPage: true,
  });
  await assertTrackCanBeRemovedFromQueue(page);
  await assertBenchmarkCenterNavigation(page);
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
} finally {
  await cleanupSmokePresets();
  await browser.close();
}

function isBenignAbortedRequest(request) {
  if (request.method() !== "GET") return false;
  const url = new URL(request.url());
  return (
    url.pathname.startsWith("/api/audio/artwork-preview/") ||
    url.pathname === "/api/project" ||
    url.pathname === "/api/visual-presets" ||
    url.pathname === "/api/jobs"
  );
}

async function assertCatalogArtworkLayout(page) {
  const layout = await page.evaluate(() => {
    const preview = document.querySelector(".artwork-canvas");
    const gallery = document.querySelector(".artwork-album-strip");
    const previewBox = preview?.getBoundingClientRect();
    const galleryBox = gallery?.getBoundingClientRect();
    return {
      gap:
        previewBox && galleryBox
          ? Math.round(galleryBox.top - previewBox.bottom)
          : null,
      previewHeight: previewBox?.height ?? 0,
    };
  });
  assert.ok(
    layout.previewHeight >= 220,
    `artwork canvas should reserve visible square height, got ${layout.previewHeight}`,
  );
  assert.ok(
    layout.gap !== null && layout.gap >= 8,
    `album cover gallery should start below the preview, got gap=${layout.gap}`,
  );
}

async function assertBatchDragReordersTracks(page) {
  const rows = page.locator(".batch-main-row");
  const firstTitle = await rows
    .nth(0)
    .locator(".batch-col-title input")
    .inputValue();
  const secondTitle = await rows
    .nth(1)
    .locator(".batch-col-title input")
    .inputValue();
  assert.notEqual(firstTitle, secondTitle);
  await page.evaluate(
    ({ firstTitle, secondTitle }) => {
      const rows = [...document.querySelectorAll(".batch-main-row")];
      const sourceRow = rows.find(
        (row) =>
          row.querySelector(".batch-col-title input")?.value === secondTitle,
      );
      const targetRow = rows.find(
        (row) =>
          row.querySelector(".batch-col-title input")?.value === firstTitle,
      );
      const sourceHandle = sourceRow?.querySelector(".batch-row-drag");
      if (!sourceHandle || !targetRow) {
        throw new Error("Batch drag handles were not rendered.");
      }
      const dataTransfer = new DataTransfer();
      sourceHandle.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      targetRow.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      targetRow.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      sourceHandle.dispatchEvent(
        new DragEvent("dragend", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
    },
    { firstTitle, secondTitle },
  );
  await page.waitForFunction(
    (expectedTitle) =>
      document.querySelector(".batch-main-row .batch-col-title input")
        ?.value === expectedTitle,
    secondTitle,
  );
  const trackNumbers = await page
    .locator(".batch-main-row .batch-col-track input")
    .evaluateAll((inputs) =>
      inputs.map((input) => /** @type {HTMLInputElement} */ (input).value),
    );
  assert.deepEqual(trackNumbers.slice(0, 2), ["1", "2"]);
}

async function assertTrackCanBeRemovedFromQueue(page) {
  await page.setViewportSize({ width: 1440, height: 950 });
  await ensurePanelOpen(page, "library");
  const before = await page.locator(".track-row").count();
  assert.ok(before >= 2, "remove-from-queue smoke needs at least two tracks");
  await page
    .getByRole("button", { name: /^Remover .* da fila$/ })
    .last()
    .click();
  await page.waitForFunction(
    (expected) => document.querySelectorAll(".track-row").length === expected,
    before - 1,
  );
}

async function assertBenchmarkCenterNavigation(page) {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(clientUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".studio-shell").waitFor();
  await page.getByRole("button", { name: "Benchmarks" }).click();
  await page.waitForURL("**/benchmarks");
  await page.getByRole("heading", { name: "Benchmark Center" }).waitFor();
  await page.getByText("Executar benchmarks").waitFor();
  await page.getByRole("button", { name: "Iniciar" }).waitFor();
  await page.getByRole("button", { name: "Render" }).waitFor();
  await page.getByRole("button", { name: "Release Gate" }).click();
  await page.getByText("Sonara Performance Score").waitFor();
  await page.getByRole("button", { name: "Baseline" }).click();
  await page.getByText("Como funciona a baseline").waitFor();
  await assertBenchmarkBaselineLayout(page);
  await page.getByRole("button", { name: "Retenção" }).click();
  await page.getByText("Retenção de dados").waitFor();
  await page.getByText("Limpeza segura", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Histórico" }).click();
  await page.getByText("Histórico completo").waitFor();
  await page.getByText("Resident Set Size").waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "benchmark center should not create document-level horizontal overflow",
  );
}

async function assertBenchmarkBaselineLayout(page) {
  const result = await page.evaluate(() => {
    const panel = document.querySelector(".bench-baseline-panel");
    const layout = panel?.querySelector(".bench-baseline-layout");
    const control = panel?.querySelector(".bench-baseline-control");
    const grid = panel?.querySelector(".bench-baseline-status-grid");
    const details = panel?.querySelector(".bench-baseline-details");
    const controlBox = control?.getBoundingClientRect();
    const gridBox = grid?.getBoundingClientRect();
    const intersects =
      controlBox && gridBox
        ? !(
            controlBox.right <= gridBox.left ||
            gridBox.right <= controlBox.left ||
            controlBox.bottom <= gridBox.top ||
            gridBox.bottom <= controlBox.top
          )
        : true;
    return {
      cardCount: panel?.querySelectorAll(".bench-baseline-status-card").length,
      detailsClosed:
        details instanceof HTMLDetailsElement ? !details.open : false,
      hasLayout: Boolean(layout),
      intersects,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  assert.equal(result.hasLayout, true);
  assert.equal(result.cardCount, 4);
  assert.equal(result.detailsClosed, true);
  assert.equal(result.intersects, false);
  assert.equal(result.overflow, false);
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

async function reloadApp(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".studio-shell").waitFor();
}

async function assertLocalSettings(page) {
  const usageResponse = await fetch("http://127.0.0.1:4175/api/storage/usage");
  assert.equal(usageResponse.status, 200);
  assert.deepEqual(Object.keys(await usageResponse.json()).sort(), [
    "generated",
    "jobs",
    "temporary",
  ]);
  const invalidCleanup = await fetch(
    "http://127.0.0.1:4175/api/storage/cleanup",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "external" }),
    },
  );
  assert.equal(invalidCleanup.status, 400);
  const clearedJobs = await fetch(
    "http://127.0.0.1:4175/api/jobs?scope=video-render",
    { method: "DELETE" },
  );
  assert.equal(clearedJobs.status, 200);

  await page.getByRole("button", { name: "Configurações locais" }).click();
  await page.getByRole("dialog", { name: "Armazenamento e sessão" }).waitFor();
  assert.equal(
    await page
      .locator(".stage-view-switch")
      .getByRole("button", { name: "Podcast", exact: true })
      .count(),
    0,
    "Podcast should stay hidden by default",
  );
  const podcastToggle = page.getByLabel("Habilitar Podcast");
  assert.equal(await podcastToggle.isChecked(), false);
  await podcastToggle.check();
  await page
    .getByText("Guia Podcast habilitada neste workspace.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Fechar configurações" }).click();
  await page
    .locator(".stage-view-switch")
    .getByRole("button", { name: "Podcast", exact: true })
    .click();
  await page.getByRole("heading", { name: "Podcast", exact: true }).waitFor();
  await page.getByRole("button", { name: "Configurações locais" }).click();
  await page.getByLabel("Habilitar Podcast").uncheck();
  await page.getByText("Desabilitado por padrão", { exact: false }).waitFor();
  await page.getByText("Arquivos temporários", { exact: true }).waitFor();
  await page.getByText("Arquivos gerados locais", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Limpar temporários" }).click();
  const cleanupDialog = page.getByRole("dialog", {
    name: "Excluir arquivos temporários?",
  });
  await cleanupDialog
    .getByRole("button", { name: "Excluir temporários" })
    .click();
  await page.getByRole("button", { name: "Fechar configurações" }).click();
  assert.equal(
    await page
      .locator(".stage-view-switch")
      .getByRole("button", { name: "Podcast", exact: true })
      .count(),
    0,
    "Disabling Podcast should remove the stage tab",
  );
  assert.equal(
    await page
      .locator(".stage-view-switch")
      .getByRole("button", { name: "Editar", exact: true })
      .evaluate((button) => button.classList.contains("active")),
    true,
    "Disabling Podcast while active should return to Editar",
  );
}

async function assertArtworkPreviewApi(noCoverPath, coverPath) {
  const noCover = new FormData();
  noCover.append(
    "audio",
    new Blob([await fs.readFile(noCoverPath)], { type: "audio/wav" }),
    path.basename(noCoverPath),
  );
  const noCoverResponse = await fetch(
    "http://127.0.0.1:4175/api/audio/artwork-preview",
    {
      method: "POST",
      body: noCover,
    },
  );
  assert.equal(noCoverResponse.status, 200);
  assert.deepEqual(await noCoverResponse.json(), { artworkUrl: null });

  const cover = new FormData();
  cover.append(
    "audio",
    new Blob([await fs.readFile(coverPath)], { type: "audio/mpeg" }),
    path.basename(coverPath),
  );
  const coverResponse = await fetch(
    "http://127.0.0.1:4175/api/audio/artwork-preview",
    {
      method: "POST",
      body: cover,
    },
  );
  assert.equal(coverResponse.status, 200);
  const { artworkUrl } = await coverResponse.json();
  assert.match(artworkUrl, /^\/api\/audio\/artwork-preview\/[0-9a-f-]+\.jpg$/);
  assert.equal(
    (await fetch(`http://127.0.0.1:4175${artworkUrl}`)).headers.get(
      "content-type",
    ),
    "image/jpeg",
  );
  assert.equal(
    (
      await fetch(
        "http://127.0.0.1:4175/api/audio/artwork-preview/token-invalido.jpg",
      )
    ).status,
    404,
  );
}

async function assertNoMainStageHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => {
    const stage = document.querySelector(".preview-workspace");
    const content = stage?.firstElementChild;
    return {
      contentClientWidth: content?.clientWidth ?? 0,
      contentScrollWidth: content?.scrollWidth ?? 0,
      stageClientWidth: stage?.clientWidth ?? 0,
      stageScrollWidth: stage?.scrollWidth ?? 0,
      tableClientWidth:
        document.querySelector(".batch-table-wrap")?.clientWidth ?? 0,
      tableScrollWidth:
        document.querySelector(".batch-table-wrap")?.scrollWidth ?? 0,
    };
  });
  assert.ok(
    overflow.contentScrollWidth <= overflow.contentClientWidth,
    `main stage content should adapt without horizontal overflow: ${JSON.stringify(overflow)}`,
  );
  assert.ok(
    overflow.tableScrollWidth <= overflow.tableClientWidth,
    `batch table should adapt without horizontal overflow: ${JSON.stringify(overflow)}`,
  );
  assert.ok(
    overflow.stageScrollWidth <= overflow.stageClientWidth,
    `preview workspace should not overflow horizontally: ${JSON.stringify(overflow)}`,
  );
}

async function assertFloatingPanelFallback(page) {
  await page.waitForFunction(() =>
    document
      .querySelector(".studio-shell")
      ?.classList.contains("floating-panels"),
  );
  const initial = await page.locator(".studio-shell").evaluate((shell) => ({
    leftHidden: shell.classList.contains("left-hidden"),
    rightHidden: shell.classList.contains("right-hidden"),
    stageWidth:
      document.querySelector(".preview-workspace")?.getBoundingClientRect()
        .width ?? 0,
  }));
  assert.equal(initial.leftHidden, true);
  assert.equal(initial.rightHidden, true);
  assert.ok(
    initial.stageWidth >= 900,
    `floating rails should preserve a broad main stage, got ${initial.stageWidth}px`,
  );
  await ensurePanelOpen(page, "inspector");
  await page.getByRole("button", { name: "Fechar painel lateral" }).click();
  await ensurePanelsClosed(page);
}

async function ensurePanelOpen(page, panel) {
  const className = panel === "library" ? "left-hidden" : "right-hidden";
  const label = panel === "library" ? "Mostrar biblioteca" : "Mostrar inspetor";
  const isHidden = await page
    .locator(".studio-shell")
    .evaluate(
      (shell, hiddenClass) => shell.classList.contains(hiddenClass),
      className,
    );
  if (isHidden) {
    await page.getByRole("button", { name: label }).click();
    await page.waitForFunction(
      ({ hiddenClass }) =>
        !document
          .querySelector(".studio-shell")
          ?.classList.contains(hiddenClass),
      { hiddenClass: className },
    );
  }
}

async function ensureBatchMode(page) {
  await ensurePanelOpen(page, "library");
  const checkboxes = page.locator('.track-row input[type="checkbox"]');
  await checkboxes.first().waitFor();
  const count = await checkboxes.count();
  assert.ok(count >= 2, "batch mode requires at least two tracks");
  for (let index = 0; index < 2; index += 1) {
    const checkbox = checkboxes.nth(index);
    if (!(await checkbox.isChecked())) {
      await setCheckboxChecked(checkbox, true);
    }
  }
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.track-row input[type="checkbox"]:checked')
        .length >= 2,
  );
}

async function ensureSingleMode(page) {
  await ensurePanelOpen(page, "library");
  const checkboxes = page.locator('.track-row input[type="checkbox"]');
  await checkboxes.first().waitFor();
  const count = await checkboxes.count();
  if (!(await checkboxes.first().isChecked())) {
    await setCheckboxChecked(checkboxes.first(), true);
  }
  for (let index = 1; index < count; index += 1) {
    const checkbox = checkboxes.nth(index);
    if (await checkbox.isChecked()) {
      await setCheckboxChecked(checkbox, false);
    }
  }
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.track-row input[type="checkbox"]:checked')
        .length <= 1,
  );
}

async function setCheckboxChecked(locator, checked) {
  await locator.evaluate((input, nextChecked) => {
    input.checked = nextChecked;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, checked);
}

async function ensurePanelsClosed(page) {
  const shell = page.locator(".studio-shell");
  if (
    !(await shell.evaluate((element) =>
      element.classList.contains("left-hidden"),
    ))
  ) {
    await page.getByRole("button", { name: "Ocultar biblioteca" }).click();
  }
  if (
    !(await shell.evaluate((element) =>
      element.classList.contains("right-hidden"),
    ))
  ) {
    await page.getByRole("button", { name: "Ocultar inspetor" }).click();
  }
}

async function restoreDockedPanels(page) {
  await page.setViewportSize({ width: 1800, height: 950 });
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".studio-shell")
        ?.classList.contains("floating-panels"),
  );
  await ensurePanelOpen(page, "library");
  await ensurePanelOpen(page, "inspector");
  await page
    .getByRole("button", { name: "Redimensionar biblioteca" })
    .dblclick();
  await page.getByRole("button", { name: "Redimensionar inspetor" }).dblclick();
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".studio-shell")
        ?.classList.contains("floating-panels"),
  );
  await ensurePanelOpen(page, "library");
  await ensurePanelOpen(page, "inspector");
}

async function assertCompactAccordionRows(page) {
  const rows = page.locator(".batch-main-row");
  assert.ok(
    (await rows.count()) >= 2,
    "compact accordion regression requires at least two tracks",
  );
  await rows.nth(1).click();
  const result = await page.evaluate(() => {
    const wrap = document.querySelector(".batch-table-wrap");
    const visibleDetails = [...document.querySelectorAll(".batch-detail-row")]
      .filter((row) => getComputedStyle(row).display !== "none")
      .map((row) => row.className);
    return {
      tableWidth: wrap?.clientWidth ?? 0,
      visibleDetails,
      focusedInputs: document.querySelectorAll(
        ".batch-detail-row.is-focused input",
      ).length,
    };
  });
  assert.ok(
    result.tableWidth <= 1060,
    `accordion assertion should run in compact layout, got ${result.tableWidth}px`,
  );
  assert.equal(
    result.visibleDetails.length,
    1,
    `compact layout should keep only the focused accordion open: ${JSON.stringify(result)}`,
  );
  assert.ok(
    result.visibleDetails[0].includes("is-focused"),
    "the visible compact accordion should follow the focused row",
  );
  assert.ok(
    result.focusedInputs >= 5,
    "focused compact accordion should expose stacked editable fields",
  );
}

async function editableBatchTitleInput(page) {
  const compact = page
    .locator(".batch-detail-row.is-focused")
    .locator('input[aria-label="Título detalhado"]');
  if (await compact.isVisible()) return compact;
  return page
    .locator(".batch-main-row")
    .first()
    .locator('input[aria-label="Título"]');
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
      "Album sem nome",
      "variacao",
      "Aplicar sugestoes",
      "Repetir video",
      "Texto no video",
      "Exportar video",
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
    const exactControlPatterns = ["Titulo", "Album", "Versao"];
    return [
      ...document.querySelectorAll(
        "button,label,summary,h1,h2,h3,span,p,th,dt,strong,small,option",
      ),
    ]
      .filter(isVisible)
      .flatMap((element) => {
        const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
        const patternMatches = patterns
          .filter((pattern) => text.includes(pattern))
          .map((pattern) => ({ pattern, text }));
        if (
          element.matches("label,th,dt,option,summary,button") &&
          exactControlPatterns.includes(text)
        ) {
          patternMatches.push({ pattern: text, text });
        }
        return patternMatches;
      });
  });
  assert.deepEqual(issues, []);
}

async function assertInspectorControlSpacing(page) {
  const issues = await page.evaluate(() => {
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
    return [...document.querySelectorAll(".inspector-body .two-columns")]
      .filter(isVisible)
      .flatMap((row) => {
        const sibling = row.nextElementSibling;
        if (
          !sibling ||
          !isVisible(sibling) ||
          !sibling.matches(".quiet-action, .upload-action, .inline-actions")
        ) {
          return [];
        }
        const rowRect = row.getBoundingClientRect();
        const siblingRect = sibling.getBoundingClientRect();
        const gap = siblingRect.top - rowRect.bottom;
        if (gap >= 8) return [];
        return [
          {
            action: sibling.textContent?.replace(/\s+/g, " ").trim(),
            gap: Math.round(gap * 100) / 100,
            rowBottom: Math.round(rowRect.bottom * 100) / 100,
            actionTop: Math.round(siblingRect.top * 100) / 100,
          },
        ];
      });
  });
  assert.deepEqual(issues, []);
}

async function assertButtonAffordance(page) {
  const styles = await page.evaluate(() => {
    const host = document.createElement("div");
    host.style.position = "absolute";
    host.style.left = "-1000px";
    host.innerHTML = `
      <label class="field"><span>Campo</span><input value="valor" /></label>
      <button class="quiet-action" type="button">Ação secundária</button>
      <button class="primary-action" type="button">Ação primária</button>
    `;
    document.body.append(host);
    const field = host.querySelector("input");
    const secondary = host.querySelector(".quiet-action");
    const primary = host.querySelector(".primary-action");
    const pick = (element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        color: style.color,
        fontWeight: Number.parseFloat(style.fontWeight),
      };
    };
    const luminance = (rgb) => {
      const [red, green, blue] = rgb.match(/\d+/g).map(Number);
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
      );
    };
    const result = {
      field: pick(field),
      secondary: pick(secondary),
      primary: pick(primary),
      primaryLuminance: luminance(getComputedStyle(primary).backgroundColor),
    };
    host.remove();
    return result;
  });
  assert.notEqual(
    styles.secondary.background,
    styles.field.background,
    "secondary buttons should not use the same background as inputs",
  );
  assert.notEqual(
    styles.secondary.border,
    styles.field.border,
    "secondary buttons should not use the same border as inputs",
  );
  assert.ok(
    styles.secondary.fontWeight > styles.field.fontWeight,
    "button text should carry more action weight than editable fields",
  );
  assert.ok(
    styles.primaryLuminance < 0.18,
    `primary action should not become a bright slab in dark inspectors, got luminance ${styles.primaryLuminance}`,
  );
}

async function assertMainStageSectionSurfaces(page) {
  const result = await page.evaluate(() => {
    const styleFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        radius: Number.parseFloat(style.borderRadius),
      };
    };
    const doneRowsWithCancel = [
      ...document.querySelectorAll(".batch-job-row.done button"),
    ].length;
    return {
      stage: styleFor(".audio-library"),
      toolbar: styleFor(".batch-toolbar"),
      jobs: styleFor(".batch-job-board"),
      table: styleFor(".batch-table-wrap"),
      doneRowsWithCancel,
    };
  });
  for (const selector of ["toolbar", "jobs", "table"]) {
    assert.ok(result[selector], `${selector} section should be present`);
    assert.notEqual(
      result[selector].background,
      result.stage.background,
      `${selector} section should sit on a darker interactive surface`,
    );
    assert.ok(
      result[selector].radius >= 5,
      `${selector} section should have a subtle continuous surface radius`,
    );
  }
  assert.equal(
    result.doneRowsWithCancel,
    0,
    "completed job rows should not expose cancel actions",
  );
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
      <div class="batch-job-row error"><span class="job-error-code">Código: TEST</span></div>
      <div class="batch-job-row canceled"><span></span></div>
      <span class="quality-badge safe">Seguro</span>
      <span class="quality-badge reduced-headroom">Margem reduzida</span>
      <span class="quality-badge overload">Sobrecarga</span>
    `;
    document.body.append(host);
    const rows = [...host.querySelectorAll(".batch-job-row")].map((element) => {
      const style = getComputedStyle(element);
      return style.boxShadow;
    });
    const badges = [...host.querySelectorAll(".quality-badge")].map(
      (element) => getComputedStyle(element, "::before").content,
    );
    const errorCode = getComputedStyle(host.querySelector(".job-error-code"));
    const snapshot = {
      rows,
      badges,
      errorCode: {
        backgroundColor: errorCode.backgroundColor,
        borderColor: errorCode.borderColor,
        color: errorCode.color,
      },
    };
    host.remove();
    return snapshot;
  });
  assert.ok(indicators.rows.every((shadow) => shadow !== "none"));
  assert.deepEqual(indicators.badges, ['"✓"', '"!"', '"×"']);
  assert.notEqual(indicators.errorCode.backgroundColor, "rgba(0, 0, 0, 0)");
  assert.notEqual(indicators.errorCode.borderColor, indicators.errorCode.color);
}
