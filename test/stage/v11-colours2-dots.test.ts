// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Pass 11 colours2 (via the review): a columns block's dots in dark are the role's own colour (the
// originals' periwinkle), not its dark fill; a lit column's dots are stronger (light: the border; dark: the brighter ink);
// a plain row's words sit on whole pixels, so thin stems ("11") keep their role colour.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { paint } from "../../src/ui/stage";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";

const css = readFileSync(join(import.meta.dir, "../../src/ui/theme.css"), "utf8");
const block = (start: string) => { const i = css.indexOf(start); let d = 0; const j = css.indexOf("{", i); for (let k = j; k < css.length; k++) { if (css[k] === "{") d++; else if (css[k] === "}" && --d === 0) return css.slice(j, k); } return ""; };

describe("column dots: 'dot' and 'dot-new' paints", () => {
  test("the renderer maps them to --cN-dot / --cN-dot-new, falling back to the soft fill and the border (so light keeps pale dots)", () => {
    expect(paint("role:eval:dot", { eval: 1 })).toBe("var(--c1-dot, var(--c1-soft))");
    expect(paint("role:eval:dot-new", { eval: 1 })).toBe("var(--c1-dot-new, var(--c1))");
    expect(paint("acc:dot", {})).toBe("var(--acc-dot, var(--acc-soft))");
    expect(paint("acc:dot-new", {})).toBe("var(--acc-dot-new, var(--acc))");
  });
  test("light sets neither (pale plain dots, border-coloured lit dots); both dark blocks set them to the role colour and its ink", () => {
    expect(block(":root {")).not.toContain("--c1-dot");
    for (const b of [block("@media (prefers-color-scheme: dark)"), block(':root[data-theme="dark"]')]) for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(b).toContain(`--c${k}-dot: var(--c${k});`); expect(b).toContain(`--c${k}-dot-new: var(--c${k}-ink);`);
    }
  });
});

describe("a plain row's words sit on whole pixels", () => {
  test("every cell and head of a 'rows plain' block has an integer x", () => {
    const src = "rows plain\n  ^ address | Jump(·, 32) | Jump(·, 33) | _\n  203.0.113.143:8080 ; pod-a-1x2y3 | => eval: 11 | ! 32 | ! moves at 33\n  203.0.113.209:8080 ; pod-b-4z5w6 | => eval: 28 | => eval: 28 | ~ stays";
    beginDocument();
    const c = compileStage("title: t", [{ title: "One: x", raw: src, line: 2 }, { title: "Two: y", raw: "foot: done", line: 20 }], 1, {}, { eval: 1 });
    expect(c.errors).toEqual([]);
    for (const w of [1000, 1280, 777]) { const t = layoutStage(c.model, w).items.filter((i) => i.k === "text") as any[]; const eleven = t.find((x) => x.s === "11"); expect(eleven.ink).toBe("role:eval:ink"); expect(Number.isInteger(eleven.x)).toBe(true); expect(Number.isInteger(t.find((x) => /^Jump/.test(x.s)).x)).toBe(true); }
  });
});
