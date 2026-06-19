import assert from "node:assert/strict";
import { chromium } from "playwright";

const clientUrl = process.env.SONARA_CLIENT_URL ?? "http://127.0.0.1:5173";
const themes = ["original", "light", "dark", "golden"];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

try {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("sonara-hub-hig-reset")) return;
    window.localStorage.removeItem("sonara-hub-theme");
    window.localStorage.removeItem("sonara-hub-ui-scale");
    window.localStorage.removeItem("sonara-hub-panel-widths");
    window.sessionStorage.setItem("sonara-hub-hig-reset", "true");
  });
  await page.goto(clientUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".studio-shell").waitFor();

  await page.getByRole("button", { name: "Configurações locais" }).click();
  await page.getByRole("dialog", { name: "Armazenamento e sessão" }).waitFor();

  await assertResponsiveSettings(page, { width: 1280, height: 860 });

  for (const theme of themes) {
    await page
      .getByRole("group", { name: "Tema da interface" })
      .getByRole("button", { name: themeButtonPattern(theme) })
      .click();
    await page.waitForFunction(
      (expectedTheme) =>
        document.documentElement.dataset.theme === expectedTheme,
      theme,
    );
    const audit = await page.evaluate(() => {
      const root = document.documentElement;
      const css = getComputedStyle(root);
      const styleFor = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          color: style.color,
          height: element.getBoundingClientRect().height,
          width: element.getBoundingClientRect().width,
        };
      };
      const token = (name) => css.getPropertyValue(name).trim();
      return {
        bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
        rootOverflow: root.scrollWidth - root.clientWidth,
        shell: styleFor(".studio-shell"),
        settingsPanel: styleFor(".settings-panel"),
        textPrimary: token("--text-primary"),
        textSecondary: token("--text-secondary"),
        textMuted: token("--text-muted"),
        surfaceRaised: token("--surface-raised"),
        stageSurface: token("--stage-surface"),
        fieldBg: token("--field-bg"),
      };
    });

    assert.ok(audit.shell?.width > 0, `${theme} should render the app shell`);
    assert.ok(
      audit.settingsPanel?.height > 0,
      `${theme} should render the settings panel`,
    );
    assert.ok(
      audit.bodyOverflow <= 1 && audit.rootOverflow <= 1,
      `${theme} should not create horizontal overflow: ${JSON.stringify(audit)}`,
    );
    assert.ok(
      contrastRatio(audit.textPrimary, audit.surfaceRaised) >= 4.5,
      `${theme} primary text should contrast with raised surface`,
    );
    assert.ok(
      contrastRatio(audit.textSecondary, audit.stageSurface) >= 4.5,
      `${theme} secondary text should contrast with stage surface`,
    );
    assert.ok(
      contrastRatio(audit.textMuted, audit.fieldBg) >= 3,
      `${theme} muted text should remain readable on fields`,
    );
  }

  await assertUiScaleControls(page);
  await assertResponsiveSettings(page, { width: 390, height: 740 });
  await assertVisualPresetBrowserA11y(page);

  await assertFocusVisible(
    page,
    page.getByRole("button", { name: "Fechar configurações" }),
  );
  await assertFocusVisible(
    page,
    page
      .getByRole("group", { name: "Tema da interface" })
      .getByRole("button", { name: /^Original/ }),
  );
  await assertBenchmarkThemes(page);
} finally {
  await browser.close();
}

async function assertBenchmarkThemes(page) {
  for (const theme of themes) {
    await page.evaluate((value) => {
      window.localStorage.setItem("sonara-hub-theme", value);
      window.localStorage.setItem("sonara-hub-ui-scale", "extra");
    }, theme);
    await page.goto(`${clientUrl}/benchmarks`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator(".bench-dashboard").waitFor();

    const audit = await page.evaluate(() => {
      const root = document.documentElement;
      const dashboard = document.querySelector(".bench-dashboard");
      const title = document.querySelector(".bench-hero h1");
      const field = document.querySelector(".bench-controls select");
      const rootStyle = getComputedStyle(root);
      const dashboardStyle = getComputedStyle(dashboard);
      const titleStyle = getComputedStyle(title);
      const fieldStyle = getComputedStyle(field);
      const token = (name) => rootStyle.getPropertyValue(name).trim();
      return {
        bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
        colorScheme: rootStyle.colorScheme,
        dashboardBackground: dashboardStyle.backgroundColor,
        dashboardImage: dashboardStyle.backgroundImage,
        fieldBackground: fieldStyle.backgroundColor,
        fieldColor: fieldStyle.color,
        metaThemeColor:
          document.querySelector('meta[name="theme-color"]')?.content ?? "",
        rootOverflow: root.scrollWidth - root.clientWidth,
        theme: root.dataset.theme,
        titleColor: titleStyle.color,
        tokens: {
          appBg: token("--app-bg"),
          fieldBg: token("--field-bg"),
          textPrimary: token("--text-primary"),
        },
        uiScale: root.dataset.uiScale,
      };
    });

    assert.equal(audit.theme, theme, `${theme} should apply on /benchmarks`);
    assert.equal(
      audit.uiScale,
      "extra",
      `${theme} benchmark should apply the saved UI scale`,
    );
    assert.equal(
      audit.colorScheme,
      theme === "light" || theme === "golden" ? "light" : "dark",
      `${theme} benchmark should expose the matching color-scheme`,
    );
    assert.equal(
      normalizeColor(audit.dashboardBackground),
      normalizeColor(audit.tokens.appBg),
      `${theme} benchmark should use the semantic app background`,
    );
    assert.ok(
      !audit.dashboardImage.includes("rgba(12, 14, 18, 0.96)"),
      `${theme} benchmark should not retain the fixed dark page gradient`,
    );
    assert.ok(
      contrastRatio(audit.titleColor, audit.dashboardBackground) >= 4.5,
      `${theme} benchmark title should contrast with the page`,
    );
    assert.ok(
      contrastRatio(audit.fieldColor, audit.fieldBackground) >= 4.5,
      `${theme} benchmark controls should retain readable contrast`,
    );
    assert.equal(
      normalizeColor(audit.metaThemeColor),
      normalizeColor(audit.tokens.appBg),
      `${theme} benchmark should synchronize the browser theme color`,
    );
    assert.ok(
      audit.bodyOverflow <= 1 && audit.rootOverflow <= 1,
      `${theme} benchmark should not overflow horizontally`,
    );

    await assertFocusVisible(
      page,
      page.getByRole("button", { name: "Atualizar" }),
    );
  }

  await page.setViewportSize({ width: 390, height: 740 });
  const narrowOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert.ok(
    narrowOverflow <= 1,
    `benchmark should fit a narrow viewport: ${narrowOverflow}`,
  );
}

async function assertResponsiveSettings(page, viewport) {
  await page.setViewportSize(viewport);
  await page.locator(".studio-shell").waitFor();
  if (
    !(await page
      .getByRole("dialog", { name: "Armazenamento e sessão" })
      .isVisible())
  ) {
    await page.getByRole("button", { name: "Configurações locais" }).click();
  }
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const panel = document.querySelector(".settings-panel");
    const panelRect = panel?.getBoundingClientRect();
    return {
      bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
      rootOverflow: root.scrollWidth - root.clientWidth,
      panelHeight: panelRect?.height ?? 0,
      panelWidth: panelRect?.width ?? 0,
      viewportWidth: window.innerWidth,
    };
  });
  assert.ok(
    layout.bodyOverflow <= 1 && layout.rootOverflow <= 1,
    `settings should not overflow horizontally at ${viewport.width}px: ${JSON.stringify(
      layout,
    )}`,
  );
  assert.ok(layout.panelWidth > 0, "settings panel should remain visible");
  assert.ok(
    layout.panelWidth <= layout.viewportWidth,
    `settings panel should fit viewport: ${JSON.stringify(layout)}`,
  );
}

async function assertUiScaleControls(page) {
  const group = page.getByRole("group", { name: "Escala da interface" });
  await group.getByRole("button", { name: /^Padrão/ }).click();
  const standard = await fontTokens(page);
  await group.getByRole("button", { name: /^Grande/ }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.uiScale === "large",
  );
  const large = await fontTokens(page);
  await group.getByRole("button", { name: /^Extra/ }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.uiScale === "extra",
  );
  const extra = await fontTokens(page);

  assert.ok(
    large.sm > standard.sm,
    "large UI scale should increase body controls",
  );
  assert.ok(
    extra.sm > large.sm,
    "extra UI scale should increase body controls",
  );
  assert.ok(
    extra.controlHeight > standard.controlHeight,
    "extra UI scale should increase control height",
  );
}

async function assertVisualPresetBrowserA11y(page) {
  const browser = page.locator(".visual-preset-browser");
  if (!(await browser.count())) return;

  const categoryTab = browser.getByRole("tab").first();
  const firstPreset = browser
    .getByRole("button", { name: /^Selecionar atmosfera / })
    .first();
  await assertFocusVisible(page, categoryTab);
  await assertFocusVisible(page, firstPreset);
  assert.ok(
    ["true", "false"].includes(await categoryTab.getAttribute("aria-selected")),
    "atmosphere category tab should expose aria-selected",
  );
  assert.ok(
    ["true", "false"].includes(await firstPreset.getAttribute("aria-pressed")),
    "atmosphere card should expose aria-pressed",
  );
}

async function fontTokens(page) {
  return page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return {
      sm: Number.parseFloat(css.getPropertyValue("--font-sm")),
      controlHeight: Number.parseFloat(
        css.getPropertyValue("--control-height"),
      ),
    };
  });
}

function themeButtonPattern(theme) {
  return {
    dark: /^Escuro/,
    golden: /^Golden/,
    light: /^Claro/,
    original: /^Original/,
  }[theme];
}

async function assertFocusVisible(page, locator) {
  await locator.focus();
  const focus = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  assert.ok(
    focus.outlineWidth >= 2 || focus.boxShadow !== "none",
    `focused control should have a visible focus indicator: ${JSON.stringify(
      focus,
    )}`,
  );
}

function contrastRatio(foreground, background) {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  const lighter = Math.max(luminance(fg), luminance(bg));
  const darker = Math.min(luminance(fg), luminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance([red, green, blue]) {
  const channels = [red, green, blue].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function parseColor(value) {
  const color = value.trim();
  if (color.startsWith("#")) return parseHex(color);
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length < 3) {
    throw new Error(`Unsupported color value: ${value}`);
  }
  return channels;
}

function parseHex(value) {
  const raw = value.slice(1);
  if (raw.length === 3) {
    return raw.split("").map((char) => Number.parseInt(char + char, 16));
  }
  if (raw.length === 6) {
    return [0, 2, 4].map((index) =>
      Number.parseInt(raw.slice(index, index + 2), 16),
    );
  }
  throw new Error(`Unsupported hex color: ${value}`);
}

function normalizeColor(value) {
  return parseColor(value).join(",");
}
