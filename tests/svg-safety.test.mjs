import assert from "node:assert/strict";
import test from "node:test";
import { validateSafeSvg } from "../server/svg-safety.mjs";

test("SVG sanitizer accepts local vector artwork", () => {
  assert.doesNotThrow(() =>
    validateSafeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect width="100" height="100" fill="url(#g)"/></svg>',
    ),
  );
});

for (const [label, svg] of [
  [
    "script",
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  ],
  ["event", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
  [
    "external href",
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>',
  ],
  [
    "foreign object",
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>',
  ],
  [
    "external CSS URL",
    '<svg xmlns="http://www.w3.org/2000/svg"><style>.x { fill: url(https://example.com/a.svg) }</style></svg>',
  ],
  [
    "external CSS import",
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://example.com/a.css";</style></svg>',
  ],
  [
    "external CSS nested in an attributed style element",
    '<svg xmlns="http://www.w3.org/2000/svg"><style type="text/css">@import url(https://example.com/a.css)</style></svg>',
  ],
  [
    "escaped external CSS import",
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@\\69mport url(https://example.com/a.css)</style></svg>',
  ],
  [
    "escaped external CSS URL function",
    '<svg xmlns="http://www.w3.org/2000/svg"><style>.x { fill: u\\72l(https://example.com/a.svg) }</style></svg>',
  ],
]) {
  test(`SVG sanitizer rejects ${label}`, () => {
    assert.throws(() => validateSafeSvg(svg));
  });
}
