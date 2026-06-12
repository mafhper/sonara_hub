import {
  AudioWaveform,
  ChevronDown,
  ChevronUp,
  Disc3,
  Eye,
  EyeOff,
  Film,
  Image,
  Palette,
  Sun,
  Trash2,
} from "lucide-react";
import type {
  CloudLightSettings,
  RenderStackItem,
  ScenePresetV3,
  WaveformV1,
} from "../../shared/visual-effects.mjs";
import type { MediaLayerV2 } from "../types";

export type CompositionStackItem = {
  key: string;
  label: string;
  /** Categoria curta exibida como chip na linha (Atmosfera, Luz, Mídia…). */
  tag: string;
  kind: RenderStackItem["kind"];
  visible: boolean;
  toggleDisabled?: boolean;
  onToggle: () => void;
  layerId?: string;
  mediaKind?: MediaLayerV2["kind"];
};

/** Subtítulo do pane de detalhe: diz o que o objeto selecionado é. */
export function stackItemDescription(item: CompositionStackItem) {
  if (item.kind === "atmosphere") return "Atmosfera da cena";
  if (item.kind === "sun-focus") return "Iluminação da cena";
  if (item.kind === "vinyl") return "Efeito de vinil";
  if (item.kind === "waveform") return "Visualizador de áudio";
  if (item.mediaKind === "video") return "Vídeo sobreposto";
  if (item.mediaKind === "svg") return "SVG sobreposto";
  return "Imagem sobreposta";
}

export function renderStackKey(item: RenderStackItem) {
  return item.kind === "media" ? `media-${item.layerId}` : item.kind;
}

export function buildRenderStackItems(
  scene: ScenePresetV3,
  layers: MediaLayerV2[],
  renderStack: RenderStackItem[],
  onWaveform: (patch: Partial<WaveformV1>) => void,
  onCloudLight: (patch: Partial<CloudLightSettings>) => void,
  onUpdateLayer: (id: string, patch: Partial<MediaLayerV2>) => void,
): CompositionStackItem[] {
  const stack: CompositionStackItem[] = [];

  for (const item of renderStack) {
    if (item.kind === "atmosphere") {
      stack.push({
        key: renderStackKey(item),
        label: "Fundo visual",
        tag: scene.name ?? "Atmosfera",
        kind: item.kind,
        visible: true,
        toggleDisabled: true,
        onToggle: () => {},
      });
    } else if (item.kind === "sun-focus") {
      stack.push({
        key: renderStackKey(item),
        label: "Foco de luz",
        tag: "Luz",
        kind: item.kind,
        visible: Boolean(scene.cloudLight?.enabled),
        onToggle: () =>
          onCloudLight({ enabled: !Boolean(scene.cloudLight?.enabled) }),
      });
    } else if (item.kind === "media") {
      const layer = layers.find((candidate) => candidate.id === item.layerId);
      if (!layer) continue;
      stack.push({
        key: renderStackKey(item),
        label: layer.name || "Camada",
        tag: "Mídia",
        kind: item.kind,
        visible: layer.visible !== false,
        onToggle: () => onUpdateLayer(layer.id, { visible: !layer.visible }),
        layerId: layer.id,
        mediaKind: layer.kind,
      });
    } else if (item.kind === "vinyl") {
      stack.push({
        key: renderStackKey(item),
        label: "Vinil",
        tag: "Efeito",
        kind: item.kind,
        visible: scene.rendererId === "vinyl",
        toggleDisabled: true,
        onToggle: () => {},
      });
    } else if (item.kind === "waveform") {
      stack.push({
        key: renderStackKey(item),
        label: "Waveform",
        tag: "Áudio",
        kind: item.kind,
        visible: Boolean(scene.waveform?.visible),
        onToggle: () =>
          onWaveform({ visible: !Boolean(scene.waveform?.visible) }),
      });
    }
  }

  return stack;
}

export function stackItemIcon(item: {
  kind: RenderStackItem["kind"];
  mediaKind?: MediaLayerV2["kind"];
}) {
  if (item.kind === "atmosphere") return <Palette />;
  if (item.kind === "sun-focus") return <Sun />;
  if (item.kind === "vinyl") return <Disc3 />;
  if (item.kind === "waveform") return <AudioWaveform />;
  return item.mediaKind === "video" ? <Film /> : <Image />;
}

export function CompositionStackList({
  items,
  selectedKey,
  onMoveItem,
  onRemoveLayer,
  onSelect,
}: {
  /** Itens em ordem de pintura (fundo → frente); a lista exibe invertido. */
  items: CompositionStackItem[];
  selectedKey: string;
  onMoveItem: (key: string, direction: "forward" | "backward") => void;
  onRemoveLayer?: (id: string) => void;
  onSelect: (key: string) => void;
}) {
  return (
    <div
      aria-label="Camadas da composição"
      className="composition-stack-list"
      role="listbox"
    >
      {/* Topo da lista = pintado por último = frente do vídeo. */}
      {[...items].reverse().map((item, displayIndex) => (
        <div
          key={item.key}
          className={`composition-stack-row ${
            item.visible ? "" : "is-hidden-layer"
          } ${item.key === selectedKey ? "is-selected" : ""}`}
        >
          <button
            aria-selected={item.key === selectedKey}
            className="composition-stack-select"
            role="option"
            type="button"
            onClick={() => onSelect(item.key)}
          >
            <span aria-hidden="true" className="composition-stack-icon">
              {stackItemIcon(item)}
            </span>
            <span className="composition-stack-label">{item.label}</span>
            <span className="composition-stack-tag">{item.tag}</span>
          </button>
          <span className="composition-stack-actions">
            <button
              aria-label={`Trazer ${item.label} para frente`}
              className="icon-button-sm"
              disabled={displayIndex === 0}
              title="Trazer para frente"
              type="button"
              onClick={() => onMoveItem(item.key, "forward")}
            >
              <ChevronUp />
            </button>
            <button
              aria-label={`Enviar ${item.label} para trás`}
              className="icon-button-sm"
              disabled={displayIndex === items.length - 1}
              title="Enviar para trás"
              type="button"
              onClick={() => onMoveItem(item.key, "backward")}
            >
              <ChevronDown />
            </button>
            <button
              aria-label={
                item.visible ? `Ocultar ${item.label}` : `Mostrar ${item.label}`
              }
              aria-pressed={item.visible}
              className="icon-button-sm"
              disabled={item.toggleDisabled}
              title={item.visible ? "Visível" : "Oculta"}
              type="button"
              onClick={() => item.onToggle()}
            >
              {item.visible ? <Eye /> : <EyeOff />}
            </button>
            {item.kind === "media" && item.layerId && onRemoveLayer && (
              <button
                aria-label={`Remover ${item.label}`}
                className="icon-button-sm"
                title="Remover camada"
                type="button"
                onClick={() => onRemoveLayer(item.layerId as string)}
              >
                <Trash2 />
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
