import { normalizeFadeIn } from "./layer-normalizers";
import { clampNumber, safeHex } from "./fields";
import type {
  TextFieldKey,
  TextFieldStyle,
  TextOverlaySettings,
} from "../types";

type TextFadeOutSettings = NonNullable<TextFieldStyle["fadeOut"]>;

export const textFieldOrder: TextFieldKey[] = [
  "title",
  "version",
  "artist",
  "album",
  "year",
];

export const textFieldLabels: Record<TextFieldKey, string> = {
  title: "Música",
  version: "Versão",
  artist: "Autor",
  album: "Álbum",
  year: "Ano",
};

export const defaultTextFieldStyles: Record<TextFieldKey, TextFieldStyle> = {
  title: {
    fontFamily: "Inter",
    fontSize: 42,
    fontWeight: 720,
    fontStyle: "normal",
    letterSpacing: 0,
    lineHeight: 116,
    color: "#f7f8fb",
    opacity: 96,
    align: "left",
  },
  version: {
    fontFamily: "Inter",
    fontSize: 25,
    fontWeight: 620,
    fontStyle: "normal",
    letterSpacing: 1,
    lineHeight: 118,
    color: "#cbd2dc",
    opacity: 72,
    align: "left",
  },
  artist: {
    fontFamily: "Inter",
    fontSize: 28,
    fontWeight: 620,
    fontStyle: "normal",
    letterSpacing: 0,
    lineHeight: 120,
    color: "#cbd2dc",
    opacity: 82,
    align: "left",
  },
  album: {
    fontFamily: "Georgia",
    fontSize: 26,
    fontWeight: 560,
    fontStyle: "normal",
    letterSpacing: 0,
    lineHeight: 122,
    color: "#d6c7a4",
    opacity: 72,
    align: "left",
  },
  year: {
    fontFamily: "Inter",
    fontSize: 21,
    fontWeight: 620,
    fontStyle: "normal",
    letterSpacing: 4,
    lineHeight: 116,
    color: "#a5afbc",
    opacity: 62,
    align: "left",
  },
};

export const defaultTextSettings: TextOverlaySettings = {
  fields: {
    title: true,
    artist: true,
    album: false,
    year: false,
    version: false,
  },
  order: textFieldOrder,
  fieldStyles: defaultTextFieldStyles,
  preset: "top-left",
  fontFamily: "Inter",
  fontSize: 42,
  fontWeight: 650,
  letterSpacing: 0,
  lineHeight: 118,
  color: "#f7f8fb",
  opacity: 94,
  x: 5,
  y: 7,
  align: "left",
  verticalAnchor: "top",
  shadow: 48,
};

export type PositionPresetId =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export const positionPresetOptions: Array<[PositionPresetId, string]> = [
  ["top-left", "Canto superior esquerdo"],
  ["top-center", "Topo · centro"],
  ["top-right", "Canto superior direito"],
  ["middle-left", "Esquerda · centro"],
  ["center", "Centro"],
  ["middle-right", "Direita · centro"],
  ["bottom-left", "Canto inferior esquerdo"],
  ["bottom-center", "Base · centro"],
  ["bottom-right", "Canto inferior direito"],
];

export const textPositionPresets: Record<
  PositionPresetId,
  Partial<TextOverlaySettings>
> = {
  "top-left": { x: 5, y: 7, verticalAnchor: "top", align: "left" },
  "top-center": { x: 50, y: 7, verticalAnchor: "top", align: "center" },
  "top-right": { x: 95, y: 7, verticalAnchor: "top", align: "right" },
  "middle-left": { x: 5, y: 50, verticalAnchor: "middle", align: "left" },
  center: { x: 50, y: 50, verticalAnchor: "middle", align: "center" },
  "middle-right": { x: 95, y: 50, verticalAnchor: "middle", align: "right" },
  "bottom-left": { x: 5, y: 93, verticalAnchor: "bottom", align: "left" },
  "bottom-center": { x: 50, y: 93, verticalAnchor: "bottom", align: "center" },
  "bottom-right": { x: 95, y: 93, verticalAnchor: "bottom", align: "right" },
};

export const textFontOptions: Array<{
  value: TextFieldStyle["fontFamily"];
  label: string;
  category: string;
}> = [
  { value: "Inter", label: "Inter", category: "Sans-serif" },
  { value: "Montserrat", label: "Montserrat", category: "Sans-serif" },
  { value: "Oswald", label: "Oswald", category: "Sans-serif" },
  { value: "Raleway", label: "Raleway", category: "Sans-serif" },
  { value: "Space Grotesk", label: "Space Grotesk", category: "Sans-serif" },
  { value: "Arial", label: "Arial", category: "Sans-serif" },
  { value: "Playfair Display", label: "Playfair Display", category: "Serif" },
  {
    value: "Cormorant Garamond",
    label: "Cormorant Garamond",
    category: "Serif",
  },
  { value: "DM Serif Display", label: "DM Serif Display", category: "Serif" },
  { value: "Cinzel", label: "Cinzel", category: "Serif" },
  { value: "Georgia", label: "Georgia", category: "Serif" },
  { value: "Bebas Neue", label: "Bebas Neue", category: "Display" },
];

export const textStylePresetLabels: Record<
  TextOverlaySettings["preset"],
  string
> = {
  "top-left": "Topo esquerdo",
  "bottom-center": "Base central",
  "cover-left": "Capa à esquerda",
  "side-left": "Lado a lado · esquerda",
  "side-right": "Lado a lado · direita",
  "editorial-stack": "Editorial",
  "quiet-album": "Álbum discreto",
  "jazz-serif": "Jazz · Playfair",
  "bold-impact": "Impacto · Oswald",
  "cinzel-caps": "Épico · Cinzel",
  "ambient-light": "Ambiental · Cormorant",
  "minimal-grotesk": "Minimal · Space Grotesk",
};

export const defaultTextFadeOut: TextFadeOutSettings = {
  enabled: false,
  mode: "tail",
  endPercent: 70,
  startPercent: 10,
  durationSeconds: 2,
};

export function cloneTextSettings(settings?: TextOverlaySettings) {
  return mergeTextSettings(settings);
}

export function normalizeTextOrder(order?: TextFieldKey[]) {
  const incoming = Array.isArray(order) ? order : [];
  const next = incoming.filter(
    (field): field is TextFieldKey =>
      textFieldOrder.includes(field as TextFieldKey) &&
      !incoming.slice(0, incoming.indexOf(field)).includes(field),
  );
  return [...next, ...textFieldOrder.filter((field) => !next.includes(field))];
}

function mergeTextFieldStyle(
  field: TextFieldKey,
  base?: Partial<TextFieldStyle>,
  patch?: Partial<TextFieldStyle>,
): TextFieldStyle {
  const fallback = defaultTextFieldStyles[field];
  const candidateFont =
    patch?.fontFamily ?? base?.fontFamily ?? fallback.fontFamily;
  const fontFamily = textFontOptions.some((f) => f.value === candidateFont)
    ? candidateFont
    : fallback.fontFamily;
  return {
    fontFamily,
    fontSize: clampNumber(
      patch?.fontSize ?? base?.fontSize,
      10,
      96,
      fallback.fontSize,
    ),
    fontWeight: clampNumber(
      patch?.fontWeight ?? base?.fontWeight,
      300,
      900,
      fallback.fontWeight,
    ),
    fontStyle:
      (patch?.fontStyle ?? base?.fontStyle) === "italic"
        ? "italic"
        : fallback.fontStyle,
    letterSpacing: clampNumber(
      patch?.letterSpacing ?? base?.letterSpacing,
      0,
      24,
      fallback.letterSpacing,
    ),
    lineHeight: clampNumber(
      patch?.lineHeight ?? base?.lineHeight,
      90,
      180,
      fallback.lineHeight,
    ),
    color: safeHex(patch?.color ?? base?.color, fallback.color),
    opacity: clampNumber(
      patch?.opacity ?? base?.opacity,
      0,
      100,
      fallback.opacity,
    ),
    fadeOut: normalizeTextFadeOut(patch?.fadeOut ?? base?.fadeOut),
    fadeIn: normalizeFadeIn(patch?.fadeIn ?? base?.fadeIn),
    align: ["left", "center", "right"].includes(
      patch?.align ?? base?.align ?? fallback.align,
    )
      ? (patch?.align ?? base?.align ?? fallback.align)
      : fallback.align,
  };
}

export function normalizeTextFadeOut(
  value?: Partial<TextFadeOutSettings> | null,
): TextFadeOutSettings {
  const mode = value?.mode === "timed" ? "timed" : "tail";
  return {
    enabled: value?.enabled === true,
    mode,
    endPercent: clampNumber(
      Number(value?.endPercent ?? defaultTextFadeOut.endPercent),
      5,
      95,
      defaultTextFadeOut.endPercent,
    ),
    startPercent: clampNumber(
      Number(value?.startPercent ?? defaultTextFadeOut.startPercent),
      0,
      95,
      defaultTextFadeOut.startPercent,
    ),
    durationSeconds: clampNumber(
      Number(value?.durationSeconds ?? defaultTextFadeOut.durationSeconds),
      0.25,
      60,
      defaultTextFadeOut.durationSeconds,
    ),
  };
}

export function normalizeTextFieldStyles(
  base?: Partial<Record<TextFieldKey, Partial<TextFieldStyle>>>,
  patch?: Partial<Record<TextFieldKey, Partial<TextFieldStyle>>>,
) {
  return textFieldOrder.reduce(
    (styles, field) => ({
      ...styles,
      [field]: mergeTextFieldStyle(field, base?.[field], patch?.[field]),
    }),
    {} as Record<TextFieldKey, TextFieldStyle>,
  );
}

export function mergeTextSettings(
  base?: Partial<TextOverlaySettings>,
  patch: Partial<TextOverlaySettings> = {},
): TextOverlaySettings {
  return {
    ...defaultTextSettings,
    ...base,
    ...patch,
    order: normalizeTextOrder(patch.order ?? base?.order),
    fieldStyles: normalizeTextFieldStyles(base?.fieldStyles, patch.fieldStyles),
    fields: {
      ...defaultTextSettings.fields,
      ...(base?.fields ?? {}),
      ...(patch.fields ?? {}),
    },
  };
}

export function textStylePresetPatch(
  preset: TextOverlaySettings["preset"],
): Partial<TextOverlaySettings> {
  if (preset === "bottom-center") {
    return {
      preset,
      order: ["title", "version", "artist", "album", "year"],
      fieldStyles: normalizeTextFieldStyles(undefined, {
        title: { fontSize: 36, fontWeight: 720, color: "#ffffff" },
        artist: { fontSize: 24, opacity: 76 },
        album: { fontSize: 22, opacity: 64 },
        year: { fontSize: 18, letterSpacing: 3, opacity: 58 },
      }),
      fontSize: 34,
      shadow: 58,
    };
  }
  if (preset === "cover-left") {
    return {
      preset,
      order: ["title", "artist", "album", "year", "version"],
      fieldStyles: normalizeTextFieldStyles(undefined, {
        title: { fontSize: 40, fontWeight: 760 },
        artist: { fontSize: 25, opacity: 78 },
        album: { fontSize: 22, color: "#d6c7a4", opacity: 62 },
      }),
      fontSize: 38,
      shadow: 52,
    };
  }
  if (preset === "side-left" || preset === "side-right") {
    return {
      preset,
      order: ["title", "album", "artist", "year", "version"],
      fieldStyles: normalizeTextFieldStyles(undefined, {
        title: { fontSize: 42, fontWeight: 760 },
        album: { fontSize: 25, color: "#d6c7a4", opacity: 76 },
        artist: { fontSize: 24, opacity: 78 },
      }),
      fontSize: 36,
      shadow: 54,
    };
  }
  if (preset === "editorial-stack") {
    return {
      preset,
      order: ["title", "album", "artist", "year", "version"],
      fieldStyles: normalizeTextFieldStyles(undefined, {
        title: {
          fontFamily: "Georgia",
          fontSize: 52,
          fontWeight: 620,
          color: "#fff6df",
        },
        album: {
          fontFamily: "Georgia",
          fontSize: 30,
          fontWeight: 560,
          color: "#d9bd86",
          opacity: 84,
        },
        artist: { fontSize: 24, fontWeight: 640, opacity: 78 },
        year: {
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: 7,
          opacity: 64,
        },
      }),
      fontSize: 44,
      shadow: 66,
    };
  }
  if (preset === "quiet-album") {
    return {
      preset,
      order: ["title", "artist", "album", "year", "version"],
      fieldStyles: normalizeTextFieldStyles(undefined, {
        title: { fontSize: 32, fontWeight: 690, color: "#f7f8fb" },
        artist: { fontSize: 21, opacity: 70 },
        album: { fontSize: 20, color: "#b9c2d1", opacity: 62 },
        year: { fontSize: 15, letterSpacing: 4, opacity: 54 },
      }),
      fontSize: 32,
      shadow: 46,
    };
  }
  if (preset === "jazz-serif") {
    return {
      preset,
      order: ["title", "artist", "album", "year", "version"],
      fieldStyles: normalizeTextFieldStyles(undefined, {
        title: {
          fontFamily: "Playfair Display",
          fontSize: 46,
          fontWeight: 700,
          fontStyle: "italic",
          color: "#fff8ec",
        },
        artist: {
          fontFamily: "Playfair Display",
          fontSize: 26,
          fontWeight: 400,
          color: "#d6c89a",
          opacity: 80,
        },
        album: {
          fontFamily: "Inter",
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: 6,
          textTransform: "uppercase",
          opacity: 60,
        },
        year: {
          fontFamily: "Inter",
          fontSize: 14,
          letterSpacing: 4,
          textTransform: "uppercase",
          opacity: 50,
        },
      }),
      fontSize: 46,
      shadow: 64,
    };
  }
  if (preset === "bold-impact") {
    return {
      preset,
      order: ["title", "artist", "version", "album", "year"],
      fieldStyles: normalizeTextFieldStyles(undefined, {
        title: {
          fontFamily: "Oswald",
          fontSize: 56,
          fontWeight: 700,
          textTransform: "uppercase",
          color: "#ffffff",
          letterSpacing: 2,
        },
        artist: {
          fontFamily: "Oswald",
          fontSize: 28,
          fontWeight: 400,
          textTransform: "uppercase",
          letterSpacing: 4,
          color: "#c8d0de",
          opacity: 82,
        },
        album: {
          fontFamily: "Inter",
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: 6,
          textTransform: "uppercase",
          opacity: 56,
        },
      }),
      fontSize: 54,
      shadow: 70,
    };
  }
  if (preset === "cinzel-caps") {
    return {
      preset,
      order: ["title", "artist", "album", "year", "version"],
      fieldStyles: normalizeTextFieldStyles(undefined, {
        title: {
          fontFamily: "Cinzel",
          fontSize: 40,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 5,
          color: "#f5edda",
        },
        artist: {
          fontFamily: "Cinzel",
          fontSize: 20,
          fontWeight: 400,
          textTransform: "uppercase",
          letterSpacing: 8,
          color: "#c9bfa0",
          opacity: 74,
        },
        album: {
          fontFamily: "Cinzel",
          fontSize: 15,
          fontWeight: 400,
          textTransform: "uppercase",
          letterSpacing: 6,
          opacity: 56,
        },
      }),
      fontSize: 38,
      shadow: 62,
    };
  }
  if (preset === "ambient-light") {
    return {
      preset,
      order: ["title", "artist", "album", "year", "version"],
      fieldStyles: normalizeTextFieldStyles(undefined, {
        title: {
          fontFamily: "Cormorant Garamond",
          fontSize: 50,
          fontWeight: 300,
          fontStyle: "italic",
          color: "#fffdf8",
          letterSpacing: 1,
        },
        artist: {
          fontFamily: "Cormorant Garamond",
          fontSize: 24,
          fontWeight: 400,
          color: "#cfc9b4",
          opacity: 76,
        },
        album: {
          fontFamily: "Inter",
          fontSize: 13,
          fontWeight: 400,
          letterSpacing: 5,
          textTransform: "uppercase",
          color: "#a09882",
          opacity: 58,
        },
        year: {
          fontFamily: "Inter",
          fontSize: 12,
          letterSpacing: 3,
          textTransform: "uppercase",
          opacity: 48,
        },
      }),
      fontSize: 44,
      shadow: 42,
    };
  }
  if (preset === "minimal-grotesk") {
    return {
      preset,
      order: ["title", "artist", "album", "year", "version"],
      fieldStyles: normalizeTextFieldStyles(undefined, {
        title: {
          fontFamily: "Space Grotesk",
          fontSize: 38,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 3,
          color: "#ffffff",
        },
        artist: {
          fontFamily: "Space Grotesk",
          fontSize: 20,
          fontWeight: 400,
          color: "#b2bccb",
          letterSpacing: 1,
          opacity: 78,
        },
        album: {
          fontFamily: "Space Grotesk",
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: 4,
          textTransform: "uppercase",
          opacity: 56,
        },
      }),
      fontSize: 38,
      shadow: 44,
    };
  }
  return {
    preset,
    order: ["title", "version", "artist", "album", "year"],
    fieldStyles: normalizeTextFieldStyles(),
    fontSize: 42,
    shadow: 48,
  };
}
