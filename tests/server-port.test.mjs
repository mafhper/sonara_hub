import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveServerPort } from "../server/server-port.mjs";

test("server port defaults to the local API port", () => {
  assert.equal(resolveServerPort({}), 4175);
});

test("server port honors PORT outside the dev server lifecycle", () => {
  assert.equal(resolveServerPort({ PORT: "5050" }), 5050);
});

test("dev server ignores the Vite client port injected by preview tools", () => {
  assert.equal(
    resolveServerPort({ PORT: "5173", npm_lifecycle_event: "dev:server" }),
    4175,
  );
});

test("SONARA_API_PORT overrides preview-injected PORT", () => {
  assert.equal(
    resolveServerPort({
      PORT: "5173",
      SONARA_API_PORT: "4180",
      npm_lifecycle_event: "dev:server",
    }),
    4180,
  );
});
