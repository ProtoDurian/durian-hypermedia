// Lane look: the two looks as token sets (DESIGN 2.4). Checks: both looks hold the same names and only page tokens,
// look.css is what tokens.ts says, lookOf reads the front matter and the fence, and (SPEC 6.10) every border is
// 3:1 and every word 4.5:1 on what it sits on, in both looks, light and dark.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrast, parseHex, type RGB } from "../../stage/helpers/colour-maths";
import { lookCss } from "../../../src/engine/look/gen";
import { checkLook, DEFAULT_LOOK, LOOK_NAMES, LOOKS, LOOKS_DARK, lookOf } from "../../../src/engine/look/tokens";
import type { Look } from "../../../src/engine/types";

const ROOT = join(import.meta.dir, "../../..");
const css = readFileSync(join(ROOT, "src/ui/theme.css"), "utf8");
const block = (start: string) => { const i = css.indexOf(start); let d = 0; const j = css.indexOf("{", i); for (let k = j; k < css.length; k++) { if (css[k] === "{") d++; else if (css[k] === "}" && --d === 0) return css.slice(j + 1, k); } return ""; };
const decls = (b: string) => Object.fromEntries([...b.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)].map((m) => [m[1], m[2].trim()]));
const LIGHT = { ...decls(block(":root {")), ...decls(css.slice(css.lastIndexOf("/* the stage's own edges"))) };
const THEMES: Record<string, Record<string, string>> = { light: LIGHT, dark: { ...LIGHT, ...decls(block(':root[data-theme="dark"] {')) } };

/** a token's value as a colour: follows var() chains through the look and the theme, and `color-mix(in srgb, A p%, B)` */
function colour(v: string, look: Look, theme: string, depth = 0): RGB {
  v = v.trim();
  if (depth > 25) throw new Error(`loop at ${v}`);
  const vars = THEMES[theme];
  const own = { ...LOOKS[look], ...(theme === "dark" ? LOOKS_DARK[look] : {}) };
  let m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v);
  if (m) { const r = own[m[1]] ?? vars[m[1]]; if (r !== undefined) return colour(r, look, theme, depth + 1); if (m[2] !== undefined) return colour(m[2], look, theme, depth + 1); throw new Error(`unset ${m[1]}`); }
  m = /^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(.+)\)$/.exec(v);
  if (m) { const a = colour(m[1], look, theme, depth + 1), b = colour(m[3], look, theme, depth + 1), p = +m[2] / 100; return a.map((x, i) => x * p + b[i] * (1 - p)) as RGB; }
  if (/^#[0-9a-f]{6}$/i.test(v)) return parseHex(v);
  throw new Error(`not a colour: ${v}`);
}
const ROLES = [1, 2, 3, 4, 5, 6, 7, 8];
const TONES = ["good", "warn", "bad", "accent"] as const;

describe("look tokens", () => {
  test("both looks hold exactly the same names, every one --lk-*", () => {
    expect(Object.keys(LOOKS.classic).sort()).toEqual(Object.keys(LOOKS.stage).sort());
    for (const l of LOOK_NAMES) for (const k of Object.keys(LOOKS[l])) expect(k.startsWith("--lk-")).toBe(true);
    for (const l of LOOK_NAMES) for (const k of Object.keys(LOOKS_DARK[l])) expect(LOOKS[l][k]).toBeDefined();
  });
  test("a value is a page token or a plain length / number: no hex, no names of colours", () => {
    for (const l of LOOK_NAMES) for (const [k, v] of Object.entries({ ...LOOKS[l], ...LOOKS_DARK[l] })) {
      expect(`${k}: ${v}`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      for (const ref of v.matchAll(/var\(\s*(--[\w-]+)/g)) expect(LIGHT[ref[1]] ?? LOOKS[l][ref[1]]).toBeDefined(); // the token exists in the theme
    }
  });
  test("the looks really differ (and the stage look is the default)", () => {
    expect(DEFAULT_LOOK).toBe("stage");
    const diff = Object.keys(LOOKS.stage).filter((k) => LOOKS.stage[k] !== LOOKS.classic[k]);
    for (const k of ["--lk-canvas", "--lk-box-w", "--lk-radius-container", "--lk-fs-title", "--lk-fw-lane", "--lk-dim"]) expect(diff).toContain(k);
  });
  test("no word is under 11 px, in either look, wide or on a phone", () => {
    for (const l of LOOK_NAMES) for (const [k, v] of Object.entries(LOOKS[l])) if (/^--lk-fs-/.test(k) && k !== "--lk-fs-min") expect([k, parseFloat(v) >= 11]).toEqual([k, true]);
    expect(LOOKS.stage["--lk-fs-min"]).toBe("11px");
  });
  test("a stage's own numbers are the composed stage's (stage.css --stg-*)", () => {
    const stg = readFileSync(join(ROOT, "src/ui/stage.css"), "utf8");
    const num = (n: string) => new RegExp(`${n}:\\s*([\\d.]+px)`).exec(stg)?.[1] ?? "missing";
    expect(LOOKS.stage["--lk-line-w"]).toBe(num("--stg-line-w"));
    expect(LOOKS.stage["--lk-line-hot-w"]).toBe(num("--stg-line-hot-w"));
    expect(LOOKS.stage["--lk-box-thick-w"]).toBe(num("--stg-thick"));
    expect(LOOKS.stage["--lk-box-hot-w"]).toBe(num("--stg-hot-w"));
    expect(LOOKS.stage["--lk-canvas-radius"]).toBe(num("--stg-radius"));
    expect(LOOKS.stage["--lk-fs-title"]).toBe(num("--stg-fs-title"));
    expect(LOOKS.stage["--lk-fs-body"]).toBe(num("--stg-fs-body"));
    expect(LOOKS.stage["--lk-fs-chip"]).toBe(num("--stg-fs-chip"));
    expect(LOOKS.stage["--lk-fs-phone-title"]).toBe(num("--stg-phone-title"));
  });
});

describe("look.css", () => {
  test("is what tokens.ts says (run `bun src/engine/look/gen.ts` after editing the tokens)", () => {
    expect(readFileSync(join(ROOT, "src/engine/look/look.css"), "utf8")).toBe(lookCss());
  });
  test("sets every token under both looks, and the dark numbers under the page's two dark selectors", () => {
    const out = readFileSync(join(ROOT, "src/engine/look/look.css"), "utf8");
    for (const l of LOOK_NAMES) {
      expect(out).toContain(`.eng[data-look="${l}"] {`);
      expect(out).toContain(`:root[data-theme="dark"] .eng[data-look="${l}"] {`);
      expect(out).toContain(`:root:not([data-theme="light"]) .eng[data-look="${l}"] {`);
      for (const [k, v] of Object.entries(LOOKS[l])) expect(out).toContain(`${k}: ${v};`);
    }
  });
});

describe("lookOf", () => {
  test("default is stage", () => { expect(lookOf()).toBe("stage"); expect(lookOf({}, {})).toBe("stage"); expect(lookOf(null, null)).toBe("stage"); });
  test("front matter `look:`", () => { expect(lookOf({ look: "classic" }, {})).toBe("classic"); expect(lookOf({ look: " Stage " }, {})).toBe("stage"); });
  test("fence `look=`", () => { expect(lookOf({}, { look: "classic" })).toBe("classic"); });
  test("the fence wins over the page, both ways", () => {
    expect(lookOf({ look: "classic" }, { look: "stage" })).toBe("stage");
    expect(lookOf({ look: "stage" }, { look: "classic" })).toBe("classic");
  });
  test("an empty fence word (`look=`) falls back to the page", () => { expect(lookOf({ look: "classic" }, { look: "" })).toBe("classic"); });
  test("an unknown word draws the default and checkLook says so with the list", () => {
    expect(lookOf({ look: "neon" }, {})).toBe("stage");
    const p = checkLook({}, { look: "neon" }, 12);
    expect(p?.line).toBe(12);
    expect(p?.msg).toContain("neon"); expect(p?.msg).toContain("stage or classic"); expect(p?.msg).toContain("fence");
    expect(checkLook({ look: "oops" }, {}, 3)?.msg).toContain("front matter");
    expect(checkLook({ look: "classic" }, {}, 3)).toBeNull();
    expect(checkLook({}, {}, 3)).toBeNull();
  });
  test("never throws on odd front matter", () => { expect(lookOf({ look: 7 as never }, { look: undefined as never })).toBe("stage"); expect(lookOf("x" as never, 3 as never)).toBe("stage"); });
});

// every pair is (what is drawn, the token it sits on): borders 3:1, words 4.5:1 (SPEC 6.10)
for (const look of LOOK_NAMES) for (const theme of ["light", "dark"]) {
  describe(`contrast: ${look}, ${theme}`, () => {
    const c = (v: string) => colour(v, look, theme);
    const planes = ["--lk-canvas", "--lk-fill-neutral", "--lk-fill-container", "--lk-fill-band", ...ROLES.map((n) => `--c${n}-plane`), ...ROLES.map((n) => `--c${n}-soft`), ...TONES.map((t) => `--lk-tint-${t}`)];
    const base = ["--lk-canvas", "--lk-fill-neutral", "--lk-fill-container"];
    const fail = (rows: [string, string, number][], min: number) => rows.filter(([, , r]) => r < min).map(([a, b, r]) => `${a} on ${b}: ${r.toFixed(2)}`);
    const pair = (fgs: string[], bgs: string[]) => fgs.flatMap((f) => bgs.map((b) => [f, b, contrast(c(`var(${f})`), c(`var(${b})`))] as [string, string, number]));

    test("a box, frame and band edge is 3:1 on the canvas, the surface, the fills and every family plane", () => {
      const rows = pair(["--lk-edge", "--lk-edge-frame", "--lk-edge-band"], [...planes.filter((p) => !p.startsWith("--lk-tint")), "--surface"]);
      expect(fail(rows, 3)).toEqual([]);
    });
    test("an empty state shape's edge is 3:1 on the canvas, the surface and every family fill", () => {
      expect(fail(pair(["--lk-edge-faint"], [...planes.filter((p) => !p.startsWith("--lk-tint") && !p.endsWith("-plane")), "--surface"]), 3)).toEqual([]);
    });
    test("a tone's border is 3:1 on the canvas, the surface, the neutral fills and its own tint", () => {
      const tone = (t: string) => (t === "off" ? "--lk-edge-off" : `--lk-edge-${t}`);
      const rows = TONES.flatMap((t) => pair([tone(t)], [...base, "--surface", `--lk-tint-${t}`]));
      rows.push(...pair(["--lk-edge-off"], [...base, "--surface"]));
      expect(fail(rows, 3)).toEqual([]);
    });
    test("a family's border is 3:1 on the canvas and the surface", () => {
      expect(fail(pair(ROLES.map((n) => `--c${n}`), ["--lk-canvas", "--surface"]), 3)).toEqual([]);
    });
    test("words in ink are 4.5:1 on the canvas, every fill, plane and tint", () => {
      expect(fail(pair(["--lk-ink", "--lk-ink-2", "--lk-ink-muted"], [...planes, "--surface"]), 4.5)).toEqual([]);
    });
    test("small tags: a tone's ink is 4.5:1 on its tint and the surface; a family's ink on the surface and its own fill", () => {
      const rows = [...pair(["--lk-ink-accent"], ["--surface", "--lk-tint-accent"]), ...pair(["--lk-ink-bad"], ["--surface", "--lk-tint-bad"]),
        ...ROLES.flatMap((n) => pair([`--c${n}-ink`], [`--c${n}-soft`])), ...ROLES.flatMap((n) => pair([`--c${n}-ink`], ["--surface", "--lk-canvas"]))];
      expect(fail(rows, 4.5)).toEqual([]);
    });
  });
}
