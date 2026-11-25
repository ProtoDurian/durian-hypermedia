// The Lottie part: parse, LLM view, every refusal, its caps in both sets, the file checks and colour slots (run in the
// browser, tested here with a budget), the doubling test (charges counted, never time) and the hostile fixtures.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, BudgetError, partLimitsOf } from "../../core/budget";
import lottie, { parseLottie, lottieLlm, lottieFiles } from "./part";
import { checkLottieData, lottieForDrawing, lottieNames, recolourLottie } from "./check";

const fence = (body: string, info = "") => `# Page\n\n\`\`\`lottie${info ? " " + info : ""}\n${body}\n\`\`\`\n`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const errorsOf = (src: string, opts: Record<string, unknown> = {}) => check(parse(src, { path: "p.dh.md", ...opts })).filter((p) => p.level === "error").map((p) => p.message);
const has = (list: string[], re: RegExp) => list.some((m) => re.test(m));
const p = (body: string, attrs: Record<string, string> = { src: "a.json" }, lim: any = LIMITS) => parseLottie(body, 2, attrs, 1, lim, big());
const CAPS = { bytes: LIMITS.lottieBytes, frames: LIMITS.lottieFrames, layers: LIMITS.lottieLayers, nodes: LIMITS.lottieNodes };

describe("lottie: parse and the LLM view", () => {
  test("parse, the block, the plain JSON data and no problems", () => {
    const l = p("alt: A box fills with blocks.\ncolours: dh-c1 = c1, dh-warn = warn", { src: "media/loading.json", title: "What happens while it builds", loop: "true", speed: "1.5", start: "paused" });
    expect(l.errors).toEqual([]); expect(l.colours).toEqual([{ name: "dh-c1", tone: "c1" }, { name: "dh-warn", tone: "warn" }]); expect(l.loop).toBe(true); expect(l.paused).toBe(true); expect(l.speed).toBe(1.5);
    expect(l.caps).toEqual(CAPS);
    const doc = parse(fence("alt: A box fills with blocks.", 'src="media/loading.json" title="T" loop'), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "lottie")!;
    if (!b || b.type !== "lottie") throw new Error("not lottie");
    expect(b.data.loop).toBe(true);   // a bare word is a flag
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);
    expect(check(doc)).toEqual([]);
  });
  test("the LLM view, and the page's LLM view carries it", () => {
    const want = "Lottie animation: What happens while it builds. A box fills with blocks.";
    expect(lottieLlm(p("alt: A box fills with blocks.", { src: "media/loading.json", title: "What happens while it builds" }))).toBe(want);
    expect(lottieLlm(p("alt: Moves.", { src: "media/a.json" }))).toBe("Lottie animation: a.json. Moves.");
    expect(parse(fence("alt: A box fills with blocks.", 'src="media/loading.json" title="What happens while it builds"'), { path: "p.dh.md" }).llm).toContain(want);
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence("alt: x", 'src="a.json"') + "\n:::llm\nA spinner.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("A spinner.");
  });
});

describe("lottie: every refusal names the line and the fix", () => {
  const run = (info: string, b: string) => errorsOf(fence(b, info));
  test("refusals", () => {
    expect(has(run('src="a.json"', ""), /no alt: line; say what the animation shows/)).toBe(true);
    expect(has(run('src="a.gif"', "alt: x"), /is not a Lottie file \(json\)/)).toBe(true);
    expect(has(run('src="a.json"', "alt: x\ncolours: dh-c1 = purple"), /"purple" is not a theme colour word/)).toBe(true);
    expect(has(run('src="a.json"', "alt: x\ncolours: dh-c1"), /is not "name = colour"/)).toBe(true);
    expect(has(run('src="a.json" speed=9', "alt: x"), /speed= is a number from 0.25 to 4/)).toBe(true);
    expect(has(run('src="a.json" start=now', "alt: x"), /start= is paused or play/)).toBe(true);
    expect(has(run('src="a.json" height=xl', "alt: x"), /height="xl" is s, m or l/)).toBe(true);
    expect(has(run('src="a.json"', "alt: x\nsomething else"), /is not a line this part knows/)).toBe(true);
    expect(has(run('src="a.json" colour=c1', "alt: x"), /unknown option "colour"/)).toBe(true);
    expect(has(run("", "alt: x"), /no src/)).toBe(true);
    expect(has(run('src="javascript:alert(1)"', "alt: x"), /not allowed/)).toBe(true);
    expect(run('src="a.json" loop', "alt: x").length).toBe(0);
  });
});

describe("lottie: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS, and the data carries the set parse was given", () => {
    expect([LIMITS.lottieBytes, LIMITS.lottieFrames, LIMITS.lottieLayers, LIMITS.lottieNodes]).toEqual([1024 * 1024, 3600, 500, 200_000]);
    for (const k of Object.keys(LIMITS).filter((x) => x.startsWith("lottie"))) expect((UNTRUSTED_LIMITS as any)[k]).toBeLessThanOrEqual((LIMITS as any)[k]);
    const b = parse(fence("alt: x", 'src="a.json"'), { path: "p.dh.md", limits: UNTRUSTED_LIMITS }).blocks.find((x) => x.type === "lottie")!;
    if (b.type !== "lottie") throw new Error("not lottie");
    expect(b.data.caps).toEqual({ bytes: UNTRUSTED_LIMITS.lottieBytes, frames: UNTRUSTED_LIMITS.lottieFrames, layers: UNTRUSTED_LIMITS.lottieLayers, nodes: UNTRUSTED_LIMITS.lottieNodes });
    expect(parse(fence("alt: x", 'src="a.json"'), { path: "p.dh.md", limits: { lottieFrames: 10 } }).blocks.find((x) => x.type === "lottie")).toMatchObject({ data: { caps: { frames: 10 } } });
  });
  const mk = (over: any = {}, layers: any[] = [{ ty: 4, ind: 1, nm: "dh-a", ks: {}, shapes: [{ ty: "gr", nm: "dh-c1", it: [{ ty: "fl", c: { a: 0, k: [1, 0, 0, 1] } }] }] }]) => ({ v: "5.7.0", fr: 30, ip: 0, op: 60, w: 100, h: 100, layers, assets: [], ...over });
  test("a good file passes", () => { expect(checkLottieData(mk(), 2000, big(), CAPS)).toBeNull(); expect(lottieNames(mk())).toEqual(["dh-a", "dh-c1"]); });
  test("caps checked at load: bytes, frames, layers, nodes, depth", () => {
    expect(checkLottieData(mk(), 2 * 1024 * 1024, big(), CAPS)).toMatch(/at most 1024 KB/);
    expect(checkLottieData(mk({ op: 1e9 }), 100, big(), CAPS)).toMatch(/has 1000000000 frames; the most is 3600/);
    expect(checkLottieData(mk({ op: 0 }), 100, big(), CAPS)).toMatch(/no frames/);
    expect(checkLottieData(mk({ op: Number.MAX_SAFE_INTEGER }), 100, big(), CAPS)).toMatch(/frames/);
    const many = Array.from({ length: 501 }, (_, i) => ({ ty: 4, ind: i, ks: {}, shapes: [] }));
    expect(checkLottieData(mk({}, many), 100, big(), CAPS)).toMatch(/more than 500 layers/);
    expect(checkLottieData(mk({}, many), 100, big(), { ...CAPS, layers: 1000, nodes: 100 })).toMatch(/too big to check \(more than 100 values\)/);
    expect(checkLottieData({ v: 1, layers: "x" }, 10, big(), CAPS)).toMatch(/no "layers"/); expect(checkLottieData([], 10, big(), CAPS)).toMatch(/not a Lottie animation/); expect(checkLottieData(null, 10, big(), CAPS)).toMatch(/not a Lottie animation/);
    let deep: any = { k: 1 }; for (let i = 0; i < 80; i++) deep = { k: deep };
    expect(checkLottieData(mk({}, [{ ty: 4, ind: 1, ks: deep }]), 100, big(), CAPS)).toMatch(/nests deeper than 64/);
    expect(checkLottieData(mk({ op: 11 }), 100, big(), { ...CAPS, frames: 10 })).toMatch(/the most is 10/);
  });
  test("an expression is refused, a remote asset is refused, an embedded image is kept", () => {
    const expr = mk({}, [{ ty: 4, ind: 1, ks: { o: { a: 0, k: 100, x: "var $bm_rt = time * 10;" } }, shapes: [] }]);
    expect(checkLottieData(expr, 100, big(), CAPS)).toMatch(/has an expression/);
    expect(checkLottieData(mk({ assets: [{ id: "i", u: "https://example.com/", p: "a.png", w: 1, h: 1 }] }), 100, big(), CAPS)).toMatch(/loads an image from "https:\/\/example.com\/"/);
    expect(checkLottieData(mk({ assets: [{ id: "i", u: "", p: "http://192.0.2.1/a.png", w: 1, h: 1 }] }), 100, big(), CAPS)).toMatch(/remote or separate files are not allowed/);
    expect(checkLottieData(mk({ assets: [{ id: "i", u: "", p: "data:image/png;base64,AAAA", e: 1, w: 1, h: 1 }] }), 100, big(), CAPS)).toBeNull();
    expect(checkLottieData(mk({ assets: [{ id: "i", u: "", p: "data:text/html;base64,AAAA", e: 1, w: 1, h: 1 }] }), 100, big(), CAPS)).toMatch(/remote or separate/);
    expect(checkLottieData(mk({ fr: 1000 }), 100, big(), CAPS)).toMatch(/frame rate/);
  });
  test("the file's walk charges its budget; a small budget ends a big file quickly", () => {
    const layers = Array.from({ length: 200 }, (_, i) => ({ ty: 4, ind: i, ks: {}, shapes: [{ ty: "gr", it: Array.from({ length: 20 }, () => ({ ty: "rc" })) }] }));
    const file = mk({}, layers);
    expect(() => checkLottieData(file, 100, new Budget({ steps: 50, values: 50, chars: 0 }, null, null, "the lottie part"), CAPS)).toThrow(BudgetError);
    expect(checkLottieData(file, 100, big(), CAPS)).toBeNull();
  });
  test("colour slots take theme colours", () => {
    const d = mk(); const n = recolourLottie(d, { "dh-c1": [0, 0.5, 1] }, big());
    expect(n).toBe(1); expect((d.layers[0].shapes[0].it[0] as any).c.k).toEqual([0, 0.5, 1, 1]);
    const anim = mk({}, [{ ty: 4, ind: 1, ks: {}, shapes: [{ ty: "gr", nm: "dh-c1", it: [{ ty: "st", c: { a: 1, k: [{ t: 0, s: [1, 1, 1, 1], e: [0, 0, 0, 1] }, { t: 9, s: [0, 0, 0, 1] }] } }] }] }]);
    expect(recolourLottie(anim, { "dh-c1": [0.2, 0.4, 0.6] }, big())).toBe(1);
    expect((anim.layers[0].shapes[0].it[0] as any).c.k[0].s).toEqual([0.2, 0.4, 0.6, 1]);
    expect(recolourLottie(mk(), { "dh-none": [1, 1, 1] }, big())).toBe(0);
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const body = "alt: x\n" + Array.from({ length: 3000 }, () => "colours: dh-c1 = c1, dh-c2 = c2").join("\n");
    const doc = parse(fence(body, 'src="a.json"'), { path: "p.dh.md", limits: { maxEvalSteps: 2000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the lottie part does too much work/);
    expect(doc.llm).toContain("[lottie not shown: the lottie part does too much work");
  });
});

describe("lottie: linear (the doubling test, charges counted)", () => {
  test("the colour lines: twice the input costs at most about twice", () => {
    const cost = (n: number) => { const b = big(); parseLottie("alt: x\n" + Array.from({ length: n }, (_, i) => `colours: dh-${i} = c${(i % 8) + 1}`).join("\n"), 1, { src: "a.json" }, 1, LIMITS, b); return b.steps + b.values + b.chars; };
    for (const n of [50, 200, 800]) { const r = cost(2 * n) / cost(n); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("a file's layers (checked and recoloured): twice the layers costs at most about twice", () => {
    const layers = (n: number) => Array.from({ length: n }, (_, i) => ({ ty: 4, ind: i + 1, nm: `dh-${i}`, ks: {}, shapes: [] }));
    const cost = (n: number) => { const b = big(); const f = { v: "5.7.0", fr: 30, ip: 0, op: 60, w: 100, h: 100, layers: layers(n), assets: [] }; checkLottieData(f, 100, b, { ...CAPS, layers: 1e9, nodes: 1e9 }); recolourLottie(f, { "dh-1": [1, 0, 0] }, b); return b.steps + b.values; };
    for (const n of [50, 200, 800]) { const r = cost(2 * n) / cost(n); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("a long line is read once", () => {
    const b1 = big(), b2 = big();
    parseLottie("alt: " + "x".repeat(20_000), 1, { src: "a.json" }, 1, LIMITS, b1);
    parseLottie("alt: " + "x".repeat(40_000), 1, { src: "a.json" }, 1, LIMITS, b2);
    expect(b2.steps / b1.steps).toBeLessThan(2.2);
  });
});

describe("lottie: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every animation drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((x) => x.type === "lottie").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const errs = check(parse(text, { path: f, limits })).filter((q) => q.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((q) => q.line >= 1)).toBe(true);
      }
      expect(() => parseLottie(text, 1, { src: "a.json" }, 1, LIMITS, new Budget(partLimitsOf(LIMITS), null, null, "the lottie part"))).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(lottie.name).toBe("lottie");
  expect(lottie.steps).toBe(false);
  expect(lottie.dependencies).toEqual(["lottie-web"]);
});

describe("lottie: kept inside the part", () => {
  const base = (over: any = {}) => ({ v: "5.7.0", fr: 30, ip: 0, op: 30, w: 100, h: 100, layers: [], assets: [], ...over });
  const glyph = { ch: "A", size: 40, style: "Regular", w: 60, fFamily: "F", data: { shapes: [{ ty: "gr", it: [{ ty: "sh", ks: { a: 0, k: { c: true, i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]], v: [[0, 0], [30, -70], [60, 0]] } } }, { ty: "fl", c: { a: 0, k: [0, 0, 0, 1] }, o: { a: 0, k: 100 } }, { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }] }] } };
  const font = (over: any = {}) => ({ fName: "F", fFamily: "F", fStyle: "Regular", ascent: 75, origin: 0, fPath: "", fClass: "", ...over });
  const textLayer = { ddd: 0, ind: 1, ty: 5, nm: "t", ks: { o: { a: 0, k: 100 }, p: { a: 0, k: [20, 80, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] }, r: { a: 0, k: 0 } }, ip: 0, op: 30, st: 0, t: { d: { k: [{ s: { s: 40, f: "F", t: "A", j: 0, tr: 0, lh: 48, ls: 0, fc: [0, 0, 0] }, t: 0 }] }, p: {}, m: { g: 1, a: { a: 0, k: [0, 0] } }, a: [] } };
  const good = () => base({ fonts: { list: [font()] }, chars: [glyph], layers: [textLayer] });
  const why = (j: any) => checkLottieData(j, 100, big(), CAPS);
  test("kept: text the file draws itself", () => { expect(why(good())).toBeNull(); expect(why(base({ fonts: { list: [font({ fOrigin: "n" })] }, chars: [glyph], layers: [textLayer] }))).toBeNull(); });
  test("refused (1)", () => {
    for (const f of [font({ fOrigin: "g", fPath: "https://fonts.example/a.css" }), font({ fOrigin: "t", fPath: "https://fonts.example/a.js" }), font({ fOrigin: "p", fPath: "a.ttf" }), font({ origin: 1, fPath: "a.css" }), font({ fPath: "a.css" })]) {
      expect(why(base({ fonts: { list: [f] }, chars: [glyph] }))).toMatch(/^fonts: font 1 .*\(fPath\)/);
      expect(why(base({ fonts: { list: [f] } }))).toMatch(/^fonts: /);
    }
  });
  test("refused (2)", () => {
    for (const f of [font({ fOrigin: "g" }), font({ fOrigin: "p" }), font({ fOrigin: "t" }), font({ origin: 3 }), font({ origin: 2 }), font({ fOrigin: "x" })]) expect(why(base({ fonts: { list: [f] }, chars: [glyph] }))).toMatch(/^fonts: font 1 .*\((fOrigin|origin)\)/);
    expect(why(base({ fonts: { list: [font({ fClass: "fixed inset-0" })] }, chars: [glyph] }))).toMatch(/^fonts: font 1 .*\(fClass\)/);
  });
  test("refused (3)", () => {
    expect(why(base({ fonts: { list: [font()] } }))).toMatch(/^fonts: .*\(chars\)/);
    expect(why(base({ layers: [textLayer] }))).toMatch(/text layer .*\(chars\)/);
    expect(why(base({ fonts: 1 }))).toMatch(/^fonts: /);
    expect(why(base({ fonts: { list: [1] }, chars: [glyph] }))).toMatch(/^fonts: /);
    expect(why(base({ fonts: { list: [] } }))).toBeNull();
  });
  test("refused (4)", () => {
    expect(why(base({ segments: [{ time: 1 }] }))).toMatch(/^segments: /);
    expect(why(base({ layers: [{ ty: 6, ind: 1, ks: {}, refId: "a" }] }))).toMatch(/sound layer/);
    expect(why(base({ layers: [{ ty: 15, ind: 1, ks: {}, refId: "a" }] }))).toMatch(/footage/);
    expect(why(base({ assets: [{ id: "a", t: 3, e: 1, p: "data:image/png;base64,AAAA" }] }))).toMatch(/footage/);
  });
  test("checked: every asset the player would load", () => {
    for (const layers of [null, 0, false, ""]) expect(why(base({ assets: [{ id: "a", layers, u: "", p: "https://img.example/a.png" }] }))).toMatch(/loads an image/);
    expect(why(base({ assets: [{ id: "a" }] }))).toMatch(/loads an image/);
    expect(why(base({ assets: [{ id: "a", layers: {} }] }))).toMatch(/^assets: /);
    expect(why(base({ assets: [{ id: "c", layers: [] }] }))).toBeNull();
  });
  test("checked: the whole file", () => {
    const expr = { a: 0, k: 1, x: "var $bm_rt = 1;" };
    expect(why(base({ chars: [{ ...glyph, data: { shapes: [{ ty: "gr", it: [{ ty: "fl", c: { a: 0, k: [0, 0, 0, 1] }, o: expr }] }] } }] }))).toMatch(/expression/);
    expect(why(base({ slots: { s: { p: expr } } }))).toMatch(/expression/);
    expect(why(base({ chars: [{ ch: "B", t: 1, data: { refId: "c", layers: [{ ty: 6, ind: 1, ks: {} }] } }] }))).toMatch(/sound layer/);
  });
  test("kept inside the part: the copy the player draws", () => {
    const j: any = good();
    j.layers[0].ln = "dh-config"; j.layers[0].cl = "fixed"; j.fonts.list[0].fClass = ""; j.fonts.list[0].extra = "x";
    j.layers.push({ ty: 4, ind: 2, ks: {}, shapes: [{ ty: "gr", ln: "x", cl: "y", it: [] }], masksProperties: [{ cl: false, mode: "a", pt: { a: 0, k: {} } }] });
    j.segments = [];
    const out: any = lottieForDrawing(j, big());
    expect(JSON.stringify(out)).not.toMatch(/"(ln|cl|fPath|fClass|fOrigin|origin|extra|segments)":"/);
    expect(out.segments).toBeUndefined();
    expect(out.fonts.list).toEqual([{ fName: "F", fFamily: "F", fStyle: "Regular", ascent: 75 }]);
    expect(out.layers[1].masksProperties[0].cl).toBe(false);
    expect(out.chars).toEqual([glyph]);
  });
  test("kept inside the part: ids and classes of any type never reach the page; a mask keeps only a true/false flag", () => {
    const odd: unknown[] = [["app"], 7, { a: "b" }, true, "x"];
    for (const v of odd) {
      const j: any = good();
      j.layers[0].ln = v; j.layers[0].cl = v;
      j.layers.push({ ty: 4, ind: 2, ks: {}, shapes: [{ ty: "gr", ln: v, cl: v, it: [{ ty: "sh", ln: v, cl: v }] }],
        masksProperties: [{ cl: v, mode: "a", pt: { a: 0, k: {} } }] });
      const out: any = lottieForDrawing(j, big());
      expect(JSON.stringify(out)).not.toMatch(/"ln":/);
      expect(out.layers[0].cl).toBeUndefined();
      expect(out.layers[1].shapes[0].cl).toBeUndefined();
      expect(out.layers[1].shapes[0].it[0].cl).toBeUndefined();
      expect(out.layers[1].masksProperties[0].cl).toBe(typeof v === "boolean" ? v : undefined);
    }
  });
  test("a solid layer's colour is a plain colour, never a reference the page could fetch", () => {
    const solid = (sc: unknown) => base({ layers: [{ ty: 1, ind: 1, ks: {}, sc, sw: 10, sh: 10 }] });
    for (const sc of ["#fff", "#A0b1C2"]) expect(why(solid(sc))).toBeNull();
    for (const sc of ["url(https://example.com/x)", "red", "#ff", ["#fff"], 1, undefined]) expect(why(solid(sc))).toMatch(/solid layer/);
  });
  test("the part check names what it refused", () => {
    const l = p("alt: x", { src: "a.json" });
    const [ref] = lottieFiles(l, 3);
    const bad = base({ fonts: { list: [font({ fOrigin: "g", fPath: "https://fonts.example/a.css" })] }, chars: [glyph] });
    expect(ref.check!({ size: 100, json: bad } as any)).toEqual([expect.stringMatching(/^a\.json: fonts: font 1 .*refused.*\(fPath\)/)]);
  });
  test("the copy the player draws: twice the file costs at most about twice", () => {
    const cost = (n: number) => { const b = big(); lottieForDrawing(base({ layers: Array.from({ length: n }, (_, i) => ({ ty: 4, ind: i, ks: {}, ln: "a", shapes: [] })) }), b); return b.steps + b.values; };
    for (const n of [50, 200, 800]) { const r = cost(2 * n) / cost(n); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
});
