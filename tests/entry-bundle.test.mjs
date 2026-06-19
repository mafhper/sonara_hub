import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("benchmark dashboard is emitted as a route-only dynamic chunk", async () => {
  const result = await build({
    configFile: path.join(root, "vite.config.ts"),
    logLevel: "silent",
    build: { write: false },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(
    (item) => item.output,
  );
  const chunks = outputs.filter((item) => item.type === "chunk");
  const entry = chunks.find((item) => item.isEntry);
  const benchmark = chunks.find((item) =>
    item.facadeModuleId
      ?.replaceAll("\\", "/")
      .endsWith("/src/BenchmarkDashboard.tsx"),
  );

  assert.ok(entry, "Vite should emit the application entry chunk");
  assert.ok(benchmark, "Vite should emit a dedicated benchmark route chunk");
  assert.equal(benchmark.isDynamicEntry, true);
  assert.ok(entry.dynamicImports.includes(benchmark.fileName));
});
