const args = process.argv.slice(2);
const endpoint =
  args.find((argument) => !argument.startsWith("--")) ??
  "http://127.0.0.1:4175/api/visual-presets";
const timeoutMs = readNumberOption(args, "--timeout-ms", 30_000);
const intervalMs = readNumberOption(args, "--interval-ms", 200);
const deadline = Date.now() + timeoutMs;

while (Date.now() < deadline) {
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(Math.min(intervalMs, 1_000)),
    });
    if (response.ok) {
      console.log(`API local pronta em ${endpoint}`);
      process.exit(0);
    }
  } catch {
    // The server process is still initializing; retry until the deadline.
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

console.error(`API local não respondeu em ${endpoint} após ${timeoutMs} ms.`);
process.exit(1);

function readNumberOption(values, name, fallback) {
  const prefix = `${name}=`;
  const raw = values
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
