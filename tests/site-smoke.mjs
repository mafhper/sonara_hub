import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distIndex = path.join(root, "site", "dist", "index.html");
const screenshotDir = path.join(root, ".dev", "site-smoke");
const port = 64931;
const baseUrl = `http://127.0.0.1:${port}/sonara_hub/`;

await fs.access(distIndex).catch(() => {
  throw new Error(
    "site/dist is missing. Run npm run site:build before npm run site:test.",
  );
});
await fs.mkdir(screenshotDir, { recursive: true });

const previewCommand =
  process.platform === "win32"
    ? {
        command: "cmd.exe",
        args: [
          "/d",
          "/s",
          "/c",
          `npm run site:preview -- --port ${port} --strictPort`,
        ],
      }
    : {
        command: "npm",
        args: [
          "run",
          "site:preview",
          "--",
          "--port",
          String(port),
          "--strictPort",
        ],
      };
const server = spawn(previewCommand.command, previewCommand.args, {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

const logs = [];
server.stdout.on("data", (chunk) => logs.push(chunk.toString()));
server.stderr.on("data", (chunk) => logs.push(chunk.toString()));

try {
  await waitForServer(baseUrl);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 980 },
  });
  const consoleErrors = [];
  const failedRequests = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText}`,
    );
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page
    .locator("h1")
    .filter({ hasText: /Prepare, organize and visualize/i })
    .waitFor();
  assert.equal(
    await page.locator("text=/lovable/i").count(),
    0,
    "Lovable text is visible.",
  );
  assert.ok(
    await page
      .getByRole("link", { name: /view on github/i })
      .first()
      .isVisible(),
    "GitHub CTA is not visible.",
  );

  const canvasSample = await page
    .locator('[data-testid="hero-canvas"]')
    .evaluate((canvas) => {
      const element = canvas;
      if (!(element instanceof HTMLCanvasElement))
        return { width: 0, height: 0, pixels: [] };
      const ctx = element.getContext("2d");
      const sampleX = Math.max(0, Math.floor(element.width / 2) - 12);
      const sampleY = Math.max(0, Math.floor(element.height / 2) - 12);
      let image;
      if (ctx) {
        image = ctx.getImageData(sampleX, sampleY, 24, 24).data;
      } else {
        const gl = element.getContext("webgl");
        if (!gl)
          return { width: element.width, height: element.height, pixels: null };
        image = new Uint8Array(24 * 24 * 4);
        gl.readPixels(
          sampleX,
          sampleY,
          24,
          24,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image,
        );
      }
      let total = 0;
      for (let i = 0; i < image.length; i += 4) {
        total += image[i] + image[i + 1] + image[i + 2] + image[i + 3];
      }
      return { width: element.width, height: element.height, pixels: total };
    });
  assert.ok(
    canvasSample.width > 100 && canvasSample.height > 100,
    "Hero canvas is undersized.",
  );
  if (canvasSample.pixels !== null) {
    assert.ok(canvasSample.pixels > 0, "Hero canvas is blank.");
  }

  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    true,
    "Desktop layout has horizontal overflow.",
  );

  await page.screenshot({
    path: path.join(screenshotDir, "desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    true,
    "Mobile layout has horizontal overflow.",
  );
  await page.screenshot({
    path: path.join(screenshotDir, "mobile.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseUrl}#open-source`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="footer-wave"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const footerBox = await page
    .locator('[data-testid="footer-wave"]')
    .boundingBox();
  assert.ok(
    footerBox && footerBox.width > 240 && footerBox.height > 40,
    "Footer wave is missing.",
  );
  await page.screenshot({
    path: path.join(screenshotDir, "footer.png"),
    fullPage: false,
  });

  assert.deepEqual(consoleErrors, [], "Unexpected console errors.");
  assert.deepEqual(failedRequests, [], "Unexpected failed requests.");

  await browser.close();
} finally {
  if (server.pid && process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    server.kill();
  }
}

async function waitForServer(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Preview server exited early:\n${logs.join("")}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}\n${logs.join("")}`);
}
