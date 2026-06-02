import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createTempFileRegistry } from "../server/temp-files.mjs";

test("temp registry removes immediate uploads and ignores outside files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-temp-"));
  const outside = path.join(os.tmpdir(), `sonara-outside-${Date.now()}.tmp`);
  const upload = path.join(root, "upload.tmp");
  await fs.writeFile(upload, "temp");
  await fs.writeFile(outside, "keep");

  const registry = createTempFileRegistry(root);
  await registry.cleanup([{ path: upload }, { path: outside }]);

  await assert.rejects(fs.stat(upload), { code: "ENOENT" });
  assert.equal((await fs.readFile(outside, "utf8")).toString(), "keep");
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(outside, { force: true });
});

test("temp registry keeps shared uploads until the final consumer releases", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-temp-"));
  const shared = path.join(root, "shared-cover.tmp");
  await fs.writeFile(shared, "cover");
  const registry = createTempFileRegistry(root);

  const releaseFirst = registry.retain({ path: shared });
  const releaseSecond = registry.retain({ path: shared });
  await releaseFirst();
  assert.equal((await fs.readFile(shared, "utf8")).toString(), "cover");
  await releaseSecond();
  await assert.rejects(fs.stat(shared), { code: "ENOENT" });
  await fs.rm(root, { recursive: true, force: true });
});
