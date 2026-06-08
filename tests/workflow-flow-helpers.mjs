import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { fetchJsonWithRetry } from "../shared/local-api.mjs";

export const terminalJobStatuses = ["done", "error", "canceled"];

export function createMp3(filePath, frequency, { duration = 2 } = {}) {
  const result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${frequency}:duration=${duration}`,
      "-ac",
      "2",
      "-ar",
      "44100",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      filePath,
    ],
    { windowsHide: true },
  );
  if (result.status !== 0) throw new Error(result.stderr.toString());
}

export async function waitForAudioJobs(
  apiUrl,
  titles,
  timeoutMs = 120_000,
  { createdAfter = 0 } = {},
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { jobs } = await fetchJsonWithRetry(`${apiUrl}/api/jobs`);
    const matching = titles
      .map((title) =>
        jobs.find((job) => {
          const createdAt = Date.parse(job.createdAt);
          return (
            job.kind === "audio-process" &&
            job.metadata?.title === title &&
            (!createdAfter || createdAt >= createdAfter)
          );
        }),
      )
      .filter(Boolean);
    if (
      matching.length === titles.length &&
      matching.every((job) => terminalJobStatuses.includes(job.status))
    ) {
      return matching;
    }
    await delay(750);
  }
  throw new Error(`Timed out waiting for audio jobs: ${titles.join(", ")}`);
}

export async function waitForJob(apiUrl, id, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await fetchJsonWithRetry(`${apiUrl}/api/jobs/${id}`);
    if (terminalJobStatuses.includes(job.status)) return job;
    await delay(1000);
  }
  throw new Error(`Timed out waiting for job ${id}`);
}

export async function downloadOutput(apiUrl, outputUrl, filePath) {
  const response = await fetch(new URL(outputUrl, apiUrl));
  if (!response.ok) throw new Error(`download failed ${response.status}`);
  await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
}

export async function downloadJsonOutput(apiUrl, outputUrl) {
  const response = await fetch(new URL(outputUrl, apiUrl));
  if (!response.ok) throw new Error(`json download failed ${response.status}`);
  return response.json();
}

export function openWithFfmpeg(filePath) {
  const result = spawnSync(
    ffmpegPath,
    ["-v", "error", "-i", filePath, "-f", "null", "-"],
    { windowsHide: true },
  );
  if (result.status !== 0) throw new Error(result.stderr.toString());
}

export function decodeFinalFrame(inputPath, outputPath) {
  const result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-v",
      "error",
      "-sseof",
      "-0.2",
      "-i",
      inputPath,
      "-frames:v",
      "1",
      outputPath,
    ],
    { windowsHide: true },
  );
  if (result.status !== 0) throw new Error(result.stderr.toString());
}

export async function removeOutputUrl(root, outputUrl) {
  if (!outputUrl?.startsWith("/outputs/")) return;
  const relativePath = decodeURIComponent(outputUrl.slice("/outputs/".length));
  const targetPath = path.resolve(root, "outputs", relativePath);
  const outputsRoot = path.resolve(root, "outputs");
  if (!targetPath.startsWith(outputsRoot + path.sep)) return;
  await fs.rm(targetPath, { force: true });
  let currentDirectory = path.dirname(targetPath);
  while (
    currentDirectory !== outputsRoot &&
    currentDirectory.startsWith(outputsRoot + path.sep)
  ) {
    try {
      await fs.rmdir(currentDirectory);
      currentDirectory = path.dirname(currentDirectory);
    } catch {
      break;
    }
  }
}

export function stageTimingMs(job) {
  return round(
    (job.stageTimings ?? []).reduce(
      (total, stage) => total + finiteNumber(stage.durationMs),
      0,
    ),
  );
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForCondition(check, label, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function round(value) {
  return Math.round(value * 100) / 100;
}
