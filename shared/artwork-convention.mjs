const artworkExtensions = new Set([
  ".avif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);

const genericArtworkNames = [
  "album",
  "cover",
  "folder",
  "front",
  "capa",
  "image",
  "imagem",
];

export const treatedAlbumArtworkFileName = "album.jpg";
export const treatedTrackArtworkDirectoryName = "extras";

export function isArtworkName(name) {
  return artworkExtensions.has(extensionOf(name));
}

export function albumArtworkDirectoryPaths(audioPaths) {
  const groups = new Map();
  for (const audioPath of audioPaths) {
    const albumDirectory = albumDirectoryOf(audioPath);
    groups.set(albumDirectory, (groups.get(albumDirectory) ?? 0) + 1);
  }
  return [...groups.entries()]
    .filter(([, count]) => count > 1)
    .map(([directory]) => joinPath(directory, "art"))
    .sort(comparePaths);
}

export function singleTrackArtworkFileName(audioPath) {
  return `${stemOf(fileNameOf(audioPath))}.cover.jpg`;
}

export function treatedTrackArtworkFileName(audioPath) {
  return `${stemOf(fileNameOf(audioPath))}.cover.jpg`;
}

export function treatedTrackArtworkPath(audioPath) {
  return joinPath(
    treatedTrackArtworkDirectoryName,
    treatedTrackArtworkFileName(audioPath),
  );
}

export function chooseArtworkForTrack({
  audioPath,
  audioPaths,
  artworkPaths,
  trackNumber = 0,
}) {
  return (
    listArtworkOptionsForTrack({
      audioPath,
      audioPaths,
      artworkPaths,
      trackNumber,
    })[0] ?? null
  );
}

export function chooseAlbumArtworkForTrack({ audioPath, artworkPaths }) {
  const normalizedAudioPath = normalizePath(audioPath);
  const albumDirectory = albumDirectoryOf(normalizedAudioPath);
  const artDirectory = joinPath(albumDirectory, "art");
  const artwork = artworkPaths
    .filter(isArtworkName)
    .map(normalizePath)
    .sort(comparePaths);
  return (
    genericArtworkCandidates(
      artwork.filter((candidate) => directoryOf(candidate) === artDirectory),
    )[0] ??
    genericArtworkCandidates(
      artwork.filter((candidate) => directoryOf(candidate) === albumDirectory),
    )[0] ??
    null
  );
}

export function listArtworkOptionsForTrack({
  audioPath,
  audioPaths,
  artworkPaths,
  trackNumber = 0,
}) {
  const normalizedAudioPath = normalizePath(audioPath);
  const audioDirectory = directoryOf(normalizedAudioPath);
  const albumDirectory = albumDirectoryOf(normalizedAudioPath);
  const albumTracks = audioPaths.filter(
    (candidate) => albumDirectoryOf(candidate) === albumDirectory,
  );
  const artwork = artworkPaths
    .filter(isArtworkName)
    .map(normalizePath)
    .sort(comparePaths);
  const artDirectory = joinPath(albumDirectory, "art");
  const audioStem = stemOf(fileNameOf(normalizedAudioPath));
  const effectiveTrackNumber =
    Number(trackNumber) || leadingTrackNumber(audioStem) || 0;
  const insideArtDirectory = artwork.filter(
    (candidate) => directoryOf(candidate) === artDirectory,
  );

  const candidates = [
    ...insideArtDirectory.filter((candidate) =>
      matchesTrackNumber(candidate, effectiveTrackNumber),
    ),
    ...insideArtDirectory.filter((candidate) =>
      matchesStem(candidate, audioStem),
    ),
    ...artwork.filter(
      (candidate) =>
        directoryOf(candidate) === audioDirectory &&
        matchesStem(candidate, audioStem),
    ),
    ...genericArtworkCandidates(insideArtDirectory),
    ...genericArtworkCandidates(
      artwork.filter((candidate) => directoryOf(candidate) === albumDirectory),
    ),
  ];

  if (albumTracks.length === 1) {
    candidates.unshift(
      ...artwork.filter(
        (candidate) =>
          directoryOf(candidate) === audioDirectory &&
          matchesStem(candidate, `${audioStem}.cover`),
      ),
    );
  }

  return unique(candidates);
}

function albumDirectoryOf(value) {
  const directory = directoryOf(normalizePath(value));
  const parts = splitPath(directory);
  if (parts.length && isDiscDirectory(parts.at(-1))) parts.pop();
  return parts.join("/");
}

function isDiscDirectory(value) {
  return /^(?:lado|side|disc|disk|disco|cd)\s*[-_.]?\s*[a-z0-9]+$/i.test(
    String(value ?? "").trim(),
  );
}

function isGenericArtwork(value) {
  const stem = stemOf(fileNameOf(value)).toLowerCase();
  return genericArtworkNames.some(
    (name) => stem === name || stem.startsWith(`${name}-`),
  );
}

function genericArtworkCandidates(values) {
  return values.filter(isGenericArtwork).sort(compareGenericArtwork);
}

function compareGenericArtwork(first, second) {
  const rank = genericArtworkRank(first) - genericArtworkRank(second);
  return rank || comparePaths(first, second);
}

function genericArtworkRank(value) {
  const stem = stemOf(fileNameOf(value)).toLowerCase();
  if (genericArtworkNames.some((name) => stem === name)) return 0;
  if (
    /(?:^|-)(?:alt|alternative|alternativa|compressed|small|thumb|mini)\b/i.test(
      stem,
    )
  ) {
    return 3;
  }
  return 1;
}

function matchesTrackNumber(value, trackNumber) {
  if (!trackNumber) return false;
  return leadingTrackNumber(stemOf(fileNameOf(value))) === trackNumber;
}

function leadingTrackNumber(value) {
  const match = String(value).match(/^0*(\d+)(?:\D|$)/);
  return match ? Number(match[1]) : 0;
}

function matchesStem(value, expected) {
  return stemOf(fileNameOf(value)).toLowerCase() === expected.toLowerCase();
}

function extensionOf(value) {
  const match = String(value ?? "")
    .toLowerCase()
    .match(/(\.[^.\\/]+)$/);
  return match?.[1] ?? "";
}

function stemOf(value) {
  return String(value ?? "").replace(/\.[^.]+$/, "");
}

function fileNameOf(value) {
  return splitPath(value).at(-1) ?? "";
}

function directoryOf(value) {
  const parts = splitPath(value);
  parts.pop();
  return parts.join("/");
}

function joinPath(...parts) {
  return parts.filter(Boolean).join("/");
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

function unique(values) {
  return [...new Set(values)];
}

function comparePaths(first, second) {
  return first.localeCompare(second, "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}
