export const UNKNOWN_PODCAST_FEED = "Podcast sem identificação";
export const UNKNOWN_PODCAST_EPISODE = "Episódio sem título";

export function buildPodcastFeedGroups(tracks) {
  const groups = new Map();
  for (const track of tracks) {
    const metadata = extractPodcastEpisodeMetadata(track);
    const id = normalizePodcastGroupId(metadata.feedName);
    const group = groups.get(id) ?? {
      id,
      name: metadata.feedName,
      author: metadata.feedAuthor,
      metadata: extractPodcastFeedMetadata(track),
      tracks: [],
      taggedCount: 0,
      metadataCount: 0,
      descriptionCount: 0,
      transcriptCount: 0,
      partialCount: 0,
      totalDurationSeconds: null,
      latestPublishedAt: "",
    };
    group.tracks.push(track);
    if (!group.author && metadata.feedAuthor)
      group.author = metadata.feedAuthor;
    if (hasEmbeddedPodcastMetadata(track)) group.taggedCount += 1;
    if (hasPodcastEpisodeMetadata(track)) group.metadataCount += 1;
    if (metadata.hasDescription) group.descriptionCount += 1;
    if (metadata.hasTranscript) group.transcriptCount += 1;
    if (metadata.metadataPartial) group.partialCount += 1;
    if (Number.isFinite(metadata.durationSeconds)) {
      group.totalDurationSeconds =
        (group.totalDurationSeconds ?? 0) + metadata.durationSeconds;
    }
    if (
      metadata.publishedAt &&
      (!group.latestPublishedAt ||
        compareText(metadata.publishedAt, group.latestPublishedAt) > 0)
    ) {
      group.latestPublishedAt = metadata.publishedAt;
    }
    groups.set(id, group);
  }
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      tracks: [...group.tracks].sort(comparePodcastEpisodes),
      episodeCount: group.tracks.length,
      metadata: {
        ...group.metadata,
        author: group.author || group.metadata.author,
      },
    }))
    .sort((first, second) => compareText(first.name, second.name));
}

export function extractPodcastFeedMetadata(track) {
  const metadata = track?.metadata ?? {};
  const info = track?.audioInfo ?? {};
  const title =
    firstText(
      metadata.album,
      info.album,
      metadata.albumArtist,
      info.albumArtist,
      metadata.artist,
      info.artist,
    ) || UNKNOWN_PODCAST_FEED;
  return {
    id: normalizePodcastGroupId(title),
    title,
    author: firstText(
      metadata.albumArtist,
      info.albumArtist,
      metadata.artist,
      info.artist,
      metadata.composer,
      info.composer,
    ),
    category: firstText(metadata.genre, info.genre),
  };
}

export function extractPodcastEpisodeMetadata(track) {
  const metadata = track?.metadata ?? {};
  const info = track?.audioInfo ?? {};
  const feed = extractPodcastFeedMetadata(track);
  const title =
    firstText(metadata.title, info.title) ||
    titleFromSourceKey(track?.sourceKey) ||
    UNKNOWN_PODCAST_EPISODE;
  const description = firstText(
    metadata.description,
    info.description,
    metadata.comment,
    info.comment,
  );
  const transcript = firstText(metadata.lyrics, info.lyrics);
  const publishedAt = firstText(
    metadata.recordingDate,
    info.date,
    metadata.year,
    info.year,
  );
  return {
    title,
    feedId: feed.id,
    feedName: feed.title,
    feedAuthor: feed.author,
    author: firstText(metadata.artist, info.artist, feed.author),
    category: feed.category,
    publishedAt,
    description,
    transcript,
    artworkUrl: firstText(metadata.podcastEpisodeArtworkUrl),
    link: firstText(metadata.podcastEpisodeLink),
    links: multilineText(metadata.podcastEpisodeLinks),
    donationUrl: firstText(metadata.podcastDonationUrl),
    seasonNumber:
      positiveNumber(metadata.diskNumber) ?? positiveNumber(info.disk),
    episodeNumber:
      positiveNumber(metadata.trackNumber) ?? positiveNumber(info.track),
    durationSeconds: finiteNumber(info.durationSeconds),
    sourceFileName: titleFromSourceKey(track?.sourceKey),
    metadataPartial: Boolean(info.metadataPartial),
    hasEmbeddedMetadata: hasEmbeddedPodcastMetadata(track),
    hasDescription: Boolean(description),
    hasTranscript: Boolean(transcript),
  };
}

export function podcastFeedName(track) {
  return extractPodcastFeedMetadata(track).title;
}

export function podcastEpisodeTitle(track) {
  return extractPodcastEpisodeMetadata(track).title;
}

export function hasEmbeddedPodcastMetadata(track) {
  const info = track?.audioInfo;
  if (!info) return false;
  return [
    info.title,
    info.artist,
    info.album,
    info.albumArtist,
    info.genre,
    info.description,
    info.comment,
    info.composer,
    info.year,
    info.date,
    info.lyrics,
  ].some((value) => String(value ?? "").trim().length > 0);
}

export function hasPodcastEpisodeMetadata(track) {
  const metadata = track?.metadata ?? {};
  const info = track?.audioInfo ?? {};
  return [
    metadata.title,
    info.title,
    metadata.album,
    info.album,
    metadata.albumArtist,
    info.albumArtist,
    metadata.artist,
    info.artist,
    metadata.description,
    info.description,
    metadata.comment,
    info.comment,
    metadata.lyrics,
    info.lyrics,
    metadata.recordingDate,
    info.date,
    metadata.year,
    info.year,
  ].some((value) => String(value ?? "").trim().length > 0);
}

export function comparePodcastEpisodes(first, second) {
  const firstMetadata = extractPodcastEpisodeMetadata(first);
  const secondMetadata = extractPodcastEpisodeMetadata(second);
  return (
    compareOptionalNumbers(
      firstMetadata.seasonNumber,
      secondMetadata.seasonNumber,
    ) ||
    compareOptionalNumbers(
      firstMetadata.episodeNumber,
      secondMetadata.episodeNumber,
    ) ||
    compareOptionalDates(
      firstMetadata.publishedAt,
      secondMetadata.publishedAt,
    ) ||
    compareText(firstMetadata.title, secondMetadata.title) ||
    compareText(first?.sourceKey ?? "", second?.sourceKey ?? "")
  );
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function multilineText(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function titleFromSourceKey(sourceKey) {
  return firstText(sourceKey)
    .split(/[\\/]+/)
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .trim();
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compareOptionalNumbers(first, second) {
  if (first !== null && second !== null && first !== second) {
    return first - second;
  }
  if (first !== null && second === null) return -1;
  if (first === null && second !== null) return 1;
  return 0;
}

function compareOptionalDates(first, second) {
  const firstKey = dateSortKey(first);
  const secondKey = dateSortKey(second);
  if (firstKey && secondKey && firstKey !== secondKey) {
    return compareText(firstKey, secondKey);
  }
  if (firstKey && !secondKey) return -1;
  if (!firstKey && secondKey) return 1;
  return 0;
}

function dateSortKey(value) {
  const text = firstText(value);
  const match = text.match(/^(\d{4})(?:[-/.]?(\d{1,2}))?(?:[-/.]?(\d{1,2}))?/);
  if (!match) return "";
  const [, year, month = "01", day = "01"] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function compareText(first, second) {
  return String(first ?? "").localeCompare(String(second ?? ""), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

function normalizePodcastGroupId(value) {
  return (
    firstText(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "sem-identificacao"
  );
}
