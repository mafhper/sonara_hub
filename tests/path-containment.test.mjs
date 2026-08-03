import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertOwnedPath } from "../server/path-containment.mjs";

test("owned paths reject lexical escapes and directory links", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-owned-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-unowned-"));
  try {
    const nested = path.join(root, "album", "track.mp3");
    await fs.mkdir(path.dirname(nested), { recursive: true });
    await fs.writeFile(nested, "audio");
    assert.equal(await assertOwnedPath(root, nested), path.resolve(nested));
    await assert.rejects(assertOwnedPath(root, path.join(root, "..", "x")));

    const linked = path.join(root, "linked");
    await fs.symlink(outside, linked, "junction");
    await assert.rejects(
      assertOwnedPath(root, path.join(linked, "track.mp3")),
      {
        message: "Links simbólicos não são aceitos.",
      },
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});
