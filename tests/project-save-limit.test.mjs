import assert from "node:assert/strict";
import test from "node:test";
import {
  boundedProjectSaveEntries,
  canWriteProjectSave,
} from "../server/project-save-limit.mjs";

function entry(name, isFile = true) {
  return { name, isFile: () => isFile };
}

test("project save listing is filtered, deterministic and bounded", () => {
  const entries = [
    entry("zeta.json"),
    entry("folder.json", false),
    entry("notes.txt"),
    entry("alpha.JSON"),
    entry("middle.json"),
  ];
  assert.deepEqual(
    boundedProjectSaveEntries(entries, 2).map((item) => item.name),
    ["alpha.JSON", "middle.json"],
  );
});

test("project save capacity allows updates but rejects a new save at the cap", () => {
  const entries = [entry("one.json"), entry("two.json")];
  assert.equal(canWriteProjectSave(entries, "one.json", 2), true);
  assert.equal(canWriteProjectSave(entries, "ONE.JSON", 2), true);
  assert.equal(canWriteProjectSave(entries, "three.json", 2), false);
});

test("non-save entries do not consume project save capacity", () => {
  const entries = [entry("folder.json", false), entry("notes.txt")];
  assert.equal(canWriteProjectSave(entries, "first.json", 1), true);
});
