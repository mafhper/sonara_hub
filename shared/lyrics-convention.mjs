const lyricsDirectoryNames = new Set(["lyrics", "lyric", "letras", "letra"]);

export function isLyricsTextPath(value) {
  const path = normalizePath(value);
  if (!path.toLowerCase().endsWith(".txt")) return false;
  return splitPath(path)
    .slice(0, -1)
    .some((segment) => lyricsDirectoryNames.has(normalizeToken(segment)));
}

export function listLyricsOptionsForTrack({
  audioPath,
  lyricPaths,
  trackTitle = "",
  trackNumber = 0,
}) {
  const audioStem = stemOf(fileNameOf(audioPath));
  const normalizedAudioStem = normalizeComparableName(audioStem);
  const normalizedAudioWithoutNumber =
    normalizeComparableName(stripLeadingTrackNumber(audioStem).text) ||
    normalizedAudioStem;
  const normalizedTitle = normalizeComparableName(trackTitle);
  const effectiveTrackNumber =
    Number(trackNumber) || leadingTrackNumber(audioStem) || 0;
  const audioAlbumDirectory = albumDirectoryOf(audioPath);

  return uniqueByPath(
    lyricPaths
      .filter(isLyricsTextPath)
      .map((lyricPath) => {
        const stem = stemOf(fileNameOf(lyricPath));
        const normalizedStem = normalizeComparableName(stem);
        const stripped = stripLeadingTrackNumber(stem);
        const normalizedStripped = normalizeComparableName(stripped.text);
        const candidateTrackNumber = leadingTrackNumber(stem);
        const sameAlbum = albumDirectoryOf(lyricPath) === audioAlbumDirectory;
        const match = matchLyricsCandidate({
          candidateTrackNumber,
          effectiveTrackNumber,
          normalizedAudioStem,
          normalizedAudioWithoutNumber,
          normalizedStem,
          normalizedStripped,
          normalizedTitle,
          sameAlbum,
        });
        return match
          ? {
              relativePath: normalizePath(lyricPath),
              confidence: match.confidence,
              matchedBy: match.matchedBy,
              score: match.score,
            }
          : null;
      })
      .filter(Boolean)
      .sort(compareLyricsSuggestions),
  );
}

export function autoLyricsPathForTrack(args) {
  const options = listLyricsOptionsForTrack(args);
  const high = options.filter((option) => option.confidence === "high");
  return high.length === 1 ? high[0].relativePath : null;
}

function matchLyricsCandidate({
  candidateTrackNumber,
  effectiveTrackNumber,
  normalizedAudioStem,
  normalizedAudioWithoutNumber,
  normalizedStem,
  normalizedStripped,
  normalizedTitle,
  sameAlbum,
}) {
  const sameNumber =
    effectiveTrackNumber > 0 && candidateTrackNumber === effectiveTrackNumber;
  const scoreBoost = sameAlbum ? 10 : 0;
  const textMatchesAudio =
    normalizedStem === normalizedAudioStem ||
    normalizedStripped === normalizedAudioStem ||
    normalizedStripped === normalizedAudioWithoutNumber;
  const textMatchesTitle =
    normalizedTitle &&
    (normalizedStem === normalizedTitle ||
      normalizedStripped === normalizedTitle);

  if (normalizedStem === normalizedAudioStem) {
    return {
      confidence: "high",
      matchedBy: "audio-stem",
      score: 100 + scoreBoost,
    };
  }
  if (normalizedTitle && normalizedStem === normalizedTitle) {
    return {
      confidence: "high",
      matchedBy: "track-title",
      score: 96 + scoreBoost,
    };
  }
  if (sameNumber && textMatchesTitle) {
    return {
      confidence: "high",
      matchedBy: "numbered-title",
      score: 94 + scoreBoost,
    };
  }
  if (sameNumber && textMatchesAudio) {
    return {
      confidence: "high",
      matchedBy: "numbered-audio-stem",
      score: 92 + scoreBoost,
    };
  }
  if (textMatchesTitle || textMatchesAudio) {
    return {
      confidence: "high",
      matchedBy: textMatchesTitle ? "title-with-prefix" : "stem-with-prefix",
      score: 88 + scoreBoost,
    };
  }
  if (sameNumber && sameAlbum) {
    return {
      confidence: "medium",
      matchedBy: "track-number",
      score: 64,
    };
  }
  return null;
}

function compareLyricsSuggestions(first, second) {
  return (
    second.score - first.score ||
    first.relativePath.localeCompare(second.relativePath, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    })
  );
}

function uniqueByPath(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    if (seen.has(value.relativePath)) continue;
    seen.add(value.relativePath);
    output.push(value);
  }
  return output;
}

function albumDirectoryOf(value) {
  const directory = directoryOf(normalizePath(value));
  const parts = splitPath(directory);
  if (parts.length && isDiscDirectory(parts.at(-1))) parts.pop();
  if (lyricsDirectoryNames.has(normalizeToken(parts.at(-1) ?? ""))) parts.pop();
  return parts.join("/");
}

function isDiscDirectory(value) {
  return /^(?:lado|side|disc|disk|disco|cd)\s*[-_.]?\s*[a-z0-9]+$/i.test(
    String(value ?? "").trim(),
  );
}

function stripLeadingTrackNumber(value) {
  const numericOnly = String(value ?? "").match(/^\s*0*(\d+)\s*$/);
  if (numericOnly) return { number: Number(numericOnly[1]), text: "" };
  const match = String(value ?? "").match(/^\s*0*(\d+)\s*[-_. )]+(.+)$/);
  return match
    ? { number: Number(match[1]), text: match[2] }
    : { number: 0, text: String(value ?? "") };
}

function leadingTrackNumber(value) {
  return stripLeadingTrackNumber(value).number;
}

function extensionless(value) {
  return String(value ?? "").replace(/\.[^.]+$/, "");
}

function stemOf(value) {
  return extensionless(value);
}

function fileNameOf(value) {
  return splitPath(value).at(-1) ?? "";
}

function directoryOf(value) {
  const parts = splitPath(value);
  parts.pop();
  return parts.join("/");
}

function splitPath(value) {
  return normalizePath(value).split("/").filter(Boolean);
}

function normalizePath(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
}

function normalizeComparableName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:feat|ft|com|remaster|remastered)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
