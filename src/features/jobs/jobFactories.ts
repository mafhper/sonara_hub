import type { PublicationAssetPreset } from "../../../shared/publication-assets.mjs";
import type { PodcastFeedSidecar } from "../../../shared/podcast-feed.mjs";
import type { RenderJob, TrackDraft } from "../../types";

export function queuedVideoRenderJob(
  jobId: string,
  track: TrackDraft,
): RenderJob {
  return {
    id: jobId,
    kind: "video-render",
    status: "queued",
    progress: 0,
    message: `Na fila: ${track.metadata.title}`,
    outputUrl: null,
    sidecarUrl: null,
    thumbnailUrl: null,
  };
}

export function queuedPublicationAssetJob(
  jobId: string,
  preset: PublicationAssetPreset,
  track: TrackDraft,
): RenderJob {
  return {
    id: jobId,
    kind: "publication-asset",
    status: "queued",
    progress: 0,
    message: `Divulgação: ${preset.label} · ${track.metadata.title}`,
    outputUrl: null,
    sidecarUrl: null,
    thumbnailUrl: null,
    markdownUrl: null,
    assetUrls: [],
    metadata: track.metadata,
  };
}

export function queuedPodcastFeedJob(
  jobId: string,
  sidecar: PodcastFeedSidecar,
): RenderJob {
  const title = sidecar.feed.title || "Podcast";
  return {
    id: jobId,
    kind: "podcast-feed",
    status: "queued",
    progress: 0,
    message: `Podcast: ${title}`,
    outputUrl: null,
    sidecarUrl: null,
    thumbnailUrl: null,
    assetUrls: [],
    metadata: {
      title,
      album: title,
      artist: sidecar.feed.author,
    },
  };
}
