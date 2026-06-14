import { PODCAST_ENABLED_STORAGE_KEY } from "../../app/appDefaults";

export function loadPodcastEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PODCAST_ENABLED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function savePodcastEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PODCAST_ENABLED_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    // Podcast is an opt-in UI preference; storage failures should not block use.
  }
}
