// One-off capture script for the promo-site illustrations.
// Loads the test album, navigates the main screens, applies the
// "Nuvens amplas" scene with the album cover composited over the video,
// and writes PNGs straight into site/src/assets/.
//
// Usage (dev server must be running):
//   SONARA_CLIENT_URL=http://127.0.0.1:5175 \
//   SONARA_ALBUM_DIR="D:\\mafhp\\Music\\Matheus Lima\\The Beauty of Almost" \
//   node tests/promo-screenshots.mjs
//
// Env knobs: HEADLESS=0 to watch the run, COVER_POSITION=center|left|right.

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
await fs.mkdir(outDir, { recursive: true });

const shot = async (page, name) => {
  const file = path.join(outDir, name);
  const buffer = await page.screenshot({ fullPage: false });
  await sharp(buffer)
    .resize({ width: 1160 })
    .webp({ quality: 80 })
    .toFile(file);
  console.log("saved", path.relative(root, file));
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
    .locator(".steps button")
    .filter({ hasText: "Visual" })
    .first()
    .click();
  const presetSelect = page.locator(
    'select:has(option[value="volumetric-clouds"])',
  );
  await presetSelect.selectOption("volumetric-clouds");
  await page.waitForTimeout(500);

  // Composite the track's album cover over the scene ("há configuração para isso").
  const coverApply = page.locator(".cover-layer-apply");
  if (await coverApply.count()) {
    await coverApply.locator("select").selectOption(coverPosition);
    await coverApply.getByRole("button", { name: /Aplicar capa/ }).click();
    await page.waitForTimeout(400);
  } else {
    console.warn("cover-layer-apply control not found; skipping cover overlay");
  }
  await page.waitForTimeout(1_500); // let the scene canvas paint
  await shot(page, "shot-visual-studio.webp");

  // --- Switch to the audio library in batch ("Lote") mode for the rest ---
  await page.getByRole("button", { name: "Biblioteca de áudio" }).click();
  await ensurePanelOpen(page, "library");
  await ensurePanelOpen(page, "inspector");
  await page.getByRole("button", { name: "Lote", exact: true }).click();
  await page.waitForTimeout(600);

  // --- 2) Audio Library — batch review (all tracks, tags, status) ---
  await page
    .locator(".stage-view-switch")
    .getByRole("button", { name: "Editar" })
    .click();
  await page.getByText("Dados comuns do lote").first().waitFor();
  await page.waitForTimeout(900);
  await shot(page, "shot-audio-library.webp");

  // --- 3) Catalog preview (full album, all tracks) ---
  await page
    .locator(".stage-view-switch")
    .getByRole("button", { name: "Catálogo" })
    .click();
  await page.getByText("Catálogo planejado").first().waitFor();
  await page.waitForTimeout(900);
  await shot(page, "shot-catalog.webp");

  // --- 4) Video grid (publication thumbnails, cover mode) ---
  await page
    .locator(".stage-view-switch")
    .getByRole("button", { name: "Vídeos" })
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
  await shot(page, "shot-video-grid.webp");

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
