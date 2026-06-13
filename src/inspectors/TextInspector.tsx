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
import type { ScenePresetV3 } from "../../shared/visual-effects.mjs";
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
  normalizeTextFadeOut,
  normalizeTextOrder,
  positionPresetOptions,
  textFieldLabels,
  textFontOptions,
  textPositionPresets,
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
  scene,
  showMetadata,
  textSettings,
  onChange,
  onCommon,
  onTextSettings,
  onToggle,
  onApplyBatch,
  versionSuggestions,
}: {
  metadata: TrackMetadata;
  scene: ScenePresetV3;
  showMetadata: boolean;
  textSettings: TextOverlaySettings;
  onChange: (patch: Partial<TrackMetadata>) => void;
  onCommon: (key: string, value: number) => void;
  onTextSettings: (patch: Partial<TextOverlaySettings>) => void;
  onToggle: (checked: boolean) => void;
  onApplyBatch?: (mode: TextBatchApplyMode) => void;
  versionSuggestions: string[];
}) {
  const orderedFields = normalizeTextOrder(textSettings.order);

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
                  onChange={(x) => onTextSettings({ x })}
                />
                <RangeField
                  label="Vertical"
                  value={textSettings.y}
                  onChange={(y) => onTextSettings({ y })}
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
          <RangeField
            label="Escurecimento do fundo"
            value={scene.common.shade}
            onChange={(value) => onCommon("shade", value)}
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
                title="Copiar só a posição (x/y, alinhamento e âncora) para o lote"
                onClick={() => onApplyBatch("position")}
              >
                Posição
              </button>
              <button
                type="button"
                title="Copiar só o estilo (tipografia, cores, ordem) — cada faixa mantém sua posição"
                onClick={() => onApplyBatch("style")}
              >
                Estilo
              </button>
              <button
                className="upload-action"
                type="button"
                title="Copiar posição e estilo para o lote"
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
  const activePreset = (
    Object.keys(textPositionPresets) as PositionPresetId[]
  ).find((id) => {
    const p = textPositionPresets[id];
    return (
      p.x === textSettings.x &&
      p.y === textSettings.y &&
      p.verticalAnchor === textSettings.verticalAnchor &&
      p.align === textSettings.align
    );
  });
  return (
    <div className="text-position-picker">
      {(
        Object.entries(textPositionPresets) as [
          PositionPresetId,
          Partial<TextOverlaySettings>,
        ][]
      ).map(([id, preset]) => (
        <button
          key={id}
          className={id === activePreset ? "is-active" : ""}
          title={positionPresetOptions.find(([k]) => k === id)?.[1] ?? id}
          type="button"
          onClick={() => onTextSettings(preset)}
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
        >
          <button
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
            className={style.align === "left" ? "active" : ""}
            title="Alinhar à esquerda"
            type="button"
            onClick={() => onChange({ align: "left" })}
          >
            <AlignLeft />
          </button>
          <button
            className={style.align === "center" ? "active" : ""}
            title="Centralizar"
            type="button"
            onClick={() => onChange({ align: "center" })}
          >
            <AlignCenter />
          </button>
          <button
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
