// One-off capture script for the promo-site and README illustrations.
// Loads the test album, navigates the main screens, applies representative
// app themes, and writes WebP assets into site/src/assets/ plus selected
// README images in media/readme/.
//
// Usage (dev server must be running):
//   SONARA_CLIENT_URL=http://127.0.0.1:5175 \
//   SONARA_ALBUM_DIR="D:\\mafhp\\Music\\Matheus Lima\\The Beauty of Almost" \
//   node tests/promo-screenshots.mjs
//
// Env knobs: HEADLESS=0 to watch the run, COVER_POSITION=center|left|right.
// Theme knobs: LIBRARY_THEME, CATALOG_THEME, VISUAL_THEME, VIDEO_GRID_THEME.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientUrl = process.env.SONARA_CLIENT_URL ?? "http://127.0.0.1:5175";
const albumDir =
  process.env.SONARA_ALBUM_DIR ??
  "D:\\mafhp\\Music\\Matheus Lima\\The Beauty of Almost";
const coverPosition = process.env.COVER_POSITION ?? "center";
const outDir = path.join(root, "site", "src", "assets");
const readmeMediaDir = path.join(root, "media", "readme");
await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(readmeMediaDir, { recursive: true });

const captureThemes = {
  library: process.env.LIBRARY_THEME ?? "dark",
  catalog: process.env.CATALOG_THEME ?? "dark",
  visual: process.env.VISUAL_THEME ?? "golden",
  videoGrid: process.env.VIDEO_GRID_THEME ?? "original",
};

const shot = async (page, name, { theme = "original", readmeName } = {}) => {
  await applyCaptureTheme(page, theme);
  await assertNoVisibleCaptureError(page, name);
  const buffer = await page.screenshot({ fullPage: false });
  const file = path.join(outDir, name);
  await sharp(buffer)
    .resize({ width: 1160, height: 690, fit: "cover", position: "center" })
    .webp({ quality: 82 })
    .toFile(file);
  console.log("saved", path.relative(root, file));
  if (readmeName) {
    const readmeFile = path.join(readmeMediaDir, readmeName);
    await sharp(buffer)
      .resize({ width: 1200, height: 714, fit: "cover", position: "center" })
      .webp({ quality: 82 })
      .toFile(readmeFile);
    console.log("saved", path.relative(root, readmeFile));
  }
};

const browser = await chromium.launch({
  headless: process.env.HEADLESS !== "0",
});
const page = await browser.newPage({
  viewport: { width: 1680, height: 1000 },
  deviceScaleFactor: 1,
});
// Dock the rails with comfortable widths so the three-pane layout shows.
await page.addInitScript(() =>
  window.localStorage.setItem(
    "sonara-hub-panel-widths",
    JSON.stringify({ left: 264, right: 452 }),
  ),
);

const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(clientUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".studio-shell").waitFor();

  // --- Load the album folder via the always-present webkitdirectory input ---
  console.log("loading album from", albumDir);
  await page
    .locator('input[type="file"][webkitdirectory]')
    .setInputFiles(albumDir);
  await page.locator(".track-row").first().waitFor({ timeout: 120_000 });
  await page.waitForFunction(
    () => document.querySelectorAll(".track-row").length >= 6,
    { timeout: 120_000 },
  );
  // Let cover art / loudness settle.
  await page.waitForTimeout(2_500);
  await ensurePanelOpen(page, "library");
  await ensurePanelOpen(page, "inspector");
  const trackCount = await page.locator(".track-row").count();
  console.log("tracks loaded:", trackCount);

  // --- 1) Visual Studio — Nuvens amplas + album cover over the video ---
  // Captured first, in single-track mode, for the cleanest hero composition.
  await page.getByRole("button", { name: "Estúdio visual" }).click();
  await ensurePanelOpen(page, "library");
  await ensurePanelOpen(page, "inspector");
  await page
    .getByLabel("Etapas do projeto")
    .getByRole("button", { name: "Visual", exact: true })
    .click();
  await page.getByRole("tab", { name: /Atmosferas/ }).click();
  await page
    .getByRole("button", { name: "Selecionar atmosfera Nuvens amplas" })
    .click();
  await page
    .getByRole("button", {
      name: "Aplicar variante Meio-dia em Nuvens amplas",
    })
    .click();
  await page.waitForTimeout(500);

  // Composite the track's album cover over the scene ("há configuração para isso").
  const stackAddSummary = page.locator(".stack-add-menu > summary");
  if (await stackAddSummary.count()) await stackAddSummary.click();
  const coverApply = page.locator(".cover-layer-apply:visible");
  if (await coverApply.count()) {
    await coverApply.locator("select").selectOption(coverPosition);
    await coverApply.getByRole("button", { name: /Aplicar capa/ }).click();
    await page.waitForTimeout(400);
  } else {
    console.warn("cover-layer-apply control not found; skipping cover overlay");
  }
  await page.waitForTimeout(1_500); // let the scene canvas paint
  await shot(page, "shot-visual-studio.webp", {
    theme: captureThemes.visual,
    readmeName: "app-visual-studio.webp",
  });

  // --- Switch to the audio library in batch ("Lote") mode for the rest ---
  await page.getByRole("button", { name: "Biblioteca de áudio" }).click();
  await ensurePanelOpen(page, "library");
  await ensurePanelOpen(page, "inspector");
  const batchButton = page.getByRole("button", { name: "Lote", exact: true });
  if (await batchButton.count()) await batchButton.click();
  await page.waitForTimeout(600);

  // --- 2) Audio Library — batch review (all tracks, tags, status) ---
  await page
    .locator(".stage-view-switch")
    .getByRole("button", { name: "Editar" })
    .click();
  await page.getByText("Dados comuns do lote").first().waitFor();
  await page.waitForTimeout(900);
  await shot(page, "shot-audio-library.webp", {
    theme: captureThemes.library,
  });

  // --- 3) Catalog preview (full album, all tracks) ---
  await page
    .locator(".stage-view-switch")
    .getByRole("button", { name: "Catálogo" })
    .click();
  await page.getByText("Catálogo planejado").first().waitFor();
  await page.waitForTimeout(900);
  await shot(page, "shot-catalog.webp", {
    theme: captureThemes.catalog,
    readmeName: "app-catalog.webp",
  });

  // --- 4) Video grid (publication thumbnails, cover mode) ---
  await page.getByRole("button", { name: "Estúdio visual" }).click();
  await page
    .getByLabel("Etapas do projeto")
    .getByRole("button", { name: "Visualizar" })
    .click();
  await page.getByText("Grade de publicação").first().waitFor();
  await page
    .locator(".composition-thumbnail, .youtube-card")
    .first()
    .waitFor({ timeout: 30_000 });
  // Show album covers instead of the empty render-frame placeholders.
  const capaButtons = page.locator(".thumbnail-mode-switch button", {
    hasText: "Capa",
  });
  const capaCount = await capaButtons.count();
  for (let index = 0; index < capaCount; index += 1) {
    await capaButtons.nth(index).click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(900);
  await shot(page, "shot-video-grid.webp", {
    theme: captureThemes.videoGrid,
  });

  if (errors.length) console.warn("page errors:", errors);
  console.log("done.");
} finally {
  await browser.close();
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
      (hiddenClass) =>
        !document
          .querySelector(".studio-shell")
          ?.classList.contains(hiddenClass),
      className,
    );
  }
}

async function applyCaptureTheme(page, theme) {
  await page.evaluate((themeName) => {
    document.documentElement.dataset.theme = themeName;
    document.documentElement.dataset.themePreference = themeName;
    window.localStorage.setItem("sonara-hub-theme", themeName);
  }, theme);
  await page.waitForTimeout(300);
}

async function assertNoVisibleCaptureError(page, name) {
  const count = await page
    .getByText(/Não foi possível|Failed to fetch|Servidor local indisponível/)
    .count();
  if (count > 0) {
    throw new Error(`${name}: visible error state before screenshot`);
  }
}
