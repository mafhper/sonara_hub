import assert from "node:assert/strict";
import test from "node:test";
import { directoryImportPrefix } from "../shared/audio-import.mjs";

test("directory picker preserves the selected root folder as metadata context", () => {
  assert.equal(directoryImportPrefix("Matheus Lima"), "Matheus Lima");
  assert.equal(
    directoryImportPrefix(" Jardim dos Ventos "),
    "Jardim dos Ventos",
  );
});

test("directory picker ignores blank root labels", () => {
  assert.equal(directoryImportPrefix("  "), "");
});
