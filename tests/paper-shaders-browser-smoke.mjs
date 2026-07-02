import assert from "node:assert/strict";
import { chromium } from "playwright";
import { bundleSceneRuntimeSource } from "../server/webgl-export.mjs";
import { normalizeVisualSettings } from "../shared/visual-effects.mjs";
import { paperShaderPresetConfigs } from "../shared/paper-shaders.mjs";

const scenes = paperShaderPresetConfigs.flatMap((preset) => [
  {
    label: `${preset.id}:original`,
    scene: normalizeVisualSettings({ id: preset.id }),
  },
  ...preset.variants.map((variant) => ({
    label: `${preset.id}:${variant.id}`,
    scene: normalizeVisualSettings({
      id: preset.id,
      appliedVariantId: variant.id,
    }),
  })),
]);
const runtimeSource = await bundleSceneRuntimeSource();
const runtimeUrl = `data:text/javascript;base64,${Buffer.from(runtimeSource).toString("base64")}`;
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

try {
  const page = await browser.newPage();
  const diagnostics = [];
  page.on("console", (message) =>
    diagnostics.push(`console:${message.text()}`),
  );
  page.on("pageerror", (error) =>
    diagnostics.push(`pageerror:${error.message}`),
  );
  const results = await page.evaluate(
    async ({ moduleUrl, entries }) => {
      const { createSceneRuntime } = await import(moduleUrl);
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      document.body.append(canvas);
      const runtime = createSceneRuntime(canvas, entries[0].scene, {});
      runtime.resize(320, 180);
      runtime.setAudio({
        energy: 0.42,
        bass: 0.5,
        mid: 0.28,
        high: 0.16,
      });
      const context = canvas.getContext("2d");
      const output = [];
      for (const entry of entries) {
        try {
          runtime.setScene(entry.scene);
          runtime.render(1.25, 24);
          const pixels = context.getImageData(0, 0, 320, 180).data;
          let min = 255;
          let max = 0;
          let visible = 0;
          for (let index = 0; index < pixels.length; index += 16) {
            const luminance =
              pixels[index] * 0.2126 +
              pixels[index + 1] * 0.7152 +
              pixels[index + 2] * 0.0722;
            min = Math.min(min, luminance);
            max = Math.max(max, luminance);
            if (pixels[index + 3] > 0) visible += 1;
          }
          output.push({ label: entry.label, min, max, visible });
        } catch (error) {
          output.push({
            label: entry.label,
            error: String(error?.message ?? error),
          });
        }
      }
      runtime.destroy();
      return output;
    },
    { moduleUrl: runtimeUrl, entries: scenes },
  );

  assert.equal(results.length, 120);
  for (const result of results) {
    assert.equal(result.error, undefined, `${result.label}: ${result.error}`);
    assert.ok(result.visible > 0, `${result.label}: frame sem pixels visíveis`);
    assert.ok(
      result.max - result.min > 2,
      `${result.label}: frame uniforme (${result.min.toFixed(2)}–${result.max.toFixed(2)})`,
    );
  }
  assert.deepEqual(
    diagnostics.filter((entry) => /error|fail/iu.test(entry)),
    [],
  );
  console.log(`Paper Shaders browser smoke: ${results.length} presets verdes.`);
} finally {
  await browser.close();
}
