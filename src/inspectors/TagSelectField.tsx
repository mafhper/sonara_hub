import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

export const genreSuggestions = [
  "Pop",
  "Rock",
  "Hip-Hop",
  "Trap",
  "R&B",
  "Soul",
  "Funk",
  "Eletrônica",
  "House",
  "Techno",
  "Drum & Bass",
  "Dubstep",
  "Synthwave",
  "Phonk",
  "Lo-fi",
  "Ambient",
  "Experimental",
  "Hyperpop",
  "Dance",
  "Jazz",
  "Blues",
  "Clássica",
  "Country",
  "Folk",
  "Indie",
  "Metal",
  "Punk",
  "Reggae",
  "Gospel",
  "MPB",
  "Samba",
  "Pagode",
  "Sertanejo",
  "Forró",
  "Bossa Nova",
  "Axé",
  "Afrobeat",
  "K-pop",
  "Latin",
  "Reggaeton",
  "Drill",
];

function parseTagList(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function loadCustomTags(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function saveCustomTags(key: string, tags: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(tags));
  } catch {
    /* storage unavailable — keep the in-session list only */
  }
}

// Chip multi-select with a curated suggestion list plus the user's own saved
// additions. The value stays a comma-separated string for metadata fields.
export function TagSelectField({
  label,
  value,
  onChange,
  suggestions,
  storageKey,
  placeholder = "Adicionar…",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  storageKey: string;
  placeholder?: string;
}) {
  const [custom, setCustom] = useState<string[]>(() =>
    loadCustomTags(storageKey),
  );
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  const selected = parseTagList(value);
  const known = [...suggestions, ...custom];
  const available = known.filter(
    (tag) => !selected.some((item) => item.toLowerCase() === tag.toLowerCase()),
  );
  const filtered = (
    draft
      ? available.filter((tag) =>
          tag.toLowerCase().includes(draft.trim().toLowerCase()),
        )
      : available
  ).slice(0, 14);

  const commit = (next: string[]) =>
    onChange(
      [...new Set(next.map((tag) => tag.trim()).filter(Boolean))].join(", "),
    );

  const addTag = (tag: string) => {
    commit([...selected, tag]);
    setDraft("");
  };
  const removeTag = (tag: string) =>
    commit(selected.filter((item) => item !== tag));

  const addDraftAsCustom = () => {
    const clean = draft.trim();
    if (!clean) return;
    if (!known.some((tag) => tag.toLowerCase() === clean.toLowerCase())) {
      const next = [...custom, clean];
      setCustom(next);
      saveCustomTags(storageKey, next);
    }
    addTag(clean);
  };

  const deleteCustom = (tag: string) => {
    const next = custom.filter((item) => item !== tag);
    setCustom(next);
    saveCustomTags(storageKey, next);
  };

  return (
    <div className="tag-select-field">
      <span className="tag-select-label">{label}</span>
      {selected.length > 0 && (
        <div className="tag-select-chips">
          {selected.map((tag) => (
            <span className="tag-chip" key={tag}>
              {tag}
              <button
                aria-label={`Remover ${tag}`}
                type="button"
                onClick={() => removeTag(tag)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="tag-select-input">
        <input
          aria-label={`${label} — adicionar`}
          placeholder={placeholder}
          value={draft}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addDraftAsCustom();
            }
          }}
        />
        {open && (filtered.length > 0 || draft.trim()) && (
          <ul className="tag-select-menu">
            {draft.trim() &&
              !known.some(
                (tag) => tag.toLowerCase() === draft.trim().toLowerCase(),
              ) && (
                <li>
                  <button type="button" onClick={addDraftAsCustom}>
                    <Plus /> Adicionar “{draft.trim()}” e salvar
                  </button>
                </li>
              )}
            {filtered.map((tag) => (
              <li key={tag}>
                <button type="button" onClick={() => addTag(tag)}>
                  {tag}
                  {custom.includes(tag) && (
                    <em className="tag-select-saved">salvo</em>
                  )}
                </button>
                {custom.includes(tag) && (
                  <button
                    aria-label={`Apagar tag salva ${tag}`}
                    className="tag-select-delete"
                    type="button"
                    onClick={() => deleteCustom(tag)}
                  >
                    <Trash2 />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
