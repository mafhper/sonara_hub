import type { TrackDraft } from "../types";
export { trackAudioSrc } from "../features/audio/audioSources";

export function thumbnailFingerprint(
  track: TrackDraft,
  coverSrc: string | undefined,
  showMetadata: boolean,
) {
  return JSON.stringify({
    coverSrc,
    layers: track.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      opacity: layer.opacity,
      order: layer.order,
      rotation: layer.rotation,
      scale: layer.scale,
      blur: layer.blur,
      maskOpacity: layer.maskOpacity,
      coverFadeOut: layer.coverFadeOut,
      visible: layer.visible,
      x: layer.x,
      y: layer.y,
    })),
    durationSeconds: track.audioInfo?.durationSeconds ?? null,
    metadata: track.metadata,
    scene: track.scene,
    showMetadata,
    textSettings: track.textSettings,
  });
}
