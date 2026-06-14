import {
  type CoverFadeOutSettings,
  isCoverLayer,
  normalizeLayerCoverFadeOut,
} from "../../inspectors/layer-normalizers";
import {
  type CoverLayerPreset,
  coverLayerPresetLabels,
} from "../../inspectors/VisualInspector";
import type { MediaLayerV2 } from "../../types";

const coverLayerPresets: Record<
  CoverLayerPreset,
  Pick<
    MediaLayerV2,
    | "opacity"
    | "scale"
    | "x"
    | "y"
    | "rotation"
    | "blur"
    | "maskOpacity"
    | "fit"
    | "blendMode"
    | "shadow"
  >
> = {
  background: {
    opacity: 72,
    scale: 156,
    x: 50,
    y: 50,
    rotation: 0,
    blur: 22,
    maskOpacity: 46,
    fit: "cover",
    blendMode: "normal",
    shadow: { opacity: 0, blur: 24, x: 0, y: 14 },
  },
  left: {
    opacity: 100,
    scale: 46,
    x: 22,
    y: 50,
    rotation: 0,
    blur: 0,
    maskOpacity: 0,
    fit: "contain",
    blendMode: "normal",
    shadow: { opacity: 48, blur: 34, x: 0, y: 18 },
  },
  center: {
    opacity: 100,
    scale: 52,
    x: 50,
    y: 50,
    rotation: 0,
    blur: 0,
    maskOpacity: 0,
    fit: "contain",
    blendMode: "normal",
    shadow: { opacity: 42, blur: 32, x: 0, y: 18 },
  },
  right: {
    opacity: 100,
    scale: 46,
    x: 78,
    y: 50,
    rotation: 0,
    blur: 0,
    maskOpacity: 0,
    fit: "contain",
    blendMode: "normal",
    shadow: { opacity: 48, blur: 34, x: 0, y: 18 },
  },
  corner: {
    opacity: 96,
    scale: 30,
    x: 18,
    y: 74,
    rotation: 0,
    blur: 0,
    maskOpacity: 0,
    fit: "contain",
    blendMode: "normal",
    shadow: { opacity: 38, blur: 26, x: 0, y: 14 },
  },
};

export function coverLayerFromArtwork(
  artwork: { file: File; src: string },
  preset: CoverLayerPreset,
  template?: MediaLayerV2,
  coverFadeOut?: CoverFadeOutSettings,
): MediaLayerV2 {
  const defaults = coverLayerPresets[preset];
  return {
    id:
      template?.id && isCoverLayer(template)
        ? template.id
        : `cover-layer-${crypto.randomUUID()}`,
    name: `Capa - ${coverLayerPresetLabels[preset]}`,
    file: artwork.file,
    src: artwork.src,
    kind: "image",
    visible: template?.visible ?? true,
    opacity: template?.opacity ?? defaults.opacity,
    scale: template?.scale ?? defaults.scale,
    x: template?.x ?? defaults.x,
    y: template?.y ?? defaults.y,
    rotation: template?.rotation ?? defaults.rotation,
    blur: template?.blur ?? defaults.blur,
    maskOpacity: template?.maskOpacity ?? defaults.maskOpacity,
    coverFadeOut: normalizeLayerCoverFadeOut(
      coverFadeOut ?? template?.coverFadeOut,
    ),
    fit: template?.fit ?? defaults.fit,
    blendMode: template?.blendMode ?? defaults.blendMode,
    loop: false,
    order: template?.order ?? 0,
    shadow: {
      ...defaults.shadow,
      ...(template?.shadow ?? {}),
    },
  };
}
