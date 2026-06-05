import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { multipartJobRoute } from "../server/multipart-route.mjs";
import { createTempFileRegistry } from "../server/temp-files.mjs";

test("multipart job route cleans uploads and returns stable JSON on submit failure", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-route-"));
  const upload = path.join(root, "upload.tmp");
  await fs.writeFile(upload, "temp");
  const errors = [];
  const route = multipartJobRoute({
    code: "RENDER_SUBMIT_ERROR",
    handler: async () => {
      throw new Error("Falha de submissao");
    },
    logUnexpectedError: (context, error) => {
      errors.push({ context, message: error.message });
    },
    tempFiles: createTempFileRegistry(root),
  });
  const response = fakeResponse();

  await route(
    {
      file: { path: upload },
      method: "POST",
      originalUrl: "/api/render",
    },
    response,
    () => assert.fail("next should not be called before headers are sent"),
  );

  await assert.rejects(fs.stat(upload), { code: "ENOENT" });
  assert.deepEqual(response.payload, {
    code: "RENDER_SUBMIT_ERROR",
    error: "Falha de submissao",
  });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(errors, [
    { context: "POST /api/render", message: "Falha de submissao" },
  ]);
  await fs.rm(root, { recursive: true, force: true });
});

test("multipart job route delegates after headers are sent", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-route-"));
  const upload = path.join(root, "upload.tmp");
  await fs.writeFile(upload, "temp");
  const route = multipartJobRoute({
    handler: async () => {
      throw new Error("stream failed");
    },
    tempFiles: createTempFileRegistry(root),
  });
  const response = fakeResponse();
  response.headersSent = true;
  let delegated = null;

  await route(
    {
      file: { path: upload },
      method: "POST",
      originalUrl: "/api/render",
    },
    response,
    (error) => {
      delegated = error;
    },
  );

  assert.equal(delegated?.message, "stream failed");
  assert.equal(response.payload, null);
  await assert.rejects(fs.stat(upload), { code: "ENOENT" });
  await fs.rm(root, { recursive: true, force: true });
});

function fakeResponse() {
  return {
    headersSent: false,
    payload: null,
    statusCode: 200,
    json(payload) {
      this.payload = payload;
      this.headersSent = true;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
  };
}
