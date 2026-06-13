import type {
  PodcastFeedGroup,
  PodcastTrackLike,
} from "./podcast-metadata.mjs";

export type PodcastEpisodeAsset = {
  audioFileName?: string | null;
  enclosureUrl?: string | null;
  guid?: string | null;
  lengthBytes?: number | null;
  mimeType?: string | null;
  link?: string | null;
  artworkUrl?: string | null;
  links?: string[] | string | null;
  donationUrl?: string | null;
};

export type PodcastFeedExportOptions = {
  generatedAt?: string | null;
  fileBaseName?: string | null;
  rssFileName?: string | null;
  feedTitle?: string | null;
  feedAuthor?: string | null;
  feedDescription?: string | null;
  feedLink?: string | null;
  language?: string | null;
  explicit?: boolean | "yes" | "no" | "clean" | null;
  category?: string | null;
  copyright?: string | null;
  artworkUrl?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  audioBaseUrl?: string | null;
  guidBaseUrl?: string | null;
  episodeAssets?: Record<string, PodcastEpisodeAsset>;
};

export type PodcastPublicationFinding = {
  severity: "error" | "warning";
  scope: "feed" | "episode";
  id: string;
  field: string;
  message: string;
};

export type PodcastVoiceProfile = {
  id: string;
  label: string;
};

export type PodcastEpisodeProcessing = {
  voiceProfile: string;
  voiceProfileLabel: string;
  trimSilence: boolean;
  voiceBoost: boolean;
  playbackSpeed: number;
  nonDestructive: true;
};

export type PodcastEpisodeInsert = {
  type: string;
  label: string;
  source: string;
};

export type PodcastFeedSidecarEpisode = {
  id: string;
  guid: string;
  title: string;
  author: string;
  publishedAt: string;
  description: string;
  transcript: string;
  link: string;
  artworkUrl: string;
  links: string[];
  donationUrl: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  durationSeconds: number | null;
  sourceFileName: string | undefined;
  audioFileName: string;
  enclosureUrl: string;
  enclosureLengthBytes: number | null;
  enclosureType: string;
  processing: PodcastEpisodeProcessing;
  inserts: PodcastEpisodeInsert[];
  metadataPartial: boolean;
  hasEmbeddedMetadata: boolean;
  hasDescription: boolean;
  hasTranscript: boolean;
};

export type PodcastFeedSidecar = {
  kind: "sonara-podcast-feed";
  version: number;
  generatedAt: string;
  feed: {
    id: string;
    title: string;
    author: string;
    category: string;
    description: string;
    link: string;
    language: string;
    explicit: string;
    copyright: string;
    artworkUrl: string;
    owner: {
      name: string;
      email: string;
    };
    episodeCount: number;
    metadataCount: number;
    descriptionCount: number;
    transcriptCount: number;
    partialCount: number;
    totalDurationSeconds: number | null;
    latestPublishedAt: string;
  };
  rss: {
    fileName: string;
    format: "RSS 2.0";
    namespaces: string[];
    note: string;
  };
  episodes: PodcastFeedSidecarEpisode[];
  checks: {
    ready: boolean;
    findings: PodcastPublicationFinding[];
  };
};

export const PODCAST_FEED_SIDECAR_VERSION: number;
export const PODCAST_RSS_FILE_EXTENSION: string;
export const PODCAST_VOICE_PROFILES: readonly PodcastVoiceProfile[];
export function podcastFeedFileStem(
  group: PodcastFeedGroup,
  options?: PodcastFeedExportOptions,
): string;
export function buildPodcastFeedSidecar<T extends PodcastTrackLike>(
  group: PodcastFeedGroup<T>,
  options?: PodcastFeedExportOptions,
): PodcastFeedSidecar;
export function buildPodcastRssXml<T extends PodcastTrackLike>(
  groupOrSidecar: PodcastFeedGroup<T> | PodcastFeedSidecar,
  options?: PodcastFeedExportOptions,
): string;
