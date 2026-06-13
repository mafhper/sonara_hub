import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildPodcastFeedGroups } from "../shared/podcast-metadata.mjs";
import { buildPodcastFeedSidecar } from "../shared/podcast-feed.mjs";
import {
  parsePodcastFeedOutputRequest,
  podcastOutputStem,
  PodcastFeedOutputError,
  writePodcastFeedOutputs,
} from "../server/podcast-feed-output.mjs";

test("podcast feed output writes sanitized RSS and JSON artifacts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-podcast-"));
  const [group] = buildPodcastFeedGroups([
    {
      sourceKey: "01 episodio.mp3",
      metadata: {
        title: "Episodio piloto",
        album: "Feed Teste",
        albumArtist: "Host Teste",
        artist: "Host Teste",
        description: "Descricao do episodio.",
        lyrics: "",
        trackNumber: 1,
        diskNumber: 1,
      },
      audioInfo: {
        fileName: "01 episodio.mp3",
        durationSeconds: 120,
        sizeBytes: 2048,
      },
    },
  ]);
  const sidecar = buildPodcastFeedSidecar(group, {
    generatedAt: "2026-03-01T10:00:00.000Z",
    feedDescription: "Descricao do feed.",
    feedLink: "https://example.com/feed",
    audioBaseUrl: "https://cdn.example.com/audio",
  });
  const sidecarWithoutOwner = { ...sidecar, feed: { ...sidecar.feed } };
  delete sidecarWithoutOwner.feed.owner;

  const result = await writePodcastFeedOutputs({
    fileBaseName: "../Feed Teste.rss.xml",
    outputDir: root,
    sidecar: sidecarWithoutOwner,
  });

  assert.equal(result.rssFileName, "Feed-Teste.rss.xml");
  assert.equal(result.sidecarFileName, "Feed-Teste.podcast.json");
  assert.match(await fs.readFile(result.rssPath, "utf8"), /<rss version="2.0"/);
  const writtenSidecar = JSON.parse(
    await fs.readFile(result.sidecarPath, "utf8"),
  );
  assert.equal(writtenSidecar.rss.fileName, "Feed-Teste.rss.xml");
  assert.equal(writtenSidecar.feed.title, "Feed Teste");
  assert.deepEqual(writtenSidecar.feed.owner, {
    name: "Host Teste",
    email: "",
  });

  await fs.rm(root, { recursive: true, force: true });
});

test("podcast feed output rejects invalid sidecar JSON", () => {
  assert.throws(
    () => parsePodcastFeedOutputRequest({ sidecar: "{not-json" }),
    PodcastFeedOutputError,
  );
});

test("podcast output stem strips known feed extensions", () => {
  assert.equal(podcastOutputStem("show.rss.xml"), "show");
  assert.equal(podcastOutputStem("show.podcast.json"), "show");
});
