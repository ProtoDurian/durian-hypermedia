// Lane render: the engine's sheets reach the package's one stylesheet (dist/styles.css and the example site, both
// built by scripts/build-css.ts buildCss), scoped under .dh-doc, with no @import left.
import { expect, test } from "bun:test";
import { buildCss } from "../../../scripts/build-css";

test("the engine's root sheet and the look's token sets are in the bundle, scoped", () => {
  const css = buildCss();
  expect(css).toContain('.dh-doc .eng[data-look="stage"]');
  expect(css).toContain('.dh-doc .eng[data-look="classic"]');
  expect(css).toMatch(/\.dh-doc :where\(\.eng-p\)\s*\{[^}]*fill: var\(--ef, none\)/);
  expect(css).not.toMatch(/@import/);
});

test("look=classic keeps the text column (no full-width breakout)", () => {
  const css = buildCss();
  expect(css).toContain('figure.part-animation:has(.eng[data-look="classic"]) { --stg-want: 100%; }');
});
