import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("dev client waits until the local API accepts connections", async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"ready":true}');
  });
  await listen(server, 0);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await close(server);

  const delayedStart = setTimeout(() => server.listen(port, "127.0.0.1"), 80);
  try {
    const result = await runNode([
      "server/wait-for-local-api.mjs",
      `http://127.0.0.1:${port}`,
      "--timeout-ms=1500",
      "--interval-ms=20",
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /API local pronta/);
  } finally {
    clearTimeout(delayedStart);
    if (server.listening) await close(server);
  }
});

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function runNode(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
