import type { FileNamePattern } from "../../inspectors/FileNamePattern";
import { FILE_NAME_PATTERN_STORAGE_KEY } from "../../app/appDefaults";
import {
  defaultFileNamePattern,
  normalizeFileNamePattern,
} from "../../../shared/file-naming.mjs";

export function loadFileNamePattern(): FileNamePattern {
  if (typeof window === "undefined")
    return normalizeFileNamePattern(defaultFileNamePattern);
  try {
    const raw = window.localStorage.getItem(FILE_NAME_PATTERN_STORAGE_KEY);
    return normalizeFileNamePattern(
      raw ? JSON.parse(raw) : defaultFileNamePattern,
    );
  } catch {
    return normalizeFileNamePattern(defaultFileNamePattern);
  }
}

export function saveFileNamePattern(pattern: FileNamePattern) {
  try {
    window.localStorage.setItem(
      FILE_NAME_PATTERN_STORAGE_KEY,
      JSON.stringify(pattern),
    );
  } catch {
    // The filename pattern is an optional local preference.
  }
}
