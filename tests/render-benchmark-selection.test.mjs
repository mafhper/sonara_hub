import test from "node:test";
import assert from "node:assert/strict";
import { selectBenchmarkCases } from "./render-benchmark-selection.mjs";

const cases = [
  { id: "audio-dark-720p-fast" },
  { id: "playful-720p-fast" },
  { id: "piano-ribbons-720p-fast" },
];

test("benchmark case selection preserves the complete matrix by default", () => {
  assert.equal(selectBenchmarkCases(cases, ""), cases);
  assert.equal(selectBenchmarkCases(cases), cases);
});

test("benchmark case selection accepts a comma-separated subset", () => {
  assert.deepEqual(
    selectBenchmarkCases(cases, "playful-720p-fast,piano-ribbons-720p-fast"),
    cases.slice(1),
  );
});

test("benchmark case selection rejects unknown identifiers", () => {
  assert.throws(
    () => selectBenchmarkCases(cases, "missing-case"),
    /Unknown benchmark case: missing-case/u,
  );
});
