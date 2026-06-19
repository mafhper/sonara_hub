import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Italic,
  Layers3,
  RotateCcw,
} from "lucide-react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import type { TextBatchApplyMode } from "../../shared/composition-scope.mjs";
import { mergeTextSettingsByMode } from "../../shared/composition-scope.mjs";
import {
  CheckField,
  ColorInput,
  InspectorGroup,
  NumberStepField,
  RangeField,
  SelectField,
  TextField,
} from "./fields";
import { FadeInFields } from "./LayerControls";
import { normalizeFadeIn } from "./layer-normalizers";
import { TextProfiles } from "./TextProfiles";
import {
  type PositionPresetId,
  cloneTextSettings,
  defaultTextSettings,
  nearestTextPositionPreset,
  normalizeTextFadeOut,
  normalizeTextOrder,
  positionPresetOptions,
  textFieldLabels,
  textFontOptions,
  textPositionPresets,
  textPositionPatch,
  textStylePresetLabels,
  textStylePresetPatch,
} from "./text-presets";
import type {
  TextFieldKey,
  TextFieldStyle,
  TextOverlaySettings,
  TrackMetadata,
} from "../types";

type TextFadeOutSettings = NonNullable<TextFieldStyle["fadeOut"]>;

export function TextInspector({
  metadata,
  showMetadata,
  textSettings,
  onChange,
  onTextSettings,
  onToggle,
  onApplyBatch,
  versionSuggestions,
}: {
  metadata: TrackMetadata;
  showMetadata: boolean;
  textSettings: TextOverlaySettings;
  onChange: (patch: Partial<TrackMetadata>) => void;
  onTextSettings: (patch: Partial<TextOverlaySettings>) => void;
  onToggle: (checked: boolean) => void;
  onApplyBatch?: (mode: TextBatchApplyMode) => void;
  versionSuggestions: string[];
}) {
  const orderedFields = normalizeTextOrder(textSettings.order);

  function updatePosition(
    patch: Pick<Partial<TextOverlaySettings>, "x" | "y">,
  ) {
    onTextSettings(textPositionPatch(textSettings, patch));
  }

  function moveTextField(field: TextFieldKey, direction: -1 | 1) {
    const index = orderedFields.indexOf(field);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= orderedFields.length) return;
    const next = [...orderedFields];
    [next[index], next[target]] = [next[target], next[index]];
    onTextSettings({ order: next });
  }

  function updateFieldStyle(
    field: TextFieldKey,
    patch: Partial<TextFieldStyle>,
  ) {
    onTextSettings({
      fieldStyles: {
        ...textSettings.fieldStyles,
        [field]: {
          ...textSettings.fieldStyles[field],
          ...patch,
        },
      },
    });
  }

  return (
    <>
      <InspectorGroup title="Texto no vídeo" open scope="track">
        <CheckField
          label="Mostrar texto no vídeo"
          checked={showMetadata}
          onChange={onToggle}
        />
        <p className="helper-copy">
          Mostre/oculte e reordene cada campo na lista “Ordem dos campos” abaixo
          (ícone de olho + setas).
        </p>
        <TextField
          label="Título"
          value={metadata.title}
          onChange={(title) => onChange({ title })}
        />
        <TextField
          label="Artista"
          value={metadata.artist}
          placeholder={metadata.albumArtist || ""}
          onChange={(artist) => onChange({ artist })}
        />
        <TextField
          label="Álbum"
          value={metadata.album}
          onChange={(album) => onChange({ album })}
        />
        <div className="two-columns">
          <TextField
            label="Ano"
            value={metadata.year}
            onChange={(year) => onChange({ year })}
          />
          <TextField
            label="Versão"
            suggestions={versionSuggestions}
            value={metadata.version}
            onChange={(version) => onChange({ version })}
          />
        </div>
      </InspectorGroup>
      <InspectorGroup title="Tipografia e posição" open scope="track">
        <div className="inspector-subsection">
          <div className="text-profiles-header">
            <p className="inspector-kicker">Perfis de texto</p>
            <button
              className="icon-button"
              title="Restaurar configuração padrão"
              type="button"
              onClick={() =>
                onTextSettings(cloneTextSettings(defaultTextSettings))
              }
            >
              <RotateCcw />
            </button>
          </div>
          <TextProfiles
            current={textSettings}
            onApply={(settings, mode) =>
              onTextSettings(
                mergeTextSettingsByMode(
                  textSettings,
                  settings,
                  mode,
                  cloneTextSettings,
                ),
              )
            }
          />
        </div>
        <div className="inspector-subsection">
          <p className="inspector-kicker">Layout</p>
          <SelectField
            label="Estilo de texto"
            value={textSettings.preset}
            onChange={(preset) =>
              onTextSettings(
                textStylePresetPatch(preset as TextOverlaySettings["preset"]),
              )
            }
          >
            {Object.entries(textStylePresetLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <p className="helper-copy">
            Estilos só mudam tipografia e cor — não movem o bloco. Use “Posição”
            abaixo para reposicionar.
          </p>
        </div>
        <div className="inspector-subsection">
          <p className="inspector-kicker">Posição</p>
          <div className="inspector-row-inline">
            <TextPositionPicker
              textSettings={textSettings}
              onTextSettings={onTextSettings}
            />
            <div className="inspector-col-fill">
              <div className="two-columns">
                <RangeField
                  label="Horizontal"
                  value={textSettings.x}
                  onChange={(x) => updatePosition({ x })}
                />
                <RangeField
                  label="Vertical"
                  value={textSettings.y}
                  onChange={(y) => updatePosition({ y })}
                />
              </div>
              <details className="inspector-advanced">
                <summary>Ajuste fino de alinhamento</summary>
                <div className="two-columns">
                  <SelectField
                    label="Alinhamento"
                    value={textSettings.align}
                    onChange={(align) =>
                      onTextSettings({
                        align: align as TextOverlaySettings["align"],
                      })
                    }
                  >
                    <option value="left">Esquerda</option>
                    <option value="center">Centro</option>
                    <option value="right">Direita</option>
                    <option value="justify">Justificado</option>
                  </SelectField>
                  <SelectField
                    label="Âncora"
                    value={textSettings.verticalAnchor}
                    onChange={(verticalAnchor) =>
                      onTextSettings({
                        verticalAnchor:
                          verticalAnchor as TextOverlaySettings["verticalAnchor"],
                      })
                    }
                  >
                    <option value="top">Topo</option>
                    <option value="middle">Centro</option>
                    <option value="bottom">Base</option>
                  </SelectField>
                </div>
                <p className="helper-copy">
                  A grade de posição já define alinhamento e âncora; use aqui
                  para descasar (ex.: justificado) ou ajustar manualmente.
                </p>
              </details>
            </div>
          </div>
        </div>
        <div className="inspector-subsection">
          <p className="inspector-kicker">Fundo</p>
          <RangeField
            label="Sombra"
            value={textSettings.shadow}
            onChange={(shadow) => onTextSettings({ shadow })}
          />
        </div>
        <div className="text-field-style-stack">
          <span className="inspector-kicker">
            Campos · ordem, visibilidade e estilo individual
          </span>
          {orderedFields.map((field, index) => (
            <TextFieldStyleEditor
              field={field}
              index={index}
              isFirst={index === 0}
              isLast={index === orderedFields.length - 1}
              key={field}
              style={textSettings.fieldStyles[field]}
              visible={textSettings.fields[field]}
              onChange={(patch) => updateFieldStyle(field, patch)}
              onMove={(direction) => moveTextField(field, direction)}
              onToggleVisible={() =>
                onTextSettings({
                  fields: {
                    ...textSettings.fields,
                    [field]: !textSettings.fields[field],
                  },
                })
              }
            />
          ))}
        </div>
        {onApplyBatch && (
          <div className="inspector-subsection">
            <p className="inspector-kicker">Aplicar ao lote selecionado</p>
            <div className="text-action-row text-batch-apply">
              <button
                type="button"
                title="Aplicar só a posição (x/y, alinhamento e âncora) às faixas selecionadas"
                onClick={() => onApplyBatch("position")}
              >
                Posição
              </button>
              <button
                type="button"
                title="Aplicar só o estilo (tipografia, cores, ordem) às faixas selecionadas"
                onClick={() => onApplyBatch("style")}
              >
                Estilo
              </button>
              <button
                type="button"
                title="Aplicar posição e estilo às faixas selecionadas"
                onClick={() => onApplyBatch("all")}
              >
                <Layers3 /> Tudo
              </button>
            </div>
          </div>
        )}
      </InspectorGroup>
    </>
  );
}

function TextFadeOutFields({
  label,
  settings,
  onChange,
}: {
  label: string;
  settings: TextFadeOutSettings;
  onChange: (patch: Partial<TextFadeOutSettings>) => void;
}) {
  return (
    <div className="text-fade-controls">
      <CheckField
        label={`Fade-out de ${label}`}
        checked={settings.enabled}
        onChange={(enabled) => onChange({ enabled })}
      />
      {settings.enabled && (
        <>
          <SelectField
            label="Tipo de fade"
            value={settings.mode ?? "tail"}
            onChange={(mode) =>
              onChange({ mode: mode === "timed" ? "timed" : "tail" })
            }
          >
            <option value="tail">Final do vídeo</option>
            <option value="timed">Ponto + duração</option>
          </SelectField>
          {(settings.mode ?? "tail") === "timed" ? (
            <>
              <RangeField
                label="Começa em"
                max={95}
                min={0}
                step={5}
                unit="% do vídeo"
                value={settings.startPercent ?? 10}
                onChange={(startPercent) => onChange({ startPercent })}
              />
              <RangeField
                label="Duração"
                max={20}
                min={0.25}
                step={0.25}
                unit="s"
                value={settings.durationSeconds ?? 2}
                onChange={(durationSeconds) => onChange({ durationSeconds })}
              />
            </>
          ) : (
            <RangeField
              label="Duração do fade"
              max={95}
              min={5}
              step={5}
              unit="% finais"
              value={settings.endPercent}
              onChange={(endPercent) => onChange({ endPercent })}
            />
          )}
        </>
      )}
    </div>
  );
}

const positionPickerIcons: Record<PositionPresetId, ReactNode> = {
  "top-left": (
    <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <circle cx="2" cy="2" r="2" fill="currentColor" />
    </svg>
  ),
  "top-center": (
    <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <circle cx="5" cy="2" r="2" fill="currentColor" />
    </svg>
  ),
  "top-right": (
    <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="2" r="2" fill="currentColor" />
    </svg>
  ),
  "middle-left": (
    <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <circle cx="2" cy="5" r="2" fill="currentColor" />
    </svg>
  ),
  center: (
    <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <circle cx="5" cy="5" r="2" fill="currentColor" />
    </svg>
  ),
  "middle-right": (
    <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="5" r="2" fill="currentColor" />
    </svg>
  ),
  "bottom-left": (
    <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <circle cx="2" cy="8" r="2" fill="currentColor" />
    </svg>
  ),
  "bottom-center": (
    <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <circle cx="5" cy="8" r="2" fill="currentColor" />
    </svg>
  ),
  "bottom-right": (
    <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </svg>
  ),
};

function TextPositionPicker({
  textSettings,
  onTextSettings,
}: {
  textSettings: TextOverlaySettings;
  onTextSettings: (patch: Partial<TextOverlaySettings>) => void;
}) {
  const activePreset = nearestTextPositionPreset(
    textSettings.x,
    textSettings.y,
  );
  return (
    <div className="text-position-picker">
      {(
        Object.entries(textPositionPresets) as [
          PositionPresetId,
          (typeof textPositionPresets)[PositionPresetId],
        ][]
      ).map(([id, preset]) => (
        <button
          aria-label={`Posicionar texto em ${
            positionPresetOptions.find(([k]) => k === id)?.[1] ?? id
          }`}
          aria-pressed={id === activePreset}
          className={id === activePreset ? "is-active" : ""}
          key={id}
          title={positionPresetOptions.find(([k]) => k === id)?.[1] ?? id}
          type="button"
          onClick={() =>
            onTextSettings(textPositionPatch(textSettings, preset))
          }
        >
          {positionPickerIcons[id]}
        </button>
      ))}
    </div>
  );
}

function TextFieldStyleEditor({
  field,
  index,
  isFirst,
  isLast,
  onChange,
  onMove,
  onToggleVisible,
  style,
  visible,
}: {
  field: TextFieldKey;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<TextFieldStyle>) => void;
  onMove: (direction: -1 | 1) => void;
  onToggleVisible: () => void;
  style: TextFieldStyle;
  visible: boolean;
}) {
  const stop = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <details
      className={`text-field-style ${visible ? "" : "is-hidden-field"}`}
      open={visible}
    >
      <summary>
        <span>
          {index + 1}. {textFieldLabels[field]}
        </span>
        <span className="text-field-style-actions">
          <button
            aria-label={
              visible
                ? `Ocultar ${textFieldLabels[field]}`
                : `Mostrar ${textFieldLabels[field]}`
            }
            aria-pressed={visible}
            title={visible ? "Visível no vídeo" : "Oculto"}
            type="button"
            onClick={(event) => {
              stop(event);
              onToggleVisible();
            }}
          >
            {visible ? <Eye /> : <EyeOff />}
          </button>
          <button
            aria-label={`Mover ${textFieldLabels[field]} para cima`}
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
            aria-label={`Mover ${textFieldLabels[field]} para baixo`}
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
        <SelectField
          label="Fonte"
          value={style.fontFamily}
          onChange={(fontFamily) =>
            onChange({ fontFamily: fontFamily as TextFieldStyle["fontFamily"] })
          }
        >
          {(["Sans-serif", "Serif", "Display"] as const).map((cat) => (
            <optgroup key={cat} label={cat}>
              {textFontOptions
                .filter((f) => f.category === cat)
                .map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </SelectField>
        <div
          className="icon-toggle-row"
          aria-label={`Estilo de ${textFieldLabels[field]}`}
          role="group"
        >
          <button
            aria-label={`Alternar negrito em ${textFieldLabels[field]}`}
            aria-pressed={style.fontWeight >= 700}
            className={style.fontWeight >= 700 ? "active" : ""}
            title="Negrito"
            type="button"
            onClick={() =>
              onChange({ fontWeight: style.fontWeight >= 700 ? 560 : 760 })
            }
          >
            <Bold />
          </button>
          <button
            aria-label={`Alternar itálico em ${textFieldLabels[field]}`}
            aria-pressed={style.fontStyle === "italic"}
            className={style.fontStyle === "italic" ? "active" : ""}
            title="Itálico"
            type="button"
            onClick={() =>
              onChange({
                fontStyle: style.fontStyle === "italic" ? "normal" : "italic",
              })
            }
          >
            <Italic />
          </button>
          <span aria-hidden="true" />
          <button
            aria-label={`Alternar maiúsculas em ${textFieldLabels[field]}`}
            aria-pressed={(style.textTransform ?? "none") === "uppercase"}
            className={
              (style.textTransform ?? "none") === "uppercase" ? "active" : ""
            }
            title="MAIÚSCULAS"
            type="button"
            onClick={() =>
              onChange({
                textTransform:
                  (style.textTransform ?? "none") === "uppercase"
                    ? "none"
                    : "uppercase",
              })
            }
          >
            <span style={{ fontWeight: 700, fontSize: "0.7rem" }}>AA</span>
          </button>
          <button
            aria-label={`Alternar minúsculas em ${textFieldLabels[field]}`}
            aria-pressed={(style.textTransform ?? "none") === "lowercase"}
            className={
              (style.textTransform ?? "none") === "lowercase" ? "active" : ""
            }
            title="minúsculas"
            type="button"
            onClick={() =>
              onChange({
                textTransform:
                  (style.textTransform ?? "none") === "lowercase"
                    ? "none"
                    : "lowercase",
              })
            }
          >
            <span style={{ fontSize: "0.7rem" }}>aa</span>
          </button>
          <span aria-hidden="true" />
          <button
            aria-label={`Alinhar ${textFieldLabels[field]} à esquerda`}
            aria-pressed={style.align === "left"}
            className={style.align === "left" ? "active" : ""}
            title="Alinhar à esquerda"
            type="button"
            onClick={() => onChange({ align: "left" })}
          >
            <AlignLeft />
          </button>
          <button
            aria-label={`Centralizar ${textFieldLabels[field]}`}
            aria-pressed={style.align === "center"}
            className={style.align === "center" ? "active" : ""}
            title="Centralizar"
            type="button"
            onClick={() => onChange({ align: "center" })}
          >
            <AlignCenter />
          </button>
          <button
            aria-label={`Alinhar ${textFieldLabels[field]} à direita`}
            aria-pressed={style.align === "right"}
            className={style.align === "right" ? "active" : ""}
            title="Alinhar à direita"
            type="button"
            onClick={() => onChange({ align: "right" })}
          >
            <AlignRight />
          </button>
        </div>
        <div className="two-columns">
          <NumberStepField
            label="Tamanho"
            max={96}
            min={10}
            unit="px"
            value={style.fontSize}
            onChange={(fontSize) => onChange({ fontSize })}
          />
          <NumberStepField
            label="Peso"
            max={900}
            min={300}
            step={10}
            value={style.fontWeight}
            onChange={(fontWeight) => onChange({ fontWeight })}
          />
        </div>
        <div className="two-columns">
          <NumberStepField
            label="Espaçamento"
            max={24}
            min={0}
            unit="px"
            value={style.letterSpacing}
            onChange={(letterSpacing) => onChange({ letterSpacing })}
          />
          <NumberStepField
            label="Altura"
            max={180}
            min={90}
            unit="%"
            value={style.lineHeight}
            onChange={(lineHeight) => onChange({ lineHeight })}
          />
        </div>
        <ColorInput
          label="Cor"
          value={style.color}
          onChange={(color) => onChange({ color })}
        />
        <RangeField
          label="Opacidade"
          value={style.opacity}
          onChange={(opacity) => onChange({ opacity })}
        />
        <TextFadeOutFields
          label={textFieldLabels[field]}
          settings={normalizeTextFadeOut(style.fadeOut)}
          onChange={(fadeOut) =>
            onChange({
              fadeOut: normalizeTextFadeOut({
                ...style.fadeOut,
                ...fadeOut,
              }),
            })
          }
        />
        <FadeInFields
          label={textFieldLabels[field]}
          settings={normalizeFadeIn(style.fadeIn)}
          onChange={(fadeIn) =>
            onChange({
              fadeIn: normalizeFadeIn({
                ...style.fadeIn,
                ...fadeIn,
              }),
            })
          }
        />
      </div>
    </details>
  );
}
