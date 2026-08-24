export const benchmarkMatrixCells = Object.freeze([
  Object.freeze({ id: "A", gpu: "software", encoder: "software" }),
  Object.freeze({ id: "B", gpu: "hardware", encoder: "software" }),
  Object.freeze({ id: "C", gpu: "software", encoder: "hardware" }),
  Object.freeze({ id: "D", gpu: "hardware", encoder: "hardware" }),
]);

export const defaultMatrixCaseIds = Object.freeze([
  "plasma-720p-fast",
  "clouds-sun-1080p-auto",
]);

export function isTruthyFlag(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

export function resolveMatrixCells(selection = "") {
  const rawSelection = String(selection ?? "").trim();
  const requested = rawSelection.toLowerCase();
  if (!requested || requested === "*" || requested === "all") {
    return [...benchmarkMatrixCells];
  }
  const picked = [];
  for (const token of rawSelection.split(",").map((value) => value.trim())) {
    if (!token) continue;
    const cell = benchmarkMatrixCells.find(
      (item) => item.id === token.toUpperCase(),
    );
    if (!cell) throw new Error(`Unknown benchmark matrix cell: ${token}`);
    if (!picked.includes(cell)) picked.push(cell);
  }
  if (!picked.length) throw new Error("Empty benchmark matrix cell selection");
  return picked;
}

export function selectMatrixCases(cases, explicitSelection) {
  if (String(explicitSelection ?? "").trim()) return cases;
  const preferred = new Set(defaultMatrixCaseIds);
  const picked = cases.filter((item) => preferred.has(item.id));
  return picked.length ? picked : cases;
}

export function matrixCaseForCell(benchCase, cell) {
  return { ...benchCase, id: `${benchCase.id}__${cell.id}` };
}

export function applyMatrixCellEnvironment(cell, environment = process.env) {
  const previous = {
    gpu: environment.SONARA_GPU_MODE,
    encoder: environment.SONARA_ENCODER_MODE,
  };
  environment.SONARA_GPU_MODE = cell.gpu;
  environment.SONARA_ENCODER_MODE = cell.encoder;
  return previous;
}

export function restoreMatrixCellEnvironment(
  previous,
  environment = process.env,
) {
  if (!previous) return;
  if (previous.gpu === undefined) delete environment.SONARA_GPU_MODE;
  else environment.SONARA_GPU_MODE = previous.gpu;
  if (previous.encoder === undefined) delete environment.SONARA_ENCODER_MODE;
  else environment.SONARA_ENCODER_MODE = previous.encoder;
}
