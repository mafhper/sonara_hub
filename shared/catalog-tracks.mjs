export function groupCatalogTracks(tracks) {
  const albums = new Map();
  for (const track of tracks) {
    const metadata = track.metadata ?? {};
    const artist = metadata.albumArtist || metadata.artist || "";
    const albumName = metadata.album || "";
    const id = `${artist}\u0000${albumName}`;
    const album = albums.get(id) ?? {
      id,
      album: albumName,
      artist,
      genre: metadata.genre || "",
      year: metadata.year || "",
      tracks: [],
    };
    album.tracks.push(track);
    albums.set(id, album);
  }
  return [...albums.values()].map((album) => ({
    ...album,
    tracks: [...album.tracks].sort(
      (first, second) =>
        trackNumber(first, "diskNumber") - trackNumber(second, "diskNumber") ||
        trackNumber(first, "trackNumber") -
          trackNumber(second, "trackNumber") ||
        String(first.metadata?.title ?? "").localeCompare(
          String(second.metadata?.title ?? ""),
          "pt-BR",
        ),
    ),
  }));
}

function trackNumber(track, key) {
  const value = Number(track.metadata?.[key]);
  return Number.isFinite(value) ? value : 0;
}
