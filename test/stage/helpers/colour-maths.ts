// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// Colour maths for the pass 11 colour checks (helper "colours").
// OKLab distance x100 (the dataviz skill's scale), WCAG contrast, and protanopia / deuteranopia by the
// Machado, Oliveira and Fernandes (2009) matrices at severity 1.0, in linear sRGB.
export type RGB = [number, number, number]; // 0..255

const s2lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin2s = (c: number) => { c = Math.max(0, Math.min(1, c)); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
export const lin = (c: RGB): RGB => c.map((v) => s2lin(v / 255)) as RGB;

const M = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
};
export type Vision = "normal" | "protan" | "deutan";
export const VISIONS: Vision[] = ["normal", "protan", "deutan"];

export function simLin(c: RGB, v: Vision): RGB {
  const l = lin(c);
  if (v === "normal") return l;
  const m = M[v];
  return m.map((r) => Math.max(0, Math.min(1, r[0] * l[0] + r[1] * l[1] + r[2] * l[2]))) as RGB;
}
export function oklabLin([r, g, b]: RGB): RGB {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
/** OKLab distance x100 between two colours as seen with the given vision. */
export function dE(a: RGB, b: RGB, v: Vision = "normal"): number {
  const p = oklabLin(simLin(a, v)), q = oklabLin(simLin(b, v));
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
/** The worst (smallest) distance over normal, protan and deutan vision, and which one it was. */
export function worstDE(a: RGB, b: RGB): { normal: number; cvd: number; cvdKind: Vision } {
  const p = dE(a, b, "protan"), d = dE(a, b, "deutan");
  return { normal: dE(a, b), cvd: Math.min(p, d), cvdKind: p <= d ? "protan" : "deutan" };
}
const relLum = (c: RGB) => { const [r, g, b] = lin(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export function contrast(a: RGB, b: RGB): number { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

export const hex = (c: RGB) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
export const parseHex = (h: string): RGB => { const s = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as RGB; };

/** OKLCH (L 0..1, C, h degrees) to sRGB 0..255, clamped; also says whether it was in gamut. */
export function oklch(L: number, C: number, h: number): { rgb: RGB; inGamut: boolean } {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const inGamut = [r, g, bb].every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  return { rgb: [r, g, bb].map((v) => Math.round(lin2s(v) * 255)) as RGB, inGamut };
}
export function toOklch(c: RGB): [number, number, number] {
  const [L, a, b] = oklabLin(lin(c));
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

/** The thresholds this pass holds every scene to (written in NOTES-colours.md and THEME notes). */
export const LIMITS = {
  borderNormal: 15, borderCvd: 8,   // borders and lines: the dataviz skill's mark targets (OKLab x100)
  planeNormal: 3,                   // decision (22 Nov; row 3 taste): planes are near-white tints, 3 apart for normal vision; a container is told apart by its border and heading
  planeCvd: 0,                      // decision (22 Nov; row 3 taste): no colour-blind plane floor; the border (8 apart colour-blind) carries it
  fillNormal: 10,                   // leaf fills 10 apart for normal vision (kept)
  fillCvd: 4,                       // decision (22 Nov; row 3 taste): leaf fills 4 apart colour-blind (was 6, which forced muddy or white fills); borders stay 8 apart colour-blind
  borderVsBehind: 3,                // WCAG, a box's border against what it sits on (the stage, or its container's fill)
  words: 4.5,                       // WCAG, words against the fill they sit on
};

/** OKLab to sRGB 0..255 (clamped). */
export function fromOklab([L, a, b]: RGB): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => Math.round(lin2s(v) * 255)) as RGB;
}
/** color-mix(in oklab, a p, b): p of a, the rest b (what the browser draws for a plane tint). */
export function mixOklab(a: RGB, b: RGB, p: number): RGB {
  const x = oklabLin(lin(a)), y = oklabLin(lin(b));
  return fromOklab([x[0] * p + y[0] * (1 - p), x[1] * p + y[1] * (1 - p), x[2] * p + y[2] * (1 - p)]);
}
