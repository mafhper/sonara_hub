import assert from "node:assert/strict";
import { chromium } from "playwright";

const clientUrl = process.env.SONARA_CLIENT_URL ?? "http://127.0.0.1:5173";
const alphaBytes = [...makeWave(220)];
const betaBytes = [...makeWave(330)];

const browser = await chromium.launch({ headless: true });

try {
  await testStoredHandlePermissionFallback(browser);
  await testExternalProjectFolderFlow(browser);
  await testUnreadableExternalAssetDoesNotBlockProjectSnapshot(browser);
  await testInternalProjectPrefersSonaraSnapshot(browser);
} finally {
  await browser.close();
}

async function testStoredHandlePermissionFallback(browser) {
  const scenario = await createScenarioPage(browser, {
    storedDeniedHandles: true,
    routeApi: routeMinimalApi,
  });
  const { page } = scenario;
  try {
    await page.goto(clientUrl, { waitUntil: "domcontentloaded" });
    await page.locator(".studio-shell").waitFor();
    await assertSetupFieldText(page, "Pasta de entrada", [
      "input",
      "input/ interno da raiz",
    ]);
    await assertSetupFieldText(page, "Pasta de saída", [
      "outputs",
      "outputs/ interno da raiz",
    ]);
    assert.equal(
      await page.locator(".track-row").count(),
      0,
      "boot must not load tracks before folder confirmation",
    );

    await page
      .getByRole("button", { name: "Confirmar pastas e continuar" })
      .click();
    await page
      .getByRole("button", { name: "Restaurar última sessão" })
      .waitFor();
    await page.getByRole("button", { name: "Restaurar última sessão" }).click();
    await assertSetupFieldText(page, "Pasta de entrada", [
      "input",
      "input/ interno da raiz",
    ]);
    await assertSetupFieldText(page, "Pasta de saída", [
      "outputs",
      "outputs/ interno da raiz",
    ]);
    assert.equal(
      await page.locator(".track-row").count(),
      0,
      "restore with denied handles must stay on internal empty workspace",
    );
    await scenario.assertClean();
  } finally {
    await scenario.close();
  }
}

async function testExternalProjectFolderFlow(browser) {
  const scenario = await createScenarioPage(browser, {
    routeApi: routeExternalAudioAnalyzeApi,
  });
  const { page } = scenario;
  try {
    await page.goto(clientUrl, { waitUntil: "domcontentloaded" });
    await page.locator(".studio-shell").waitFor();
    assert.equal(await page.title(), "Sonara Hub");

    await page
      .getByRole("button", { name: "Confirmar pastas e continuar" })
      .click();
    await page
      .locator(".setup-actions, .setup-project-select")
      .first()
      .waitFor();
    assert.equal(
      await page.locator(".track-row").count(),
      0,
      "confirming folders must not auto-load a project",
    );
    assert.equal(
      await page.evaluate(() => window.__sonaraMockFS.dump().alphaState),
      "",
    );

    await setupField(page, "Pasta de entrada").getByRole("button").click();
    const projectSelect = page
      .locator(".library-project-picker select")
      .first();
    await projectSelect.waitFor();
    assert.equal(await projectSelect.locator("option").count(), 2);
    assert.deepEqual(await projectSelect.locator("option").allTextContents(), [
      "Projeto Alpha (1 música)",
      "Projeto Beta (1 música)",
    ]);
    assert.equal(await projectSelect.inputValue(), "Projeto Alpha");
    await page
      .locator(".project-profile", { hasText: "Projeto Alpha" })
      .waitFor();
    await page.locator(".track-row", { hasText: "alpha" }).waitFor();
    await page.waitForFunction(
      () => window.__sonaraMockFS.dump().objectUrlsCreated > 0,
    );
    await page.getByRole("tab", { name: "Letra" }).click();
    await page.getByText("Letras detectadas").waitFor();
    await page.waitForFunction(() =>
      document
        .querySelector(".inspector-panel textarea")
        ?.value.includes("Primeira linha alpha"),
    );
    await page.getByRole("tab", { name: "Dados" }).click();

    await page.evaluate(() => window.__sonaraMockFS.setInputPickMode("empty"));
    await page.getByRole("button", { name: "Abrir Setup" }).click();
    await setupField(page, "Pasta de entrada").getByRole("button").click();
    assert.equal(
      await page.locator(".setup-project-select").inputValue(),
      "Projeto Alpha",
      "empty external folder selection must preserve the loaded project",
    );
    await page.evaluate(() => window.__sonaraMockFS.setInputPickMode("normal"));

    await setupField(page, "Pasta de saída").getByRole("button").click();
    await assertSetupFieldText(
      page,
      "Pasta de saída",
      ["Mock Saida", "pasta autorizada"],
      { allowAuthorized: true },
    );
    await page
      .locator('input[type="file"][accept="image/*,.svg"]')
      .setInputFiles({
        name: "manual-cover.png",
        mimeType: "image/png",
        buffer: tinyPng(),
      });
    await page.getByRole("button", { name: "Estúdio visual" }).click();
    await page
      .locator('input[type="file"][accept="image/*,video/*,.svg"]')
      .setInputFiles({
        name: "manual-layer.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#48a"/></svg>',
        ),
      });
    await page.getByText("Camadas · 1/3").waitFor();
    await page.getByRole("button", { name: "Biblioteca de áudio" }).click();
    await page.getByRole("tab", { name: "Dados" }).click();

    const titleInput = page
      .locator(".inspector-scroll label.field", { hasText: "Título" })
      .locator("input")
      .first();
    await titleInput.fill("Alpha Editado");
    try {
      await page.waitForFunction(
        () => {
          const dump = window.__sonaraMockFS.dump();
          return (
            dump.alphaState.includes("Alpha Editado") &&
            dump.alphaState.includes('"assetManifest"') &&
            dump.alphaState.includes('"coverAssetId"') &&
            dump.alphaState.includes('"assetId"') &&
            dump.alphaAssets.length >= 2
          );
        },
        null,
        { timeout: 7_000 },
      );
    } catch (reason) {
      const dump = await page.evaluate(() => window.__sonaraMockFS.dump());
      throw new Error(
        `Alpha project snapshot was not fully persisted: ${JSON.stringify(dump)}`,
        { cause: reason },
      );
    }

    await page.getByRole("button", { name: "Salvar como" }).click();
    const saveDialog = page.getByRole("dialog", {
      name: "Salvar configuração",
    });
    await saveDialog.getByLabel("Nome do save").fill("Save Noite");
    await saveDialog.getByRole("button", { name: "Salvar" }).click();
    await page.waitForFunction(
      () =>
        window.__sonaraMockFS
          .dump()
          .alphaSaves["save-noite"]?.includes("Alpha Editado"),
      null,
      { timeout: 7_000 },
    );

    await titleInput.fill("Alpha Noite");
    await page.waitForFunction(
      () => {
        const dump = window.__sonaraMockFS.dump();
        return (
          dump.alphaState.includes("Alpha Editado") &&
          !dump.alphaState.includes("Alpha Noite") &&
          dump.alphaSaves["save-noite"]?.includes("Alpha Noite")
        );
      },
      null,
      { timeout: 7_000 },
    );

    await page.locator(".project-save-select").selectOption("default");
    await page.waitForFunction(() =>
      document
        .querySelector(".inspector-scroll label.field input")
        ?.value.includes("Alpha Editado"),
    );
    await page.locator(".project-save-select").selectOption("save-noite");
    await page.waitForFunction(() =>
      document
        .querySelector(".inspector-scroll label.field input")
        ?.value.includes("Alpha Noite"),
    );
    await page.getByRole("button", { name: "Excluir" }).click();
    const deleteSaveDialog = page.getByRole("dialog", {
      name: "Excluir save?",
    });
    await deleteSaveDialog
      .getByRole("button", { name: "Excluir save" })
      .click();
    await page.waitForFunction(
      () => !("save-noite" in window.__sonaraMockFS.dump().alphaSaves),
      null,
      { timeout: 7_000 },
    );

    await page.locator(".setup-project-select").selectOption("Projeto Beta");
    await page.waitForFunction(
      () => window.__sonaraMockFS.dump().objectUrlsRevoked > 0,
    );
    const betaTitleInput = page
      .locator(".inspector-scroll label.field", { hasText: "Título" })
      .locator("input")
      .first();
    await page.waitForFunction(() =>
      document
        .querySelector(".inspector-scroll label.field input")
        ?.value.includes("beta"),
    );
    await betaTitleInput.fill("Beta Editado");
    await page.waitForFunction(
      () => window.__sonaraMockFS.dump().betaState.includes("Beta Editado"),
      null,
      { timeout: 7_000 },
    );

    await page.locator(".setup-project-select").selectOption("Projeto Alpha");
    await page.waitForFunction(() =>
      document
        .querySelector(".inspector-scroll label.field input")
        ?.value.includes("Alpha Editado"),
    );
    await page.getByRole("button", { name: "Estúdio visual" }).click();
    await page.getByText("Camadas · 1/3").waitFor();
    const restoredSnapshot = JSON.parse(
      await page.evaluate(() => window.__sonaraMockFS.dump().alphaState),
    );
    assert.deepEqual(
      restoredSnapshot.assetManifest.files
        .map((file) => file.originalName)
        .sort(),
      ["manual-cover.png", "manual-layer.svg"],
    );

    await page.getByRole("button", { name: "Configurações locais" }).click();
    await page.getByLabel("Selecionar Projeto Alpha para limpeza").check();
    await page.getByLabel("Selecionar Projeto Beta para limpeza").check();
    await page.getByRole("button", { name: "Limpar selecionados" }).click();
    const cleanupDialog = page.getByRole("dialog", {
      name: "Limpar projetos selecionados?",
    });
    await cleanupDialog.waitFor();
    await cleanupDialog
      .getByRole("button", { name: "Limpar selecionados", exact: true })
      .click();
    await page
      .getByText("Preferências dos projetos selecionados limpas.")
      .waitFor();
    assert.equal(
      await page.evaluate(() => window.__sonaraMockFS.dump().alphaState),
      "",
    );
    assert.deepEqual(
      await page.evaluate(() => window.__sonaraMockFS.dump().alphaAssets),
      [],
    );
    assert.equal(
      await page.evaluate(() => window.__sonaraMockFS.dump().betaState),
      "",
    );
    assert.deepEqual(
      await page.evaluate(() => window.__sonaraMockFS.dump().betaAssets),
      [],
    );

    await scenario.assertClean();
  } finally {
    await scenario.close();
  }
}

async function testUnreadableExternalAssetDoesNotBlockProjectSnapshot(browser) {
  const scenario = await createScenarioPage(browser, {
    routeApi: routeExternalAudioAnalyzeApi,
    unreadableAssetNames: ["stale-layer.svg"],
  });
  const { page } = scenario;
  try {
    await page.goto(clientUrl, { waitUntil: "domcontentloaded" });
    await page.locator(".studio-shell").waitFor();
    await page
      .getByRole("button", { name: "Confirmar pastas e continuar" })
      .click();
    await setupField(page, "Pasta de entrada").getByRole("button").click();
    await page.locator(".track-row", { hasText: "alpha" }).waitFor();

    await page.getByRole("button", { name: "Estúdio visual" }).click();
    await page
      .locator('input[type="file"][accept="image/*,video/*,.svg"]')
      .setInputFiles({
        name: "stale-layer.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#b44"/></svg>',
        ),
      });
    await page.getByText("Camadas · 1/3").waitFor();
    await page.getByRole("button", { name: "Biblioteca de áudio" }).click();
    await page.getByRole("tab", { name: "Dados" }).click();

    await page
      .locator(".inspector-scroll label.field", { hasText: "Título" })
      .locator("input")
      .first()
      .fill("Stale Asset Editado");
    await page.waitForFunction(
      () =>
        window.__sonaraMockFS.dump().alphaState.includes("Stale Asset Editado"),
      null,
      { timeout: 7_000 },
    );
    const snapshot = JSON.parse(
      await page.evaluate(() => window.__sonaraMockFS.dump().alphaState),
    );
    assert.equal(
      snapshot.tracks[0].layers.length,
      0,
      "unreadable manual layers must be omitted instead of blocking the project snapshot save",
    );
    assert.deepEqual(
      await page.evaluate(() => window.__sonaraMockFS.dump().alphaAssets),
      [],
    );
    await scenario.assertClean();
  } finally {
    await scenario.close();
  }
}

async function testInternalProjectPrefersSonaraSnapshot(browser) {
  const internalSnapshotPuts = [];
  const scenario = await createScenarioPage(browser, {
    globalSnapshot: emptyGlobalSnapshot(),
    routeApi: (page) => routeInternalProjectApi(page, internalSnapshotPuts),
  });
  const { page } = scenario;
  try {
    await page.goto(clientUrl, { waitUntil: "domcontentloaded" });
    await page.locator(".studio-shell").waitFor();
    await page
      .getByRole("button", { name: "Confirmar pastas e continuar" })
      .click();
    await page.getByRole("button", { name: "Restaurar última sessão" }).click();
    await page
      .locator(".track-row", { hasText: "Saved Internal Title" })
      .waitFor();
    await page.waitForTimeout(900);

    assert.equal(
      internalSnapshotPuts.length,
      0,
      "restoring an internal project must not save the global empty snapshot over .sonara",
    );
    await scenario.assertClean();
  } finally {
    await scenario.close();
  }
}

async function createScenarioPage(
  browser,
  {
    storedDeniedHandles = false,
    globalSnapshot = null,
    routeApi = null,
    unreadableAssetNames = [],
  } = {},
) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
  });
  await context.addInitScript(
    ({
      alphaBytes,
      betaBytes,
      storedDeniedHandles,
      globalSnapshot,
      unreadableAssetNames,
    }) => {
      const createdObjectUrls = [];
      const revokedObjectUrls = [];
      const unreadableAssets = new Set(unreadableAssetNames);
      const nativeFileArrayBuffer = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function arrayBuffer() {
        if (unreadableAssets.has(this.name)) {
          return Promise.reject(
            new DOMException("Mock unreadable file", "NotReadableError"),
          );
        }
        return nativeFileArrayBuffer.call(this);
      };
      const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
      const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (value) => {
        const url = nativeCreateObjectURL(value);
        createdObjectUrls.push(url);
        return url;
      };
      URL.revokeObjectURL = (url) => {
        revokedObjectUrls.push(url);
        nativeRevokeObjectURL(url);
      };

      class MockFileHandle {
        constructor(name, payload, type = "application/octet-stream") {
          this.kind = "file";
          this.name = name;
          this.payload = payload;
          this.type = type;
          this.textPayload = typeof payload === "string" ? payload : "";
        }

        async getFile() {
          if (typeof this.payload === "string") {
            return new File([this.payload], this.name, { type: this.type });
          }
          return new File([Uint8Array.from(this.payload)], this.name, {
            type: this.type,
          });
        }

        async createWritable() {
          return {
            write: async (data) => {
              if (typeof data === "string") {
                this.payload = data;
                this.textPayload = data;
                this.type = "application/json";
                return;
              }
              const buffer = await new Response(data).arrayBuffer();
              this.payload = Array.from(new Uint8Array(buffer));
              this.textPayload = "";
            },
            close: async () => {},
          };
        }
      }

      class MockDirectoryHandle {
        constructor(name, children = {}, permission = "granted") {
          this.kind = "directory";
          this.name = name;
          this.children = children;
          this.permission = permission;
        }

        async *entries() {
          for (const entry of Object.entries(this.children)) yield entry;
        }

        async getDirectoryHandle(name, options = {}) {
          const found = this.children[name];
          if (found?.kind === "directory") return found;
          if (options.create) {
            const created = new MockDirectoryHandle(name);
            this.children[name] = created;
            return created;
          }
          throw new DOMException(
            `Directory not found: ${name}`,
            "NotFoundError",
          );
        }

        async getFileHandle(name, options = {}) {
          const found = this.children[name];
          if (found?.kind === "file") return found;
          if (options.create) {
            const created = new MockFileHandle(name, "", "application/json");
            this.children[name] = created;
            return created;
          }
          throw new DOMException(`File not found: ${name}`, "NotFoundError");
        }

        async removeEntry(name) {
          delete this.children[name];
        }

        async queryPermission() {
          return this.permission;
        }

        async requestPermission() {
          return this.permission;
        }
      }

      const alpha = new MockDirectoryHandle("Projeto Alpha", {
        "alpha.wav": new MockFileHandle("alpha.wav", alphaBytes, "audio/wav"),
        lyrics: new MockDirectoryHandle("lyrics", {
          "alpha.txt": new MockFileHandle(
            "alpha.txt",
            "Primeira linha alpha\nSegunda linha alpha",
            "text/plain",
          ),
        }),
      });
      const beta = new MockDirectoryHandle("Projeto Beta", {
        "beta.wav": new MockFileHandle("beta.wav", betaBytes, "audio/wav"),
      });
      const inputRoot = new MockDirectoryHandle("Mock Entrada", {
        "Projeto Alpha": alpha,
        "Projeto Beta": beta,
      });
      const outputRoot = new MockDirectoryHandle("Mock Saida");
      const emptyInputRoot = new MockDirectoryHandle("Entrada Vazia");
      const deniedInputRoot = new MockDirectoryHandle(
        "Entrada Bloqueada",
        {},
        "denied",
      );
      const deniedOutputRoot = new MockDirectoryHandle(
        "Saida Bloqueada",
        {},
        "denied",
      );
      let inputPickMode = "normal";

      const workspaceStore = new Map();
      if (storedDeniedHandles) {
        workspaceStore.set("input-directory", deniedInputRoot);
        workspaceStore.set("music-directory", deniedInputRoot);
        workspaceStore.set("output-directory", deniedOutputRoot);
      }
      if (globalSnapshot) workspaceStore.set("snapshot", globalSnapshot);
      installFakeIndexedDb(workspaceStore);

      window.__sonaraMockFS = {
        dump() {
          const readProjectState = (project) =>
            project.children[".sonara"]?.children?.["project.json"]
              ?.textPayload ?? "";
          const readProjectSaves = (project) =>
            Object.fromEntries(
              Object.entries(
                project.children[".sonara"]?.children?.saves?.children ?? {},
              )
                .filter(([, entry]) => entry.kind === "file")
                .map(([name, entry]) => [
                  name.replace(/\.json$/i, ""),
                  entry.textPayload,
                ]),
            );
          const readProjectAssets = (project) =>
            Object.keys(
              project.children[".sonara"]?.children?.assets?.children ?? {},
            );
          return {
            alphaAssets: readProjectAssets(alpha),
            alphaSaves: readProjectSaves(alpha),
            alphaState: readProjectState(alpha),
            betaAssets: readProjectAssets(beta),
            betaSaves: readProjectSaves(beta),
            betaState: readProjectState(beta),
            objectUrlsCreated: createdObjectUrls.length,
            objectUrlsRevoked: revokedObjectUrls.length,
            outputName: outputRoot.name,
            workspaceStoreKeys: Array.from(workspaceStore.keys()),
          };
        },
        setInputPickMode(mode) {
          inputPickMode = mode;
        },
      };
      window.showDirectoryPicker = async (options = {}) => {
        if (String(options.id ?? "").includes("output")) return outputRoot;
        return inputPickMode === "empty" ? emptyInputRoot : inputRoot;
      };

      function installFakeIndexedDb(store) {
        Object.defineProperty(window, "indexedDB", {
          configurable: true,
          value: {
            open() {
              const openRequest = {};
              const db = {
                objectStoreNames: { contains: () => true },
                createObjectStore: () => ({}),
                transaction() {
                  const transaction = {
                    objectStore() {
                      return {
                        get(key) {
                          const request = {};
                          queueMicrotask(() => {
                            request.result = store.get(key);
                            request.onsuccess?.();
                          });
                          return request;
                        },
                        put(value, key) {
                          store.set(key, value);
                          queueMicrotask(() => transaction.oncomplete?.());
                        },
                      };
                    },
                    oncomplete: null,
                    onerror: null,
                    error: null,
                  };
                  return transaction;
                },
                close() {},
              };
              queueMicrotask(() => {
                openRequest.result = db;
                openRequest.onupgradeneeded?.();
                openRequest.onsuccess?.();
              });
              return openRequest;
            },
          },
        });
      }
    },
    {
      alphaBytes,
      betaBytes,
      storedDeniedHandles,
      globalSnapshot,
      unreadableAssetNames,
    },
  );
  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    const text = message.text();
    if (text.includes("AudioContext was not allowed")) return;
    if (text.includes("GPU stall due to ReadPixels")) return;
    errors.push(`${message.type()}: ${text}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`,
    );
  });
  if (routeApi) await routeApi(page);
  return {
    page,
    async assertClean() {
      assert.deepEqual(failedRequests, []);
      assert.deepEqual(errors, []);
    },
    async close() {
      await context.close();
    },
  };
}

async function routeMinimalApi(page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/project") {
      await json(route, {
        projectRoot: "mock",
        inputDirectory: "input",
        outputDirectory: "outputs",
        inputProjects: [],
        inputAudios: [],
        inputArtwork: [],
        inputLyrics: [],
        defaultMetadata: {},
      });
      return;
    }
    if (url.pathname === "/api/visual-presets") {
      await json(route, {});
      return;
    }
    if (url.pathname === "/api/jobs") {
      await json(route, { jobs: [], queuePaused: false });
      return;
    }
    await route.continue();
  });
}

async function routeExternalAudioAnalyzeApi(page) {
  await page.route("**/api/audio/analyze", async (route) => {
    const body = route.request().postData() ?? "";
    const isBeta = body.includes("beta.wav");
    await json(route, {
      metadata: {
        fileName: isBeta ? "beta.wav" : "alpha.wav",
        durationSeconds: 2,
        bitrate: 128000,
        codec: "pcm_s16le",
        title: isBeta ? "beta" : "alpha",
        artist: "",
        album: isBeta ? "Projeto Beta" : "Projeto Alpha",
        track: 1,
        trackTotal: 1,
        disk: 1,
        diskTotal: 1,
        sampleRate: 8000,
        channels: 1,
        analysis: safeAnalysis(),
        suggestions: {},
      },
      analysis: safeAnalysis(),
      suggestions: {},
    });
  });
}

async function routeInternalProjectApi(page, snapshotPuts) {
  const savedSnapshot = internalSavedSnapshot();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/project") {
      const projectId = url.searchParams.get("project");
      await json(route, internalProjectPayload(projectId));
      return;
    }
    if (url.pathname === "/api/internal-snapshot") {
      if (request.method() === "GET") {
        await json(route, savedSnapshot);
        return;
      }
      if (request.method() === "PUT") {
        snapshotPuts.push(request.postData() ?? "");
        await json(route, { ok: true });
        return;
      }
    }
    if (url.pathname === "/api/visual-presets") {
      await json(route, {});
      return;
    }
    if (url.pathname === "/api/jobs") {
      await json(route, { jobs: [], queuePaused: false });
      return;
    }
    if (url.pathname === "/api/audio/analyze") {
      await json(route, {
        metadata: internalAudioInfo("Internal Album/alpha.wav"),
        analysis: safeAnalysis(),
        suggestions: {},
      });
      return;
    }
    if (url.pathname.startsWith("/api/audio/")) {
      await route.fulfill({
        contentType: "audio/wav",
        body: makeWave(440),
      });
      return;
    }
    await route.continue();
  });
}

function internalProjectPayload(projectId) {
  const inputProjects = [
    {
      id: "Internal Album",
      name: "Internal Album",
      path: "Internal Album",
      trackCount: 1,
    },
  ];
  return {
    projectRoot: "mock",
    inputDirectory: "input",
    outputDirectory: "outputs",
    inputProject: projectId,
    inputProjects,
    inputAudios: projectId
      ? [
          {
            name: "Internal Album/alpha.wav",
            metadata: internalAudioInfo("Internal Album/alpha.wav"),
          },
        ]
      : [],
    inputArtwork: [],
    inputLyrics: [],
    defaultMetadata: {},
  };
}

function internalAudioInfo(fileName) {
  return {
    fileName,
    durationSeconds: 2,
    bitrate: 128000,
    codec: "pcm_s16le",
    title: "Internal Base Title",
    artist: "Internal Artist",
    album: "Internal Album",
    track: 1,
    trackTotal: 1,
    disk: 1,
    diskTotal: 1,
    sampleRate: 8000,
    channels: 1,
    analysis: safeAnalysis(),
    suggestions: {},
  };
}

function internalSavedSnapshot() {
  return {
    schemaVersion: 4,
    workspaceMode: "visual",
    workflowMode: "single",
    audioStageView: "edit",
    visualStageView: "editor",
    activeStep: "music",
    selectedTrackId: "internal-alpha",
    outputPreset: "youtube-1080p",
    qualityProfile: "auto",
    publicationPresetId: "youtube-thumbnail",
    publicationClipStart: 0,
    publicationClipDuration: 15,
    publicationIncludeLyrics: false,
    publicationAssetMode: "single",
    publicationAssetOverrides: {},
    showMetadata: true,
    coverSeriesSettings: {},
    tracks: [
      {
        id: "internal-alpha",
        sourceKey: "Internal Album/alpha.wav",
        source: "input",
        metadata: {
          title: "Saved Internal Title",
          artist: "Saved Artist",
          album: "Internal Album",
          tags: "saved",
          lyrics: "",
        },
        outputBaseName: "",
        audioInfo: internalAudioInfo("Internal Album/alpha.wav"),
        layers: [],
        selectedForBatch: false,
        packageStatus: "idle",
        useSuggestedCover: true,
        thumbnailPreviewMode: "composition",
        coverSeriesOverride: null,
      },
    ],
  };
}

function emptyGlobalSnapshot() {
  return {
    schemaVersion: 4,
    workspaceMode: "visual",
    workflowMode: "single",
    audioStageView: "edit",
    visualStageView: "editor",
    activeStep: "music",
    selectedTrackId: "",
    outputPreset: "youtube-1080p",
    qualityProfile: "auto",
    publicationPresetId: "youtube-thumbnail",
    publicationClipStart: 0,
    publicationClipDuration: 15,
    publicationIncludeLyrics: false,
    publicationAssetMode: "single",
    publicationAssetOverrides: {},
    showMetadata: true,
    coverSeriesSettings: {},
    tracks: [],
  };
}

function safeAnalysis() {
  return {
    integratedLufs: -14,
    truePeakDbtp: -1.2,
    loudnessRangeLu: 4,
    samplePeakDbfs: -2,
    risk: "safe",
    recommendation: "none",
  };
}

function setupField(page, label) {
  return page.locator(".setup-field", {
    has: page.locator(".setup-field-label", { hasText: label }),
  });
}

async function assertSetupFieldText(
  page,
  label,
  expectedParts,
  { allowAuthorized = false } = {},
) {
  const field = setupField(page, label);
  await field.waitFor();
  const text = (await field.textContent()) ?? "";
  for (const part of expectedParts)
    assert.match(text, new RegExp(escapeRegExp(part)));
  if (!allowAuthorized) assert.doesNotMatch(text, /pasta autorizada/i);
}

async function json(route, payload) {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  header.write("WAVE", 8);
  header.write("fmt ", 12);
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

function tinyPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGOSHzRgAAAAABJRU5ErkJggg==",
    "base64",
  );
}
