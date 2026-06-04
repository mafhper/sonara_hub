import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTextSettings } from "../shared/text-settings.mjs";

test("normalizeTextSettings preserves per-field styles, order and vertical anchor", () => {
  const input = {
    fields: {
      title: true,
      artist: true,
      album: true,
      year: false,
      version: true,
    },
    order: ["artist", "title", "version"],
    fieldStyles: {
      title: { fontWeight: 800, fontStyle: "italic", align: "right" },
      artist: { align: "center", color: "#abcdef" },
    },
    verticalAnchor: "middle",
    align: "justify",
    preset: "side-right",
  };
  const out = normalizeTextSettings(input);

  // The rich per-field controls that the export used to drop must survive.
  assert.deepEqual(out.order, ["artist", "title", "version"]);
  assert.equal(out.fieldStyles.title.fontWeight, 800);
  assert.equal(out.fieldStyles.title.fontStyle, "italic");
  assert.equal(out.fieldStyles.title.align, "right");
  assert.equal(out.fieldStyles.artist.color, "#abcdef");
  assert.equal(out.verticalAnchor, "middle");

  // The full alignment + preset vocabularies must not collapse to defaults.
  assert.equal(out.align, "justify");
  assert.equal(out.preset, "side-right");
});

test("normalizeTextSettings still rejects invalid enums and omits absent rich fields", () => {
  const out = normalizeTextSettings({
    align: "diagonal",
    preset: "spinning",
    verticalAnchor: "sideways",
    fontFamily: "Comic Sans",
  });
  assert.equal(out.align, "left");
  assert.equal(out.preset, "top-left");
  assert.equal(out.verticalAnchor, "top");
  assert.equal(out.fontFamily, "Inter");
  // No order/fieldStyles supplied → keys omitted so the runtime can default them.
  assert.equal("order" in out, false);
  assert.equal("fieldStyles" in out, false);
});
