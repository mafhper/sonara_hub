import { Check, Gauge, Layers, Palette, Search } from "lucide-react";
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
  const [query, setQuery] = useState("");

  useEffect(() => {
    setActiveCategoryId(selectedCategoryId);
  }, [selectedCategoryId]);

  const normalizedQuery = normalizeSearch(query);
  const searching = normalizedQuery.length > 0;
  const searchResults = useMemo(
    () =>
      searching
        ? presets.filter((preset) =>
            presetSearchText(preset).includes(normalizedQuery),
          )
        : [],
    [presets, normalizedQuery, searching],
  );

  const activeCategory =
    categories.find((category) => category.id === activeCategoryId) ??
    categories[0];
  const visiblePresets = searching
    ? searchResults
    : (activeCategory?.presets ?? []);
  const variantPreset = visiblePresets.find(
    (preset) => preset.id === selectedScene.id && preset.variants.length > 0,
  );

  return (
    <div className="visual-preset-browser">
      <div className="visual-preset-search" role="search">
        <Search aria-hidden="true" className="visual-preset-search-icon" />
        <input
          aria-label="Buscar atmosferas por nome ou tag"
          className="visual-preset-search-input"
          placeholder="Buscar por nome ou tag…"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {searching ? (
          <span className="visual-preset-search-count" role="status">
            {searchResults.length}{" "}
            {searchResults.length === 1 ? "resultado" : "resultados"}
          </span>
        ) : null}
      </div>
      {!searching ? (
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
      ) : null}
      <div
        aria-label={
          searching
            ? "Resultados da busca"
            : activeCategory
              ? `Atmosferas em ${activeCategory.label}`
              : "Atmosferas"
        }
        className="visual-preset-grid"
        id={
          !searching && activeCategory
            ? `visual-preset-panel-${activeCategory.id}`
            : undefined
        }
        role="tabpanel"
      >
        {visiblePresets.length === 0 ? (
          <p className="visual-preset-empty">
            Nenhuma atmosfera encontrada para “{query.trim()}”.
          </p>
        ) : null}
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

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function presetSearchText(preset: ScenePresetV3): string {
  const variantText = (preset.variants ?? [])
    .flatMap((variant: VisualVariant) => [
      variant.name,
      ...(variant.tags ?? []),
    ])
    .filter(Boolean);
  return normalizeSearch(
    [
      preset.id,
      preset.name,
      preset.category,
      preset.family,
      preset.note,
      ...(preset.tags ?? []),
      ...variantText,
    ]
      .filter(Boolean)
      .join(" "),
  );
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
