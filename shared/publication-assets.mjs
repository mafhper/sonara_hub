export const publicationAssetKinds = ["image", "clip"];

export const publicationAssetPresets = [
  {
    id: "youtube-thumbnail",
    kind: "image",
    label: "YouTube thumbnail",
    platform: "YouTube",
    width: 1280,
    height: 720,
    directory: "imagens",
    extension: "jpg",
  },
  {
    id: "youtube-banner",
    kind: "image",
    label: "YouTube banner",
    platform: "YouTube",
    width: 2560,
    height: 1440,
    directory: "imagens",
    extension: "jpg",
  },
  {
    id: "x-post",
    kind: "image",
    label: "X / Twitter post",
    platform: "X",
    width: 1600,
    height: 900,
    directory: "imagens",
    extension: "jpg",
  },
  {
    id: "soundcloud-banner",
    kind: "image",
    label: "SoundCloud banner",
    platform: "SoundCloud",
    width: 2480,
    height: 520,
    directory: "imagens",
    extension: "jpg",
  },
  {
    id: "square-post",
    kind: "image",
    label: "Post quadrado",
    platform: "Social",
    width: 1080,
    height: 1080,
    directory: "imagens",
    extension: "jpg",
  },
  {
    id: "clip-landscape",
    kind: "clip",
    label: "Clip landscape",
    platform: "Social",
    width: 1920,
    height: 1080,
    directory: "clips",
    extension: "mp4",
    maxDurationSeconds: 30,
  },
  {
    id: "clip-square",
    kind: "clip",
    label: "Clip quadrado",
    platform: "Social",
    width: 1080,
    height: 1080,
    directory: "clips",
    extension: "mp4",
    maxDurationSeconds: 30,
  },
  {
    id: "clip-vertical",
    kind: "clip",
    label: "Clip vertical",
    platform: "Social",
    width: 1080,
    height: 1920,
    directory: "clips",
    extension: "mp4",
    maxDurationSeconds: 30,
  },
];

export function publicationAssetPresetById(id) {
  return (
    publicationAssetPresets.find((preset) => preset.id === id) ??
    publicationAssetPresets[0]
  );
}

export function publicationAssetPresetLabel(id) {
  const preset = publicationAssetPresetById(id);
  return `${preset.label} · ${preset.width}x${preset.height}`;
}

export function clampPublicationClipDuration(value) {
  const duration = Number(value);
  if (Number.isNaN(duration)) return 15;
  return Math.min(30, Math.max(1, duration));
}

export function clampPublicationClipStart(value) {
  const start = Number(value);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, start);
}

export function sanitizePublicationFilePart(value, fallback = "asset") {
  const output = String(value ?? "")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .replaceAll(" ", "-");
  return output || fallback;
}
