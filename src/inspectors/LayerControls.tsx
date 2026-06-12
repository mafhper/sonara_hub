import type { MediaLayerV2 } from "../types";
import { CheckField, RangeField, SelectField } from "./fields";
import {
  type CoverFadeOutSettings,
  type LayerFadeInSettings,
  type LayerZoomSettings,
  isCoverLayer,
  normalizeFadeIn,
  normalizeLayerCoverFadeOut,
  normalizeLayerZoom,
} from "./layer-normalizers";

export function LayerControls(props: {
  layer: MediaLayerV2;
  onUpdateLayer: (id: string, patch: Partial<MediaLayerV2>) => void;
}) {
  const layer = props.layer;
  return (
    <>
      <RangeField
        label="Opacidade"
        value={layer.opacity}
        onChange={(opacity) => props.onUpdateLayer(layer.id, { opacity })}
      />
      <div className="layer-animation inspector-subsection">
        <p className="inspector-kicker">Animação</p>
        <FadeInFields
          settings={normalizeFadeIn(layer.fadeIn)}
          onChange={(fadeIn) =>
            props.onUpdateLayer(layer.id, {
              fadeIn: normalizeFadeIn({ ...layer.fadeIn, ...fadeIn }),
            })
          }
        />
        <CoverFadeOutFields
          settings={normalizeLayerCoverFadeOut(layer.coverFadeOut)}
          label={isCoverLayer(layer) ? "capa" : "imagem"}
          onChange={(coverFadeOut) =>
            props.onUpdateLayer(layer.id, {
              coverFadeOut: normalizeLayerCoverFadeOut({
                ...layer.coverFadeOut,
                ...coverFadeOut,
              }),
            })
          }
        />
        <ZoomFields
          settings={normalizeLayerZoom(layer.zoom)}
          onChange={(zoom) =>
            props.onUpdateLayer(layer.id, {
              zoom: normalizeLayerZoom({ ...layer.zoom, ...zoom }),
            })
          }
        />
      </div>
      <RangeField
        label="Escala"
        max={220}
        value={layer.scale}
        onChange={(scale) => props.onUpdateLayer(layer.id, { scale })}
      />
      <RangeField
        label="Horizontal"
        value={layer.x}
        onChange={(x) => props.onUpdateLayer(layer.id, { x })}
      />
      <RangeField
        label="Vertical"
        value={layer.y}
        onChange={(y) => props.onUpdateLayer(layer.id, { y })}
      />
      <RangeField
        label="Rotação"
        min={-180}
        max={180}
        unit="°"
        value={layer.rotation}
        onChange={(rotation) => props.onUpdateLayer(layer.id, { rotation })}
      />
      <RangeField
        label="Desfoque da camada"
        max={48}
        value={layer.blur}
        onChange={(blur) => props.onUpdateLayer(layer.id, { blur })}
      />
      <RangeField
        label="Máscara escura"
        max={90}
        value={layer.maskOpacity}
        onChange={(maskOpacity) =>
          props.onUpdateLayer(layer.id, { maskOpacity })
        }
      />
      <RangeField
        label="Sombra"
        value={layer.shadow.opacity}
        onChange={(opacity) =>
          props.onUpdateLayer(layer.id, {
            shadow: { ...layer.shadow, opacity },
          })
        }
      />
      <RangeField
        label="Desfoque da sombra"
        max={80}
        value={layer.shadow.blur}
        onChange={(blur) =>
          props.onUpdateLayer(layer.id, {
            shadow: { ...layer.shadow, blur },
          })
        }
      />
      <RangeField
        label="Sombra horizontal"
        min={-80}
        max={80}
        value={layer.shadow.x}
        onChange={(x) =>
          props.onUpdateLayer(layer.id, {
            shadow: { ...layer.shadow, x },
          })
        }
      />
      <RangeField
        label="Sombra vertical"
        min={-80}
        max={80}
        value={layer.shadow.y}
        onChange={(y) =>
          props.onUpdateLayer(layer.id, {
            shadow: { ...layer.shadow, y },
          })
        }
      />
      {layer.kind === "video" && (
        <CheckField
          label="Repetir vídeo"
          checked={layer.loop}
          onChange={(loop) => props.onUpdateLayer(layer.id, { loop })}
        />
      )}
      <div className="two-columns">
        <SelectField
          label="Encaixe"
          value={layer.fit}
          onChange={(fit) =>
            props.onUpdateLayer(layer.id, {
              fit: fit as MediaLayerV2["fit"],
            })
          }
        >
          <option value="contain">Conter</option>
          <option value="cover">Cobrir</option>
        </SelectField>
        <SelectField
          label="Mistura"
          value={layer.blendMode}
          onChange={(blendMode) =>
            props.onUpdateLayer(layer.id, {
              blendMode: blendMode as MediaLayerV2["blendMode"],
            })
          }
        >
          <option value="normal">Normal</option>
          <option value="screen">Tela</option>
          <option value="multiply">Multiplicar</option>
          <option value="overlay">Sobrepor</option>
        </SelectField>
      </div>
    </>
  );
}

export function CoverFadeOutFields({
  settings,
  onChange,
  label = "imagem",
}: {
  settings: CoverFadeOutSettings;
  onChange: (patch: Partial<CoverFadeOutSettings>) => void;
  label?: string;
}) {
  return (
    <div className="cover-fade-controls">
      <CheckField
        label={`Fade-out da ${label}`}
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
          <p className="helper-copy">
            {(settings.mode ?? "tail") === "timed"
              ? `A ${label} começa a sumir no ponto escolhido e zera após a duração definida.`
              : `A ${label} fica visível e faz fade-out apenas no trecho final do vídeo.`}
          </p>
        </>
      )}
    </div>
  );
}

export function FadeInFields({
  settings,
  onChange,
  label = "imagem",
}: {
  settings: LayerFadeInSettings;
  onChange: (patch: Partial<LayerFadeInSettings>) => void;
  label?: string;
}) {
  return (
    <div className="fade-in-controls">
      <CheckField
        label={`Fade-in de ${label}`}
        checked={settings.enabled}
        onChange={(enabled) => onChange({ enabled })}
      />
      {settings.enabled && (
        <>
          <RangeField
            label="Começa em"
            max={95}
            min={0}
            step={5}
            unit="% do vídeo"
            value={settings.startPercent ?? 0}
            onChange={(startPercent) => onChange({ startPercent })}
          />
          <RangeField
            label="Duração"
            max={20}
            min={0.25}
            step={0.25}
            unit="s"
            value={settings.durationSeconds ?? 1.5}
            onChange={(durationSeconds) => onChange({ durationSeconds })}
          />
          <p className="helper-copy">
            Surge gradualmente a partir do ponto escolhido.
          </p>
        </>
      )}
    </div>
  );
}

export function ZoomFields({
  settings,
  onChange,
}: {
  settings: LayerZoomSettings;
  onChange: (patch: Partial<LayerZoomSettings>) => void;
}) {
  return (
    <div className="zoom-controls">
      <CheckField
        label="Zoom da imagem"
        checked={settings.enabled}
        onChange={(enabled) => onChange({ enabled })}
      />
      {settings.enabled && (
        <>
          <RangeField
            label="Escala inicial"
            max={300}
            min={20}
            step={5}
            unit="%"
            value={settings.from}
            onChange={(from) => onChange({ from })}
          />
          <RangeField
            label="Escala final"
            max={300}
            min={20}
            step={5}
            unit="%"
            value={settings.to}
            onChange={(to) => onChange({ to })}
          />
          <p className="helper-copy">
            {settings.to >= settings.from
              ? "Zoom-in: amplia lentamente do início ao fim do vídeo."
              : "Zoom-out: reduz lentamente do início ao fim do vídeo."}
          </p>
        </>
      )}
    </div>
  );
}
