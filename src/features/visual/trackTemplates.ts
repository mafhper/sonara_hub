import { normalizeVisualSettings } from "../../../shared/visual-effects.mjs";
import type { TrackDraft } from "../../types";

// Applies ONLY the atmosphere/colors (scene) to the batch. Layers are
// deliberately left untouched so each video keeps its own — copying layers is a
// separate, explicit action (applyLayersTemplateToTracks) to avoid the silent
// cross-video replication that confused users.
export function applyVisualTemplateToTracks(
  tracks: TrackDraft[],
  selectedTrackId: string,
) {
  const source = selectedTrackFrom(tracks, selectedTrackId);
  if (!source) return tracks;
  const scene = normalizeVisualSettings(source.scene);
  return tracks.map((track) =>
    track.selectedForBatch
      ? {
          ...track,
          scene,
        }
      : track,
  );
}

// Copies the selected track's layers onto every batch-selected track, minting a
// fresh id per layer so each video owns an independent copy. This is the only
// path that propagates layers across videos, and it is always user-initiated.
export function applyLayersTemplateToTracks(
  tracks: TrackDraft[],
  selectedTrackId: string,
) {
  const source = selectedTrackFrom(tracks, selectedTrackId);
  if (!source) return tracks;
  return tracks.map((track) =>
    track.selectedForBatch && track.id !== source.id
      ? {
          ...track,
          layers: source.layers.map((layer) => ({
            ...layer,
            id: crypto.randomUUID(),
          })),
        }
      : track,
  );
}

export function applyMusicTemplateToTracks(
  tracks: TrackDraft[],
  selectedTrackId: string,
) {
  const source = selectedTrackFrom(tracks, selectedTrackId);
  if (!source) return tracks;
  const {
    album,
    albumArtist,
    artist,
    comment,
    composer,
    copyright,
    diskNumber,
    diskTotal,
    genre,
    normalizationEnabled,
    trackTotal,
    year,
  } = source.metadata;
  return tracks.map((track) =>
    track.selectedForBatch
      ? {
          ...track,
          metadata: {
            ...track.metadata,
            album,
            albumArtist,
            artist,
            comment,
            composer,
            copyright,
            diskNumber,
            diskTotal,
            genre,
            normalizationEnabled,
            trackTotal,
            year,
          },
        }
      : track,
  );
}

export function applyPublicationTemplateToTracks(
  tracks: TrackDraft[],
  selectedTrackId: string,
) {
  const source = selectedTrackFrom(tracks, selectedTrackId);
  if (!source) return tracks;
  const {
    categoryId,
    containsSyntheticMedia,
    description,
    language,
    madeForKids,
    tags,
    visibility,
  } = source.metadata;
  return tracks.map((track) =>
    track.selectedForBatch
      ? {
          ...track,
          metadata: {
            ...track.metadata,
            categoryId,
            containsSyntheticMedia,
            description,
            language,
            madeForKids,
            tags,
            visibility,
          },
        }
      : track,
  );
}

function selectedTrackFrom(tracks: TrackDraft[], selectedTrackId: string) {
  return tracks.find((track) => track.id === selectedTrackId) ?? null;
}
