export function selectBenchmarkCases(cases, selection) {
  const requested = new Set(
    String(selection ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!requested.size) return cases.filter((item) => !item.targetedOnly);

  const available = new Set(cases.map((item) => item.id));
  for (const id of requested) {
    if (!available.has(id)) throw new Error(`Unknown benchmark case: ${id}`);
  }
  return cases.filter((item) => requested.has(item.id));
}
