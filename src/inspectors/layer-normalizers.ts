import type { MediaLayerV2 } from "../types";
import { clampNumber } from "./fields";

export type CoverFadeOutSettings = NonNullable<MediaLayerV2["coverFadeOut"]>;
export type LayerFadeInSettings = NonNullable<MediaLayerV2["fadeIn"]>;
export type LayerZoomSettings = NonNullable<MediaLayerV2["zoom"]>;

export const defaultCoverFadeOut: CoverFadeOutSettings = {
  enabled: false,
  mode: "tail",
  endPercent: 35,
  startPercent: 10,
  durationSeconds: 2,
};
export const defaultLayerZoom: LayerZoomSettings = {
  enabled: false,
  from: 100,
  to: 115,
};

export function normalizeLayerCoverFadeOut(
  value?: Partial<CoverFadeOutSettings> | null,
): CoverFadeOutSettings {
  const mode = value?.mode === "timed" ? "timed" : "tail";
  return {
    enabled: value?.enabled === true,
    mode,
    endPercent: clampNumber(
      Number(value?.endPercent ?? defaultCoverFadeOut.endPercent),
      5,
      95,
      defaultCoverFadeOut.endPercent,
    ),
    startPercent: clampNumber(
      Number(value?.startPercent ?? defaultCoverFadeOut.startPercent),
      0,
      95,
      defaultCoverFadeOut.startPercent,
    ),
    durationSeconds: clampNumber(
      Number(value?.durationSeconds ?? defaultCoverFadeOut.durationSeconds),
      0.25,
      60,
      defaultCoverFadeOut.durationSeconds,
    ),
  };
}

export function normalizeFadeIn(
  value?: Partial<LayerFadeInSettings> | null,
): LayerFadeInSettings {
  return {
    enabled: value?.enabled === true,
    startPercent: clampNumber(Number(value?.startPercent ?? 0), 0, 95, 0),
    durationSeconds: clampNumber(
      Number(value?.durationSeconds ?? 1.5),
      0.25,
      60,
      1.5,
    ),
  };
}

export function normalizeLayerZoom(
  value?: Partial<LayerZoomSettings> | null,
): LayerZoomSettings {
  return {
    enabled: value?.enabled === true,
    from: clampNumber(
      Number(value?.from ?? defaultLayerZoom.from),
      20,
      400,
      100,
    ),
    to: clampNumber(Number(value?.to ?? defaultLayerZoom.to), 20, 400, 115),
  };
}

export function isCoverLayer(layer: MediaLayerV2) {
  return layer.id.startsWith("cover-layer-") || layer.name.startsWith("Capa -");
}
