import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMatrixCellEnvironment,
  benchmarkMatrixCells,
  defaultMatrixCaseIds,
  isTruthyFlag,
  matrixCaseForCell,
  resolveMatrixCells,
  restoreMatrixCellEnvironment,
  selectMatrixCases,
} from "./render-benchmark-matrix.mjs";

test("matrix cells cover the GPU x encoder combinations in fixed order", () => {
  assert.deepEqual(
    benchmarkMatrixCells.map(
      (cell) => `${cell.id}:${cell.gpu}+${cell.encoder}`,
    ),
    [
      "A:software+software",
      "B:hardware+software",
      "C:software+hardware",
      "D:hardware+hardware",
    ],
  );
});

test("truthy flag parsing accepts common spellings", () => {
  assert.equal(isTruthyFlag("1"), true);
  assert.equal(isTruthyFlag(" TRUE "), true);
  assert.equal(isTruthyFlag("yes"), true);
  assert.equal(isTruthyFlag("on"), true);
  assert.equal(isTruthyFlag("0"), false);
  assert.equal(isTruthyFlag(""), false);
  assert.equal(isTruthyFlag(undefined), false);
  assert.equal(isTruthyFlag("whatever"), false);
});

test("resolveMatrixCells defaults to all cells and validates selections", () => {
  assert.deepEqual(resolveMatrixCells(), benchmarkMatrixCells);
  assert.deepEqual(resolveMatrixCells(""), benchmarkMatrixCells);
  assert.deepEqual(resolveMatrixCells("*"), benchmarkMatrixCells);
  assert.deepEqual(resolveMatrixCells("all"), benchmarkMatrixCells);
  assert.deepEqual(resolveMatrixCells("C"), [benchmarkMatrixCells[2]]);
  assert.deepEqual(resolveMatrixCells("d, a"), [
    benchmarkMatrixCells[3],
    benchmarkMatrixCells[0],
  ]);
  // Repeats collapse to a single cell instance.
  assert.deepEqual(resolveMatrixCells("A,A"), [benchmarkMatrixCells[0]]);
  assert.throws(
    () => resolveMatrixCells("E"),
    /Unknown benchmark matrix cell: E/u,
  );
  assert.throws(
    () => resolveMatrixCells(" , "),
    /Empty benchmark matrix cell/u,
  );
});

function sampleCases() {
  return [
    { id: "audio-dark-720p-fast" },
    { id: "liquid-waveform-720p-fast" },
    { id: "plasma-720p-fast" },
    { id: "stacked-atmospheres-720p-fast" },
    { id: "starfield-layers-720p-fast" },
    { id: "clouds-sun-1080p-auto" },
  ];
}

test("selectMatrixCases picks representative cases unless selection is explicit", () => {
  const cases = sampleCases();
  const preferred = selectMatrixCases(cases, "");
  assert.deepEqual(
    preferred.map((item) => item.id),
    ["plasma-720p-fast", "clouds-sun-1080p-auto"],
  );

  const explicit = selectMatrixCases(cases, "audio-dark-720p-fast");
  assert.equal(explicit, cases);

  const fallback = selectMatrixCases([{ id: "other-case" }], "");
  assert.deepEqual(fallback, [{ id: "other-case" }]);
});

test("matrix case ids are unique per cell and preserve the scene", () => {
  const benchCase = {
    id: "plasma-720p-fast",
    duration: 2,
    scene: { id: "s1" },
  };
  const cell = benchmarkMatrixCells[3];
  const combined = matrixCaseForCell(benchCase, cell);
  assert.equal(combined.id, "plasma-720p-fast__D");
  assert.equal(combined.duration, 2);
  assert.equal(combined.scene, benchCase.scene);
});

test("cell environment switching is scoped and restorable", () => {
  const environment = { SONARA_GPU_MODE: "auto" };
  const previous = applyMatrixCellEnvironment(
    benchmarkMatrixCells[1],
    environment,
  );

  assert.equal(previous.gpu, "auto");
  assert.equal(previous.encoder, undefined);
  assert.equal(environment.SONARA_GPU_MODE, "hardware");
  assert.equal(environment.SONARA_ENCODER_MODE, "software");

  restoreMatrixCellEnvironment(previous, environment);
  assert.equal(environment.SONARA_GPU_MODE, "auto");
  assert.equal("SONARA_ENCODER_MODE" in environment, false);
});

test("restoring without previous state is a no-op", () => {
  const environment = {};
  assert.doesNotThrow(() => restoreMatrixCellEnvironment(null, environment));
  assert.deepEqual(Object.keys(defaultMatrixCaseIds), ["0", "1"]);
});
