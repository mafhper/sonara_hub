import { ChevronDown, Save, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import type { TextOverlaySettings } from "../types";
import type { TextBatchApplyMode } from "../../shared/composition-scope.mjs";

const TEXT_PROFILES_KEY = "sonara.textProfiles";
const TEXT_PROFILES_LIMIT = 50;

type TextProfile = { name: string; settings: TextOverlaySettings };

const textProfilesStore = (() => {
  let profiles: TextProfile[] = readTextProfiles();
  const listeners = new Set<() => void>();
  function readTextProfiles(): TextProfile[] {
    try {
      const raw = JSON.parse(
        window.localStorage.getItem(TEXT_PROFILES_KEY) ?? "[]",
      );
      if (!Array.isArray(raw)) return [];
      return raw
        .filter(
          (entry): entry is TextProfile =>
            Boolean(entry) &&
            typeof entry.name === "string" &&
            Boolean(entry.settings) &&
            typeof entry.settings === "object",
        )
        .slice(0, TEXT_PROFILES_LIMIT);
    } catch {
      return [];
    }
  }
  function persist() {
    try {
      window.localStorage.setItem(TEXT_PROFILES_KEY, JSON.stringify(profiles));
    } catch {
      // localStorage may be unavailable; in-memory list still works this session.
    }
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => profiles,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    save(name: string, settings: TextOverlaySettings) {
      const clean = name.trim().slice(0, 60);
      if (!clean) return;
      profiles = [
        { name: clean, settings },
        ...profiles.filter((entry) => entry.name !== clean),
      ].slice(0, TEXT_PROFILES_LIMIT);
      persist();
    },
    remove(name: string) {
      profiles = profiles.filter((entry) => entry.name !== name);
      persist();
    },
  };
})();

function useTextProfiles() {
  return useSyncExternalStore(
    textProfilesStore.subscribe,
    textProfilesStore.getSnapshot,
    textProfilesStore.getSnapshot,
  );
}

export function TextProfiles({
  current,
  onApply,
}: {
  current: TextOverlaySettings;
  onApply: (settings: TextOverlaySettings, mode: TextBatchApplyMode) => void;
}) {
  const profiles = useTextProfiles();
  const [name, setName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [openMenuName, setOpenMenuName] = useState("");

  function closeSave() {
    setName("");
    setSaveOpen(false);
  }

  function saveProfile() {
    if (!name.trim()) return;
    textProfilesStore.save(name, current);
    closeSave();
  }

  function applyProfile(profile: TextProfile, mode: TextBatchApplyMode) {
    onApply(profile.settings, mode);
    setOpenMenuName("");
  }

  return (
    <div className="text-profiles">
      {saveOpen ? (
        <form
          aria-label="Salvar perfil de texto"
          className="text-profiles-save"
          onKeyDown={(event) => {
            if (event.key === "Escape") closeSave();
          }}
          onSubmit={(event) => {
            event.preventDefault();
            saveProfile();
          }}
        >
          <input
            autoFocus
            aria-label="Nome do perfil de texto"
            className="text-profile-name"
            maxLength={60}
            placeholder="Nome do perfil"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="text-profile-save-actions">
            <button className="quiet-action" type="button" onClick={closeSave}>
              Cancelar
            </button>
            <button
              className="primary-action"
              disabled={!name.trim()}
              type="submit"
            >
              <Save /> Salvar
            </button>
          </div>
        </form>
      ) : (
        <button
          className="quiet-action text-profile-save-trigger"
          type="button"
          onClick={() => setSaveOpen(true)}
        >
          <Save /> Salvar perfil atual
        </button>
      )}
      {profiles.length === 0 ? (
        <p className="helper-copy">
          Salve o perfil atual e reaplique posição, estilo ou tudo em outras
          faixas.
        </p>
      ) : (
        <ul className="text-profiles-list">
          {profiles.map((profile) => (
            <li
              key={profile.name}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpenMenuName("");
              }}
            >
              <span className="text-profile-name-label" title={profile.name}>
                {profile.name}
              </span>
              <div className="text-profile-row-actions">
                <button
                  aria-label={`Aplicar ${profile.name}`}
                  className="text-profile-apply-primary"
                  type="button"
                  onClick={() => applyProfile(profile, "all")}
                >
                  Aplicar
                </button>
                <button
                  aria-expanded={openMenuName === profile.name}
                  aria-label={`Mais ações de ${profile.name}`}
                  className="text-profile-more"
                  type="button"
                  onClick={() =>
                    setOpenMenuName((currentName) =>
                      currentName === profile.name ? "" : profile.name,
                    )
                  }
                >
                  <ChevronDown aria-hidden="true" />
                </button>
              </div>
              {openMenuName === profile.name && (
                <div
                  aria-label={`Ações de ${profile.name}`}
                  className="text-profile-menu"
                >
                  <button
                    type="button"
                    onClick={() => applyProfile(profile, "position")}
                  >
                    Aplicar somente posição
                  </button>
                  <button
                    type="button"
                    onClick={() => applyProfile(profile, "style")}
                  >
                    Aplicar somente estilo
                  </button>
                  <div className="text-profile-menu-danger">
                    <button
                      aria-label={`Excluir ${profile.name}`}
                      type="button"
                      onClick={() => {
                        textProfilesStore.remove(profile.name);
                        setOpenMenuName("");
                      }}
                    >
                      <Trash2 aria-hidden="true" /> Excluir
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
