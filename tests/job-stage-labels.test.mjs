import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { jobStageLabel, STAGE_LABELS } from "../src/jobs/jobStageLabels.ts";

describe("jobStageLabel", () => {
  test("mapeia stages técnicos para linguagem de usuário", () => {
    assert.equal(jobStageLabel("asset-prepare"), "Preparando");
    assert.equal(jobStageLabel("audio-analysis"), "Analisando áudio");
    assert.equal(jobStageLabel("ffmpeg-mux"), "Codificando");
    assert.equal(jobStageLabel("webgl-render"), "Renderizando");
    assert.equal(jobStageLabel("poster-render"), "Renderizando imagem");
    assert.equal(jobStageLabel("output-validation"), "Validando");
    assert.equal(jobStageLabel("manifest"), "Finalizando");
    assert.equal(jobStageLabel("complete"), "Concluído");
  });

  test("não expõe jargão interno", () => {
    const labels = Object.values(STAGE_LABELS);
    for (const label of labels) {
      assert.equal(label.toLowerCase().includes("ffmpeg"), false);
      assert.equal(label.toLowerCase().includes("webgl"), false);
      assert.equal(label.toLowerCase().includes("mux"), false);
    }
  });

  test("fallback seguro para stage vazio ou desconhecido", () => {
    assert.equal(jobStageLabel(undefined), "Processando");
    assert.equal(jobStageLabel(""), "Processando");
    assert.equal(jobStageLabel("unknown-future-stage"), "Processando");
  });
});
