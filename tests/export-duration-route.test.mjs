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

test("POST /api/publication-assets aceita duração acima do antigo teto do preset", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-route-"));
  const wavPath = path.join(tmpDir, "tone.wav");
  await writeSilentWav(wavPath, 1);

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

  try {
    await waitForApi(port);

    const body = new FormData();
    body.append(
      "audio",
      new Blob([await fs.readFile(wavPath)], { type: "audio/wav" }),
      "tone.wav",
    );
    body.append("publicationPresetId", "clip-vertical");
    body.append("clipDuration", "120");

    const response = await fetch(
      `http://127.0.0.1:${port}/api/publication-assets`,
      {
        method: "POST",
        body,
      },
    );
    assert.equal(response.status, 200);
    const responseBody = await response.json();
    assert.match(responseBody.jobId, /^[0-9a-f-]{36}$/i);
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

async function writeSilentWav(filePath, seconds) {
  const sampleRate = 44100;
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataBytes = Math.floor(seconds * sampleRate * blockAlign);
  const fileSize = 44 + dataBytes;

  const buf = Buffer.alloc(fileSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(fileSize - 8, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);

  await fs.writeFile(filePath, buf);
}

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
