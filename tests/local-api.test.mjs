import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  fetchJson,
  fetchJsonWithRetry,
  fetchOptional,
} from "../shared/local-api.mjs";

test("local API retries transient responses before succeeding", async () => {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests += 1;
    if (requests < 3) {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "reiniciando" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ready: true }));
  });
  const url = await listen(server);
  try {
    assert.deepEqual(
      await fetchJsonWithRetry(url, undefined, { attempts: 3, delayMs: 1 }),
      { ready: true },
    );
    assert.equal(requests, 3);
  } finally {
    server.close();
  }
});

test("local API reports an actionable message when the server is offline", async () => {
  const server = http.createServer();
  const url = await listen(server);
  await new Promise((resolve) => server.close(resolve));

  await assert.rejects(() => fetchJson(url), /servidor local.*indisponível/i);
});

test("optional file copy ignores a missing thumbnail", async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  const url = await listen(server);
  try {
    assert.equal(await fetchOptional(url), null);
  } finally {
    server.close();
  }
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}
