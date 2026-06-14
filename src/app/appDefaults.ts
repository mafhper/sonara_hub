import type { TrackMetadata } from "../types";
import type { LayerFadeInSettings } from "../inspectors/layer-normalizers";
import type { AudioBands, ProjectSaveOption } from "./appTypes";

export const emptyBands: AudioBands = {
  energy: 0,
  bass: 0,
  mid: 0,
  high: 0,
  centroid: 0,
  flux: 0,
  onset: 0,
  beat: 0,
  beatPhase: 0,
  samples: [],
  spectrum: [],
};

export const defaultFadeIn: LayerFadeInSettings = {
  enabled: false,
  startPercent: 0,
  durationSeconds: 1.5,
};

// ISO 639-2 codes the server accepts for the ID3 lyrics/language frame.
// Suggested track "version" labels (free text — users can type their own).
export const versionSuggestions = [
  "Original",
  "Remix",
  "Ao vivo",
  "Acústico",
  "Instrumental",
  "Demo",
  "Remaster",
  "Edit",
  "Radio Edit",
  "Extended",
];

export const COVER_SERIES_STORAGE_KEY = "sonara-hub-cover-series-settings";
export const FILE_NAME_PATTERN_STORAGE_KEY = "sonara-hub-file-name-pattern";
export const INPUT_PROJECT_STORAGE_KEY = "sonara-hub-input-project";
export const PODCAST_ENABLED_STORAGE_KEY = "sonara-hub-podcast-enabled";
export const PODCAST_METADATA_SLICE_BYTES = 8 * 1024 * 1024;
export const PROJECT_STATE_DIRECTORY = ".sonara";
export const PROJECT_STATE_FILE = "project.json";
export const PROJECT_ASSETS_DIRECTORY = "assets";
export const PROJECT_SAVES_DIRECTORY = "saves";
export const DEFAULT_PROJECT_SAVE_ID = "default";

export const defaultProjectSave: ProjectSaveOption = {
  id: DEFAULT_PROJECT_SAVE_ID,
  name: "Padrão",
  isDefault: true,
};

export const defaultMetadata: TrackMetadata = {
  title: "Nova faixa",
  version: "",
  artist: "",
  album: "",
  genre: "",
  description: "",
  comment: "",
  tags: "",
  visibility: "unlisted",
  categoryId: "10",
  language: "pt-BR",
  recordingDate: "",
  copyright: "",
  outputFileName: "",
  useEmbeddedCover: false,
  containsSyntheticMedia: true,
  madeForKids: false,
  albumArtist: "",
  composer: "",
  year: "",
  trackNumber: 1,
  trackTotal: 1,
  diskNumber: 1,
  diskTotal: 1,
  lyrics: "",
  lyricsLanguage: "und",
  normalizationEnabled: false,
  podcastVoiceProfile: "natural",
  podcastTrimSilence: false,
  podcastVoiceBoost: false,
  podcastPlaybackSpeed: 1,
  podcastIntroInsert: "",
  podcastOutroInsert: "",
  podcastAdInsert: "",
  podcastEpisodeArtworkUrl: "",
  podcastEpisodeLink: "",
  podcastEpisodeLinks: "",
  podcastDonationUrl: "",
};
