import { Check, Gauge, Layers, Palette, Search, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { createSceneRuntime } from "../../shared/canvas-scene-runtime.mjs";
import {
  getVisualOrigin,
  VISUAL_COLLECTIONS,
  VISUAL_ORIGINS,
  type ScenePresetV3,
  type VisualVariant,
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

/** Coleções do preset, tolera presets antigos salvos antes das coleções. */
function presetCollections(preset: ScenePresetV3): string[] {
  return preset.collections ?? [];
}

function presetOriginId(preset: ScenePresetV3): string {
  return getVisualOrigin(preset.originId).id;
}

function presetRuntime(preset: ScenePresetV3): RuntimeFacet {
  if (CANVAS_RENDERER_IDS.has(preset.rendererId)) return "canvas";
  if (preset.rendererId.startsWith("paper-")) return "webgl2";
  return "webgl";
}

type FacetFilters = {
  runtime: RuntimeFacet[];
  tiers: number[];
  collections: string[];
  origins: string[];
};

function matchesFacetFilters(
  preset: ScenePresetV3,
  { runtime, tiers, collections, origins }: FacetFilters,
): boolean {
  if (runtime.length && !runtime.includes(presetRuntime(preset))) return false;
  if (tiers.length && !tiers.includes(preset.performanceTier)) return false;
  if (collections.length) {
    // Coleção é multi-membro: um preset casa se tiver QUALQUER coleção ativa.
    const owned = presetCollections(preset);
    if (!collections.some((id) => owned.includes(id))) return false;
  }
  if (origins.length && !origins.includes(presetOriginId(preset))) return false;
  return true;
}

/** "ThreeUI · MIT" — o porquê de o efeito existir, curto o bastante p/ tooltip. */
function presetOriginLabel(preset: ScenePresetV3): string {
  const origin = getVisualOrigin(preset.originId);
  return `${origin.label} · ${origin.license}`;
}

/**
 * Texto do selo. `inspired` não tem licença (o license é "—"), e um badge só com
 * um travessão não informa nada — a palavra é o que distingue "inspirado" de
 * "portado", que é justamente a distinção que importa.
 */
function originBadgeText(origin: { license: string; code: string }): string {
  if (origin.code === "inspired") return "inspirado";
  if (origin.code === "original") return "original";
  return origin.license;
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
  const [collectionFilter, setCollectionFilter] = useState<string[]>([]);
  const [originFilter, setOriginFilter] = useState<string[]>([]);

  useEffect(() => {
    setActiveCategoryId(selectedCategoryId);
  }, [selectedCategoryId]);

  // Um objeto só: as 5 dimensões de filtro crescem rápido e 5 parâmetros
  // posicionais viram armadilha de ordem.
  const filters: FacetFilters = {
    runtime: runtimeFilter,
    tiers: tierFilter,
    collections: collectionFilter,
    origins: originFilter,
  };

  const normalizedQuery = normalizeSearch(query);
  const searching = normalizedQuery.length > 0;
  const facetsActive =
    runtimeFilter.length > 0 ||
    tierFilter.length > 0 ||
    collectionFilter.length > 0 ||
    originFilter.length > 0;
  const searchResults = useMemo(
    () =>
      searching
        ? presets
            .filter(
              (preset) =>
                presetSearchText(preset).includes(normalizedQuery) &&
                matchesFacetFilters(preset, filters),
            )
            .sort(comparePresetsByName)
        : [],
    // `filters` é um objeto novo por render; o conteúdo é o que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      presets,
      normalizedQuery,
      searching,
      runtimeFilter,
      tierFilter,
      collectionFilter,
      originFilter,
    ],
  );

  const activeCategory =
    categories.find((category) => category.id === activeCategoryId) ??
    categories[0];
  const categoryPresets = useMemo(
    () =>
      (activeCategory?.presets ?? []).filter((preset) =>
        matchesFacetFilters(preset, filters),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCategory, runtimeFilter, tierFilter, collectionFilter, originFilter],
  );

  // Contagens vêm sempre da lista inteira, nunca do resultado filtrado: se
  // contassem sobre o recorte, ativar um chip zeraria os outros.
  const collectionCounts = useMemo(() => {
    const counts = new Map(VISUAL_COLLECTIONS.map((item) => [item.id, 0]));
    for (const preset of presets) {
      for (const id of presetCollections(preset)) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [presets]);
  const originCounts = useMemo(() => {
    const counts = new Map(Object.keys(VISUAL_ORIGINS).map((id) => [id, 0]));
    for (const preset of presets) {
      const id = presetOriginId(preset);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [presets]);

  const visiblePresets = searching ? searchResults : categoryPresets;
  const variantPreset = visiblePresets.find(
    (preset) => preset.id === selectedScene.id && preset.variants.length > 0,
  );

  // Proveniência do preset ATIVO (não do card sob o cursor): responde "por que
  // este efeito existe" sem depender de hover, que não existe no toque.
  const selectedOrigin = getVisualOrigin(selectedScene.originId);
  const selectedOriginCollections = presetCollections(selectedScene)
    .map((id) => VISUAL_COLLECTIONS.find((item) => item.id === id)?.label)
    .filter((label): label is string => Boolean(label));

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
  const toggleCollection = (id: string) =>
    setCollectionFilter((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const toggleOrigin = (id: string) =>
    setOriginFilter((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const clearFacets = () => {
    setRuntimeFilter([]);
    setTierFilter([]);
    setCollectionFilter([]);
    setOriginFilter([]);
  };

  // "Você está aqui": com os grupos colapsados, um filtro ativo precisa ficar
  // visível fora deles — senão o resultado some e não há causa à vista. É o que
  // torna colapsar os grupos seguro em vez de enganoso.
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    for (const id of runtimeFilter) {
      const facet = RUNTIME_FACETS.find((item) => item.id === id);
      chips.push({
        key: `runtime-${id}`,
        label: facet?.label ?? id,
        onRemove: () => toggleRuntime(id),
      });
    }
    for (const tier of tierFilter) {
      chips.push({
        key: `tier-${tier}`,
        label: `T${tier}`,
        onRemove: () => toggleTier(tier),
      });
    }
    for (const id of collectionFilter) {
      const collection = VISUAL_COLLECTIONS.find((item) => item.id === id);
      chips.push({
        key: `collection-${id}`,
        label: collection?.label ?? id,
        onRemove: () => toggleCollection(id),
      });
    }
    for (const id of originFilter) {
      const origin = getVisualOrigin(id);
      chips.push({
        key: `origin-${id}`,
        label: origin.label,
        onRemove: () => toggleOrigin(id),
      });
    }
    return chips;
  }, [runtimeFilter, tierFilter, collectionFilter, originFilter]);

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
      {facetsActive ? (
        <div
          aria-label="Filtros ativos"
          className="visual-preset-active-filters"
          role="group"
        >
          <span className="visual-preset-facet-label">Filtros</span>
          {activeFilterChips.map((chip) => (
            <button
              aria-label={`Remover filtro ${chip.label}`}
              className="visual-preset-chip active removable"
              key={chip.key}
              type="button"
              onClick={chip.onRemove}
            >
              {chip.label}
              <X aria-hidden="true" />
            </button>
          ))}
          <button
            className="visual-preset-facet-clear"
            type="button"
            onClick={clearFacets}
          >
            Limpar
          </button>
        </div>
      ) : null}
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
          const origin = getVisualOrigin(preset.originId);
          // A licença é o dado que o usuário não consegue deduzir do visual, e
          // só interessa quando a origem é de terceiros: 26 de 67 são
          // originais e um selo "Original" em 26 cards seria ruído.
          const isThirdParty = origin.code !== "original";
          const collectionLabels = presetCollections(preset)
            .map((id) => VISUAL_COLLECTIONS.find((c) => c.id === id)?.label)
            .filter(Boolean);
          const tooltip = [
            preset.name,
            collectionLabels.join(" · "),
            `${origin.label} · ${origin.license}`,
            preset.note,
          ]
            .filter(Boolean)
            .join("\n");
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
                {isThirdParty ? (
                  <span
                    className="visual-preset-thumb-badge license"
                    title={`${origin.label} · ${origin.license} — ${origin.holder}\n${origin.summary}`}
                  >
                    {originBadgeText(origin)}
                  </span>
                ) : null}
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
      {/*
        As 4 dimensões de filtro ficam ABAIXO da grade e colapsadas. Faceta é
        refinamento de um conjunto candidato: quem chega aqui primeiro quer ver
        as miniaturas, não escolher critérios antes de saber o que existe.
        Categoria fica acima porque é o ponto de entrada.

        Um disclosure por dimensão, e não um "Filtros" único: quatro rótulos
        colapsados dizem que existem quatro maneiras de filtrar, enquanto um
        bloco só esconde a própria existência do filtro por runtime ou origem.
      */}
      <div aria-label="Refinar resultados" className="visual-preset-refine">
        <FacetGroup activeCount={runtimeFilter.length} label="Runtime">
          {RUNTIME_FACETS.map((facet) => (
            <button
              aria-pressed={runtimeFilter.includes(facet.id)}
              className={`visual-preset-chip ${runtimeFilter.includes(facet.id) ? "active" : ""}`}
              key={facet.id}
              type="button"
              onClick={() => toggleRuntime(facet.id)}
            >
              {facet.label}
            </button>
          ))}
        </FacetGroup>
        <FacetGroup activeCount={tierFilter.length} label="Desempenho">
          {PERFORMANCE_TIERS.map((tier) => (
            <button
              aria-label={`Desempenho tier ${tier}`}
              aria-pressed={tierFilter.includes(tier)}
              className={`visual-preset-chip ${tierFilter.includes(tier) ? "active" : ""}`}
              key={tier}
              type="button"
              onClick={() => toggleTier(tier)}
            >
              T{tier}
            </button>
          ))}
        </FacetGroup>
        <FacetGroup activeCount={collectionFilter.length} label="Coleção">
          {VISUAL_COLLECTIONS.map((collection) => (
            <button
              aria-pressed={collectionFilter.includes(collection.id)}
              className={`visual-preset-chip ${collectionFilter.includes(collection.id) ? "active" : ""}`}
              key={collection.id}
              title={collection.summary}
              type="button"
              onClick={() => toggleCollection(collection.id)}
            >
              {collection.label}
              <span className="visual-preset-chip-count">
                {collectionCounts.get(collection.id) ?? 0}
              </span>
            </button>
          ))}
        </FacetGroup>
        <FacetGroup activeCount={originFilter.length} label="Origem">
          {Object.values(VISUAL_ORIGINS).map((origin) => (
            <button
              aria-pressed={originFilter.includes(origin.id)}
              className={`visual-preset-chip ${originFilter.includes(origin.id) ? "active" : ""}`}
              key={origin.id}
              title={`${origin.summary}${origin.url ? `\n${origin.url}` : ""}`}
              type="button"
              onClick={() => toggleOrigin(origin.id)}
            >
              {origin.label}
              <span className="visual-preset-chip-count">
                {originCounts.get(origin.id) ?? 0}
              </span>
            </button>
          ))}
        </FacetGroup>
      </div>
      {/*
        A linha de proveniência fica logo acima das variantes, colada ao
        resultado, e não junto dos filtros: descreve o preset escolhido, não
        um critério de busca.
      */}
      <div className="visual-preset-origin-row">
        <span className="visual-preset-origin-name">{selectedScene.name}</span>
        <span className="visual-preset-origin-badge">
          {originBadgeText(selectedOrigin)}
        </span>
        <span className="visual-preset-origin-meta">
          {selectedOrigin.label} · {selectedOrigin.holder}
        </span>
        {selectedOriginCollections.length ? (
          <span className="visual-preset-origin-collections">
            {selectedOriginCollections.join(" · ")}
          </span>
        ) : null}
        <span className="visual-preset-origin-why">
          {selectedOrigin.summary}
        </span>
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
  const origin = getVisualOrigin(preset.originId);
  const collectionText = presetCollections(preset).map(
    (id) => VISUAL_COLLECTIONS.find((item) => item.id === id)?.label ?? id,
  );
  return normalizeSearch(
    [
      preset.id,
      preset.name,
      preset.category,
      preset.family,
      preset.note,
      ...(preset.tags ?? []),
      // Coleção e origem também são buscáveis: "threeui" e "papagaio"
      // precisam achar o preset, senão a curadoria fica invisível na busca.
      ...collectionText,
      origin.label,
      origin.license,
      ...variantText,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * Uma dimensão de filtro em disclosure nativo: teclado, leitor de tela e
 * estado aberto/fechado saem de graça, sem portal nem focus trap.
 *
 * `<details>` não tem `defaultOpen` no React, só `open` — que é controlado e
 * reescreveria o estado a cada render, impedindo o usuário de recolher um
 * grupo que tem filtro ativo. Por isso o `open` é estado local que espelha o
 * toggle do navegador, e o grupo só abre sozinho na transição 0 -> 1 filtro.
 * O badge no summary cobre o caso de "recolhi com filtro dentro": o resultado
 * continua explicável.
 */
function FacetGroup({
  activeCount,
  children,
  label,
}: {
  activeCount: number;
  children: ReactNode;
  label: string;
}) {
  const [open, setOpen] = useState(activeCount > 0);
  const previousActiveCount = useRef(activeCount);
  useEffect(() => {
    if (previousActiveCount.current === 0 && activeCount > 0) setOpen(true);
    previousActiveCount.current = activeCount;
  }, [activeCount]);
  return (
    <details
      className="visual-preset-facet-group"
      data-active={activeCount > 0 ? "true" : undefined}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="visual-preset-facet-label">{label}</span>
        {activeCount > 0 ? (
          <span className="visual-preset-facet-badge">{activeCount}</span>
        ) : null}
      </summary>
      <div className="visual-preset-facets">{children}</div>
    </details>
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
