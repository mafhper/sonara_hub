import { Check, Gauge, Layers, Palette, Search } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { createSceneRuntime } from "../../shared/canvas-scene-runtime.mjs";
import type {
  ScenePresetV3,
  VisualVariant,
} from "../../shared/visual-effects.mjs";

const PREVIEW_HOVER_DELAY_MS = 140;

type PresetCategory = {
  id: string;
  label: string;
  presets: ScenePresetV3[];
};

type RuntimeFacet = "canvas" | "webgl" | "webgl2";

const RUNTIME_FACETS: { id: RuntimeFacet; label: string }[] = [
  { id: "canvas", label: "Canvas" },
  { id: "webgl", label: "WebGL" },
  { id: "webgl2", label: "WebGL2" },
];

const CANVAS_RENDERER_IDS = new Set<string>([
  "vector-aura",
  "playful-shapes",
  "piano-ribbons",
  "predictive-arc",
  "data-pixel-arc",
  "signal-particles",
  "override-grid",
]);

const PERFORMANCE_TIERS = [1, 2, 3];

function presetRuntime(preset: ScenePresetV3): RuntimeFacet {
  if (CANVAS_RENDERER_IDS.has(preset.rendererId)) return "canvas";
  if (preset.rendererId.startsWith("paper-")) return "webgl2";
  return "webgl";
}

function matchesFacetFilters(
  preset: ScenePresetV3,
  runtimeFilter: RuntimeFacet[],
  tierFilter: number[],
): boolean {
  if (runtimeFilter.length && !runtimeFilter.includes(presetRuntime(preset)))
    return false;
  if (tierFilter.length && !tierFilter.includes(preset.performanceTier))
    return false;
  return true;
}

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
  const [runtimeFilter, setRuntimeFilter] = useState<RuntimeFacet[]>([]);
  const [tierFilter, setTierFilter] = useState<number[]>([]);

  useEffect(() => {
    setActiveCategoryId(selectedCategoryId);
  }, [selectedCategoryId]);

  const normalizedQuery = normalizeSearch(query);
  const searching = normalizedQuery.length > 0;
  const facetsActive = runtimeFilter.length > 0 || tierFilter.length > 0;
  const searchResults = useMemo(
    () =>
      searching
        ? presets
            .filter(
              (preset) =>
                presetSearchText(preset).includes(normalizedQuery) &&
                matchesFacetFilters(preset, runtimeFilter, tierFilter),
            )
            .sort(comparePresetsByName)
        : [],
    [presets, normalizedQuery, searching, runtimeFilter, tierFilter],
  );

  const activeCategory =
    categories.find((category) => category.id === activeCategoryId) ??
    categories[0];
  const categoryPresets = useMemo(
    () =>
      (activeCategory?.presets ?? []).filter((preset) =>
        matchesFacetFilters(preset, runtimeFilter, tierFilter),
      ),
    [activeCategory, runtimeFilter, tierFilter],
  );
  const visiblePresets = searching ? searchResults : categoryPresets;
  const variantPreset = visiblePresets.find(
    (preset) => preset.id === selectedScene.id && preset.variants.length > 0,
  );

  const toggleRuntime = (id: RuntimeFacet) =>
    setRuntimeFilter((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const toggleTier = (tier: number) =>
    setTierFilter((current) =>
      current.includes(tier)
        ? current.filter((item) => item !== tier)
        : [...current, tier],
    );
  const clearFacets = () => {
    setRuntimeFilter([]);
    setTierFilter([]);
  };

  const previewRuntimeRef = useRef<
    ReturnType<typeof createSceneRuntime> | undefined
  >(undefined);
  const previewCanvasElRef = useRef<HTMLCanvasElement | null>(null);
  const previewBrokenRef = useRef(false);
  const previewTimerRef = useRef<number | null>(null);
  const [hoveredPreview, setHoveredPreview] = useState<{
    preset: ScenePresetV3;
    button: HTMLButtonElement;
  } | null>(null);

  const clearPreviewTimer = () => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!hoveredPreview || previewBrokenRef.current) return undefined;
    const thumb = hoveredPreview.button.querySelector(".visual-preset-thumb");
    if (!thumb) return undefined;
    let canvas = previewCanvasElRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "visual-preset-preview";
      canvas.setAttribute("aria-hidden", "true");
      previewCanvasElRef.current = canvas;
    }
    // O canvas vive DENTRO do card: rola junto e nunca "desgruda" do ponteiro.
    if (canvas.parentElement !== thumb) thumb.appendChild(canvas);
    let runtime = previewRuntimeRef.current;
    try {
      if (!runtime) {
        runtime = createSceneRuntime(canvas, hoveredPreview.preset, {});
        previewRuntimeRef.current = runtime;
      } else {
        runtime.setScene(hoveredPreview.preset);
      }
    } catch {
      previewBrokenRef.current = true;
      canvas.remove();
      return undefined;
    }
    const scale = Math.min(1.5, window.devicePixelRatio || 1);
    runtime.resize(
      canvas.clientWidth * scale || 124 * scale,
      canvas.clientHeight * scale || 56 * scale,
    );
    // Primeiro frame síncrono: evita exibir o frame do preset anterior.
    runtime.render(0);
    let frame = 0;
    const started = performance.now();
    const draw = () => {
      runtime.render((performance.now() - started) / 1000);
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      canvas.remove();
    };
  }, [hoveredPreview]);

  useEffect(
    () => () => {
      clearPreviewTimer();
      previewRuntimeRef.current?.destroy();
      previewRuntimeRef.current = undefined;
      previewCanvasElRef.current?.remove();
      previewCanvasElRef.current = null;
    },
    [],
  );

  // Rolar com o ponteiro parado NÃO dispara pointerleave; escondemos o preview
  // em qualquer scroll/wheel/resize (fase de captura, pega todo container).
  useEffect(() => {
    if (!hoveredPreview) return undefined;
    const hide = () => setHoveredPreview(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("wheel", hide, { passive: true });
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("wheel", hide);
      window.removeEventListener("resize", hide);
    };
  }, [hoveredPreview]);

  const handlePreviewEnter = (
    currentTarget: HTMLButtonElement,
    preset: ScenePresetV3,
  ) => {
    clearPreviewTimer();
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      if (!currentTarget.isConnected) return;
      setHoveredPreview({ preset, button: currentTarget });
    }, PREVIEW_HOVER_DELAY_MS);
  };
  const handlePreviewLeave = () => {
    clearPreviewTimer();
    setHoveredPreview(null);
  };

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
      <div
        aria-label="Filtros de atmosfera"
        className="visual-preset-facets"
        role="group"
      >
        <span className="visual-preset-facet-label">Runtime</span>
        {RUNTIME_FACETS.map((facet) => {
          const active = runtimeFilter.includes(facet.id);
          return (
            <button
              aria-pressed={active}
              className={`visual-preset-chip ${active ? "active" : ""}`}
              key={facet.id}
              type="button"
              onClick={() => toggleRuntime(facet.id)}
            >
              {facet.label}
            </button>
          );
        })}
        <span className="visual-preset-facet-label">Desempenho</span>
        {PERFORMANCE_TIERS.map((tier) => {
          const active = tierFilter.includes(tier);
          return (
            <button
              aria-label={`Desempenho tier ${tier}`}
              aria-pressed={active}
              className={`visual-preset-chip ${active ? "active" : ""}`}
              key={tier}
              type="button"
              onClick={() => toggleTier(tier)}
            >
              T{tier}
            </button>
          );
        })}
        {facetsActive ? (
          <button
            className="visual-preset-facet-clear"
            type="button"
            onClick={clearFacets}
          >
            Limpar
          </button>
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
        onScroll={handlePreviewLeave}
      >
        {visiblePresets.length === 0 ? (
          <p className="visual-preset-empty">
            {searching
              ? `Nenhuma atmosfera encontrada para “${query.trim()}”.`
              : facetsActive
                ? "Nenhuma atmosfera corresponde a estes filtros."
                : "Nenhuma atmosfera nesta categoria."}
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
              onBlur={handlePreviewLeave}
              onClick={() => onSelectPreset(preset.id)}
              onFocus={(event) =>
                handlePreviewEnter(event.currentTarget, preset)
              }
              onPointerEnter={(event) =>
                handlePreviewEnter(event.currentTarget, preset)
              }
              onPointerLeave={handlePreviewLeave}
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
  for (const group of groups.values()) {
    group.presets.sort(comparePresetsByName);
  }
  return [...groups.values()];
}

function comparePresetsByName(a: ScenePresetV3, b: ScenePresetV3): number {
  return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
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
