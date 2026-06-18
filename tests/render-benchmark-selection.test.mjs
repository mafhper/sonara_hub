import test from "node:test";
import assert from "node:assert/strict";
import { selectBenchmarkCases } from "./render-benchmark-selection.mjs";

const cases = [
  { id: "audio-dark-720p-fast" },
  { id: "playful-720p-fast" },
  { id: "piano-ribbons-720p-fast" },
  { id: "stacked-identical-atmospheres-720p-fast", targetedOnly: true },
];

test("benchmark case selection omits targeted-only cases by default", () => {
  assert.deepEqual(selectBenchmarkCases(cases, ""), cases.slice(0, 3));
  assert.deepEqual(selectBenchmarkCases(cases), cases.slice(0, 3));
});

test("benchmark case selection accepts a comma-separated subset", () => {
  assert.deepEqual(
    selectBenchmarkCases(cases, "playful-720p-fast,piano-ribbons-720p-fast"),
    cases.slice(1, 3),
  );
});

test("benchmark case selection includes a targeted case when requested", () => {
  assert.deepEqual(
    selectBenchmarkCases(cases, "stacked-identical-atmospheres-720p-fast"),
    cases.slice(3),
  );
});

test("benchmark case selection rejects unknown identifiers", () => {
  assert.throws(
    () => selectBenchmarkCases(cases, "missing-case"),
    /Unknown benchmark case: missing-case/u,
  );
});
