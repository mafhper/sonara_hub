import { XMLBuilder } from "fast-xml-parser";
import { extractPodcastEpisodeMetadata } from "./podcast-metadata.mjs";

export const PODCAST_FEED_SIDECAR_VERSION = 1;
export const PODCAST_RSS_FILE_EXTENSION = ".rss.xml";
export const PODCAST_VOICE_PROFILES = Object.freeze([
  { id: "natural", label: "Natural" },
  { id: "broadcast", label: "Broadcast" },
  { id: "warm", label: "Voz quente" },
  { id: "clear", label: "Clareza" },
]);

export function podcastFeedFileStem(group, options = {}) {
  return (
    slugifyFilePart(options.fileBaseName) ||
    slugifyFilePart(group?.id) ||
    slugifyFilePart(group?.name) ||
    "podcast-feed"
  );
}

export function buildPodcastFeedSidecar(group, options = {}) {
  const feed = buildFeedSummary(group, options);
  const episodes = [...(group?.tracks ?? [])].map((track, index) =>
    buildEpisodeSummary(track, feed, options, index),
  );
  const checks = buildPublicationChecks(feed, episodes);
  const rssFileName =
    firstText(options.rssFileName) ||
    `${podcastFeedFileStem(group, options)}${PODCAST_RSS_FILE_EXTENSION}`;

  return {
    kind: "sonara-podcast-feed",
    version: PODCAST_FEED_SIDECAR_VERSION,
    generatedAt: firstText(options.generatedAt) || new Date().toISOString(),
    feed,
    rss: {
      fileName: rssFileName,
      format: "RSS 2.0",
      namespaces: ["itunes", "content"],
      note: "Prévia operacional: revise URLs públicas, capa e dados de publicação antes de distribuir.",
    },
    episodes,
    checks,
  };
}

export function buildPodcastRssXml(groupOrSidecar, options = {}) {
  const sidecar = isPodcastSidecar(groupOrSidecar)
    ? groupOrSidecar
    : buildPodcastFeedSidecar(groupOrSidecar, options);
  const channel = compactObject({
    title: sidecar.feed.title,
    link: sidecar.feed.link || sidecar.feed.id,
    description: sidecar.feed.description || sidecar.feed.title,
    language: sidecar.feed.language,
    copyright: sidecar.feed.copyright,
    lastBuildDate: dateToRssPubDate(sidecar.generatedAt),
    generator: "Sonara Hub",
    "itunes:author": sidecar.feed.author,
    "itunes:summary": sidecar.feed.description,
    "itunes:explicit": sidecar.feed.explicit,
    "itunes:image": sidecar.feed.artworkUrl
      ? { "@_href": sidecar.feed.artworkUrl }
      : undefined,
    "itunes:owner": sidecar.feed.owner.email
      ? compactObject({
          "itunes:name": sidecar.feed.owner.name || sidecar.feed.author,
          "itunes:email": sidecar.feed.owner.email,
        })
      : undefined,
    "itunes:category": sidecar.feed.category
      ? { "@_text": sidecar.feed.category }
      : undefined,
    item: sidecar.episodes.map((episode) => buildRssEpisodeItem(episode)),
  });

  const builder = new XMLBuilder({
    attributeNamePrefix: "@_",
    format: true,
    ignoreAttributes: false,
    suppressEmptyNode: true,
  });

  return `${builder.build({
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    rss: {
      "@_version": "2.0",
      "@_xmlns:itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd",
      "@_xmlns:content": "http://purl.org/rss/1.0/modules/content/",
      channel,
    },
  })}\n`;
}

function buildFeedSummary(group, options) {
  const metadata = group?.metadata ?? {};
  const title = firstText(options.feedTitle, metadata.title, group?.name);
  const author = firstText(options.feedAuthor, metadata.author, group?.author);
  const category = firstText(options.category, metadata.category);
  return {
    id: firstText(metadata.id, group?.id) || slugifyFilePart(title),
    title,
    author,
    category,
    description: firstText(options.feedDescription),
    link: firstText(options.feedLink),
    language: firstText(options.language) || "pt-BR",
    explicit: normalizeExplicit(options.explicit),
    copyright: firstText(options.copyright),
    artworkUrl: firstText(options.artworkUrl),
    owner: {
      name: firstText(options.ownerName, author),
      email: firstText(options.ownerEmail),
    },
    episodeCount: group?.episodeCount ?? group?.tracks?.length ?? 0,
    metadataCount: group?.metadataCount ?? 0,
    descriptionCount: group?.descriptionCount ?? 0,
    transcriptCount: group?.transcriptCount ?? 0,
    partialCount: group?.partialCount ?? 0,
    totalDurationSeconds: finiteNumber(group?.totalDurationSeconds),
    latestPublishedAt: firstText(group?.latestPublishedAt),
  };
}

function buildEpisodeSummary(track, feed, options, index) {
  const metadata = extractPodcastEpisodeMetadata(track);
  const asset = episodeAssetFor(track, options);
  const publication = episodePublicationFor(metadata, asset);
  const audioFileName = firstText(
    asset.audioFileName,
    ensureMp3FileName(track?.metadata?.outputFileName),
    ensureMp3FileName(track?.outputBaseName),
    track?.audioInfo?.fileName,
    metadata.sourceFileName,
  );
  const enclosureUrl = firstText(
    asset.enclosureUrl,
    joinUrl(options.audioBaseUrl, audioFileName),
  );
  const guid = firstText(
    asset.guid,
    joinUrl(
      options.guidBaseUrl,
      `${feed.id}/${slugifyFilePart(audioFileName)}`,
    ),
    `${feed.id}:${audioFileName || index + 1}`,
  );

  return {
    id: `${feed.id}-${index + 1}`,
    guid,
    title: metadata.title,
    author: metadata.author || feed.author,
    publishedAt: metadata.publishedAt,
    description: metadata.description,
    transcript: metadata.transcript,
    link: publication.link,
    artworkUrl: publication.artworkUrl,
    links: publication.links,
    donationUrl: publication.donationUrl,
    seasonNumber: metadata.seasonNumber,
    episodeNumber: metadata.episodeNumber,
    durationSeconds: metadata.durationSeconds,
    sourceFileName: metadata.sourceFileName,
    audioFileName,
    enclosureUrl,
    enclosureLengthBytes: finiteNumber(
      asset.lengthBytes ?? track?.audioInfo?.sizeBytes,
    ),
    enclosureType: firstText(asset.mimeType) || "audio/mpeg",
    processing: podcastProcessingFor(track?.metadata),
    inserts: podcastInsertsFor(track?.metadata),
    metadataPartial: metadata.metadataPartial,
    hasEmbeddedMetadata: metadata.hasEmbeddedMetadata,
    hasDescription: metadata.hasDescription,
    hasTranscript: metadata.hasTranscript,
  };
}

function buildRssEpisodeItem(episode) {
  return compactObject({
    title: episode.title,
    guid: { "#text": episode.guid, "@_isPermaLink": "false" },
    link: episode.link,
    pubDate: dateToRssPubDate(episode.publishedAt),
    author: episode.author,
    description: episode.description || episode.title,
    "content:encoded": episode.transcript || episode.description,
    "itunes:author": episode.author,
    "itunes:summary": episode.description,
    "itunes:duration": formatPodcastDuration(episode.durationSeconds),
    "itunes:season": episode.seasonNumber,
    "itunes:episode": episode.episodeNumber,
    "itunes:explicit": "no",
    "itunes:image": episode.artworkUrl
      ? { "@_href": episode.artworkUrl }
      : undefined,
    enclosure: episode.enclosureUrl
      ? compactObject({
          "@_url": episode.enclosureUrl,
          "@_length": episode.enclosureLengthBytes,
          "@_type": episode.enclosureType,
        })
      : undefined,
  });
}

function buildPublicationChecks(feed, episodes) {
  const findings = [];
  if (!feed.title) {
    findings.push(requiredFinding("feed", feed.id, "title"));
  }
  if (!feed.description) {
    findings.push(requiredFinding("feed", feed.id, "description"));
  }
  if (!feed.link) {
    findings.push(requiredFinding("feed", feed.id, "link"));
  }
  if (!feed.artworkUrl) {
    findings.push(warningFinding("feed", feed.id, "artworkUrl"));
  }
  for (const episode of episodes) {
    if (!episode.enclosureUrl) {
      findings.push(requiredFinding("episode", episode.id, "enclosureUrl"));
    }
    if (!episode.description) {
      findings.push(warningFinding("episode", episode.id, "description"));
    }
    if (episode.metadataPartial) {
      findings.push(warningFinding("episode", episode.id, "metadataPartial"));
    }
  }
  return {
    ready: findings.every((finding) => finding.severity !== "error"),
    findings,
  };
}

function requiredFinding(scope, id, field) {
  return {
    severity: "error",
    scope,
    id,
    field,
    message: `Campo obrigatorio ausente: ${field}.`,
  };
}

function warningFinding(scope, id, field) {
  return {
    severity: "warning",
    scope,
    id,
    field,
    message: `Revisar antes de publicar: ${field}.`,
  };
}

function episodeAssetFor(track, options) {
  const sourceKey = firstText(track?.sourceKey);
  const fileName = sourceKey.split(/[\\/]+/).pop();
  return (
    options.episodeAssets?.[sourceKey] ??
    options.episodeAssets?.[fileName] ??
    {}
  );
}

function episodePublicationFor(metadata, asset) {
  return {
    link: firstText(asset.link, metadata.link),
    artworkUrl: firstText(asset.artworkUrl, metadata.artworkUrl),
    links: uniqueTexts([
      ...multilineTexts(metadata.links),
      ...multilineTexts(asset.links),
    ]),
    donationUrl: firstText(asset.donationUrl, metadata.donationUrl),
  };
}

function podcastProcessingFor(metadata = {}) {
  const profile = podcastVoiceProfile(metadata.podcastVoiceProfile);
  return {
    voiceProfile: profile.id,
    voiceProfileLabel: profile.label,
    trimSilence: Boolean(metadata.podcastTrimSilence),
    voiceBoost: Boolean(metadata.podcastVoiceBoost),
    playbackSpeed: clampNumber(metadata.podcastPlaybackSpeed, 0.8, 1.2, 1),
    nonDestructive: true,
  };
}

function podcastInsertsFor(metadata = {}) {
  return [
    ["intro", "Abertura", metadata.podcastIntroInsert],
    ["midroll", "Intervalo", metadata.podcastAdInsert],
    ["outro", "Encerramento", metadata.podcastOutroInsert],
  ]
    .map(([type, label, source]) => ({
      type,
      label,
      source: firstText(source),
    }))
    .filter((insert) => insert.source);
}

function podcastVoiceProfile(value) {
  const id = firstText(value);
  return (
    PODCAST_VOICE_PROFILES.find((profile) => profile.id === id) ??
    PODCAST_VOICE_PROFILES[0]
  );
}

function uniqueTexts(values) {
  return [...new Set(values.map((value) => firstText(value)).filter(Boolean))];
}

function multilineTexts(value) {
  return Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function formatPodcastDuration(seconds) {
  const total = Math.round(Number(seconds));
  if (!Number.isFinite(total) || total <= 0) return undefined;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  return [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function dateToRssPubDate(value) {
  const text = firstText(value);
  if (!text) return undefined;
  const match = text.match(/^(\d{4})(?:[-/.](\d{1,2}))?(?:[-/.](\d{1,2}))?/);
  const date = match
    ? new Date(
        Date.UTC(
          Number(match[1]),
          Number(match[2] ?? 1) - 1,
          Number(match[3] ?? 1),
        ),
      )
    : new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toUTCString();
}

function joinUrl(baseUrl, path) {
  const base = firstText(baseUrl).replace(/\/+$/, "");
  const value = encodeUrlPath(firstText(path));
  if (!base || !value) return "";
  return `${base}/${value}`;
}

function encodeUrlPath(path) {
  return path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function ensureMp3FileName(value) {
  const text = firstText(value);
  if (!text) return "";
  return /\.[a-z0-9]+$/i.test(text) ? text : `${text}.mp3`;
}

function normalizeExplicit(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return firstText(value) || "no";
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function slugifyFilePart(value) {
  return firstText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function isPodcastSidecar(value) {
  return value?.kind === "sonara-podcast-feed";
}
