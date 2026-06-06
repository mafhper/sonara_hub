export function collectActiveObjectUrls(
  tracks = [],
  cover = null,
  layersUndo = null,
) {
  const urls = new Set();
  addObjectUrl(urls, cover?.src);
  for (const track of tracks) {
    addObjectUrl(urls, track.sourceUrl);
    addArtworkObjectUrl(urls, track.suggestedCover);
    addArtworkObjectUrl(urls, track.coverOverride);
    addArtworkObjectUrl(urls, track.albumCoverSuggestion);
    for (const option of track.artworkOptions ?? []) {
      addArtworkObjectUrl(urls, option);
    }
    for (const layer of track.layers ?? []) {
      addObjectUrl(urls, layer.src);
    }
  }
  for (const layer of layersUndo?.layers ?? []) {
    addObjectUrl(urls, layer.src);
  }
  return urls;
}

export function diffObjectUrls(previous = [], next = []) {
  const active = next instanceof Set ? next : new Set(next);
  return [...previous].filter(
    (url) => url.startsWith("blob:") && !active.has(url),
  );
}

function addArtworkObjectUrl(urls, artwork) {
  addObjectUrl(urls, artwork?.src);
}

function addObjectUrl(urls, url) {
  if (url?.startsWith("blob:")) urls.add(url);
}
