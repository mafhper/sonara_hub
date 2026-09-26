import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ATMOSPHERE_BASE_LAYER_ID,
  ATMOSPHERE_EXTRA_LAYER_ID,
  atmosphereLayerIdFromStackItem,
  atmosphereStackPerformance,
  builtinPresetMap,
  builtinVisualPresets,
  countPresetsByCollection,
  countPresetsByOrigin,
  effectIds,
  getVisualCollection,
  getVisualOrigin,
  normalizeAtmosphereBlendMode,
  normalizeAtmosphereLayers,
  normalizeVisualPresetList,
  normalizeVisualSettings,
  parseVisualCollection,
  PRESET_COLLECTIONS,
  PRESET_ORIGIN_OVERRIDES,
  resolveAtmosphereLayers,
  removedEffectIds,
  VISUAL_COLLECTIONS,
  VISUAL_ORIGINS,
  VISUAL_SCHEMA_VERSION,
  visualCommonControlKeys,
  visualPostDefaults,
  visualUniforms,
} from "../shared/visual-effects.mjs";

import {
  paperShaderDefinitions,
  paperShaderPresetCount,
} from "../shared/paper-shaders.mjs";
import { sceneRuntimeHasRenderer } from "../shared/canvas-scene-runtime.mjs";

test("visual settings reject non-object JSON and bound custom variants", () => {
  assert.doesNotThrow(() => normalizeVisualSettings(null));
  assert.doesNotThrow(() =>
    normalizeVisualSettings({ visualSettings: "null" }),
  );
  const visual = normalizeVisualSettings({
    source: "custom",
    variants: Array.from({ length: 5000 }, (_, index) => ({
      id: `variant-${index}`,
    })),
  });
  assert.equal(visual.variants.length, 64);
});

const expectedIds = [
  "liquid-mesh",
  "volumetric-clouds",
  "aurora-ribbons",
  "vector-aura",
  "playful-shapes",
  "color-mesh",
  "piano-ribbons",
  "vinyl",
  "audio-dark",
  "plasma-nebula",
  "plasma-lava",
  "lava-lamp",
  "vortex-whirlpool",
  "vortex-galaxy",
  "starfield",
  "iridescent-bloom",
  "ether-birth",
  "fluid-volume",
  "endless-shallows",
  "storybook-dream",
  "liquid-chrome",
  "stratosphere-flight",
  "shambhala-passage",
  "neural-haze",
  "light-trails",
  "holo-topography",
  "fractal-sphere",
  "fluid-flow",
  "terrain-magic",
  "terrain-flight",
  "predictive-arc",
  "data-pixel-arc",
  "ribbon-field",
  "signal-particles",
  "override-grid",
  "void-field",
  "halftone-flow",
  "amber-halftone",
  "laser",
  ...paperShaderDefinitions.map((definition) => definition.rendererId),
];

test("catalog exposes the broad families plus the ported shader presets", () => {
  assert.equal(VISUAL_SCHEMA_VERSION, 5);
  assert.deepEqual(effectIds, expectedIds);
  assert.deepEqual(
    builtinVisualPresets.map((preset) => preset.id),
    expectedIds,
  );
  assert.ok(removedEffectIds.includes("fire"));
  assert.ok(removedEffectIds.includes("rain-window"));
  assert.ok(removedEffectIds.includes("volumetric-clouds-dawn"));
  assert.equal(new Set(expectedIds).size, builtinVisualPresets.length);
});

// ---------------------------------------------------------------------------
// SH9C — coleções curadas e proveniência
// ---------------------------------------------------------------------------

test("toda coleção curada tem rótulo, resumo e id único", () => {
  assert.ok(VISUAL_COLLECTIONS.length >= 5);
  const ids = VISUAL_COLLECTIONS.map((collection) => collection.id);
  assert.equal(new Set(ids).size, ids.length, "ids de coleção duplicados");
  for (const collection of VISUAL_COLLECTIONS) {
    assert.ok(collection.label.trim(), `coleção ${collection.id} sem rótulo`);
    assert.ok(collection.summary.trim(), `coleção ${collection.id} sem resumo`);
    assert.match(collection.id, /^[a-z0-9-]+$/);
  }
});

test("nenhum preset fica fora das coleções (curadoria sem órfãos)", () => {
  const orphans = builtinVisualPresets.filter(
    (preset) => !preset.collections.length,
  );
  assert.deepEqual(
    orphans.map((preset) => preset.id),
    [],
    "presets sem nenhuma coleção — adicionar a curadoria em PRESET_COLLECTIONS",
  );
});

test("curadoria referencia só coleções e presets que existem", () => {
  const known = new Set(builtinVisualPresets.map((preset) => preset.id));
  const collectionIds = new Set(VISUAL_COLLECTIONS.map((item) => item.id));
  const stale = Object.keys(PRESET_COLLECTIONS).filter((id) => !known.has(id));
  assert.deepEqual(stale, [], "chaves mortas em PRESET_COLLECTIONS");
  for (const [id, collections] of Object.entries(PRESET_COLLECTIONS)) {
    for (const collection of collections) {
      assert.ok(
        collectionIds.has(collection),
        `${id} aponta para coleção inexistente "${collection}"`,
      );
    }
    assert.equal(
      new Set(collections).size,
      collections.length,
      `${id} repete a mesma coleção`,
    );
  }
});

test("as contagens por coleção batem com a curadoria declarada", () => {
  const counts = countPresetsByCollection(builtinVisualPresets);
  const expected = new Map(VISUAL_COLLECTIONS.map((item) => [item.id, 0]));
  for (const preset of builtinVisualPresets) {
    for (const id of preset.collections) expected.set(id, expected.get(id) + 1);
  }
  assert.deepEqual(
    [...counts.entries()].sort(),
    [...expected.entries()].sort(),
  );
  // Coleção vazia não deve aparecer como chip: seria um filtro sem resultado.
  for (const [id, count] of counts) {
    assert.ok(count > 0, `coleção "${id}" está vazia`);
  }
});

test("proveniência deriva a origem real de cada preset", () => {
  const counts = Object.fromEntries(countPresetsByOrigin(builtinVisualPresets));
  // Distribuição travada de propósito: a origem vem de regra
  // (rendererId/family) com 4 exceções explícitas. Se um preset novo entrar
  // sem revisar a regra, este número muda e o teste pede revisão.
  // 2026-09-25: threeui 8 → 12 com a família `laser` (SH11); depois 12 → 9
  // quando as 4 variantes viraram UM preset com 4 variações (`laser`).
  assert.deepEqual(counts, {
    sonara: 26,
    "paper-shaders": 29,
    threeui: 9,
    lumen: 1,
    inspired: 3,
  });
});

test("o runtime escreve todos os params que o prelude declara (u_param0..N)", () => {
  // Regressão real (SH11), quatro vezes: o limite de 6 params aparecia em
  // quatro lugares independentes — declaração no prelude, tamanho do array em
  // `visualUniforms`, tamanho do array em `buildUniforms` (o JS do runtime) e o
  // `for` que escreve cada uniform. Cada um destes sozinho produzia o mesmo
  // modo de falha SILENCIOSO: o control aparece no inspector, o uniform existe,
  // e nada acontece. A rotação media exatamente 0.0000 de diferença.
  //
  // Este teste amarra as pontas: se qualquer um dos quatro divergir, ele falha.
  const laser = builtinVisualPresets.find(
    (preset) => preset.family === "laser",
  );
  // Conta `advanced`, não `controls`: `controls` é a camada de UI e pode ter
  // menos entradas (o laser esconde `variant`, que o picker escolhe).
  const params = Object.keys(laser.advanced).length;
  assert.ok(
    params >= 7,
    `o laser usa ${params} params; se subir, os quatro pontos precisam subir juntos`,
  );
  // O array posicional precisa ter lugar para todos.
  const uniforms = visualUniforms(normalizeVisualSettings(laser));
  assert.ok(
    uniforms.advanced.length >= params,
    `o array de uniforms (${uniforms.advanced.length}) não comporta ${params} params`,
  );
  // E o runtime precisa ter o renderer (o resto é verificado compilando GLSL
  // no probe `provar-controles.mjs`, que é o que pega a divergência de verdade).
  assert.ok(sceneRuntimeHasRenderer(laser.rendererId));
  // A lista de nomes de uniform do runtime precisa cobrir todos os params que o
  // shader declara. Esta é a QUARTA ocorrência do limite de 6 — as outras três
  // (prelude, array em visualUniforms, array em buildUniforms) o teste acima
  // cobre; esta verificação cala a boca no teste unitário. A divergência real
  // desta só aparece compilando GLSL, que é o probe.
  const runtimeSource = readFileSync(
    fileURLToPath(
      new URL("../shared/canvas-scene-runtime.mjs", import.meta.url),
    ),
    "utf8",
  );
  const declared = [
    ...runtimeSource.matchAll(/uniform float u_param(\d+);/g),
  ].map((m) => Number(m[1]));
  const maxDeclared = Math.max(...declared);
  const collected = [...runtimeSource.matchAll(/"param(\d+)",/g)].map((m) =>
    Number(m[1]),
  );
  for (let i = 0; i <= maxDeclared; i += 1) {
    assert.ok(
      collected.includes(i),
      `u_param${i} é declarado no shader mas não está na lista de nomes do runtime — o uniform nunca é escrito (controle decorativo)`,
    );
  }
});

test("a variação escolhida manda no preset (cores e advanced), preservando o resto", () => {
  // Regressão real (SH11): o picker de variações do laser não fazia nada. O
  // merge era `source.advanced ?? variant.advanced` e o preset TEM advanced
  // próprio, então a variante era sempre ignorada — as 4 variações renderizavam
  // a mesma, sem erro. Corrigido para mesclar por chave, com a variante
  // prevalecendo (ela é a escolha do usuário).
  const laser = builtinVisualPresets.find(
    (preset) => preset.family === "laser",
  );
  const seenVariants = new Set();
  const seenColors = new Set();
  for (const variant of laser.variants) {
    const applied = normalizeVisualSettings({
      ...laser,
      appliedVariantId: variant.id,
    });
    assert.equal(
      applied.advanced.variant,
      variant.advanced.variant,
      `${variant.id}: a variação tem de escolher o ramo do shader`,
    );
    assert.equal(applied.colors.effect, variant.colors.effect, variant.id);
    // As chaves que a variação NÃO declara (o posicionamento) sobrevivem do base.
    assert.equal(
      applied.advanced.offsetX,
      50,
      `${variant.id} perdeu o offsetX`,
    );
    assert.equal(
      applied.advanced.rotation,
      50,
      `${variant.id} perdeu o rotation`,
    );
    seenVariants.add(applied.advanced.variant);
    seenColors.add(applied.colors.effect);
  }
  assert.equal(
    seenVariants.size,
    4,
    "as 4 variações precisam cair em ramos distintos",
  );
  assert.equal(
    seenColors.size,
    4,
    "as 4 variações precisam ter cores distintas",
  );
});

test("todo control de todo preset existe em `advanced` (o mapeamento u_paramN)", () => {
  // `u_paramN` é a Nª chave de `advanced`; `controls` é só a camada de UI e
  // pode ter MENOS entradas (o laser esconde `variant`). Se um control
  // apontar para uma chave que não existe em `advanced`, o uniform recebe
  // `undefined` e o slider não faz nada — silenciosamente.
  for (const preset of builtinVisualPresets) {
    for (const control of preset.controls) {
      assert.ok(
        Object.hasOwn(preset.advanced, control.key),
        `${preset.id}: control "${control.key}" não existe em advanced`,
      );
    }
  }
});

test("controles que o shader não lê são um problema de catálogo, não de UI", () => {
  // Um control só é real se o `u_paramN` correspondente é lido pelo fragment
  // shader. Medido em 2026-09-25: 0 controles inertes nos 39 presets WebGL de
  // `src/`, então isto é uma trava de regressão, não uma correção pendente.
  // A verificação real (compilando GLSL) está em
  // `.dev/tasks/active/laser-collection/probes/controles-inertes.mjs`.
  const runtimeSource = readFileSync(
    fileURLToPath(
      new URL("../shared/canvas-scene-runtime.mjs", import.meta.url),
    ),
    "utf8",
  );
  const readShader = (rendererId) => {
    if (rendererId.startsWith("paper-")) return null;
    const at = runtimeSource.indexOf(
      `  ${JSON.stringify(rendererId)}: \`\${shaderPrelude}`,
    );
    if (at < 0) return null;
    const start = runtimeSource.indexOf("`", at) + 1;
    return runtimeSource.slice(start, runtimeSource.indexOf("`", start));
  };
  for (const preset of builtinVisualPresets) {
    const body = readShader(preset.rendererId);
    if (!body) continue; // Canvas 2D não usa u_paramN
    preset.controls.forEach((control, index) => {
      const advancedKeys = Object.keys(preset.advanced);
      const position = advancedKeys.indexOf(control.key);
      assert.ok(
        body.includes(`u_param${position}`),
        `${preset.id}: control "${control.key}" ocupa u_param${position}, que o shader não lê — controle decorativo`,
      );
    });
  }
});

test("o laser é UM preset com 4 variações e controle de posicionamento", () => {
  const laser = builtinVisualPresets.find(
    (preset) => preset.family === "laser",
  );
  assert.ok(laser, "deve existir um preset da família laser");
  // UM preset, não quatro: as quatro são o mesmo efeito (feixe/elemento central)
  // com geometria diferente, então são variações (como os Paper Shaders), não
  // presets separados. Consolidar reduz o ruído da lista e expõe o picker de
  // variações, que já existe na UI.
  assert.equal(laser.id, "laser");
  assert.equal(laser.rendererId, "laser");
  assert.equal(laser.originId, "threeui", laser.id);
  assert.ok(laser.collections.includes("dados"), laser.id);
  assert.ok(laser.collections.includes("luz"), laser.id);
  assert.equal(laser.common.audioReaction, 0, "reação musical default 0");

  // As 4 variações, cada uma apontando para um ramo distinto do shader.
  assert.equal(laser.variants.length, 4);
  assert.deepEqual(
    laser.variants.map((v) => v.id),
    ["blade", "array", "prism", "relay"],
  );
  assert.deepEqual(
    laser.variants.map((v) => v.advanced.variant),
    [0, 1, 2, 3],
  );

  // `variant` é a PRIMEIRA chave de `advanced` (define u_param0) e a ordem
  // inteira é fixa: os params de posicionamento vêm depois de size/length/density.
  assert.deepEqual(Object.keys(laser.advanced), [
    "variant",
    "size",
    "length",
    "density",
    "offsetX",
    "offsetY",
    "rotation",
  ]);

  // `variant` NÃO é um control: a escolha é do picker de variações do browser.
  // Um slider aqui duplicaria a escolha e, pior, a variação mescla por cima a
  // cada normalização — então ele pareceria vivo e não faria nada.
  assert.ok(
    !laser.controls.some((c) => c.key === "variant"),
    "variant não deve ser um control: a variação é escolhida pelo picker",
  );
  // E `controls` pode legitimamente ter MENOS entradas que `advanced` — o
  // mapeamento u_paramN é pela ordem de `advanced`, não de `controls`. Se um
  // preset esconder um control, nenhum param pode se deslocar.
  const advancedKeys = Object.keys(laser.advanced);
  for (const control of laser.controls) {
    const position = advancedKeys.indexOf(control.key);
    assert.ok(
      position >= 0,
      `control "${control.key}" não existe em advanced — mapeamento quebrado`,
    );
  }

  // Controle de posicionamento do elemento central: no upstream isso vinha do
  // mouse (u_pointer, não-determinístico); aqui é determinístico e ajustável.
  for (const key of ["offsetX", "offsetY", "rotation"]) {
    assert.equal(laser.advanced[key], 50, `${key} deveria começar centrado`);
    assert.ok(
      laser.controls.some((c) => c.key === key),
      `${key} precisa de um control visível no inspector`,
    );
  }
});

test("os params de posicionamento do laser chegam ao shader", () => {
  // Declarar o param não basta: ele tem que sobreviver à normalização e chegar
  // ao array posicional de uniforms. É o mesmo caminho que o `variant` percorre.
  const laser = builtinVisualPresets.find(
    (preset) => preset.family === "laser",
  );
  assert.ok(laser, "preset laser presente");
  assert.ok(
    sceneRuntimeHasRenderer(laser.rendererId),
    "o runtime precisa ter o renderer 'laser'",
  );
  const uniforms = visualUniforms(normalizeVisualSettings(laser));
  assert.equal(uniforms.rendererId, "laser");
  assert.ok(Array.isArray(uniforms.advanced));
  assert.ok(
    uniforms.advanced.length >= 7,
    `os 7 params precisam chegar ao shader (veio ${uniforms.advanced.length})`,
  );
});

test("todo preset com shader tem renderer registrado (fallback genérico não é bug)", () => {
  // Regressão real (SH11): os 4 presets do laser nasceram com rendererId = id
  // ("laser-blade") enquanto o shader estava registrado só como "laser".
  // `fragmentShaders[id]` dava undefined → o runtime caía no `else` genérico
  // (drawDarkSurface) e o smoke "passava" renderizando 4 superfícies
  // genéricas IGUAIS, sem erro. O teste de introspecção transforma esse erro
  // invisível em falha de CI.
  //
  // Distinção necessária: `sceneRuntimeHasRenderer === false` significa
  // "cai no fallback de fundo liso", que é intencional para presets como
  // `audio-dark`. O que NÃO pode acontecer é um preset que pede um shader de
  // verdade (tem `advanced` não-trivial e family que exige renderer) ficar sem
  // registro. O laser é o caso: exige shader dedicado para não virar fundo.
  const requiresDedicatedRenderer = (preset) =>
    preset.family === "laser" ||
    preset.family === "predictive-arc" ||
    preset.family === "terrain" ||
    preset.family === "fluid-volume";
  for (const preset of builtinVisualPresets) {
    if (!requiresDedicatedRenderer(preset)) continue;
    assert.ok(
      sceneRuntimeHasRenderer(preset.rendererId),
      `${preset.id} (rendererId=${preset.rendererId}) exige renderer dedicado mas não tem — cairia no fallback de fundo liso e renderizaria uma superfície genérica`,
    );
  }
});

test("os presets de laser apontam para o mesmo renderer, com variantes distintas", () => {
  const laser = builtinVisualPresets.filter((p) => p.family === "laser");
  const rendererIds = new Set(laser.map((p) => p.rendererId));
  assert.deepEqual(
    [...rendererIds],
    ["laser"],
    "um único renderer compartilhado",
  );
  // E o mapa do runtime tem que ter essa chave.
  assert.ok(
    sceneRuntimeHasRenderer("laser"),
    "o runtime precisa ter o renderer 'laser'",
  );
});

test("toda origem declara licença, titular e se houve port de código", () => {
  const codeKinds = new Set(["ported", "inspired", "original"]);
  for (const [id, origin] of Object.entries(VISUAL_ORIGINS)) {
    assert.equal(origin.id, id);
    assert.ok(origin.label.trim(), `${id} sem rótulo`);
    assert.ok(origin.license.trim(), `${id} sem licença`);
    assert.ok(origin.holder.trim(), `${id} sem titular`);
    assert.ok(origin.summary.trim(), `${id} sem resumo`);
    assert.ok(codeKinds.has(origin.code), `${id} com code "${origin.code}"`);
    // "inspirado" nunca pode virar "portado": é a distinção legal que importa.
    if (origin.code === "inspired") {
      assert.equal(
        origin.license,
        "—",
        `${id} não pode declarar licença concreta`,
      );
    }
  }
});

test("exceções de origem apontam para origens existentes e são intencionais", () => {
  for (const [id, originId] of Object.entries(PRESET_ORIGIN_OVERRIDES)) {
    assert.ok(
      builtinPresetMap.has(id),
      `PRESET_ORIGIN_OVERRIDES cita preset inexistente "${id}"`,
    );
    assert.ok(
      Object.hasOwn(VISUAL_ORIGINS, originId),
      `${id} aponta para origem inexistente "${originId}"`,
    );
  }
  // A regra por família não pode esconder predefinição: o preset `predictive-arc`
  // não declara `family` e cai no fallback para o rendererId.
  assert.equal(
    builtinPresetMap.get("predictive-arc").originId,
    "threeui",
    "o fallback de family=|rendererId classificou predictive-arc como sonara",
  );
});

test("a família dot-grid-arc-field inteira é da origem ThreeUI e mora em Dados", () => {
  const family = builtinVisualPresets.filter(
    (preset) => preset.family === "predictive-arc",
  );
  assert.equal(family.length, 8);
  for (const preset of family) {
    assert.equal(preset.originId, "threeui", preset.id);
    // Só a presença em "dados" é invariante; coleções secundárias são curadoria.
    assert.ok(
      preset.collections.includes("dados"),
      `${preset.id} fora de "dados"`,
    );
  }
});

test("lookup de origem e coleção degrada sem lançar", () => {
  assert.equal(getVisualOrigin("paper-shaders").license, "Apache-2.0");
  assert.equal(getVisualOrigin("inexistente").id, "sonara");
  assert.equal(getVisualOrigin(undefined).id, "sonara");
  assert.equal(getVisualCollection("dados").label, "Dados");
  assert.equal(getVisualCollection("inexistente"), undefined);
});

test("coleções inválidas são descartadas ao normalizar presets custom", () => {
  const base = builtinPresetMap.get("starfield");
  const custom = normalizeVisualSettings({
    ...base,
    id: "meu-starfield",
    source: "custom",
    collections: ["espaco", "colecao-que-nao-existe", "espaco", "dados"],
  });
  assert.deepEqual(
    custom.collections,
    ["espaco", "dados"],
    "deduplicou e validou",
  );
  // Sem o campo (um *.local.json antigo) herda do pai em vez de esvaziar.
  const inherited = normalizeVisualSettings({ ...base, source: "custom" });
  assert.deepEqual(inherited.collections, base.collections);
});

test("presets custom não reimplementam a técnica de terceiros", () => {
  // Ajustar cores/parâmetros de um preset Apache/MIT não torna o preset custom
  // uma obra derivada: a origem continua sendo a da técnica.
  const custom = normalizeVisualSettings({
    ...builtinPresetMap.get("paper-waves"),
    id: "meu-waves",
    source: "custom",
  });
  assert.equal(custom.source, "custom");
  assert.equal(custom.originId, "paper-shaders");
  const original = normalizeVisualSettings({
    ...builtinPresetMap.get("liquid-chrome"),
    id: "meu-chrome",
    source: "custom",
  });
  assert.equal(original.originId, "lumen");
});

test("Paper Shaders catalog exposes every official shader and preset", () => {
  assert.equal(paperShaderDefinitions.length, 29);
  assert.equal(paperShaderPresetCount, 120);
  assert.equal(
    effectIds.filter((id) => id.startsWith("paper-")).length,
    paperShaderDefinitions.length,
  );
  for (const definition of paperShaderDefinitions) {
    const preset = builtinPresetMap.get(definition.rendererId);
    assert.ok(preset, definition.rendererId);
    assert.match(preset.note, /Paper Shaders/u, definition.rendererId);
    assert.equal(
      preset.variants.length,
      definition.presets.length - 1,
      definition.rendererId,
    );
  }
});

test("every builtin atmosphere and reusable option starts with music reaction disabled", () => {
  for (const preset of builtinVisualPresets) {
    assert.equal(preset.common.audioReaction, 0, preset.id);
    for (const palette of preset.palettes) {
      assert.equal(
        palette.common.audioReaction,
        0,
        `${preset.id}/${palette.id}`,
      );
    }
    for (const variant of preset.variants) {
      assert.equal(
        variant.common?.audioReaction ?? 0,
        0,
        `${preset.id}/${variant.id}`,
      );
    }
  }

  assert.equal(
    normalizeVisualSettings({
      id: "paper-mesh-gradient",
      common: { audioReaction: 42 },
    }).common.audioReaction,
    42,
  );
});

test("efeitos de composição (camadas) ficam em Composicoes, não em fundos", () => {
  // Anel, moldura, retícula, dithering, metal e fumaça de gema se sobrepõem a
  // algo — não são fundos que situam a cena. A curadoria é explícita e travada.
  const composicoes = new Set([
    "paper-gem-smoke",
    "paper-liquid-metal",
    "paper-dithering",
    "paper-smoke-ring",
    "paper-pulsing-border",
    "paper-water",
  ]);
  for (const preset of builtinVisualPresets) {
    if (composicoes.has(preset.id)) {
      assert.equal(preset.categoryId, "compositions", preset.id);
    }
  }
  // Nenhum deles pode continuar numa coleção definida como "fundo de cena".
  for (const preset of builtinVisualPresets) {
    if (composicoes.has(preset.id)) {
      assert.ok(
        !preset.collections.includes("atmosfera"),
        `${preset.id} virou composição mas ainda está na coleção de fundos`,
      );
    }
  }
});

test("efeitos de composição (camadas) ficam em Composicoes, não em fundos", () => {
  const visual = normalizeVisualSettings({ id: "paper-dot-grid" });
  assert.equal(visual.category, "Efeitos simples");
  assert.equal(visual.categoryId, "simple-effects");
  // Animações preservam a categoria upstream (Superficies)…
  assert.equal(
    normalizeVisualSettings({ id: "paper-neuro-noise" }).category,
    "Superficies",
  );
  // …exceto as curadas para Composicoes, que são camadas, não fundos.
  assert.equal(
    normalizeVisualSettings({ id: "paper-water" }).category,
    "Composicoes",
  );
  assert.equal(
    normalizeVisualSettings({ id: "paper-water" }).categoryId,
    "compositions",
  );
});

test("visual presets expose V5 catalog metadata with neutral post defaults", () => {
  for (const preset of builtinVisualPresets) {
    const visual = normalizeVisualSettings(preset);
    assert.equal(visual.schemaVersion, 5, preset.id);
    assert.match(visual.categoryId, /^[a-z0-9-]+$/, preset.id);
    assert.match(visual.family, /^[a-z0-9-]+$/, preset.id);
    assert.ok(Array.isArray(visual.tags), preset.id);
    assert.ok(Array.isArray(visual.variants), preset.id);
    assert.ok([1, 2, 3].includes(visual.performanceTier), preset.id);
    assert.deepEqual(visual.post, visualPostDefaults, preset.id);
  }

  assert.equal(
    normalizeVisualSettings({ id: "iridescent-bloom" }).categoryId,
    "light-gradient",
  );
  assert.equal(
    normalizeVisualSettings({ id: "liquid-chrome" }).family,
    "liquid-chrome",
  );
  assert.equal(
    normalizeVisualSettings({ id: "stratosphere-flight" }).family,
    "sky-atmosphere",
  );
});

test("every visual preset exposes four reusable palettes", () => {
  for (const preset of builtinVisualPresets) {
    const visual = normalizeVisualSettings(preset);
    assert.equal(visual.palettes.length, 4, preset.id);
    assert.deepEqual(visual.palettes[0].colors, visual.colors, preset.id);
    assert.deepEqual(visual.palettes[0].common, visual.common, preset.id);
    assert.deepEqual(visual.palettes[0].advanced, visual.advanced, preset.id);
    assert.equal(
      new Set(
        visual.palettes.map((palette) =>
          JSON.stringify({
            colors: palette.colors,
            common: palette.common,
            advanced: palette.advanced,
          }),
        ),
      ).size,
      4,
      preset.id,
    );
    for (const palette of visual.palettes) {
      assert.match(palette.id, /^[a-z0-9-]+$/, preset.id);
      assert.ok(palette.name.length > 0, preset.id);
      assert.match(palette.colors.base, /^#[0-9a-f]{6}$/i, preset.id);
      assert.match(palette.colors.effect, /^#[0-9a-f]{6}$/i, preset.id);
      assert.match(palette.colors.light, /^#[0-9a-f]{6}$/i, preset.id);
      assert.deepEqual(Object.keys(palette.common), Object.keys(visual.common));
      assert.deepEqual(
        Object.keys(palette.advanced),
        Object.keys(visual.advanced),
      );
    }
  }
});

test("visual presets expose only common controls consumed by their renderer", () => {
  assert.deepEqual(visualCommonControlKeys, [
    "intensity",
    "speed",
    "brightness",
    "direction",
    "audioReaction",
    "shade",
  ]);

  const liquid = normalizeVisualSettings({ id: "liquid-mesh" });
  assert.deepEqual(liquid.supportsCommon, [
    "speed",
    "brightness",
    "direction",
    "audioReaction",
    "shade",
  ]);

  const clouds = normalizeVisualSettings({ id: "volumetric-clouds" });
  assert.deepEqual(clouds.supportsCommon, visualCommonControlKeys);

  const plasma = normalizeVisualSettings({ id: "plasma-nebula" });
  assert.deepEqual(plasma.supportsCommon, [
    "intensity",
    "speed",
    "brightness",
    "audioReaction",
    "shade",
  ]);

  const starfield = normalizeVisualSettings({ id: "starfield" });
  assert.deepEqual(starfield.supportsCommon, [
    "speed",
    "brightness",
    "audioReaction",
    "shade",
  ]);

  const aura = normalizeVisualSettings({ id: "vector-aura" });
  assert.deepEqual(aura.supportsCommon, [
    "speed",
    "direction",
    "audioReaction",
    "shade",
  ]);

  const vinyl = normalizeVisualSettings({ id: "vinyl" });
  assert.deepEqual(vinyl.supportsCommon, ["speed", "shade"]);

  const storybook = normalizeVisualSettings({ id: "storybook-dream" });
  assert.ok(storybook.controls.some((control) => control.key === "sunY"));

  const dark = normalizeVisualSettings({ id: "audio-dark" });
  assert.deepEqual(dark.supportsCommon, ["speed", "shade"]);
});

test("custom presets recompute common controls when renderer changes", () => {
  const scene = normalizeVisualSettings({
    id: "custom-vinyl-to-aura",
    name: "Custom aura",
    source: "custom",
    rendererId: "vector-aura",
    supportsCommon: ["speed", "shade"],
  });

  assert.equal(scene.id, "custom-vinyl-to-aura");
  assert.equal(scene.rendererId, "vector-aura");
  assert.deepEqual(scene.supportsCommon, [
    "speed",
    "direction",
    "audioReaction",
    "shade",
  ]);
});

test("ported shader presets normalize to their fullscreen renderers", () => {
  const plasma = normalizeVisualSettings({ rendererId: "plasma-nebula" });
  assert.equal(plasma.rendererId, "plasma");
  assert.equal(plasma.id, "plasma-nebula");
  assert.equal(plasma.category, "Espaço");
  assert.deepEqual(
    plasma.controls.map((entry) => entry.key),
    ["scale", "complexity", "saturation", "glow"],
  );
  assert.equal(plasma.advanced.complexity, 60);

  // Plasma lava and vortex galaxy now own dedicated renderers so they no longer
  // look identical to plasma nebula / the whirlpool vortex.
  const plasmaLava = normalizeVisualSettings({ rendererId: "plasma-lava" });
  assert.equal(plasmaLava.rendererId, "lava");
  assert.equal(plasmaLava.colors.base, "#dc2626");

  const whirlpool = normalizeVisualSettings({ rendererId: "vortex-whirlpool" });
  assert.equal(whirlpool.rendererId, "vortex");

  const galaxy = normalizeVisualSettings({ rendererId: "vortex-galaxy" });
  assert.equal(galaxy.rendererId, "galaxy");
  assert.equal(galaxy.category, "Espaço");
  assert.deepEqual(
    galaxy.controls.map((entry) => entry.key),
    ["arms", "twist", "zoom", "glow"],
  );
  assert.equal(galaxy.advanced.arms, 57);
});

test("cloud timeline presets live as variants with legacy aliases", () => {
  const legacyCloudTimelineIds = [
    ["volumetric-clouds-dawn", "dawn"],
    ["volumetric-clouds-noon", "noon"],
    ["volumetric-clouds-sunset", "sunset"],
    ["volumetric-clouds-dusk", "dusk"],
    ["volumetric-clouds-midnight", "midnight"],
  ];
  const base = normalizeVisualSettings({ id: "volumetric-clouds" });
  const legacyScenes = legacyCloudTimelineIds.map(([id]) =>
    normalizeVisualSettings({ id }),
  );
  const directVariantScenes = legacyCloudTimelineIds.map(
    ([, appliedVariantId]) =>
      normalizeVisualSettings({ id: "volumetric-clouds", appliedVariantId }),
  );

  assert.deepEqual(
    base.variants.map((variant) => variant.id),
    ["dawn", "noon", "sunset", "dusk", "midnight"],
  );

  for (const [index, scene] of legacyScenes.entries()) {
    const direct = directVariantScenes[index];
    const [, variantId] = legacyCloudTimelineIds[index];
    assert.equal(scene.id, "volumetric-clouds");
    assert.equal(scene.appliedVariantId, variantId);
    assert.equal(scene.rendererId, "volumetric-clouds");
    assert.equal(scene.category, "Atmosferas");
    assert.equal(scene.source, "builtin");
    assert.deepEqual(scene.colors, direct.colors, variantId);
    assert.deepEqual(scene.common, direct.common, variantId);
    assert.deepEqual(scene.advanced, direct.advanced, variantId);
    assert.deepEqual(scene.cloudLight, direct.cloudLight, variantId);
    assert.deepEqual(
      scene.controls.map((entry) => entry.key),
      base.controls.map((entry) => entry.key),
      variantId,
    );
    assert.deepEqual(
      Object.keys(scene.advanced),
      Object.keys(base.advanced),
      variantId,
    );
  }

  assert.equal(
    new Set(
      legacyScenes.map((variant) =>
        JSON.stringify({
          colors: variant.colors,
          common: variant.common,
          advanced: variant.advanced,
          cloudLight: variant.cloudLight,
        }),
      ),
    ).size,
    legacyScenes.length,
  );

  const missingVariant = normalizeVisualSettings({
    id: "volumetric-clouds-future",
    rendererId: "volumetric-clouds",
  });
  assert.equal(missingVariant.id, "volumetric-clouds");
  assert.equal(missingVariant.rendererId, "volumetric-clouds");
});

test("starfield uses one preset with parameterized palettes", () => {
  const scene = normalizeVisualSettings(builtinPresetMap.get("starfield"));
  assert.equal(scene.rendererId, "starfield");
  assert.equal(scene.name, "Campo Estelar");
  assert.deepEqual(
    scene.controls.map((entry) => entry.key),
    ["density", "warp", "twinkle", "glow", "colorVar"],
  );
  assert.deepEqual(
    scene.palettes.map((palette) => palette.id),
    ["original", "prism", "warm", "deep"],
  );
  const prism = scene.palettes.find((palette) => palette.id === "prism");
  const warm = scene.palettes.find((palette) => palette.id === "warm");
  assert.ok(prism.advanced.colorVar > warm.advanced.colorVar);

  const legacyPrism = normalizeVisualSettings({
    rendererId: "starfield-prism",
    name: "Campo estelar prisma",
  });
  assert.equal(legacyPrism.id, "starfield");
  assert.equal(legacyPrism.name, "Campo Estelar");
  assert.equal(legacyPrism.rendererId, "starfield");
  assert.equal(legacyPrism.advanced.colorVar, prism.advanced.colorVar);
});

test("legacy starfield catalog entries collapse into one preset option", () => {
  const starfield = builtinPresetMap.get("starfield");
  const presets = normalizeVisualPresetList([
    starfield,
    {
      ...starfield,
      id: "starfield-prism",
      name: "Campo estelar prisma",
    },
    {
      ...starfield,
      id: "starfield-warm",
      name: "Campo estelar quente",
    },
  ]);

  assert.deepEqual(
    presets.filter((preset) => preset.rendererId === "starfield"),
    [normalizeVisualSettings(starfield)],
  );
});

test("normalizing a real shader preset object preserves its renderer and advanced params", () => {
  // The actual builtin objects (and any saved scene) carry id !== rendererId for
  // shader presets — id "plasma-nebula", rendererId "plasma". Normalizing must
  // resolve the base by id and keep the renderer/advanced shape, otherwise the
  // export silently collapses every shader scene back to liquid-mesh.
  for (const preset of builtinVisualPresets) {
    const normalized = normalizeVisualSettings(preset);
    assert.equal(
      normalized.rendererId,
      preset.rendererId,
      `renderer changed for ${preset.id}`,
    );
    assert.deepEqual(
      Object.keys(normalized.advanced),
      Object.keys(preset.advanced),
      `advanced keys changed for ${preset.id}`,
    );
  }
});

test("legacy visual fields normalize into the V5 contract", () => {
  const visual = normalizeVisualSettings({
    effect: "fire",
    intensity: "75",
    speed: "35",
    brightness: "60",
    direction: "450",
    colorA: "#120706",
    colorB: "#d94f1a",
    accentColor: "#ffd36b",
  });

  assert.equal(visual.schemaVersion, 5);
  assert.equal(visual.rendererId, "liquid-mesh");
  assert.equal(visual.common.intensity, 75);
  assert.equal(visual.common.direction, 360);
  assert.equal(visual.colors.light, "#ffd36b");
  assert.equal(visual.waveform.visible, false);
  assert.equal(visual.waveform.type, "mirror-line");
  assert.equal(visual.categoryId, "surfaces");
  assert.deepEqual(visual.post, visualPostDefaults);
});

test("V3 presets normalize into V5 playful and cloud-light defaults", () => {
  const visual = normalizeVisualSettings({
    schemaVersion: 3,
    rendererId: "playful-shapes",
  });
  const clouds = normalizeVisualSettings({
    schemaVersion: 3,
    rendererId: "volumetric-clouds",
  });

  assert.equal(visual.schemaVersion, 5);
  assert.equal(visual.playful.motionMode, "soft-rhythm");
  assert.equal(visual.playful.enabled.emojis, true);
  assert.equal(clouds.cloudLight.enabled, false);
  assert.equal(clouds.cloudLight.intensity, 54);
});

test("V4 visual metadata upgrades into V5 without changing render uniforms", () => {
  const visual = normalizeVisualSettings({
    schemaVersion: 4,
    id: "endless-shallows",
    categoryId: "custom-fluid",
    family: "water-fields",
    tags: ["ambient", "ambient", "caustics"],
    performanceTier: 8,
    appliedVariantId: "dawn",
    post: {
      bloom: "12",
      vignette: -10,
      grain: 140,
      scanlines: 6,
      chromaticAberration: 3,
    },
  });
  const uniforms = visualUniforms(visual);

  assert.equal(visual.schemaVersion, 5);
  assert.equal(visual.categoryId, "custom-fluid");
  assert.equal(visual.family, "water-fields");
  assert.deepEqual(visual.tags, ["ambient", "caustics"]);
  assert.equal(visual.performanceTier, 3);
  assert.equal(visual.appliedVariantId, "dawn");
  assert.deepEqual(visual.post, {
    bloom: 12,
    vignette: 0,
    grain: 100,
    scanlines: 6,
    chromaticAberration: 3,
  });
  assert.equal(uniforms.rendererId, "endless-shallows");
  assert.equal(Object.hasOwn(uniforms, "post"), false);
});

test("playful collections sanitize separators, duplicates and unsafe size", () => {
  assert.deepEqual(
    parseVisualCollection(
      "A, B; A\nPALAVRA-MUITO-LONGA C D E F G H I J K L M N",
      "X Y",
    ),
    ["A", "B", "PALAVRA-", "C", "D", "E", "F", "G", "H", "I", "J", "K"],
  );

  const visual = normalizeVisualSettings({
    rendererId: "playful-shapes",
    playful: {
      seed: 1000000,
      motionMode: "not-real",
      enabled: {
        rectangles: false,
        letters: false,
        numbers: false,
        emojis: false,
      },
      collections: {
        letters: "",
        numbers: "1, 2, 2, 3",
        emojis: "☀️, 🎈, 🌱",
      },
    },
  });

  assert.equal(visual.playful.seed, 999999);
  assert.equal(visual.playful.motionMode, "soft-rhythm");
  assert.equal(visual.playful.enabled.rectangles, true);
  assert.equal(visual.playful.collections.letters, "A B C D E");
  assert.equal(visual.playful.collections.numbers, "1 2 3");
  assert.equal(visual.playful.collections.emojis, "☀️ 🎈 🌱");
});

test("cloud sun focus normalizes into safe bounds", () => {
  const visual = normalizeVisualSettings({
    rendererId: "volumetric-clouds",
    cloudLight: {
      enabled: true,
      intensity: 160,
      color: "#ffe0a3",
      x: -10,
      y: 130,
      radius: 2,
      diffusion: 72,
      motion: 120,
      speed: 44,
      direction: 725,
    },
  });

  assert.deepEqual(visual.cloudLight, {
    enabled: true,
    intensity: 100,
    color: "#ffe0a3",
    x: 0,
    y: 100,
    radius: 8,
    diffusion: 72,
    motion: 100,
    speed: 44,
    direction: 360,
  });
});

test("waveform fields normalize into the V2 catalog with safe constraints", () => {
  const visual = normalizeVisualSettings({
    rendererId: "aurora-ribbons",
    waveform: {
      visible: true,
      type: "spectrum-bars",
      thickness: 72,
      smoothing: -2,
      width: 160,
      audioReaction: -4,
      colorMode: "bands",
      secondaryColor: "invalid",
      tertiaryColor: "#f2b870",
      advanced: {
        barGap: 120,
        barPeakHold: 140,
        barPeakDecay: -10,
        radialRadius: -5,
        radialGlow: 120,
      },
    },
  });

  assert.equal(visual.waveform.visible, true);
  assert.equal(visual.waveform.schemaVersion, 2);
  assert.equal(visual.waveform.type, "spectrum-bars");
  assert.equal(visual.waveform.thickness, 6);
  assert.equal(visual.waveform.smoothing, 0);
  assert.equal(visual.waveform.width, 100);
  assert.equal(visual.waveform.audioReaction, 0);
  assert.equal(visual.waveform.colorMode, "bands");
  assert.match(visual.waveform.secondaryColor, /^#[0-9a-f]{6}$/i);
  assert.equal(visual.waveform.tertiaryColor, "#f2b870");
  assert.equal(visual.waveform.advanced.barGap, 100);
  assert.equal(visual.waveform.advanced.barPeakHold, 100);
  assert.equal(visual.waveform.advanced.barPeakDecay, 0);
  assert.equal(visual.waveform.advanced.radialRadius, 0);
  assert.equal(visual.waveform.advanced.radialGlow, 100);
});

test("unknown waveform styles fall back to the legacy mirrored line", () => {
  const visual = normalizeVisualSettings({
    waveform: { type: "particle-cloud" },
  });

  assert.equal(visual.waveform.type, "mirror-line");
});

test("unknown renderers fall back to liquid mesh and invalid colors use defaults", () => {
  const visual = normalizeVisualSettings({
    rendererId: "not-real",
    colors: { base: "red" },
  });

  assert.equal(visual.rendererId, "liquid-mesh");
  assert.match(visual.colors.base, /^#[0-9a-f]{6}$/i);
});

test("renderOrder is preserved when present and omitted when absent", () => {
  const customOrder = [
    { kind: "waveform" },
    { kind: "media", layerId: "cover", order: 0 },
    { kind: "atmosphere" },
  ];

  const withOrder = normalizeVisualSettings({
    rendererId: "audio-dark",
    renderOrder: customOrder,
  });
  assert.deepEqual(withOrder.renderOrder, customOrder);

  const withoutOrder = normalizeVisualSettings({
    rendererId: "audio-dark",
  });
  assert.equal(withoutOrder.renderOrder, undefined);
});

test("legacy scenes resolve to one base atmosphere layer without changing the scene payload", () => {
  const scene = normalizeVisualSettings({ rendererId: "audio-dark" });
  const layers = resolveAtmosphereLayers(scene);

  assert.equal(scene.atmosphereLayers, undefined);
  assert.equal(layers.length, 1);
  assert.equal(layers[0].id, ATMOSPHERE_BASE_LAYER_ID);
  assert.equal(layers[0].opacity, 100);
  assert.equal(layers[0].blendMode, "normal");
  assert.equal(layers[0].scene.rendererId, "audio-dark");
});

test("atmosphere layers normalize to a base plus one optional overlay", () => {
  const scene = normalizeVisualSettings({
    id: "liquid-mesh",
    atmosphereLayers: [
      {
        id: "ignored-base-id",
        name: "Base antiga",
        visible: false,
        opacity: 140,
        blendMode: "unknown",
        scene: { id: "volumetric-clouds" },
      },
      {
        id: "custom-extra-id",
        name: "Névoa",
        visible: true,
        opacity: 55,
        blendMode: "lighter",
        scene: { id: "fractal-sphere" },
      },
      {
        id: "third",
        scene: { id: "terrain-flight" },
      },
    ],
  });

  assert.equal(scene.atmosphereLayers.length, 2);
  assert.equal(scene.atmosphereLayers[0].id, ATMOSPHERE_BASE_LAYER_ID);
  assert.equal(scene.atmosphereLayers[0].visible, false);
  assert.equal(scene.atmosphereLayers[0].opacity, 100);
  assert.equal(scene.atmosphereLayers[0].blendMode, "normal");
  assert.equal(scene.atmosphereLayers[0].scene.rendererId, "volumetric-clouds");
  assert.equal(scene.atmosphereLayers[1].id, ATMOSPHERE_EXTRA_LAYER_ID);
  assert.equal(scene.atmosphereLayers[1].name, "Névoa");
  assert.equal(scene.atmosphereLayers[1].opacity, 55);
  assert.equal(scene.atmosphereLayers[1].blendMode, "lighter");
  assert.equal(scene.atmosphereLayers[1].scene.rendererId, "fractal-sphere");
});

test("atmosphere layer helpers preserve legacy stack aliases", () => {
  assert.equal(
    atmosphereLayerIdFromStackItem({ kind: "atmosphere" }),
    ATMOSPHERE_BASE_LAYER_ID,
  );
  assert.equal(
    atmosphereLayerIdFromStackItem({
      kind: "atmosphere",
      layerId: ATMOSPHERE_EXTRA_LAYER_ID,
    }),
    ATMOSPHERE_EXTRA_LAYER_ID,
  );
  assert.equal(normalizeAtmosphereBlendMode("lighter"), "lighter");
  assert.equal(normalizeAtmosphereBlendMode("bad-mode"), "normal");

  const layers = normalizeAtmosphereLayers(
    [{ scene: { id: "plasma-nebula" } }],
    { id: "audio-dark" },
  );
  assert.equal(layers.length, 1);
  assert.equal(layers[0].id, ATMOSPHERE_BASE_LAYER_ID);
  assert.equal(layers[0].scene.rendererId, "plasma");
});

test("atmosphere stack performance ignores hidden layers and classifies heavy stacks", () => {
  const inactive = normalizeVisualSettings({
    id: "liquid-mesh",
    atmosphereLayers: [
      { visible: false, scene: { id: "liquid-mesh" } },
      { opacity: 0, scene: { id: "fractal-sphere" } },
    ],
  });
  assert.deepEqual(atmosphereStackPerformance(inactive), {
    activeCount: 0,
    tierTotal: 0,
    tierThreeCount: 0,
    moderate: false,
    heavy: false,
  });

  const moderate = atmosphereStackPerformance(
    normalizeVisualSettings({
      id: "liquid-mesh",
      atmosphereLayers: [
        { scene: { id: "liquid-mesh" } },
        { opacity: 55, scene: { id: "fractal-sphere" } },
      ],
    }),
  );
  assert.equal(moderate.activeCount, 2);
  assert.equal(moderate.moderate, true);
  assert.equal(moderate.heavy, false);

  const heavyByTotal = atmosphereStackPerformance(
    normalizeVisualSettings({
      id: "holo-topography",
      atmosphereLayers: [
        { scene: { id: "holo-topography" } },
        { opacity: 55, scene: { id: "fluid-flow" } },
      ],
    }),
  );
  assert.equal(heavyByTotal.tierTotal, 5);
  assert.equal(heavyByTotal.tierThreeCount, 1);
  assert.equal(heavyByTotal.heavy, true);

  const heavyByTierThreeCount = atmosphereStackPerformance(
    normalizeVisualSettings({
      id: "fractal-sphere",
      atmosphereLayers: [
        { scene: { id: "fractal-sphere" } },
        { opacity: 55, scene: { id: "fluid-flow" } },
      ],
    }),
  );
  assert.equal(heavyByTierThreeCount.tierThreeCount, 2);
  assert.equal(heavyByTierThreeCount.heavy, true);
});
