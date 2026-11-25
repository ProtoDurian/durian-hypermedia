// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Pass 11 colours2 (a review of the rc.1 samples): a columns block's dots in dark are the role's own colour (the
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
    expect(paint("role:reader:dot", { reader: 1 })).toBe("var(--c1-dot, var(--c1-soft))");
    expect(paint("role:reader:dot-new", { reader: 1 })).toBe("var(--c1-dot-new, var(--c1))");
    expect(paint("acc:dot", {})).toBe("var(--acc-dot, var(--acc-soft))");
    expect(paint("acc:dot-new", {})).toBe("var(--acc-dot-new, var(--acc))");
  });
  test("light: plain dots the role colour, lit dots darker (rc.2 MUST 8); both dark blocks: the role colour and its ink", () => {
    // the package's light palette: the role's colour, or its ink where the colour is under 3:1 (theme-dots.ts)
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) { const p = new RegExp(`--c${k}-dot: (var\\(--c${k}(?:-ink)?\\));`).exec(block(":root {"))?.[1]; expect(p).toBeDefined(); expect(block(":root {")).toContain(`--c${k}-dot-new: color-mix(in oklab, ${p} 70%, #000);`); }
    for (const b of [block("@media (prefers-color-scheme: dark)"), block(':root[data-theme="dark"]')]) for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(b).toContain(`--c${k}-dot: var(--c${k});`); expect(b).toContain(`--c${k}-dot-new: var(--c${k}-ink);`);
    }
  });
});

describe("a plain row's words sit on whole pixels", () => {
  test("every cell and head of a 'rows plain' block has an integer x", () => {
    const src = "rows plain\n  ^ shelf | Move(·, 32) | Move(·, 33) | _\n  shelf 12 ; north wing | => reader: 11 | ! 32 | ! moves at 33\n  shelf 14 ; south wing | => reader: 28 | => reader: 28 | ~ stays";
    beginDocument();
    const c = compileStage("title: t", [{ title: "One: x", raw: src, line: 2 }, { title: "Two: y", raw: "foot: done", line: 20 }], 1, {}, { reader: 1 });
    expect(c.errors).toEqual([]);
    for (const w of [1000, 1280, 777]) { const t = layoutStage(c.model, w).items.filter((i) => i.k === "text") as any[]; const eleven = t.find((x) => x.s === "11"); expect(eleven.ink).toBe("role:reader:ink"); expect(Number.isInteger(eleven.x)).toBe(true); expect(Number.isInteger(t.find((x) => /^Move/.test(x.s)).x)).toBe(true); }
  });
});
