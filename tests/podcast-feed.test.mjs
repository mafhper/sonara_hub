import assert from "node:assert/strict";
import test from "node:test";
import { XMLParser } from "fast-xml-parser";
import { buildPodcastFeedGroups } from "../shared/podcast-metadata.mjs";
import {
  buildPodcastFeedSidecar,
  buildPodcastRssXml,
  podcastFeedFileStem,
} from "../shared/podcast-feed.mjs";

test("podcast feed sidecar and RSS preserve feed and episode publication data", () => {
  const [group] = buildPodcastFeedGroups([
    podcastTrack("02 Segundo episodio.mp3", {
      title: "Segundo episodio",
      album: "Falando de Produto",
      albumArtist: "Maria Host",
      artist: "Convidado B",
      recordingDate: "2026-02-02",
      trackNumber: 2,
      diskNumber: 1,
      description: "Notas do segundo episodio",
      durationSeconds: 1800,
      sizeBytes: 4321,
    }),
    podcastTrack("01 Primeiro episodio.mp3", {
      title: "Primeiro episodio",
      album: "Falando de Produto",
      albumArtist: "Maria Host",
      artist: "Maria Host",
      recordingDate: "2026-01-20",
      trackNumber: 1,
      diskNumber: 1,
      description: "Notas do primeiro episodio",
      lyrics: "Transcricao do primeiro episodio",
      durationSeconds: 3661,
      sizeBytes: 1234,
      podcastVoiceProfile: "broadcast",
      podcastTrimSilence: true,
      podcastVoiceBoost: true,
      podcastPlaybackSpeed: 1.05,
      podcastIntroInsert: "intro-produto.mp3",
      podcastAdInsert: "apoio-produto.mp3",
      podcastEpisodeArtworkUrl: "https://example.com/podcast/ep1.jpg",
      podcastEpisodeLink: "https://example.com/podcast/primeiro",
      podcastEpisodeLinks:
        "https://example.com/referencias\nNotas | https://example.com/notas",
      podcastDonationUrl: "https://example.com/apoie",
    }),
  ]);

  const sidecar = buildPodcastFeedSidecar(group, {
    generatedAt: "2026-03-01T10:00:00.000Z",
    feedDescription: "Conversas sobre produto e criacao.",
    feedLink: "https://example.com/podcast",
    artworkUrl: "https://example.com/podcast/cover.jpg",
    ownerEmail: "podcast@example.com",
    audioBaseUrl: "https://cdn.example.com/audio",
    guidBaseUrl: "https://example.com/guid",
  });

  assert.equal(podcastFeedFileStem(group), "falando-de-produto");
  assert.equal(sidecar.feed.title, "Falando de Produto");
  assert.equal(sidecar.feed.author, "Maria Host");
  assert.equal(sidecar.rss.fileName, "falando-de-produto.rss.xml");
  assert.equal(sidecar.checks.ready, true);
  assert.deepEqual(sidecar.checks.findings, []);
  assert.deepEqual(
    sidecar.episodes.map((episode) => episode.title),
    ["Primeiro episodio", "Segundo episodio"],
  );
  assert.equal(
    sidecar.episodes[0].enclosureUrl,
    "https://cdn.example.com/audio/01%20Primeiro%20episodio.mp3",
  );
  assert.equal(sidecar.episodes[0].enclosureLengthBytes, 1234);
  assert.equal(sidecar.episodes[0].hasTranscript, true);
  assert.equal(
    sidecar.episodes[0].artworkUrl,
    "https://example.com/podcast/ep1.jpg",
  );
  assert.equal(
    sidecar.episodes[0].link,
    "https://example.com/podcast/primeiro",
  );
  assert.deepEqual(sidecar.episodes[0].links, [
    "https://example.com/referencias",
    "Notas | https://example.com/notas",
  ]);
  assert.equal(sidecar.episodes[0].donationUrl, "https://example.com/apoie");
  assert.deepEqual(sidecar.episodes[0].processing, {
    voiceProfile: "broadcast",
    voiceProfileLabel: "Broadcast",
    trimSilence: true,
    voiceBoost: true,
    playbackSpeed: 1.05,
    nonDestructive: true,
  });
  assert.deepEqual(sidecar.episodes[0].inserts, [
    {
      type: "intro",
      label: "Abertura",
      source: "intro-produto.mp3",
    },
    {
      type: "midroll",
      label: "Intervalo",
      source: "apoio-produto.mp3",
    },
  ]);

  const rss = buildPodcastRssXml(sidecar);
  const parsed = new XMLParser({
    attributeNamePrefix: "@_",
    ignoreAttributes: false,
  }).parse(rss);
  const channel = parsed.rss.channel;
  const items = Array.isArray(channel.item) ? channel.item : [channel.item];

  assert.equal(parsed.rss["@_version"], "2.0");
  assert.equal(channel.title, "Falando de Produto");
  assert.equal(channel["itunes:author"], "Maria Host");
  assert.equal(channel["itunes:image"]["@_href"], sidecar.feed.artworkUrl);
  assert.equal(items[0].title, "Primeiro episodio");
  assert.equal(items[0].link, "https://example.com/podcast/primeiro");
  assert.equal(
    items[0]["itunes:image"]["@_href"],
    "https://example.com/podcast/ep1.jpg",
  );
  assert.equal(items[0]["itunes:duration"], "01:01:01");
  assert.equal(items[0]["itunes:season"], 1);
  assert.equal(items[0]["itunes:episode"], 1);
  assert.equal(
    items[0].enclosure["@_url"],
    "https://cdn.example.com/audio/01%20Primeiro%20episodio.mp3",
  );
});

test("podcast feed sidecar reports publication gaps without hiding the export", () => {
  const [group] = buildPodcastFeedGroups([
    podcastTrack("sem-tags.mp3", {
      title: "",
      album: "Feed sem publicar",
      durationSeconds: 600,
      metadataPartial: true,
    }),
  ]);

  const sidecar = buildPodcastFeedSidecar(group, {
    generatedAt: "2026-03-01T10:00:00.000Z",
  });

  assert.equal(sidecar.checks.ready, false);
  assert.deepEqual(
    sidecar.checks.findings.map((finding) => [
      finding.severity,
      finding.scope,
      finding.field,
    ]),
    [
      ["error", "feed", "description"],
      ["error", "feed", "link"],
      ["warning", "feed", "artworkUrl"],
      ["error", "episode", "enclosureUrl"],
      ["warning", "episode", "description"],
      ["warning", "episode", "metadataPartial"],
    ],
  );
  assert.match(buildPodcastRssXml(sidecar), /<rss version="2.0"/);
});

test("podcast feed encodes media URL path segments component-wise", () => {
  const [group] = buildPodcastFeedGroups([
    podcastTrack("Temporada 1/Ep #1? abertura.mp3", {
      title: "Abertura",
      album: "Feed reservado",
      albumArtist: "Host",
      durationSeconds: 600,
      sizeBytes: 2048,
    }),
  ]);

  const sidecar = buildPodcastFeedSidecar(group, {
    feedDescription: "Feed com caracteres reservados.",
    feedLink: "https://example.com/feed",
    audioBaseUrl: "https://cdn.example.com/audio",
  });

  assert.equal(
    sidecar.episodes[0].enclosureUrl,
    "https://cdn.example.com/audio/Temporada%201/Ep%20%231%3F%20abertura.mp3",
  );
  assert.equal(
    buildPodcastRssXml(sidecar).includes("Ep%20%231%3F%20abertura.mp3"),
    true,
  );
});

function podcastTrack(sourceKey, values) {
  const {
    album = "",
    albumArtist = "",
    artist = "",
    description = "",
    diskNumber = 1,
    durationSeconds = null,
    genre = "Podcast",
    lyrics = "",
    metadataPartial = false,
    podcastAdInsert = "",
    podcastIntroInsert = "",
    podcastOutroInsert = "",
    podcastPlaybackSpeed = 1,
    podcastTrimSilence = false,
    podcastVoiceBoost = false,
    podcastVoiceProfile = "natural",
    podcastDonationUrl = "",
    podcastEpisodeArtworkUrl = "",
    podcastEpisodeLink = "",
    podcastEpisodeLinks = "",
    recordingDate = "",
    sizeBytes = null,
    title = "",
    trackNumber = 1,
  } = values;
  return {
    sourceKey,
    metadata: {
      title,
      artist,
      album,
      albumArtist,
      genre,
      description,
      comment: "",
      composer: "",
      year: "",
      recordingDate,
      lyrics,
      trackNumber,
      diskNumber,
      podcastVoiceProfile,
      podcastTrimSilence,
      podcastVoiceBoost,
      podcastPlaybackSpeed,
      podcastIntroInsert,
      podcastOutroInsert,
      podcastAdInsert,
      podcastEpisodeArtworkUrl,
      podcastEpisodeLink,
      podcastEpisodeLinks,
      podcastDonationUrl,
    },
    audioInfo: {
      fileName: sourceKey,
      sizeBytes,
      title,
      artist,
      album,
      albumArtist,
      genre,
      description,
      comment: "",
      composer: "",
      year: "",
      date: recordingDate,
      lyrics,
      track: trackNumber,
      disk: diskNumber,
      durationSeconds,
      metadataPartial,
    },
  };
}
