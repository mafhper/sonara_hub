import { publicationAssetPresets } from "../shared/publication-assets.mjs";
import type {
  PublicationAssetPreset,
  PublicationAssetSettings,
} from "../shared/publication-assets.mjs";

export type PublicationAssetMode = "single" | "group" | "all";

export function publicationPresetsForMode(
  selectedPreset: PublicationAssetPreset,
  mode: PublicationAssetMode,
) {
  if (mode === "all") return publicationAssetPresets;
  if (mode === "group") {
    return publicationAssetPresets.filter(
      (preset) => preset.kind === selectedPreset.kind,
    );
  }
  return [selectedPreset];
}

export function publicationLyricsSettingLabel(
  settings: PublicationAssetSettings,
) {
  if (settings.lyricsMode === "full") return "letra completa";
  if (settings.lyricsMode === "excerpt") return "trecho de letra";
  return "sem letra";
}

export function publicationAssetKindLabel(
  kind: PublicationAssetPreset["kind"],
) {
  if (kind === "clip") return "clip";
  if (kind === "booklet") return "encarte";
  return "imagem";
}

export function publicationLyricsExcerptOptions(value: string) {
  const lines = String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const windowSize = Math.min(4, lines.length);
  const starts =
    lines.length <= windowSize
      ? [{ id: "all", label: "Letra detectada", start: 0 }]
      : [
          { id: "start", label: "Início da letra", start: 0 },
          {
            id: "middle",
            label: "Meio da letra",
            start: Math.max(0, Math.floor((lines.length - windowSize) / 2)),
          },
          {
            id: "end",
            label: "Final da letra",
            start: Math.max(0, lines.length - windowSize),
          },
        ];
  const seen = new Set<string>();
  return starts
    .map((item) => {
      const excerpt = lines
        .slice(item.start, item.start + windowSize)
        .join("\n");
      return {
        id: item.id,
        label: item.label,
        value: excerpt,
      };
    })
    .filter((item) => {
      if (!item.value || seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    });
}
