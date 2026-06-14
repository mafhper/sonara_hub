import { useEffect, useState } from "react";
import {
  type AppTheme,
  type ThemePreference,
  type UiScalePreference,
  applyThemePreference,
  applyUiScalePreference,
  loadThemePreference,
  loadUiScalePreference,
  resolveAppTheme,
  saveThemePreference,
  saveUiScalePreference,
} from "../theme";

export type ThemePreferenceApi = {
  effectiveTheme: AppTheme;
  setThemePreference: (preference: ThemePreference) => void;
  setUiScalePreference: (preference: UiScalePreference) => void;
  themePreference: ThemePreference;
  uiScalePreference: UiScalePreference;
};

export function useThemePreference(): ThemePreferenceApi {
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    loadThemePreference(),
  );
  const [effectiveTheme, setEffectiveTheme] = useState<AppTheme>(() =>
    resolveAppTheme(loadThemePreference()),
  );
  const [uiScalePreference, setUiScalePreference] = useState<UiScalePreference>(
    () => loadUiScalePreference(),
  );

  useEffect(() => {
    const apply = () =>
      setEffectiveTheme(applyThemePreference(themePreference));
    apply();
    saveThemePreference(themePreference);

    if (
      themePreference !== "system" ||
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => apply();
    query.addEventListener?.("change", listener);
    query.addListener?.(listener);
    return () => {
      query.removeEventListener?.("change", listener);
      query.removeListener?.(listener);
    };
  }, [themePreference]);

  useEffect(() => {
    applyUiScalePreference(uiScalePreference);
    saveUiScalePreference(uiScalePreference);
  }, [uiScalePreference]);

  return {
    effectiveTheme,
    setThemePreference,
    setUiScalePreference,
    themePreference,
    uiScalePreference,
  };
}
