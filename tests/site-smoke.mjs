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
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1440, height: 980 },
  });
  const page = await context.newPage();
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
    await page.evaluate(() => document.documentElement.lang),
    "en",
    "English locale was not applied from browser preferences.",
  );
  assert.equal(
    await page.locator('link[rel="icon"][href$="brand/favicon.svg"]').count(),
    1,
    "SVG favicon is not linked.",
  );
  assert.equal(
    await page
      .locator(
        'link[rel="apple-touch-icon"][href$="brand/apple-touch-icon.png"]',
      )
      .count(),
    1,
    "Apple touch icon is not linked.",
  );
  const brandLoaded = await page
    .locator(".brand-logo")
    .first()
    .evaluate((image) => {
      const element = image;
      return (
        element instanceof HTMLImageElement &&
        element.complete &&
        element.naturalWidth > 0
      );
    });
  assert.equal(brandLoaded, true, "Brand logo did not load.");
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

  const heroSample = await sampleCanvas(page, '[data-testid="hero-canvas"]');
  assert.ok(
    heroSample.width > 100 && heroSample.height > 100,
    "Hero canvas is undersized.",
  );
  if (heroSample.pixels !== null) {
    assert.ok(heroSample.pixels > 0, "Hero canvas is blank.");
  }

  await assertAnchor(
    page,
    /workspaces/i,
    "workspaces",
    /Audio becomes visual/i,
  );
  await assertAnchor(page, /visuals/i, "visual-system", /Atmospheres are now/i);
  await assertAnchor(page, /publishing/i, "release-formats", /Music releases/i);
  await assertAnchor(page, /principles/i, "principles", /Built for ownership/i);

  await page.locator("#workspaces").scrollIntoViewIfNeeded();
  await page.getByRole("tab", { name: /Visual Studio/i }).click();
  await page
    .locator("#workspace-panel-visual")
    .filter({ hasText: /The same cover and metadata/i })
    .waitFor();
  await page.getByRole("tab", { name: /Audio Library/i }).click();
  await page
    .locator("#workspace-panel-audio")
    .filter({ hasText: /From folder import/i })
    .waitFor();

  await assertNoHorizontalOverflow(page, "Desktop single-page layout");
  await assertElementNoHorizontalOverflow(page, ".feature-panorama");
  await assertElementNoHorizontalOverflow(page, ".workspace-duo-panel");
  await assertElementNoHorizontalOverflow(page, ".atmosphere-lab-controls");
  await page.screenshot({
    path: path.join(screenshotDir, "desktop-home.png"),
    fullPage: true,
  });

  await page.locator("#visual-system").scrollIntoViewIfNeeded();
  const firstCoverImage = await page
    .locator('[data-testid="lab-cover-preview"] img')
    .evaluate((image) =>
      image instanceof HTMLImageElement ? image.currentSrc : "",
    );
  await page.getByRole("button", { name: "Next cover" }).click();
  await page.locator(".atmosphere-lab-controls").hover();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Neural haze/i }).click();
  await page.getByRole("button", { name: "Prism", exact: true }).click();
  await setRangeValue(page.getByRole("slider", { name: "Motion" }), "82");
  await setRangeValue(page.getByLabel("Horizontal"), "12");
  await setRangeValue(page.getByLabel("Vertical"), "-8");
  await setRangeValue(page.getByLabel("Size"), "118");
  await setRangeValue(page.getByLabel("Transparency"), "48");
  await page.getByLabel("Blend").selectOption("overlay");
  await page.waitForTimeout(250);

  const coverStyles = await page
    .locator(".lab-cover-layer")
    .evaluate((element) => {
      const preview = element.querySelector(
        '[data-testid="lab-cover-preview"]',
      );
      const previewStyles =
        preview instanceof HTMLElement
          ? window.getComputedStyle(preview)
          : null;
      const layerStyles = window.getComputedStyle(element);
      const image = preview?.querySelector("img");
      return {
        opacity: previewStyles?.opacity ?? "",
        blend: previewStyles?.mixBlendMode ?? "",
        left: layerStyles.left,
        top: layerStyles.top,
        transform: layerStyles.transform,
        image: image instanceof HTMLImageElement ? image.currentSrc : "",
      };
    });
  assert.equal(coverStyles.blend, "overlay", "Blend mode did not update.");
  assert.equal(coverStyles.opacity, "0.48", "Cover opacity did not update.");
  assert.notEqual(
    coverStyles.image,
    firstCoverImage,
    "Cover image did not update.",
  );
  assert.notEqual(coverStyles.transform, "none", "Cover scale did not update.");

  await page.getByLabel("Use cover in scene").uncheck();
  await expectCount(page, '[data-testid="lab-cover-preview"]', 0);
  await page.getByLabel("Use cover in scene").check();
  await expectCount(page, '[data-testid="lab-cover-preview"]', 1);

  const labSample = await sampleCanvas(
    page,
    '[data-testid="atmosphere-lab-canvas"]',
  );
  assert.ok(
    labSample.width > 300 && labSample.height > 200,
    "Atmosphere lab canvas is undersized.",
  );
  assert.ok(labSample.pixels > 0, "Atmosphere lab canvas is blank.");
  await page.screenshot({
    path: path.join(screenshotDir, "visual-lab.png"),
    fullPage: false,
  });

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await assertNoHorizontalOverflow(page, "Mobile single-page layout");
  await assertElementNoHorizontalOverflow(page, ".feature-panorama");
  await assertElementNoHorizontalOverflow(page, ".atmosphere-lab-controls");
  await page.screenshot({
    path: path.join(screenshotDir, "mobile-home.png"),
    fullPage: true,
  });

  for (const width of [1120, 740, 480, 390]) {
    await assertResponsiveSizing(page, width);
  }

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

  await assertLocalizedHome(browser, "pt-BR", /Prepare, organize e visualize/i);
  await assertLocalizedHome(browser, "es-ES", /Prepara, organiza y visualiza/i);

  await context.close();
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

async function assertAnchor(page, linkName, expectedId, headingPattern) {
  await page.getByRole("link", { name: linkName }).click();
  await page.locator(`#${expectedId}`).waitFor();
  await page
    .locator(`#${expectedId}`)
    .getByRole("heading", { name: headingPattern })
    .first()
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.location.hash),
    `#${expectedId}`,
    `${expectedId} anchor did not update the location hash.`,
  );
}

async function assertLocalizedHome(browser, locale, headingPattern) {
  const context = await browser.newContext({
    locale,
    viewport: { width: 960, height: 760 },
  });
  try {
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator("h1").filter({ hasText: headingPattern }).waitFor();
  } finally {
    await context.close();
  }
}

async function assertNoHorizontalOverflow(page, label) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    true,
    `${label} has horizontal overflow.`,
  );
}

async function assertElementNoHorizontalOverflow(page, selector) {
  assert.equal(
    await page
      .locator(selector)
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    true,
    `${selector} has horizontal overflow.`,
  );
}

async function expectCount(page, selector, count) {
  assert.equal(
    await page.locator(selector).count(),
    count,
    `${selector} count did not match ${count}.`,
  );
}

async function assertResponsiveSizing(page, width) {
  await page.setViewportSize({ width, height: 920 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await assertNoHorizontalOverflow(page, `${width}px responsive layout`);
  await assertElementNoHorizontalOverflow(page, ".feature-panorama");
  await assertElementNoHorizontalOverflow(page, ".atmosphere-lab-controls");

  const metrics = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    };
    return {
      workspaceScreen: box(".workspace-scene-screen"),
      labCover: box(".lab-cover-layer"),
      releaseMedia: box(".release-card-media"),
      screenshotMedia: box(".screenshot-grid .workspace-media"),
      paletteButtons: Array.from(
        document.querySelectorAll(".palette-choice-list button"),
      ).map((button) => {
        const rect = button.getBoundingClientRect();
        return { top: Math.round(rect.top), width: rect.width };
      }),
    };
  });

  assert.ok(
    metrics.workspaceScreen &&
      metrics.workspaceScreen.width >= Math.min(300, width * 0.66),
    `${width}px workspace screenshot is too small.`,
  );
  assert.ok(
    metrics.labCover && metrics.labCover.width >= Math.min(220, width * 0.52),
    `${width}px atmosphere cover is too small.`,
  );
  for (const [label, media] of [
    ["release", metrics.releaseMedia],
    ["screenshot", metrics.screenshotMedia],
  ]) {
    assert.ok(media, `${width}px ${label} media is missing.`);
    const ratio = media.height / media.width;
    assert.ok(
      ratio > 0.58 && ratio < 0.68,
      `${width}px ${label} media ratio drifted to ${ratio.toFixed(2)}.`,
    );
  }
  if (width <= 680) {
    const paletteRowCount = new Set(
      metrics.paletteButtons.slice(0, 3).map((button) => button.top),
    ).size;
    assert.equal(
      paletteRowCount,
      1,
      `${width}px palette controls should stay in one compact row.`,
    );
  }
}

async function setRangeValue(locator, value) {
  await locator.evaluate((input, nextValue) => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function sampleCanvas(page, selector) {
  return page.locator(selector).evaluate((canvas) => {
    const element = canvas;
    if (!(element instanceof HTMLCanvasElement)) {
      return { width: 0, height: 0, pixels: 0 };
    }
    const points = [
      [0.22, 0.26],
      [0.5, 0.5],
      [0.78, 0.32],
      [0.32, 0.72],
      [0.68, 0.76],
    ].map(([x, y]) => [
      Math.max(0, Math.floor(element.width * x) - 12),
      Math.max(0, Math.floor(element.height * y) - 12),
    ]);
    const ctx = element.getContext("2d");
    let total = 0;
    if (ctx) {
      for (const [sampleX, sampleY] of points) {
        const image = ctx.getImageData(sampleX, sampleY, 24, 24).data;
        for (let i = 0; i < image.length; i += 4) {
          total += image[i] + image[i + 1] + image[i + 2] + image[i + 3];
        }
      }
    } else {
      const gl = element.getContext("webgl");
      if (!gl) {
        return { width: element.width, height: element.height, pixels: null };
      }
      for (const [sampleX, sampleY] of points) {
        const image = new Uint8Array(24 * 24 * 4);
        gl.readPixels(
          sampleX,
          sampleY,
          24,
          24,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image,
        );
        for (let i = 0; i < image.length; i += 4) {
          total += image[i] + image[i + 1] + image[i + 2] + image[i + 3];
        }
      }
    }
    return { width: element.width, height: element.height, pixels: total };
  });
}
