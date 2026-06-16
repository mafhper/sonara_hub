import { Check, Gauge, Layers, Palette } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

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
  // Variants render in a dedicated row below the grid for whichever preset is
  // selected — keeping every card uniform instead of stretching one card with a
  // tall column of variant buttons.
  const variantPreset = visiblePresets.find(
    (preset) => preset.id === selectedScene.id && preset.variants.length > 0,
  );

  return (
    <div className="visual-preset-browser">
      <div
        aria-label="Categoria de atmosfera"
        className="visual-preset-chips"
        role="tablist"
      >
        {categories.map((category) => {
          const active = category.id === activeCategory?.id;
          return (
            <button
              aria-controls={`visual-preset-panel-${category.id}`}
              aria-selected={active}
              className={`visual-preset-chip ${active ? "active" : ""}`}
              key={category.id}
              role="tab"
              type="button"
              onClick={() => setActiveCategoryId(category.id)}
            >
              {category.label}
              <span className="visual-preset-chip-count">
                {category.presets.length}
              </span>
            </button>
          );
        })}
      </div>
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
          const tooltip = [preset.name, preset.family, preset.note]
            .filter(Boolean)
            .join(" · ");
          return (
            <button
              aria-label={`Selecionar atmosfera ${preset.name}`}
              aria-pressed={selected}
              className={`visual-preset-card ${selected ? "active" : ""}`}
              key={preset.id}
              title={tooltip}
              type="button"
              onClick={() => onSelectPreset(preset.id)}
            >
              <PresetThumb colors={preset.colors} name={preset.name}>
                {preset.variants.length ? (
                  <span className="visual-preset-thumb-badge variants">
                    <Layers /> {preset.variants.length}
                  </span>
                ) : null}
                {selected ? (
                  <span className="visual-preset-thumb-badge active">
                    <Check />
                  </span>
                ) : (
                  <span className="visual-preset-thumb-badge">
                    <Gauge /> T{preset.performanceTier}
                  </span>
                )}
              </PresetThumb>
              <span className="visual-preset-name">{preset.name}</span>
            </button>
          );
        })}
      </div>
      {variantPreset ? (
        <div className="visual-preset-variants-row">
          <span className="visual-preset-variants-label">
            Variações · {variantPreset.name}
          </span>
          <VariantPicker
            appliedVariantId={selectedScene.appliedVariantId}
            preset={variantPreset}
            onSelectVariant={onSelectVariant}
          />
        </div>
      ) : null}
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

function PresetThumb({
  colors,
  name,
  children,
}: {
  colors: ScenePresetV3["colors"];
  name: string;
  children?: ReactNode;
}) {
  return (
    <span
      aria-label={`Cores da atmosfera ${name}`}
      className="visual-preset-thumb"
      style={{
        backgroundImage: `radial-gradient(120% 120% at 78% 18%, ${colors.light} 0%, transparent 58%), linear-gradient(150deg, ${colors.base} 0%, ${colors.effect} 62%, ${colors.light} 100%)`,
      }}
    >
      {children}
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
