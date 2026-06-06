import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { createPresetStore } from "../server/preset-store.mjs";
import { loadJobHistory, saveJobHistory } from "../server/job-store.mjs";
import { groupCatalogTracks } from "../shared/catalog-tracks.mjs";
import {
  collectActiveObjectUrls,
  diffObjectUrls,
} from "../shared/object-url-lifecycle.mjs";

test("scale fixture keeps 120-track catalog, presets, history and object URL lifecycle bounded", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sonara-scale-"));
  const tracks = buildScaleTracks(120);
  const removedTracks = tracks.slice(0, 40);
  const remainingTracks = tracks.slice(40);
  const previousUrls = collectActiveObjectUrls(
    tracks,
    { src: "blob:album-cover" },
    {
      layers: [{ src: "blob:undo-layer" }],
    },
  );

  const started = performance.now();
  const groups = groupCatalogTracks([...tracks].reverse());
  const activeUrls = collectActiveObjectUrls(remainingTracks, null, null);
  const staleUrls = diffObjectUrls(previousUrls, activeUrls);
  const elapsedMs = performance.now() - started;

  assert.equal(groups.length, 2);
  assert.equal(
    groups.reduce((total, group) => total + group.tracks.length, 0),
    120,
  );
  assert.ok(previousUrls.size > 700, "fixture should exercise many asset URLs");
  assert.equal(activeUrls.has("blob:album-cover"), false);
  assert.equal(activeUrls.has(removedTracks[0].sourceUrl), false);
  assert.equal(staleUrls.includes(removedTracks[0].sourceUrl), true);
  assert.equal(staleUrls.includes(remainingTracks[0].sourceUrl), false);
  assert.ok(
    elapsedMs < 250,
    `scale URL/catalog pass took ${elapsedMs.toFixed(1)}ms`,
  );

  const store = createPresetStore(path.join(root, "presets.json"));
  for (let index = 0; index < 24; index += 1) {
    await store.create({
      name: `Escala ${String(index + 1).padStart(2, "0")}`,
      rendererId: index % 2 ? "playful-shapes" : "liquid-mesh",
    });
  }
  assert.equal((await store.list()).length, 24);

  const historyPath = path.join(root, "jobs.local.json");
  await saveJobHistory(historyPath, buildJobHistory(90), 80);
  const history = await loadJobHistory(historyPath);
  assert.equal(history.length, 80);
  assert.equal(history.at(-1).id, "job-089");

  await fs.rm(root, { recursive: true, force: true });
});

function buildScaleTracks(count) {
  return Array.from({ length: count }, (_, index) => {
    const albumIndex = index < 80 ? 1 : 2;
    const trackNumber = albumIndex === 1 ? index + 1 : index - 79;
    return {
      id: `track-${String(index + 1).padStart(3, "0")}`,
      sourceUrl: `blob:track-${index + 1}`,
      metadata: {
        album: albumIndex === 1 ? "Atlas Grande" : "Caderno Grande",
        albumArtist: "Sonara Scale",
        artist: "Sonara Scale",
        diskNumber: Math.floor(trackNumber / 41) + 1,
        genre: "Ambient",
        title: `Faixa ${String(trackNumber).padStart(3, "0")}`,
        trackNumber,
        year: "2026",
      },
      suggestedCover: artwork(`suggested-${index}`),
      coverOverride: index % 3 === 0 ? artwork(`override-${index}`) : null,
      albumCoverSuggestion: artwork(`album-${albumIndex}`),
      artworkOptions: [
        artwork(`option-a-${index}`),
        artwork(`option-b-${index}`),
      ],
      layers: [
        { src: `blob:layer-${index}-a` },
        { src: `blob:layer-${index}-b` },
        { src: `blob:layer-${index}-c` },
      ],
    };
  });
}

function artwork(id) {
  return { src: `blob:${id}` };
}

function buildJobHistory(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `job-${String(index).padStart(3, "0")}`,
    kind: index % 2 ? "publication-asset" : "video-render",
    status: "done",
    progress: 100,
    message: "Concluído",
    attempt: 1,
    maxAttempts: 2,
    retryHistory:
      index % 5 === 0
        ? [
            {
              attempt: 1,
              errorCode: "JOB_WORKER_EXIT",
              failedAt: "2026-06-06T10:00:00.000Z",
              message: "worker encerrou",
              retryAt: "2026-06-06T10:00:01.000Z",
              stage: "webgl-render",
            },
          ]
        : [],
  }));
}
