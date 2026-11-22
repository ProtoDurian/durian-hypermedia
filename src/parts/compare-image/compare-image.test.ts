// The compare-image part: parse, the URL policy, the LLM view, every refusal, its caps in both sets, the doubling test
// (budget charges counted at n and 2n, never time), the hostile fixtures and the rendered markup.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { DhContext } from "../../react/context";
import { Budget, partLimitsOf } from "../../core/budget";
import compareImage, { parseCompareImage, compareImageLlm, imageUrlProblem, imageLine } from "./part";
import CompareImageView from "./view";
import { UI } from "../../ui/ui";

const fence = (body: string, info = 'title="The editor"') => `# Page\n\n\`\`\`compare-image ${info}\n${body}\n\`\`\`\n`;
const CI = `before: images/a.png "A photo of the old editor"\nafter: images/b.png "A photo of the new editor"`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const NOCAP = { compareImageAlt: 1e9, compareImageLabel: 1e9, compareImageUrl: 1e9 };
const read = (body: string, attrs: Record<string, string> = {}, lim: typeof LIMITS = LIMITS, b?: Budget) => parseCompareImage(body, 1, 0, attrs, lim, b);
const errorsOf = (src: string, limits?: Partial<typeof LIMITS>) => check(parse(src, { path: "p.dh.md", limits })).filter((p) => p.level === "error").map((p) => p.message);
const joined = (body: string, info?: string) => errorsOf(fence(body, info)).join("\n");

describe("compare-image: parse and the LLM view", () => {
  test("a good pair is a block with its data and no problems", () => {
    const doc = parse(fence(CI, 'title="The editor" before="Old" after="New" start=30 direction=vertical ratio=16:9 fit=contain'), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "compare-image")!;
    if (!b || b.type !== "compare-image") throw new Error("not a compare-image");
    expect(b.data.ci).toMatchObject({ beforeLabel: "Old", afterLabel: "New", start: 30, vertical: true, ratio: "16:9", fit: "contain" });
    expect(b.data.ci!.before).toEqual({ src: "images/a.png", alt: "A photo of the old editor" });
    expect(b.llmKind).toBe("own");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);   // plain data: parse on a server, draw in a browser
  });
  test("defaults: Before and After, the bar at 50, horizontal, cover", () => {
    expect(read(CI).ci).toMatchObject({ beforeLabel: "Before", afterLabel: "After", start: 50, vertical: false, ratio: "", fit: "cover" });
  });
  test("the image line: an escaped quote in the alt text, a role in either order, no alt text", () => {
    expect(imageLine('before: a.png "say \\"hi\\" and \\\\ now"')).toEqual({ role: "before", src: "a.png", alt: 'say "hi" and \\ now' });
    expect(imageLine('after:b.png   "x"')).toEqual({ role: "after", src: "b.png", alt: "x" });
    expect(imageLine("before: a.png")).toEqual({ role: "before", src: "a.png", noAlt: true });
    expect(imageLine('before: a.png "x" extra')).toBeNull();
    expect(imageLine('before: a.png "never closes')).toBeNull();
    expect(imageLine("middle: a.png \"x\"")).toBeNull();
  });
  test("the LLM view is the title, the two labels and the two alt texts", () => {
    const want = "The editor: Light and Dark\n- Light: A photo of the old editor\n- Dark: A photo of the new editor";
    expect(parse(fence(CI, 'title="The editor" before="Light" after="Dark"'), { path: "p.dh.md" }).llm).toContain(want);
    expect(compareImageLlm(read(CI), "")).toBe("Before and After\n- Before: A photo of the old editor\n- After: A photo of the new editor");
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence(CI) + "\n:::llm\nThe new editor has a dark theme.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("The new editor has a dark theme.");
    expect(doc.llm).not.toContain("A photo of the old editor");
  });
  test("a body that does not read stays a code block in the LLM view", () => {
    expect(parse(fence('before: a.png "x"'), { path: "p.dh.md" }).llm).toContain('```compare-image\nbefore: a.png "x"\n```');
  });
});

describe("compare-image: the URL policy (a relative path, http or https, an image file)", () => {
  test("these addresses pass", () => {
    for (const u of ["a.png", "images/a.png", "/img/a.jpeg", "./a.webp", "https://example.com/a.gif", "http://192.0.2.1/a.avif", "a.svg?v=2#x", "dir/a..b.png", "A.PNG"]) expect(imageUrlProblem(u)).toBeNull();
  });
  test("data:, blob:, javascript:, file:, ftp:, protocol-relative, backslash, .. and not an image are refused, each with its reason", () => {
    expect(imageUrlProblem("data:image/png;base64,AAAA")).toContain('starts with "data:"');
    expect(imageUrlProblem("blob:https://example.com/x")).toContain('starts with "blob:"');
    expect(imageUrlProblem("JavaScript:alert(1)")).toContain('starts with "JavaScript:"');
    expect(imageUrlProblem("file:///etc/a.png")).toContain('starts with "file:"');
    expect(imageUrlProblem("ftp://example.com/a.png")).toContain('starts with "ftp:"');
    expect(imageUrlProblem("//example.com/a.png")).toContain("starts with //");
    expect(imageUrlProblem("images\\a.png")).toContain("backslash");
    expect(imageUrlProblem("../a.png")).toContain("leaves the folder");
    expect(imageUrlProblem("a/../b.png")).toContain("leaves the folder");
    expect(imageUrlProblem("a/..")).toContain("leaves the folder");
    expect(imageUrlProblem("a/notes.txt")).toContain("is not an image file");
    expect(imageUrlProblem("a/noext")).toContain("is not an image file");
    expect(imageUrlProblem("")).toContain("no address");
    expect(imageUrlProblem("a".repeat(501) + ".png")).toContain("over 500");
  });
  test("a refused address refuses the part, with the role and the line", () => {
    const m = joined('before: data:image/png;base64,AAAA "x"\nafter: b.png "y"');
    expect(m).toContain('compare-image: ');
    expect(m).toContain('before: the address starts with "data:"');
    expect(m).not.toContain("after:");
  });
});

describe("compare-image: every refusal names the line and the fix", () => {
  test("no alt text, a missing image, a repeated role, an unknown line, an empty alt text", () => {
    expect(joined('before: a.png\nafter: b.png "x"')).toContain("needs the alt text in double quotes");
    expect(joined('before: a.png "x"')).toContain('needs a "after:');
    expect(joined('before: a.png "x"\nbefore: b.png "y"\nafter: c.png "z"')).toContain("given twice");
    expect(joined('first: a.png "x"')).toContain("a line is: before:");
    expect(joined('before: a.png ""\nafter: b.png "x"')).toContain("alt text is empty");
  });
  test("bad options, each with the fix", () => {
    const cases: [string, string][] = [['start=500', "start= is a percentage"], ["start=-1", "start= is a percentage"], ["direction=diagonal", "direction= is horizontal"], ["ratio=wide", "ratio= is width:height"], ["ratio=16:", "ratio= is width:height"], ["ratio=100:9", "ratio= is width:height"], ["fit=stretch", "fit= is cover or contain"], ['before=""', "before= is a label"], ["colour=red", 'unknown key "colour"']];
    for (const [attrs, msg] of cases) expect(joined(CI, attrs)).toContain(msg);
  });
  test("the line number is the line's own", () => {
    const src = fence('before: a.png "x"\n// a comment\nafter: b.png', "");
    const out = check(parse(src, { path: "p.dh.md" })).filter((p) => p.level === "error" && p.message.includes("needs the alt text"));
    expect(out.length).toBe(1);
    expect(out[0].line).toBe(src.split("\n").findIndex((l) => l.startsWith("after:")) + 1);
  });
});

describe("compare-image: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS, the strict ones no higher", () => {
    expect([LIMITS.compareImageAlt, LIMITS.compareImageLabel, LIMITS.compareImageUrl]).toEqual([300, 40, 500]);
    for (const k of Object.keys(LIMITS).filter((x) => x.startsWith("compareImage"))) expect((UNTRUSTED_LIMITS as any)[k]).toBeLessThanOrEqual((LIMITS as any)[k]);
    expect([UNTRUSTED_LIMITS.compareImageAlt, UNTRUSTED_LIMITS.compareImageUrl]).toEqual([200, 300]);
  });
  test("alt text, label and address length", () => {
    expect(joined(`before: a.png "${"a".repeat(301)}"\nafter: b.png "x"`)).toContain("at most 300");
    expect(joined(`before: a.png "${"a".repeat(300)}"\nafter: b.png "x"`)).not.toContain("at most");
    expect(joined(CI, `before="${"L".repeat(41)}"`)).toContain("1 to 40 characters");
  });
  test("the strict set takes shorter alt text and addresses; a host's own cap works too", () => {
    const long = `before: a.png "${"a".repeat(250)}"\nafter: b.png "x"`;
    expect(errorsOf(fence(long))).toEqual([]);
    expect(errorsOf(fence(long), UNTRUSTED_LIMITS).join("\n")).toContain("at most 200");
    expect(errorsOf(fence(long), { compareImageAlt: 100 }).join("\n")).toContain("at most 100");
    const url = `before: ${"d/".repeat(160)}a.png "x"\nafter: b.png "y"`;
    expect(errorsOf(fence(url))).toEqual([]);
    expect(errorsOf(fence(url), UNTRUSTED_LIMITS).join("\n")).toContain("over 300 characters");
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const body = Array.from({ length: 4000 }, () => "not a line at all").join("\n");
    const doc = parse(fence(body), { path: "p.dh.md", limits: { maxEvalSteps: 2000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the compare-image part does too much work/);
    expect(doc.llm).toContain("[compare-image not shown: the compare-image part does too much work");
  });
});

describe("compare-image: linear (the doubling test, charges counted)", () => {
  const lines = (n: number) => Array.from({ length: n }, (_, k) => `// note ${k} that is not an image line, with some words`).join("\n") + "\n" + CI;
  const cost = (body: string) => { const b = big(); read(body, {}, NOCAP as typeof LIMITS, b); return b.steps + b.values + b.chars; };
  test("lines: twice the input costs at most about twice", () => {
    for (const n of [50, 200, 800]) { const r = cost(lines(2 * n)) / cost(lines(n)); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("a long alt text and a long bad line are read once", () => {
    for (const mk of [(n: number) => `before: a.png "${"x".repeat(n)}"\nafter: b.png "y"`, (n: number) => `before: ${"x".repeat(n)}`, (n: number) => `before: a.png "${"\\".repeat(n)}`, (n: number) => `before: ${"../".repeat(n)}a.png "x"`]) {
      const b1 = big(), b2 = big();
      read(mk(20_000), {}, NOCAP as typeof LIMITS, b1);
      read(mk(40_000), {}, NOCAP as typeof LIMITS, b2);
      expect((b2.steps + b2.chars) / (b1.steps + b1.chars)).toBeLessThan(2.3);
    }
  });
  test("a hostile long line ends fast", () => {
    const t = Date.now();
    for (const f of ['"', "\\", " ", "../", ":", "a:"]) read(`before: ` + f.repeat(100_000), {}, NOCAP as typeof LIMITS, big());
    expect(Date.now() - t).toBeLessThan(2500);
  });
  test("a part within its caps fits one part's budget", () => {
    const d = read(`before: ${"d/".repeat(240)}a.png "${"a".repeat(300)}"\nafter: b.png "x"`, {}, LIMITS, new Budget(partLimitsOf(LIMITS), null, null, "the compare-image part"));
    expect(d.errors).toEqual([]);
  });
});

describe("compare-image: the view", () => {
  const draw = (src: string, attrs: Record<string, string> = {}, policy?: (u: string, k: string) => string | null) => {
    const d = read(src, attrs);
    const props: any = { data: d, block: { type: "compare-image", id: null, line: 1, attrs, llm: null, llmKind: "own", data: d }, ui: UI.en, static: undefined, stage: { width: 700, theme: "light", motion: "on", report() {} } };
    const el = React.createElement(CompareImageView, props);
    return renderToStaticMarkup(policy ? React.createElement(DhContext.Provider, { value: { ui: UI.en, urlPolicy: policy as any, slots: {} as any, components: {}, hostBlocks: new Map(), hostInlines: new Map(), llmPeek: false, demoteHeadings: 0 }, children: el }) : el);
  };
  test("the slider is a slider with a value and words, a button for each picture, and no autoplay", () => {
    const h = draw(CI, { before: "Light", after: "Dark", start: "40" });
    expect(h).toContain('role="slider"');
    expect(h).toContain('aria-valuenow="40"');
    expect(h).toContain("Light 40%, Dark 60%");
    expect(h).toContain(">Light</button>");
    expect(h).toContain('alt="A photo of the old editor"');
    expect(h).toContain('src="images/a.png"');
    expect(h).not.toContain("data-dh-part");   // the frame sets it
    expect(h).not.toMatch(/autoplay|<video/);
  });
  test("vertical turns the slider and its help", () => {
    const h = draw(CI, { direction: "vertical" });
    expect(h).toContain('aria-orientation="vertical"');
    expect(h).toContain("Drag up and down");
  });
  test("an address the host's policy refuses is a message, not an <img>", () => {
    const h = draw('before: https://example.com/a.png "x"\nafter: b.png "y"', {}, (u) => (u.startsWith("https:") ? null : u));
    expect(h).toContain("not allowed here");
    expect(h).not.toContain("<img");
  });
  test("the default policy draws a relative path and https, and refuses http", () => {
    expect(draw('before: a.png "x"\nafter: https://example.com/b.png "y"')).toContain("<img");
    expect(draw('before: http://example.com/a.png "x"\nafter: b.png "y"')).toContain("not allowed here");
  });
  test("a body that does not read draws the first message", () => {
    const h = draw('before: a.png "x"');
    expect(h).toContain("cw-error");
    expect(h).not.toContain("<img");
  });
});

describe("compare-image: fixtures and the sample's files", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every pair drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "compare-image").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a line, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const errs = check(parse(text, { path: f, limits })).filter((p) => p.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((p) => p.line >= 1)).toBe(true);
      }
      for (const m of text.matchAll(/```compare-image[^\n]*\n([\s\S]*?)\n```/g)) {
        const b = new Budget(partLimitsOf(LIMITS), null, null, "the compare-image part");
        expect(() => read(m[1], {}, LIMITS, b)).not.toThrow();
      }
    });
  }
  test("the sample names two images that ship in this folder", () => {
    const sample = readFileSync(join(import.meta.dir, "sample.md"), "utf8");
    for (const m of sample.matchAll(/^(?:before|after): media\/(\S+) /gm)) expect(existsSync(join(import.meta.dir, "media", m[1]))).toBe(true);
    const doc = parse(sample, { path: "s.dh.md" });
    expect(check(doc)).toEqual([]);
  });
});

test("the definition matches its folder", () => {
  expect(compareImage.name).toBe("compare-image");
  expect(compareImage.steps).toBe(false);
});
