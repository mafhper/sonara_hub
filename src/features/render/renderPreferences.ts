export type RenderPreferenceField = "gpuMode" | "capturePacing" | "encoderMode";

export type RenderPreferenceSource = "preference" | "environment" | "default";

export interface RenderPreferences {
  gpuMode: string;
  capturePacing: string;
  encoderMode: string;
  updatedAt?: string;
}

export interface RenderPreferencesPayload {
  preferences: RenderPreferences;
  sources: Record<RenderPreferenceField, RenderPreferenceSource>;
}

export const emptyRenderPreferences: RenderPreferences = {
  gpuMode: "",
  capturePacing: "",
  encoderMode: "",
};

export interface RenderPreferenceOption {
  value: string;
  label: string;
  description: string;
}

const defaultOption: RenderPreferenceOption = {
  value: "",
  label: "Padrão do sistema",
  description: "Sem preferência salva; vale o ambiente ou o padrão interno.",
};

export const renderPreferenceOptions: Record<
  RenderPreferenceField,
  RenderPreferenceOption[]
> = {
  gpuMode: [
    defaultOption,
    {
      value: "auto",
      label: "Automático",
      description:
        "Tenta GPU dedicada e cai para software se a saída ficar inválida.",
    },
    {
      value: "hardware",
      label: "GPU (hardware)",
      description: "WebGL acelerado pela GPU dedicada quando disponível.",
    },
    {
      value: "software",
      label: "Software",
      description: "Renderização por CPU; mais lento e mais compatível.",
    },
  ],
  capturePacing: [
    defaultOption,
    {
      value: "legacy",
      label: "Fixo (legado)",
      description:
        "Espera fixa de 32ms por frame após desenhar; comportamento histórico.",
    },
    {
      value: "adaptive",
      label: "Adaptativo",
      description:
        "Espera só o restante do orçamento de frame; reduz o tempo total de captura.",
    },
  ],
  encoderMode: [
    defaultOption,
    {
      value: "auto",
      label: "Automático",
      description:
        "Usa codificador de hardware (AMF/QSV/NVENC) quando detectado.",
    },
    {
      value: "hardware",
      label: "Hardware",
      description: "Força AMF/QSV/NVENC.",
    },
    {
      value: "software",
      label: "Software (libx264)",
      description: "Codificação x264 por CPU; qualidade de referência.",
    },
  ],
};

export const renderPreferenceFieldLabels: Record<
  RenderPreferenceField,
  string
> = {
  gpuMode: "Modo de GPU",
  capturePacing: "Ritmo de captura",
  encoderMode: "Codificador FFmpeg",
};

export const renderPreferenceSourceLabels: Record<
  RenderPreferenceSource,
  string
> = {
  preference: "preferência salva",
  environment: "variável de ambiente",
  default: "padrão interno",
};

export function normalizeRenderPreferencePayload(
  payload: RenderPreferencesPayload | null | undefined,
): RenderPreferencesPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload.preferences as Partial<RenderPreferences> | undefined;
  if (!raw || typeof raw !== "object") return null;
  return {
    preferences: {
      gpuMode: String(raw.gpuMode ?? ""),
      capturePacing: String(raw.capturePacing ?? ""),
      encoderMode: String(raw.encoderMode ?? ""),
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    },
    sources: {
      gpuMode: (payload.sources?.gpuMode ??
        "default") as RenderPreferenceSource,
      capturePacing: (payload.sources?.capturePacing ??
        "default") as RenderPreferenceSource,
      encoderMode: (payload.sources?.encoderMode ??
        "default") as RenderPreferenceSource,
    },
  };
}
