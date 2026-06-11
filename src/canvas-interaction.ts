import type { MediaLayerV2, TextOverlaySettings } from "./types";

export type CanvasHitTarget = { kind: "layer"; id: string } | { kind: "text" };

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
  // Generous radius — layers can be large, text block can span half the canvas.
  // These are in the same 0–100 % units as x/y.
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

/** Clamp a value to the 0–100 range. */
export function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export type CanvasDragState = {
  item: CanvasHitTarget;
  startPointerPct: { x: number; y: number };
  startItemX: number;
  startItemY: number;
};
