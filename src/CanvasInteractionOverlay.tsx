import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type CanvasDragState,
  type CanvasHitTarget,
  type CanvasResizeState,
  type ResizeCorner,
  clampPct,
  clampScale,
  computeResizeScale,
  hitTestCanvas,
  hitTestResizeCorner,
  layerBoundingBox,
  pointerToPct,
  textBoundingBox,
} from "./canvas-interaction";
import type { MediaLayerV2, TextOverlaySettings } from "./types";

interface Props {
  layers: MediaLayerV2[];
  showMetadata: boolean;
  textSettings: TextOverlaySettings;
  onUpdateLayer: (id: string, patch: Partial<MediaLayerV2>) => void;
  onUpdateTextSettings: (patch: Partial<TextOverlaySettings>) => void;
}

type InteractionState =
  | { mode: "idle" }
  | ({ mode: "dragging" } & CanvasDragState)
  | ({ mode: "resizing" } & CanvasResizeState);

const RESIZE_CORNERS: Array<{
  corner: ResizeCorner;
  cursor: string;
}> = [
  { corner: "nw", cursor: "nwse-resize" },
  { corner: "ne", cursor: "nesw-resize" },
  { corner: "se", cursor: "nwse-resize" },
  { corner: "sw", cursor: "nesw-resize" },
];

export function CanvasInteractionOverlay({
  layers,
  showMetadata,
  textSettings,
  onUpdateLayer,
  onUpdateTextSettings,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<CanvasHitTarget | null>(null);
  const [interaction, setInteraction] = useState<InteractionState>({
    mode: "idle",
  });
  const interactionRef = useRef<InteractionState>({ mode: "idle" });

  useEffect(() => {
    interactionRef.current = interaction;
  }, [interaction]);

  useEffect(() => {
    if (selection?.kind === "layer") {
      const still = layers.some((l) => l.id === selection.id);
      if (!still) setSelection(null);
    }
  }, [layers, selection]);

  function getCanvasRect(): DOMRect | undefined {
    return overlayRef.current?.getBoundingClientRect();
  }

  function getSelectedLayer(): MediaLayerV2 | undefined {
    if (selection?.kind !== "layer") return undefined;
    return layers.find((l) => l.id === selection.id);
  }

  function getSelectedBox(rect: DOMRect): {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null {
    if (selection?.kind === "layer") {
      const layer = getSelectedLayer();
      if (!layer) return null;
      const el = (layer as Record<string, unknown>).element as
        | {
            videoWidth?: number;
            naturalWidth?: number;
            videoHeight?: number;
            naturalHeight?: number;
          }
        | undefined;
      return layerBoundingBox(
        layer,
        rect.width,
        rect.height,
        el?.videoWidth ?? el?.naturalWidth,
        el?.videoHeight ?? el?.naturalHeight,
      );
    }
    if (selection?.kind === "text" && showMetadata) {
      return textBoundingBox(textSettings, rect.width, rect.height, 2);
    }
    return null;
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = getCanvasRect();
    if (!rect) return;
    const pct = pointerToPct(e.clientX, e.clientY, rect);

    if (selection) {
      const box = getSelectedBox(rect);
      if (box) {
        const corner = hitTestResizeCorner(pct, box);
        if (corner) {
          const layer = getSelectedLayer();
          const startScale =
            selection.kind === "layer" && layer
              ? layer.scale
              : textSettings.fontSize;
          const startX =
            selection.kind === "layer" && layer ? layer.x : textSettings.x;
          const startY =
            selection.kind === "layer" && layer ? layer.y : textSettings.y;
          const resizeState: CanvasResizeState = {
            item: selection,
            corner,
            startPointerPct: pct,
            startScale: startScale as number,
            startX: startX as number,
            startY: startY as number,
            startBox: box,
          };
          setInteraction({ mode: "resizing", ...resizeState });
          interactionRef.current = { mode: "resizing", ...resizeState };
          e.currentTarget.setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
        }
      }
    }

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

    const startItemX =
      hit.kind === "layer"
        ? (layers.find((l) => l.id === hit.id)?.x ?? 50)
        : textSettings.x;
    const startItemY =
      hit.kind === "layer"
        ? (layers.find((l) => l.id === hit.id)?.y ?? 50)
        : textSettings.y;

    const dragState: CanvasDragState = {
      item: hit,
      startPointerPct: pct,
      startItemX,
      startItemY,
    };
    setInteraction({ mode: "dragging", ...dragState });
    interactionRef.current = { mode: "dragging", ...dragState };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const state = interactionRef.current;
    if (state.mode === "idle") return;
    const rect = getCanvasRect();
    if (!rect) return;

    const pct = pointerToPct(e.clientX, e.clientY, rect);

    if (state.mode === "dragging") {
      const deltaX = pct.x - state.startPointerPct.x;
      const deltaY = pct.y - state.startPointerPct.y;
      const newX = clampPct(state.startItemX + deltaX);
      const newY = clampPct(state.startItemY + deltaY);

      if (state.item.kind === "layer") {
        onUpdateLayer(state.item.id, { x: newX, y: newY });
      } else {
        onUpdateTextSettings({ x: newX, y: newY });
      }
      return;
    }

    if (state.mode === "resizing") {
      const newScale = computeResizeScale(state, pct);

      if (state.item.kind === "layer") {
        onUpdateLayer(state.item.id, { scale: Math.round(newScale) });
      } else {
        const scaleRatio = newScale / state.startScale;
        const newFontSize = Math.round(textSettings.fontSize * scaleRatio);
        onUpdateTextSettings({
          fontSize:
            clampPct(newFontSize) > 0 ? newFontSize : textSettings.fontSize,
        });
      }
    }
  }

  function endInteraction() {
    setInteraction({ mode: "idle" });
    interactionRef.current = { mode: "idle" };
  }

  function handlePointerMoveOrResize(e: ReactPointerEvent<HTMLDivElement>) {
    const state = interactionRef.current;
    if (state.mode === "idle") return;

    if (state.mode === "dragging" || state.mode === "resizing") {
      handlePointerMove(e);
    }
  }

  let cursorClass = "";
  if (interaction.mode === "dragging") {
    cursorClass = " is-dragging";
  } else if (interaction.mode === "resizing") {
    if (interaction.corner === "nw" || interaction.corner === "se") {
      cursorClass = " is-resizing-nwse";
    } else {
      cursorClass = " is-resizing-nesw";
    }
  }

  const rect = overlayRef.current?.getBoundingClientRect();
  const box = selection && rect ? getSelectedBox(rect) : null;

  return (
    <div
      ref={overlayRef}
      className={`canvas-interaction-overlay${cursorClass}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMoveOrResize}
      onPointerUp={endInteraction}
      onPointerCancel={endInteraction}
    >
      {box && selection && (
        <div
          className="canvas-selection-outline"
          style={{
            left: `${box.left}%`,
            top: `${box.top}%`,
            width: `${box.width}%`,
            height: `${box.height}%`,
          }}
          aria-hidden
        />
      )}
      {box &&
        selection &&
        RESIZE_CORNERS.map(({ corner, cursor }) => {
          const x = corner === "nw" || corner === "sw" ? box.left : box.right;
          const y = corner === "nw" || corner === "ne" ? box.top : box.bottom;
          return (
            <div
              key={corner}
              className={`canvas-resize-handle canvas-resize-handle--${corner}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              aria-hidden
            />
          );
        })}
    </div>
  );
}
