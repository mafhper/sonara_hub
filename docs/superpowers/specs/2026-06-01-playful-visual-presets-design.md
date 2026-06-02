# Sonara Hub: Playful Visual Presets

## Goal

Expand the curated scene catalog with child-friendly ambient backgrounds suitable
for albums such as _Jardim dos Ventos_. The scenes must remain calm, legible,
customizable, deterministic, and compatible with the existing preview and WebM
export flow.

This iteration also improves the cloud renderer with an optional sun-like light
focus and rewrites the README around the product experience. Long development
instructions move to `docs/development.md`.

## Product Direction

The default playful composition follows the approved **curated hybrid**
direction: a calm base with a subtle rhythmic response. It uses a small number
of large, well-spaced elements rather than particle clouds. Users can reduce the
composition to a single thematic category.

Add three distinct presets:

1. `playful-shapes` - large rectangles, letters, numbers, and native emoji.
2. `color-mesh` - broad WebGL gradient fields with soft chromatic movement.
3. `piano-ribbons` - wide colored keyboard-like bands with restrained musical
   motion.

Retain the current six scene families. The catalog grows from six to nine
families without restoring removed particle effects.

## Architecture

Keep `shared/visual-effects.mjs` as the canonical scene catalog and
`shared/canvas-scene-runtime.mjs` as the shared renderer for preview,
composition thumbnails, and export.

- Render `color-mesh` with WebGL because it is a continuous color field.
- Extend `volumetric-clouds` in WebGL with an optional configurable light focus.
- Render `playful-shapes` and `piano-ribbons` in Canvas2D. Each frame is a
  deterministic function of scene settings, seed, time, and the audio envelope.
- Keep the composition order unchanged: base scene, uploaded layers, vinyl when
  selected, waveform, metadata, and shade.

No new dependency is required.

## Contract

Evolve the scene contract to V4 while accepting V3 input:

```ts
type PlayfulContent = {
  seed: number;
  motionMode: "calm" | "soft-rhythm" | "play";
  enabled: {
    rectangles: boolean;
    letters: boolean;
    numbers: boolean;
    emojis: boolean;
  };
  collections: {
    letters: string;
    numbers: string;
    emojis: string;
  };
};

type ScenePresetV4 = ScenePresetV3 & {
  schemaVersion: 4;
  playful?: PlayfulContent;
  cloudLight?: {
    enabled: boolean;
    intensity: number;
    x: number;
    y: number;
    radius: number;
    diffusion: number;
  };
};
```

Numeric animation parameters remain in `advanced`. Optional `playful` and
`cloudLight` objects store semantic controls only when relevant. V3 snapshots
and custom presets normalize into V4 defaults.

## Scene Controls

### Playful Shapes

Common controls:

- intensity
- speed
- brightness
- direction
- audio reaction

Advanced controls:

- quantity
- randomness
- depth
- diversity
- scale
- rotation
- drift

Content controls:

- motion mode: `Calm`, `Soft rhythm`, or `Play`
- enable rectangles, letters, numbers, and emoji independently
- custom letter, number, and emoji collections
- reset collections to curated defaults

The default enables all categories with the `soft-rhythm` mode. Distribution is
seeded. Depth affects scale, opacity, and apparent speed. Musical reaction stays
subtle: energy changes amplitude, bass changes scale, mids influence rotation,
and highs affect brightness.

### Color Mesh

Advanced controls:

- scale
- warp
- depth
- color spread
- drift
- softness

The shader produces broad color fields without grain or visible texture.

### Piano Ribbons

Advanced controls:

- bands
- band width
- gap
- curvature
- depth
- drift

The Canvas2D renderer draws wide colored bands inspired by piano keys. Audio
reaction influences wave amplitude and lightness without abrupt flashing.

### Volumetric Clouds

Add a contextual `Enable sun focus` toggle and contextual controls stored in
`cloudLight`:

- sun intensity
- sun horizontal position
- sun vertical position
- sun radius
- sun diffusion

The current cloud appearance remains the default because the sun focus starts
disabled.

## Input Normalization

Custom collections accept items separated by spaces, commas, semicolons, or
line breaks. Normalize repeated items, cap the item count, and cap individual
item length. Empty collections fall back to curated defaults.

Native emoji use the Chromium font stack available on the local machine. The
renderer omits invalid values and replaces unusable glyphs with a neutral
fallback without failing export.

Limit playful element counts internally so preview remains smooth and 4K export
stays predictable.

## Interface

Preserve the current inspector hierarchy:

1. atmosphere
2. movement
3. advanced settings
4. layers
5. waveform

Show a contextual `Content` subsection only for `playful-shapes`. Show sun
controls only for `volumetric-clouds`. Keep three editable scene colors and add
curated child-friendly palette options.

Custom presets persist playful content alongside atmosphere, colors, movement,
and waveform settings.

## README

Rewrite `README.md` around the user journey:

1. prepare music files
2. review tags and covers
3. preview the album catalog
4. create an ambient visual
5. export publication-ready videos

Keep setup commands and a concise feature list. Move long testing, supply-chain,
and maintenance guidance to `docs/development.md`. The README links to that
document instead of embedding operational detail.

## Error Handling

- Invalid or missing V4 fields use defaults.
- Invalid custom collections never break render.
- Empty enabled-category sets fall back to rectangles.
- Unsupported custom preset renderer IDs remain rejected.
- Cloud sun settings clamp to safe bounds.
- WebM validation remains mandatory before ffmpeg mux.

## Testing

Update automated coverage:

- catalog exposes nine families without particle presets
- V3 presets normalize into V4
- playful content persists through normalization
- custom collections normalize and clamp safely
- unknown renderers still fall back safely
- render smoke covers all nine presets at 720p
- additional render cases cover playful motion modes, custom emoji, piano
  ribbons, color mesh, and clouds with sun
- screenshots and pixel comparisons confirm distinct frames without blank
  output

Run before commit or push:

```powershell
npm run format:check
npm run type-check
npm test
npm run build
npm run test:ui
npm run test:render
npm run site:build
```

## Rollback

The changes are additive. Rollback removes the three new presets, restores V3
as the emitted schema version, and leaves V3 normalization intact. Existing
custom presets and snapshots continue to work throughout the migration.
