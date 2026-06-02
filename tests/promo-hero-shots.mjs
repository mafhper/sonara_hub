// Capture extra hero illustrations: other albums loaded across flow screens,
// plus a clean composition frame (the still that becomes the YouTube video).
// Writes WebP into site/src/assets/. Dev server must be running.
//
//   SONARA_CLIENT_URL=http://127.0.0.1:4782 \
//   SONARA_ALBUM_DIR="D:\\mafhp\\Music\\Matheus Lima\\Azul de Roda" \
//   SONARA_PREFIX=shot-azul SONARA_SHOTS=visual,frame \
//   node tests/promo-hero-shots.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientUrl = process.env.SONARA_CLIENT_URL ?? "http://127.0.0.1:5175";
const albumDir =
  process.env.SONARA_ALBUM_DIR ??
  "D:\\mafhp\\Music\\Matheus Lima\\Azul de Roda";
const prefix = process.env.SONARA_PREFIX ?? "shot-azul";
const shots = (process.env.SONARA_SHOTS ?? "visual,catalog,frame").split(",");
const minTracks = Number(process.env.SONARA_MIN_TRACKS ?? "4");
const coverPosition = process.env.COVER_POSITION ?? "center";
const outDir = path.join(root, "site", "src", "assets");

async function saveWebp(buffer, name, width) {
  const file = path.join(outDir, name);
  await sharp(buffer).resize({ width }).webp({ quality: 80 }).toFile(file);
  console.log("saved", name);
}

const browser = await chromium.launch({
  headless: process.env.HEADLESS !== "0",
});
const page = await browser.newPage({
  viewport: { width: 1680, height: 1000 },
  deviceScaleFactor: 2,
});
await page.addInitScript(() =>
  window.localStorage.setItem(
    "sonara-hub-panel-widths",
    JSON.stringify({ left: 264, right: 452 }),
  ),
);

try {
  await page.goto(clientUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".studio-shell").waitFor();
  await page
    .locator('input[type="file"][webkitdirectory]')
    .setInputFiles(albumDir);
  await page.locator(".track-row").first().waitFor({ timeout: 120_000 });
  await page.waitForFunction(
    (min) => document.querySelectorAll(".track-row").length >= min,
    minTracks,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(2_500);
  await ensurePanelOpen(page, "library");
  await ensurePanelOpen(page, "inspector");

  if (shots.includes("catalog")) {
    await page.getByRole("button", { name: "Lote", exact: true }).click();
    await page.waitForTimeout(500);
    await page
      .locator(".stage-view-switch")
      .getByRole("button", { name: "Catálogo" })
      .click();
    await page.getByText("Catálogo planejado").first().waitFor();
    await page.waitForTimeout(900);
    await saveWebp(
      await page.screenshot({ fullPage: false }),
      `${prefix}-catalog.webp`,
      1160,
    );
  }

  if (shots.includes("visual") || shots.includes("frame")) {
    await page.getByRole("button", { name: "Estúdio visual" }).click();
    await ensurePanelOpen(page, "library");
    await ensurePanelOpen(page, "inspector");
    await page
      .locator(".steps button")
      .filter({ hasText: "Visual" })
      .first()
      .click();
    await page
      .locator('select:has(option[value="volumetric-clouds"])')
      .selectOption("volumetric-clouds");
    await page.waitForTimeout(500);
    const coverApply = page.locator(".cover-layer-apply");
    if (await coverApply.count()) {
      await coverApply.locator("select").selectOption(coverPosition);
      await coverApply.getByRole("button", { name: /Aplicar capa/ }).click();
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1_800);

    if (shots.includes("visual")) {
      await saveWebp(
        await page.screenshot({ fullPage: false }),
        `${prefix}-visual.webp`,
        1160,
      );
    }
    if (shots.includes("frame")) {
      const frame = page.locator(".preview-frame");
      await frame.waitFor();
      await saveWebp(await frame.screenshot(), `${prefix}-frame.webp`, 1280);
    }
  }

  console.log("done");
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
