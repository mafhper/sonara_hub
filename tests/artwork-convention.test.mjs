import assert from "node:assert/strict";
import test from "node:test";
import {
  albumArtworkDirectoryPaths,
  chooseAlbumArtworkForTrack,
  chooseArtworkForTrack,
  listArtworkOptionsForTrack,
  singleTrackArtworkFileName,
} from "../shared/artwork-convention.mjs";

test("album artwork directory stays above disc folders", () => {
  assert.deepEqual(
    albumArtworkDirectoryPaths([
      "Matheus Lima/Jardim dos Ventos/Lado A/01 - Faixa.mp3",
      "Matheus Lima/Jardim dos Ventos/Lado A/02 - Faixa.mp3",
      "Matheus Lima/Jardim dos Ventos/Lado B/03 - Faixa.mp3",
    ]),
    ["Matheus Lima/Jardim dos Ventos/art"],
  );
});

test("numbered artwork in the album art directory wins per track", () => {
  const audioPaths = [
    "Matheus Lima/The Beauty of Almost/01 - First.mp3",
    "Matheus Lima/The Beauty of Almost/02 - Second.mp3",
  ];
  const artworkPaths = [
    "Matheus Lima/The Beauty of Almost/art/album-clean-painted.png",
    "Matheus Lima/The Beauty of Almost/art/01-I.jpg",
    "Matheus Lima/The Beauty of Almost/art/02-II.jpg",
  ];

  assert.equal(
    chooseArtworkForTrack({
      audioPath: audioPaths[1],
      audioPaths,
      artworkPaths,
      trackNumber: 2,
    }),
    "Matheus Lima/The Beauty of Almost/art/02-II.jpg",
  );
});

test("album root artwork is offered across disc folders", () => {
  const audioPaths = [
    "Matheus Lima/Jardim dos Ventos/Lado A/01 - Faixa.mp3",
    "Matheus Lima/Jardim dos Ventos/Lado B/02 - Faixa.mp3",
  ];

  assert.equal(
    chooseArtworkForTrack({
      audioPath: audioPaths[0],
      audioPaths,
      artworkPaths: ["Matheus Lima/Jardim dos Ventos/album.webp"],
      trackNumber: 1,
    }),
    "Matheus Lima/Jardim dos Ventos/album.webp",
  );
});

test("album artwork prefers a generic source while track options retain alternates", () => {
  const audioPaths = [
    "Matheus Lima/Jardim dos Ventos/Lado A/01 - Faixa.mp3",
    "Matheus Lima/Jardim dos Ventos/Lado B/02 - Faixa.mp3",
  ];
  const artworkPaths = [
    "Matheus Lima/Jardim dos Ventos/art/01-faixa.webp",
    "Matheus Lima/Jardim dos Ventos/art/album-large.png",
    "Matheus Lima/Jardim dos Ventos/art/cover-compressed.jpg",
  ];

  assert.equal(
    chooseAlbumArtworkForTrack({
      audioPath: audioPaths[0],
      artworkPaths,
    }),
    "Matheus Lima/Jardim dos Ventos/art/album-large.png",
  );
  assert.deepEqual(
    listArtworkOptionsForTrack({
      audioPath: audioPaths[0],
      audioPaths,
      artworkPaths,
      trackNumber: 1,
    }),
    artworkPaths,
  );
});

test("single tracks use an adjacent predictable artwork file", () => {
  assert.equal(
    singleTrackArtworkFileName("Singles/Blue Hour.mp3"),
    "Blue Hour.cover.jpg",
  );
  assert.equal(
    chooseArtworkForTrack({
      audioPath: "Singles/Blue Hour.mp3",
      audioPaths: ["Singles/Blue Hour.mp3"],
      artworkPaths: ["Singles/Blue Hour.cover.jpg"],
    }),
    "Singles/Blue Hour.cover.jpg",
  );
});
