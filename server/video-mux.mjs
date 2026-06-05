export function buildWebglMuxArgs({
  audioPath,
  audioStartSeconds = 0,
  duration,
  metadata,
  outputPath,
  outputSize,
  settings,
  subtitlePath,
  webglVideoPath,
}) {
  const filters = [
    `setpts=N/(${settings.webglFps}*TB)`,
    `fps=${settings.outputFps ?? settings.webglFps}`,
    `scale=${outputSize.width}:${outputSize.height}:flags=lanczos`,
  ];
  if (subtitlePath)
    filters.push(`subtitles='${escapeFilterPath(subtitlePath)}'`);
  filters.push("format=yuv420p");

  return [
    "-y",
    "-i",
    webglVideoPath,
    ...(Number(audioStartSeconds) > 0
      ? ["-ss", String(Math.max(0, Number(audioStartSeconds)))]
      : []),
    "-i",
    audioPath,
    "-t",
    String(duration),
    "-vf",
    filters.join(","),
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-preset",
    settings.encoderPreset ?? "veryfast",
    "-crf",
    String(settings.crf),
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    "-metadata",
    `title=${metadata.title}`,
    "-metadata",
    `artist=${metadata.artist}`,
    "-metadata",
    `genre=${metadata.genre}`,
    "-metadata",
    `album=${metadata.album}`,
    outputPath,
  ];
}

function escapeFilterPath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/:/, "\\:").replace(/'/g, "\\'");
}
