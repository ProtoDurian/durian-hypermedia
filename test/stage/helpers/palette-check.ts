// Checks one theme's 8 family colours against the limits (no margins): the worst value of each check and its pair.
//   bun test/stage/helpers/palette-check.ts <light|dark> <search.json | "#edge/#soft,#edge/#soft,...">
import { readFileSync } from "node:fs";
import { contrast, dE, LIMITS, parseHex, type RGB } from "./colour-maths";

export const STAGE = { light: { stage: "#F2F4F9", surface: "#FFFFFF", ink: "#00081C" }, dark: { stage: "#151B2E", surface: "#0F1424", ink: "#F4F6FB" } };
export type Fam = { edge: string; soft: string; ink?: string; plane?: string };
// a container's plane (its lighter tint) against another container's plane: big areas with a strong border and a heading, so a lower floor
export const PLANE_LIMITS = { normal: LIMITS.planeNormal, cvd: LIMITS.planeCvd };

export function checkPalette(theme: "light" | "dark", fams: Fam[]) {
  const S = { stage: parseHex(STAGE[theme].stage), surface: parseHex(STAGE[theme].surface), ink: parseHex(STAGE[theme].ink) };
  const c = fams.map((f) => ({ e: parseHex(f.edge), f: parseHex(f.soft), p: parseHex(f.plane ?? f.soft), i: f.ink ? parseHex(f.ink) : null }));
  const worst: Record<string, { v: number; at: string; limit: number }> = {};
  const take = (k: string, v: number, at: string, limit: number) => { if (!worst[k] || v < worst[k].v) worst[k] = { v: +v.toFixed(2), at, limit }; };
  const cvd = (a: RGB, b: RGB) => Math.min(dE(a, b, "protan"), dE(a, b, "deutan"));
  c.forEach((x, i) => {
    take("border on stage", contrast(x.e, S.stage), `c${i + 1}`, LIMITS.borderVsBehind);
    take("border on surface", contrast(x.e, S.surface), `c${i + 1}`, LIMITS.borderVsBehind);
    take("words (ink) on own fill", contrast(S.ink, x.f), `c${i + 1}`, LIMITS.words);
    take("words (ink) on own plane", contrast(S.ink, x.p), `c${i + 1}`, LIMITS.words);
    take("border on own plane", contrast(x.e, x.p), `c${i + 1}`, LIMITS.borderVsBehind);
    if (x.i) { take("family ink on own fill", contrast(x.i, x.f), `c${i + 1}`, LIMITS.words); take("family ink on surface", contrast(x.i, S.surface), `c${i + 1}`, LIMITS.words); take("family ink on stage", contrast(x.i, S.stage), `c${i + 1}`, LIMITS.words); }
    c.forEach((y, j) => { if (i !== j) take("border on another family's plane (nested)", contrast(x.e, y.p), `c${i + 1} in c${j + 1}`, LIMITS.borderVsBehind); });
    for (let j = i + 1; j < c.length; j++) {
      const y = c[j], at = `c${i + 1}-c${j + 1}`;
      take("border pair, normal", dE(x.e, y.e), at, LIMITS.borderNormal);
      take("border pair, protan/deutan", cvd(x.e, y.e), at, LIMITS.borderCvd);
      take("fill pair, normal", dE(x.f, y.f), at, LIMITS.fillNormal);
      take("fill pair, protan/deutan", cvd(x.f, y.f), at, LIMITS.fillCvd);
      take("plane pair, normal", dE(x.p, y.p), at, PLANE_LIMITS.normal);
      take("plane pair, protan/deutan", cvd(x.p, y.p), at, PLANE_LIMITS.cvd);
    }
  });
  const fails = Object.entries(worst).filter(([, w]) => w.v < w.limit).map(([k]) => k);
  return { worst, fails };
}

if (import.meta.main) {
  const [theme, src] = process.argv.slice(2) as ["light" | "dark", string];
  const fams: Fam[] = src.startsWith("#") ? src.split(",").map((p) => { const [edge, soft, ink] = p.split("/"); return { edge, soft, ink }; }) : JSON.parse(readFileSync(src, "utf8")).colours;
  const r = checkPalette(theme, fams);
  for (const [k, w] of Object.entries(r.worst)) console.log(`${w.v >= w.limit ? "pass" : "FAIL"}  ${k.padEnd(42)} ${String(w.v).padStart(6)}  (limit ${w.limit})  ${w.at}`);
  process.exitCode = r.fails.length ? 1 : 0;
}
