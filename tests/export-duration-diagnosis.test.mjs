import assert from "node:assert/strict";
import test from "node:test";

import {
  clampPublicationClipDuration,
  clampPublicationClipDurationForPreset,
  publicationAssetPresetById,
  publicationAssetSettingsForPreset,
  publicationPresetMaxDurationSeconds,
} from "../shared/publication-assets.mjs";

// Diagnóstico do contrato de duração em publication assets (PR1).
//
// Problema: os presets de clip tratam maxDurationSeconds como uma constraint
// rígida. A função clampPublicationClipDurationForPreset corta a duração
// solicitada até esse valor, e a UI usa publicationPresetMaxDurationSeconds
// para limitar o input. Isso faz com que 60s selecionados num preset
// "clip-vertical" (limite 30s) sejam silenciosamente reduzidos para 30s no
// job.
//
// Este arquivo tem dois tipos de teste:
//   1. Testes que PASSAM hoje e documentam o comportamento atual obsoleto.
//   2. Testes .skip que representam o contrato desejado e serão ativados no
//      PR2 (duração configurável).
//
// Nenhuma lógica de produção é alterada neste PR.

test("capacidade global de duração (1..600) é preservada", () => {
  assert.equal(clampPublicationClipDuration(-5), 1);
  assert.equal(clampPublicationClipDuration(12), 12);
  assert.equal(clampPublicationClipDuration(120), 120);
  assert.equal(clampPublicationClipDuration(900), 600);
  assert.equal(clampPublicationClipDuration("x"), 15);
});

test("CONTRATO OBSOLETO (PR2): clamp por preset trunca duração solicitada", () => {
  // Hoje a função usa publicationPresetMaxDurationSeconds, que lê
  // maxDurationSeconds do preset como um teto rígido.
  assert.equal(clampPublicationClipDurationForPreset(60, "clip-vertical"), 30);
  assert.equal(
    clampPublicationClipDurationForPreset(60, "instagram-story-clip"),
    15,
  );
  assert.equal(
    clampPublicationClipDurationForPreset(120, "instagram-reel"),
    90,
  );
  assert.equal(
    clampPublicationClipDurationForPreset(120, "youtube-shorts"),
    60,
  );
  assert.equal(
    clampPublicationClipDurationForPreset(700, "tiktok-vertical"),
    600,
  );
});

test("CONTRATO OBSOLETO (PR2): publicationAssetSettingsForPreset aplica o clamp do preset", () => {
  // O usuário seleciona 60s, mas o preset clip-vertical força 30s.
  const settings = publicationAssetSettingsForPreset("clip-vertical", {
    clipDuration: 60,
  });
  assert.equal(settings.clipDuration, 30);
});

test("CONTRATO OBSOLETO (PR2): override por asset também é truncado pelo preset", () => {
  // O usuário sobrescreve a duração deste asset para 120s, mas o preset
  // clip-vertical força 30s.
  const settings = publicationAssetSettingsForPreset(
    "clip-vertical",
    { clipDuration: 30 },
    { "clip-vertical": { clipDuration: 120 } },
  );
  assert.equal(settings.clipDuration, 30);
});

test("CONTRATO OBSOLETO (PR2): troca de preset sem re-clamp da duração global gera inconsistência", () => {
  // Simulação do estado da UI: o campo global "Duração padrão" fica em 90s
  // (preset anterior, ex. TikTok vertical, max 600s). Ao trocar para
  // Instagram Story Clip, o campo global continua 90, mas a duração efetiva
  // do asset é re-clampada para 15s. O arquivo final sai com 15s.
  const globalDuration = 90;
  const settings = publicationAssetSettingsForPreset("instagram-story-clip", {
    clipDuration: globalDuration,
  });
  assert.equal(settings.clipDuration, 15);
});

test("CONTRATO OBSOLETO (PR2): presets de imagem usam a capacidade global como teto", () => {
  // Presets de imagem não têm maxDurationSeconds, então o clamp cai no
  // fallback de 600s.
  assert.equal(
    clampPublicationClipDurationForPreset(700, "youtube-thumbnail"),
    600,
  );
});

test.skip("PR2: duração solicitada dentro da capacidade do exportador é respeitada", () => {
  assert.equal(clampPublicationClipDurationForPreset(60, "clip-vertical"), 60);
  assert.equal(
    clampPublicationClipDurationForPreset(60, "instagram-story-clip"),
    60,
  );
  assert.equal(
    clampPublicationClipDurationForPreset(120, "instagram-reel"),
    120,
  );
  assert.equal(
    clampPublicationClipDurationForPreset(120, "youtube-shorts"),
    120,
  );
});

test.skip("PR2: publicationAssetSettingsForPreset preserva duração solicitada", () => {
  const settings = publicationAssetSettingsForPreset("clip-vertical", {
    clipDuration: 60,
  });
  assert.equal(settings.clipDuration, 60);
});

test.skip("PR2: troca de preset mantém duração global ajustada ao novo contexto", () => {
  // Após o PR2, o sistema deve ou manter a duração solicitada dentro da
  // capacidade do novo preset, ou refletir visualmente a mudança.
  const settings = publicationAssetSettingsForPreset("instagram-story-clip", {
    clipDuration: 90,
  });
  assert.equal(settings.clipDuration, 90);
});
