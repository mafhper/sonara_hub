import fs from "node:fs";
import path from "node:path";

export function formatCrashReport(error, { pid = process.pid } = {}) {
  const lines = [
    `timestamp: ${new Date().toISOString()}`,
    `pid: ${pid}`,
    `node: ${process.version}`,
    `platform: ${process.platform} ${process.arch}`,
    `uptimeSeconds: ${Math.round(process.uptime())}`,
    `argv: ${JSON.stringify(process.argv)}`,
    `memory: ${JSON.stringify(process.memoryUsage())}`,
    "",
  ];
  if (error instanceof Error) {
    lines.push(`${error.name}: ${error.message}`);
    if (error.stack) lines.push("", error.stack);
    if (error.cause !== undefined)
      lines.push("", `cause: ${String(error.cause)}`);
  } else {
    lines.push(String(error));
  }
  return `${lines.join("\n")}\n`;
}

// Last-gasp reporter for otherwise silent fatal exits: persists the full stack
// plus runtime context so an unexpected server death leaves evidence behind.
// Exits the process afterwards because continuing after an uncaught
// exception risks corrupted jobs and half-written outputs.
export function installCrashReporter(directory) {
  fs.mkdirSync(directory, { recursive: true });
  let reporting = false;
  process.on("uncaughtException", (error) => {
    if (reporting) return;
    reporting = true;
    const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
    const filePath = path.join(directory, `crash-${stamp}.log`);
    let persisted = false;
    try {
      fs.writeFileSync(filePath, formatCrashReport(error), "utf8");
      persisted = true;
    } catch {
      // Disk may be unavailable; still surface the failure on stderr below.
    }
    const summary = persisted
      ? `Falha fatal registrada em ${filePath}\n`
      : `Falha fatal e nao foi possivel gravar o relatorio em ${filePath}\n`;
    try {
      fs.writeSync(2, summary);
      fs.writeSync(2, formatCrashReport(error));
    } catch {
      // Nothing else can be done while crashing.
    }
    process.exit(1);
  });
}
