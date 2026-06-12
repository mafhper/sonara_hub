import { ChevronDown, ChevronUp } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

export function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback = min,
) {
  const numeric = Number(value);
  return Math.min(
    Math.max(Number.isFinite(numeric) ? numeric : fallback, min),
    max,
  );
}

export function safeHex(value: string | undefined, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback;
}

export function hexToRgbColor(hex: string) {
  const value = safeHex(hex, "#ffffff").slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function rgbColorToHex(r: number, g: number, b: number) {
  const channel = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function hexToHsl(hex: string) {
  const { r, g, b } = hexToRgbColor(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToHex(h: number, s: number, l: number) {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbColorToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function InspectorGroup({
  children,
  title,
  open = false,
  scope,
}: {
  children: ReactNode;
  title: string;
  open?: boolean;
  scope?: "track" | "series";
}) {
  return (
    <details
      className={`inspector-group${scope ? ` inspector-group--${scope}` : ""}`}
      open={open}
    >
      <summary>
        <span className="inspector-group-label">
          {title}
          {scope === "series" && (
            <span className="inspector-scope-badge">Série</span>
          )}
          {scope === "track" && (
            <span className="inspector-scope-badge">Esta faixa</span>
          )}
        </span>
        <ChevronDown />
      </summary>
      <div className="inspector-body">{children}</div>
    </details>
  );
}

export function RangeField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = "",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  const [dragging, setDragging] = useState(false);
  // Draft keeps the raw text while the user is typing so we don't commit
  // intermediate states (e.g. clearing the field before typing a new number).
  const [draft, setDraft] = useState<string | null>(null);
  const commitValue = (next: number) =>
    onChange(clampNumber(next, min, max, value));
  const fineValue = Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : min;
  const displayValue = unit ? `${fineValue}${unit}` : String(fineValue);
  return (
    <label
      className={`range-field sonara-slider ${dragging ? "is-dragging" : ""}`}
      style={sliderStyle(value, min, max)}
    >
      <span className="range-field-header">
        {label}
        <span className="range-value-edit">
          <input
            aria-label={`${label} valor`}
            className="range-value"
            max={max}
            min={min}
            step={step}
            type="number"
            value={draft !== null ? draft : fineValue}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (draft !== null) {
                commitValue(Number(draft));
                setDraft(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && draft !== null) {
                commitValue(Number(draft));
                setDraft(null);
              } else if (event.key === "Escape") {
                setDraft(null);
              }
            }}
          />
          {unit && <i>{unit}</i>}
        </span>
      </span>
      <span className="sonara-slider-trackwrap">
        <input
          aria-label={label}
          aria-valuetext={displayValue}
          className="sonara-slider-control"
          min={min}
          max={max}
          step={step}
          type="range"
          value={value}
          onBlur={() => setDragging(false)}
          onChange={(event) => commitValue(Number(event.target.value))}
          onPointerCancel={() => setDragging(false)}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => setDragging(false)}
        />
        <span className="sonara-slider-value-badge" aria-hidden="true">
          {displayValue}
        </span>
      </span>
    </label>
  );
}

export function NumberStepField({
  label,
  max,
  min,
  step = 1,
  unit = "",
  value,
  onChange,
}: {
  label: string;
  max: number;
  min: number;
  step?: number;
  unit?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const commitValue = (next: number) =>
    onChange(clampNumber(next, min, max, value));
  return (
    <label className="number-step-field">
      <span>{label}</span>
      <div>
        <button
          aria-label={`Diminuir ${label}`}
          type="button"
          onClick={() => commitValue(value - step)}
        >
          <ChevronDown />
        </button>
        <input
          aria-label={label}
          max={max}
          min={min}
          step={step}
          type="number"
          value={Number.isFinite(value) ? Math.round(value * 100) / 100 : min}
          onChange={(event) => commitValue(Number(event.target.value))}
        />
        {unit && <small>{unit}</small>}
        <button
          aria-label={`Aumentar ${label}`}
          type="button"
          onClick={() => commitValue(value + step)}
        >
          <ChevronUp />
        </button>
      </div>
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const listId = suggestions ? `dl-${label.replace(/\W+/g, "-")}` : undefined;
  return (
    <label className="field">
      <span>{label}</span>
      <input
        list={listId}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </label>
  );
}

export function TextArea({
  label,
  rows = 5,
  value,
  onChange,
}: {
  label: string;
  rows?: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function SelectField({
  children,
  label,
  value,
  onChange,
}: {
  children: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

export function CheckField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="check-field">
      <input
        checked={checked}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

// Shared palette of recently-used colors, persisted in localStorage and synced
// across every ColorInput so a color picked in one place can be reused in
// another. Most-recent-first, de-duplicated, capped.
const RECENT_COLORS_KEY = "sonara.recentColors";
const RECENT_COLORS_LIMIT = 12;

const recentColorsStore = (() => {
  let colors: string[] = readRecentColors();
  const listeners = new Set<() => void>();
  function readRecentColors(): string[] {
    try {
      const raw = JSON.parse(
        window.localStorage.getItem(RECENT_COLORS_KEY) ?? "[]",
      );
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((entry): entry is string => typeof entry === "string")
        .filter((entry) => /^#[0-9a-f]{6}$/i.test(entry))
        .slice(0, RECENT_COLORS_LIMIT);
    } catch {
      return [];
    }
  }
  return {
    getSnapshot: () => colors,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    add(value: string) {
      if (!/^#[0-9a-f]{6}$/i.test(value)) return;
      const next = value.toLowerCase();
      const updated = [next, ...colors.filter((entry) => entry !== next)].slice(
        0,
        RECENT_COLORS_LIMIT,
      );
      if (
        updated.length === colors.length &&
        updated.every((entry, index) => entry === colors[index])
      ) {
        return;
      }
      colors = updated;
      try {
        window.localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(colors));
      } catch {
        // localStorage may be unavailable; the in-memory list still works.
      }
      listeners.forEach((listener) => listener());
    },
  };
})();

export function useRecentColors() {
  return useSyncExternalStore(
    recentColorsStore.subscribe,
    recentColorsStore.getSnapshot,
    recentColorsStore.getSnapshot,
  );
}

export function ColorSwatches({
  current,
  onPick,
}: {
  current: string;
  onPick: (value: string) => void;
}) {
  const recents = useRecentColors();
  if (recents.length === 0) return null;
  return (
    <div className="color-swatches">
      <span className="color-swatches-label">Recentes</span>
      <div className="color-swatches-row">
        {recents.map((color) => (
          <button
            aria-label={`Usar cor ${color}`}
            className={`color-swatch${color.toLowerCase() === current.toLowerCase() ? " is-active" : ""}`}
            key={color}
            style={{ background: color }}
            title={color.toUpperCase()}
            type="button"
            onClick={() => onPick(color)}
          />
        ))}
      </div>
    </div>
  );
}

export function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const hex = safeHex(value, "#ffffff");
  // HSL is the default editor (easier to explore variations than hex/rgb); the
  // stored value stays #RRGGBB. Keep HSL in local state so dragging one slider
  // doesn't jitter from hex rounding round-trips.
  const [mode, setMode] = useState<"hsl" | "hex" | "rgb">("hsl");
  const [hsl, setHsl] = useState(() => hexToHsl(hex));
  const [draft, setDraft] = useState(hex.toUpperCase());
  useEffect(() => {
    // Resync only when the value changed from outside, not from our own edit.
    if (hslToHex(hsl.h, hsl.s, hsl.l).toLowerCase() !== hex.toLowerCase()) {
      setHsl(hexToHsl(hex));
    }
    setDraft(hex.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex]);

  const commitHsl = (part: "h" | "s" | "l", next: number) => {
    const updated = { ...hsl, [part]: next };
    setHsl(updated);
    onChange(hslToHex(updated.h, updated.s, updated.l));
  };
  const commitDraft = (next: string) => {
    setDraft(next.toUpperCase());
    if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next);
  };
  const rgb = hexToRgbColor(hex);
  const commitRgb = (part: "r" | "g" | "b", next: number) => {
    const channel = Math.max(0, Math.min(255, Math.round(next) || 0));
    const updated = { ...rgb, [part]: channel };
    onChange(rgbColorToHex(updated.r, updated.g, updated.b));
  };
  const hueStops = "#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000";

  return (
    <div
      className="color-input"
      // Record the chosen color in the shared palette when focus leaves this
      // picker (so slider dragging doesn't spam the list).
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          recentColorsStore.add(safeHex(value, "#ffffff"));
        }
      }}
    >
      <span>{label}</span>
      <div className="color-input-main">
        <input
          aria-label={`${label} seletor de cor`}
          type="color"
          value={hex}
          onChange={(event) => {
            recentColorsStore.add(event.target.value);
            onChange(event.target.value);
          }}
        />
        <div className="color-mode-toggle" role="tablist">
          {(["hsl", "hex", "rgb"] as const).map((option) => (
            <button
              aria-selected={mode === option}
              className={mode === option ? "active" : ""}
              key={option}
              role="tab"
              type="button"
              onClick={() => setMode(option)}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {mode === "hsl" && (
        <div className="color-hsl">
          <ColorSlider
            label="H"
            max={360}
            trackBackground={`linear-gradient(90deg, ${hueStops})`}
            value={hsl.h}
            onChange={(next) => commitHsl("h", next)}
          />
          <ColorSlider
            label="S"
            max={100}
            trackBackground={`linear-gradient(90deg, ${hslToHex(hsl.h, 0, hsl.l)}, ${hslToHex(hsl.h, 100, hsl.l)})`}
            value={hsl.s}
            onChange={(next) => commitHsl("s", next)}
          />
          <ColorSlider
            label="L"
            max={100}
            trackBackground={`linear-gradient(90deg, #000, ${hslToHex(hsl.h, hsl.s, 50)}, #fff)`}
            value={hsl.l}
            onChange={(next) => commitHsl("l", next)}
          />
        </div>
      )}
      {mode === "hex" && (
        <input
          aria-label={`${label} hexadecimal`}
          className="color-hex-input color-hex-standalone"
          maxLength={7}
          spellCheck={false}
          value={draft}
          onBlur={() => setDraft(hex.toUpperCase())}
          onChange={(event) => commitDraft(event.target.value)}
        />
      )}
      {mode === "rgb" && (
        <div className="color-rgb">
          {(["r", "g", "b"] as const).map((channel) => (
            <label className="color-rgb-field" key={channel}>
              <span>{channel.toUpperCase()}</span>
              <input
                max={255}
                min={0}
                type="number"
                value={rgb[channel]}
                onChange={(event) =>
                  commitRgb(channel, Number(event.target.value))
                }
              />
            </label>
          ))}
        </div>
      )}
      <ColorSwatches
        current={hex}
        onPick={(color) => {
          recentColorsStore.add(color);
          onChange(color);
        }}
      />
    </div>
  );
}

export function ColorSlider({
  label,
  max,
  onChange,
  trackBackground,
  value,
}: {
  label: string;
  max: number;
  onChange: (value: number) => void;
  trackBackground: string;
  value: number;
}) {
  const [dragging, setDragging] = useState(false);
  // The value is editable directly (type the HSL number) as well as draggable;
  // clamp on change so an out-of-range entry can't push the channel past its max.
  const clamp = (next: number) =>
    Number.isFinite(next) ? Math.min(max, Math.max(0, Math.round(next))) : 0;
  return (
    <label
      className={`color-slider sonara-slider color-sonara-slider ${dragging ? "is-dragging" : ""}`}
      style={sliderStyle(value, 0, max, trackBackground)}
    >
      <span className="color-slider-label">{label}</span>
      <span className="sonara-slider-trackwrap">
        <input
          aria-label={`${label} slider`}
          aria-valuetext={String(value)}
          className="sonara-slider-control"
          max={max}
          min={0}
          type="range"
          value={value}
          onBlur={() => setDragging(false)}
          onChange={(event) => onChange(Number(event.target.value))}
          onPointerCancel={() => setDragging(false)}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => setDragging(false)}
        />
        <span className="sonara-slider-value-badge" aria-hidden="true">
          {value}
        </span>
      </span>
      <input
        aria-label={label}
        className="color-slider-value"
        max={max}
        min={0}
        type="number"
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
      />
    </label>
  );
}

export type SliderStyle = CSSProperties & {
  "--slider-progress": string;
  "--slider-value-x": string;
  "--slider-track"?: string;
};

export function sliderStyle(
  value: number,
  min: number,
  max: number,
  trackBackground?: string,
): SliderStyle {
  const span = max - min;
  const rawPercent = span > 0 ? ((value - min) / span) * 100 : 0;
  const percent = clampNumber(rawPercent, 0, 100, 0);
  return {
    "--slider-progress": `${percent}%`,
    "--slider-value-x": `${percent}%`,
    ...(trackBackground ? { "--slider-track": trackBackground } : {}),
  };
}

export function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="icon-button"
      disabled={disabled}
      title={label}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
