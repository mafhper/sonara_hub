import { Save, Trash2 } from "lucide-react";
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
  return (
    <div className="inspector-subsection text-profiles">
      <p className="inspector-kicker">Perfis de texto</p>
      <div className="text-profiles-save">
        <input
          aria-label="Nome do perfil de texto"
          className="text-profile-name"
          maxLength={60}
          placeholder="Nome do perfil"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim()) {
              textProfilesStore.save(name, current);
              setName("");
            }
          }}
        />
        <button
          className="quiet-action"
          disabled={!name.trim()}
          type="button"
          onClick={() => {
            textProfilesStore.save(name, current);
            setName("");
          }}
        >
          <Save /> Salvar
        </button>
      </div>
      {profiles.length === 0 ? (
        <p className="helper-copy">
          Salve o perfil atual e reaplique posição, estilo ou tudo em outras
          faixas.
        </p>
      ) : (
        <ul className="text-profiles-list">
          {profiles.map((profile) => (
            <li key={profile.name}>
              <span className="text-profile-name-label">{profile.name}</span>
              <div className="text-profile-apply-modes">
                <button
                  className="text-profile-apply"
                  title={`Aplicar posição do perfil ${profile.name}`}
                  type="button"
                  onClick={() => onApply(profile.settings, "position")}
                >
                  Posição
                </button>
                <button
                  className="text-profile-apply"
                  title={`Aplicar estilo do perfil ${profile.name}`}
                  type="button"
                  onClick={() => onApply(profile.settings, "style")}
                >
                  Estilo
                </button>
                <button
                  className="text-profile-apply"
                  title={`Aplicar perfil completo ${profile.name}`}
                  type="button"
                  onClick={() => onApply(profile.settings, "all")}
                >
                  Tudo
                </button>
              </div>
              <button
                aria-label={`Excluir perfil ${profile.name}`}
                className="icon-button"
                type="button"
                onClick={() => textProfilesStore.remove(profile.name)}
              >
                <Trash2 />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
