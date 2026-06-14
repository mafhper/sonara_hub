import type { FileNamePattern } from "../../inspectors/FileNamePattern";
import type {
  MediaLayerV2,
  TextOverlaySettings,
  TrackDraft,
  TrackMetadata,
} from "../../types";
import { applyPublicationTextOverride } from "../../../shared/publication-assets.mjs";
import type {
  PublicationAssetPreset,
  PublicationAssetSettings,
} from "../../../shared/publication-assets.mjs";
import { appendTrackAudioSource } from "../audio/audioSources";
import { stripLayerFile } from "../visual/layerSerialization";

type ExportComposition = {
  scene: unknown;
  textSettings: TextOverlaySettings | null;
  layers: MediaLayerV2[];
  metadata: TrackMetadata | null;
  cover: { file: File } | null;
  showMetadata: boolean;
};

type RenderFormDataOptions = {
  composition: ExportComposition;
  fileNamePattern: FileNamePattern;
  outputPreset: string;
  qualityProfile: string;
  track: TrackDraft;
  workflowMode: "single" | "batch";
};

type PublicationAssetFormDataOptions = {
  assetSettings: PublicationAssetSettings;
  composition: ExportComposition;
  generateDataFiles: boolean;
  outputPreset: string;
  preset: PublicationAssetPreset;
  qualityProfile: string;
  track: TrackDraft;
  workflowMode: "single" | "batch";
};

function appendCompositionSource(
  formData: FormData,
  track: TrackDraft,
  composition: ExportComposition,
) {
  if (!appendTrackAudioSource(formData, track)) return false;
  for (const layer of composition.layers) {
    formData.append("mediaLayers", layer.file);
  }
  if (composition.cover) formData.append("cover", composition.cover.file);
  formData.append("visualSettings", JSON.stringify(composition.scene));
  if (composition.metadata) {
    for (const [key, value] of Object.entries(composition.metadata)) {
      formData.append(key, String(value));
    }
  }
  return true;
}

export function buildRenderFormData({
  composition,
  fileNamePattern,
  outputPreset,
  qualityProfile,
  track,
  workflowMode,
}: RenderFormDataOptions) {
  const formData = new FormData();
  if (!appendCompositionSource(formData, track, composition)) return null;
  formData.append(
    "compositionSettings",
    JSON.stringify({
      mediaLayers: composition.layers.map(stripLayerFile),
      durationSeconds: track.audioInfo?.durationSeconds ?? null,
      textSettings: composition.textSettings,
    }),
  );
  formData.append("preset", outputPreset);
  formData.append("qualityProfile", qualityProfile);
  formData.append("renderMode", workflowMode);
  formData.append("showMetadata", String(composition.showMetadata));
  formData.append("fileNamePattern", JSON.stringify(fileNamePattern));
  return formData;
}

export function buildPublicationAssetFormData({
  assetSettings,
  composition,
  generateDataFiles,
  outputPreset,
  preset,
  qualityProfile,
  track,
  workflowMode,
}: PublicationAssetFormDataOptions) {
  const formData = new FormData();
  if (!appendCompositionSource(formData, track, composition)) return null;
  formData.append(
    "compositionSettings",
    JSON.stringify({
      mediaLayers: composition.layers.map(stripLayerFile),
      durationSeconds: track.audioInfo?.durationSeconds ?? null,
      // Bake the per-asset text override into the exported text settings so
      // the rendered file matches exactly what the preview showed.
      textSettings: applyPublicationTextOverride(
        composition.textSettings,
        assetSettings,
      ),
    }),
  );
  formData.append("preset", outputPreset);
  formData.append("qualityProfile", qualityProfile);
  formData.append("renderMode", workflowMode);
  formData.append("showMetadata", String(composition.showMetadata));
  formData.append("publicationPresetId", preset.id);
  formData.append("clipStart", String(assetSettings.clipStart));
  formData.append("clipDuration", String(assetSettings.clipDuration));
  formData.append(
    "includeFullLyrics",
    String(assetSettings.lyricsMode === "full"),
  );
  formData.append("lyricsMode", assetSettings.lyricsMode);
  formData.append("lyricsExcerpt", assetSettings.lyricsExcerpt);
  formData.append("lyricsHideTags", String(assetSettings.lyricsHideTags));
  formData.append("lyricsLineSpacing", String(assetSettings.lyricsLineSpacing));
  formData.append("generateDataFiles", String(generateDataFiles));
  formData.append("lyricsPosition", assetSettings.lyricsPosition);
  formData.append("lyricsStyle", assetSettings.lyricsStyle);
  formData.append("bookletTheme", assetSettings.bookletTheme);
  return formData;
}
