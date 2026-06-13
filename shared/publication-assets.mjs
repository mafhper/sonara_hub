export const publicationAssetKinds = ["image", "clip", "booklet"];

export const publicationBookletThemes = [
  {
    id: "midnight",
    label: "Noite editorial",
    background: "#0f1117",
    surface: "#181d27",
    text: "#f5f7fa",
    muted: "#c8d0dc",
    accent: "#f0b860",
  },
  {
    id: "studio",
    label: "Estúdio claro",
    background: "#f5f2ec",
    surface: "#fffaf2",
    text: "#17191f",
    muted: "#5f6673",
    accent: "#3f5f9f",
  },
  {
    id: "contrast",
    label: "Alto contraste",
    background: "#050506",
    surface: "#111216",
    text: "#ffffff",
    muted: "#d8dee8",
    accent: "#b8ccff",
  },
];

const MB = 1024 * 1024;

const publicationBookletThemeIds = new Set(
  publicationBookletThemes.map((theme) => theme.id),
);

export function normalizePublicationBookletTheme(value) {
  const theme = String(value ?? "").trim();
  return publicationBookletThemeIds.has(theme) ? theme : "midnight";
}

export function publicationBookletThemeById(id) {
  const themeId = normalizePublicationBookletTheme(id);
  return (
    publicationBookletThemes.find((theme) => theme.id === themeId) ??
    publicationBookletThemes[0]
  );
}

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
    constraints: {
      aspectRatio: "16:9",
      codec: "JPEG",
    },
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
    constraints: {
      aspectRatio: "9:16",
    },
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
    constraints: {
      aspectRatio: "9:16",
      maxFileSizeBytes: 10 * MB,
    },
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
    constraints: {
      codec: "H.264/AAC",
      maxDurationSeconds: 30,
    },
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
    constraints: {
      codec: "H.264/AAC",
      maxDurationSeconds: 30,
    },
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
    constraints: {
      codec: "H.264/AAC",
      maxDurationSeconds: 30,
      aspectRatio: "9:16",
    },
  },
  {
    id: "instagram-story-clip",
    kind: "clip",
    label: "Instagram story clip",
    platform: "Instagram",
    width: 1080,
    height: 1920,
    directory: "clips",
    extension: "mp4",
    maxDurationSeconds: 15,
    constraints: {
      codec: "H.264/AAC",
      maxDurationSeconds: 15,
      aspectRatio: "9:16",
    },
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
    maxDurationSeconds: 90,
    constraints: {
      codec: "H.264/AAC",
      maxDurationSeconds: 90,
      aspectRatio: "9:16",
    },
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
    constraints: {
      codec: "H.264/AAC",
      maxDurationSeconds: 30,
      maxFileSizeBytes: 10 * MB,
      aspectRatio: "9:16",
    },
  },
  {
    id: "youtube-shorts",
    kind: "clip",
    label: "YouTube Shorts",
    platform: "YouTube",
    width: 1080,
    height: 1920,
    directory: "clips",
    extension: "mp4",
    maxDurationSeconds: 60,
    constraints: {
      codec: "H.264/AAC",
      maxDurationSeconds: 60,
      aspectRatio: "9:16",
    },
  },
  {
    id: "tiktok-vertical",
    kind: "clip",
    label: "TikTok vertical",
    platform: "TikTok",
    width: 1080,
    height: 1920,
    directory: "clips",
    extension: "mp4",
    maxDurationSeconds: 600,
    constraints: {
      codec: "H.264/AAC",
      maxDurationSeconds: 600,
      aspectRatio: "9:16",
    },
  },
  {
    id: "digital-booklet-editorial",
    kind: "booklet",
    label: "Encarte digital editorial",
    platform: "Encarte digital",
    width: 1440,
    height: 1920,
    directory: "encartes",
    extension: "html",
    bookletTheme: "midnight",
  },
  {
    id: "digital-booklet-profile",
    kind: "booklet",
    label: "Página de perfil",
    platform: "Encarte digital",
    width: 1440,
    height: 1920,
    directory: "encartes",
    extension: "html",
    bookletTheme: "studio",
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
  return Math.min(600, Math.max(1, duration));
}

export function publicationPresetMaxDurationSeconds(idOrPreset) {
  const preset =
    typeof idOrPreset === "string"
      ? publicationAssetPresetById(idOrPreset)
      : idOrPreset;
  return Math.max(
    1,
    Number(
      preset?.constraints?.maxDurationSeconds ??
        preset?.maxDurationSeconds ??
        600,
    ),
  );
}

export function clampPublicationClipDurationForPreset(value, idOrPreset) {
  return Math.min(
    publicationPresetMaxDurationSeconds(idOrPreset),
    clampPublicationClipDuration(value),
  );
}

export function publicationConstraintSummary(idOrPreset) {
  const preset =
    typeof idOrPreset === "string"
      ? publicationAssetPresetById(idOrPreset)
      : idOrPreset;
  const constraints = preset?.constraints;
  if (!constraints) return "";
  const parts = [];
  if (constraints.maxDurationSeconds) {
    parts.push(`até ${constraints.maxDurationSeconds}s`);
  }
  if (constraints.maxFileSizeBytes) {
    parts.push(`até ${formatConstraintBytes(constraints.maxFileSizeBytes)}`);
  }
  if (constraints.codec) {
    parts.push(constraints.codec);
  }
  if (constraints.aspectRatio) {
    parts.push(constraints.aspectRatio);
  }
  return parts.join(" · ");
}

function formatConstraintBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
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

export const publicationLyricsPositions = ["top", "center", "bottom"];
export const publicationLyricsStyles = ["minimal", "shadow", "boxed"];

export function normalizePublicationLyricsPosition(value) {
  const position = String(value ?? "").trim();
  return publicationLyricsPositions.includes(position) ? position : "bottom";
}

export function normalizePublicationLyricsStyle(value) {
  const style = String(value ?? "").trim();
  return publicationLyricsStyles.includes(style) ? style : "minimal";
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
      override.clipDuration = clampPublicationClipDurationForPreset(
        rawOverride.clipDuration,
        presetId,
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
    if (hasOwn(rawOverride, "lyricsPosition")) {
      override.lyricsPosition = normalizePublicationLyricsPosition(
        rawOverride.lyricsPosition,
      );
    }
    if (hasOwn(rawOverride, "lyricsStyle")) {
      override.lyricsStyle = normalizePublicationLyricsStyle(
        rawOverride.lyricsStyle,
      );
    }
    if (hasOwn(rawOverride, "bookletTheme")) {
      override.bookletTheme = normalizePublicationBookletTheme(
        rawOverride.bookletTheme,
      );
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
    clipDuration: clampPublicationClipDurationForPreset(
      defaults.clipDuration ?? 15,
      preset,
    ),
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
    lyricsPosition: normalizePublicationLyricsPosition(defaults.lyricsPosition),
    lyricsStyle: normalizePublicationLyricsStyle(defaults.lyricsStyle),
    bookletTheme: normalizePublicationBookletTheme(
      defaults.bookletTheme ?? preset.bookletTheme,
    ),
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
    clipDuration: clampPublicationClipDurationForPreset(
      merged.clipDuration,
      preset,
    ),
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
    lyricsPosition: normalizePublicationLyricsPosition(merged.lyricsPosition),
    lyricsStyle: normalizePublicationLyricsStyle(merged.lyricsStyle),
    bookletTheme: normalizePublicationBookletTheme(merged.bookletTheme),
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
