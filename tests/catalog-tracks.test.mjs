import assert from "node:assert/strict";
import test from "node:test";
import { groupCatalogTracks } from "../shared/catalog-tracks.mjs";

function track(id, album, diskNumber, trackNumber, selected = true) {
  return {
    id,
    selected,
    metadata: {
      album,
      albumArtist: "Matheus Lima",
      artist: "Matheus Lima",
      diskNumber,
      genre: "Ambient",
      title: `Faixa ${String(trackNumber).padStart(2, "0")}`,
      trackNumber,
      year: "2026",
    },
  };
}

test("catalog grouping keeps 100+ track albums ordered without mutating source order", () => {
  const albumTracks = Array.from({ length: 100 }, (_, index) => {
    const trackNumber = (index % 50) + 1;
    const diskNumber = index < 50 ? 1 : 2;
    return track(
      `atlas-${diskNumber}-${String(trackNumber).padStart(2, "0")}`,
      "Atlas de Bolso",
      diskNumber,
      trackNumber,
    );
  });
  const singles = Array.from({ length: 20 }, (_, index) =>
    track(
      `single-${String(index + 1).padStart(2, "0")}`,
      "Caderno de Sinais",
      1,
      index + 1,
      false,
    ),
  );
  const tracks = [...singles, ...albumTracks].reverse();
  const sourceOrder = tracks.map((item) => item.id);

  const groups = groupCatalogTracks(tracks);
  const atlas = groups.find((group) => group.album === "Atlas de Bolso");
  const caderno = groups.find((group) => group.album === "Caderno de Sinais");

  assert.equal(groups.length, 2);
  assert.equal(
    groups.reduce((total, group) => total + group.tracks.length, 0),
    120,
  );
  assert.deepEqual(
    tracks.map((item) => item.id),
    sourceOrder,
  );
  assert.equal(atlas.tracks.length, 100);
  assert.deepEqual(
    atlas.tracks.slice(0, 4).map((item) => item.id),
    ["atlas-1-01", "atlas-1-02", "atlas-1-03", "atlas-1-04"],
  );
  assert.deepEqual(
    atlas.tracks.slice(-4).map((item) => item.id),
    ["atlas-2-47", "atlas-2-48", "atlas-2-49", "atlas-2-50"],
  );
  assert.equal(caderno.artist, "Matheus Lima");
  assert.equal(caderno.genre, "Ambient");
  assert.equal(caderno.year, "2026");
});
