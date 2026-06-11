import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type CanvasDragState,
  type CanvasHitTarget,
  clampPct,
  hitTestCanvas,
  pointerToPct,
} from "./canvas-interaction";
import type { MediaLayerV2, TextOverlaySettings } from "./types";

interface Props {
  layers: MediaLayerV2[];
  showMetadata: boolean;
  textSettings: TextOverlaySettings;
  onUpdateLayer: (id: string, patch: Partial<MediaLayerV2>) => void;
  onUpdateTextSettings: (patch: Partial<TextOverlaySettings>) => void;
}

export function CanvasInteractionOverlay({
  layers,
  showMetadata,
  textSettings,
  onUpdateLayer,
  onUpdateTextSettings,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<CanvasDragState | null>(null);
  const [selection, setSelection] = useState<CanvasHitTarget | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Drop stale layer selection when the layer set changes (e.g. track switch).
  useEffect(() => {
    if (selection?.kind === "layer") {
      const still = layers.some((l) => l.id === selection.id);
      if (!still) setSelection(null);
    }
  }, [layers, selection]);

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pct = pointerToPct(e.clientX, e.clientY, rect);
    const hit = hitTestCanvas(
      pct,
      layers,
      textSettings.x,
      textSettings.y,
      showMetadata,
    );

    if (!hit) {
      setSelection(null);
      return;
    }

    setSelection(hit);
    setIsDragging(true);

    const startItemX =
      hit.kind === "layer"
        ? (layers.find((l) => l.id === hit.id)?.x ?? 50)
        : textSettings.x;
    const startItemY =
      hit.kind === "layer"
        ? (layers.find((l) => l.id === hit.id)?.y ?? 50)
        : textSettings.y;

    dragRef.current = {
      item: hit,
      startPointerPct: pct,
      startItemX,
      startItemY,
    };

    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pct = pointerToPct(e.clientX, e.clientY, rect);
    const deltaX = pct.x - drag.startPointerPct.x;
    const deltaY = pct.y - drag.startPointerPct.y;
    const newX = clampPct(drag.startItemX + deltaX);
    const newY = clampPct(drag.startItemY + deltaY);

    if (drag.item.kind === "layer") {
      onUpdateLayer(drag.item.id, { x: newX, y: newY });
    } else {
      onUpdateTextSettings({ x: newX, y: newY });
    }
  }

  function endDrag() {
    dragRef.current = null;
    setIsDragging(false);
  }

  // Resolve indicator position from live state so the handle tracks the drag.
  let indicatorX: number | null = null;
  let indicatorY: number | null = null;
  let indicatorKind: "layer" | "text" | null = null;

  if (selection?.kind === "layer") {
    const layer = layers.find((l) => l.id === selection.id);
    if (layer) {
      indicatorX = layer.x;
      indicatorY = layer.y;
      indicatorKind = "layer";
    }
  } else if (selection?.kind === "text" && showMetadata) {
    indicatorX = textSettings.x;
    indicatorY = textSettings.y;
    indicatorKind = "text";
  }

  return (
    <div
      ref={overlayRef}
      className={`canvas-interaction-overlay${isDragging ? " is-dragging" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {indicatorX !== null && indicatorY !== null && (
        <div
          className={`canvas-drag-handle canvas-drag-handle--${indicatorKind ?? "layer"}`}
          style={{ left: `${indicatorX}%`, top: `${indicatorY}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}
