import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCommonMetadata,
  groupAudioTracks,
} from "../shared/audio-batch.mjs";

const common = {
  artist: "Matheus Lima",
  album: "Album comum",
  albumArtist: "Matheus Lima",
  composer: "Matheus Lima",
  genre: "MPB",
  year: "2026",
  copyright: "2026 Matheus Lima",
  comment: "Feito usando IA com curadoria humana.",
  trackTotal: 4,
  diskNumber: 1,
  diskTotal: 2,
  normalizationEnabled: true,
};

function track(id, metadata, selectedForBatch = true) {
  return { id, metadata, selectedForBatch };
}

test("audio batch groups albums and separates disc folders within the album", () => {
  const groups = groupAudioTracks([
    track("a-1", {
      artist: "Matheus Lima",
      album: "Jardim dos Ventos",
      diskNumber: 1,
    }),
    track("a-2", {
      artist: "Matheus Lima",
      album: "Jardim dos Ventos",
      diskNumber: 2,
    }),
    track("b-1", {
      artist: "Matheus Lima",
      album: "Azul de Roda",
      diskNumber: 1,
    }),
  ]);

  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.map(({ id, label, trackCount }) => ({ id, label, trackCount })),
    [
      {
        id: "matheus lima\u0000azul de roda\u00001",
        label: "Azul de Roda · Disco 1",
        trackCount: 1,
      },
      {
        id: "matheus lima\u0000jardim dos ventos\u00001",
        label: "Jardim dos Ventos · Disco 1",
        trackCount: 1,
      },
      {
        id: "matheus lima\u0000jardim dos ventos\u00002",
        label: "Jardim dos Ventos · Disco 2",
        trackCount: 1,
      },
    ],
  );
});

test("audio batch fills empty fields without replacing reviewed metadata", () => {
  const [result] = applyCommonMetadata(
    [
      track("one", {
        title: "Titulo revisado",
        artist: "",
        album: "Album preservado",
        comment: "",
        normalizationEnabled: false,
      }),
    ],
    common,
    "fill-empty",
  );

  assert.equal(result.metadata.title, "Titulo revisado");
  assert.equal(result.metadata.artist, "Matheus Lima");
  assert.equal(result.metadata.album, "Album preservado");
  assert.equal(
    result.metadata.comment,
    "Feito usando IA com curadoria humana.",
  );
  assert.equal(result.metadata.normalizationEnabled, true);
});

test("audio batch overwrites informed fields only on selected tracks", () => {
  const [selected, untouched] = applyCommonMetadata(
    [
      track("selected", {
        artist: "Outro artista",
        album: "Outro album",
        normalizationEnabled: false,
      }),
      track(
        "untouched",
        {
          artist: "Nao alterar",
          album: "Nao alterar",
          normalizationEnabled: false,
        },
        false,
      ),
    ],
    common,
    "overwrite",
  );

  assert.equal(selected.metadata.artist, "Matheus Lima");
  assert.equal(selected.metadata.album, "Album comum");
  assert.equal(selected.metadata.normalizationEnabled, true);
  assert.equal(untouched.metadata.artist, "Nao alterar");
  assert.equal(untouched.metadata.album, "Nao alterar");
  assert.equal(untouched.metadata.normalizationEnabled, false);
});
