import { useEffect, useRef } from "react";

import type { RenderJob } from "../types";

// Dynamic favicon + document.title driven by the active workflow step and the
// render queue. The favicon is drawn on an offscreen canvas and swapped into a
// dedicated <link rel="icon"> so the static icons declared in index.html stay
// as a fallback (they take over again once restoreFavicon() runs).

export type PageStatusStep = "music" | "visual" | "text" | "export";
export type PageStatusJob = Pick<
  RenderJob,
  "id" | "status" | "progress" | "kind"
>;

const FAVICON_LINK_ID = "sonara-dynamic-favicon";
const BASE_TITLE = "Sonara Hub";

const STEP_META: Record<
  PageStatusStep,
  { glyph: string; color: string; title: string }
> = {
  music: { glyph: "♪", color: "#7c9cff", title: "Música" },
  visual: { glyph: "◐", color: "#9d7cff", title: "Visual" },
  text: { glyph: "T", color: "#5fd0c4", title: "Texto" },
  export: { glyph: "▤", color: "#ffb454", title: "Exportação" },
};

const ACTIVE_STATUSES = new Set(["queued", "paused", "running"]);

type JobSummary = {
  active: number;
  done: number;
  total: number;
  percent: number;
};

export function summarizeJobs(jobs: PageStatusJob[]): JobSummary {
  let active = 0;
  let done = 0;
  let progressSum = 0;
  for (const job of jobs) {
    if (ACTIVE_STATUSES.has(job.status)) {
      active += 1;
      progressSum += clampPercent(job.progress);
    } else if (job.status === "done") {
      done += 1;
    }
  }
  const total = active + done;
  const percent =
    total === 0 ? 0 : Math.round((done * 100 + progressSum) / total);
  return { active, done, total, percent };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function getCanvas(size: number): CanvasRenderingContext2D | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas.getContext("2d");
}

function drawProgressFavicon(percent: number, size = 64): string {
  const context = getCanvas(size);
  if (!context) return "";
  const center = size / 2;
  const radius = size * 0.4;
  const lineWidth = size * 0.12;
  context.clearRect(0, 0, size, size);

  // Track ring.
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.lineWidth = lineWidth;
  context.strokeStyle = "rgba(124, 156, 255, 0.25)";
  context.stroke();

  // Progress arc (starts at 12 o'clock).
  const start = -Math.PI / 2;
  const end = start + (Math.PI * 2 * clampPercent(percent)) / 100;
  context.beginPath();
  context.arc(center, center, radius, start, end);
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.strokeStyle = STEP_META.export.color;
  context.stroke();

  // Percentage label.
  context.fillStyle = "#f4f6ff";
  context.font = `600 ${size * 0.34}px Inter, system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`${Math.round(clampPercent(percent))}`, center, center + 1);

  return context.canvas.toDataURL("image/png");
}

function drawStepFavicon(step: PageStatusStep, size = 64): string {
  const context = getCanvas(size);
  if (!context) return "";
  const meta = STEP_META[step];
  const center = size / 2;
  context.clearRect(0, 0, size, size);

  // Rounded badge background.
  const radius = size * 0.22;
  roundedRect(context, 3, 3, size - 6, size - 6, radius);
  context.fillStyle = "#0e1322";
  context.fill();
  context.lineWidth = size * 0.06;
  context.strokeStyle = meta.color;
  context.stroke();

  context.fillStyle = meta.color;
  context.font = `700 ${size * 0.5}px Inter, system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(meta.glyph, center, center + size * 0.04);

  return context.canvas.toDataURL("image/png");
}

function drawDoneFavicon(size = 64): string {
  const context = getCanvas(size);
  if (!context) return "";
  const center = size / 2;
  context.clearRect(0, 0, size, size);

  context.beginPath();
  context.arc(center, center, size * 0.42, 0, Math.PI * 2);
  context.fillStyle = "#1f9d5b";
  context.fill();

  // Check mark.
  context.beginPath();
  context.moveTo(size * 0.3, size * 0.52);
  context.lineTo(size * 0.45, size * 0.68);
  context.lineTo(size * 0.72, size * 0.34);
  context.lineWidth = size * 0.12;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#f4fff6";
  context.stroke();

  return context.canvas.toDataURL("image/png");
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function setFavicon(href: string): void {
  if (!href) return;
  let link = document.getElementById(FAVICON_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = FAVICON_LINK_ID;
    link.rel = "icon";
    link.setAttribute("sizes", "any");
    document.head.appendChild(link);
  }
  link.href = href;
}

function restoreFavicon(): void {
  document.getElementById(FAVICON_LINK_ID)?.remove();
}

/**
 * Keeps the favicon and document title in sync with the active step and the
 * render queue:
 *  - exporting -> progress ring + "▶ N% · Exportando d/t — Sonara Hub"
 *  - all done  -> check favicon + "✓ Exportações concluídas — Sonara Hub"
 *                 (cleared on the next user interaction / tab focus)
 *  - idle      -> per-step badge + plain "Sonara Hub"
 */
export function usePageStatus(
  activeStep: PageStatusStep,
  jobs: PageStatusJob[],
): void {
  // Track whether we are showing the celebration state and the last percentage
  // painted, so we only repaint the (expensive) canvas when the integer % moves.
  const celebratingRef = useRef(false);
  const hadActiveRef = useRef(false);
  const lastPercentRef = useRef(-1);

  useEffect(() => {
    const summary = summarizeJobs(jobs);

    if (summary.active > 0) {
      hadActiveRef.current = true;
      celebratingRef.current = false;
      if (summary.percent !== lastPercentRef.current) {
        lastPercentRef.current = summary.percent;
        setFavicon(drawProgressFavicon(summary.percent));
      }
      document.title = `▶ ${summary.percent}% · Exportando ${Math.min(
        summary.done + 1,
        summary.total,
      )}/${summary.total} — ${BASE_TITLE}`;
      return;
    }

    lastPercentRef.current = -1;

    // The queue just drained after having had active jobs with at least one
    // success: celebrate until the user does something.
    if (hadActiveRef.current && summary.done > 0 && !celebratingRef.current) {
      hadActiveRef.current = false;
      celebratingRef.current = true;
      setFavicon(drawDoneFavicon());
      document.title = `✓ Exportações concluídas — ${BASE_TITLE}`;

      const clear = () => {
        celebratingRef.current = false;
        setFavicon(drawStepFavicon(activeStep));
        document.title = BASE_TITLE;
        removeListeners();
      };
      const onVisibility = () => {
        if (document.visibilityState === "visible") clear();
      };
      const removeListeners = () => {
        window.removeEventListener("pointerdown", clear);
        window.removeEventListener("keydown", clear);
        document.removeEventListener("visibilitychange", onVisibility);
      };
      window.addEventListener("pointerdown", clear, { once: true });
      window.addEventListener("keydown", clear, { once: true });
      document.addEventListener("visibilitychange", onVisibility);
      return removeListeners;
    }

    if (celebratingRef.current) {
      // Still celebrating; leave the done favicon/title untouched.
      return;
    }

    hadActiveRef.current = false;
    setFavicon(drawStepFavicon(activeStep));
    document.title = BASE_TITLE;
  }, [activeStep, jobs]);

  useEffect(() => {
    return () => {
      restoreFavicon();
      document.title = BASE_TITLE;
    };
  }, []);
}
