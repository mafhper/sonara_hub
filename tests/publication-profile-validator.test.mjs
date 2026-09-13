import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePublicationDurationPolicy,
  EXPORTER_MAX_DURATION_SECONDS,
  publicationAssetPresets,
} from "../shared/publication-assets.mjs";

test("todos os presets possuem valores de duração coerentes", () => {
  for (const preset of publicationAssetPresets) {
    const defaultDuration = Number(preset.defaultDurationSeconds);
    const recommended = Number(preset.recommendations?.durationSeconds);

    if (preset.kind === "clip") {
      assert.ok(
        Number.isFinite(defaultDuration) && defaultDuration >= 1,
        `${preset.id}: defaultDurationSeconds deve ser >= 1`,
      );
      assert.ok(
        defaultDuration <= EXPORTER_MAX_DURATION_SECONDS,
        `${preset.id}: defaultDurationSeconds deve ser <= ${EXPORTER_MAX_DURATION_SECONDS}`,
      );
    }

    if (Number.isFinite(recommended)) {
      assert.ok(
        recommended >= 1,
        `${preset.id}: recommendations.durationSeconds deve ser >= 1`,
      );
      assert.ok(
        recommended <= EXPORTER_MAX_DURATION_SECONDS,
        `${preset.id}: recommendations.durationSeconds deve ser <= capacidade do exportador`,
      );
      assert.ok(
        defaultDuration <= recommended,
        `${preset.id}: defaultDurationSeconds não deve ser maior que recommendations.durationSeconds`,
      );
    }

    const durationConstraint = preset.constraints?.duration;
    if (durationConstraint) {
      assert.ok(
        ["maximum", "recommended", "unrestricted"].includes(
          durationConstraint.mode,
        ),
        `${preset.id}: constraints.duration.mode inválido`,
      );
      if (durationConstraint.mode === "maximum") {
        assert.ok(
          Number.isFinite(Number(durationConstraint.valueSeconds)) &&
            Number(durationConstraint.valueSeconds) > 0,
          `${preset.id}: constraints.duration.valueSeconds deve ser positivo`,
        );
      }
    }
  }
});

test("nenhum preset impõe constraint bloqueante de duração nesta sprint", () => {
  for (const preset of publicationAssetPresets) {
    const durationConstraint = preset.constraints?.duration;
    assert.notEqual(
      durationConstraint?.enforcement,
      "blocking",
      `${preset.id}: constraints.duration não deve ser bloqueante no PR3`,
    );
  }
});

test("recomendação excedida nunca bloqueia exportação com os presets atuais", () => {
  for (const preset of publicationAssetPresets) {
    const recommended = preset.recommendations?.durationSeconds;
    if (!recommended) continue;
    const policy = evaluatePublicationDurationPolicy(preset, recommended + 1);
    assert.equal(
      policy.recommendationExceeded,
      true,
      `${preset.id}: deveria sinalizar recommendationExceeded`,
    );
    assert.equal(
      policy.blocking,
      false,
      `${preset.id}: recomendação não deve bloquear`,
    );
  }
});
