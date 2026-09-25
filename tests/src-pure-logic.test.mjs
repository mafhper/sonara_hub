import assert from "node:assert/strict";
import test from "node:test";

import {
  publicationAssetKindLabel,
  publicationLyricsExcerptOptions,
  publicationLyricsSettingLabel,
  publicationPresetsForMode,
} from "../src/publication.ts";
import { publicationAssetPresets } from "../shared/publication-assets.mjs";
import {
  formatWorkflowDuration,
  renderExportPipelineStats,
  renderExportStageStats,
} from "../src/features/render/performanceSummary.ts";
import { describeSystemCapabilities } from "../src/features/render/systemCapabilities.ts";
import {
  emptyRenderPreferences,
  renderPreferenceFieldLabels,
  renderPreferenceOptions,
  renderPreferenceSourceLabels,
} from "../src/features/render/renderPreferences.ts";
import {
  applyThemePreference,
  loadThemePreference,
  loadUiScalePreference,
  normalizeThemePreference,
  normalizeUiScalePreference,
  resolveAppTheme,
  saveThemePreference,
  saveUiScalePreference,
  THEME_STORAGE_KEY,
  UI_SCALE_STORAGE_KEY,
} from "../src/theme.ts";

// ---------------------------------------------------------------------------
// src/publication.ts
// ---------------------------------------------------------------------------

test("publication mode 'all' devolve o catálogo inteiro", () => {
  const first = publicationAssetPresets[0];
  assert.deepEqual(
    publicationPresetsForMode(first, "all"),
    publicationAssetPresets,
  );
});

test("publication mode 'group' devolve só a mesma kind do preset", () => {
  const clip = publicationAssetPresets.find((p) => p.kind === "clip");
  assert.ok(clip, "o catálogo precisa ter ao menos um clip");
  const group = publicationPresetsForMode(clip, "group");
  assert.ok(group.length > 0);
  assert.ok(group.every((p) => p.kind === clip.kind));
  // "group" nunca pode devolver o catálogo inteiro: é o que a diferencia de "all"
  assert.ok(group.length < publicationAssetPresets.length);
});

test("publication mode 'single' devolve exatamente o preset escolhido", () => {
  for (const preset of publicationAssetPresets) {
    assert.deepEqual(publicationPresetsForMode(preset, "single"), [preset]);
  }
});

test("lyrics setting traduz os três modos", () => {
  assert.equal(
    publicationLyricsSettingLabel({ lyricsMode: "full" }),
    "letra completa",
  );
  assert.equal(
    publicationLyricsSettingLabel({ lyricsMode: "excerpt" }),
    "trecho de letra",
  );
  assert.equal(
    publicationLyricsSettingLabel({ lyricsMode: "none" }),
    "sem letra",
  );
});

test("asset kind rotula as três kinds com fallback", () => {
  assert.equal(publicationAssetKindLabel("clip"), "clip");
  assert.equal(publicationAssetKindLabel("booklet"), "encarte");
  assert.equal(publicationAssetKindLabel("cover"), "imagem");
});

test("trecho de letra com poucas linhas devolve uma janela só", () => {
  const options = publicationLyricsExcerptOptions("a\nb\nc");
  assert.equal(options.length, 1);
  assert.equal(options[0].id, "all");
  assert.equal(options[0].value, "a\nb\nc");
});

test("trecho de letra com letra longa oferece início, meio e final", () => {
  const value = Array.from({ length: 12 }, (_, i) => `linha ${i + 1}`).join(
    "\n",
  );
  const options = publicationLyricsExcerptOptions(value);
  assert.equal(options.length, 3);
  assert.deepEqual(
    options.map((o) => o.id),
    ["start", "middle", "end"],
  );
  // A janela tem no máximo 4 linhas (constante do módulo)
  for (const option of options) {
    assert.equal(option.value.split("\n").length, 4);
  }
  assert.equal(options[0].value.split("\n")[0], "linha 1");
  assert.equal(options[2].value.split("\n")[3], "linha 12");
});

test("trecho de letra descarta linhas vazias e não repete valores", () => {
  const options = publicationLyricsExcerptOptions(
    "\n  a  \n\n\n  b  \n\n  c  \n\n  d  \n\n  e  \n\n  f  \n\n",
  );
  assert.ok(options.length > 0);
  const values = options.map((o) => o.value);
  assert.equal(new Set(values).size, values.length, "valores duplicados");
  for (const value of values) {
    assert.doesNotMatch(value, /^\s*$/m, "nenhuma linha em branco sobrevive");
  }
});

test("letra vazia ou ausente devolve lista vazia, não uma opção quebrada", () => {
  assert.deepEqual(publicationLyricsExcerptOptions(""), []);
  assert.deepEqual(publicationLyricsExcerptOptions("   \n\n  "), []);
  assert.deepEqual(publicationLyricsExcerptOptions(null), []);
  assert.deepEqual(publicationLyricsExcerptOptions(undefined), []);
});

test("letra com exatamente o tamanho da janela não gera opções duplicadas", () => {
  // 4 linhas = windowSize: o caminho "all" e o caminho "start/meio/fim"
  // produziriam o mesmo texto 3 vezes; o dedupe por `seen` existe pra isso.
  const options = publicationLyricsExcerptOptions("1\n2\n3\n4");
  assert.equal(options.length, 1);
  assert.equal(options[0].value, "1\n2\n3\n4");
});

// ---------------------------------------------------------------------------
// src/features/render/performanceSummary.ts
// ---------------------------------------------------------------------------

const stage = (over = {}) => ({
  domain: "render",
  label: "estágio",
  pipeline: "render-export",
  sampleCount: 1,
  averageMs: 10,
  medianMs: 10,
  p95Ms: 10,
  totalMs: 10,
  ...over,
});

const summary = (over = {}) => ({
  enabled: true,
  generatedAt: "2026-09-25T00:00:00.000Z",
  sampleCount: 1,
  pipelines: [stage({ label: "pipeline" })],
  stages: [stage()],
  ...over,
});

test("benchmark desabilitado ou ausente não vaza estatística", () => {
  assert.deepEqual(renderExportStageStats(null), []);
  assert.equal(renderExportPipelineStats(null), null);
  assert.deepEqual(renderExportStageStats(summary({ enabled: false })), []);
  assert.equal(renderExportPipelineStats(summary({ enabled: false })), null);
});

test("estágio e pipeline filtram só a linha de render-export", () => {
  const mixed = summary({
    pipelines: [
      stage({ label: "export total" }),
      stage({ pipeline: "audio-mix" }),
    ],
    stages: [stage({ label: "encode" }), stage({ pipeline: "audio-mix" })],
  });
  const stages = renderExportStageStats(mixed);
  assert.equal(stages.length, 1);
  assert.equal(stages[0].pipeline, "render-export");
  assert.equal(
    stages[0].label,
    "encode",
    "filtra pelo pipeline, preserva o rótulo",
  );
  const pipeline = renderExportPipelineStats(mixed);
  assert.ok(pipeline);
  assert.equal(pipeline.label, "export total");
});

test("pipeline ausente de render-export devolve null, não outra linha", () => {
  const onlyAudio = summary({
    pipelines: [stage({ pipeline: "audio-mix" })],
  });
  assert.equal(renderExportPipelineStats(onlyAudio), null);
});

test("duração formata ms, s e zera entrada inválida", () => {
  assert.equal(formatWorkflowDuration(0), "0ms");
  assert.equal(formatWorkflowDuration(-10), "0ms");
  assert.equal(formatWorkflowDuration(Number.NaN), "0ms");
  assert.equal(formatWorkflowDuration(Number.POSITIVE_INFINITY), "0ms");
  assert.equal(formatWorkflowDuration(1), "1ms");
  assert.equal(formatWorkflowDuration(999.4), "999ms");
  assert.equal(formatWorkflowDuration(1000), "1.0s");
  assert.equal(formatWorkflowDuration(1500), "1.5s");
  // acima de 1s continua em segundos, não vira minutos
  assert.equal(formatWorkflowDuration(90_000), "90.0s");
});

// ---------------------------------------------------------------------------
// src/features/render/systemCapabilities.ts
// ---------------------------------------------------------------------------

const caps = (over = {}) => ({
  detectedAt: "2026-09-25T00:00:00.000Z",
  platform: "test",
  cpu: { cores: 8, model: "CPU X" },
  gpu: {
    available: true,
    vendor: "V",
    renderer: "Renderer Y",
    version: "1",
    shadingLanguageVersion: "1",
    webglVersion: "2",
    isHardware: true,
  },
  ffmpeg: {
    available: true,
    preferred: "h264_nvenc",
    hardwareEncoders: ["h264_nvenc"],
    errorCode: null,
  },
  concurrency: { render: 2, audio: 1 },
  recommendations: {
    gpuMode: "auto",
    capturePacing: "auto",
    encoderMode: "auto",
  },
  ...over,
});

test("capacidades ausentes não produz linhas", () => {
  assert.deepEqual(describeSystemCapabilities(null), []);
});

test("descreve hardware, modelo de CPU e codificadores", () => {
  const lines = describeSystemCapabilities(caps());
  assert.equal(lines.length, 4);
  assert.equal(lines[0], "CPU: 8 núcleos · CPU X");
  assert.equal(lines[1], "GPU WebGL: Renderer Y (hardware)");
  assert.equal(lines[2], "Codificadores FFmpeg: h264_nvenc");
  assert.equal(lines[3], "Filas ativas: 2 render · 1 áudio simultâneos");
});

test("CPU sem modelo omite o separador em vez de deixar sobra", () => {
  const lines = describeSystemCapabilities(
    caps({ cpu: { cores: 4, model: null } }),
  );
  assert.equal(lines[0], "CPU: 4 núcleos");
});

test("GPU por software é distinguida de hardware", () => {
  const lines = describeSystemCapabilities(
    caps({ gpu: { ...caps().gpu, isHardware: false } }),
  );
  assert.equal(lines[1], "GPU WebGL: Renderer Y (software)");
});

test("GPU indisponível mostra o erro de sondagem quando existe", () => {
  const base = caps().gpu;
  const withError = describeSystemCapabilities(
    caps({
      gpu: {
        ...base,
        available: false,
        renderer: null,
        isHardware: false,
        probeError: "context lost",
      },
    }),
  );
  assert.equal(withError[1], "GPU WebGL: indisponível (context lost)");

  const withoutError = describeSystemCapabilities(
    caps({
      gpu: { ...base, available: false, renderer: null, probeError: null },
    }),
  );
  assert.equal(withoutError[1], "GPU WebGL: indisponível");
});

test("FFmpeg só com software declara o fallback em vez de lista vazia", () => {
  const lines = describeSystemCapabilities(
    caps({
      ffmpeg: {
        available: true,
        preferred: "libx264",
        hardwareEncoders: [],
        errorCode: null,
      },
    }),
  );
  assert.equal(lines[2], "Codificadores FFmpeg: apenas software (libx264)");
});

test("concorrência ausente vira '?', nunca NaN nem undefined", () => {
  const lines = describeSystemCapabilities(
    caps({ concurrency: { render: null, audio: null } }),
  );
  assert.equal(lines[3], "Filas ativas: ? render · ? áudio simultâneos");
});

// ---------------------------------------------------------------------------
// src/theme.ts
// ---------------------------------------------------------------------------

// Stubs m�nimos: n�o � DOM, � s� o que o m�dulo realmente usa. O ponto �
// testar a l�gica de decis�o e os fallbacks, n�o simular um navegador.
function withWindow(fake, run) {
  const previous = globalThis.window;
  globalThis.window = fake;
  try {
    return run();
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

function withDocument(fake, run) {
  const previous = globalThis.document;
  globalThis.document = fake;
  try {
    return run();
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

const fakeStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
  };
};

test("prefer�ncia de tema normaliza e cai em 'original' no desconhecido", () => {
  for (const value of ["light", "dark", "golden", "original", "system"]) {
    assert.equal(normalizeThemePreference(value), value);
  }
  // entradas que N�O podem virar uma prefer�ncia v�lida
  assert.equal(normalizeThemePreference("neon"), "original");
  assert.equal(normalizeThemePreference(""), "original");
  assert.equal(normalizeThemePreference(null), "original");
  assert.equal(normalizeThemePreference(undefined), "original");
  assert.equal(normalizeThemePreference(42), "original");
  assert.equal(normalizeThemePreference(" light "), "light", "tolera espa�o");
});

test("escala de UI normaliza e cai em 'standard' no desconhecido", () => {
  for (const value of ["standard", "large", "extra"]) {
    assert.equal(normalizeUiScalePreference(value), value);
  }
  assert.equal(normalizeUiScalePreference("huge"), "standard");
  assert.equal(normalizeUiScalePreference(null), "standard");
  assert.equal(normalizeUiScalePreference(" extra "), "extra");
});

test("prefer�ncia 'system' resolve para o tema do sistema; fixa ignora", () => {
  assert.equal(resolveAppTheme("system", "dark"), "dark");
  assert.equal(resolveAppTheme("system", "light"), "light");
  // uma prefer�ncia expl�cita n�o pode ser sobrescrita pelo sistema
  assert.equal(resolveAppTheme("golden", "dark"), "golden");
  assert.equal(resolveAppTheme("light", "dark"), "light");
});

test("tema e escala persistem e recarregam do storage", () => {
  const storage = fakeStorage();
  withWindow({ localStorage: storage }, () => {
    saveThemePreference("golden");
    saveUiScalePreference("extra");
    assert.equal(storage.getItem(THEME_STORAGE_KEY), "golden");
    assert.equal(storage.getItem(UI_SCALE_STORAGE_KEY), "extra");
    assert.equal(loadThemePreference(), "golden");
    assert.equal(loadUiScalePreference(), "extra");
  });
});

test("storage que lan�a n�o derruba a sess�o (best-effort)", () => {
  const exploding = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  withWindow({ localStorage: exploding }, () => {
    // salvar n�o pode lan�ar
    assert.doesNotThrow(() => saveThemePreference("dark"));
    // carregar devolve o fallback, n�o o erro
    assert.equal(loadThemePreference(), "original");
    assert.equal(loadUiScalePreference(), "standard");
  });
});

test("valor corrompido no storage cai no fallback ao carregar", () => {
  const storage = fakeStorage({
    [THEME_STORAGE_KEY]: "lixo",
    [UI_SCALE_STORAGE_KEY]: "gigante",
  });
  withWindow({ localStorage: storage }, () => {
    assert.equal(loadThemePreference(), "original");
    assert.equal(loadUiScalePreference(), "standard");
  });
});

test("aplicar tema escreve dataset, colorScheme e a meta theme-color", () => {
  const meta = { content: "" };
  const root = { dataset: {}, style: {} };
  withDocument(
    {
      documentElement: root,
      querySelector: (selector) =>
        selector.includes("theme-color") ? meta : null,
    },
    () => {
      assert.equal(applyThemePreference("golden"), "golden");
      assert.equal(root.dataset.themePreference, "golden");
      assert.equal(root.dataset.theme, "golden");
      // 'golden' � um tema claro -> o colorScheme precisa acompanhar
      assert.equal(root.style.colorScheme, "light");
      assert.ok(
        meta.content.length > 0,
        "meta theme-color deveria ser preenchida",
      );

      applyThemePreference("dark");
      assert.equal(root.dataset.theme, "dark");
      assert.equal(root.style.colorScheme, "dark");
    },
  );
});

test("aplicar tema sem document n�o lan�a e ainda devolve o tema efetivo", () => {
  assert.equal(applyThemePreference("light"), "light");
  assert.equal(applyThemePreference("dark"), "dark");
});
// ---------------------------------------------------------------------------
// src/features/render/renderPreferences.ts
// ---------------------------------------------------------------------------

test("todo campo de prefer�ncia tem op��es come�ando pelo padr�o do sistema", () => {
  const fields = Object.keys(renderPreferenceOptions);
  assert.equal(fields.length, 3, "gpuMode, capturePacing e encoderMode");
  for (const field of fields) {
    const options = renderPreferenceOptions[field];
    assert.ok(options.length >= 2, `${field} precisa de al�m do padr�o`);
    const first = options[0];
    assert.equal(
      first.value,
      "",
      `${field}: a op��o padr�o precisa ter value ""`,
    );
    assert.equal(
      emptyRenderPreferences[field],
      "",
      `${field}: o preset vazio precisa casar com o value "" da op��o padr�o`,
    );
    assert.ok(first.label.length > 0, `${field}: padr�o sem r�tulo`);
    assert.ok(first.description.length > 0, `${field}: padr�o sem descri��o`);
  }
});

test("valores de op��o s�o �nicos dentro de cada campo", () => {
  for (const [field, options] of Object.entries(renderPreferenceOptions)) {
    const values = options.map((o) => o.value);
    assert.equal(
      new Set(values).size,
      values.length,
      `${field} tem valor duplicado: ${values.join(", ")}`,
    );
  }
});

test("todo campo e toda origem t�m r�tulo em portugu�s", () => {
  for (const field of Object.keys(renderPreferenceOptions)) {
    assert.ok(
      renderPreferenceFieldLabels[field]?.length > 0,
      `campo ${field} sem r�tulo`,
    );
  }
  for (const source of Object.keys(renderPreferenceSourceLabels)) {
    assert.ok(
      renderPreferenceSourceLabels[source]?.length > 0,
      `origem ${source} sem r�tulo`,
    );
  }
});
