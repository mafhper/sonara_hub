export interface SystemCapabilities {
  detectedAt: string;
  platform: string;
  cpu: { cores: number; model: string | null };
  gpu: {
    available: boolean;
    vendor: string | null;
    renderer: string | null;
    version: string | null;
    shadingLanguageVersion: string | null;
    webglVersion: string | null;
    isHardware: boolean;
    probeError?: string | null;
  };
  ffmpeg: {
    available: boolean;
    preferred: string | null;
    hardwareEncoders: string[];
    errorCode: string | null;
  };
  concurrency: { render: number | null; audio: number | null };
  recommendations: {
    gpuMode: string;
    capturePacing: string;
    encoderMode: string;
  };
}

export function describeSystemCapabilities(
  capabilities: SystemCapabilities | null,
): string[] {
  if (!capabilities) return [];
  const lines: string[] = [];
  const cpuModel = capabilities.cpu.model ? ` · ${capabilities.cpu.model}` : "";
  lines.push(`CPU: ${capabilities.cpu.cores} núcleos${cpuModel}`);

  if (capabilities.gpu.available && capabilities.gpu.renderer) {
    lines.push(
      `GPU WebGL: ${capabilities.gpu.renderer}${capabilities.gpu.isHardware ? " (hardware)" : " (software)"}`,
    );
  } else {
    lines.push(
      capabilities.gpu.probeError
        ? `GPU WebGL: indisponível (${capabilities.gpu.probeError})`
        : "GPU WebGL: indisponível",
    );
  }

  lines.push(
    capabilities.ffmpeg.hardwareEncoders.length
      ? `Codificadores FFmpeg: ${capabilities.ffmpeg.hardwareEncoders.join(", ")}`
      : "Codificadores FFmpeg: apenas software (libx264)",
  );

  const render = capabilities.concurrency.render ?? "?";
  const audio = capabilities.concurrency.audio ?? "?";
  lines.push(`Filas ativas: ${render} render · ${audio} áudio simultâneos`);
  return lines;
}
