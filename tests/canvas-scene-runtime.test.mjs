import test from "node:test";
import assert from "node:assert/strict";
import {
  effectiveLayerOpacity,
  effectiveTextOpacity,
  effectiveZoomScale,
  fitMetadataFontSize,
  legacyRenderStack,
  mediaLayerBounds,
  mediaTextAvoidanceBounds,
  metadataSafeWidth,
} from "../shared/canvas-scene-runtime.mjs";

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
