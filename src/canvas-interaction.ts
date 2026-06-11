import type { MediaLayerV2, TextOverlaySettings } from "./types";

export type CanvasHitTarget = { kind: "layer"; id: string } | { kind: "text" };

export type ResizeCorner = "nw" | "ne" | "se" | "sw";

/** Convert a pointer event's client coordinates to canvas-relative 0–100 percentage. */
export function pointerToPct(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
    y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
  };
}

/**
 * Hit-test which draggable element is at the given canvas percentage position.
 *
 * Layer x/y and text x/y are both in the same 0–100 % space used by the
 * position controls, so proximity checks in that space give a reasonable
 * first-pass hit area. Layers are tested in reverse draw order (highest order =
 * front). Returns null when no element is close enough.
 */
export function hitTestCanvas(
  pct: { x: number; y: number },
  layers: MediaLayerV2[],
  textX: number,
  textY: number,
  showMetadata: boolean,
): CanvasHitTarget | null {
  const LAYER_RADIUS_SQ = 22 * 22;
  const TEXT_RADIUS_SQ = 14 * 14;

  const sorted = [...layers]
    .filter((l) => l.visible)
    .sort((a, b) => b.order - a.order);

  for (const layer of sorted) {
    const dx = pct.x - layer.x;
    const dy = pct.y - layer.y;
    if (dx * dx + dy * dy < LAYER_RADIUS_SQ) {
      return { kind: "layer", id: layer.id };
    }
  }

  if (showMetadata) {
    const dx = pct.x - textX;
    const dy = pct.y - textY;
    if (dx * dx + dy * dy < TEXT_RADIUS_SQ) {
      return { kind: "text" };
    }
  }

  return null;
}

/**
 * Estimate the bounding box of a layer in 0–100 % coordinates.
 *
 * Since layers use x/y as the anchor (center of drawn content), scale as a
 * percentage of the canvas, and fit as "cover" or "contain", we approximate the
 * visible box using the layer's scale relative to canvas dimensions. When the
 * element's natural dimensions are unknown, we fall back to a square estimate.
 */
export function layerBoundingBox(
  layer: MediaLayerV2,
  canvasWidth: number,
  canvasHeight: number,
  naturalWidth?: number,
  naturalHeight?: number,
): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
} {
  const scale = (layer.scale ?? 100) / 100;
  const nw = naturalWidth ?? canvasWidth;
  const nh = naturalHeight ?? canvasHeight;
  const targetW = canvasWidth * scale;
  const targetH = canvasHeight * scale;
  const factor =
    layer.fit === "cover"
      ? Math.max(targetW / nw, targetH / nh)
      : Math.min(targetW / nw, targetH / nh);
  const drawW = ((nw * factor) / canvasWidth) * 100;
  const drawH = ((nh * factor) / canvasHeight) * 100;
  const left = layer.x - drawW / 2;
  const top = layer.y - drawH / 2;
  return {
    left,
    top,
    right: left + drawW,
    bottom: top + drawH,
    width: drawW,
    height: drawH,
  };
}

/**
 * Estimate the bounding box of text in 0–100 % coordinates.
 *
 * Text size is approximate: fontSize maps to roughly fontSize/100 * canvas
 * height in lines, and the block width depends on the font and content. We use
 * a conservative estimate that's enough for resize handle placement.
 */
export function textBoundingBox(
  textSettings: TextOverlaySettings,
  canvasWidth: number,
  canvasHeight: number,
  lineCount: number,
): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
} {
  const fontSize = textSettings.fontSize ?? 40;
  const lineHeight = textSettings.lineHeight ?? 120;
  const approxWidth = Math.min(80, 10 + lineCount * 8);
  const approxHeight =
    ((fontSize * (lineHeight / 100) * Math.max(1, lineCount)) / canvasHeight) *
    100;
  const left = textSettings.x - approxWidth / 2;
  const top = textSettings.y - approxHeight / 2;
  return {
    left,
    top,
    right: left + approxWidth,
    bottom: top + approxHeight,
    width: approxWidth,
    height: approxHeight,
  };
}

/**
 * Hit-test a resize corner handle. Returns the corner if the pointer is within
 * HANDLE_RADIUS of one of the four corners of the given bounding box.
 */
export const RESIZE_HANDLE_RADIUS = 8;

export function hitTestResizeCorner(
  pct: { x: number; y: number },
  box: { left: number; top: number; right: number; bottom: number },
): ResizeCorner | null {
  const r = RESIZE_HANDLE_RADIUS;
  const corners: Array<{ corner: ResizeCorner; cx: number; cy: number }> = [
    { corner: "nw", cx: box.left, cy: box.top },
    { corner: "ne", cx: box.right, cy: box.top },
    { corner: "se", cx: box.right, cy: box.bottom },
    { corner: "sw", cx: box.left, cy: box.bottom },
  ];
  for (const { corner, cx, cy } of corners) {
    const dx = pct.x - cx;
    const dy = pct.y - cy;
    if (dx * dx + dy * dy < r * r) {
      return corner;
    }
  }
  return null;
}

/** Clamp a value to the 0–100 range. */
export function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** Clamp a scale value to a reasonable range (10%–400%). */
export function clampScale(v: number): number {
  return Math.max(10, Math.min(400, v));
}

export type CanvasDragState = {
  item: CanvasHitTarget;
  startPointerPct: { x: number; y: number };
  startItemX: number;
  startItemY: number;
};

export type CanvasResizeState = {
  item: CanvasHitTarget;
  corner: ResizeCorner;
  startPointerPct: { x: number; y: number };
  startScale: number;
  startX: number;
  startY: number;
  startBox: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
};

/**
 * Given a corner being dragged and the current pointer delta from the start,
 * compute the new scale for uniform scaling.
 *
 * The approach: measure how far the opposite corner of the box is from the
 * drag start, then measure the distance from the opposite corner to the current
 * pointer. The scale ratio is the ratio of those distances. This gives
 * proportional resize from any corner while keeping the opposite corner pinned.
 */
export function computeResizeScale(
  state: CanvasResizeState,
  currentPct: { x: number; y: number },
): number {
  const box = state.startBox;
  const opposite: Record<ResizeCorner, { x: number; y: number }> = {
    nw: { x: box.right, y: box.bottom },
    ne: { x: box.left, y: box.bottom },
    se: { x: box.left, y: box.top },
    sw: { x: box.right, y: box.top },
  };
  const anchor = opposite[state.corner];
  const startDist = Math.sqrt(
    (state.startPointerPct.x - anchor.x) ** 2 +
      (state.startPointerPct.y - anchor.y) ** 2,
  );
  const currentDist = Math.sqrt(
    (currentPct.x - anchor.x) ** 2 + (currentPct.y - anchor.y) ** 2,
  );
  if (startDist < 0.5) return state.startScale;
  const ratio = currentDist / startDist;
  return clampScale(state.startScale * ratio);
}
