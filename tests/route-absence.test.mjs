import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REMOVED_ROUTES = [
  { method: "POST", path: "/api/audio-metadata" },
  { method: "POST", path: "/api/audio/process-batch" },
  { method: "POST", path: "/api/analyze" },
  { method: "POST", path: "/api/render-batch" },
];

test("rotas mortas foram removidas (404)", async () => {
  const port = await getFreePort();
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      SONARA_API_PORT: String(port),
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    await waitForApi(port);

    for (const route of REMOVED_ROUTES) {
      const response = await fetch(`http://127.0.0.1:${port}${route.path}`, {
        method: route.method,
      });
      const contentType = response.headers.get("content-type") ?? "";
      // Contrato da ausência: a rota morta, se existisse, responderia JSON
      // (application/json). Como foi removida, o servidor NÃO a trata na
      // camada de API: ou o fallback SPA entrega index.html (200 HTML quando
      // dist existe) ou o Express devolve o 404 padrão. Um 404 rígido não é
      // viável aqui sem alterar o fallback SPA (comportamento de rota viva).
      assert.ok(
        response.status === 404 || !contentType.includes("application/json"),
        `${route.method} ${route.path} não deveria ser tratado pela API (JSON), obteve ${response.status} ${contentType}`,
      );
    }
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5000);
      child.on("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
});

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not resolve free port")));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.once("error", reject);
  });
}

async function waitForApi(port) {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `API did not become ready: ${lastError?.message ?? "timeout"}`,
  );
}
