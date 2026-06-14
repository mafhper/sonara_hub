import type { MediaLayerV2 } from "../../types";

export function stripLayerFile(layer: MediaLayerV2) {
  const { file: _file, src: _src, name: _name, ...settings } = layer;
  return settings;
}
