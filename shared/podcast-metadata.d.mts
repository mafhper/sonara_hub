export type PodcastTrackMetadataLike = {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  albumArtist?: string | null;
  genre?: string | null;
  description?: string | null;
  comment?: string | null;
  composer?: string | null;
  year?: string | number | null;
  recordingDate?: string | number | null;
  lyrics?: string | null;
  trackNumber?: number | null;
  diskNumber?: number | null;
  podcastVoiceProfile?: string | null;
  podcastTrimSilence?: boolean | null;
  podcastVoiceBoost?: boolean | null;
  podcastPlaybackSpeed?: number | null;
  podcastIntroInsert?: string | null;
  podcastOutroInsert?: string | null;
  podcastAdInsert?: string | null;
  podcastEpisodeArtworkUrl?: string | null;
  podcastEpisodeLink?: string | null;
  podcastEpisodeLinks?: string | null;
  podcastDonationUrl?: string | null;
};

export type PodcastAudioInfoLike = {
  fileName?: string | null;
  sizeBytes?: number | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  albumArtist?: string | null;
  genre?: string | null;
  description?: string | null;
  comment?: string | null;
  composer?: string | null;
  year?: string | number | null;
  date?: string | number | null;
  lyrics?: string | null;
  track?: number | null;
  disk?: number | null;
  durationSeconds?: number | null;
  metadataPartial?: boolean;
};

export type PodcastTrackLike = {
  sourceKey: string;
  metadata?: PodcastTrackMetadataLike;
  audioInfo?: PodcastAudioInfoLike;
};

export type PodcastFeedMetadata = {
  id: string;
  title: string;
  author: string;
  category: string;
};

export type PodcastEpisodeMetadata = {
  title: string;
  feedId: string;
  feedName: string;
  feedAuthor: string;
  author: string;
  category: string;
  publishedAt: string;
  description: string;
  transcript: string;
  artworkUrl: string;
  link: string;
  links: string[];
  donationUrl: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  durationSeconds: number | null;
  sourceFileName: string | undefined;
  metadataPartial: boolean;
  hasEmbeddedMetadata: boolean;
  hasDescription: boolean;
  hasTranscript: boolean;
};

export type PodcastFeedGroup<T extends PodcastTrackLike = PodcastTrackLike> = {
  id: string;
  name: string;
  author: string;
  metadata: PodcastFeedMetadata;
  tracks: T[];
  episodeCount: number;
  taggedCount: number;
  metadataCount: number;
  descriptionCount: number;
  transcriptCount: number;
  partialCount: number;
  totalDurationSeconds: number | null;
  latestPublishedAt: string;
};

export const UNKNOWN_PODCAST_FEED: string;
export const UNKNOWN_PODCAST_EPISODE: string;
export function buildPodcastFeedGroups<T extends PodcastTrackLike>(
  tracks: T[],
): PodcastFeedGroup<T>[];
export function extractPodcastFeedMetadata(
  track: PodcastTrackLike,
): PodcastFeedMetadata;
export function extractPodcastEpisodeMetadata(
  track: PodcastTrackLike,
): PodcastEpisodeMetadata;
export function podcastFeedName(track: PodcastTrackLike): string;
export function podcastEpisodeTitle(track: PodcastTrackLike): string;
export function hasEmbeddedPodcastMetadata(track: PodcastTrackLike): boolean;
export function hasPodcastEpisodeMetadata(track: PodcastTrackLike): boolean;
export function comparePodcastEpisodes(
  first: PodcastTrackLike,
  second: PodcastTrackLike,
): number;
