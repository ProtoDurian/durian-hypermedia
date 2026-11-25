// References (format version 11): `[[<type>:<name> "label"]]`. The syntax, the names, the LLM view, the host's resolver,
// the caps, the reference-only types (svg, interactive) and the work (counted: budget charges and reader rule calls).
import { afterEach, describe, expect, test } from "bun:test";
import { parse, check, llmView, LIMITS, UNTRUSTED_LIMITS, defineBlock, type ResolveReference, type Block, type ReferenceBlock } from "../src/index";
import { scanRef, nameProblem, isReferenceType, REF_NAME_MAX } from "../src/core/refs";
import { parseInteractive, checkInteractive, frameDoc, ixHeight, IX_LIMITS } from "../src/core/interactive";
import { svgProblem, svgDataUrl } from "../src/core/svg";
import { unfence, fencedSource } from "../src/refs";
import { Budget } from "../src/core/budget";
import { newReader } from "../src/markdown";
import { fixtures, html } from "./helpers";

const F = "```";
const md = (d: ReturnType<typeof parse>) => d.blocks.flatMap((b) => (b.type === "markdown" ? b.md : []));
const chips = (d: ReturnType<typeof parse>) => JSON.stringify(md(d)).match(/"t":"reference"/g)?.length ?? 0;
const refs = (bs: Block[]) => bs.filter((b): b is ReferenceBlock => b.type === "reference");
const store = (m: Record<string, string>): ResolveReference => ({ type, name }) => (m[`${type}:${name}`] != null ? { state: "ready", part: m[`${type}:${name}`] } : { state: "failed", reason: "no such part" });
const CHART = `${F}chart\nkind: bar\ntitle: Sales\nx: [a, b]\nseries:\n  - name: s\n    data: [1, 2]\n${F}`;

describe("syntax", () => {
  test("on a line of its own: a block; in a sentence: a chip; the label is optional", () => {
    const d = parse(`[[chart:sales "Sales"]]\n\nSee [[chart:sales]] here.\n`);
    const r = refs(d.blocks);
    expect(r.length).toBe(1);
    expect(r[0].ref).toEqual({ type: "chart", name: "sales", label: "Sales", text: `[[chart:sales "Sales"]]` });
    expect(r[0].state).toBe("unresolved");
    expect(chips(d)).toBe(1);
    expect(d.problems).toEqual([]);
  });
  test("in code it is text: a code span, a fence, an indented block", () => {
    const d = parse("`[[chart:a]]`\n\n```\n[[chart:b]]\n```\n\n    [[chart:c]]\n");
    expect(refs(d.blocks).length).toBe(0);
    expect(chips(d)).toBe(0);
    expect(JSON.stringify(d.blocks)).toContain("[[chart:b]]");
  });
  test("not a part type, an escaped bracket, no colon, a capital: plain text", () => {
    const d = parse("[[note:this]] \\[[chart:a]] [[chart]] [[Chart:a]] [[1, 2]]\n");
    expect(chips(d)).toBe(0);
    expect(d.problems).toEqual([]);
  });
  test("every fenced part type and the reference-only types may be referenced; containers may not", () => {
    for (const t of ["terminal", "filetree", "editor", "codewalk", "chart", "animation", "tierlist", "alignment", "svg", "interactive", "console"]) expect(isReferenceType(t)).toBe(true);
    for (const t of ["mermaid", "tabs", "accordion", "human", "llm", "note", "toString", "constructor"]) expect(isReferenceType(t)).toBe(false);
  });
  test("a host block's name is a type while parse() runs", () => {
    const task = defineBlock({ name: "ticket", parse: (i) => ({ body: i.body }) });
    const d = parse("[[ticket:T-12 \"The ticket\"]]\n", { blocks: [task], resolveReference: () => ({ state: "ready", part: "open" }) });
    const r = refs(d.blocks)[0];
    expect(r.state).toBe("ready");
    expect(r.blocks?.[0].type).toBe("host");
    expect(chips(parse("[[ticket:T-12]] x\n"))).toBe(0);
  });
  test("inside link text, a heading, a list and a table cell it is a chip", () => {
    const d = parse("# A [[chart:h]]\n\n- [[chart:l]] item\n\n| a |\n| - |\n| [[chart:t]] |\n\n[see [[chart:k]]](https://example.com)\n");
    expect(chips(d)).toBe(4);
    expect(d.headings[0].text).toBe("A h");
  });
  test("scanRef reads no further than the line, the next [[ or its window", () => {
    expect(scanRef(`[[chart:a "x`, 0, 12)).toBeNull();
    expect(scanRef("[[chart:a\n]]", 0, 12)).toBeNull();
    expect(scanRef("[[chart:[[chart:b]]", 0, 19)).toBeNull();
    expect(scanRef(`[[chart:${"a".repeat(5000)}]]`, 0, 5010)).toBeNull();
    expect(scanRef(`[[chart:a "b"]]`, 0, 15)).toEqual({ end: 15, type: "chart", name: "a", label: "b", bad: null });
  });
});

describe("names", () => {
  test("letters, digits, dot, dash, underscore, at most 128", () => {
    for (const n of ["a", "A-b_c.9", "v1.2.3", "x".repeat(REF_NAME_MAX)]) expect(nameProblem(n)).toBeNull();
    expect(nameProblem("x".repeat(REF_NAME_MAX + 1))).toMatch(/129 characters; at most 128/);
  });
  test("a URL, a scheme, a path: refused with the reason", () => {
    expect(nameProblem("https://198.51.100.7/a.svg")).toMatch(/is a URL/);
    expect(nameProblem("//203.0.113.9/a")).toMatch(/is a URL/);
    expect(nameProblem("www.example.com")).toMatch(/is a URL/);
    expect(nameProblem("javascript:alert(1)")).toMatch(/has a scheme/);
    expect(nameProblem("data:text/html,x")).toMatch(/has a scheme/);
    for (const n of ["../x", "a/b", "a\\b", ".hidden", "a..b"]) expect(nameProblem(n)).toMatch(/is a path/);
    expect(nameProblem("naïve")).toMatch(/holds "ï"/);
  });
  test("a refused block reference is an error block naming the fix; a refused chip keeps its reason", () => {
    const d = parse("[[svg:../etc/x \"x\"]]\n\nand [[chart:a/b]]\n");
    const e = d.blocks.find((b) => b.type === "error");
    expect(e && e.type === "error" && e.message).toMatch(/is a path; a name is letters, digits/);
    expect(JSON.stringify(md(d))).toMatch(/"error":"the name is a path/);
    expect(d.problems.map((p) => p.level)).toEqual(["error", "error"]);
    expect(check(d).filter((p) => /is a path/.test(p.message)).length).toBe(2);
  });
  test("something other than a label after the name is refused, saying the form", () => {
    expect(parse(`[[chart:a b "c"]]\n`).problems[0].message).toMatch(/only a label in double quotes, then "\]\]"/);
    expect(parse(`[[chart:a "b]]\n`).problems[0].message).toMatch(/no closing quote/);
  });
});

describe("the LLM view", () => {
  test("is the reference as written, resolved or not", () => {
    const t = `# P\n\n[[chart:sales "Sales"]]\n\nSee [[svg:logo]].\n`;
    const plain = llmView(parse(t));
    const ready = llmView(parse(t, { resolveReference: store({ "chart:sales": CHART, "svg:logo": "<svg/>" }) }));
    expect(plain).toContain(`[[chart:sales "Sales"]]`);
    expect(plain).toContain("See [[svg:logo]].");
    expect(ready).toBe(plain);
    expect(ready).not.toContain("kind: bar");
  });
});

describe("the host's resolver", () => {
  test("pending, failed, a throw, a wrong answer", () => {
    const t = "[[chart:a]]\n\n[[chart:b]]\n\n[[chart:c]]\n\n[[chart:d]]\n";
    const d = parse(t, { resolveReference: ({ name }) => (name === "a" ? { state: "pending" } : name === "b" ? { state: "failed", reason: "gone" } : name === "c" ? (() => { throw new Error("down"); })() : ({ state: "maybe" } as any)) });
    const r = refs(d.blocks);
    expect(r.map((x) => x.state)).toEqual(["pending", "failed", "failed", "failed"]);
    expect(r[1].reason).toBe("gone");
    expect(r[2].reason).toMatch(/could not resolve it \(down\)/);
    expect(r[3].reason).toMatch(/not pending, ready/);
    expect(d.problems).toEqual([]);
  });
  test("no answer (null or undefined) leaves the reference unresolved", () => {
    const d = parse("[[chart:a]]\n\nand [[chart:b]]\n", { resolveReference: () => null });
    expect(refs(d.blocks)[0].state).toBe("unresolved");
    expect(JSON.stringify(md(d))).not.toContain('"state"');
  });
  test("ready: the part, read as if written inline (its fence included, or only its body)", () => {
    const d = parse("[[chart:sales]]\n\n[[terminal:build]]\n", { resolveReference: store({ "chart:sales": CHART, "terminal:build": "$ make\nok" }) });
    const [a, b] = refs(d.blocks);
    expect(a.state).toBe("ready");
    expect(a.blocks?.[0].type).toBe("chart");
    expect(b.blocks?.[0].type).toBe("terminal");
    expect(a.blocks?.[0].line).toBe(1);
    expect(b.blocks?.[0].line).toBe(3);
  });
  test("a body with backtick runs is wrapped in a longer fence", () => {
    expect(fencedSource("terminal", "$ echo ```\n````")).toBe("`````terminal\n$ echo ```\n````\n`````");
    const d = parse("[[terminal:t]]\n", { resolveReference: store({ "terminal:t": "$ echo ```\n````" }) });
    expect(refs(d.blocks)[0].state).toBe("ready");
  });
  test("the same caps as inline: a chart over maxChartPoints is refused the same way", () => {
    const big = `${F}chart\nkind: line\nx: [1, 2, 3, 4]\nseries:\n  - name: s\n    data: [1, 2, 3, 4]\n${F}`;
    const lim = { maxChartPoints: 4 };
    const inline = parse(big, { limits: lim }).problems.map((p) => p.message);
    const viaRef = parse("[[chart:big]]\n", { limits: lim, resolveReference: store({ "chart:big": big }) });
    expect(inline.length).toBe(1);
    expect(viaRef.problems.map((p) => p.message)).toEqual(inline);
    expect(refs(viaRef.blocks)[0].state).toBe("failed");
    expect(refs(viaRef.blocks)[0].reason).toMatch(/8 data points; the limit is 4/);
  });
  test("an answer of another type, two parts, or text after the part: refused", () => {
    const d = parse("[[chart:a]]\n\n[[chart:b]]\n\n[[chart:c]]\n", { resolveReference: store({ "chart:a": "```terminal\n$ x\n```", "chart:b": CHART + "\n\n" + CHART, "chart:c": CHART + "\n\nmore" }) });
    expect(refs(d.blocks).map((x) => x.state)).toEqual(["failed", "failed", "failed"]);
    expect(refs(d.blocks)[0].reason).toMatch(/```terminal block, not chart/);
  });
  test("a reference inside a part a reference resolved to is refused", () => {
    const ix = "@html\n<p>x</p>\n@fallback\nSee [[chart:other]].";
    const d = parse("[[interactive:i]]\n", { resolveReference: store({ "interactive:i": ix }) });
    expect(d.problems.some((p) => /inside a part that a reference resolved to is refused/.test(p.message))).toBe(true);
    const tabs = parse("[[codewalk:w]]\n", { resolveReference: store({ "codewalk:w": "```codewalk\n@step a.ts\nsee [[chart:x]]\n```" }) });
    expect(tabs.problems.some((p) => /inside a part that a reference resolved to/.test(p.message))).toBe(true);
  });
  test("a chip asks the resolver for its state only", () => {
    const d = parse("See [[chart:a]] and [[chart:b]].\n", { resolveReference: ({ name }) => (name === "a" ? { state: "pending" } : { state: "ready", part: CHART }) });
    const s = JSON.stringify(md(d));
    expect(s).toContain(`"state":"pending"`);
    expect(s).toContain(`"state":"ready"`);
    expect(s).not.toContain("kind: bar");
  });
  test("the parts a page's references resolve to share one byte cap", () => {
    const t = "[[terminal:a]]\n\n[[terminal:b]]\n";
    const d = parse(t, { limits: { maxReferenceBytes: 30 }, resolveReference: () => ({ state: "ready", part: "$ " + "x".repeat(20) }) });
    expect(refs(d.blocks).map((x) => x.state)).toEqual(["ready", "failed"]);
    expect(d.problems[0].message).toMatch(/over 30 bytes together/);
  });
});

describe("a count cap per page", () => {
  const page = (n: number) => Array.from({ length: n }, (_, i) => `[[chart:p${i}]]`).join("\n\n") + "\n";
  test("LIMITS: 500; the rest show as their labels, one problem", () => {
    expect(LIMITS.maxReferences).toBe(500);
    const d = parse(page(510));
    expect(refs(d.blocks).length).toBe(500);
    expect(d.problems.length).toBe(1);
    expect(d.problems[0].message).toMatch(/more than 500 references; the rest show as their labels/);
  });
  test("UNTRUSTED_LIMITS: 100", () => {
    expect(UNTRUSTED_LIMITS.maxReferences).toBe(100);
    expect(refs(parse(page(150), { limits: UNTRUSTED_LIMITS }).blocks).length).toBe(100);
  });
  test("the resolver is asked at most the cap's number of times", () => {
    let asked = 0;
    parse(page(3000), { limits: UNTRUSTED_LIMITS, resolveReference: () => { asked++; return { state: "pending" }; } });
    expect(asked).toBe(100);
  });
});

describe("reference-only types", () => {
  test("a fenced ```svg or ```interactive is refused, naming the reference form; its text stays as code", () => {
    const d = parse(`${F}svg\n<svg/>\n${F}\n\n${F}interactive\n@html\n<p/>\n${F}\n\n- x\n\n  ${F}SVG\n  <svg/>\n  ${F}\n`);
    expect(d.problems.length).toBe(3);
    expect(d.problems[0].message).toBe(`\`\`\`svg is refused: raw SVG exists only as a reference. Store it with the host and write [[svg:<name> "label"]] on a line of its own`);
    expect(d.problems[1].message).toMatch(/\[\[interactive:<name> "label"\]\]/);
    expect(JSON.stringify(d.blocks)).toContain("<svg/>");
    expect(d.blocks.filter((b) => b.type === "error").length).toBe(2);
  });
  test("svg: drawn only through an <img>; not SVG, a DOCTYPE, too big: refused", () => {
    const ok = `<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>`;
    const d = parse(`[[svg:logo "The logo"]]\n`, { resolveReference: store({ "svg:logo": ok }) });
    const b = refs(d.blocks)[0].blocks![0];
    expect(b.type).toBe("svg");
    const out = html(d);
    expect(out).toContain(`<img class="dh-svg-img" src="data:image/svg+xml;charset=utf-8,`);
    expect(out).toContain(`alt="The logo"`);
    expect(out).not.toMatch(/<svg xmlns|<script/);
    expect(svgProblem("<div/>", 6, 100)).toMatch(/must start with <svg/);
    expect(svgProblem(`<!DOCTYPE svg [<!ENTITY a "aa">]><svg/>`, 40, 100)).toMatch(/must start with <svg/);
    expect(svgProblem(`<svg><!ENTITY a "b"></svg>`, 30, 100)).toMatch(/DOCTYPE or an ENTITY/);
    expect(svgProblem("<svg/>", 101, 100)).toMatch(/101 bytes; at most 100/);
    expect(svgDataUrl("<svg>#</svg>")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%3E%23%3C%2Fsvg%3E");
    const big = parse(`[[svg:b]]\n`, { limits: UNTRUSTED_LIMITS, resolveReference: () => ({ state: "ready", part: `<svg>${"x".repeat(100_001)}</svg>` }) });
    expect(refs(big.blocks)[0].reason).toMatch(/at most 100,000/);
  });
  test("interactive: sections, checks, the frame page", () => {
    const p = parseInteractive("@html\n<button id=b>Go</button>\n@css\nb{}\n@script\nb.onclick = 1;\n@fallback\nA button.\n@nope\nx", 10);
    expect([p.html, p.css, p.script, p.fallback]).toEqual(["<button id=b>Go</button>", "b{}", "b.onclick = 1;", "A button."]);
    expect(p.unknown).toEqual([{ name: "nope", line: 18 }]);
    const bad = (s: string) => checkInteractive(parseInteractive(s, 1), s.length, 200 * 1024).map((e) => e.msg).join("\n");
    expect(bad("@script\nfetch (\"/x\")")).toMatch(/`fetch\(` is not allowed/);
    expect(bad("@script\nlocation.href = 'x'")).toMatch(/`location/);
    expect(bad("@script\nnew RTCPeerConnection()")).toMatch(/RTCPeerConnection/);
    expect(bad("@script\nwindow.x = eval  (s)")).toMatch(/`eval` is not allowed/);
    expect(bad("@script\nconst evaluate = 1, medieval = 2;")).toBe("");
    expect(bad("@script\nconst u = 'https://198.51.100.7'")).toMatch(/a URL with a scheme/);
    expect(bad("@html\n<img src = '//203.0.113.9/a'>")).toMatch(/a URL with a scheme or `\/\/`/);
    expect(bad("@css\na{background:url( 'x:y')}")).toMatch(/a URL with a scheme/);
    expect(bad("@html\n<b onclick=\"x()\">")).toMatch(/inline on...= handler/);
    expect(bad("@html\n<script>x</script>")).toMatch(/put the script under @script/);
    expect(bad("@html\n<meta http-equiv=refresh content=0>")).toMatch(/<meta/);
    expect(bad("@script\nconst allocation = 1; // a note\nconst topic = 2;")).toBe("");
    expect(checkInteractive(parseInteractive("@html\nx", 1), 300_000, 200 * 1024)[0].msg).toMatch(/293 KB; at most 200 KB/);
    const doc = frameDoc({ html: "<p>x</p>", css: "p{}</style><script>alert(1)</script>", script: "a='</script>'" }, false);
    expect(doc).toContain(`content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"`);
    expect(doc).not.toMatch(/p\{\}<\/style>/);
    expect(doc).toContain("a='<\\/script>'");
    expect(frameDoc({ html: "", css: "", script: "go()" }, true)).not.toContain("go()");
    expect([ixHeight({}), ixHeight({ height: "5" }), ixHeight({ height: "99999" }), ixHeight({ height: "x" })]).toEqual([280, 80, 1200, 280]);
    expect(IX_LIMITS.silentMs).toBe(5000);
    expect(IX_LIMITS.lifeMs).toBe(600_000);
  });
  test("interactive: off by default; the still is the fallback or the label", () => {
    const d = parse(`[[interactive:g "Growth"]]\n`, { resolveReference: store({ "interactive:g": "@html\n<p>live</p>\n@fallback\nThe **still** version." }) });
    const out = html(d);
    expect(out).toContain("Interactive part: off on this site");
    expect(out).toContain("<strong>still</strong>");
    expect(out).not.toMatch(/<iframe|live/);
    const noFallback = html(parse(`[[interactive:g "Growth"]]\n`, { resolveReference: store({ "interactive:g": "@html\n<p>live</p>" }) }));
    expect(noFallback).toContain("<p>Growth</p>");
  });
  test("interactive: over 200 KB is refused before it is read", () => {
    const d = parse(`[[interactive:g]]\n`, { resolveReference: () => ({ state: "ready", part: "@html\n" + "x".repeat(210 * 1024) }) });
    expect(refs(d.blocks)[0].reason).toMatch(/at most 200 KB/);
  });
  test("unfence reads the fence's attributes", () => {
    expect(unfence("svg", `\n${F}svg title="A b" height=3\n<svg/>\n${F}\n`)).toEqual({ attrs: { title: "A b", height: "3" }, body: "<svg/>", fenced: true });
    expect(unfence("svg", "<svg/>")).toEqual({ attrs: {}, body: "<svg/>", fenced: false });
    expect(unfence("svg", `${F}svg\n<svg/>`)).toEqual({ error: "the host's answer is not one svg part: it must end with the fence that closes it" });
  });
});

describe("review fixes", () => {
  test("a chip inside a link's text keeps the link", () => {
    const c = md(parse("[See [[chart:sales]] now](#notes)\n"))[0] as any;
    expect(c.c[0].t).toBe("link");
    expect(c.c[0].c.map((x: any) => x.t)).toEqual(["text", "reference", "text"]);
  });
  test("an svg or interactive part counts against the page's block cap", () => {
    const d = parse("[[svg:a]]\n", { limits: { maxBlocks: 1 }, resolveReference: () => ({ state: "ready", part: "<svg/>" }) });
    expect(refs(d.blocks)[0].state).toBe("failed");
    expect(d.problems[0].message).toMatch(/more than 1 blocks/);
  });
  test("an answer with a closing fence inside is not one part", () => {
    const two = `${F}interactive\n@html\n<p>a</p>\n${F}\n\n${F}interactive\n@html\n<p>b</p>\n${F}`;
    const d = parse("[[interactive:i]]\n", { resolveReference: () => ({ state: "ready", part: two }) });
    expect(refs(d.blocks)[0].reason).toMatch(/a fence closes inside it/);
  });
  test("a fence word in capitals alone is still refused", () => {
    expect(parse(`${F}SVG\n<svg/>\n${F}\n`).problems.length).toBe(1);
  });
  test("a part longer than the byte cap is refused before it is measured", () => {
    const d = parse("[[terminal:t]]\n", { limits: { maxReferenceBytes: 10 }, resolveReference: () => ({ state: "ready", part: "x".repeat(11) }) });
    expect(refs(d.blocks)[0].reason).toMatch(/more than 10 bytes together/);
  });
  test("a body of many blank lines is wrapped in one pass", () => {
    const body = "$ a" + "\n".repeat(200_000) + "b" + "\n".repeat(200_000);
    const t0 = performance.now();
    expect(fencedSource("terminal", body).toString().endsWith("b\n```")).toBe(true);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
  test("the label: 200 characters is a label, 201 is refused", () => {
    expect(nameProblem("a")).toBeNull();
    expect(parse(`[[chart:a "${"x".repeat(200)}"]]\n`).problems).toEqual([]);
    expect(parse(`[[chart:a "${"x".repeat(201)}"]]\n`).problems[0].message).toMatch(/longer than 200 characters/);
  });
  test("blocks and chips share the count cap", () => {
    const t = Array.from({ length: 60 }, (_, i) => `[[chart:b${i}]]\n\nsee [[chart:c${i}]]`).join("\n\n");
    const d = parse(t, { limits: { maxReferences: 100 } });
    expect(refs(d.blocks).length + chips(d)).toBe(100);
  });
});

describe("rendering", () => {
  test("no resolver: the label as a chip; pending and failed: their own looks; ready: the part", () => {
    const t = "[[chart:a \"A\"]]\n\n[[chart:b \"B\"]]\n\n[[chart:c \"C\"]]\n\n[[chart:d \"D\"]]\n\nand [[chart:e \"E\"]]\n";
    expect(html(parse(t))).toContain(`<p class="dh-xref-line"><span class="dh-xref" data-state="unresolved" data-dh-ref-type="chart" title="chart: a"><span class="dh-xref-type">chart</span><span class="dh-xref-label">A</span></span></p>`);
    const out = html(parse(t, { resolveReference: ({ name }) => (name === "a" ? { state: "pending" } : name === "b" ? { state: "failed", reason: "gone" } : name === "e" ? { state: "pending" } : { state: "ready", part: CHART }) }));
    expect(out).toMatch(/<div class="dh-xref-card" data-state="pending" data-dh-ref-type="chart" role="status">/);
    expect(out).toMatch(/<div class="dh-xref-card" data-state="failed" data-dh-ref-type="chart" role="note">.*Not available: gone/);
    expect(out).toMatch(/<div class="dh-xref-part" data-dh-ref-type="chart" data-dh-ref-name="c"><figure class="part part-chart"/);
    expect(out).toMatch(/<span class="dh-xref" data-state="pending" data-dh-ref-type="chart" title="chart: e">/);
  });
  test("a refused chip shows its label with the reason, never a link", () => {
    const out = html(parse(`See [[svg:https://198.51.100.7/x.svg "x"]].\n`));
    expect(out).toContain(`data-state="refused"`);
    expect(out).not.toContain("href=");
  });
});

describe("work: counted, never timed", () => {
  // the reference reader's part budgets that parse() makes, to read what they were charged
  const made: Budget[] = [];
  const real = Budget.prototype.part;
  Budget.prototype.part = function (this: Budget, ...a: Parameters<Budget["part"]>) { const b = real.apply(this, a); if (b.name === "the reference reader") made.push(b); return b; };
  afterEach(() => { made.length = 0; });
  const charged = (t: string) => { made.length = 0; parse(t, { limits: { maxReferences: 1e6, maxBlocks: 1e6 } }); return made.reduce((a, b) => a + b.steps + b.values + b.chars, 0); };
  const blocks = (n: number) => Array.from({ length: n }, (_, i) => `[[chart:p${i} "P ${i}"]]`).join("\n\n");
  const inline = (n: number) => Array.from({ length: n }, (_, i) => `see [[svg:s${i}]] and`).join(" ");
  test("the budget is charged for every reference: 2n references cost 2 times n", () => {
    for (const f of [blocks, inline]) {
      const a = charged(f(200)), b = charged(f(400));
      expect(a).toBeGreaterThan(0);
      expect(b).toBe(2 * a);
    }
  });
  test("a small page budget refuses the rest as labels, with the budget's message", () => {
    const d = parse(blocks(50), { limits: { maxEvalSteps: 10, maxEvalValues: 10 } });
    expect(refs(d.blocks).length).toBe(10);
    expect(d.problems[0].message).toMatch(/the reference reader does too much work|the reference reader makes too many values/);
  });
  // every rule call the Markdown reader makes, on texts made of reference pieces: twice the text, about twice the calls
  const PIECES = ["[[", "]]", "chart:", "svg:", "a", "\"", " ", "\n", "x/y", "https://", "[[chart:a", "[[chart:a \"b\"]]", "[", "]", "`"];
  const meter = () => {
    const r: any = newReader(); const w = { n: 0 };
    for (const ruler of [r.inline.ruler, r.inline.ruler2, r.block.ruler, r.core.ruler]) { for (const x of ruler.__rules__) { const fn = x.fn; x.fn = (...a: any[]) => { w.n++; return fn(...a); }; } ruler.__cache__ = null; }
    return (s: string) => { w.n = 0; r.parse(s, {}); return w.n; };
  };
  const soup = (seed: number, bytes: number) => { let s = seed >>> 0 || 1, out = ""; while (out.length < bytes) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; out += PIECES[s % PIECES.length]; } return out.slice(0, bytes); };
  test("the reader's work on reference soup and repeated openers is linear", () => {
    const work = meter();
    const shapes: ((n: number) => string)[] = [
      ...[1, 2, 3, 4, 5].map((seed) => (n: number) => soup(seed, n)),
      (n) => "[[chart:".repeat(n / 8), (n) => "[[chart:a \"".repeat(n / 11), (n) => `[[chart:${"a".repeat(n)}`, (n) => "[[chart:a \"b\"]]".repeat(n / 15),
    ];
    for (const f of shapes) { const a = work(f(20_000)), b = work(f(40_000)); expect(b / a).toBeLessThan(2.6); }
  });
  test("a megabyte of hostile references ends quickly (a coarse clock: it only catches a hang)", () => {
    const t0 = performance.now();
    for (const t of ["[[chart:".repeat(120_000), `[[svg:${"a".repeat(1_000_000)}`, "[[chart:a \"".repeat(90_000), "x [[svg:s]]".repeat(90_000)]) parse(t, { frontMatter: false });
    expect(performance.now() - t0).toBeLessThan(20_000);
  });
});

describe("fixtures", () => {
  test("the good fixture parses with no problems and keeps every reference in its LLM view", () => {
    const f = fixtures("format").find((x) => /references/.test(x.name))!;
    const d = parse(f.text);
    expect(d.problems).toEqual([]);
    expect(check(d)).toEqual([]);
    expect(refs(d.blocks).length).toBe(3);
    for (const r of [`[[chart:revenue-2026 "Revenue by month, 2026"]]`, `[[terminal:build-42 "the build"]]`, "[[filetree:repo-layout]]"]) expect(llmView(d)).toContain(r);
  });
  test("the hostile name fixture: every bad name refused with its reason, nothing renders a link or a script", () => {
    const f = fixtures("hostile").find((x) => /19-reference-names/.test(x.name))!;
    const d = parse(f.text);
    const msgs = d.problems.map((p) => p.message).join("\n");
    for (const w of ["is a URL", "has a scheme", "is a path", "135 characters; at most 128", `holds "ï"`, "no closing quote", "only a label in double quotes"]) expect(msgs).toContain(w);
    const out = html(d);
    expect(out).not.toMatch(/<script|<img[\s>]|href="(https|javascript|data)/);
    for (const tag of out.match(/<[a-zA-Z][^>]*>/g) ?? []) expect(tag).not.toMatch(/\son[a-z]+=/i);
  });
  test("thousands of references: the cap, one problem, the rest as labels", () => {
    const f = fixtures("hostile").find((x) => /21-many-references/.test(x.name))!;
    const d = parse(f.text);
    expect(d.problems.length).toBe(1);
    expect(refs(d.blocks).length).toBe(500);
    expect(chips(d)).toBe(0);
  });
});
