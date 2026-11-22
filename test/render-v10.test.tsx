// Format version 10, what the package renderer shows: candlesticks, alignment grids with regions and colours, own marks
// and prompts, the editor on a phone, Play at once, and the hydration order's markup. Server rendering and source checks:
// no browser here (the CSP script, scripts/csp-check.ts, opens every fixture in one).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { parse } from "../src/index";
import { highlight } from "../src/server";
import { parseAlign } from "../src/core/align";
import { evalChart } from "../src/core/chart";
import { chartConfig, candleWicks } from "../src/ui/chart-config";
import { Alignment } from "../src/ui/align";
import { FileTree, Terminal, Editor } from "../src/ui/parts";
import { UI } from "../src/ui/ui";
import { html as renderDoc, fixtures } from "./helpers";

const ROOT = join(import.meta.dir, "..");
const ui = UI.en;
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const TOK: Record<string, string> = { "--good": "#1CAA53", "--bad": "#F91974", "--grid": "#ddd", "--muted": "#777", "--ink": "#111", "--surface": "#fff", "--font-sans": "sans", "--c6": "#2299EE" };
const tok = (n: string) => TOK[n] ?? "#000";
const look = { tok, narrow: false, reduce: false };
const fixture = (name: string) => fixtures("format").find((f) => f.name.includes(name))!.text;

describe("candlesticks draw through the package", () => {
  const WEEK = "kind: candlestick\ntitle: A week\nx: [Mon, Tue, Wed]\nseries:\n  - name: price\n    data: [[100, 108, 98, 105], [105, 110, 101, 102], [102, 104, 95, 96]]";
  test("Chart.js config: floating bodies, wicks, good up and bad down (not colour alone), all four values in the tooltip", () => {
    const spec = Bun.YAML.parse(WEEK) as any;
    const cfg = chartConfig(spec, evalChart(spec), look);
    expect(cfg.type).toBe("bar");
    const ds = cfg.data.datasets[0];
    expect(ds.data).toEqual([[100, 105], [102, 105], [96, 102]]);
    expect(ds.candles[0]).toEqual([100, 108, 98, 105]);
    expect(ds.wickColors).toEqual([tok("--good"), tok("--bad"), tok("--bad")]);
    expect(ds.backgroundColor[1]).toBe(tok("--bad"));
    expect(ds.backgroundColor[0]).toBe(tok("--good") + "40");
    expect(cfg.options.scales.y.beginAtZero).toBe(false);
    expect(cfg.options.plugins.tooltip.callbacks.label({ dataset: ds, dataIndex: 0 })).toEqual(["Open: 100", "High: 108", "Low: 98", "Close: 105"]);
    expect(cfg.plugins).toEqual([candleWicks]);
    expect(cfg.options.scales.x.ticks.font.size).toBeGreaterThanOrEqual(12);
  });
  test("a line on top, a second axis; the tooltip words come from the page's language", () => {
    const spec = Bun.YAML.parse("kind: candlestick\nx: [a, b, c]\ny2: { label: v }\nseries:\n  - name: p\n    data: [[1, 2, 1, 2], null, [2, 3, 2, 3]]\n  - name: avg\n    kind: line\n    tone: 6\n    data: [1, 2, 3]\n  - name: vol\n    kind: line\n    axis: y2\n    data: [5, 6, 7]") as any;
    const cfg = chartConfig(spec, evalChart(spec), look);
    expect(cfg.data.datasets.map((d: any) => d.type)).toEqual(["bar", "line", "line"]);
    expect(cfg.data.datasets[0].data[1]).toBeNull();
    expect(cfg.options.scales.y2.position).toBe("right");
    const es = Bun.YAML.parse(WEEK) as any;
    const c2 = chartConfig(es, evalChart(es), { ...look, words: { open: "Apertura", high: "Máximo", low: "Mínimo", close: "Cierre" } });
    expect(c2.options.plugins.tooltip.callbacks.label({ dataset: c2.data.datasets[0], dataIndex: 1 })[0]).toBe("Apertura: 105");
  });
  test("the page with a candlestick renders its chart and the key under it", () => {
    const out = renderDoc(parse(fixture("chart-candlestick")));
    expect(out).toContain("<canvas");
    expect(out).toContain("What an LLM reads here");
  });
});

describe("alignment grids: regions, colours, arrows, any size", () => {
  const ax = (nx: number, ny: number) => `x: ${Array.from({ length: nx }, (_, i) => `c${i}`).join(" .. ")}\ny: ${Array.from({ length: ny }, (_, i) => `r${i}`).join(" .. ")}`;
  test("a 4x2 grid sets its size, cells take tones, a region spans cells, arrows add a row and a column", () => {
    const spec = parseAlign(`${ax(4, 2)}\narrows: on\nregion: c0 .. c1 / r0 "Quick wins" [good]\nc3 / r1 [warn]: Z`);
    const out = renderToString(React.createElement(Alignment, { spec, ui }));
    expect(out).toContain("--nx:4;--ny:2");
    expect(out).toContain("al-arrows");
    expect(out).toContain("al-region tone-good");
    expect(out).toContain("grid-column:3 / 5;grid-row:3 / 4");
    expect(out).toContain("tone-warn al-tint");
    expect(out).toContain("Quick wins");
    expect((out.match(/class="al-cell/g) ?? []).length).toBe(8);
  });
  test("the styles use theme tones only and scroll a wide grid inside its own box", () => {
    const css = read("src/ui/tiers.css");
    expect(css).not.toMatch(/\.al[^{]*\{[^}]*#[0-9a-fA-F]{3,6}/);
    expect(css).toContain(".al-scroll { overflow-x: auto");
  });
  test("the fixtures with a free grid and with regions render through the document", () => {
    for (const n of ["alignment-grid-any-size", "alignment-grid-colours-and-regions"]) expect(renderDoc(parse(fixture(n)))).toContain("al-");
  });
});

describe("own marks and prefixes draw through the package", () => {
  const trees = [{ title: null, rows: [
    { depth: 0, name: "app/", folder: true, badges: [], closed: false, note: "", gap: false, path: "app/" },
    { depth: 1, name: "old.ts", folder: false, badges: ["deprecated"], closed: false, note: "", gap: false, path: "app/old.ts" },
    { depth: 1, name: "new.ts", folder: false, badges: ["new", "needs-review"], closed: false, note: "", gap: false, path: "app/new.ts" },
  ] }];
  const marks = { deprecated: { label: "deprecated", colour: "warn", means: "still works" }, "needs-review": { label: "review", colour: "c3", means: "" }, unused: { label: "unused", colour: "c1", means: "never" } };
  test("a chip with its label and tone; a key lists only used marks that say what they mean; a built-in tree has no key", () => {
    const out = renderToString(React.createElement(FileTree, { trees: trees as any, ui, marks }));
    expect(out).toContain("fx-badge b-own tone-warn");
    expect(out).toContain("fx-badge b-own tone-c3");
    expect(out).toContain("still works");
    expect(out).not.toContain("never");
    expect((out.match(/class="fx-key"/g) ?? []).length).toBe(1);
    expect(renderToString(React.createElement(FileTree, { trees: trees.map((t) => ({ ...t, rows: t.rows.slice(0, 1) })) as any, ui, marks }))).not.toContain("fx-key");
  });
  test("a terminal with its own prompt: the prompt takes its tone and the key names it", () => {
    const out = renderToString(React.createElement(Terminal, { steps: [{ title: "", lines: [{ k: "cmd", prompt: ">>>", text: "1" }] }, { title: "", lines: [{ k: "cmd", prompt: "$", text: "ls" }] }], ui, title: null, prefixes: { ">>>": { label: "Python", colour: "c4", means: "" } } }));
    expect(out).toContain("t-pr t-own tone-c4");
    expect(out).toContain("t-key");
    expect(out).toContain("Python");
  });
  test("highlight() colours a command at a built-in prompt and leaves a line at your own prompt as typed", async () => {
    const d = await highlight(parse("```terminal\n$ ls -la\n>>> 1 + 1\n```\n", { path: "t.dh.md", prefixes: { ">>>": { label: "Python", colour: "c4" } } }));
    const lines = (d.blocks[0] as any).steps.flatMap((s: any) => s.lines).filter((l: any) => l.k === "cmd");
    expect(lines.find((l: any) => l.prompt === "$").hl).toBeDefined();
    expect(lines.find((l: any) => l.prompt === ">>>").hl).toBeUndefined();
  });
  test("end to end: the fixture renders its own marks, and the parse() options reach the same chips", () => {
    const out = renderDoc(parse(fixture("marks-and-prefixes")));
    expect(out).toContain("b-own");
    expect(out).toContain("t-own");
    const host = renderDoc(parse("```filetree\napp/\n  a.ts  (stale)\n```\n", { marks: { stale: { label: "stale", colour: "warn", means: "out of date" } } }));
    expect(host).toContain("b-own tone-warn");
    expect(host).toContain("out of date");
  });
});

describe("the editor on a phone", () => {
  const css = read("src/ui/parts.css");
  const phone = css.slice(css.indexOf(".ide-drawer { display: none; }"), css.indexOf("/* ---- file icons"));
  test("the tree above the file, code at 14 px, rows of 36 px, a pane of at least 8 lines", () => {
    expect(phone).toContain("grid-template-columns: 1fr");
    expect(phone).toContain("font-size: 14px; line-height: 1.6");
    expect(phone).toContain("min-height: 36px");
    expect(phone).toContain("max(var(--rows), 8)");
    expect(phone).toContain(".ide-side.is-shut { display: none; }");
  });
  test("a long tree starts as a closed drawer; a short one stays open; one file has no drawer button", () => {
    const f = (n: number) => Array.from({ length: n }, (_, i) => ({ path: `src/f${i}.ts`, repo: "", made: true, commit: null, lang: "ts", code: null, open: i === 0, error: "x" }));
    const out = (n: number) => renderToString(React.createElement(Editor, { files: f(n) as any, steps: [], ui, rows: 5 }));
    expect(out(2)).toContain('class="ide-side"');
    expect(out(2)).toContain('aria-expanded="true"');
    expect(out(6)).toContain("ide-side is-shut");
    expect(out(6)).toContain('aria-expanded="false"');
    expect(out(1)).not.toContain("ide-drawer");
  });
});

describe("Play starts at once", () => {
  test("the animation's Play steps at once (to the next step, or back to the first from the last)", () => {
    const s = read("src/ui/anim.tsx");
    expect(s).toContain("onPlay={() => { if (!playing) go(i === n - 1 ? 0 : i + 1); setPlaying(!playing); }}");
    expect(s).not.toContain("if (!playing && i === n - 1) go(0)");
  });
  test("the terminal's Play types the first key now and moves on at once from a finished step", () => {
    const s = read("src/ui/parts.tsx");
    expect(s).toContain("if (instant.current) { delay = 0; instant.current = false; }");
    expect(s).toContain("instant.current = true;");
    expect(s).toContain("else if (done) { setK(k + 1); setTyped(0); setStarted(true); }");
  });
});

describe("the hydration order's markup and phone rule", () => {
  test("every heavy part has a marker with no height at its top and sits in a Suspense boundary; containers have none", () => {
    const out = renderDoc(parse(fixture("chart-candlestick")));
    expect(out).toContain('class="dh-turn"');
    expect(out).toContain("<!--$-->");
    const tabs = renderDoc(parse(":::tabs\n### A\n\ntext\n\n### B\n\ntext\n:::\n", { path: "t.dh.md" }));
    expect(tabs).not.toContain("dh-turn");
  });
  test("the styles carry the marker's rule and the phone's first-paint rule, which needs class js on <html>", () => {
    expect(read("src/styles/dh.css")).toMatch(/\.dh-turn \{ display: block; height: 0/);
    expect(read("src/ui/parts.css")).toContain("@media (max-width: 560px) { .js .scn:not([data-live]) .scn-svg { visibility: hidden; } }");
    expect(read("src/ui/anim.tsx")).toContain('setAttribute("data-live", "1")');
    const h = read("src/react/hydrate.tsx");
    expect(h).toContain('classList.add("js")');
    expect(h).toContain("TurnContext.Provider");
  });
});
