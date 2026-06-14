export type ThemePreference =
  | "system"
  | "original"
  | "light"
  | "dark"
  | "golden";

export type AppTheme = "original" | "light" | "dark" | "golden";
export type UiScalePreference = "standard" | "large" | "extra";

type SystemTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "sonara-hub-theme";
export const UI_SCALE_STORAGE_KEY = "sonara-hub-ui-scale";

export const themePreferenceOptions: readonly {
  id: ThemePreference;
  label: string;
  description: string;
}[] = [
  {
    id: "system",
    label: "Sistema",
    description: "Segue o tema do dispositivo",
  },
  {
    id: "original",
    label: "Original",
    description: "Identidade Sonara atual",
  },
  {
    id: "light",
    label: "Claro",
    description: "Maior leitura em ambientes claros",
  },
  {
    id: "dark",
    label: "Escuro",
    description: "Neutro para trabalho noturno",
  },
  {
    id: "golden",
    label: "Golden",
    description: "Mel claro e luminoso",
  },
];

export const appThemeLabels: Record<AppTheme, string> = {
  dark: "Escuro",
  golden: "Golden",
  light: "Claro",
  original: "Original",
};

export const uiScalePreferenceOptions: readonly {
  id: UiScalePreference;
  label: string;
  description: string;
}[] = [
  {
    id: "standard",
    label: "Padrão",
    description: "Densidade atual da interface",
  },
  {
    id: "large",
    label: "Grande",
    description: "Textos e controles mais confortáveis",
  },
  {
    id: "extra",
    label: "Extra",
    description: "Maior leitura para baixa visão",
  },
];

const themePreferenceIds = new Set<ThemePreference>(
  themePreferenceOptions.map((option) => option.id),
);
const uiScalePreferenceIds = new Set<UiScalePreference>(
  uiScalePreferenceOptions.map((option) => option.id),
);

const themeColorByTheme: Record<AppTheme, string> = {
  dark: "#14161c",
  golden: "#e8d2a0",
  light: "#f6f2e9",
  original: "#050506",
};

// Themes that use a light color-scheme (light form controls, scrollbars).
const lightThemes = new Set<AppTheme>(["light", "golden"]);

export function normalizeThemePreference(value: unknown): ThemePreference {
  const candidate = String(value ?? "").trim() as ThemePreference;
  return themePreferenceIds.has(candidate) ? candidate : "original";
}

export function normalizeUiScalePreference(value: unknown): UiScalePreference {
  const candidate = String(value ?? "").trim() as UiScalePreference;
  return uiScalePreferenceIds.has(candidate) ? candidate : "standard";
}

export function systemTheme(): SystemTheme {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

export function resolveAppTheme(
  preference: ThemePreference,
  system: SystemTheme = systemTheme(),
): AppTheme {
  if (preference === "system") return system;
  return preference;
}

export function loadThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "original";
  try {
    return normalizeThemePreference(
      window.localStorage.getItem(THEME_STORAGE_KEY),
    );
  } catch {
    return "original";
  }
}

export function loadUiScalePreference(): UiScalePreference {
  if (typeof window === "undefined") return "standard";
  try {
    return normalizeUiScalePreference(
      window.localStorage.getItem(UI_SCALE_STORAGE_KEY),
    );
  } catch {
    return "standard";
  }
}

export function saveThemePreference(preference: ThemePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Theme is a local UI preference; storage failures should not block use.
  }
}

export function saveUiScalePreference(preference: UiScalePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(UI_SCALE_STORAGE_KEY, preference);
  } catch {
    // UI scale is a local preference; storage failures should not block use.
  }
}

export function applyThemePreference(preference: ThemePreference): AppTheme {
  const effectiveTheme = resolveAppTheme(preference);
  if (typeof document === "undefined") return effectiveTheme;

  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = effectiveTheme;
  root.style.colorScheme = lightThemes.has(effectiveTheme) ? "light" : "dark";

  const themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (themeColor) {
    themeColor.content = themeColorByTheme[effectiveTheme];
  }

  return effectiveTheme;
}

export function applyUiScalePreference(preference: UiScalePreference) {
  if (typeof document === "undefined") return preference;
  const normalized = normalizeUiScalePreference(preference);
  document.documentElement.dataset.uiScale = normalized;
  return normalized;
}
