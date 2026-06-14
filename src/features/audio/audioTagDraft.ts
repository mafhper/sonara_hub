import type { AudioTagDraft, TrackMetadata } from "../../types";

export function audioDraftFromMetadata(metadata: TrackMetadata): AudioTagDraft {
  return {
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    albumArtist: metadata.albumArtist,
    genre: metadata.genre,
    composer: metadata.composer,
    comment: metadata.comment,
    copyright: metadata.copyright,
    year: metadata.year,
    trackNumber: metadata.trackNumber,
    trackTotal: metadata.trackTotal,
    diskNumber: metadata.diskNumber,
    diskTotal: metadata.diskTotal,
    lyrics: metadata.lyrics,
    lyricsLanguage: metadata.lyricsLanguage,
    normalizationEnabled: metadata.normalizationEnabled,
    podcastVoiceProfile: metadata.podcastVoiceProfile,
    podcastTrimSilence: metadata.podcastTrimSilence,
    podcastVoiceBoost: metadata.podcastVoiceBoost,
    podcastPlaybackSpeed: metadata.podcastPlaybackSpeed,
    podcastIntroInsert: metadata.podcastIntroInsert,
    podcastOutroInsert: metadata.podcastOutroInsert,
    podcastAdInsert: metadata.podcastAdInsert,
    cleanPackage: true,
  };
}
