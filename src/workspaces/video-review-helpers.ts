import type { TrackDraft } from "../types";

// Same audio source resolution the player uses, so previews can play a track
// whether it came from the internal input/ folder or an uploaded file.
export function trackAudioSrc(track: TrackDraft) {
  return (
    track.sourceUrl ??
    (track.source === "input"
      ? `/api/audio/${encodeURIComponent(track.sourceKey)}`
      : "")
  );
}

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
