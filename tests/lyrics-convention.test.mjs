import assert from "node:assert/strict";
import test from "node:test";
import {
  autoLyricsPathForTrack,
  isLyricsTextPath,
  listLyricsOptionsForTrack,
} from "../shared/lyrics-convention.mjs";

test("detects txt files inside lyrics folders", () => {
  assert.equal(
    isLyricsTextPath("Album/lyrics/01 - Nothing Followed Me Here.txt"),
    true,
  );
  assert.equal(isLyricsTextPath("Album/letras/Faixa.txt"), true);
  assert.equal(isLyricsTextPath("Album/letra/Faixa.txt"), true);
  assert.equal(isLyricsTextPath("Album/art/Faixa.txt"), false);
  assert.equal(isLyricsTextPath("Album/lyrics/Faixa.lrc"), false);
});

test("auto matches exact audio stem", () => {
  assert.equal(
    autoLyricsPathForTrack({
      audioPath: "Album/01 - Channel Nine.mp3",
      lyricPaths: ["Album/lyrics/01 - Channel Nine.txt"],
      trackTitle: "Channel Nine",
      trackNumber: 1,
    }),
    "Album/lyrics/01 - Channel Nine.txt",
  );
});

test("auto matches exact title without numeric prefix", () => {
  assert.equal(
    autoLyricsPathForTrack({
      audioPath: "Album/01 - Channel Nine.mp3",
      lyricPaths: ["Album/lyrics/Channel Nine.txt"],
      trackTitle: "Channel Nine",
      trackNumber: 1,
    }),
    "Album/lyrics/Channel Nine.txt",
  );
});

test("does not auto apply ambiguous high-confidence matches", () => {
  assert.equal(
    autoLyricsPathForTrack({
      audioPath: "Album/01 - Channel Nine.mp3",
      lyricPaths: [
        "Album/lyrics/01 - Channel Nine.txt",
        "Album/lyrics/Channel Nine.txt",
      ],
      trackTitle: "Channel Nine",
      trackNumber: 1,
    }),
    null,
  );
  assert.equal(
    listLyricsOptionsForTrack({
      audioPath: "Album/01 - Channel Nine.mp3",
      lyricPaths: [
        "Album/lyrics/01 - Channel Nine.txt",
        "Album/lyrics/Channel Nine.txt",
      ],
      trackTitle: "Channel Nine",
      trackNumber: 1,
    }).length,
    2,
  );
});

test("offers medium candidate for same album track number", () => {
  assert.deepEqual(
    listLyricsOptionsForTrack({
      audioPath: "Album/02 - The Frequency.mp3",
      lyricPaths: ["Album/letras/02.txt"],
      trackTitle: "The Frequency",
      trackNumber: 2,
    }).map(({ confidence, matchedBy, relativePath }) => ({
      confidence,
      matchedBy,
      relativePath,
    })),
    [
      {
        confidence: "medium",
        matchedBy: "track-number",
        relativePath: "Album/letras/02.txt",
      },
    ],
  );
});
