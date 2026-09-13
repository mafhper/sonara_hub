import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("POST /api/publication-assets exists and rejects unreadable audio", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-route-"));
  const fakeAudio = path.join(tmpDir, "not-audio.mp3");
  await fs.writeFile(fakeAudio, "not valid mp3 content");

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

    const body = new FormData();
    const buffer = await fs.readFile(fakeAudio);
    body.append(
      "audio",
      new Blob([buffer], { type: "audio/mpeg" }),
      "not-audio.mp3",
    );

    const response = await fetch(
      `http://127.0.0.1:${port}/api/publication-assets`,
      {
        method: "POST",
        body,
      },
    );
    assert.equal(response.status, 400);
    const responseBody = await response.json();
    assert.match(responseBody.error, /corrompido|incompleto/i);
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
    await fs.rm(tmpDir, { recursive: true, force: true });
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
