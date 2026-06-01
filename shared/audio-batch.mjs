const stringFields = [
  "artist",
  "album",
  "albumArtist",
  "composer",
  "genre",
  "year",
  "copyright",
  "comment",
];
const numberFields = ["trackTotal", "diskNumber", "diskTotal"];

export function applyCommonMetadata(tracks, common, mode = "fill-empty") {
  const patch = buildCommonMetadataPatch(common);
  return tracks.map((track) => {
    if (!track.selectedForBatch) return track;
    const metadata = { ...track.metadata };
    for (const [key, value] of Object.entries(patch)) {
      const current = metadata[key];
      if (
        mode === "overwrite" ||
        key === "normalizationEnabled" ||
        current === "" ||
        current === null ||
        current === undefined ||
        current === 0
      ) {
        metadata[key] = value;
      }
    }
    return { ...track, metadata };
  });
}

export function buildCommonMetadataPatch(common) {
  const patch = {};
  for (const key of stringFields) {
    const value = String(common[key] ?? "").trim();
    if (value) patch[key] = value;
  }
  for (const key of numberFields) {
    const value = Number(common[key] ?? 0);
    if (value > 0) patch[key] = value;
  }
  patch.normalizationEnabled = Boolean(common.normalizationEnabled);
  return patch;
}

export function groupAudioTracks(tracks) {
  const groups = new Map();
  for (const track of tracks) {
    const artist = String(track.metadata.artist || "Artista desconhecido");
    const album = String(track.metadata.album || "Álbum sem nome");
    const diskNumber = Math.max(1, Number(track.metadata.diskNumber) || 1);
    const id = [artist, album, diskNumber].map(normalizeKey).join("\u0000");
    const current = groups.get(id) ?? {
      id,
      artist,
      album,
      diskNumber,
      label: `${album} · Disco ${diskNumber}`,
      trackCount: 0,
      selectedCount: 0,
      tracks: [],
    };
    current.trackCount += 1;
    if (track.selectedForBatch) current.selectedCount += 1;
    current.tracks.push(track);
    groups.set(id, current);
  }
  return Array.from(groups.values()).sort((first, second) =>
    `${first.artist}\u0000${first.album}\u0000${String(first.diskNumber).padStart(2, "0")}`.localeCompare(
      `${second.artist}\u0000${second.album}\u0000${String(second.diskNumber).padStart(2, "0")}`,
      "pt-BR",
      { numeric: true, sensitivity: "base" },
    ),
  );
}

function normalizeKey(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
