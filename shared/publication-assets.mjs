export const publicationAssetKinds = ["image", "clip"];

export const publicationAssetPresets = [
  {
    id: "youtube-thumbnail",
    kind: "image",
    label: "YouTube thumbnail",
    platform: "YouTube",
    width: 1280,
    height: 720,
    directory: "imagens",
    extension: "jpg",
  },
  {
    id: "youtube-banner",
    kind: "image",
    label: "YouTube banner",
    platform: "YouTube",
    width: 2560,
    height: 1440,
    directory: "imagens",
    extension: "jpg",
  },
  {
    id: "x-post",
    kind: "image",
    label: "X / Twitter post",
    platform: "X",
    width: 1600,
    height: 900,
    directory: "imagens",
    extension: "jpg",
  },
  {
    id: "soundcloud-banner",
    kind: "image",
    label: "SoundCloud banner",
    platform: "SoundCloud",
    width: 2480,
    height: 520,
    directory: "imagens",
    extension: "jpg",
  },
  {
    id: "square-post",
    kind: "image",
    label: "Post quadrado",
    platform: "Social",
    width: 1080,
    height: 1080,
    directory: "imagens",
    extension: "jpg",
  },
  {
    id: "instagram-feed",
    kind: "image",
    label: "Instagram feed",
    platform: "Instagram",
    width: 1080,
    height: 1080,
    directory: "imagens",
    extension: "jpg",
  },
  {
    id: "instagram-story",
    kind: "image",
    label: "Instagram story",
    platform: "Instagram",
    width: 1080,
    height: 1920,
    directory: "imagens",
    extension: "jpg",
  },
  {
    id: "whatsapp-status",
    kind: "image",
    label: "WhatsApp status",
    platform: "WhatsApp",
    width: 1080,
    height: 1920,
    directory: "imagens",
    extension: "jpg",
  },
  {
    id: "clip-landscape",
    kind: "clip",
    label: "Clip landscape",
    platform: "Social",
    width: 1920,
    height: 1080,
    directory: "clips",
    extension: "mp4",
    maxDurationSeconds: 30,
  },
  {
    id: "clip-square",
    kind: "clip",
    label: "Clip quadrado",
    platform: "Social",
    width: 1080,
    height: 1080,
    directory: "clips",
    extension: "mp4",
    maxDurationSeconds: 30,
  },
  {
    id: "clip-vertical",
    kind: "clip",
    label: "Clip vertical",
    platform: "Social",
    width: 1080,
    height: 1920,
    directory: "clips",
    extension: "mp4",
    maxDurationSeconds: 30,
  },
  {
    id: "instagram-reel",
    kind: "clip",
    label: "Instagram reel",
    platform: "Instagram",
    width: 1080,
    height: 1920,
    directory: "clips",
    extension: "mp4",
    maxDurationSeconds: 30,
  },
  {
    id: "whatsapp-status-clip",
    kind: "clip",
    label: "WhatsApp status clip",
    platform: "WhatsApp",
    width: 1080,
    height: 1920,
    directory: "clips",
    extension: "mp4",
    maxDurationSeconds: 30,
  },
];

export function publicationAssetPresetById(id) {
  return (
    publicationAssetPresets.find((preset) => preset.id === id) ??
    publicationAssetPresets[0]
  );
}

export function publicationAssetPresetLabel(id) {
  const preset = publicationAssetPresetById(id);
  return `${preset.label} · ${preset.width}x${preset.height}`;
}

export function clampPublicationClipDuration(value) {
  const duration = Number(value);
  if (Number.isNaN(duration)) return 15;
  return Math.min(30, Math.max(1, duration));
}

export function clampPublicationClipStart(value) {
  const start = Number(value);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, start);
}

export function normalizePublicationLyricsMode(value, includeLyrics = false) {
  const mode = String(value ?? "").trim();
  if (["none", "full", "excerpt"].includes(mode)) return mode;
  return includeLyrics ? "full" : "none";
}

export function sanitizePublicationLyricsExcerpt(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 4000);
}

export function clampPublicationLyricsLineSpacing(value) {
  const spacing = Number(value);
  if (Number.isNaN(spacing)) return 130;
  return Math.min(220, Math.max(100, spacing));
}

export function clampPublicationTextScale(value) {
  const scale = Number(value);
  if (Number.isNaN(scale)) return 1;
  return Math.min(2, Math.max(0.5, Math.round(scale * 100) / 100));
}

export function clampPublicationTextOffset(value) {
  const offset = Number(value);
  if (Number.isNaN(offset)) return 0;
  return Math.min(40, Math.max(-40, Math.round(offset)));
}

export function stripPublicationLyricsTags(value) {
  return sanitizePublicationLyricsExcerpt(value)
    .split("\n")
    .map((line) => line.replace(/\[[^\]\n]{1,80}\]/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

export function publicationLyricsTextForSettings(sourceLyrics, settings = {}) {
  const lyricsMode = normalizePublicationLyricsMode(
    settings.lyricsMode,
    settings.includeLyrics,
  );
  if (lyricsMode === "none") return "";
  const source =
    lyricsMode === "excerpt" ? settings.lyricsExcerpt : sourceLyrics;
  const sanitized = sanitizePublicationLyricsExcerpt(source);
  return settings.lyricsHideTags
    ? stripPublicationLyricsTags(sanitized)
    : sanitized;
}

const publicationAssetPresetIds = new Set(
  publicationAssetPresets.map((preset) => preset.id),
);

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function normalizePublicationAssetOverrides(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [presetId, rawOverride] of Object.entries(value)) {
    if (!publicationAssetPresetIds.has(presetId)) continue;
    if (
      !rawOverride ||
      typeof rawOverride !== "object" ||
      Array.isArray(rawOverride)
    ) {
      continue;
    }
    const override = {};
    if (hasOwn(rawOverride, "clipStart")) {
      override.clipStart = clampPublicationClipStart(rawOverride.clipStart);
    }
    if (hasOwn(rawOverride, "clipDuration")) {
      override.clipDuration = clampPublicationClipDuration(
        rawOverride.clipDuration,
      );
    }
    if (hasOwn(rawOverride, "includeLyrics")) {
      override.includeLyrics = Boolean(rawOverride.includeLyrics);
    }
    if (hasOwn(rawOverride, "lyricsMode")) {
      override.lyricsMode = normalizePublicationLyricsMode(
        rawOverride.lyricsMode,
        rawOverride.includeLyrics,
      );
    }
    if (hasOwn(rawOverride, "lyricsExcerpt")) {
      override.lyricsExcerpt = sanitizePublicationLyricsExcerpt(
        rawOverride.lyricsExcerpt,
      );
    }
    if (hasOwn(rawOverride, "lyricsHideTags")) {
      override.lyricsHideTags = Boolean(rawOverride.lyricsHideTags);
    }
    if (hasOwn(rawOverride, "lyricsLineSpacing")) {
      override.lyricsLineSpacing = clampPublicationLyricsLineSpacing(
        rawOverride.lyricsLineSpacing,
      );
    }
    if (hasOwn(rawOverride, "textScale")) {
      override.textScale = clampPublicationTextScale(rawOverride.textScale);
    }
    if (hasOwn(rawOverride, "textOffsetX")) {
      override.textOffsetX = clampPublicationTextOffset(
        rawOverride.textOffsetX,
      );
    }
    if (hasOwn(rawOverride, "textOffsetY")) {
      override.textOffsetY = clampPublicationTextOffset(
        rawOverride.textOffsetY,
      );
    }
    if (hasOwn(rawOverride, "hideText")) {
      override.hideText = Boolean(rawOverride.hideText);
    }
    if (Object.keys(override).length) output[presetId] = override;
  }
  return output;
}

export function publicationAssetSettingsForPreset(
  presetId,
  defaults = {},
  overrides = {},
) {
  const preset = publicationAssetPresetById(presetId);
  const base = {
    clipStart: clampPublicationClipStart(defaults.clipStart ?? 0),
    clipDuration: clampPublicationClipDuration(defaults.clipDuration ?? 15),
    includeLyrics: Boolean(defaults.includeLyrics),
    lyricsMode: normalizePublicationLyricsMode(
      defaults.lyricsMode,
      defaults.includeLyrics,
    ),
    lyricsExcerpt: sanitizePublicationLyricsExcerpt(defaults.lyricsExcerpt),
    lyricsHideTags: Boolean(defaults.lyricsHideTags),
    lyricsLineSpacing: clampPublicationLyricsLineSpacing(
      defaults.lyricsLineSpacing,
    ),
    textScale: clampPublicationTextScale(defaults.textScale ?? 1),
    textOffsetX: clampPublicationTextOffset(defaults.textOffsetX ?? 0),
    textOffsetY: clampPublicationTextOffset(defaults.textOffsetY ?? 0),
    hideText: Boolean(defaults.hideText),
  };
  const normalizedOverrides = normalizePublicationAssetOverrides(overrides);
  const merged = {
    ...base,
    ...(normalizedOverrides[preset.id] ?? {}),
  };
  const lyricsMode = normalizePublicationLyricsMode(
    merged.lyricsMode,
    merged.includeLyrics,
  );
  return {
    ...merged,
    includeLyrics: lyricsMode !== "none",
    lyricsMode,
    lyricsExcerpt: sanitizePublicationLyricsExcerpt(merged.lyricsExcerpt),
    lyricsHideTags: Boolean(merged.lyricsHideTags),
    lyricsLineSpacing: clampPublicationLyricsLineSpacing(
      merged.lyricsLineSpacing,
    ),
    textScale: clampPublicationTextScale(merged.textScale),
    textOffsetX: clampPublicationTextOffset(merged.textOffsetX),
    textOffsetY: clampPublicationTextOffset(merged.textOffsetY),
    hideText: Boolean(merged.hideText),
  };
}

const clampUnitPosition = (value) => Math.min(100, Math.max(0, value));

// Apply a per-asset text override (scale/offset/hide) on top of the shared
// text overlay settings. Pure and used by BOTH the preview and the export
// submission, so what the user previews is exactly what renders.
export function applyPublicationTextOverride(textSettings, settings = {}) {
  if (!textSettings || typeof textSettings !== "object") return textSettings;
  const scale = clampPublicationTextScale(settings.textScale ?? 1);
  const offsetX = clampPublicationTextOffset(settings.textOffsetX ?? 0);
  const offsetY = clampPublicationTextOffset(settings.textOffsetY ?? 0);
  const hide = Boolean(settings.hideText);
  const sameScale = scale === 1;
  const sameOffset = offsetX === 0 && offsetY === 0;
  if (sameScale && sameOffset && !hide) return textSettings;
  const next = { ...textSettings };
  if (hide && next.fields && typeof next.fields === "object") {
    next.fields = Object.fromEntries(
      Object.keys(next.fields).map((key) => [key, false]),
    );
  }
  if (!sameScale && typeof next.fontSize === "number") {
    next.fontSize = Math.round(next.fontSize * scale);
  }
  if (!sameScale && next.fieldStyles && typeof next.fieldStyles === "object") {
    next.fieldStyles = Object.fromEntries(
      Object.entries(next.fieldStyles).map(([key, style]) => [
        key,
        style && typeof style.fontSize === "number"
          ? { ...style, fontSize: Math.round(style.fontSize * scale) }
          : style,
      ]),
    );
  }
  if (offsetX !== 0 && typeof next.x === "number") {
    next.x = clampUnitPosition(next.x + offsetX);
  }
  if (offsetY !== 0 && typeof next.y === "number") {
    next.y = clampUnitPosition(next.y + offsetY);
  }
  return next;
}

export function sanitizePublicationFilePart(value, fallback = "asset") {
  const output = String(value ?? "")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .replaceAll(" ", "-");
  return output || fallback;
}
