// The gallery part: parse, LLM view, every refusal, its caps in both sets, the doubling test (budget charges counted at n and
// 2n, never time) and the hostile fixtures.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import gallery, { parseGallery, galleryLlm, imgLine } from "./part";

const fence = (body: string, info = "") => `# Page\n\n\`\`\`gallery${info ? " " + info : ""}\n${body}\n\`\`\`\n`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const errorsOf = (src: string, opts: Record<string, unknown> = {}) => check(parse(src, { path: "p.dh.md", ...opts })).filter((p) => p.level === "error" && !/token/.test(p.message)).map((p) => p.message);
const p = (body: string, attrs: Record<string, string> = {}, lim = LIMITS) => parseGallery(body, 2, attrs, 1, lim, big());
const BODY = `![The file tree, closed](media/tree-closed.png "Closed: only the top folders")
![The file tree, open](media/tree-open.png "Open: every file, marks on the changed ones")
![On a phone](media/phone.png)`;

describe("gallery: parse and the LLM view", () => {
  test("a good gallery is a block with its data and no problems; the data is plain JSON", () => {
    const doc = parse(fence(BODY, 'title="The new editor" view=carousel'), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "gallery")!;
    if (!b || b.type !== "gallery") throw new Error("not a gallery");
    expect(b.data.images.length).toBe(3); expect(b.data.view).toBe("carousel"); expect(b.data.images[2].caption).toBe("");
    expect(b.llmKind).toBe("own");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);
  });
  test("the LLM view, and the page's LLM view carries it", () => {
    const want = "Gallery: The new editor (3 images).\n1. The file tree, closed (media/tree-closed.png): Closed: only the top folders\n2. The file tree, open (media/tree-open.png): Open: every file, marks on the changed ones\n3. On a phone (media/phone.png)";
    expect(galleryLlm(p(BODY, { title: "The new editor", view: "carousel" }))).toBe(want);
    expect(parse(fence(BODY, 'title="The new editor" view=carousel'), { path: "p.dh.md" }).llm).toContain(want);
  });
  test("the default view: a grid for several images, single for one; the options", () => {
    expect(p("![One](a.png)").view).toBe("single");
    expect(p(BODY).view).toBe("grid");
    const g = p(BODY, { view: "grid", columns: "4", ratio: "1:1", start: "2", loop: "true" });
    expect([g.columns, g.ratio, g.start, g.loop]).toEqual([4, "1:1", 2, true]);
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence(BODY) + "\n:::llm\nThree pictures of the editor.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("Three pictures of the editor.");
    expect(doc.llm).not.toContain("Gallery: images");
  });
  test("an image line is read by one scan", () => {
    expect(imgLine('![alt](a.png "cap")')).toEqual(["alt", "a.png", "cap"]);
    expect(imgLine("![alt](a.png)")).toEqual(["alt", "a.png", undefined]);
    for (const l of ["not an image", "![a](b.png", "![a]b.png)", '![a](b.png "x" y)', "![a]]](b.png)", "![a]()"]) expect(imgLine(l)).toBeNull();
  });
});

describe("gallery: every refusal names the line and the fix", () => {
  const cases: [string, string, string, RegExp][] = [
    ["a line that is not an image", "", "not an image", /is not one image; a gallery line is !\[alt text\]\(path "caption"\)/],
    ["no alt text", "", "![](a.png)", /has no alt text/],
    ["a data address", "", "![x](data:image/png;base64,AA)", /not allowed/],
    ["a script address", "", "![x](javascript:alert(1))", /not allowed/],
    ["a file that is not an image", "", "![x](a.txt)", /not an image file/],
    ["a carousel of one", "view=carousel", "![x](a.png)", /a carousel of one image is no carousel/],
    ["no images", "", "// nothing", /no images/],
    ["too many columns", "columns=9", "![x](a.png)\n![y](b.png)", /columns= is 2 to 5/],
    ["a bad ratio", "ratio=2:1", "![x](a.png)\n![y](b.png)", /ratio="2:1" is 16:9, 4:3, 1:1 or auto/],
    ["a bad view", "view=wall", "![x](a.png)\n![y](b.png)", /view="wall" is single, grid or carousel/],
    ["a start past the end", "start=5", "![x](a.png)\n![y](b.png)", /start=5 is not an image number from 1 to 2/],
    ["an unknown option", "colour=c1", "![x](a.png)", /unknown option "colour"/],
  ];
  for (const [what, info, body, re] of cases) test(what, () => {
    const errs = errorsOf(fence(body, info));
    expect(errs.some((m) => re.test(m))).toBe(true);
    expect(errs.every((m) => m.includes("gallery:"))).toBe(true);
  });
  test("a good gallery has none", () => {
    expect(errorsOf(fence("![x](a.png)\n![y](b.png)", "view=carousel loop columns=2 ratio=1:1"))).toEqual([]);
  });
});

describe("gallery: caps in both sets", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => `![img ${i}](a${i}.png)`).join("\n");
  test("its cap is in LIMITS and UNTRUSTED_LIMITS", () => {
    expect(LIMITS.galleryImages).toBe(60);
    expect(UNTRUSTED_LIMITS.galleryImages).toBeLessThanOrEqual(LIMITS.galleryImages);
  });
  test("over the cap: refused, at the host's own cap too; at the cap is fine", () => {
    expect(errorsOf(fence(rows(60)))).toEqual([]);
    expect(errorsOf(fence(rows(61))).some((m) => /more than 60 images \(the cap\)/.test(m))).toBe(true);
    expect(p(rows(61)).images.length).toBe(60);
    expect(errorsOf(fence(rows(11)), { limits: { galleryImages: 10 } }).some((m) => /more than 10 images/.test(m))).toBe(true);
  });
  test("the strict set takes fewer", () => {
    expect(errorsOf(fence(rows(31)), { limits: UNTRUSTED_LIMITS }).some((m) => /more than 30 images/.test(m))).toBe(true);
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const doc = parse(fence(rows(5000)), { path: "p.dh.md", limits: { maxEvalSteps: 2000, galleryImages: 1e9 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the gallery part does too much work/);
    expect(doc.llm).toContain("[gallery not shown: the gallery part does too much work");
  });
});

describe("gallery: linear (the doubling test, charges counted)", () => {
  const body = (n: number) => Array.from({ length: n }, (_, i) => `![Picture number ${i} with some words](media/a${i}.jpg "a caption for number ${i}")`).join("\n");
  const cost = (n: number) => { const b = big(); parseGallery(body(n), 1, {}, 1, { galleryImages: 1e9 }, b); return b.steps + b.values + b.chars; };
  test("twice the input costs at most about twice", () => {
    for (const n of [50, 200, 800]) { const r = cost(2 * n) / cost(n); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("a long line is read once", () => {
    const b1 = big(), b2 = big();
    parseGallery("![" + "x".repeat(20_000) + "](a.png)", 1, {}, 1, LIMITS, b1);
    parseGallery("![" + "x".repeat(40_000) + "](a.png)", 1, {}, 1, LIMITS, b2);
    expect(b2.steps / b1.steps).toBeLessThan(2.2);
    parseGallery("![a](" + "(".repeat(40_000), 1, {}, 1, LIMITS, big());
  });
});

describe("gallery: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every gallery drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "gallery").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const errs = check(parse(text, { path: f, limits })).filter((q) => q.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((q) => q.line >= 1)).toBe(true);
      }
      expect(() => parseGallery(text, 1, {}, 1, LIMITS, new Budget(partLimitsOf(LIMITS), null, null, "the gallery part"))).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(gallery.name).toBe("gallery");
  expect(gallery.steps).toBe(false);
});
