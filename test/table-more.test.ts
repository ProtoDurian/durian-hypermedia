// 0.7.0-rc.3, the owner's bullet E: a table wider than its box fades on the side that has more, and a line under it says
// to swipe; both follow the scroll. The DOM is faked here (the package tests have no DOM); the browser look is checked by
// the CSP/Trusted Types run of the example.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { markTable, moreSides } from "../src/react/table-more";

type Fake = { scrollLeft: number; clientWidth: number; scrollWidth: number; dataset: Record<string, string>; nextElementSibling: any; after: (n: any) => void; getBoundingClientRect: () => { bottom: number }; ownerDocument: any };
const box = (scrollWidth: number, clientWidth = 600, scrollLeft = 0): Fake => {
  const w: Fake = { scrollLeft, clientWidth, scrollWidth, dataset: {}, nextElementSibling: null, getBoundingClientRect: () => ({ bottom: 300 }),
    after: (n) => { w.nextElementSibling = n; n.remove = () => { w.nextElementSibling = null; }; },
    ownerDocument: { createElement: () => { const cls = new Set<string>(); return { style: {} as Record<string, string>, textContent: "", set className(v: string) { cls.add(v); }, classList: { contains: (c: string) => cls.has(c) }, getBoundingClientRect: () => ({ top: 290 }) }; } } };
  return w;
};

describe("which side of a table box has more", () => {
  test("a box that fits has no side; a wide one has the right first, both mid-way, the left at the end", () => {
    expect(moreSides(0, 600, 600)).toBe(""); expect(moreSides(0, 600, 601)).toBe("");
    expect(moreSides(0, 600, 900)).toBe("r"); expect(moreSides(150, 600, 900)).toBe("lr"); expect(moreSides(300, 600, 900)).toBe("l");
  });
});
describe("markTable: the fade mark and the swipe line follow the box", () => {
  test("a wide table gets data-more and one swipe line under it, placed 1 px under its bottom", () => {
    const w = box(900); markTable(w as any, "↔ Swipe the table to see all of it");
    expect(w.dataset.more).toBe("r");
    expect(w.nextElementSibling.textContent).toBe("↔ Swipe the table to see all of it");
    expect(w.nextElementSibling.style.transform).toBe("translateY(11px)");
    markTable(w as any, "x"); expect(w.nextElementSibling.textContent).toBe("↔ Swipe the table to see all of it"); // one line, not two
    w.scrollLeft = 300; markTable(w as any, "x"); expect(w.dataset.more).toBe("l");
  });
  test("a table that fits (or grows to fit) has no mark and no line", () => {
    const w = box(500); markTable(w as any, "x"); expect(w.dataset.more).toBeUndefined(); expect(w.nextElementSibling).toBeNull();
    const g = box(900); markTable(g as any, "x"); g.scrollWidth = 600; markTable(g as any, "x");
    expect(g.dataset.more).toBeUndefined(); expect(g.nextElementSibling).toBeNull();
  });
});
describe("wired into every document, styled, and gone in print", () => {
  test("DocumentView keeps its tables marked", () => {
    const src = readFileSync(join(import.meta.dir, "../src/react/document.tsx"), "utf8");
    expect(src).toMatch(/useTableMore\(root, /); expect(src).toMatch(/<div ref=\{root\} className=\{cx\("dh-doc"/);
  });
  test("base.css fades the marked side, keeps the line out of the flow, and drops both in print", () => {
    const css = readFileSync(join(import.meta.dir, "../src/ui/base.css"), "utf8");
    for (const s of ["r", "l", "lr"]) expect(css).toContain(`.table-wrap[data-more="${s}"] {`);
    expect(css).toMatch(/\.table-more \{ position: absolute;/);
    expect(css).toMatch(/@media print \{ \.table-wrap\[data-more\] \{ -webkit-mask-image: none; mask-image: none; \} \.table-more \{ display: none; \} \}/);
  });
});
