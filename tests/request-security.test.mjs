import assert from "node:assert/strict";
import test from "node:test";
import {
  enforceLocalMutationOrigin,
  isLoopbackHttpUrl,
} from "../server/request-security.mjs";

function runMiddleware({ method = "POST", origin, fetchSite } = {}) {
  let nextCalled = false;
  let response;
  const headers = new Map([
    ["origin", origin],
    ["sec-fetch-site", fetchSite],
  ]);
  const req = {
    method,
    get: (name) => headers.get(name.toLowerCase()),
  };
  const res = {
    status(status) {
      response = { status };
      return this;
    },
    json(body) {
      response.body = body;
      return this;
    },
  };
  enforceLocalMutationOrigin(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, response };
}

test("local mutation origin accepts loopback frontends and non-browser clients", () => {
  assert.equal(
    runMiddleware({ origin: "http://127.0.0.1:5173" }).nextCalled,
    true,
  );
  assert.equal(
    runMiddleware({ origin: "http://localhost:4175" }).nextCalled,
    true,
  );
  assert.equal(runMiddleware().nextCalled, true);
});

test("local mutation origin blocks cross-site and opaque browser origins", () => {
  assert.equal(
    runMiddleware({ origin: "https://example.test" }).response.status,
    403,
  );
  assert.equal(
    runMiddleware({ origin: "null", fetchSite: "cross-site" }).response.status,
    403,
  );
});

test("loopback URL validation rejects remote and non-HTTP endpoints", () => {
  assert.equal(isLoopbackHttpUrl("http://[::1]:4175/api"), true);
  assert.equal(isLoopbackHttpUrl("https://localhost/api"), true);
  assert.equal(isLoopbackHttpUrl("https://example.test/api"), false);
  assert.equal(isLoopbackHttpUrl("file:///tmp/api"), false);
});
