import fs from "node:fs/promises";
import path from "node:path";
import {
  buildPodcastRssXml,
  PODCAST_FEED_SIDECAR_VERSION,
  PODCAST_RSS_FILE_EXTENSION,
} from "../shared/podcast-feed.mjs";
import { sanitizePublicationFilePart } from "../shared/publication-assets.mjs";

export const PODCAST_FEED_JSON_EXTENSION = ".podcast.json";

export class PodcastFeedOutputError extends Error {
  constructor(message, code = "PODCAST_FEED_INVALID") {
    super(message);
    this.name = "PodcastFeedOutputError";
    this.code = code;
  }
}

export function parsePodcastFeedOutputRequest(body) {
  const sidecar = parseSidecar(body?.sidecar);
  return {
    fileBaseName: firstText(body?.fileBaseName),
    sidecar,
  };
}

export async function writePodcastFeedOutputs({
  fileBaseName,
  outputDir,
  sidecar,
}) {
  const normalized = normalizePodcastFeedSidecar(sidecar, fileBaseName);
  const rssXml = buildPodcastRssXml(normalized);
  const sidecarJson = `${JSON.stringify(normalized, null, 2)}\n`;
  const rssPath = path.join(outputDir, normalized.rss.fileName);
  const sidecarFileName = `${podcastOutputStem(normalized.rss.fileName)}${PODCAST_FEED_JSON_EXTENSION}`;
  const sidecarPath = path.join(outputDir, sidecarFileName);

  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(rssPath, rssXml, "utf8"),
    fs.writeFile(sidecarPath, sidecarJson, "utf8"),
  ]);

  return {
    rssFileName: normalized.rss.fileName,
    rssPath,
    sidecar: normalized,
    sidecarFileName,
    sidecarPath,
    findingCount: normalized.checks.findings.length,
    ready: normalized.checks.ready,
  };
}

export function normalizePodcastFeedSidecar(sidecar, fileBaseName) {
  if (!sidecar || typeof sidecar !== "object" || Array.isArray(sidecar)) {
    throw new PodcastFeedOutputError("Sidecar de podcast inválido.");
  }
  if (sidecar.kind !== "sonara-podcast-feed") {
    throw new PodcastFeedOutputError(
      "Sidecar de podcast precisa ter kind sonara-podcast-feed.",
    );
  }
  if (!sidecar.feed || typeof sidecar.feed !== "object") {
    throw new PodcastFeedOutputError("Feed de podcast ausente no sidecar.");
  }
  if (!Array.isArray(sidecar.episodes)) {
    throw new PodcastFeedOutputError(
      "Episódios do podcast precisam estar em uma lista.",
    );
  }

  const stem = podcastOutputStem(
    fileBaseName ||
      sidecar.rss?.fileName ||
      sidecar.feed.id ||
      sidecar.feed.title,
  );
  const owner =
    sidecar.feed.owner &&
    typeof sidecar.feed.owner === "object" &&
    !Array.isArray(sidecar.feed.owner)
      ? sidecar.feed.owner
      : {};
  return {
    ...sidecar,
    version: Number(sidecar.version) || PODCAST_FEED_SIDECAR_VERSION,
    generatedAt: firstText(sidecar.generatedAt) || new Date().toISOString(),
    feed: {
      ...sidecar.feed,
      id: firstText(sidecar.feed.id) || stem,
      title: firstText(sidecar.feed.title) || "Podcast",
      owner: {
        ...owner,
        name: firstText(owner.name, sidecar.feed.author),
        email: firstText(owner.email),
      },
    },
    rss: {
      ...(sidecar.rss ?? {}),
      fileName: `${stem}${PODCAST_RSS_FILE_EXTENSION}`,
      format: "RSS 2.0",
    },
    episodes: sidecar.episodes,
    checks: normalizeChecks(sidecar.checks),
  };
}

export function podcastOutputStem(value) {
  const raw = firstText(value);
  const fileName = raw.split(/[\\/]+/).pop() || raw;
  const withoutPodcastJson = stripSuffix(fileName, PODCAST_FEED_JSON_EXTENSION);
  const withoutRss = stripSuffix(
    withoutPodcastJson,
    PODCAST_RSS_FILE_EXTENSION,
  );
  const withoutExtension = withoutRss.replace(/\.[^.]+$/u, "");
  return sanitizePublicationFilePart(withoutExtension, "podcast-feed");
}

function normalizeChecks(checks) {
  const findings = Array.isArray(checks?.findings) ? checks.findings : [];
  return {
    ready:
      typeof checks?.ready === "boolean"
        ? checks.ready
        : findings.every((finding) => finding?.severity !== "error"),
    findings,
  };
}

function parseSidecar(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new PodcastFeedOutputError("JSON do sidecar de podcast inválido.");
    }
  }
  return value;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function stripSuffix(value, suffix) {
  return value.toLowerCase().endsWith(suffix)
    ? value.slice(0, -suffix.length)
    : value;
}
