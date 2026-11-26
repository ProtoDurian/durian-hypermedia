// Author text must never become CSS: every place that turns a word the author wrote into var(--word) refuses one that is not a plain word, so a
// value like `x), url(//host/p)` cannot add a second value (a request nobody checked). The thumbnail sprite of a video is in media-loader.test.ts.
import { describe, expect, test } from "bun:test";
import { cssWord } from "../src/safety";
import { colBase, colInk, colSoft } from "../src/parts/kit/view";
import { paint } from "../src/ui/stage";

const HOSTILE = ['x), url(//h.example/p)', 'x; background:url(//h.example/p)', 'a b', 'A', '-x', 'x"', "x'", "x\\", "x\n", "", "x".repeat(40), "x:y"];
const noInjection = (s: string) => !/url|\/\/|[;"'\\\n]|\)[^)]*\)/.test(s.replace(/var\(--[a-z0-9-]+(, var\(--[a-z0-9-]+\))?\)/g, ""));

describe("css words", () => {
  test("cssWord keeps a plain lower-case word and refuses everything else", () => {
    for (const ok of ["acc", "c1", "good-soft", "stg-unknown"]) expect(cssWord(ok, "F")).toBe(ok);
    for (const bad of HOSTILE) expect(cssWord(bad, "F")).toBe("F");
  });
  test("colBase, colSoft and colInk draw a hostile word as the default colour, and keep a good word as it was", () => {
    for (const h of HOSTILE) {
      for (const f of [colBase, colSoft, colInk]) expect(noInjection(f(h))).toBe(true);
    }
    expect(colBase("good")).toBe("var(--good)");
    expect(colSoft("c3")).toBe("var(--c3-soft, var(--acc-soft))");
    expect(colInk("c3")).toBe("var(--c3-ink, var(--c3))");
    expect(colBase("")).toBe("var(--acc)");
    expect(colInk("muted")).toBe("var(--muted)");
  });
  test("a stage paint name with a hostile word draws a plain variable, and a good one is unchanged", () => {
    for (const h of HOSTILE) for (const p of [h, `good:${h}`, `role:r:${h}`, `${h}:line`, `role:${h}:line`]) expect(noInjection(paint(p, { r: 1 }))).toBe(true);
    expect(paint("good", {})).toBe("var(--good)");
    expect(paint("good:soft", {})).toBe("var(--good-soft)");
    expect(paint("role:r:plane", { r: 2 })).toContain("var(--c2-plane");
  });
});

describe("a reference's link goes through the host's urlPolicy", () => {
  const text = "A mark [@lee2019].\n\n```references style=apa\n- id: lee2019\n  author: Lee, Kim\n  title: Notes on lists\n  type: web\n  year: 2019\n  url: https://tracker.example/notes\n  doi: 10.1234/jbs.2020.4\n```\n";
  test("a host policy that refuses links leaves the reference as text, in the list and on the card", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const React = await import("react");
    const { parse } = await import("../src/index");
    const { DhDocument } = await import("../src/react");
    const draw = (urlPolicy?: (u: string, k: string) => string | null) => renderToStaticMarkup(React.createElement(DhDocument, { doc: parse(text, { path: "p.dh.md" }), ...(urlPolicy ? { urlPolicy: urlPolicy as any } : {}) }));
    expect(draw()).toContain('href="https://doi.org/10.1234/jbs.2020.4"');
    const refused = draw((_u, k) => (k === "link" ? null : "x"));
    expect(refused).not.toMatch(/href="https?:/);
    expect(refused).toContain("dh-link-off");
  });
});

describe("spark and compare draw a hostile colour word as the default colour", () => {
  test("spark: the colour of a sparkline", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const React = await import("react");
    const Spark = (await import("../src/parts/spark/inline-view")).default as any;
    const draw = (colour: string, style: "line" | "bar") => renderToStaticMarkup(React.createElement(Spark, { text: ":spark[1,2,3]", data: { values: [1, 3, 2], style, colour } }));
    for (const style of ["line", "bar"] as const) {
      for (const h of HOSTILE) { const html = draw(h, style); expect(html).not.toMatch(/url|h\.example|\/\//); expect(html).toMatch(/(fill|stroke)="var\(--[a-z0-9-]+\)"/); }
      expect(draw("good", style)).toContain("var(--good)");
    }
  });
  test("compare: the colour of an option button", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const React = await import("react");
    const { parse } = await import("../src/index");
    const { DhDocument } = await import("../src/react");
    const text = "```compare title=T view=single\noptions: Redis [c1], Kafka [c2]\nOrdering: yes, no\n```\n";
    const draw = (colour?: string) => {
      const doc = parse(text, { path: "p.dh.md" });
      const b = doc.blocks.find((x: any) => x.type === "compare") as any;
      if (colour !== undefined) b.data.compare.options[0].colour = colour;
      return renderToStaticMarkup(React.createElement(DhDocument, { doc }));
    };
    expect(draw()).toContain("--compare-opt:var(--c1)");
    for (const h of HOSTILE.filter((x) => x !== "")) { const styles = [...draw(h).matchAll(/style="([^"]*)"/g)].map((m) => m[1]); expect(styles.join(" ")).not.toMatch(/h\.example|url\(|\/\//); expect(styles[0]).toMatch(/^--compare-opt:var\(--[a-z0-9-]+\)$/); }   // (the text is also in data-c: an attribute, escaped by React)
  });
});

describe("one total of loader bytes for a document, not for a loader function", () => {
  test("a loader made on each render shares the document's total; another document has its own", async () => {
    const { askLoader } = await import("../src/media-loader");
    const total = { used: 0 };
    const fresh = () => async () => ({ bytes: new Uint8Array(60) });   // a new function every time, as an inline loadMedia is
    const ask = (l: any, t: { used: number }) => askLoader("media:a", "pdf", "p", undefined, 1000, { loader: l, prefixes: ["media:"], pageBytes: 100, total: t }, new AbortController().signal);
    const a = await ask(fresh(), total), b = await ask(fresh(), total);
    expect([a.kind, b.kind]).toEqual(["bytes", "refused"]);
    expect((await ask(fresh(), { used: 0 })).kind).toBe("bytes");
  });
  test("the parts of one document share one total object, two documents do not (what DocumentView puts in the context)", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const React = await import("react");
    const { parse } = await import("../src/index");
    const { DhDocument, useDh } = await import("../src/react");
    const seen: object[] = [];
    const Probe = () => { seen.push(useDh().mediaTotal as object); return null; };
    const doc = parse("one\n\n```terminal\n$ a\n```\n\ntwo\n\n```terminal\n$ b\n```\n", { path: "p.dh.md" });
    const draw = () => renderToStaticMarkup(React.createElement(DhDocument, { doc, components: { terminal: Probe as any } }));
    draw(); draw();
    expect(seen.length).toBe(4);
    expect(seen[0]).toBeDefined();
    expect(seen[0]).toBe(seen[1]);
    expect(seen[2]).toBe(seen[3]);
    expect(seen[0]).not.toBe(seen[2]);
  });
});
