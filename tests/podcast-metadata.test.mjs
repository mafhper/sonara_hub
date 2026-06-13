import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPodcastFeedGroups,
  extractPodcastEpisodeMetadata,
  hasEmbeddedPodcastMetadata,
  hasPodcastEpisodeMetadata,
} from "../shared/podcast-metadata.mjs";

test("podcast feed groups keep feed and episode metadata separate", () => {
  const tracks = [
    podcastTrack("ep-2", {
      title: "Segundo episodio",
      album: "Falando de Produto",
      albumArtist: "Maria Host",
      artist: "Convidado B",
      recordingDate: "2026-02-02",
      trackNumber: 2,
      diskNumber: 1,
      description: "Notas do segundo episodio",
      durationSeconds: 1800,
      metadataPartial: true,
    }),
    podcastTrack("ep-1", {
      title: "Primeiro episodio",
      album: "Falando de Produto",
      albumArtist: "Maria Host",
      artist: "Maria Host",
      recordingDate: "2026-01-20",
      trackNumber: 1,
      diskNumber: 1,
      lyrics: "Transcricao do primeiro episodio",
      durationSeconds: 1200,
    }),
    podcastTrack("other-1", {
      title: "Piloto",
      album: "Outro Feed",
      albumArtist: "Joao Host",
      trackNumber: 1,
      diskNumber: 1,
      durationSeconds: 600,
    }),
  ];

  const groups = buildPodcastFeedGroups(tracks);

  assert.deepEqual(
    groups.map((group) => group.name),
    ["Falando de Produto", "Outro Feed"],
  );
  assert.deepEqual(
    groups[0].tracks.map((track) => track.sourceKey),
    ["ep-1.mp3", "ep-2.mp3"],
  );
  assert.equal(groups[0].author, "Maria Host");
  assert.equal(groups[0].metadataCount, 2);
  assert.equal(groups[0].descriptionCount, 1);
  assert.equal(groups[0].transcriptCount, 1);
  assert.equal(groups[0].partialCount, 1);
  assert.equal(groups[0].totalDurationSeconds, 3000);
  assert.equal(groups[0].latestPublishedAt, "2026-02-02");
});

test("podcast episode metadata falls back without marking source-only titles complete", () => {
  const track = podcastTrack("folder/03 - Sem Tags.mp3", {});

  const metadata = extractPodcastEpisodeMetadata(track);

  assert.equal(metadata.title, "03 - Sem Tags");
  assert.equal(metadata.feedName, "Podcast sem identificação");
  assert.equal(hasEmbeddedPodcastMetadata(track), false);
  assert.equal(hasPodcastEpisodeMetadata(track), false);
});

function podcastTrack(sourceKey, values) {
  const {
    album = "",
    albumArtist = "",
    artist = "",
    description = "",
    diskNumber = 1,
    durationSeconds = null,
    genre = "",
    lyrics = "",
    metadataPartial = false,
    recordingDate = "",
    title = "",
    trackNumber = 1,
  } = values;
  return {
    sourceKey: sourceKey.endsWith(".mp3") ? sourceKey : `${sourceKey}.mp3`,
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
    },
    audioInfo: {
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
