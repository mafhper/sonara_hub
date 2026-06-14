import type { TrackDraft } from "../../types";

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

export function appendTrackAudioSource(formData: FormData, track: TrackDraft) {
  if (track.source === "input") {
    formData.append("inputAudio", track.sourceKey);
    return true;
  }
  if (!track.sourceFile) return false;
  formData.append("audio", track.sourceFile);
  formData.append(
    "relativePath",
    track.sourceFile.webkitRelativePath || track.sourceKey,
  );
  return true;
}

export function slicePodcastMetadataFile(file: File, maxBytes: number) {
  if (file.size <= maxBytes) return file;
  const chunk = file.slice(0, maxBytes, file.type);
  return new File([chunk], file.name, {
    lastModified: file.lastModified,
    type: file.type,
  });
}

export function estimateDurationFromBitrate(
  sizeBytes: number,
  bitrate?: number | null,
) {
  const safeSizeBytes = Number(sizeBytes);
  const safeBitrate = Number(bitrate);
  if (
    !Number.isFinite(safeSizeBytes) ||
    safeSizeBytes <= 0 ||
    !Number.isFinite(safeBitrate) ||
    safeBitrate <= 0
  ) {
    return null;
  }
  return (safeSizeBytes * 8) / safeBitrate;
}
