// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// The measured role palette (0.7.0-rc.3): the eight family colours, light and dark, read from src/ui/theme.css itself (both
// dark blocks too) and checked against every limit. On the 0.7.0-rc.2 palette these fail (c1 and c4: fills 0.3 apart with
// colour blindness, borders 1.2 apart; c3's border 2.2:1 on the stage; no planes; plain edges 1.3 to 1.7:1).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrast, dE, LIMITS, mixOklab, parseHex, toOklch, worstDE } from "./helpers/colour-maths";
import { checkPalette, STAGE, type Fam } from "./helpers/palette-check";

const ROOT = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const css = read("src/ui/theme.css");
const colours = read("src/ui/colours.css");
// the blocks: light is the first ":root {", dark the media block and the [data-theme="dark"] block
const block = (start: string) => { const i = css.indexOf(start); expect(i).toBeGreaterThan(-1); let d = 0, j = css.indexOf("{", i); for (let k = j; k < css.length; k++) { if (css[k] === "{") d++; else if (css[k] === "}" && --d === 0) return css.slice(j, k); } return ""; };
const LIGHT = block(":root {"), DARK_MEDIA = block("@media (prefers-color-scheme: dark)"), DARK = block(':root[data-theme="dark"]');
const tok = (b: string, name: string) => { const m = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`).exec(b); if (!m) throw new Error(`--${name} missing`); return m[1]; };
const fams = (b: string): Fam[] => [1, 2, 3, 4, 5, 6, 7, 8].map((k) => ({ edge: tok(b, `c${k}`), soft: tok(b, `c${k}-soft`), ink: tok(b, `c${k}-ink`), plane: tok(b, `c${k}-plane`) }));
// the light stage edges sit in their own :root block at the end of the file
const LIGHT_EDGES = css.slice(css.lastIndexOf("/* the stage's own edges"));

describe("colour maths (checked against known values)", () => {
  test("contrast: black on white is 21:1, a colour on itself 1:1", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrast([85, 95, 255], [85, 95, 255])).toBe(1);
  });
  test("OKLab distance: 0 for the same colour, about 100 from black to white", () => {
    expect(dE([10, 20, 30], [10, 20, 30])).toBe(0);
    expect(dE([0, 0, 0], [255, 255, 255])).toBeCloseTo(100, 0);
  });
  test("protanopia and deuteranopia fold red and green together; blue and yellow stay apart", () => {
    const red: [number, number, number] = [220, 50, 40], green: [number, number, number] = [80, 150, 40];
    expect(dE(red, green)).toBeGreaterThan(25);
    expect(worstDE(red, green).cvd).toBeLessThan(dE(red, green) / 2);
    expect(worstDE([40, 80, 230], [240, 200, 20]).cvd).toBeGreaterThan(40);
  });
  test("an oklab mix halfway lies between its ends", () => {
    const a = parseHex("#0059FF"), b = parseHex("#FFFFFF"), m = mixOklab(a, b, 0.5);
    expect(Math.abs(dE(a, m) - dE(m, b))).toBeLessThan(1.5);
  });
});

for (const [theme, b] of [["light", LIGHT], ["dark", DARK]] as const) {
  describe(`${theme} palette in theme.css`, () => {
    const r = checkPalette(theme, fams(b));
    test("every pair of the 8 families: borders 15 apart (8 with protanopia or deuteranopia)", () => {
      expect(r.worst["border pair, normal"].v).toBeGreaterThanOrEqual(LIMITS.borderNormal);
      expect(r.worst["border pair, protan/deutan"].v).toBeGreaterThanOrEqual(LIMITS.borderCvd);
    });
    test("the limits are the decided numbers", () => {
      expect(LIMITS.borderNormal).toBe(15); expect(LIMITS.borderCvd).toBe(8);
      expect(LIMITS.fillNormal).toBe(10); expect(LIMITS.fillCvd).toBe(4);
      expect(LIMITS.planeNormal).toBe(3); expect(LIMITS.planeCvd).toBe(0); // a container is told apart by its border and heading
      expect(LIMITS.borderVsBehind).toBe(3); expect(LIMITS.words).toBe(4.5);
    });
    test("every pair: box fills 10 apart (4 with colour blindness), container planes 3 apart", () => {
      expect(r.worst["fill pair, normal"].v).toBeGreaterThanOrEqual(LIMITS.fillNormal);
      expect(r.worst["fill pair, protan/deutan"].v).toBeGreaterThanOrEqual(LIMITS.fillCvd);
      expect(r.worst["plane pair, normal"].v).toBeGreaterThanOrEqual(LIMITS.planeNormal);
      expect(r.worst["plane pair, protan/deutan"].v).toBeGreaterThanOrEqual(LIMITS.planeCvd);
    });
    test("every border 3:1 on the stage and the surface", () => {
      for (const k of ["border on stage", "border on surface"]) expect(r.worst[k].v).toBeGreaterThanOrEqual(LIMITS.borderVsBehind);
    });
    // one fill per role: a card of one role in a group of another sits on that role's fill, and a group's border sits on its
    // own fill. Every role border is 3:1 on every role fill (64 pairs), with ONE measured exception: in light the c3 (yellow)
    // border is at least 2.5:1 on the c4, c7 and c8 fills (lilac, pink, green; 2.50 to 2.57), where a c3 card keeps its own
    // yellow fill, which marks its edge too. No light palette keeps every limit and the calm rule below without it.
    test("a role's border is 3:1 on every role's fill (light: c3 at least 2.5 on the c4, c7 and c8 fills)", () => {
      const f = fams(b), under: string[] = [];
      f.forEach((x, i) => f.forEach((y, j) => {
        const c = contrast(parseHex(x.edge), parseHex(y.soft)), min = theme === "light" && i === 2 && [3, 6, 7].includes(j) ? 2.5 : LIMITS.borderVsBehind;
        if (c < min) under.push(`c${i + 1} on c${j + 1} ${c.toFixed(2)}`);
      }));
      expect(under).toEqual([]);
    });
    test("words 4.5:1: the ink on every fill and plane, each family's own ink on its fill, the surface and the stage", () => {
      for (const k of ["words (ink) on own fill", "words (ink) on own plane", "family ink on own fill", "family ink on surface", "family ink on stage"]) expect(r.worst[k].v).toBeGreaterThanOrEqual(LIMITS.words);
    });
    // the nested check's worst is c3's measured exception in light (above); every other check holds
    test("no other check fails", () => expect(r.fails.filter((k) => !(theme === "light" && /\(nested\)/.test(k)))).toEqual([]));
  });
}

describe("one fill per role", () => {
  test("in light and both dark blocks every role's plane is its soft fill", () => {
    for (const b of [LIGHT, DARK_MEDIA, DARK]) for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) expect(tok(b, `c${k}-plane`)).toBe(tok(b, `c${k}-soft`));
  });
  test("the neutral's plane is its soft fill", () => expect(LIGHT).toContain("--c0-plane: var(--c0-soft);"));
  test("the 3D stage fills a role's container with the soft tint", () => expect(read("src/ui/anim3d.ts")).toContain("C[`c${cc}-soft`]"));
});

describe("both dark blocks agree", () => {
  test("the media block and the data-theme block give every family the same four colours", () => {
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) for (const s of ["", "-soft", "-ink", "-plane"]) expect(tok(DARK_MEDIA, `c${k}${s}`)).toBe(tok(DARK, `c${k}${s}`));
  });
  test("and the same stage edges", () => {
    for (const n of ["scn-edge", "scn-frame-edge", "scn-band-edge", "scn-good-edge", "scn-warn-edge", "scn-hot-edge", "scn-acc-edge", "scn-muted-edge"]) expect(tok(DARK_MEDIA, n)).toBe(tok(DARK, n));
  });
});

describe("the stage's own edges: 3:1 on everything they can sit on", () => {
  for (const [theme, edges, b] of [["light", LIGHT_EDGES, LIGHT], ["dark", DARK, DARK]] as const) {
    const S = STAGE[theme];
    const backs = [S.stage, S.surface, tok(b, "surface-3"), tok(b, "acc-soft"), tok(b, "good-soft"), tok(b, "warn-soft"), tok(b, "hot-soft"), ...[1, 2, 3, 4, 5, 6, 7, 8].map((k) => tok(b, `c${k}-plane`))].map(parseHex);
    for (const n of ["scn-edge", "scn-frame-edge", "scn-band-edge", "scn-good-edge", "scn-warn-edge", "scn-hot-edge", "scn-acc-edge", "scn-muted-edge"])
      test(`${theme} --${n}`, () => { const e = parseHex(tok(edges, n)); for (const x of backs) expect(contrast(e, x)).toBeGreaterThanOrEqual(LIMITS.borderVsBehind); });
  }
  test("the stage tokens the checks use are the theme's own", () => {
    expect(tok(LIGHT, "surface")).toBe(STAGE.light.surface); expect(tok(LIGHT, "surface-2")).toBe(STAGE.light.stage);
  });
});

describe("the stage draws with them (colours.css)", () => {
  test("containers fill with the role's soft tint (one fill per role); plain, frame, band and tone borders use the edge tokens", () => {
    expect(colours).toContain(".scn-ent.cc .scn-frame { fill: var(--k-soft); }");
    for (const r of [".scn-shape { stroke: var(--scn-edge); }", ".scn-frame { stroke: var(--scn-frame-edge); }", ".scn-band { stroke: var(--scn-band-edge); }", "stroke: var(--scn-good-edge)", "stroke: var(--scn-warn-edge)", "stroke: var(--scn-hot-edge)", "stroke: var(--scn-acc-edge)", "stroke: var(--scn-muted-edge)"]) expect(colours).toContain(r);
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) expect(colours).toContain(`.cc-${k} { --k-plane: var(--c${k}-plane); }`);
  });
  test("the stylesheet build puts colours.css after the other part sheets, so its edges win", async () => {
    const { buildCss } = await import("../../scripts/build-css");
    const out = buildCss(), at = (f: string) => out.indexOf(`/* ---- ${f} (scoped) ---- */`);
    expect(at("colours.css")).toBeGreaterThan(-1);
    for (const f of ["parts.css", "stage.css", "theme.css", "base.css"]) expect(at("colours.css")).toBeGreaterThan(at(f));
  });
  test("the 3D stage reads the planes and edges too", () => {
    const a3 = read("src/ui/anim3d.ts");
    expect(a3).toContain("`c${k}-plane`");
    expect(a3).toContain('C[container ? "scn-frame-edge" : "scn-edge"]');
  });
  test("the 'eight colours' fixture names families and roles, never a colour value", () => {
    const f = read("fixtures/format/55a-animation-eight-colours-told-apart-by-everyone.dh.md");
    expect(f).toContain("family cache");
    expect(f.slice(f.indexOf("```animation"))).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
  });
});

describe("the neutral role colour c0: the plain look", () => {
  test("light --c0 is the light stage edge; dark --c0 the dark stage edge (it follows the theme)", () => {
    expect(tok(LIGHT, "c0")).toBe(tok(LIGHT_EDGES, "scn-edge"));
    for (const b of [DARK_MEDIA, DARK]) expect(tok(b, "c0")).toBe(tok(b, "scn-edge"));
    for (const n of ["--c0-soft: var(--c0-fill)", "--c0-plane: var(--c0-soft)", "--c0-ink: var(--muted)"]) expect(LIGHT).toContain(n);
  });
  test("colours.css maps cc-0 to it", () => expect(colours).toContain(".cc-0 { --k: var(--c0); --k-soft: var(--c0-soft); --k-ink: var(--c0-ink); --k-plane: var(--c0-plane); }"));
  test("light --c0-fill is the surface; both dark blocks a grey slate #232A3B", () => {
    expect(LIGHT).toContain("--c0-fill: var(--surface);");
    expect(tok(DARK_MEDIA, "c0-fill")).toBe("#232A3B"); expect(tok(DARK, "c0-fill")).toBe("#232A3B");
  });
  test("on the slate, words and every edge that can border a neutral thing keep their limits", () => {
    const s = parseHex("#232A3B");
    expect(contrast(parseHex(STAGE.dark.ink), s)).toBeGreaterThanOrEqual(LIMITS.words);
    expect(contrast(parseHex(tok(DARK, "muted")), s)).toBeGreaterThanOrEqual(LIMITS.words);
    for (const n of ["scn-edge", ...[1, 2, 3, 4, 5, 6, 7, 8].map((k) => `c${k}`)]) expect(contrast(parseHex(tok(DARK, n)), s)).toBeGreaterThanOrEqual(LIMITS.borderVsBehind);
  });
});

// light is calm and clean: soft, clear fills, and a border in its fill's own hue
describe("light palette: calm and clean", () => {
  const L = fams(LIGHT).map((f) => ({ e: toOklch(parseHex(f.edge)), f: toOklch(parseHex(f.soft)), p: toOklch(parseHex(f.plane!)) }));
  const hueGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  test("container planes are the role's soft fill (one fill per role)", () => { for (const x of L) expect(x.p).toEqual(x.f); });
  test("leaf fills are soft and clear: L 0.79 to 0.97, chroma 0.025 to 0.13; yellow and yellow-green fills are light (L >= 0.89, no olive or khaki)", () => {
    for (const x of L) {
      expect(x.f[0]).toBeGreaterThanOrEqual(0.79); expect(x.f[0]).toBeLessThanOrEqual(0.97);
      expect(x.f[1]).toBeGreaterThanOrEqual(0.025); expect(x.f[1]).toBeLessThanOrEqual(0.13);
      if (x.f[2] > 60 && x.f[2] < 145) expect(x.f[0]).toBeGreaterThanOrEqual(0.89);
    }
  });
  test("a family's border (and so its arrows) is its fill's own hue, within 16 degrees, and not near-black (L >= 0.4)", () => {
    for (const x of L) { expect(hueGap(x.e[2], x.f[2])).toBeLessThanOrEqual(16); expect(x.e[0]).toBeGreaterThanOrEqual(0.4); }
  });
  // the queue (c5, peach) and the cache (c8, green) of the "eight colours" scene read close at the bare limits; these
  // floors sit on top of the decided limits for that pair
  test("the c5 and c8 fills at least 17 apart, and 6.5 apart for red-blind and green-blind readers", () => {
    const f = fams(LIGHT), w = worstDE(parseHex(f[4].soft), parseHex(f[7].soft));
    expect(w.normal).toBeGreaterThanOrEqual(17); expect(w.cvd).toBeGreaterThanOrEqual(6.5);
  });
});

// in dark a role's words (a card's "* " and "** " lines, headline values) are a light tint of the role's own hue, not the
// one white ink
describe("dark role ink: a light tint of each role's hue (one token per role, --cN-ink)", () => {
  for (const [name, b] of [["media", DARK_MEDIA], ["data-theme", DARK]] as const) test(`${name} block: no role ink is the plain white ink, each is its border's hue within 25 degrees, light (L >= 0.8), 4.5:1 on its fill, the surface and the stage`, () => {
    const hueGap = (a: number, c: number) => Math.abs(((a - c + 540) % 360) - 180);
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const ink = tok(b, `c${k}-ink`), e = toOklch(parseHex(tok(b, `c${k}`))), i = toOklch(parseHex(ink));
      expect(ink.toUpperCase()).not.toBe("#F4F6FB");
      expect(hueGap(i[2], e[2])).toBeLessThanOrEqual(25);
      expect(i[0]).toBeGreaterThanOrEqual(0.8);
      for (const bg of [tok(b, `c${k}-soft`), STAGE.dark.surface, STAGE.dark.stage]) expect(contrast(parseHex(ink), parseHex(bg))).toBeGreaterThanOrEqual(LIMITS.words);
    }
  });
  test("the c5 ink is a light orange (hue 30 to 60)", () => { const h = toOklch(parseHex(tok(DARK, "c5-ink")))[2]; expect(h).toBeGreaterThanOrEqual(30); expect(h).toBeLessThanOrEqual(60); });
  test("the stage cards colour a headline and a '* ' line with the role ink token", () => expect(read("src/core/stage-cards.ts")).toContain("`role:${c.role}:ink`"));
});

describe("column dots: an unlit dot is the role's own colour in both themes; a lit column's dots are stronger", () => {
  test("light: the role colour, and a 70% mix toward black when lit; both dark blocks: the role colour and its ink", () => {
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(LIGHT).toContain(`--c${k}-dot: var(--c${k});`); expect(LIGHT).toContain(`--c${k}-dot-new: color-mix(in oklab, var(--c${k}) 70%, #000);`);
      for (const b of [DARK_MEDIA, DARK]) { expect(b).toContain(`--c${k}-dot: var(--c${k});`); expect(b).toContain(`--c${k}-dot-new: var(--c${k}-ink);`); }
    }
  });
});

describe("the middle dot (U+00B7) draws clearly ('Jump(·, 32)' in a table)", () => {
  test("Poppins takes U+00B7 alone from the self-hosted IBM Plex Mono, at every Poppins weight, declared after the Poppins faces", () => {
    for (const [w, f] of [[300, 400], [400, 400], [500, 500], [600, 600]]) {
      const face = `@font-face { font-family: "Poppins"; font-style: normal; font-weight: ${w}; font-display: swap; src: url("fonts/ibmplexmono-${f}-latin.woff2") format("woff2"); unicode-range: U+00B7; }`;
      expect(css).toContain(face);
      expect(css.indexOf(face)).toBeGreaterThan(css.indexOf(`font-family: "Poppins"; font-style: normal; font-weight: ${w}; font-display: swap; src: url("fonts/poppins-${w}-latin.woff2")`));
    }
  });
});

// a tone's words sit on a family's fill too (a state pill's word, a lit count in a column, a miss in a row): every tone ink
// is 4.5:1 on every family fill (c0 too), the surface, the stage and the page, in both themes (measured on every fixture
// stage: before this the light accent, good, warn and hot inks fell to 3.6 on the lilac, pink and green fills, and the dark
// hot ink to 4.1 on the teal, amber and purple ones)
describe("tone inks: 4.5:1 on every family fill", () => {
  const all = (b: string) => Object.fromEntries([...b.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const V = { light: all(LIGHT), dark: { ...all(LIGHT), ...all(DARK) } };
  const res = (v: string, vars: Record<string, string>, d = 0): string => { const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v.trim()); return !m || d > 20 ? v.trim() : vars[m[1]] !== undefined ? res(vars[m[1]], vars, d + 1) : m[2] ? res(m[2], vars, d + 1) : `unset ${m[1]}`; };
  for (const theme of ["light", "dark"] as const) test(theme, () => {
    const vars = V[theme], under: string[] = [];
    const backs = [...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => `--c${k}-soft`), "--surface", "--surface-2", "--bg"];
    for (const ink of ["--acc-ink", "--good-ink", "--warn-ink", "--hot-ink", "--bad-ink", "--ink", "--ink-2", "--muted"]) for (const b of backs) {
      const r = contrast(parseHex(res(`var(${ink})`, vars)), parseHex(res(`var(${b})`, vars)));
      if (r < LIMITS.words) under.push(`${ink} on ${b} ${r.toFixed(2)}`);
    }
    expect(under).toEqual([]);
  });
});
