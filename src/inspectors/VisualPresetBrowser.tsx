import { Check, Gauge, Palette } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  ScenePresetV3,
  VisualVariant,
} from "../../shared/visual-effects.mjs";

type PresetCategory = {
  id: string;
  label: string;
  presets: ScenePresetV3[];
};

export function VisualPresetBrowser({
  presets,
  selectedScene,
  onSelectPreset,
  onSelectVariant,
}: {
  presets: ScenePresetV3[];
  selectedScene: ScenePresetV3;
  onSelectPreset: (id: string) => void;
  onSelectVariant: (baseId: string, variantId: string) => void;
}) {
  const categories = useMemo(() => groupPresetCategories(presets), [presets]);
  const selectedCategoryId =
    selectedScene.categoryId || categories[0]?.id || "all";
  const [activeCategoryId, setActiveCategoryId] = useState(selectedCategoryId);

  useEffect(() => {
    setActiveCategoryId(selectedCategoryId);
  }, [selectedCategoryId]);

  const activeCategory =
    categories.find((category) => category.id === activeCategoryId) ??
    categories[0];
  const visiblePresets = activeCategory?.presets ?? [];
  const categorySummary = activeCategory
    ? `${activeCategory.presets.length} ${
        activeCategory.presets.length === 1 ? "atmosfera" : "atmosferas"
      }`
    : "Nenhuma atmosfera";

  return (
    <div className="visual-preset-browser">
      <label className="visual-preset-category-field">
        <span>Categoria</span>
        <select
          aria-label="Categoria de atmosfera"
          value={activeCategory?.id ?? ""}
          onChange={(event) => setActiveCategoryId(event.target.value)}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label} ({category.presets.length})
            </option>
          ))}
        </select>
        <small>{categorySummary}</small>
      </label>
      <div
        aria-label={
          activeCategory
            ? `Atmosferas em ${activeCategory.label}`
            : "Atmosferas"
        }
        className="visual-preset-grid"
        id={
          activeCategory
            ? `visual-preset-panel-${activeCategory.id}`
            : undefined
        }
        role="tabpanel"
      >
        {visiblePresets.map((preset) => {
          const selected = selectedScene.id === preset.id;
          return (
            <div
              className={`visual-preset-card ${selected ? "active" : ""}`}
              key={preset.id}
            >
              <button
                aria-label={`Selecionar atmosfera ${preset.name}`}
                aria-pressed={selected && !selectedScene.appliedVariantId}
                className="visual-preset-card-main"
                type="button"
                onClick={() => onSelectPreset(preset.id)}
              >
                <span className="visual-preset-card-head">
                  <span className="visual-preset-title">
                    <strong>{preset.name}</strong>
                    <small>{preset.family}</small>
                  </span>
                  {selected && !selectedScene.appliedVariantId ? (
                    <span className="visual-preset-selected">
                      <Check /> Ativo
                    </span>
                  ) : null}
                </span>
                <PresetSwatches colors={preset.colors} name={preset.name} />
                <span className="visual-preset-note">{preset.note}</span>
                <span className="visual-preset-meta">
                  <span>
                    <Gauge /> T{preset.performanceTier}
                  </span>
                  {preset.tags.slice(0, 3).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </span>
              </button>
              {preset.variants.length ? (
                <VariantPicker
                  appliedVariantId={
                    selected ? selectedScene.appliedVariantId : undefined
                  }
                  preset={preset}
                  onSelectVariant={onSelectVariant}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function groupPresetCategories(presets: ScenePresetV3[]): PresetCategory[] {
  const groups = new Map<string, PresetCategory>();
  for (const preset of presets) {
    const id = preset.categoryId || preset.category || "catalog";
    const current = groups.get(id) ?? {
      id,
      label: preset.category || id,
      presets: [],
    };
    current.presets.push(preset);
    groups.set(id, current);
  }
  return [...groups.values()];
}

function PresetSwatches({
  colors,
  name,
}: {
  colors: ScenePresetV3["colors"];
  name: string;
}) {
  return (
    <span
      aria-label={`Cores da atmosfera ${name}`}
      className="visual-preset-swatches"
    >
      {(["base", "effect", "light"] as const).map((key) => (
        <i
          aria-hidden="true"
          key={key}
          style={{ backgroundColor: colors[key] }}
        />
      ))}
    </span>
  );
}

function VariantPicker({
  appliedVariantId,
  preset,
  onSelectVariant,
}: {
  appliedVariantId?: string;
  preset: ScenePresetV3;
  onSelectVariant: (baseId: string, variantId: string) => void;
}) {
  return (
    <div
      aria-label={`Variantes de ${preset.name}`}
      className="visual-preset-variants"
    >
      {preset.variants.map((variant: VisualVariant) => {
        const active = appliedVariantId === variant.id;
        return (
          <button
            aria-label={`Aplicar variante ${variant.name} em ${preset.name}`}
            aria-pressed={active}
            className={active ? "active" : ""}
            key={variant.id}
            title={variant.note}
            type="button"
            onClick={() => onSelectVariant(preset.id, variant.id)}
          >
            {active ? <Check /> : <Palette />}
            {variant.name}
          </button>
        );
      })}
    </div>
  );
}
