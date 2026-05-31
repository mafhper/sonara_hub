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
]) {
  test(`SVG sanitizer rejects ${label}`, () => {
    assert.throws(() => validateSafeSvg(svg));
  });
}
