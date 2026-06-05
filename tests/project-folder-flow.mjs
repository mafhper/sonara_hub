import assert from "node:assert/strict";
import { chromium } from "playwright";

const clientUrl = process.env.SONARA_CLIENT_URL ?? "http://127.0.0.1:5173";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
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

await page.addInitScript(
  ({ alphaBytes, betaBytes }) => {
    const createdObjectUrls = [];
    const revokedObjectUrls = [];
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
      constructor(name, children = {}) {
        this.kind = "directory";
        this.name = name;
        this.children = children;
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
        throw new DOMException(`Directory not found: ${name}`, "NotFoundError");
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
        return "granted";
      }

      async requestPermission() {
        return "granted";
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

    window.__sonaraMockFS = {
      dump() {
        const readProjectState = (project) =>
          project.children[".sonara"]?.children?.["project.json"]
            ?.textPayload ?? "";
        const readProjectAssets = (project) =>
          Object.keys(
            project.children[".sonara"]?.children?.assets?.children ?? {},
          );
        return {
          alphaAssets: readProjectAssets(alpha),
          alphaState: readProjectState(alpha),
          betaAssets: readProjectAssets(beta),
          betaState: readProjectState(beta),
          objectUrlsCreated: createdObjectUrls.length,
          objectUrlsRevoked: revokedObjectUrls.length,
          outputName: outputRoot.name,
        };
      },
    };
    window.showDirectoryPicker = async (options = {}) =>
      String(options.id ?? "").includes("output") ? outputRoot : inputRoot;
  },
  {
    alphaBytes: [...makeWave(220)],
    betaBytes: [...makeWave(330)],
  },
);

try {
  await page.goto(clientUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".studio-shell").waitFor();
  assert.equal(await page.title(), "Sonara Hub");

  await page.getByRole("button", { name: "Definir entrada" }).click();
  const projectSelect = page.locator(".library-project-picker select");
  await projectSelect.waitFor();
  assert.equal(await projectSelect.locator("option").count(), 2);
  assert.deepEqual(await projectSelect.locator("option").allTextContents(), [
    "Projeto Alpha (1 música)",
    "Projeto Beta (1 música)",
  ]);
  assert.equal(await projectSelect.inputValue(), "Projeto Alpha");
  await page
    .locator(".library-directory-row", { hasText: "Mock Entrada" })
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

  await page.getByRole("button", { name: "Definir saída" }).click();
  await page
    .locator(".library-directory-row", { hasText: "Mock Saida" })
    .waitFor();
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

  await projectSelect.selectOption("Projeto Beta");
  await page.waitForFunction(
    () =>
      document.querySelector(".library-project-picker select")?.value ===
      "Projeto Beta",
  );
  await page.locator(".track-row", { hasText: "beta" }).waitFor();
  await page.waitForFunction(
    () => window.__sonaraMockFS.dump().objectUrlsRevoked > 0,
  );

  await projectSelect.selectOption("Projeto Alpha");
  await page.waitForFunction(
    () =>
      document.querySelector(".library-project-picker select")?.value ===
      "Projeto Alpha",
  );
  await page.locator(".track-row", { hasText: "Alpha Editado" }).waitFor();
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
  await page.getByRole("button", { name: "Limpar projeto atual" }).click();
  await page.getByRole("dialog", { name: "Limpar projeto atual?" }).waitFor();
  await page
    .getByRole("button", { name: "Limpar projeto", exact: true })
    .click();
  await page.getByText("Preferências do projeto atual limpas.").waitFor();
  assert.equal(
    await page.evaluate(() => window.__sonaraMockFS.dump().alphaState),
    "",
  );
  assert.deepEqual(
    await page.evaluate(() => window.__sonaraMockFS.dump().alphaAssets),
    [],
  );

  assert.deepEqual(failedRequests, []);
  assert.deepEqual(errors, []);
} finally {
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
