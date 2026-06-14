import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Disc3,
  Eye,
  EyeOff,
  Italic,
  Save,
} from "lucide-react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import {
  CheckField,
  ColorInput,
  NumberStepField,
  RangeField,
  SelectField,
  TextArea,
} from "../inspectors/fields";
import type {
  CoverSeriesMetaKey,
  CoverSeriesMetaStyle,
  CoverSeriesSettings,
  TrackDraft,
} from "../types";

export const defaultCoverSeriesSettings: CoverSeriesSettings = {
  enabled: true,
  style: "roman",
  sequence: "I, II, III, IV, V",
  fontSize: 112,
  color: "#fffaf1",
  opacity: 92,
  x: 50,
  y: 89,
  letterSpacing: 18,
  includeNumber: true,
  includeTitle: false,
  includeAlbum: false,
  includeArtist: false,
  includeYear: false,
  embedAlbumCover: false,
  metaOrder: "series, title, album, artist, year",
  metaFontSize: 34,
  metaGap: 10,
  metaStyles: {
    series: {
      fontSize: 112,
      fontWeight: 400,
      fontStyle: "normal",
      align: "center",
      color: "#fffaf1",
      opacity: 92,
      offsetX: 0,
      offsetY: 0,
    },
    title: {
      fontSize: 38,
      fontWeight: 720,
      fontStyle: "normal",
      align: "center",
      color: "#fffaf1",
      opacity: 88,
      offsetX: 0,
      offsetY: 0,
    },
    album: {
      fontSize: 34,
      fontWeight: 560,
      fontStyle: "normal",
      align: "center",
      color: "#fffaf1",
      opacity: 76,
      offsetX: 0,
      offsetY: 0,
    },
    artist: {
      fontSize: 32,
      fontWeight: 620,
      fontStyle: "normal",
      align: "center",
      color: "#fffaf1",
      opacity: 72,
      offsetX: 0,
      offsetY: 0,
    },
    year: {
      fontSize: 28,
      fontWeight: 640,
      fontStyle: "normal",
      align: "center",
      color: "#fffaf1",
      opacity: 68,
      offsetX: 0,
      offsetY: 0,
    },
  },
};

export const coverSeriesMetaKeys: CoverSeriesMetaKey[] = [
  "series",
  "title",
  "album",
  "artist",
  "year",
];

export function coverSeriesMetaStyleForKey(
  settings: CoverSeriesSettings,
  key: CoverSeriesMetaKey,
): CoverSeriesMetaStyle {
  return (
    settings.metaStyles?.[key] ?? defaultCoverSeriesSettings.metaStyles[key]
  );
}

export function coverSeriesAlignForPosition(
  x: number,
): CoverSeriesMetaStyle["align"] {
  if (x <= 33) return "left";
  if (x >= 67) return "right";
  return "center";
}

function coverSeriesAlignedMetaStyles(
  settings: CoverSeriesSettings,
  align: CoverSeriesMetaStyle["align"],
): CoverSeriesSettings["metaStyles"] {
  return Object.fromEntries(
    coverSeriesMetaKeys.map((key) => [
      key,
      {
        ...coverSeriesMetaStyleForKey(settings, key),
        align,
      },
    ]),
  ) as CoverSeriesSettings["metaStyles"];
}

export function CoverSeriesArtwork({
  artworkSrc,
  className,
  coverSeriesSettings,
  showSeries = true,
  track,
}: {
  artworkSrc?: string;
  className: string;
  coverSeriesSettings?: CoverSeriesSettings;
  showSeries?: boolean;
  track?: TrackDraft;
}) {
  const hasSeries =
    showSeries && track && coverSeriesSettings
      ? coverSeriesPreviewLines(track, coverSeriesSettings).length > 0
      : false;
  return (
    <span className={`cover-series-artwork ${className}`}>
      {artworkSrc ? <img alt="" src={artworkSrc} /> : <Disc3 />}
      {hasSeries && track && coverSeriesSettings && (
        <CoverSeriesOverlay settings={coverSeriesSettings} track={track} />
      )}
    </span>
  );
}

function CoverSeriesOverlay({
  settings,
  track,
}: {
  settings: CoverSeriesSettings;
  track: TrackDraft;
}) {
  const lines = coverSeriesPreviewLines(track, settings);
  let lineY = coverSeriesAxis(settings.y, 8, 94);
  return (
    <svg
      aria-hidden="true"
      className="cover-series-overlay"
      viewBox="0 0 1600 1600"
    >
      {lines.map((line) => {
        const y = lineY + line.style.offsetY;
        lineY +=
          line.key === "series"
            ? line.style.fontSize * 0.48 + settings.metaGap
            : line.style.fontSize + settings.metaGap;
        return (
          <text
            fill={line.style.color}
            fillOpacity={line.style.opacity / 100}
            fontFamily={
              line.key === "series"
                ? "Georgia, Times New Roman, serif"
                : "Inter, Arial, sans-serif"
            }
            fontSize={line.style.fontSize}
            fontStyle={line.style.fontStyle}
            fontWeight={line.style.fontWeight}
            key={line.key}
            letterSpacing={line.key === "series" ? settings.letterSpacing : 5}
            textAnchor={coverSeriesTextAnchor(line.style.align)}
            x={coverSeriesAxis(settings.x, 8, 92) + line.style.offsetX}
            y={y}
          >
            {line.text}
          </text>
        );
      })}
    </svg>
  );
}

function coverSeriesPreviewLabel(
  track: TrackDraft,
  settings: CoverSeriesSettings,
) {
  if (settings.style === "arabic") {
    return String(track.metadata.trackNumber || 1);
  }
  if (settings.style === "roman") {
    return romanNumeral(track.metadata.trackNumber || 1);
  }
  const entries = settings.sequence
    .split(/[\n,;|]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return (
    entries[Math.max(0, Number(track.metadata.trackNumber || 1) - 1)] ??
    entries[0] ??
    ""
  );
}

export function coverSeriesPreviewLines(
  track: TrackDraft,
  settings: CoverSeriesSettings,
) {
  const metadata: Record<CoverSeriesMetaKey, string> = {
    series: coverSeriesPreviewLabel(track, settings),
    title: track.metadata.title,
    album: track.metadata.album,
    artist: track.metadata.albumArtist || track.metadata.artist,
    year: track.metadata.year,
  };
  const visibility: Record<CoverSeriesMetaKey, boolean> = {
    series: settings.includeNumber !== false,
    title: settings.includeTitle,
    album: settings.includeAlbum,
    artist: settings.includeArtist,
    year: settings.includeYear,
  };
  return coverSeriesMetaOrder(settings.metaOrder)
    .filter((key) => visibility[key] && metadata[key])
    .map((key) => ({
      key,
      text: metadata[key],
      style: coverSeriesMetaStyleForKey(settings, key),
    }));
}

export function coverSeriesMetaOrder(value: string): CoverSeriesMetaKey[] {
  const allowed = new Set<CoverSeriesMetaKey>(coverSeriesMetaKeys);
  const parsed = String(value ?? "")
    .split(/[\n,;|]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is CoverSeriesMetaKey =>
      allowed.has(entry as CoverSeriesMetaKey),
    );
  const promoted: CoverSeriesMetaKey[] = parsed.includes("series")
    ? parsed
    : ["series", ...parsed];
  return [
    ...new Set<CoverSeriesMetaKey>([...promoted, ...coverSeriesMetaKeys]),
  ];
}

function coverSeriesAxis(value: number, min: number, max: number) {
  return (Math.max(min, Math.min(max, Number(value) || min)) / 100) * 1600;
}

function coverSeriesTextAnchor(align: CoverSeriesMetaStyle["align"]) {
  return align === "left" ? "start" : align === "right" ? "end" : "middle";
}

function romanNumeral(value: number) {
  let remaining = Math.max(0, Math.floor(Number(value) || 0));
  const pairs: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let output = "";
  for (const [number, numeral] of pairs) {
    while (remaining >= number) {
      output += numeral;
      remaining -= number;
    }
  }
  return output;
}

function CoverSeriesMetaControls({
  children,
  enabled,
  index,
  isFirst,
  isLast,
  label,
  onMove,
  onStyle,
  onToggle,
  sizeMax = 72,
  style,
}: {
  children?: ReactNode;
  enabled: boolean;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  label: string;
  onMove: (direction: -1 | 1) => void;
  onStyle: (patch: Partial<CoverSeriesMetaStyle>) => void;
  onToggle: () => void;
  sizeMax?: number;
  style: CoverSeriesMetaStyle;
}) {
  const stop = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <details
      className={`text-field-style ${enabled ? "" : "is-hidden-field"}`}
      open={enabled}
    >
      <summary>
        <span>
          {index + 1}. {label}
        </span>
        <span className="text-field-style-actions">
          <button
            aria-label={enabled ? `Ocultar ${label}` : `Mostrar ${label}`}
            aria-pressed={enabled}
            title={enabled ? "Visível na capa" : "Oculto"}
            type="button"
            onClick={(event) => {
              stop(event);
              onToggle();
            }}
          >
            {enabled ? <Eye /> : <EyeOff />}
          </button>
          <button
            aria-label={`Mover ${label} para cima`}
            disabled={isFirst}
            type="button"
            onClick={(event) => {
              stop(event);
              onMove(-1);
            }}
          >
            <ChevronUp />
          </button>
          <button
            aria-label={`Mover ${label} para baixo`}
            disabled={isLast}
            type="button"
            onClick={(event) => {
              stop(event);
              onMove(1);
            }}
          >
            <ChevronDown />
          </button>
        </span>
      </summary>
      <div className="text-field-style-body">
        {enabled ? (
          <>
            <div className="icon-toggle-row" aria-label={`Estilo de ${label}`}>
              <button
                className={style.fontWeight >= 700 ? "active" : ""}
                title="Negrito"
                type="button"
                onClick={() =>
                  onStyle({
                    fontWeight: style.fontWeight >= 700 ? 560 : 760,
                  })
                }
              >
                <Bold />
              </button>
              <button
                className={style.fontStyle === "italic" ? "active" : ""}
                title="Itálico"
                type="button"
                onClick={() =>
                  onStyle({
                    fontStyle:
                      style.fontStyle === "italic" ? "normal" : "italic",
                  })
                }
              >
                <Italic />
              </button>
              <span aria-hidden="true" />
              <button
                className={style.align === "left" ? "active" : ""}
                title="Alinhar à esquerda"
                type="button"
                onClick={() => onStyle({ align: "left" })}
              >
                <AlignLeft />
              </button>
              <button
                className={style.align === "center" ? "active" : ""}
                title="Centralizar"
                type="button"
                onClick={() => onStyle({ align: "center" })}
              >
                <AlignCenter />
              </button>
              <button
                className={style.align === "right" ? "active" : ""}
                title="Alinhar à direita"
                type="button"
                onClick={() => onStyle({ align: "right" })}
              >
                <AlignRight />
              </button>
            </div>
            <div className="two-columns">
              <NumberStepField
                label="Tamanho"
                max={sizeMax}
                min={18}
                unit="px"
                value={style.fontSize}
                onChange={(fontSize) => onStyle({ fontSize })}
              />
              <NumberStepField
                label="Peso"
                max={900}
                min={300}
                step={10}
                value={style.fontWeight}
                onChange={(fontWeight) => onStyle({ fontWeight })}
              />
            </div>
            <div className="two-columns">
              <ColorInput
                label="Cor"
                value={style.color}
                onChange={(color) => onStyle({ color })}
              />
              <RangeField
                label="Opacidade"
                value={style.opacity}
                onChange={(opacity) => onStyle({ opacity })}
              />
            </div>
            <div className="two-columns">
              <RangeField
                label="Deslocamento X"
                max={160}
                min={-160}
                unit="px"
                value={style.offsetX}
                onChange={(offsetX) => onStyle({ offsetX })}
              />
              <RangeField
                label="Deslocamento Y"
                max={160}
                min={-160}
                unit="px"
                value={style.offsetY}
                onChange={(offsetY) => onStyle({ offsetY })}
              />
            </div>
            {children}
          </>
        ) : null}
      </div>
    </details>
  );
}

const coverSeriesMetaLabels: Record<CoverSeriesMetaKey, string> = {
  series: "Série numérica",
  title: "Nome da música",
  album: "Nome do álbum",
  artist: "Autor",
  year: "Ano",
};

const coverSeriesIncludeKey: Record<
  CoverSeriesMetaKey,
  keyof CoverSeriesSettings
> = {
  series: "includeNumber",
  title: "includeTitle",
  album: "includeAlbum",
  artist: "includeArtist",
  year: "includeYear",
};

function CoverSeriesFieldsEditor({
  onChange,
  settings,
}: {
  onChange: (patch: Partial<CoverSeriesSettings>) => void;
  settings: CoverSeriesSettings;
}) {
  const order = coverSeriesMetaOrder(settings.metaOrder);
  const visibility: Record<CoverSeriesMetaKey, boolean> = {
    series: settings.includeNumber !== false,
    title: settings.includeTitle,
    album: settings.includeAlbum,
    artist: settings.includeArtist,
    year: settings.includeYear,
  };
  const applyChange = (patch: Partial<CoverSeriesSettings>) =>
    onChange({ enabled: true, ...patch });
  const move = (key: CoverSeriesMetaKey, direction: -1 | 1) => {
    const index = order.indexOf(key);
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    applyChange({ metaOrder: next.join(", ") });
  };
  return (
    <div className="text-field-style-stack">
      <span className="inspector-kicker">
        Campos complementares · ordem, exibição e estilo
      </span>
      {order.map((key, index) => (
        <CoverSeriesMetaControls
          enabled={visibility[key]}
          index={index}
          isFirst={index === 0}
          isLast={index === order.length - 1}
          key={key}
          label={coverSeriesMetaLabels[key]}
          sizeMax={key === "series" ? 180 : 72}
          style={coverSeriesMetaStyleForKey(settings, key)}
          onMove={(direction) => move(key, direction)}
          onStyle={(patch) =>
            applyChange({
              metaStyles: {
                ...settings.metaStyles,
                [key]: {
                  ...coverSeriesMetaStyleForKey(settings, key),
                  ...patch,
                },
              },
            })
          }
          onToggle={() =>
            applyChange({ [coverSeriesIncludeKey[key]]: !visibility[key] })
          }
        >
          {key === "series" ? (
            <>
              <div className="two-columns">
                <SelectField
                  label="Sequência"
                  value={settings.style}
                  onChange={(value) =>
                    applyChange({
                      style:
                        value === "custom" || value === "arabic"
                          ? value
                          : "roman",
                    })
                  }
                >
                  <option value="roman">Romana · I, II, III</option>
                  <option value="arabic">Arábica · 1, 2, 3</option>
                  <option value="custom">Personalizada</option>
                </SelectField>
                <RangeField
                  label="Espaçamento"
                  max={80}
                  unit="px"
                  value={settings.letterSpacing}
                  onChange={(letterSpacing) => applyChange({ letterSpacing })}
                />
              </div>
              {settings.style === "custom" && (
                <TextArea
                  label="Itens personalizados"
                  rows={3}
                  value={settings.sequence}
                  onChange={(sequence) => applyChange({ sequence })}
                />
              )}
            </>
          ) : null}
        </CoverSeriesMetaControls>
      ))}
    </div>
  );
}

export function CoverSeriesEditor({
  compact = false,
  onChange,
  onSaveDefault,
  settings,
}: {
  compact?: boolean;
  onChange: (patch: Partial<CoverSeriesSettings>) => void;
  onSaveDefault: (settings: CoverSeriesSettings) => void;
  settings: CoverSeriesSettings;
}) {
  const applyChange = (patch: Partial<CoverSeriesSettings>) =>
    onChange({ enabled: true, ...patch });
  return (
    <div className={`cover-series-editor ${compact ? "compact" : ""}`}>
      <div className="cover-series-section">
        <p className="cover-series-section-title">Posição da lista</p>
        <div className="cover-series-editor-grid">
          <RangeField
            label="Horizontal"
            value={settings.x}
            onChange={(x) =>
              applyChange({
                x,
                metaStyles: coverSeriesAlignedMetaStyles(
                  settings,
                  coverSeriesAlignForPosition(x),
                ),
              })
            }
          />
          <RangeField
            label="Vertical"
            value={settings.y}
            onChange={(y) => applyChange({ y })}
          />
        </div>
        <RangeField
          label="Espaço entre linhas"
          max={48}
          unit="px"
          value={settings.metaGap}
          onChange={(metaGap) => applyChange({ metaGap })}
        />
      </div>
      <div className="cover-series-section cover-series-meta">
        <CoverSeriesFieldsEditor settings={settings} onChange={applyChange} />
      </div>
      <div className="cover-series-section">
        <CheckField
          label="Manter capa do álbum embutida no MP3"
          checked={settings.embedAlbumCover === true}
          onChange={(embedAlbumCover) => applyChange({ embedAlbumCover })}
        />
        <button
          className="quiet-action"
          type="button"
          onClick={() => onSaveDefault(settings)}
        >
          <Save /> Salvar como padrão
        </button>
      </div>
    </div>
  );
}
