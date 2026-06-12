import { Save, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import type { MediaLayerV2 } from "../types";

// Reusable layer configurations, persisted to localStorage so they survive
// reloads and can be reapplied to any video. Mirrors textProfilesStore, but a
// layer also carries an image, so the source File is embedded as a data URL
// (capped) and the live File/object-URL are rebuilt on apply.
const LAYER_SETS_KEY = "sonara.layerSets";
const LAYER_SETS_LIMIT = 30;
// ~1.4M chars of base64 is roughly 1MB of binary; larger images save
// config-only so a single set never blows past the localStorage quota.
const LAYER_SET_IMAGE_CAP = 1_400_000;

type SavedLayer = Omit<MediaLayerV2, "file" | "src"> & {
  fileName: string;
  fileType: string;
  dataUrl: string | null;
};

type LayerSet = { name: string; layers: SavedLayer[] };

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    } catch {
      resolve(null);
    }
  });
}

async function serializeLayersForSet(
  layers: MediaLayerV2[],
): Promise<SavedLayer[]> {
  return Promise.all(
    layers.map(async ({ file, src: _src, ...rest }) => {
      const dataUrl = file ? await readFileAsDataUrl(file) : null;
      return {
        ...rest,
        fileName: file?.name ?? `${rest.name || "camada"}`,
        fileType: file?.type ?? "image/png",
        dataUrl:
          dataUrl && dataUrl.length <= LAYER_SET_IMAGE_CAP ? dataUrl : null,
      };
    }),
  );
}

function dataUrlToFile(
  dataUrl: string,
  name: string,
  type: string,
): File | null {
  try {
    const [header, body] = dataUrl.split(",");
    const mime = header.match(/data:([^;]+)/)?.[1] || type || "image/png";
    const binary = /;base64/i.test(header)
      ? atob(body)
      : decodeURIComponent(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], name, { type: mime });
  } catch {
    return null;
  }
}

// Rebuilds live layers from a saved set. Layers whose image could not be
// embedded (too large) are skipped, since a layer needs a usable source.
function restoreLayersFromSet(set: LayerSet): MediaLayerV2[] {
  const restored: MediaLayerV2[] = [];
  for (const saved of set.layers) {
    if (!saved.dataUrl) continue;
    const file = dataUrlToFile(saved.dataUrl, saved.fileName, saved.fileType);
    if (!file) continue;
    const {
      dataUrl: _dataUrl,
      fileName: _fileName,
      fileType: _fileType,
      ...rest
    } = saved;
    restored.push({
      ...rest,
      id: crypto.randomUUID(),
      file,
      src: URL.createObjectURL(file),
    });
  }
  return restored.map((layer, order) => ({ ...layer, order }));
}

const layerSetsStore = (() => {
  let sets: LayerSet[] = readLayerSets();
  const listeners = new Set<() => void>();
  function readLayerSets(): LayerSet[] {
    try {
      const raw = JSON.parse(
        window.localStorage.getItem(LAYER_SETS_KEY) ?? "[]",
      );
      if (!Array.isArray(raw)) return [];
      return raw
        .filter(
          (entry): entry is LayerSet =>
            Boolean(entry) &&
            typeof entry.name === "string" &&
            Array.isArray(entry.layers),
        )
        .slice(0, LAYER_SETS_LIMIT);
    } catch {
      return [];
    }
  }
  function persist() {
    try {
      window.localStorage.setItem(LAYER_SETS_KEY, JSON.stringify(sets));
    } catch {
      // localStorage may be full (embedded images) or unavailable; the
      // in-memory list still works for this session.
    }
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => sets,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    save(name: string, layers: SavedLayer[]) {
      const clean = name.trim().slice(0, 60);
      if (!clean) return;
      sets = [
        { name: clean, layers },
        ...sets.filter((entry) => entry.name !== clean),
      ].slice(0, LAYER_SETS_LIMIT);
      persist();
    },
    remove(name: string) {
      sets = sets.filter((entry) => entry.name !== name);
      persist();
    },
  };
})();

function useLayerSets() {
  return useSyncExternalStore(
    layerSetsStore.subscribe,
    layerSetsStore.getSnapshot,
    layerSetsStore.getSnapshot,
  );
}

export function LayerSets({
  currentLayers,
  onApply,
}: {
  currentLayers: MediaLayerV2[];
  onApply: (layers: MediaLayerV2[]) => void;
}) {
  const sets = useLayerSets();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    const clean = name.trim();
    if (!clean || !currentLayers.length || saving) return;
    setSaving(true);
    try {
      const serialized = await serializeLayersForSet(currentLayers);
      layerSetsStore.save(clean, serialized);
      setName("");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="inspector-subsection layer-sets">
      <p className="inspector-kicker">Conjuntos de camadas</p>
      <div className="text-profiles-save">
        <input
          aria-label="Nome do conjunto de camadas"
          className="text-profile-name"
          maxLength={60}
          placeholder="Nome do conjunto"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
          }}
        />
        <button
          className="quiet-action"
          disabled={!name.trim() || !currentLayers.length || saving}
          type="button"
          onClick={() => void save()}
        >
          <Save /> {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {sets.length === 0 ? (
        <p className="helper-copy">
          Salve as camadas atuais (imagem, posição, escala e animação) como um
          conjunto para reaplicar em qualquer vídeo depois.
        </p>
      ) : (
        <ul className="text-profiles-list">
          {sets.map((set) => {
            const usable = set.layers.filter((layer) => layer.dataUrl).length;
            return (
              <li key={set.name}>
                <button
                  className="text-profile-apply"
                  disabled={usable === 0}
                  title={
                    usable === 0
                      ? "As imagens deste conjunto eram grandes demais para salvar"
                      : `Aplicar conjunto ${set.name}`
                  }
                  type="button"
                  onClick={() => onApply(restoreLayersFromSet(set))}
                >
                  <span>{set.name}</span>
                  <span className="layer-set-count">
                    {usable}/{set.layers.length}
                  </span>
                </button>
                <button
                  aria-label={`Excluir conjunto ${set.name}`}
                  className="icon-button"
                  type="button"
                  onClick={() => layerSetsStore.remove(set.name)}
                >
                  <Trash2 />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
