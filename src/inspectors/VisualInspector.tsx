import {
  Copy,
  Eye,
  EyeOff,
  Image,
  Layers3,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import type {
  CloudLightSettings,
  PlayfulContent,
  RenderStackItem,
  ScenePresetV3,
  VisualCommonControlKey,
  VisualPalette,
  WaveformType,
  WaveformV1,
} from "../../shared/visual-effects.mjs";
import type { MediaLayerV2 } from "../types";
import {
  CheckField,
  ColorInput,
  IconButton,
  InspectorGroup,
  RangeField,
  SelectField,
  TextField,
} from "./fields";
import { LayerControls } from "./LayerControls";
import { LayerSets } from "./LayerSets";
import {
  CompositionStackList,
  buildRenderStackItems,
  stackItemDescription,
  stackItemIcon,
} from "./CompositionStack";
import { VisualPresetBrowser } from "./VisualPresetBrowser";

export type CoverLayerPreset =
  | "background"
  | "left"
  | "center"
  | "right"
  | "corner";
export type PlayfulPatch = Partial<
  Omit<PlayfulContent, "enabled" | "collections">
> & {
  enabled?: Partial<PlayfulContent["enabled"]>;
  collections?: Partial<PlayfulContent["collections"]>;
};

// Quick-pick gradients for the waveform (color, secondaryColor, tertiaryColor).
const waveformGradientPresets: Array<{
  name: string;
  colors: [string, string, string];
}> = [
  { name: "Aurora", colors: ["#7bd7ff", "#9b8cff", "#f6a6ff"] },
  { name: "Pôr do sol", colors: ["#ffd479", "#ff7e5f", "#7a4cff"] },
  { name: "Esmeralda", colors: ["#34e5b3", "#2bb3a3", "#1e6b8f"] },
  { name: "Brasa", colors: ["#ffe08a", "#ff9f45", "#ff5252"] },
  { name: "Gelo", colors: ["#eaf2ff", "#a9c2e8", "#6f86b6"] },
  { name: "Neon", colors: ["#00f5d4", "#00bbf9", "#9b5de5"] },
];

export const coverLayerPresetLabels: Record<CoverLayerPreset, string> = {
  background: "Fundo",
  left: "Esquerda",
  center: "Centro",
  right: "Direita",
  corner: "Canto",
};
const visualColorLabels: Record<keyof ScenePresetV3["colors"], string> = {
  base: "Base",
  effect: "Movimento",
  light: "Luz",
};
const commonControlDefinitions: Array<{
  key: VisualCommonControlKey;
  label: string;
  max?: number;
  unit?: string;
}> = [
  { key: "intensity", label: "Intensidade" },
  { key: "speed", label: "Velocidade" },
  { key: "brightness", label: "Brilho" },
  { key: "direction", label: "Direção da deriva", max: 360, unit: "°" },
  { key: "audioReaction", label: "Reação musical" },
  { key: "shade", label: "Escurecimento do fundo" },
];
const waveformStylePresets: Array<{
  name: string;
  description: string;
  patch: Partial<Omit<WaveformV1, "advanced">> & {
    advanced?: Partial<WaveformV1["advanced"]>;
  };
}> = [
  {
    name: "Visor âmbar",
    description: "Barras com pico decaindo e gradiente quente.",
    patch: {
      type: "spectrum-bars",
      colorMode: "gradient",
      color: "#76d6a6",
      secondaryColor: "#e3d06f",
      tertiaryColor: "#e79b66",
      opacity: 76,
      height: 26,
      position: 86,
      width: 88,
      thickness: 3,
      smoothing: 58,
      audioReaction: 74,
      advanced: {
        barGap: 38,
        barRadius: 28,
        barPeakHold: 82,
        barPeakDecay: 34,
      },
    },
  },
  {
    name: "Espectro colorido",
    description: "Barras arredondadas com cores por banda.",
    patch: {
      type: "spectrum-bars",
      colorMode: "bands",
      color: "#70c7ff",
      secondaryColor: "#e9c769",
      tertiaryColor: "#e8799a",
      opacity: 78,
      height: 28,
      position: 86,
      width: 92,
      thickness: 4,
      smoothing: 52,
      audioReaction: 78,
      advanced: {
        barGap: 30,
        barRadius: 62,
        barPeakHold: 58,
        barPeakDecay: 48,
      },
    },
  },
  {
    name: "Anel editorial",
    description: "Anel radial amplo para capa ou vinil central.",
    patch: {
      type: "radial-ring",
      colorMode: "gradient",
      color: "#8bc8ff",
      secondaryColor: "#b4a3ff",
      tertiaryColor: "#f0c978",
      opacity: 84,
      height: 38,
      position: 53,
      width: 100,
      thickness: 4,
      smoothing: 48,
      audioReaction: 82,
      advanced: {
        radialRadius: 30,
        radialArc: 92,
        radialRotation: 0,
        radialGlow: 58,
      },
    },
  },
];
export function waveformTypeLabel(type: WaveformType) {
  return {
    "mirror-line": "Linha espelhada",
    "single-line": "Linha simples",
    "filled-ribbon": "Faixa preenchida",
    "spectrum-bars": "Barras espectrais",
    "radial-ring": "Anel radial",
  }[type];
}

function selectedPaletteId(scene: ScenePresetV3) {
  return (
    scene.palettes.find((palette) => visualPaletteMatchesScene(palette, scene))
      ?.id ??
    scene.palettes[0]?.id ??
    ""
  );
}

function visualPaletteMatchesScene(
  palette: VisualPalette,
  scene: ScenePresetV3,
) {
  return (
    visualColorsEqual(palette.colors, scene.colors) &&
    visualNumberMapMatches(palette.common, scene.common) &&
    visualNumberMapMatches(palette.advanced, scene.advanced)
  );
}

function visualColorsEqual(
  left: ScenePresetV3["colors"],
  right: ScenePresetV3["colors"],
) {
  return (["base", "effect", "light"] as const).every(
    (key) => left[key].toLowerCase() === right[key].toLowerCase(),
  );
}

function visualNumberMapMatches(
  expected: Record<string, number>,
  actual: Record<string, number>,
) {
  return Object.entries(expected).every(
    ([key, value]) => Math.round(actual[key] ?? NaN) === Math.round(value),
  );
}

function commonControlsForScene(scene: ScenePresetV3) {
  const supported = new Set(scene.supportsCommon ?? []);
  return commonControlDefinitions.filter((control) =>
    supported.has(control.key),
  );
}

function PaletteSwatches({
  colors,
  label,
}: {
  colors: ScenePresetV3["colors"];
  label: string;
}) {
  return (
    <span aria-label={label} className="palette-swatch-strip">
      {(["base", "effect", "light"] as const).map((key) => (
        <i
          aria-hidden="true"
          key={key}
          style={{ backgroundColor: colors[key] }}
        />
      ))}
    </span>
  );
}

function SunFocusFields({
  cloudLight,
  onCloudLight,
}: {
  cloudLight: CloudLightSettings;
  onCloudLight: (patch: Partial<CloudLightSettings>) => void;
}) {
  return (
    <>
      <ColorInput
        label="Cor do sol"
        value={cloudLight.color}
        onChange={(color) => onCloudLight({ color })}
      />
      <RangeField
        label="Intensidade solar"
        value={cloudLight.intensity}
        onChange={(intensity) => onCloudLight({ intensity })}
      />
      <RangeField
        label="Posição horizontal"
        value={cloudLight.x}
        onChange={(x) => onCloudLight({ x })}
      />
      <RangeField
        label="Posição vertical"
        value={cloudLight.y}
        onChange={(y) => onCloudLight({ y })}
      />
      <RangeField
        label="Raio"
        value={cloudLight.radius}
        onChange={(radius) => onCloudLight({ radius })}
      />
      <RangeField
        label="Difusão"
        value={cloudLight.diffusion}
        onChange={(diffusion) => onCloudLight({ diffusion })}
      />
      <RangeField
        label="Movimento"
        value={cloudLight.motion}
        onChange={(motion) => onCloudLight({ motion })}
      />
      <div className="two-columns">
        <RangeField
          label="Velocidade"
          value={cloudLight.speed}
          onChange={(speed) => onCloudLight({ speed })}
        />
        <RangeField
          label="Direção"
          max={360}
          unit="°"
          value={cloudLight.direction}
          onChange={(direction) => onCloudLight({ direction })}
        />
      </div>
    </>
  );
}

export function VisualInspector(props: {
  layers: MediaLayerV2[];
  layerUndoLabel: string | null;
  presets: ScenePresetV3[];
  renderStack: RenderStackItem[];
  scene: ScenePresetV3;
  batchTargetCount?: number;
  selectedStackKey: string;
  onAddLayer: () => void;
  onAdvanced: (key: string, value: number) => void;
  onApplyBatch?: () => void;
  onApplyCoverLayer: (preset: CoverLayerPreset) => void;
  onApplyCoverLayerBatch?: (preset: CoverLayerPreset) => void;
  onApplyLayersBatch?: () => void;
  onApplyLayerSet: (layers: MediaLayerV2[]) => void;
  onCloudLight: (patch: Partial<CloudLightSettings>) => void;
  onColors: (key: "base" | "effect" | "light", value: string) => void;
  onCommon: (key: string, value: number) => void;
  onDeletePreset: () => void;
  onDuplicatePreset: () => void;
  onMoveRenderStack: (key: string, direction: "forward" | "backward") => void;
  onPalette: (palette: VisualPalette) => void;
  onPlayful: (patch: PlayfulPatch) => void;
  onRemoveLayer: (id: string) => void;
  onSavePreset: () => void;
  onSelectPreset: (id: string) => void;
  onSelectVariant: (baseId: string, variantId: string) => void;
  onSelectStackKey: (key: string) => void;
  onUndoLayer: () => void;
  onUpdateLayer: (id: string, patch: Partial<MediaLayerV2>) => void;
  onWaveform: (patch: Partial<WaveformV1>) => void;
}) {
  const { scene } = props;
  const paletteId = selectedPaletteId(scene);
  const [coverPreset, setCoverPreset] =
    useState<CoverLayerPreset>("background");
  const stackItems = buildRenderStackItems(
    scene,
    props.layers,
    props.renderStack,
    props.onWaveform,
    props.onCloudLight,
    props.onUpdateLayer,
  );
  // Se o item selecionado saiu da pilha (troca de faixa, camada removida),
  // recua para a atmosfera — ela sempre existe.
  const selectedItem =
    stackItems.find((item) => item.key === props.selectedStackKey) ??
    stackItems.find((item) => item.kind === "atmosphere") ??
    stackItems[0];
  const selectedLayer =
    selectedItem?.kind === "media"
      ? props.layers.find((layer) => layer.id === selectedItem.layerId)
      : undefined;
  const batchScopeCopy =
    props.batchTargetCount && props.batchTargetCount >= 2
      ? `${props.batchTargetCount} vídeos selecionados no lote`
      : "Lote selecionado";
  // volumetric-clouds desenha o sol dentro do próprio shader da atmosfera (não
  // há item "Foco solar" na pilha); os controles entram no pane da atmosfera.
  const sunInsideAtmosphere =
    scene.rendererId === "volumetric-clouds" && Boolean(scene.cloudLight);
  const supportedCommonControls = commonControlsForScene(scene);
  return (
    <>
      <section className="composition-section">
        <header className="composition-section-header">
          <span className="inspector-group-label">
            Pilha visual · {stackItems.length}
          </span>
        </header>
        <CompositionStackList
          items={stackItems}
          selectedKey={selectedItem?.key ?? "atmosphere"}
          onMoveItem={props.onMoveRenderStack}
          onRemoveLayer={props.onRemoveLayer}
          onSelect={props.onSelectStackKey}
        />
        <details className="stack-add-menu">
          <summary>
            <Plus /> Adicionar à composição
          </summary>
          <div className="stack-add-menu-body">
            <div className="inline-actions">
              <button
                disabled={props.layers.length >= 3}
                title="Adiciona uma imagem, SVG ou vídeo como camada sobreposta."
                type="button"
                onClick={props.onAddLayer}
              >
                <Upload /> Adicionar mídia
              </button>
            </div>
            <div className="cover-layer-apply">
              <SelectField
                label="Capa no vídeo"
                value={coverPreset}
                onChange={(preset) =>
                  setCoverPreset(preset as CoverLayerPreset)
                }
              >
                {(
                  Object.keys(coverLayerPresetLabels) as CoverLayerPreset[]
                ).map((preset) => (
                  <option key={preset} value={preset}>
                    {coverLayerPresetLabels[preset]}
                  </option>
                ))}
              </SelectField>
              <button
                className="upload-action"
                type="button"
                onClick={() => props.onApplyCoverLayer(coverPreset)}
              >
                <Image /> Aplicar capa
              </button>
            </div>
            <p className="helper-copy">
              A capa entra como camada e preserva escala, posição, sombra e
              máscara ao trocar de posição.
            </p>
            <LayerSets
              currentLayers={props.layers}
              onApply={props.onApplyLayerSet}
            />
          </div>
        </details>
        {props.layerUndoLabel && (
          <button
            className="quiet-action stack-undo-action"
            type="button"
            onClick={props.onUndoLayer}
          >
            <RotateCcw /> Desfazer {props.layerUndoLabel}
          </button>
        )}
      </section>
      {selectedItem && (
        <section className="stack-detail">
          <header className="stack-detail-header">
            <span aria-hidden="true" className="composition-stack-icon">
              {stackItemIcon(selectedItem)}
            </span>
            <span className="stack-detail-title">
              <strong>{selectedItem.label}</strong>
              <small>{stackItemDescription(selectedItem)}</small>
            </span>
            <span className="stack-detail-actions">
              {!selectedItem.toggleDisabled && (
                <IconButton
                  label={
                    selectedItem.visible
                      ? `Ocultar ${selectedItem.label}`
                      : `Mostrar ${selectedItem.label}`
                  }
                  onClick={() => selectedItem.onToggle()}
                >
                  {selectedItem.visible ? <Eye /> : <EyeOff />}
                </IconButton>
              )}
              {selectedItem.kind === "media" && selectedItem.layerId && (
                <IconButton
                  label={`Remover ${selectedItem.label}`}
                  onClick={() =>
                    props.onRemoveLayer(selectedItem.layerId as string)
                  }
                >
                  <Trash2 />
                </IconButton>
              )}
            </span>
          </header>
          {selectedItem.kind === "atmosphere" && (
            <div className="stack-detail-body">
              <details className="stack-detail-disclosure" open>
                <summary>Escolher atmosfera</summary>
                <VisualPresetBrowser
                  presets={props.presets}
                  selectedScene={scene}
                  onSelectPreset={props.onSelectPreset}
                  onSelectVariant={props.onSelectVariant}
                />
              </details>
              <p className="preset-note">{scene.note}</p>
              <div className="preset-actions">
                <button type="button" onClick={props.onDuplicatePreset}>
                  <Copy /> Duplicar
                </button>
                <button
                  type="button"
                  title={
                    scene.source === "custom"
                      ? "Salvar os ajustes neste preset"
                      : "Criar um preset novo a partir dos ajustes atuais"
                  }
                  onClick={props.onSavePreset}
                >
                  <Save /> Salvar
                </button>
                <button
                  disabled={scene.source !== "custom"}
                  type="button"
                  onClick={props.onDeletePreset}
                >
                  <Trash2 /> Excluir
                </button>
              </div>
              {props.onApplyBatch && (
                <div className="batch-scope-action">
                  <span className="batch-scope-note">
                    Escopo: {batchScopeCopy}
                  </span>
                  <button
                    className="upload-action"
                    type="button"
                    onClick={props.onApplyBatch}
                  >
                    <Layers3 /> Aplicar fundo visual ao lote
                  </button>
                </div>
              )}
              <div className="inspector-subsection visual-palette-section">
                <p className="inspector-kicker">PALETAS</p>
                <div
                  className="palette-option-list"
                  aria-label="Cores das paletas"
                >
                  {scene.palettes.map((palette) => (
                    <button
                      aria-pressed={palette.id === paletteId}
                      className={palette.id === paletteId ? "active" : ""}
                      key={palette.id}
                      type="button"
                      onClick={() => props.onPalette(palette)}
                    >
                      <span>{palette.name}</span>
                      <PaletteSwatches
                        colors={palette.colors}
                        label={`Cores da paleta ${palette.name}`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className="inspector-subsection visual-color-section">
                <p className="inspector-kicker">Cores da atmosfera</p>
                <div className="visual-color-grid">
                  {(["base", "effect", "light"] as const).map((key) => (
                    <ColorInput
                      key={key}
                      label={visualColorLabels[key]}
                      value={scene.colors[key]}
                      onChange={(value) => props.onColors(key, value)}
                    />
                  ))}
                </div>
              </div>
              <InspectorGroup title="Controles" open>
                {scene.controls.map((control) => (
                  <RangeField
                    key={control.key}
                    label={control.label}
                    min={control.min}
                    max={control.max}
                    unit={control.unit}
                    value={scene.advanced[control.key]}
                    onChange={(value) => props.onAdvanced(control.key, value)}
                  />
                ))}
                {supportedCommonControls.map((control) => (
                  <RangeField
                    key={control.key}
                    label={control.label}
                    max={control.max}
                    unit={control.unit}
                    value={scene.common[control.key]}
                    onChange={(value) => props.onCommon(control.key, value)}
                  />
                ))}
              </InspectorGroup>
              {sunInsideAtmosphere && scene.cloudLight && (
                <InspectorGroup title="Foco solar">
                  <CheckField
                    label="Mostrar foco solar"
                    checked={scene.cloudLight.enabled}
                    onChange={(enabled) => props.onCloudLight({ enabled })}
                  />
                  {scene.cloudLight.enabled && (
                    <SunFocusFields
                      cloudLight={scene.cloudLight}
                      onCloudLight={props.onCloudLight}
                    />
                  )}
                </InspectorGroup>
              )}
              {scene.rendererId === "playful-shapes" && scene.playful && (
                <InspectorGroup title="Conteúdo lúdico" open>
                  <SelectField
                    label="Movimento"
                    value={scene.playful.motionMode}
                    onChange={(motionMode) =>
                      props.onPlayful({
                        motionMode: motionMode as PlayfulContent["motionMode"],
                      })
                    }
                  >
                    <option value="calm">Calmo</option>
                    <option value="soft-rhythm">Ritmo suave</option>
                    <option value="play">Brincadeira</option>
                  </SelectField>
                  <RangeField
                    label="Seed"
                    max={999999}
                    value={scene.playful.seed}
                    onChange={(seed) => props.onPlayful({ seed })}
                  />
                  <div className="check-stack">
                    <CheckField
                      label="Retângulos"
                      checked={scene.playful.enabled.rectangles}
                      onChange={(rectangles) =>
                        props.onPlayful({ enabled: { rectangles } })
                      }
                    />
                    <CheckField
                      label="Letras"
                      checked={scene.playful.enabled.letters}
                      onChange={(letters) =>
                        props.onPlayful({ enabled: { letters } })
                      }
                    />
                    <CheckField
                      label="Números"
                      checked={scene.playful.enabled.numbers}
                      onChange={(numbers) =>
                        props.onPlayful({ enabled: { numbers } })
                      }
                    />
                    <CheckField
                      label="Emojis"
                      checked={scene.playful.enabled.emojis}
                      onChange={(emojis) =>
                        props.onPlayful({ enabled: { emojis } })
                      }
                    />
                  </div>
                  {scene.playful.enabled.letters && (
                    <TextField
                      label="Letras personalizadas"
                      value={scene.playful.collections.letters}
                      onChange={(letters) =>
                        props.onPlayful({ collections: { letters } })
                      }
                    />
                  )}
                  {scene.playful.enabled.numbers && (
                    <TextField
                      label="Números personalizados"
                      value={scene.playful.collections.numbers}
                      onChange={(numbers) =>
                        props.onPlayful({ collections: { numbers } })
                      }
                    />
                  )}
                  {scene.playful.enabled.emojis && (
                    <TextField
                      label="Emojis personalizados"
                      value={scene.playful.collections.emojis}
                      onChange={(emojis) =>
                        props.onPlayful({ collections: { emojis } })
                      }
                    />
                  )}
                  <button
                    className="quiet-action"
                    type="button"
                    onClick={() =>
                      props.onPlayful({
                        collections: {
                          letters: "A B C D E",
                          numbers: "1 2 3 4 5",
                          emojis: "☀️ 🎈 🌱 ⭐ 🎵",
                        },
                      })
                    }
                  >
                    <RotateCcw /> Restaurar coleções
                  </button>
                </InspectorGroup>
              )}
            </div>
          )}
          {selectedItem.kind === "sun-focus" && scene.cloudLight && (
            <div className="stack-detail-body">
              {scene.cloudLight.enabled ? (
                <SunFocusFields
                  cloudLight={scene.cloudLight}
                  onCloudLight={props.onCloudLight}
                />
              ) : (
                <p className="helper-copy">
                  Foco solar oculto. Use o olho na pilha de composição para
                  ativá-lo.
                </p>
              )}
            </div>
          )}
          {selectedItem.kind === "media" && selectedLayer && (
            <div className="stack-detail-body">
              <LayerControls
                layer={selectedLayer}
                onUpdateLayer={props.onUpdateLayer}
              />
            </div>
          )}
          {selectedItem.kind === "waveform" && (
            <div className="stack-detail-body">
              {!scene.waveform.visible && (
                <p className="helper-copy">
                  Waveform oculto. Use o olho na pilha de composição para
                  ativá-lo.
                </p>
              )}
              {scene.waveform.visible && (
                <>
                  <div className="inspector-subsection">
                    <p className="inspector-kicker">Tipo base</p>
                    <SelectField
                      label="Desenho da onda"
                      value={scene.waveform.type}
                      onChange={(type) =>
                        props.onWaveform({ type: type as WaveformType })
                      }
                    >
                      <option value="mirror-line">Linha espelhada</option>
                      <option value="single-line">Linha simples</option>
                      <option value="filled-ribbon">Faixa preenchida</option>
                      <option value="spectrum-bars">Barras espectrais</option>
                      <option value="radial-ring">Anel radial</option>
                    </SelectField>
                    <p className="helper-copy compact-copy">
                      Tipo atual: {waveformTypeLabel(scene.waveform.type)}.
                    </p>
                  </div>
                  <div className="inspector-subsection">
                    <p className="inspector-kicker">Modelos rápidos</p>
                    <div className="waveform-model-list">
                      {waveformStylePresets.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() =>
                            props.onWaveform({
                              ...preset.patch,
                              advanced: {
                                ...scene.waveform.advanced,
                                ...preset.patch.advanced,
                              },
                            })
                          }
                        >
                          <strong>{preset.name}</strong>
                          <small>{preset.description}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="inspector-subsection">
                    <p className="inspector-kicker">Aparência</p>
                    <SelectField
                      label="Modo de cor"
                      value={scene.waveform.colorMode}
                      onChange={(colorMode) =>
                        props.onWaveform({
                          colorMode: colorMode as WaveformV1["colorMode"],
                        })
                      }
                    >
                      <option value="single">Cor única</option>
                      <option value="gradient">Gradiente</option>
                      <option value="bands">Cores por banda</option>
                    </SelectField>
                    <div className="waveform-gradient-presets">
                      {waveformGradientPresets.map((preset) => (
                        <button
                          aria-label={`Gradiente ${preset.name}`}
                          className="waveform-gradient-swatch"
                          key={preset.name}
                          style={{
                            background: `linear-gradient(90deg, ${preset.colors[0]}, ${preset.colors[1]}, ${preset.colors[2]})`,
                          }}
                          title={preset.name}
                          type="button"
                          onClick={() =>
                            props.onWaveform({
                              colorMode: "gradient",
                              color: preset.colors[0],
                              secondaryColor: preset.colors[1],
                              tertiaryColor: preset.colors[2],
                            })
                          }
                        />
                      ))}
                    </div>
                    <div className="waveform-color-grid">
                      <ColorInput
                        label="Principal"
                        value={scene.waveform.color}
                        onChange={(color) => props.onWaveform({ color })}
                      />
                      <ColorInput
                        label="Cor 2"
                        value={scene.waveform.secondaryColor}
                        onChange={(secondaryColor) =>
                          props.onWaveform({ secondaryColor })
                        }
                      />
                      <ColorInput
                        label="Cor 3"
                        value={scene.waveform.tertiaryColor}
                        onChange={(tertiaryColor) =>
                          props.onWaveform({ tertiaryColor })
                        }
                      />
                    </div>
                    <RangeField
                      label="Opacidade"
                      value={scene.waveform.opacity}
                      onChange={(opacity) => props.onWaveform({ opacity })}
                    />
                    <div className="two-columns">
                      <RangeField
                        label="Altura"
                        value={scene.waveform.height}
                        onChange={(height) => props.onWaveform({ height })}
                      />
                      <RangeField
                        label="Posição"
                        value={scene.waveform.position}
                        onChange={(position) => props.onWaveform({ position })}
                      />
                    </div>
                    <div className="two-columns">
                      <RangeField
                        label="Largura"
                        value={scene.waveform.width}
                        onChange={(width) => props.onWaveform({ width })}
                      />
                      <RangeField
                        label="Espessura"
                        min={1}
                        max={6}
                        unit="px"
                        value={scene.waveform.thickness}
                        onChange={(thickness) =>
                          props.onWaveform({ thickness })
                        }
                      />
                    </div>
                    <div className="two-columns">
                      <RangeField
                        label="Suavização"
                        value={scene.waveform.smoothing}
                        onChange={(smoothing) =>
                          props.onWaveform({ smoothing })
                        }
                      />
                      <RangeField
                        label="Reação musical"
                        value={scene.waveform.audioReaction}
                        onChange={(audioReaction) =>
                          props.onWaveform({ audioReaction })
                        }
                      />
                    </div>
                  </div>
                  <div className="inspector-subsection">
                    <p className="inspector-kicker">Ajustes do tipo</p>
                    {scene.waveform.type === "filled-ribbon" && (
                      <RangeField
                        label="Preenchimento"
                        value={scene.waveform.advanced.fillOpacity}
                        onChange={(fillOpacity) =>
                          props.onWaveform({
                            advanced: {
                              ...scene.waveform.advanced,
                              fillOpacity,
                            },
                          })
                        }
                      />
                    )}
                    {scene.waveform.type === "spectrum-bars" && (
                      <>
                        <RangeField
                          label="Espacamento"
                          value={scene.waveform.advanced.barGap}
                          onChange={(barGap) =>
                            props.onWaveform({
                              advanced: { ...scene.waveform.advanced, barGap },
                            })
                          }
                        />
                        <RangeField
                          label="Arredondamento"
                          value={scene.waveform.advanced.barRadius}
                          onChange={(barRadius) =>
                            props.onWaveform({
                              advanced: {
                                ...scene.waveform.advanced,
                                barRadius,
                              },
                            })
                          }
                        />
                        <RangeField
                          label="Pico decrescente"
                          value={scene.waveform.advanced.barPeakHold}
                          onChange={(barPeakHold) =>
                            props.onWaveform({
                              advanced: {
                                ...scene.waveform.advanced,
                                barPeakHold,
                              },
                            })
                          }
                        />
                        <RangeField
                          label="Velocidade do pico"
                          value={scene.waveform.advanced.barPeakDecay}
                          onChange={(barPeakDecay) =>
                            props.onWaveform({
                              advanced: {
                                ...scene.waveform.advanced,
                                barPeakDecay,
                              },
                            })
                          }
                        />
                      </>
                    )}
                    {scene.waveform.type === "radial-ring" && (
                      <>
                        <RangeField
                          label="Raio"
                          value={scene.waveform.advanced.radialRadius}
                          onChange={(radialRadius) =>
                            props.onWaveform({
                              advanced: {
                                ...scene.waveform.advanced,
                                radialRadius,
                              },
                            })
                          }
                        />
                        <RangeField
                          label="Arco"
                          value={scene.waveform.advanced.radialArc}
                          onChange={(radialArc) =>
                            props.onWaveform({
                              advanced: {
                                ...scene.waveform.advanced,
                                radialArc,
                              },
                            })
                          }
                        />
                        <RangeField
                          label="Rotação"
                          min={-180}
                          max={180}
                          unit="deg"
                          value={scene.waveform.advanced.radialRotation}
                          onChange={(radialRotation) =>
                            props.onWaveform({
                              advanced: {
                                ...scene.waveform.advanced,
                                radialRotation,
                              },
                            })
                          }
                        />
                        <RangeField
                          label="Brilho"
                          value={scene.waveform.advanced.radialGlow}
                          onChange={(radialGlow) =>
                            props.onWaveform({
                              advanced: {
                                ...scene.waveform.advanced,
                                radialGlow,
                              },
                            })
                          }
                        />
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {selectedItem.kind === "vinyl" && (
            <div className="stack-detail-body">
              <p className="helper-copy">
                O prato e o braço seguem a capa da faixa e reagem ao áudio. Os
                ajustes do vinil ficam nos controles do preset, no item
                Atmosfera.
              </p>
            </div>
          )}
        </section>
      )}
      {(props.onApplyLayersBatch || props.onApplyCoverLayerBatch) && (
        <InspectorGroup title="Lote" open scope="series">
          <p className="batch-scope-note">Escopo: {batchScopeCopy}</p>
          {props.onApplyLayersBatch && (
            <>
              <button
                className="quiet-action"
                disabled={props.layers.length === 0}
                type="button"
                onClick={props.onApplyLayersBatch}
              >
                <Layers3 /> Aplicar mídias ao lote
              </button>
              <p className="helper-copy">
                Copia estas mídias para os outros vídeos selecionados no lote.
                Cada vídeo recebe uma cópia independente.
              </p>
            </>
          )}
          {props.onApplyCoverLayerBatch && (
            <>
              <button
                className="quiet-action"
                type="button"
                onClick={() => props.onApplyCoverLayerBatch?.(coverPreset)}
              >
                <Layers3 /> Aplicar capa ao lote
              </button>
              <p className="helper-copy">
                O lote preserva escala, posição, sombra e máscara, trocando
                apenas o arquivo de capa de cada faixa quando disponível.
              </p>
            </>
          )}
        </InspectorGroup>
      )}
    </>
  );
}
