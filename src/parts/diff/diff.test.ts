// The diff part: parse (files, hunks, both line numbers, word marks by jsdiff), the LLM view (as written), every
// refusal, its caps in both sets, the doubling test (budget charges counted at n and 2n, never time), the drawn view
// (live and static, both layouts, the sticky columns of a narrow one) and the hostile fixtures.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import diff, { looksLikeDiff, parseDiff, rowsOf, splitPairs } from "./part";
import DiffView from "./view";

const fence = (body: string, info = "") => `# Page\n\n\`\`\`diff${info ? " " + info : ""}\n${body}\n\`\`\`\n`;
const D = `diff --git a/src/a.ts b/src/a.ts
index 1a2b3c4..5d6e7f8 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,5 +10,5 @@ export function start() {
   const port = 8080;
-  const host = "localhost";
+  const host = "0.0.0.0";
   listen(host, port);
   log("up");
 }
@@ -40,3 +40,4 @@ export function stop() {
   close();
+  log("down");
 }`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const all = (src: string) => check(parse(src, { path: "p.dh.md" }));
const errorsOf = (src: string) => all(src).filter((p) => p.level === "error").map((p) => p.message);
const warnsOf = (src: string) => all(src).filter((p) => p.level === "warn").map((p) => p.message);
const lim = LIMITS;
const P = (body: string, attrs: Record<string, string> = {}, l = lim, b?: Budget) => parseDiff(body, 1, attrs, l, b);
const props = (data: ReturnType<typeof parseDiff>, st?: string | false, width = 600) => ({ data, block: { id: "x", line: 1, attrs: {}, llm: "" } as any, ui: {} as any, static: st, stage: { width, theme: "light" as const, motion: "on" as const, report() {} } });
const html = (body: string, st?: string | false, attrs: Record<string, string> = {}, width = 600) => renderToStaticMarkup(React.createElement(DiffView, props(P(body, attrs), st, width)));
const marked = (l: { text: string; marks?: [number, number][] }) => (l.marks ?? []).map(([a, b]) => l.text.slice(a, b)).join("");

describe("diff: parse and the LLM view", () => {
  test("a diff is a block with files, hunks and numbers on both sides, and no problems", () => {
    const doc = parse(fence(D), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "diff")!;
    expect(b).toBeDefined();
    if (b.type !== "diff") throw new Error("not diff");
    const r = b.data;
    expect(r.files.length).toBe(1);
    expect(r.files[0].newName).toBe("src/a.ts");
    expect(r.files[0].note).toBe("");   // an index line says nothing a reader needs
    expect(r.files[0].hunks.map((h) => [h.oldStart, h.newStart])).toEqual([[10, 10], [40, 40]]);
    const del = r.files[0].hunks[0].lines.find((l) => l.k === "-")!;
    expect(del.old).toBe(11);
    expect(del.new).toBeNull();
    expect([r.adds, r.dels]).toEqual([2, 1]);
    expect(b.llmKind).toBe("as-is");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
  test("word marks inside a changed line, by jsdiff", () => {
    const h = P(D).files[0].hunks[0].lines;
    const del = h.find((l) => l.k === "-")!, add = h.find((l) => l.k === "+")!;
    expect(marked(del)).toContain("localhost");
    expect(marked(add)).toContain("0.0.0.0");
    expect(marked(del)).not.toContain("const");   // the unchanged start is not marked
  });
  test("a body with no @@ hunk is not a diff: a warning, never an error, and a plain block", () => {
    expect(looksLikeDiff("just text\n- a\n+ b")).toBe(false);
    expect(looksLikeDiff(D)).toBe(true);
    const src = fence("- a\n+ b");
    expect(errorsOf(src)).toEqual([]);
    expect(warnsOf(src).some((m) => m.includes("diff:") && m.includes("stays a plain code block"))).toBe(true);
    const d = P("- a\n+ b");
    expect(d.plain).toBe(true);
    expect(d.src).toBe("- a\n+ b");
  });
  test("hand-written counts that are wrong still read", () => {
    expect(P("@@ -1,1 +1,1 @@\n a\n-b\n+c\n d\n e").files[0].hunks[0].lines.length).toBe(5);
  });
  test("renames, new files and a note", () => {
    const d = P("diff --git a/old.txt b/new.txt\nsimilarity index 90%\nrename from old.txt\nrename to new.txt\n--- a/old.txt\n+++ b/new.txt\n@@ -1 +1 @@\n-a\n+b");
    expect(d.files[0]).toMatchObject({ oldName: "old.txt", newName: "new.txt" });
    expect(d.files[0].note).toContain("rename");
    expect(P("--- /dev/null\n+++ b/n.txt\n@@ -0,0 +1 @@\n+hi").files[0].oldName).toBe("/dev/null");
  });
  test("two files: one header each", () => {
    expect(P(D + "\ndiff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-x\n+y").files.map((f) => f.newName)).toEqual(["src/a.ts", "b.ts"]);
  });
  test("a gap between hunks and a long unchanged run fold", () => {
    const long = "@@ -1,30 +1,31 @@\n" + Array.from({ length: 14 }, (_, i) => ` ctx ${i}`).join("\n") + "\n-old\n+new\n" + Array.from({ length: 3 }, (_, i) => ` end ${i}`).join("\n") + "\n@@ -60,2 +61,2 @@\n a\n-b\n+c";
    const rows = rowsOf(P(long).files[0]);
    expect(rows.filter((r) => r.t === "gap").map((r: any) => [r.n, !!r.hidden])).toEqual([[8, true], [29, false]]);
  });
  test("split view pairs a removed block with the added block after it", () => {
    const pairs = splitPairs(P("@@ -1,3 +1,3 @@\n a\n-b1\n-b2\n+c1\n d").files[0].hunks[0].lines);
    expect(pairs.map(([x, y]) => [x?.text ?? null, y?.text ?? null])).toEqual([["a", "a"], ["b1", "c1"], ["b2", null], ["d", "d"]]);
  });
  test("the LLM view is the diff as written", () => {
    const doc = parse(fence(D), { path: "p.dh.md" });
    expect(doc.llm).toContain("```diff\ndiff --git a/src/a.ts");
    expect(doc.llm).toContain('-  const host = "localhost";');
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence(D) + "\n:::llm\nThe server now binds every interface.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("The server now binds every interface.");
    expect(doc.llm).not.toContain("diff --git");
  });
});

describe("diff: every refusal names the line and the fix", () => {
  test("view= is split or unified", () => {
    expect(errorsOf(fence(D, "view=side")).some((m) => /diff: view= is split or unified/.test(m))).toBe(true);
    expect(errorsOf(fence(D, "view=split"))).toEqual([]);
  });
  test("an unknown fence key", () => { expect(errorsOf(fence(D, "colour=red")).join()).toMatch(/unknown key "colour"/); });
  test("a line inside a hunk that does not start with +, - or a space, naming the line", () => {
    const p = all(fence("@@ -1,3 +1,3 @@\n a\nthis is not a diff line\n b")).find((x) => x.level === "error")!;
    expect(p.message).toMatch(/diff: .*must start with \+, - or a space/);
    expect(p.line).toBe(6);   // fence on 3, the hunk on 4, ' a' on 5, the bad line on 6
  });
  test("a refused diff is drawn as its message and its text", () => {
    const h = html("@@ -1,3 +1,3 @@\n a\nthis is not a diff line\n b");
    expect(h).toContain("cw-error");
    expect(h).toContain("this is not a diff line");
  });
});

describe("diff: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS", () => {
    expect(LIMITS.diffLines).toBe(4000);
    expect(LIMITS.diffFiles).toBe(40);
    for (const k of ["diffLines", "diffFiles", "diffWordLine", "diffWordTokens", "diffEditLength"] as const) {
      expect(LIMITS[k]).toBeGreaterThan(0);
      expect(UNTRUSTED_LIMITS[k]).toBeLessThanOrEqual(LIMITS[k]);
    }
  });
  test("over 4000 lines, over 40 files, at the host's own cap and the strict set", () => {
    expect(errorsOf(fence("@@ -1 +1 @@\n" + "+x\n".repeat(4005))).join()).toMatch(/the most is 4000/);
    expect(errorsOf(fence(Array.from({ length: 41 }, (_, i) => `--- a/f${i}\n+++ b/f${i}\n@@ -1 +1 @@\n-a\n+b`).join("\n"))).join()).toMatch(/more than 40 files/);
    const small = "@@ -1,30 +1,30 @@\n" + "+x\n".repeat(30);
    expect(errorsOf(fence(small))).toEqual([]);
    expect(check(parse(fence(small), { path: "p.dh.md", limits: { diffLines: 20 } })).some((p) => /the most is 20/.test(p.message))).toBe(true);
    const mid = "@@ -1 +1 @@\n" + "+x\n".repeat(3000);
    expect(errorsOf(fence(mid) + "\n:::llm\nA long diff.\n:::\n")).toEqual([]);
    expect(check(parse(fence(mid), { path: "p.dh.md", limits: UNTRUSTED_LIMITS })).some((p) => /the most is 2000/.test(p.message))).toBe(true);
  });
  test("two long one-line files cost a count, not a hang", () => {
    const a = "word ".repeat(40_000), b = "other ".repeat(40_000);
    const t = Date.now();
    const r = P(`@@ -1 +1 @@\n-${a}\n+${b}`);
    expect(Date.now() - t).toBeLessThan(2000);
    expect(r.files[0].hunks[0].lines[0].marks).toBeUndefined();   // too long for word marks: the line is marked whole
    const c = Array.from({ length: 250 }, (_, i) => `a${i}`).join(" "), e = Array.from({ length: 250 }, (_, i) => `b${i}`).join(" ");
    const t2 = Date.now();
    P(`@@ -1 +1 @@\n-${c}\n+${e}`);
    expect(Date.now() - t2).toBeLessThan(2000);
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const doc = parse(fence("@@ -1,200 +1,200 @@\n" + "+x\n".repeat(200)), { path: "p.dh.md", limits: { maxEvalSteps: 100 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the diff part does too much work/);
    expect(doc.llm).toContain("[diff not shown: the diff part does too much work");
  });
});

describe("diff: linear (the doubling test, charges counted)", () => {
  const caps = { ...LIMITS, diffLines: 1e9, diffFiles: 1e9 };
  const body = (n: number) => Array.from({ length: n }, (_, k) => `--- a/f${k}.ts\n+++ b/f${k}.ts\n@@ -1,4 +1,4 @@\n ctx ${k}\n-const host${k} = "localhost";\n+const host${k} = "0.0.0.0";\n ctx two`).join("\n");
  const cost = (n: number) => { const b = big(); const d = parseDiff(body(n), 1, {}, caps, b); for (const f of d.files) rowsOf(f, b); return b.steps + b.values + b.chars; };
  test("parse and the rows: twice the input costs at most about twice", () => {
    for (const n of [30, 120, 480]) {
      const r = cost(2 * n) / cost(n);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("a long line is read once, in time", () => {
    for (const mk of [(n: number) => `@@ -1 +1 @@\n-${"a ".repeat(n)}\n+${"b ".repeat(n)}`, (n: number) => `diff --git a/${"x".repeat(n)} b/y\n@@ -1 +1 @@\n+a`, (n: number) => `@@ -1 +1 @@\n+${"@@ -1 +1 @@ ".repeat(n)}`]) {
      const b1 = big(), b2 = big();
      const t = Date.now();
      parseDiff(mk(20_000), 1, {}, caps, b1);
      parseDiff(mk(40_000), 1, {}, caps, b2);
      expect(Date.now() - t).toBeLessThan(2000);
      expect(b2.steps / b1.steps).toBeLessThan(2.3);
    }
  });
});

describe("diff: the view", () => {
  test("both layouts, word marks, a fold button, the file header and its counts", () => {
    const h = html(D, undefined, {}, 0);   // before the first measure both layouts are drawn
    for (const w of ["diff-u", "diff-sp", "diff-w", 'aria-pressed="true"', "src/a.ts", "aria-expanded", "1 file changed"]) expect(h).toContain(w);
  });
  test("a measured stage draws the layout that fits, the other not at all", () => {
    expect(html(D, undefined, {}, 1000)).not.toContain("diff-u\"");
    expect(html(D, undefined, {}, 1000)).toContain("diff-sp");
    expect(html(D, undefined, {}, 390)).not.toContain("diff-sp");
    expect(html(D, undefined, { view: "split" }, 390)).toContain("diff-sp");
  });
  test("a long unchanged run folds, with a button that opens it", () => {
    const long = "@@ -1,30 +1,31 @@\n" + Array.from({ length: 14 }, (_, i) => ` ctx ${i}`).join("\n") + "\n-old\n+new";
    expect(html(long, undefined, {}, 390)).toContain("8 lines");
    expect(html(long, undefined, {}, 390)).toContain("<button");
  });
  test("static draws the whole diff with no button, marked static", () => {
    const long = "@@ -1,30 +1,31 @@\n" + Array.from({ length: 14 }, (_, i) => ` ctx ${i}`).join("\n") + "\n-old\n+new";
    const s = html(long, "", {}, 390), live = html(long, undefined, {}, 390);
    expect(live).not.toContain("data-dh-static");
    expect(s).toContain("data-dh-static");
    expect(s).not.toContain("<button");
    expect(s).toContain("8 lines");
    expect(s).toContain("ctx 13");
  });
  test("the title", () => {
    expect(html(D, undefined, { title: "A change" })).toContain("A change");
  });
  test("a narrow diff keeps its signs and numbers in view (sticky columns) and does not wrap", () => {
    const css = readFileSync(join(import.meta.dir, "style.css"), "utf8");
    const narrow = css.slice(css.indexOf("@container (max-width: 640px)"));
    expect(narrow).toMatch(/\.diff-n[^{]*\{[^}]*position: sticky/);
    expect(narrow).toMatch(/\.diff-s[^{]*\{[^}]*position: sticky/);
    expect(narrow).toMatch(/\.diff-stick[^{]*\{[^}]*position: sticky/);
    expect(narrow).toMatch(/white-space: pre;/);
  });
  test("no HTML string sink", () => {
    const src = readFileSync(join(import.meta.dir, "view.tsx"), "utf8");
    expect(src).not.toMatch(new RegExp([["inner", "HTML"].join(""), ["dangerouslySetInner", "HTML"].join(""), ["insertAdjacent", "HTML"].join(""), "document\\.write", "eval\\(", "new Function"].join("|")));
  });
});

describe("diff: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every diff drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "diff").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const doc = parse(text, { path: f, limits });
        const e = check(doc).filter((p) => p.level === "error");
        expect(e.length).toBeGreaterThan(0);
        expect(e.every((p) => p.line >= 1)).toBe(true);
      }
      const b = new Budget(partLimitsOf(LIMITS), null, null, "the diff part");
      expect(() => parseDiff(text, 1, {}, LIMITS, b)).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(diff.name).toBe("diff");
  expect(diff.steps).toBe(false);
  expect(diff.llmKind).toBe("as-is");
  expect(diff.dependencies).toEqual(["diff"]);
});
