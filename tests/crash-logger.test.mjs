import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { formatCrashReport } from "../server/crash-logger.mjs";

test("crash report captures identity, runtime context and the full stack", () => {
  const error = new Error("boom-crash-test");
  const report = formatCrashReport(error, { pid: 4242 });

  assert.match(report, /timestamp: /u);
  assert.match(report, /pid: 4242/u);
  assert.match(report, /memory: \{/u);
  assert.match(report, /Error: boom-crash-test/u);
  assert.match(report, /crash-logger\.test\.mjs/u);

  const stringReport = formatCrashReport("falha plana");
  assert.match(stringReport, /falha plana/u);
  assert.doesNotMatch(stringReport, /Error:/u);
});

test("uncaught exception is persisted to a crash file before exit", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "crash-dir-"));
  const crashLoggerModule = pathToFileURL(
    path.resolve("server/crash-logger.mjs"),
  ).href;
  const fixturePath = path.join(directory, "fixture.mjs");
  const fixture = [
    "import { installCrashReporter } from",
    `  ${JSON.stringify(crashLoggerModule)};`,
    `installCrashReporter(${JSON.stringify(path.join(directory, "reports"))});`,
    "setTimeout(() => {",
    '  throw new Error("boom-integration-test");',
    "}, 10);",
    "",
  ].join("\n");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(fixturePath, fixture, "utf8");

  let status = 0;
  try {
    execFileSync(process.execPath, [fixturePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
      windowsHide: true,
    });
  } catch (error) {
    status = error.status ?? 0;
  }

  assert.equal(status, 1);
  const reportsDir = path.join(directory, "reports");
  assert.ok(existsSync(reportsDir));
  const files = await readdir(reportsDir);
  assert.equal(files.length, 1);
  assert.match(files[0], /^crash-\d{4}-\d{2}-\d{2}T/u);
  const content = await readFile(path.join(reportsDir, files[0]), "utf8");
  assert.match(content, /Error: boom-integration-test/u);
  assert.match(content, /memory: \{/u);

  await rm(directory, { recursive: true, force: true });
});
