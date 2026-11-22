// Markdown is read in time linear in the text, whatever the text is; the rules this package adds keep the tree it had.
// Work is counted (rule calls and the characters the link helpers read), not timed, on seeded random text made of
// Markdown's own punctuation; one coarse clock check per family only catches a hang.
import { describe, expect, test } from "bun:test";
import GithubSlugger from "github-slugger";
import { parse, llmView } from "../src/index";
import { mdBlocks, newReader, type MdContext } from "../src/markdown";
import { inlineToLlm, inlineToHtml, mapOutsideCode, noteHtml, mouseParts, mouseSvg, KEY_GLYPHS } from "../src/core/dh-lib";

// ---- seeded text
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const PIECES = ["*", "**", "_", "__", "~", "~~", "`", "``", "```", "[", "]", "(", ")", "![", "](", "<", ">", "\\", "&", "&amp;", "&#", ";",
  "#", "# ", "> ", "- ", "1. ", "|", "-|", ":", ":kbd[", ":mouse[", "\"", "'", "@", ".", "www.", "http://", "a", "word", " ", "  ", "\t", "\n", "\n\n", "    "];
/** a random mix of the pieces */
function soup(seed: number, bytes: number): string {
  const r = rng(seed); let s = "";
  while (s.length < bytes) s += PIECES[Math.floor(r() * PIECES.length)];
  return s.slice(0, bytes);
}
/** one short random unit, repeated: the shape most rules must survive (an opener again and again, never closed) */
function runOf(seed: number, bytes: number): string {
  const r = rng(seed); let u = "";
  const k = 1 + Math.floor(r() * 4);
  for (let i = 0; i < k; i++) u += PIECES[Math.floor(r() * PIECES.length)];
  if (!u.trim()) u += "a";
  return u.repeat(Math.ceil(bytes / u.length)).slice(0, bytes);
}
/** the opener-like pieces two at a time, repeated (covers every pair, not just the ones we thought of) */
const PAIRS: string[] = [];
const OPENERS = ["*", "_", "~", "`", "[", "](", "![", "<", "\\", "&", ":kbd[", "> ", "- ", "1. ", "|", "www.", "a@", "(", "\""];
for (const a of OPENERS) for (const b of OPENERS) PAIRS.push(a + "a" + b);

// ---- work: every rule call and every character a link helper reads
function meteredReader() {
  const md: any = newReader();
  const w = { n: 0 };
  for (const ruler of [md.inline.ruler, md.inline.ruler2, md.block.ruler, md.core.ruler]) {
    for (const r of ruler.__rules__) { const f = r.fn; r.fn = (...a: any[]) => { w.n++; return f(...a); }; }
    ruler.__cache__ = null;
  }
  const h = md.helpers;
  md.helpers = {
    ...h,
    parseLinkLabel(state: any, start: number, dn: boolean) { w.n++; return h.parseLinkLabel(state, start, dn); },
    parseLinkDestination(str: string, s: number, max: number) { const r = h.parseLinkDestination(str, s, max); w.n += Math.max(1, (r.ok ? r.pos : Math.min(max, s + 1)) - s); return r; },
    parseLinkTitle(str: string, s: number, max: number, prev?: any) { const r = h.parseLinkTitle(str, s, max, prev); w.n += Math.max(1, (r.ok ? r.pos : Math.min(max, s + 1)) - s); return r; },
  };
  const skip = md.inline.skipToken.bind(md.inline);
  md.inline.skipToken = (state: any) => { w.n++; skip(state); };
  return { work: (src: string) => { w.n = 0; md.options.maxNesting = 46; md.parse(src, {}); return w.n; } };
}

describe("Markdown work is linear in the text", () => {
  const m = meteredReader();
  const families: [string, (n: number) => string][] = [
    ...Array.from({ length: 12 }, (_, i) => [`random mix ${i}`, (n: number) => soup(1000 + i, n)] as [string, (n: number) => string]),
    ...Array.from({ length: 40 }, (_, i) => [`random repeated unit ${i}`, (n: number) => runOf(2000 + i, n)] as [string, (n: number) => string]),
    ...PAIRS.map((u, i) => [`pair ${i}`, (n: number) => u.repeat(Math.ceil(n / u.length)).slice(0, n)] as [string, (n: number) => string]),
  ];
  test(`${families.length} families: about 4 times the work for 4 times the text, and at most 100 units a character`, () => {
    const bad: string[] = [];
    for (const [name, gen] of families) {
      const a = m.work(gen(4_000)), b = m.work(gen(16_000));
      if (b > 100 * 16_000 + 2_000 || b > 4.6 * a + 2_000) bad.push(`${name}: ${a} -> ${b}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("no hang through parse() and the LLM view", () => {
  // a coarse clock: 256 KB of the worst families must parse well inside the time a quadratic reader would need
  const gens: [string, string][] = [];
  for (let i = 0; i < 6; i++) gens.push([`random mix ${i}`, soup(3000 + i, 256_000)]);
  for (const i of [0, 3, 7, 12, 19, 20, 38, 57, 76, 95, 114, 133, 152, 171, 190, 209, 228, 247, 266, 285, 304, 323, 342, 360]) {
    const u = PAIRS[i % PAIRS.length]; gens.push([`pair ${i % PAIRS.length}`, u.repeat(Math.ceil(256_000 / u.length)).slice(0, 256_000)]);
  }
  for (const [name, src] of gens) {
    test(`${name}: under 3 seconds`, () => {
      const t = performance.now();
      const d = parse(src, { frontMatter: false });
      expect(typeof d.llm).toBe("string");
      expect(performance.now() - t).toBeLessThan(3_000);
    });
  }
});

// ---- the tree
const ctx = (over: Partial<MdContext> = {}): MdContext => ({ idPrefix: "", slugger: new GithubSlugger(), maxDepth: 12, problems: [], line: 1, heads: [], policy: (u) => u, ...over });
const tree = (s: string, over: Partial<MdContext> = {}) => mdBlocks(s, ctx(over));
const json = (s: string) => JSON.stringify(tree(s));

describe("GFM additions", () => {
  test("autolink literals: www., http(s)://, ftp:// and e-mail, trailing punctuation left out", () => {
    expect(json("Visit www.example.com/a.b.")).toBe(JSON.stringify([{ t: "p", c: [{ t: "text", v: "Visit " }, { t: "link", href: "http://www.example.com/a.b", c: [{ t: "text", v: "www.example.com/a.b" }] }, { t: "text", v: "." }] }]));
    expect(json("(see https://example.com/x_(y))")).toContain('"href":"https://example.com/x_(y)"');
    expect(json("at ftp://example.org.")).toContain('"href":"ftp://example.org"');
    expect(json("mail a.b-c_d+e@example.com.")).toContain('"href":"mailto:a.b-c_d+e@example.com"');
    expect(json("not a.b@example.c_")).not.toContain("mailto:");
    expect(json("www.example.com&amp;")).toContain('"href":"http://www.example.com"');
    expect(json("xwww.example.com")).not.toContain('"t":"link"');
    expect(json("[www.example.com](/x)")).toBe(JSON.stringify([{ t: "p", c: [{ t: "link", href: "/x", c: [{ t: "text", v: "www.example.com" }] }] }]));
  });
  test("strikethrough with one or two tildes; three is text", () => {
    expect(json("~a~ and ~~b~~")).toBe(JSON.stringify([{ t: "p", c: [{ t: "del", c: [{ t: "text", v: "a" }] }, { t: "text", v: " and " }, { t: "del", c: [{ t: "text", v: "b" }] }] }]));
    expect(json("~~~a~~~")).not.toContain('"del"');
    expect(json("~a~~")).not.toContain('"del"');
  });
  test("task items", () => {
    const l = tree("- [x] done\n- [ ] open\n- [] no")[0] as any;
    expect(l.items.map((i: any) => [i.task, i.checked])).toEqual([[true, true], [true, false], [false, false]]);
    expect(JSON.stringify(l.items[0].c)).toBe(JSON.stringify([{ t: "text", c: [{ t: "text", v: "done" }] }]));
  });
  test("an ordered list of any start nests inside a list item, as before", () => {
    const l = tree("5. five\n   6. six\n7. seven")[0] as any;
    expect(l.items[0].c[1]).toMatchObject({ t: "list", ordered: true, start: 6 });
    expect(l.items.length).toBe(2);
  });
});

describe("what the tree keeps as before", () => {
  test("character references stay as written in text, except the five the tree always decoded", () => {
    expect(json("&copy; &amp; &lt;")).toBe(JSON.stringify([{ t: "p", c: [{ t: "text", v: "&copy; & <" }] }]));
  });
  test("an escaped character is a text node of its own", () => {
    expect(json("a \\*b")).toBe(JSON.stringify([{ t: "p", c: [{ t: "text", v: "a " }, { t: "text", v: "*" }, { t: "text", v: "b" }] }]));
  });
  test("a raw HTML block keeps the blank lines after it", () => {
    expect(tree("<div>x</div>\n\n\nnext")[0]).toEqual({ t: "raw", text: "<div>x</div>\n\n\n" });
  });
  test("a link keeps its address as written (the URL policy decodes it)", () => {
    const p = tree("[a](x&amp;y \"t &amp; u\")")[0] as any;
    expect(p.c[0]).toMatchObject({ t: "link", href: "x&y", title: "t &amp; u" });
  });
  test("keys, mouse actions and host references", () => {
    expect(json(":kbd[Ctrl+K] :mouse[click a]")).toContain('"t":"kbd"');
    expect(json(":kbd[Ctrl+K] :mouse[click a]")).toContain('"t":"mouse"');
    const inlines = [{ name: "task", match: /T-\d+/ }];
    expect(JSON.stringify(mdBlocks("see T-12 and *T-3*", ctx({ inlines })))).toBe(JSON.stringify([{ t: "p", c: [{ t: "text", v: "see " }, { t: "ref", name: "task", text: "T-12", data: "T-12" }, { t: "text", v: " and " }, { t: "em", c: [{ t: "ref", name: "task", text: "T-3", data: "T-3" }] }] }]));
  });
});

describe("nesting: refused or cut, never a lost character", () => {
  test("a line nested past the cap is shown as written", () => {
    const c = ctx(); const s = "- ".repeat(40) + "end";
    expect(mdBlocks(s, c)).toEqual([{ t: "raw", text: s }]);
    expect(c.problems.length).toBe(1);
  });
  test("a list nested past maxDepth by indentation keeps its text", () => {
    const s = Array.from({ length: 16 }, (_, i) => "  ".repeat(i) + `- item ${i}`).join("\n");
    const out = JSON.stringify(tree(s));
    for (let i = 0; i < 16; i++) expect(out).toContain(`item ${i}`);
  });
  test("emphasis nested past maxDepth keeps its text", () => {
    const s = Array.from({ length: 30 }, (_, i) => `*w${i} `).join("") + "x" + "*".repeat(30);
    const out = JSON.stringify(tree(s));
    for (let i = 0; i < 30; i++) expect(out).toContain(`w${i}`);
  });
  test("random text: every word of the input is in the tree", () => {
    // no ":" (a reference definition is dropped on purpose) and no "&" (a reference is its character): every "word" stays
    for (let i = 0; i < 400; i++) {
      const s = soup(5000 + i, 400).replace(/[:&]/g, " ");
      const out = JSON.stringify(tree(s));
      // at least as many: an autolink literal shows "word" in its address and its text
      expect((out.match(/word/g) ?? []).length).toBeGreaterThanOrEqual((s.match(/word/g) ?? []).length);
    }
  });
});

// ---- the LLM view's one-pass rewrites give what the regular expressions they replace gave
describe("LLM view rewrites: the same results as before", () => {
  const KBD_RE = /:kbd\[([^\]]+)\]/g, MOUSE_RE = /:mouse\[([^\]]+)\]/g;
  const oldMap = (md: string, f: (s: string) => string) => md.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((p, i) => (i % 2 ? p : f(p))).join("");
  const oldLinks = (s: string) => s.replace(/\]\((?![a-z]+:)([^)\s#]+)\.dh\.md(#[^)\s]*)?\)/g, "]($1.md$2)");
  const pieces = ["`", "``", "```", ":kbd[", ":mouse[", "]", "[", "(", ")", "](", "#", ".dh.md", ".md", "a", "b c", "\n", " ", "Ctrl+K", ",", "x:", " ", "\t", "http:"];
  const rand = (r: () => number) => { let t = ""; const n = 1 + Math.floor(r() * 24); for (let i = 0; i < n; i++) t += pieces[Math.floor(r() * pieces.length)]; return t; };
  test("code spans and fences found as before", () => {
    const r = rng(7);
    for (let i = 0; i < 20_000; i++) { const t = rand(r); expect(mapOutsideCode(t, (x) => `<${x}>`)).toBe(oldMap(t, (x) => `<${x}>`)); }
  });
  test("keys and mouse actions found as before", () => {
    const NAMES: Record<string, string> = { left: "Left arrow", right: "Right arrow", up: "Up arrow", down: "Down arrow" };
    const oldLlm = (md: string) => oldMap(md, (t) => t.replace(KBD_RE, (_, k: string) => k.split(/\s*,\s*/).map((c) => c.split(/\+(?!$)/).map((x) => NAMES[x.toLowerCase()] ?? x).join("+")).join(", then ")).replace(MOUSE_RE, (_, inner) => inner));
    const r = rng(8);
    for (let i = 0; i < 20_000; i++) { const t = rand(r); expect(inlineToLlm(t)).toBe(oldLlm(t)); }
    // the HTML form replaces the same places: the old regular expressions, each match drawn by the new code alone
    // 0.6.1's inlineToHtml, as it was
    const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const chords = (k: string) => k.split(/\s*,\s*/), keysOf = (c: string) => c.split(/\+(?!$)/);
    const oldHtml = (md: string) => oldMap(md, (t) => t
      .replace(KBD_RE, (_, k: string) => `<span class="dh-keys" aria-label="${esc(chords(k).map((c) => keysOf(c).map((x) => NAMES[x.toLowerCase()] ?? x).join("+")).join(", then "))}">${chords(k).map((chord) => `<span class="dh-chord">${keysOf(chord).map((key) => `<kbd>${esc(KEY_GLYPHS[key.toLowerCase()] ?? key)}</kbd>`).join('<span class="dh-plus">+</span>')}</span>`).join('<span class="dh-then">then</span>')}</span>`)
      .replace(MOUSE_RE, (_, inner: string) => { const { act, target } = mouseParts(inner); return `<span class="dh-mouse">${mouseSvg(act)}<span class="dh-mouse-act">${esc(act)}</span>${target ? ` <b>${esc(target)}</b>` : ""}</span>`; }));
    const r2 = rng(10);
    for (let i = 0; i < 20_000; i++) {
      const t = rand(r2);
      expect(inlineToHtml(t)).toBe(oldHtml(t));
      expect(typeof noteHtml(t)).toBe("string");
    }
  });
  test("links to other pages rewritten as before (through the LLM view of a one-paragraph page)", () => {
    const r = rng(9);
    for (let i = 0; i < 3_000; i++) {
      const t = "x " + rand(r).replace(/`/g, "");
      const view = llmView(t, { frontMatter: false });
      const body = view.slice(view.indexOf("-->\n\n") + 5).replace(/\n$/, "");
      expect(body).toBe(oldLinks(inlineToLlm(t)).replace(/^\n+|\n+$/g, "").replace(/\n{3,}/g, "\n\n"));
    }
  });
});
