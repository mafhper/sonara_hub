// Normalization for the video text-overlay settings sent from the client.
//
// This MUST accept the full vocabulary the live preview and the shared scene
// runtime understand. A previous server-only version rebuilt the object with a
// reduced schema — dropping per-field styles (order, fieldStyles,
// verticalAnchor), the "justify" alignment and four of the seven position
// presets — so the exported video silently reverted those choices to defaults
// even though the preview honored them. The runtime hardens order/fieldStyles
// at draw time, so the rich fields are passed through untouched here.

export const textPresets = [
  "top-left",
  "bottom-center",
  "cover-left",
  "side-left",
  "side-right",
  "editorial-stack",
  "quiet-album",
];
export const textAligns = ["left", "center", "right", "justify"];
export const textVerticalAnchors = ["top", "middle", "bottom"];

export function normalizeTextSettings(value = {}) {
  const fields = value.fields ?? {};
  return {
    fields: {
      title: fields.title !== false,
      artist: fields.artist !== false,
      album: fields.album === true,
      year: fields.year === true,
      version: fields.version === true,
    },
    ...(Array.isArray(value.order) ? { order: value.order } : {}),
    ...(value.fieldStyles && typeof value.fieldStyles === "object"
      ? { fieldStyles: value.fieldStyles }
      : {}),
    preset: textPresets.includes(value.preset) ? value.preset : "top-left",
    fontFamily: ["Inter", "Georgia", "Arial"].includes(value.fontFamily)
      ? value.fontFamily
      : "Inter",
    fontSize: clampNumber(Number(value.fontSize ?? 42), 18, 96),
    fontWeight: clampNumber(Number(value.fontWeight ?? 650), 300, 850),
    letterSpacing: clampNumber(Number(value.letterSpacing ?? 0), 0, 16),
    lineHeight: clampNumber(Number(value.lineHeight ?? 118), 90, 180),
    color: isHexColor(value.color) ? value.color : "#f7f8fb",
    opacity: clampNumber(Number(value.opacity ?? 94), 20, 100),
    x: clampNumber(Number(value.x ?? 5), 0, 100),
    y: clampNumber(Number(value.y ?? 7), 0, 100),
    align: textAligns.includes(value.align) ? value.align : "left",
    verticalAnchor: textVerticalAnchors.includes(value.verticalAnchor)
      ? value.verticalAnchor
      : "top",
    shadow: clampNumber(Number(value.shadow ?? 48), 0, 100),
  };
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? ""));
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
