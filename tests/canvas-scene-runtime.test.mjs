import test from "node:test";
import assert from "node:assert/strict";
import {
  createSceneRuntime,
  effectiveLayerOpacity,
  effectiveTextOpacity,
  effectiveZoomScale,
  fitMetadataFontSize,
  legacyRenderStack,
  mediaLayerBounds,
  mediaTextAvoidanceBounds,
  metadataSafeWidth,
  shaderAudioUniformNames,
} from "../shared/canvas-scene-runtime.mjs";
import { normalizeVisualSettings } from "../shared/visual-effects.mjs";

// Minimal 2D context stand-in: width proportional to char count and font px so
// fontSize scaling is observable without a real canvas.
function fakeContext() {
  return {
    font: "",
    measureText(text) {
      const match = /(\d+(?:\.\d+)?)px/u.exec(this.font);
      const size = match ? Number(match[1]) : 10;
      return { width: String(text).length * size * 0.5 };
    },
  };
}

const plainStyle = {
  fontFamily: "Inter",
  fontWeight: 600,
  fontStyle: "normal",
  letterSpacing: 0,
};

test("metadataSafeWidth respects alignment and the edge margin", () => {
  const width = 1000;
  const margin = width * 0.045;
  assert.equal(metadataSafeWidth(width, 50, "left"), width - 50 - margin);
  assert.equal(metadataSafeWidth(width, 800, "right"), 800 - margin);
  assert.equal(
    metadataSafeWidth(width, 600, "center"),
    2 * Math.min(600 - margin, width - 600 - margin),
  );
  assert.equal(metadataSafeWidth(width, 50, "justify"), width - 50 - margin);
  assert.equal(metadataSafeWidth(width, 0, "right"), 0);
});

test("metadataSafeWidth avoids media bounds intersecting the text band", () => {
  const width = 1000;
  const blocker = { left: 500, top: 20, right: 700, bottom: 120 };
  assert.equal(
    metadataSafeWidth(width, 100, "left", {
      blockingRects: [blocker],
      lineTop: 40,
      lineBottom: 80,
    }),
    388,
  );
  assert.equal(
    metadataSafeWidth(width, 900, "right", {
      blockingRects: [blocker],
      lineTop: 40,
      lineBottom: 80,
    }),
    188,
  );
  assert.equal(
    metadataSafeWidth(width, 100, "left", {
      blockingRects: [blocker],
      lineTop: 140,
      lineBottom: 180,
    }),
    width - 100 - width * 0.045,
  );
});

test("mediaLayerBounds mirrors drawMediaLayer geometry", () => {
  const bounds = mediaLayerBounds(1000, 500, {
    element: { naturalWidth: 400, naturalHeight: 200 },
    fit: "contain",
    scale: 50,
    x: 50,
    y: 50,
    opacity: 100,
  });

  assert.deepEqual(
    {
      x: bounds.x,
      y: bounds.y,
      drawWidth: bounds.drawWidth,
      drawHeight: bounds.drawHeight,
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
    },
    {
      x: 250,
      y: 125,
      drawWidth: 500,
      drawHeight: 250,
      left: 250,
      top: 125,
      right: 750,
      bottom: 375,
    },
  );
});

test("mediaLayerBounds can reuse precomputed layer opacity", () => {
  const layer = {
    element: { naturalWidth: 100, naturalHeight: 100 },
    fit: "contain",
    opacity: 0,
    scale: 50,
  };

  assert.equal(mediaLayerBounds(200, 200, layer), null);
  const bounds = mediaLayerBounds(200, 200, layer, 0, null, {
    precomputedOpacity: 0.4,
  });
  assert.equal(bounds.opacity, 0.4);
  assert.equal(bounds.drawWidth, 100);
  assert.equal(bounds.drawHeight, 100);
});

test("mediaTextAvoidanceBounds skips hidden and transparent layers", () => {
  const layers = [
    {
      element: { naturalWidth: 100, naturalHeight: 100 },
      opacity: 100,
      visible: true,
    },
    {
      element: { naturalWidth: 100, naturalHeight: 100 },
      opacity: 0,
      visible: true,
    },
    {
      element: { naturalWidth: 100, naturalHeight: 100 },
      opacity: 100,
      visible: false,
    },
  ];

  assert.equal(mediaTextAvoidanceBounds(200, 200, layers).length, 1);
});

test("fitMetadataFontSize shrinks an oversized title to the safe width", () => {
  const context = fakeContext();
  // 20 chars * 0.5 * size must fit 200px -> size <= 20. Requested 60 shrinks.
  const fitted = fitMetadataFontSize(
    context,
    "TWENTY-CHARACTERS!!!",
    plainStyle,
    60,
    200,
  );
  assert.ok(fitted < 60, "font should shrink");
  assert.ok(fitted * 20 * 0.5 <= 200 + 0.5, "fitted text fits the width");
});

test("fitMetadataFontSize leaves a title that already fits untouched", () => {
  const context = fakeContext();
  assert.equal(fitMetadataFontSize(context, "Short", plainStyle, 30, 400), 30);
});

test("fitMetadataFontSize honors the 9px floor and ignores a zero budget", () => {
  const context = fakeContext();
  assert.equal(
    fitMetadataFontSize(context, "A very very long line", plainStyle, 80, 1),
    9,
  );
  assert.equal(fitMetadataFontSize(context, "Anything", plainStyle, 42, 0), 42);
});

test("cover layer fade-out is proportional to video duration", () => {
  const layer = {
    opacity: 80,
    coverFadeOut: { enabled: true, endPercent: 25 },
  };

  assert.equal(effectiveLayerOpacity(layer, 0, 20), 0.8);
  assert.equal(effectiveLayerOpacity(layer, 14.9, 20), 0.8);
  assert.equal(effectiveLayerOpacity(layer, 17.5, 20), 0.4);
  assert.equal(effectiveLayerOpacity(layer, 20, 20), 0);
  assert.equal(effectiveLayerOpacity(layer, 24, 20), 0);
});

test("text fade-out runs during the final configured percentage", () => {
  const textStyle = {
    opacity: 60,
    fadeOut: { enabled: true, endPercent: 50 },
  };
  const coverLayer = {
    opacity: 90,
    coverFadeOut: { enabled: true, endPercent: 25 },
  };

  assert.equal(effectiveTextOpacity(textStyle, 4.9, 10), 0.6);
  assert.equal(effectiveTextOpacity(textStyle, 7.5, 10), 0.3);
  assert.equal(effectiveLayerOpacity(coverLayer, 7.5, 10), 0.9);
  assert.equal(effectiveLayerOpacity(coverLayer, 8.75, 10), 0.45);
});

test("timed fade-out starts at a configured video percentage", () => {
  const layer = {
    opacity: 80,
    coverFadeOut: {
      enabled: true,
      mode: "timed",
      startPercent: 10,
      durationSeconds: 2,
      endPercent: 25,
    },
  };
  const textStyle = {
    opacity: 60,
    fadeOut: {
      enabled: true,
      mode: "timed",
      startPercent: 10,
      durationSeconds: 2,
      endPercent: 50,
    },
  };

  assert.equal(effectiveLayerOpacity(layer, 0.9, 10), 0.8);
  assert.equal(effectiveLayerOpacity(layer, 2, 10), 0.4);
  assert.equal(effectiveLayerOpacity(layer, 3, 10), 0);
  assert.equal(effectiveTextOpacity(textStyle, 2, 10), 0.3);
});

test("disabled fade preserves base opacity for layers and text", () => {
  assert.equal(effectiveLayerOpacity({ opacity: 42 }, 9, 10), 0.42);
  assert.equal(effectiveTextOpacity({ opacity: 73 }, 9, 10), 0.73);
});

test("layer fade-in ramps opacity up from zero over its duration", () => {
  const layer = {
    opacity: 80,
    fadeIn: { enabled: true, startPercent: 0, durationSeconds: 2 },
  };

  assert.equal(effectiveLayerOpacity(layer, 0, 20), 0);
  assert.equal(effectiveLayerOpacity(layer, 1, 20), 0.4);
  assert.equal(effectiveLayerOpacity(layer, 2, 20), 0.8);
  assert.equal(effectiveLayerOpacity(layer, 12, 20), 0.8);
});

test("fade-in can start at a configured video percentage", () => {
  const layer = {
    opacity: 100,
    fadeIn: { enabled: true, startPercent: 10, durationSeconds: 2 },
  };

  assert.equal(effectiveLayerOpacity(layer, 1, 20), 0);
  assert.equal(effectiveLayerOpacity(layer, 2, 20), 0);
  assert.equal(effectiveLayerOpacity(layer, 3, 20), 0.5);
  assert.equal(effectiveLayerOpacity(layer, 4, 20), 1);
});

test("text fade-in ramps opacity up from zero", () => {
  const style = { opacity: 60, fadeIn: { enabled: true, durationSeconds: 2 } };

  assert.equal(effectiveTextOpacity(style, 0, 10), 0);
  assert.equal(effectiveTextOpacity(style, 1, 10), 0.3);
  assert.equal(effectiveTextOpacity(style, 2, 10), 0.6);
});

test("fade-in and fade-out multiply across the clip", () => {
  const layer = {
    opacity: 100,
    fadeIn: { enabled: true, durationSeconds: 2 },
    coverFadeOut: { enabled: true, endPercent: 25 },
  };

  assert.equal(effectiveLayerOpacity(layer, 1, 20), 0.5);
  assert.equal(effectiveLayerOpacity(layer, 10, 20), 1);
  assert.equal(effectiveLayerOpacity(layer, 17.5, 20), 0.5);
});

test("zoom scale eases linearly from start to end across the clip", () => {
  const zoomIn = { enabled: true, from: 100, to: 120 };

  assert.equal(effectiveZoomScale(zoomIn, 0, 10), 1);
  assert.equal(effectiveZoomScale(zoomIn, 5, 10), 1.1);
  assert.equal(effectiveZoomScale(zoomIn, 10, 10), 1.2);
});

test("zoom supports zoom-out and stays neutral when disabled", () => {
  assert.equal(
    effectiveZoomScale({ enabled: true, from: 120, to: 100 }, 5, 10),
    1.1,
  );
  assert.equal(effectiveZoomScale(undefined, 5, 10), 1);
  assert.equal(
    effectiveZoomScale({ enabled: false, from: 100, to: 200 }, 5, 10),
    1,
  );
});

test("legacy render stack starts with atmosphere", () => {
  const scene = { rendererId: "audio-dark", cloudLight: { enabled: false } };
  const stack = legacyRenderStack(scene, { layers: [] });
  assert.equal(stack[0].kind, "atmosphere");
  assert.equal(stack[1].kind, "post");
});

test("legacy render stack includes sun-focus when cloudLight is enabled and not volumetric-clouds", () => {
  const scene = {
    rendererId: "liquid-mesh",
    cloudLight: { enabled: true },
    waveform: { visible: false },
  };
  const stack = legacyRenderStack(scene, { layers: [] });
  assert.equal(stack[0].kind, "atmosphere");
  assert.equal(stack[1].kind, "sun-focus");
  assert.equal(stack[2].kind, "post");
});

test("stacked atmosphere scenes render one atmosphere item per layer", () => {
  const scene = normalizeVisualSettings({
    id: "liquid-mesh",
    atmosphereLayers: [
      { scene: { id: "liquid-mesh" } },
      {
        opacity: 55,
        blendMode: "screen",
        scene: { id: "fractal-sphere" },
      },
    ],
  });
  const stack = legacyRenderStack(scene, { layers: [] });
  const atmosphereItems = stack.filter((item) => item.kind === "atmosphere");

  assert.equal(atmosphereItems.length, 2);
  assert.equal(atmosphereItems[0].layerId, "atmosphere-base");
  assert.equal(atmosphereItems[1].layerId, "atmosphere-2");
  assert.equal(
    stack.some((item) => item.kind === "sun-focus"),
    false,
  );
  assert.equal(stack[2].kind, "post");
});

test("legacy render stack places post after volumetric-clouds atmosphere", () => {
  const scene = {
    rendererId: "volumetric-clouds",
    cloudLight: { enabled: true },
    waveform: { visible: false },
  };
  const stack = legacyRenderStack(scene, { layers: [] });
  assert.equal(stack.length, 2);
  assert.equal(stack[0].kind, "atmosphere");
  assert.equal(stack[1].kind, "post");
});

test("legacy render stack includes media layers in reverse order", () => {
  const layers = [
    { id: "a", order: 0, visible: true, element: "img" },
    { id: "b", order: 1, visible: true, element: "img" },
  ];
  const scene = {
    rendererId: "audio-dark",
    cloudLight: { enabled: false },
    waveform: { visible: false },
  };
  const stack = legacyRenderStack(scene, { layers });
  assert.equal(stack[0].kind, "atmosphere");
  assert.equal(stack[1].kind, "post");
  assert.equal(stack[2].kind, "media");
  assert.equal(stack[2].layerId, "b");
  assert.equal(stack[3].kind, "media");
  assert.equal(stack[3].layerId, "a");
});

test("legacy render stack includes vinyl when renderer is vinyl", () => {
  const scene = {
    rendererId: "vinyl",
    cloudLight: { enabled: false },
    waveform: { visible: false },
  };
  const stack = legacyRenderStack(scene, { layers: [] });
  assert.equal(
    stack.some((item) => item.kind === "vinyl"),
    true,
  );
});

test("legacy render stack includes waveform when visible", () => {
  const scene = {
    rendererId: "audio-dark",
    cloudLight: { enabled: false },
    waveform: { visible: true },
  };
  const stack = legacyRenderStack(scene, { layers: [] });
  assert.equal(
    stack.some((item) => item.kind === "waveform"),
    true,
  );
});

test("legacy render stack omits hidden media layers", () => {
  const layers = [
    { id: "a", order: 0, visible: true, element: "img" },
    { id: "b", order: 1, visible: false, element: "img" },
  ];
  const scene = {
    rendererId: "audio-dark",
    cloudLight: { enabled: false },
    waveform: { visible: false },
  };
  const stack = legacyRenderStack(scene, { layers });
  const mediaItems = stack.filter((item) => item.kind === "media");
  assert.equal(mediaItems.length, 1);
  assert.equal(mediaItems[0].layerId, "a");
});

test("WebGL runtime registers every scalar audio uniform used by shaders", () => {
  assert.deepEqual(shaderAudioUniformNames, [
    "audioEnergy",
    "audioBass",
    "audioMid",
    "audioHigh",
    "audioCentroid",
    "audioFlux",
    "audioOnset",
    "audioBeat",
    "beatPhase",
  ]);
});

test("scene runtime refreshes cached atmosphere and media stack on updates", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const runtime = createSceneRuntime(
      fakeCanvas(context),
      normalizeVisualSettings({ id: "vector-aura" }),
      { showMetadata: false },
    );

    runtime.render(0);
    const singleAtmosphereFillRects = context.calls.fillRect.length;
    assert.ok(singleAtmosphereFillRects > 0);

    runtime.setScene(
      normalizeVisualSettings({
        id: "vector-aura",
        atmosphereLayers: [
          { scene: { id: "vector-aura" } },
          {
            opacity: 55,
            blendMode: "screen",
            scene: { id: "vector-aura" },
          },
        ],
      }),
    );
    runtime.render(0);
    const stackedAtmosphereFillRects =
      context.calls.fillRect.length - singleAtmosphereFillRects;
    assert.ok(stackedAtmosphereFillRects > singleAtmosphereFillRects);

    runtime.setComposition({
      showMetadata: false,
      renderOrder: [{ kind: "media", layerId: "media-a", order: 0 }],
      layers: [fakeMediaLayer("media-a")],
    });
    runtime.render(0);
    assert.equal(context.calls.drawImage.at(-1), "media-a");

    runtime.setComposition({
      showMetadata: false,
      renderOrder: [{ kind: "media", layerId: "media-b", order: 0 }],
      layers: [fakeMediaLayer("media-b")],
    });
    runtime.render(0);
    assert.equal(context.calls.drawImage.at(-1), "media-b");

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime renders the pre-resolved stack without per-frame map lookups", () => {
  const cleanup = installFakeDocument();
  const originalMapGet = Map.prototype.get;
  let runtime = null;
  try {
    const context = fakeCanvasContext();
    runtime = createSceneRuntime(
      fakeCanvas(context),
      normalizeVisualSettings({
        id: "vector-aura",
        atmosphereLayers: [
          { scene: { id: "vector-aura" } },
          {
            opacity: 55,
            blendMode: "screen",
            scene: { id: "vector-aura" },
          },
        ],
      }),
      {
        showMetadata: false,
        renderOrder: [
          { kind: "atmosphere", layerId: "atmosphere-2" },
          { kind: "media", layerId: "media-a", order: 0 },
        ],
        layers: [fakeMediaLayer("media-a")],
      },
    );

    Map.prototype.get = function forbiddenFrameLookup() {
      throw new Error("Map.get should not run during frame render");
    };

    runtime.render(0);
    assert.equal(context.calls.drawImage.at(-1), "media-a");
  } finally {
    Map.prototype.get = originalMapGet;
    runtime?.destroy();
    cleanup();
  }
});

test("WebGL scene runtime uploads static uniforms only when scene or size changes", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const canvas = fakeCanvas(context);
    const runtime = createSceneRuntime(
      canvas,
      normalizeVisualSettings({ id: "liquid-mesh" }),
      { showMetadata: false },
    );
    const initialBindBufferCount = cleanup.gl.calls.bindBuffer.length;

    runtime.render(0);
    const firstUniform1fCount = cleanup.gl.calls.uniform1f.length;
    const firstUniform2fCount = cleanup.gl.calls.uniform2f.length;
    const firstUniform3fvCount = cleanup.gl.calls.uniform3fv.length;
    const firstBindBufferCount = cleanup.gl.calls.bindBuffer.length;
    const firstEnableVertexAttribArrayCount =
      cleanup.gl.calls.enableVertexAttribArray.length;
    const firstUseProgramCount = cleanup.gl.calls.useProgram.length;
    const firstVertexAttribPointerCount =
      cleanup.gl.calls.vertexAttribPointer.length;
    const firstViewportCount = cleanup.gl.calls.viewport.length;
    assert.ok(firstUniform1fCount > 10);
    assert.equal(firstUniform2fCount, 1);
    assert.equal(firstUniform3fvCount, 4);
    assert.equal(firstBindBufferCount, initialBindBufferCount + 1);
    assert.equal(firstEnableVertexAttribArrayCount, 1);
    assert.equal(firstUseProgramCount, 1);
    assert.equal(firstVertexAttribPointerCount, 1);
    assert.equal(firstViewportCount, 1);

    runtime.render(0.5);
    const secondUniform1fCount =
      cleanup.gl.calls.uniform1f.length - firstUniform1fCount;
    const secondUniform2fCount =
      cleanup.gl.calls.uniform2f.length - firstUniform2fCount;
    const secondUniform3fvCount =
      cleanup.gl.calls.uniform3fv.length - firstUniform3fvCount;
    assert.equal(secondUniform1fCount, 10);
    assert.equal(secondUniform2fCount, 0);
    assert.equal(secondUniform3fvCount, 0);
    assert.equal(cleanup.gl.calls.bindBuffer.length, firstBindBufferCount);
    assert.equal(
      cleanup.gl.calls.enableVertexAttribArray.length,
      firstEnableVertexAttribArrayCount,
    );
    assert.equal(cleanup.gl.calls.useProgram.length, firstUseProgramCount);
    assert.equal(
      cleanup.gl.calls.vertexAttribPointer.length,
      firstVertexAttribPointerCount,
    );
    assert.equal(cleanup.gl.calls.viewport.length, firstViewportCount);

    canvas.clientWidth = 160;
    canvas.clientHeight = 90;
    runtime.render(1);
    const resizedUniform1fCount =
      cleanup.gl.calls.uniform1f.length -
      firstUniform1fCount -
      secondUniform1fCount;
    assert.ok(resizedUniform1fCount > secondUniform1fCount);
    assert.equal(cleanup.gl.calls.uniform2f.length, 2);
    assert.equal(cleanup.gl.calls.bindBuffer.length, firstBindBufferCount);
    assert.equal(cleanup.gl.calls.useProgram.length, firstUseProgramCount);
    assert.equal(cleanup.gl.calls.viewport.length, firstViewportCount + 1);

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("WebGL scene runtime keeps static uniforms cached per shader program", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const runtime = createSceneRuntime(
      fakeCanvas(context),
      normalizeVisualSettings({
        id: "liquid-mesh",
        atmosphereLayers: [
          { scene: { id: "liquid-mesh" } },
          {
            opacity: 55,
            blendMode: "screen",
            scene: { id: "fractal-sphere" },
          },
        ],
      }),
      { showMetadata: false },
    );

    runtime.render(0);
    const firstUniform1fCount = cleanup.gl.calls.uniform1f.length;
    const firstUniform2fCount = cleanup.gl.calls.uniform2f.length;
    const firstUniform3fvCount = cleanup.gl.calls.uniform3fv.length;

    runtime.render(0.5);
    assert.equal(cleanup.gl.calls.uniform1f.length - firstUniform1fCount, 20);
    assert.equal(cleanup.gl.calls.uniform2f.length - firstUniform2fCount, 0);
    assert.equal(cleanup.gl.calls.uniform3fv.length - firstUniform3fvCount, 0);

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime reuses grain post buffers between frames", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const canvas = fakeCanvas(context);
    const runtime = createSceneRuntime(
      canvas,
      normalizeVisualSettings({
        id: "vector-aura",
        post: { grain: 50 },
      }),
      { showMetadata: false },
    );

    runtime.render(0, 24);
    assert.equal(context.calls.createImageData.length, 1);
    assert.equal(cleanup.createdCanvases.length, 2);
    const grainContext = cleanup.canvasContexts.at(-1);
    assert.equal(grainContext.calls.putImageData.length, 1);

    runtime.render(1 / 24, 24);
    assert.equal(context.calls.createImageData.length, 1);
    assert.equal(cleanup.createdCanvases.length, 2);
    assert.equal(grainContext.calls.putImageData.length, 2);

    canvas.clientWidth = 160;
    canvas.clientHeight = 90;
    runtime.render(2 / 24, 24);
    assert.equal(context.calls.createImageData.length, 2);
    assert.equal(cleanup.createdCanvases.length, 3);

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime writes grain bytes with the same seeded pattern", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const canvas = fakeCanvas(context);
    canvas.clientWidth = 2;
    canvas.clientHeight = 2;
    const runtime = createSceneRuntime(
      canvas,
      normalizeVisualSettings({
        id: "vector-aura",
        post: { grain: 50 },
      }),
      { showMetadata: false },
    );

    runtime.render(1 / 24, 24);

    const grainContext = cleanup.canvasContexts.at(-1);
    const image = grainContext.calls.putImageData.at(-1)[0];
    assert.deepEqual(
      Array.from(image.data),
      expectedGrainBytes({ alpha: 14, frameSeed: 1, pixels: 4 }),
    );

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime renders canvas 2d atmosphere renderers", () => {
  const cleanup = installFakeDocument();
  try {
    for (const id of ["vector-aura", "playful-shapes", "piano-ribbons"]) {
      const context = fakeCanvasContext();
      const runtime = createSceneRuntime(
        fakeCanvas(context),
        normalizeVisualSettings({ id }),
        { showMetadata: false },
      );
      runtime.setAudio({
        bass: 0.35,
        energy: 0.42,
        high: 0.22,
        mid: 0.3,
        spectrum: [0.12, 0.28, 0.38, 0.24],
      });

      runtime.render(0.5, 24);

      assert.ok(
        context.calls.fill.length +
          context.calls.fillRect.length +
          context.calls.fillText.length +
          context.calls.stroke.length >
          0,
        `${id} should draw into the 2d context`,
      );
      runtime.destroy();
    }
  } finally {
    cleanup();
  }
});

test("scene runtime preserves playful custom glyph collections", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const runtime = createSceneRuntime(
      fakeCanvas(context),
      normalizeVisualSettings({
        id: "playful-shapes",
        playful: {
          collections: { letters: "Q R" },
          enabled: {
            emojis: false,
            letters: true,
            numbers: false,
            rectangles: false,
          },
          seed: 19,
        },
      }),
      { showMetadata: false },
    );

    runtime.render(0.5, 24);

    const glyphs = context.calls.fillText.map(([text]) => text);
    assert.ok(glyphs.length > 0);
    assert.equal(glyphs.includes("•"), false);
    assert.ok(glyphs.every((text) => ["Q", "R"].includes(text)));
    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime reuses scanline post buffers between frames", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const canvas = fakeCanvas(context);
    const runtime = createSceneRuntime(
      canvas,
      normalizeVisualSettings({
        id: "vector-aura",
        post: { scanlines: 50 },
      }),
      { showMetadata: false },
    );

    runtime.render(0, 24);
    assert.equal(cleanup.createdCanvases.length, 2);
    const scanlineContext = cleanup.canvasContexts.at(-1);
    const firstScanlineRectCount = scanlineContext.calls.fillRect.length;
    assert.ok(firstScanlineRectCount > 0);

    runtime.render(1 / 24, 24);
    assert.equal(cleanup.createdCanvases.length, 2);
    assert.equal(scanlineContext.calls.fillRect.length, firstScanlineRectCount);

    canvas.clientWidth = 160;
    canvas.clientHeight = 90;
    runtime.render(2 / 24, 24);
    assert.equal(cleanup.createdCanvases.length, 3);
    assert.ok(cleanup.canvasContexts.at(-1).calls.fillRect.length > 0);

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime reuses vignette post buffers between frames", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const canvas = fakeCanvas(context);
    const runtime = createSceneRuntime(
      canvas,
      normalizeVisualSettings({
        id: "vector-aura",
        post: { vignette: 50 },
      }),
      { showMetadata: false },
    );

    runtime.render(0, 24);
    assert.equal(cleanup.createdCanvases.length, 2);
    const vignetteContext = cleanup.canvasContexts.at(-1);
    assert.equal(vignetteContext.calls.createRadialGradient.length, 1);
    assert.equal(vignetteContext.calls.fillRect.length, 1);

    runtime.render(1 / 24, 24);
    assert.equal(cleanup.createdCanvases.length, 2);
    assert.equal(vignetteContext.calls.createRadialGradient.length, 1);
    assert.equal(vignetteContext.calls.fillRect.length, 1);

    canvas.clientWidth = 160;
    canvas.clientHeight = 90;
    runtime.render(2 / 24, 24);
    assert.equal(cleanup.createdCanvases.length, 3);
    assert.equal(
      cleanup.canvasContexts.at(-1).calls.createRadialGradient.length,
      1,
    );

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime reuses metadata layout between frames", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const canvas = fakeCanvas(context);
    const runtime = createSceneRuntime(
      canvas,
      normalizeVisualSettings({ id: "vector-aura" }),
      {
        metadata: {
          title: "A title long enough to require measurement",
          artist: "Sonara Artist",
        },
        textSettings: {
          fields: { title: true, artist: true },
          order: ["title", "artist"],
        },
      },
    );

    runtime.render(0, 24);
    const firstMeasureCount = context.calls.measureText.length;
    const firstTextDrawCount = context.calls.fillText.length;
    assert.ok(firstMeasureCount > 0);
    assert.ok(firstTextDrawCount > 0);

    runtime.render(1 / 24, 24);
    assert.equal(context.calls.measureText.length, firstMeasureCount);
    assert.ok(context.calls.fillText.length > firstTextDrawCount);

    canvas.clientWidth = 160;
    canvas.clientHeight = 90;
    runtime.render(2 / 24, 24);
    const resizedMeasureCount = context.calls.measureText.length;
    assert.ok(resizedMeasureCount > firstMeasureCount);

    runtime.setComposition({
      metadata: {
        title: "A replacement title should rebuild layout",
        artist: "Sonara Artist",
      },
      textSettings: {
        fields: { title: true, artist: true },
        order: ["title", "artist"],
      },
    });
    runtime.render(3 / 24, 24);
    assert.ok(context.calls.measureText.length > resizedMeasureCount);
    assert.ok(
      context.calls.fillText.some(([text]) =>
        String(text).includes("replacement title"),
      ),
    );

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime invalidates metadata layout when duration changes", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const canvas = fakeCanvas(context);
    const composition = {
      durationSeconds: 10,
      layers: [
        {
          ...fakeMediaLayer("duration-media"),
          fadeIn: { enabled: true, durationSeconds: 2 },
        },
      ],
      metadata: {
        title: "Duration-sensitive metadata",
        artist: "Sonara Artist",
      },
      textSettings: {
        fields: { title: true, artist: true },
        order: ["title", "artist"],
      },
    };
    const runtime = createSceneRuntime(
      canvas,
      normalizeVisualSettings({ id: "vector-aura" }),
      composition,
    );

    runtime.render(0, 24);
    const firstMeasureCount = context.calls.measureText.length;
    assert.ok(firstMeasureCount > 0);

    composition.durationSeconds = 20;
    runtime.render(1 / 24, 24);
    assert.ok(context.calls.measureText.length > firstMeasureCount);

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime draws filled ribbon waveform without mutating samples", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const samples = [0, 0.4, -0.2, 0.65, -0.35, 0.1];
    const runtime = createSceneRuntime(
      fakeCanvas(context),
      normalizeVisualSettings({
        id: "liquid-mesh",
        waveform: {
          visible: true,
          type: "filled-ribbon",
          smoothing: 0,
          audioReaction: 0,
          opacity: 80,
          position: 50,
          height: 28,
          width: 80,
          thickness: 2,
          colorMode: "single",
          color: "#ffffff",
        },
      }),
      { showMetadata: false },
    );
    runtime.setAudio({ samples });

    runtime.render(0, 24);

    assert.deepEqual(samples, [0, 0.4, -0.2, 0.65, -0.35, 0.1]);
    assert.ok(context.calls.moveTo.length > 0);
    assert.ok(context.calls.lineTo.length >= samples.length * 2 - 1);
    assert.ok(context.calls.closePath.length > 0);
    assert.deepEqual(context.calls.moveTo[0], [10, 25]);
    assert.equal(context.calls.lineTo[0][0], 26);
    assert.ok(Math.abs(context.calls.lineTo[0][1] - 24.02) < 0.001);

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime paints spectrum bars with the precomputed waveform palette", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const runtime = createSceneRuntime(
      fakeCanvas(context),
      normalizeVisualSettings({
        id: "liquid-mesh",
        waveform: {
          visible: true,
          type: "spectrum-bars",
          smoothing: 0,
          audioReaction: 0,
          opacity: 50,
          position: 50,
          height: 28,
          width: 80,
          thickness: 2,
          colorMode: "gradient",
          color: "#ff0000",
          secondaryColor: "#00ff00",
          tertiaryColor: "#0000ff",
          advanced: {
            barGap: 0,
            barPeakHold: 0,
            barRadius: 0,
          },
        },
      }),
      { showMetadata: false },
    );
    runtime.setAudio({ spectrum: [0.2, 0.4, 0.6] });

    runtime.render(0, 24);

    assert.deepEqual(context.calls.fill.slice(-3), [
      "rgba(255,0,0,0.5)",
      "rgba(0,255,0,0.5)",
      "rgba(0,0,255,0.5)",
    ]);
    assert.equal(context.calls.createLinearGradient.length, 0);

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime preserves waveform audio arrays across partial updates", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const samples = [0, 0.5, -0.25];
    const runtime = createSceneRuntime(
      fakeCanvas(context),
      normalizeVisualSettings({
        id: "liquid-mesh",
        waveform: {
          visible: true,
          type: "single-line",
          smoothing: 0,
          audioReaction: 0,
          opacity: 80,
          position: 50,
          height: 28,
          width: 80,
          thickness: 2,
          colorMode: "single",
          color: "#ffffff",
        },
      }),
      { showMetadata: false },
    );

    runtime.setAudio({ samples, spectrum: [] });
    runtime.render(0, 24);
    const firstLineCount = context.calls.lineTo.length;
    assert.equal(firstLineCount, samples.length - 1);

    const partialAudio = Object.create({ samples: [1, 1, 1, 1, 1] });
    partialAudio.energy = 1;
    runtime.setAudio(partialAudio);
    runtime.render(1 / 24, 24);
    assert.equal(
      context.calls.lineTo.length - firstLineCount,
      samples.length - 1,
    );

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime reuses waveform gradient paints between frames", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const canvas = fakeCanvas(context);
    const gradientWaveform = {
      visible: true,
      type: "single-line",
      smoothing: 0,
      audioReaction: 0,
      opacity: 80,
      position: 50,
      height: 28,
      width: 80,
      thickness: 2,
      colorMode: "gradient",
      color: "#ff0000",
      secondaryColor: "#00ff00",
      tertiaryColor: "#0000ff",
    };
    const runtime = createSceneRuntime(
      canvas,
      normalizeVisualSettings({
        id: "liquid-mesh",
        waveform: gradientWaveform,
      }),
      { showMetadata: false },
    );
    runtime.setAudio({ samples: [0, 0.5, -0.25] });

    runtime.render(0, 24);
    assert.equal(context.calls.createLinearGradient.length, 1);

    runtime.render(1 / 24, 24);
    assert.equal(context.calls.createLinearGradient.length, 1);

    canvas.clientWidth = 160;
    canvas.clientHeight = 90;
    runtime.render(2 / 24, 24);
    assert.equal(context.calls.createLinearGradient.length, 2);

    runtime.setScene(
      normalizeVisualSettings({
        id: "liquid-mesh",
        waveform: {
          ...gradientWaveform,
          color: "#ffffff",
        },
      }),
    );
    runtime.render(3 / 24, 24);
    assert.equal(context.calls.createLinearGradient.length, 3);

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime reuses radial waveform ring gradients", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const runtime = createSceneRuntime(
      fakeCanvas(context),
      normalizeVisualSettings({
        id: "liquid-mesh",
        waveform: {
          visible: true,
          type: "radial-ring",
          smoothing: 0,
          audioReaction: 0,
          opacity: 70,
          position: 50,
          height: 28,
          width: 80,
          thickness: 2,
          colorMode: "gradient",
          color: "#ff0000",
          secondaryColor: "#00ff00",
          tertiaryColor: "#0000ff",
          advanced: {
            radialArc: 100,
            radialGlow: 0,
            radialRadius: 20,
            radialRotation: 0,
          },
        },
      }),
      { showMetadata: false },
    );
    runtime.setAudio({ spectrum: [0.2, 0.4, 0.6] });

    runtime.render(0, 24);
    assert.equal(context.calls.createLinearGradient.length, 2);

    runtime.render(1 / 24, 24);
    assert.equal(context.calls.createLinearGradient.length, 2);

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime reuses radial waveform angle geometry", () => {
  const cleanup = installFakeDocument();
  const originalCos = Math.cos;
  const originalSin = Math.sin;
  try {
    const context = fakeCanvasContext();
    const spectrum = [0.2, 0.4, 0.6, 0.3];
    let cosCalls = 0;
    let sinCalls = 0;
    const runtime = createSceneRuntime(
      fakeCanvas(context),
      normalizeVisualSettings({
        id: "liquid-mesh",
        waveform: {
          visible: true,
          type: "radial-ring",
          smoothing: 0,
          audioReaction: 0,
          opacity: 70,
          position: 50,
          height: 28,
          width: 80,
          thickness: 2,
          colorMode: "single",
          color: "#ffffff",
          advanced: {
            radialArc: 100,
            radialGlow: 0,
            radialRadius: 20,
            radialRotation: 0,
          },
        },
      }),
      { showMetadata: false },
    );
    runtime.setAudio({ spectrum });
    Math.cos = (...args) => {
      cosCalls += 1;
      return originalCos(...args);
    };
    Math.sin = (...args) => {
      sinCalls += 1;
      return originalSin(...args);
    };

    runtime.render(0, 24);
    assert.equal(cosCalls, spectrum.length);
    assert.equal(sinCalls, spectrum.length * 2);
    const firstCosCalls = cosCalls;
    const firstSinCalls = sinCalls;

    runtime.render(1 / 24, 24);
    assert.equal(cosCalls, firstCosCalls);
    assert.equal(sinCalls - firstSinCalls, spectrum.length);

    runtime.destroy();
  } finally {
    Math.cos = originalCos;
    Math.sin = originalSin;
    cleanup();
  }
});

test("scene runtime refreshes cached waveform paints when spectrum or scene changes", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const spectrumScene = {
      id: "liquid-mesh",
      waveform: {
        visible: true,
        type: "spectrum-bars",
        smoothing: 0,
        audioReaction: 0,
        opacity: 50,
        position: 50,
        height: 28,
        width: 80,
        thickness: 2,
        colorMode: "gradient",
        color: "#ff0000",
        secondaryColor: "#00ff00",
        tertiaryColor: "#0000ff",
        advanced: {
          barGap: 0,
          barPeakHold: 0,
          barRadius: 0,
        },
      },
    };
    const runtime = createSceneRuntime(
      fakeCanvas(context),
      normalizeVisualSettings(spectrumScene),
      { showMetadata: false },
    );

    runtime.setAudio({ spectrum: [0.2, 0.4, 0.6] });
    runtime.render(0, 24);
    assert.deepEqual(context.calls.fill.slice(-3), [
      "rgba(255,0,0,0.5)",
      "rgba(0,255,0,0.5)",
      "rgba(0,0,255,0.5)",
    ]);

    runtime.setAudio({ spectrum: [0.2, 0.3, 0.4, 0.5, 0.6] });
    runtime.render(1 / 24, 24);
    assert.deepEqual(context.calls.fill.slice(-5), [
      "rgba(255,0,0,0.5)",
      "rgba(128,128,0,0.5)",
      "rgba(0,255,0,0.5)",
      "rgba(0,128,128,0.5)",
      "rgba(0,0,255,0.5)",
    ]);

    runtime.setScene(
      normalizeVisualSettings({
        ...spectrumScene,
        waveform: {
          ...spectrumScene.waveform,
          colorMode: "single",
          color: "#ffffff",
          secondaryColor: "#ffffff",
          tertiaryColor: "#ffffff",
        },
      }),
    );
    runtime.render(2 / 24, 24);
    assert.deepEqual(context.calls.fill.slice(-5), [
      "rgba(255,255,255,0.5)",
      "rgba(255,255,255,0.5)",
      "rgba(255,255,255,0.5)",
      "rgba(255,255,255,0.5)",
      "rgba(255,255,255,0.5)",
    ]);

    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime skips sample processing for spectrum bars", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const hostileSamples = {
      get length() {
        throw new Error("spectrum bars should not read waveform samples");
      },
    };
    const runtime = createSceneRuntime(
      fakeCanvas(context),
      normalizeVisualSettings({
        id: "liquid-mesh",
        waveform: {
          visible: true,
          type: "spectrum-bars",
          opacity: 50,
          position: 50,
          height: 28,
          width: 80,
          thickness: 2,
          colorMode: "single",
          color: "#ffffff",
          advanced: {
            barGap: 0,
            barPeakHold: 0,
            barRadius: 0,
          },
        },
      }),
      { showMetadata: false },
    );
    runtime.setAudio({ samples: hostileSamples, spectrum: [0.2, 0.4, 0.6] });

    runtime.render(0, 24);

    assert.ok(context.calls.fill.length >= 3);
    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime skips sample processing for radial ring", () => {
  const cleanup = installFakeDocument();
  try {
    const context = fakeCanvasContext();
    const hostileSamples = {
      get length() {
        throw new Error("radial ring should not read waveform samples");
      },
    };
    const runtime = createSceneRuntime(
      fakeCanvas(context),
      normalizeVisualSettings({
        id: "liquid-mesh",
        waveform: {
          visible: true,
          type: "radial-ring",
          opacity: 50,
          position: 50,
          height: 28,
          width: 80,
          thickness: 2,
          colorMode: "bands",
          color: "#ff0000",
          secondaryColor: "#00ff00",
          tertiaryColor: "#0000ff",
          advanced: {
            radialArc: 100,
            radialGlow: 0,
            radialRadius: 20,
            radialRotation: 0,
          },
        },
      }),
      { showMetadata: false },
    );
    runtime.setAudio({ samples: hostileSamples, spectrum: [0.2, 0.4, 0.6] });

    runtime.render(0, 24);

    assert.ok(context.calls.arc.length >= 2);
    assert.ok(context.calls.stroke.includes("rgba(255,0,0,0.5)"));
    assert.ok(context.calls.stroke.includes("rgba(0,255,0,0.5)"));
    assert.ok(context.calls.stroke.includes("rgba(0,0,255,0.5)"));
    runtime.destroy();
  } finally {
    cleanup();
  }
});

test("scene runtime draws waveform synthetic fallbacks", () => {
  const cleanup = installFakeDocument();
  try {
    const lineContext = fakeCanvasContext();
    const lineRuntime = createSceneRuntime(
      fakeCanvas(lineContext),
      normalizeVisualSettings({
        id: "liquid-mesh",
        waveform: {
          visible: true,
          type: "single-line",
          smoothing: 0,
          opacity: 70,
          position: 50,
          height: 28,
          width: 80,
          thickness: 2,
          colorMode: "single",
          color: "#ffffff",
        },
      }),
      { showMetadata: false },
    );
    lineRuntime.setAudio({ energy: 0.4, samples: [], spectrum: [] });
    lineRuntime.render(0.25, 24);
    assert.ok(lineContext.calls.lineTo.length > 80);
    lineRuntime.destroy();

    const barsContext = fakeCanvasContext();
    const barsRuntime = createSceneRuntime(
      fakeCanvas(barsContext),
      normalizeVisualSettings({
        id: "liquid-mesh",
        waveform: {
          visible: true,
          type: "spectrum-bars",
          opacity: 50,
          position: 50,
          height: 28,
          width: 80,
          thickness: 2,
          colorMode: "single",
          color: "#ffffff",
          advanced: {
            barGap: 0,
            barPeakHold: 0,
            barRadius: 0,
          },
        },
      }),
      { showMetadata: false },
    );
    barsRuntime.setAudio({ energy: 0.4, samples: [], spectrum: [] });
    barsRuntime.render(0.25, 24);
    assert.ok(barsContext.calls.fill.length >= 24);
    barsRuntime.destroy();
  } finally {
    cleanup();
  }
});

function expectedGrainBytes({ alpha, frameSeed, pixels }) {
  const bytes = [];
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const value = testSeeded(frameSeed + 17, pixel, 29) > 0.5 ? 255 : 0;
    bytes.push(value, value, value, alpha);
  }
  return bytes;
}

function testSeeded(seed, index, salt = 0) {
  const value =
    Math.sin(seed * 12.9898 + index * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function installFakeDocument() {
  const originalDocument = globalThis.document;
  const gl = fakeWebglContext();
  const canvasContexts = [];
  const createdCanvases = [];
  globalThis.document = {
    createElement(tagName) {
      assert.equal(tagName, "canvas");
      const context = fakePostCanvasContext();
      const canvas = fakeDocumentCanvas(gl, context);
      canvasContexts.push(context);
      createdCanvases.push(canvas);
      return canvas;
    },
  };
  const cleanup = () => {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  };
  cleanup.gl = gl;
  cleanup.canvasContexts = canvasContexts;
  cleanup.createdCanvases = createdCanvases;
  return cleanup;
}

function fakeDocumentCanvas(gl, context2d) {
  return {
    width: 1,
    height: 1,
    addEventListener() {},
    getContext(type) {
      if (type === "webgl") return gl;
      if (type === "2d") return context2d;
      assert.fail(`unexpected canvas context type: ${type}`);
    },
  };
}

function fakePostCanvasContext() {
  const calls = {
    createRadialGradient: [],
    fillRect: [],
    putImageData: [],
  };
  const gradient = { addColorStop() {} };
  return {
    calls,
    fillStyle: "",
    createRadialGradient(...args) {
      calls.createRadialGradient.push(args);
      return gradient;
    },
    fillRect(x, y, width, height) {
      calls.fillRect.push([this.fillStyle, x, y, width, height]);
    },
    putImageData(image, x, y) {
      calls.putImageData.push([image, x, y]);
    },
  };
}

function fakeWebglContext() {
  const calls = {
    bindBuffer: [],
    drawArrays: [],
    enableVertexAttribArray: [],
    uniform1f: [],
    uniform2f: [],
    uniform3fv: [],
    useProgram: [],
    vertexAttribPointer: [],
    viewport: [],
  };
  return {
    ARRAY_BUFFER: 0x8892,
    COMPILE_STATUS: 0x8b81,
    FLOAT: 0x1406,
    FRAGMENT_SHADER: 0x8b30,
    LINK_STATUS: 0x8b82,
    STATIC_DRAW: 0x88e4,
    TRIANGLES: 0x0004,
    VERTEX_SHADER: 0x8b31,
    calls,
    attachShader() {},
    bindBuffer(...args) {
      calls.bindBuffer.push(args);
    },
    bufferData() {},
    compileShader() {},
    createBuffer: () => ({}),
    createProgram: () => ({}),
    createShader: () => ({}),
    deleteBuffer() {},
    deleteProgram() {},
    deleteShader() {},
    drawArrays(...args) {
      calls.drawArrays.push(args);
    },
    enableVertexAttribArray(...args) {
      calls.enableVertexAttribArray.push(args);
    },
    getAttribLocation: () => 0,
    getProgramInfoLog: () => "",
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getShaderParameter: () => true,
    getUniformLocation: (_program, name) => name,
    isContextLost: () => false,
    linkProgram() {},
    shaderSource() {},
    uniform1f(location, value) {
      calls.uniform1f.push([location, value]);
    },
    uniform2f(location, first, second) {
      calls.uniform2f.push([location, first, second]);
    },
    uniform3fv(location, value) {
      calls.uniform3fv.push([location, Array.from(value)]);
    },
    useProgram(program) {
      calls.useProgram.push(program);
    },
    vertexAttribPointer(...args) {
      calls.vertexAttribPointer.push(args);
    },
    viewport(...args) {
      calls.viewport.push(args);
    },
  };
}

function fakeCanvas(context) {
  return {
    width: 100,
    height: 50,
    clientWidth: 100,
    clientHeight: 50,
    getContext(type) {
      assert.equal(type, "2d");
      return context;
    },
  };
}

function fakeCanvasContext() {
  const calls = {
    arc: [],
    createImageData: [],
    createLinearGradient: [],
    drawImage: [],
    fill: [],
    fillRect: [],
    fillText: [],
    closePath: [],
    lineTo: [],
    measureText: [],
    moveTo: [],
    stroke: [],
  };
  const gradient = { addColorStop() {} };
  return {
    calls,
    fillStyle: "",
    filter: "none",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    lineWidth: 1,
    shadowBlur: 0,
    shadowColor: "transparent",
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    strokeStyle: "",
    arc(...args) {
      calls.arc.push(args);
    },
    beginPath() {},
    bezierCurveTo() {},
    clearRect() {},
    closePath() {
      calls.closePath.push(true);
    },
    createLinearGradient(...args) {
      calls.createLinearGradient.push(args);
      return gradient;
    },
    createRadialGradient: () => gradient,
    createImageData(width, height) {
      calls.createImageData.push([width, height]);
      return { data: new Uint8ClampedArray(width * height * 4) };
    },
    drawImage(element) {
      calls.drawImage.push(element.id ?? "canvas");
    },
    ellipse() {},
    fill() {
      calls.fill.push(this.fillStyle);
    },
    fillRect() {
      calls.fillRect.push(this.fillStyle);
    },
    fillText(text, x, y) {
      calls.fillText.push([text, x, y]);
    },
    lineTo(x, y) {
      calls.lineTo.push([x, y]);
    },
    measureText(value) {
      calls.measureText.push(value);
      return { width: String(value).length * 8 };
    },
    moveTo(x, y) {
      calls.moveTo.push([x, y]);
    },
    restore() {},
    quadraticCurveTo() {},
    rect() {},
    rotate() {},
    save() {},
    stroke() {
      calls.stroke.push(this.strokeStyle);
    },
    translate() {},
  };
}

function fakeMediaLayer(id) {
  return {
    id,
    kind: "image",
    element: { id, naturalWidth: 20, naturalHeight: 20 },
    visible: true,
    opacity: 100,
    scale: 50,
    x: 50,
    y: 50,
    rotation: 0,
    shadow: { opacity: 0, blur: 0, x: 0, y: 0 },
    fit: "contain",
    blendMode: "normal",
    loop: true,
    order: 0,
  };
}
