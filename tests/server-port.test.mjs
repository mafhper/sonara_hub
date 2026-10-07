import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveServerPort } from "../server/server-port.mjs";
import { API_PORT, CLIENT_PORT } from "../ports.mjs";

// Os numeros vem de `ports.mjs`, nao escritos a mao. Este arquivo existe para
// provar a GUARDA: se `PORT` vier com a porta do cliente (o Vite injeta isso em
// algumas ferramentas de preview), `dev:server` recua para a da API em vez de
// tentar abrir a mesma porta duas vezes.
test("server port defaults to the local API port", () => {
  assert.equal(resolveServerPort({}), API_PORT);
  assert.equal(API_PORT, 4310);
});

test("server port honors PORT outside the dev server lifecycle", () => {
  assert.equal(resolveServerPort({ PORT: "5050" }), 5050);
});

test("dev server ignores the Vite client port injected by preview tools", () => {
  assert.equal(
    resolveServerPort({
      PORT: String(CLIENT_PORT),
      npm_lifecycle_event: "dev:server",
    }),
    API_PORT,
  );
});

test("SONARA_API_PORT overrides preview-injected PORT", () => {
  assert.equal(
    resolveServerPort({
      PORT: String(CLIENT_PORT),
      SONARA_API_PORT: "4180",
      npm_lifecycle_event: "dev:server",
    }),
    4180,
  );
});
