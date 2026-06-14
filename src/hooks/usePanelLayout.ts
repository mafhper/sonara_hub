import {
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useEffect,
  useState,
} from "react";

export type PanelKind = "library" | "inspector";

export type PanelLayoutState = {
  floatingPanels: boolean;
  leftCollapsed: boolean;
  leftRailWidth: number;
  panelsSwapped: boolean;
  resizingPanel: PanelKind | null;
  rightCollapsed: boolean;
  rightRailWidth: number;
  shellStyle: CSSProperties;
};

export type PanelLayoutActions = {
  setLeftCollapsed: Dispatch<SetStateAction<boolean>>;
  setLeftRailWidth: Dispatch<SetStateAction<number>>;
  setPanelsSwapped: Dispatch<SetStateAction<boolean>>;
  setRightCollapsed: Dispatch<SetStateAction<boolean>>;
  setRightRailWidth: Dispatch<SetStateAction<number>>;
  startPanelResize: (
    panel: PanelKind,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
};

export type PanelLayoutApi = PanelLayoutState & PanelLayoutActions;

export const DEFAULT_LEFT_RAIL_WIDTH = 256;
export const DEFAULT_RIGHT_RAIL_WIDTH = 456;

const PANEL_WIDTH_STORAGE_KEY = "sonara-hub-panel-widths";
const PANEL_MIN_PREVIEW_WIDTH = 520;
const PANEL_FLOATING_STAGE_WIDTH = 620;
const LEFT_RAIL_BOUNDS = { min: 220, max: 380 };
const RIGHT_RAIL_BOUNDS = { min: 360, max: 620 };

export function usePanelLayout(): PanelLayoutApi {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [panelsSwapped, setPanelsSwapped] = useState(false);
  const [floatingPanels, setFloatingPanels] = useState(false);
  const [leftRailWidth, setLeftRailWidth] = useState(
    () => loadPanelWidths().left,
  );
  const [rightRailWidth, setRightRailWidth] = useState(
    () => loadPanelWidths().right,
  );
  const [resizingPanel, setResizingPanel] = useState<PanelKind | null>(null);
  const shellStyle = {
    "--rail-left": `${leftRailWidth}px`,
    "--rail-right": `${rightRailWidth}px`,
  } as CSSProperties;

  function toggleLeftPanel() {
    const next = !leftCollapsed;
    setLeftCollapsed(next);
    if (!next && floatingPanels) setRightCollapsed(true);
  }

  function toggleRightPanel() {
    const next = !rightCollapsed;
    setRightCollapsed(next);
    if (!next && floatingPanels) setLeftCollapsed(true);
  }

  function startPanelResize(
    panel: PanelKind,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (floatingPanels) return;
    event.preventDefault();
    event.stopPropagation();
    setResizingPanel(panel);

    const startX = event.clientX;
    const startWidth = panel === "library" ? leftRailWidth : rightRailWidth;
    const otherWidth = panel === "library" ? rightRailWidth : leftRailWidth;
    const bounds = panel === "library" ? LEFT_RAIL_BOUNDS : RIGHT_RAIL_BOUNDS;
    const dragDirection =
      panel === "library" ? (panelsSwapped ? -1 : 1) : panelsSwapped ? 1 : -1;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - startX) * dragDirection;
      const nextWidth = clampPanelWidth(startWidth + delta, bounds, otherWidth);
      if (panel === "library") {
        setLeftRailWidth(nextWidth);
        return;
      }
      setRightRailWidth(nextWidth);
    };

    const stopResize = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setResizingPanel(null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  useEffect(() => {
    const syncPanelMode = () => {
      const shouldFloat =
        window.innerWidth <= 980 ||
        window.innerWidth - leftRailWidth - rightRailWidth <
          PANEL_FLOATING_STAGE_WIDTH;
      setFloatingPanels((current) => {
        if (shouldFloat && !current) {
          setLeftCollapsed(true);
          setRightCollapsed(true);
        }
        return shouldFloat;
      });
    };
    syncPanelMode();
    window.addEventListener("resize", syncPanelMode);
    return () => window.removeEventListener("resize", syncPanelMode);
  }, [leftRailWidth, rightRailWidth]);

  useEffect(() => {
    if (!floatingPanels) return;
    if (!leftCollapsed && !rightCollapsed) {
      setLeftCollapsed(true);
      setRightCollapsed(true);
    }
  }, [floatingPanels, leftCollapsed, rightCollapsed]);

  useEffect(() => {
    savePanelWidths({ left: leftRailWidth, right: rightRailWidth });
  }, [leftRailWidth, rightRailWidth]);

  return {
    floatingPanels,
    leftCollapsed,
    leftRailWidth,
    panelsSwapped,
    resizingPanel,
    rightCollapsed,
    rightRailWidth,
    shellStyle,
    setLeftCollapsed,
    setLeftRailWidth,
    setPanelsSwapped,
    setRightCollapsed,
    setRightRailWidth,
    startPanelResize,
    toggleLeftPanel,
    toggleRightPanel,
  };
}

function loadPanelWidths() {
  const fallback = {
    left: DEFAULT_LEFT_RAIL_WIDTH,
    right: DEFAULT_RIGHT_RAIL_WIDTH,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      left: clampPanelWidth(
        Number(parsed.left) || fallback.left,
        LEFT_RAIL_BOUNDS,
        Number(parsed.right) || fallback.right,
      ),
      right: clampPanelWidth(
        Number(parsed.right) || fallback.right,
        RIGHT_RAIL_BOUNDS,
        Number(parsed.left) || fallback.left,
      ),
    };
  } catch {
    return fallback;
  }
}

function savePanelWidths(widths: { left: number; right: number }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PANEL_WIDTH_STORAGE_KEY,
      JSON.stringify(widths),
    );
  } catch {
    // Local layout preference can be ignored when storage is unavailable.
  }
}

function clampPanelWidth(
  value: number,
  bounds: { min: number; max: number },
  otherWidth: number,
) {
  const viewportWidth =
    typeof window === "undefined" ? 1440 : window.innerWidth;
  const viewportLimitedMax = Math.max(
    bounds.min,
    viewportWidth - otherWidth - PANEL_MIN_PREVIEW_WIDTH,
  );
  const max = Math.min(bounds.max, viewportLimitedMax);
  return Math.round(Math.min(Math.max(value, bounds.min), max));
}
