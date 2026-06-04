// Shared filename-pattern model used by both the client (live preview + editor)
// and the server (actual treated-file naming). A pattern is an ordered list of
// enabled tokens joined by a separator, e.g. {album} - {track} - {title}.

export const fileNameTokens = [
  "track",
  "album",
  "title",
  "artist",
  "albumArtist",
  "year",
];

export const fileNameTokenLabels = {
  track: "Nº da faixa",
  album: "Álbum",
  title: "Música",
  artist: "Autor",
  albumArtist: "Artista do álbum",
  year: "Ano",
};

// Matches the historical buildTreatedFileName output: "Álbum - 01 - Música".
export const defaultFileNamePattern = {
  tokens: ["album", "track", "title"],
  separator: " - ",
};

export function normalizeFileNamePattern(value) {
  const allowed = new Set(fileNameTokens);
  const rawTokens = Array.isArray(value?.tokens) ? value.tokens : [];
  const tokens = [...new Set(rawTokens.filter((token) => allowed.has(token)))];
  const separator =
    typeof value?.separator === "string"
      ? value.separator.slice(0, 6)
      : defaultFileNamePattern.separator;
  return {
    tokens: tokens.length ? tokens : [...defaultFileNamePattern.tokens],
    separator,
  };
}

function tokenValue(token, tags = {}) {
  switch (token) {
    case "track":
      return String(Number(tags.trackNumber ?? tags.track ?? 0) || 0).padStart(
        2,
        "0",
      );
    case "album":
      return String(tags.album ?? "");
    case "title":
      return String(tags.title ?? "");
    case "artist":
      return String(tags.artist ?? "");
    case "albumArtist":
      return String(tags.albumArtist ?? tags.artist ?? "");
    case "year":
      return tags.year ? String(tags.year) : "";
    default:
      return "";
  }
}

// Build the base name (no extension). `sanitize` lets the server strip
// path-unsafe characters per token while the client previews raw text.
export function buildNameFromPattern(pattern, tags, sanitize) {
  const { tokens, separator } = normalizeFileNamePattern(pattern);
  const clean = typeof sanitize === "function" ? sanitize : (value) => value;
  const parts = tokens
    .map((token) => tokenValue(token, tags))
    .filter((value) => value !== "")
    .map((value) => clean(value));
  return parts.join(separator);
}
