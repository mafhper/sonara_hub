import { clampNumber } from "../../inspectors/fields";
import {
  coverSeriesMetaOrder,
  defaultCoverSeriesSettings,
} from "../../workspaces/CoverSeries";
import { COVER_SERIES_STORAGE_KEY } from "../../app/appDefaults";
import type { CoverSeriesMetaStyle, CoverSeriesSettings } from "../../types";

export function loadCoverSeriesSettings(): CoverSeriesSettings {
  if (typeof window === "undefined") return defaultCoverSeriesSettings;
  try {
    const raw = window.localStorage.getItem(COVER_SERIES_STORAGE_KEY);
    if (!raw) return defaultCoverSeriesSettings;
    return normalizeCoverSeriesClient(JSON.parse(raw));
  } catch {
    return defaultCoverSeriesSettings;
  }
}

export function saveCoverSeriesSettings(settings: CoverSeriesSettings) {
  try {
    window.localStorage.setItem(
      COVER_SERIES_STORAGE_KEY,
      JSON.stringify(settings),
    );
  } catch {
    // A reusable visual-series preference is optional local state.
  }
}

export function normalizeCoverSeriesClient(
  value: unknown,
): CoverSeriesSettings {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<CoverSeriesSettings>)
      : {};
  const legacyColor = /^#[0-9a-f]{6}$/i.test(String(candidate.color ?? ""))
    ? String(candidate.color)
    : defaultCoverSeriesSettings.color;
  const metaFontSize = clampNumber(
    Number(candidate.metaFontSize ?? defaultCoverSeriesSettings.metaFontSize),
    18,
    72,
    defaultCoverSeriesSettings.metaFontSize,
  );
  const seriesFallback = {
    ...defaultCoverSeriesSettings.metaStyles.series,
    fontSize: clampNumber(
      Number(candidate.fontSize ?? defaultCoverSeriesSettings.fontSize),
      18,
      180,
      defaultCoverSeriesSettings.metaStyles.series.fontSize,
    ),
    color: legacyColor,
    opacity: clampNumber(
      Number(candidate.opacity ?? defaultCoverSeriesSettings.opacity),
      20,
      100,
      defaultCoverSeriesSettings.metaStyles.series.opacity,
    ),
  };
  return {
    ...defaultCoverSeriesSettings,
    ...candidate,
    enabled: true,
    style: ["roman", "arabic", "custom"].includes(String(candidate.style))
      ? (candidate.style as CoverSeriesSettings["style"])
      : defaultCoverSeriesSettings.style,
    color: legacyColor,
    metaOrder: coverSeriesMetaOrder(
      String(candidate.metaOrder ?? defaultCoverSeriesSettings.metaOrder),
    ).join(", "),
    embedAlbumCover: candidate.embedAlbumCover === true,
    metaFontSize,
    metaGap: clampNumber(
      Number(candidate.metaGap ?? defaultCoverSeriesSettings.metaGap),
      0,
      48,
      defaultCoverSeriesSettings.metaGap,
    ),
    metaStyles: {
      series: normalizeCoverSeriesMetaStyleClient(
        candidate.metaStyles?.series,
        seriesFallback,
        180,
      ),
      title: normalizeCoverSeriesMetaStyleClient(candidate.metaStyles?.title, {
        ...defaultCoverSeriesSettings.metaStyles.title,
        fontSize: Math.max(38, metaFontSize),
      }),
      album: normalizeCoverSeriesMetaStyleClient(candidate.metaStyles?.album, {
        ...defaultCoverSeriesSettings.metaStyles.album,
        fontSize: metaFontSize,
      }),
      artist: normalizeCoverSeriesMetaStyleClient(
        candidate.metaStyles?.artist,
        {
          ...defaultCoverSeriesSettings.metaStyles.artist,
          fontSize: Math.max(18, metaFontSize - 2),
        },
      ),
      year: normalizeCoverSeriesMetaStyleClient(candidate.metaStyles?.year, {
        ...defaultCoverSeriesSettings.metaStyles.year,
        fontSize: Math.max(18, metaFontSize - 6),
      }),
    },
  };
}

function normalizeCoverSeriesMetaStyleClient(
  value: Partial<CoverSeriesMetaStyle> | undefined,
  fallback: CoverSeriesMetaStyle,
  maxFontSize = 72,
): CoverSeriesMetaStyle {
  return {
    fontSize: clampNumber(
      Number(value?.fontSize ?? fallback.fontSize),
      18,
      maxFontSize,
      fallback.fontSize,
    ),
    fontWeight: clampNumber(
      Number(value?.fontWeight ?? fallback.fontWeight),
      300,
      900,
      fallback.fontWeight,
    ),
    fontStyle: ["normal", "italic"].includes(String(value?.fontStyle))
      ? (value?.fontStyle as CoverSeriesMetaStyle["fontStyle"])
      : fallback.fontStyle,
    align: ["left", "center", "right"].includes(String(value?.align))
      ? (value?.align as CoverSeriesMetaStyle["align"])
      : fallback.align,
    color: /^#[0-9a-f]{6}$/i.test(String(value?.color ?? ""))
      ? String(value?.color)
      : fallback.color,
    opacity: clampNumber(
      Number(value?.opacity ?? fallback.opacity),
      20,
      100,
      fallback.opacity,
    ),
    offsetX: clampNumber(
      Number(value?.offsetX ?? fallback.offsetX),
      -320,
      320,
      fallback.offsetX,
    ),
    offsetY: clampNumber(
      Number(value?.offsetY ?? fallback.offsetY),
      -320,
      320,
      fallback.offsetY,
    ),
  };
}
