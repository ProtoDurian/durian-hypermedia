// What a Lottie file must pass before anything draws it, and the colour slots (format version 11). Pure; the view calls
// these in the browser when the file has loaded, before lottie-web is fetched. The file is kept inside its part: the
// check refuses, and lottieForDrawing() makes the copy the player draws.
import type { Budget } from "../../core/budget";

export interface LottieCaps { bytes: number; frames: number; layers: number; nodes: number }

/** a layer (numeric type, and a transform, an index or an asset reference); an effect also has a numeric type but none of these */
const isLayer = (v: any) => typeof v.ty === "number" && ("ks" in v || "ind" in v || "refId" in v);
const filled = (v: unknown) => v !== undefined && v !== null && v !== "" && v !== 0 && v !== false;
const GLYPHS = "export the text as glyphs (chars) and draw it from the file";

/** the file as a Lottie checks: size, frames, layers, values, no expressions, nothing loaded from outside the file. null = fine,
 *  else why not. `budget` is charged for the walk (the view passes a budget of its own sized to the nodes cap). */
export function checkLottieData(json: any, bytes: number, budget: Budget, caps: LottieCaps): string | null {
  if (bytes > caps.bytes) return `the file is ${Math.round(bytes / 1024)} KB; Lottie files may be at most ${Math.round(caps.bytes / 1024)} KB`;
  if (!json || typeof json !== "object" || Array.isArray(json)) return `the file is not a Lottie animation (a JSON object with layers)`;
  if (!Array.isArray(json.layers)) return `the file is not a Lottie animation (no "layers")`;
  const frames = (+json.op || 0) - (+json.ip || 0);
  if (!(frames > 0)) return `the file has no frames (ip and op)`;
  if (frames > caps.frames) return `the animation has ${Math.round(frames)} frames; the most is ${caps.frames}`;
  const glyphs = Array.isArray(json.chars);
  let nodes = 0, layers = 0, bad: string | null = null;
  // the whole file is checked
  const walk = (v: any, depth: number) => {
    if (bad) return;
    budget.charge(1, 1);
    if (++nodes > caps.nodes) { bad = `the file is too big to check (more than ${caps.nodes} values)`; return; }
    if (depth > 64) { bad = "the file nests deeper than 64 levels"; return; }
    if (Array.isArray(v)) { for (const x of v) { walk(x, depth + 1); if (bad) return; } return; }
    if (v && typeof v === "object") {
      if (isLayer(v)) {
        if (++layers > caps.layers) { bad = `more than ${caps.layers} layers (the cap)`; return; }
        if (v.ty === 6) { bad = `the file has a sound layer (sound is not played; export without it)`; return; }
        if (v.ty === 15) { bad = `the file has a footage layer (separate files are not allowed; export without it)`; return; }
        if (v.ty === 5 && !glyphs) { bad = `the file has a text layer with no glyphs in the file (chars); ${GLYPHS}`; return; }
        if (v.ty === 1 && !(typeof v.sc === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.sc))) { bad = `the file has a solid layer whose colour (sc) is not a plain colour (#rgb or #rrggbb)`; return; }
      }
      for (const [k, x] of Object.entries(v)) {
        // an expression is a string held under "x" next to an animated value: { a: 0, k: ..., x: "var $bm_rt; ..." }
        if (k === "x" && typeof x === "string" && x.length > 0) { bad = `the file has an expression (Lottie scripts are not run; export without expressions)`; return; }
        walk(x, depth + 1);
        if (bad) return;
      }
    }
  };
  walk(json, 0);
  if (bad) return bad;
  if (filled(json.segments)) return `segments: the file is refused: it loads more of itself from separate files; export it as one file`;
  if (json.assets !== undefined && !Array.isArray(json.assets)) return `assets: not a list`;
  let n = 0;
  for (const a of Array.isArray(json.assets) ? json.assets : []) {
    n++;
    if (!a || typeof a !== "object" || Array.isArray(a)) return `assets: asset ${n} is not an object`;
    // an asset with a list of layers is a precomp; every other asset is checked as an image
    if (filled(a.layers)) { if (!Array.isArray(a.layers)) return `assets: asset ${n} has layers that are not a list`; continue; }
    if (a.t === 3) return `the file has a footage asset (separate files are not allowed; export without it)`;
    const p = String(a.p ?? ""), u = String(a.u ?? "");
    if (u) return `the file loads an image from "${u.slice(0, 40)}" (remote or separate files are not allowed; embed it or draw with shapes)`;
    if (!embeddedImage(p)) return `the file loads an image from "${p.slice(0, 40)}" (remote or separate files are not allowed; embed it or draw with shapes)`;
  }
  const fonts = json.fonts;
  if (fonts !== undefined && fonts !== null) {
    if (typeof fonts !== "object" || Array.isArray(fonts) || !Array.isArray(fonts.list)) return `fonts: not a list of fonts`;
    n = 0;
    for (const f of fonts.list) {
      n++;
      if (!f || typeof f !== "object" || Array.isArray(f)) return `fonts: font ${n} is not an object`;
      if (filled(f.fPath)) return `fonts: font ${n} is refused: it loads a font from outside the file (fPath); ${GLYPHS}`;
      if (filled(f.fOrigin) && f.fOrigin !== "n") return `fonts: font ${n} is refused: it names a font origin (fOrigin); ${GLYPHS}`;
      if (filled(f.origin)) return `fonts: font ${n} is refused: it names a font origin (origin); ${GLYPHS}`;
      if (filled(f.fClass)) return `fonts: font ${n} is refused: it names a page class (fClass); ${GLYPHS}`;
    }
    if (fonts.list.length && !glyphs) return `fonts: refused: the file has no glyphs for its text (chars), so the page would have to supply the fonts; ${GLYPHS}`;
  }
  if (typeof json.fr === "number" && (json.fr <= 0 || json.fr > 240)) return `the frame rate ${json.fr} is not from 1 to 240`;
  return null;
}
/** The copy the player draws, made after the check passed, kept inside the part. Changes `json` in place and returns
 *  it; `budget` is charged for the walk. */
const FONT_KEYS = ["fName", "fFamily", "fStyle", "fWeight", "ascent"];
export function lottieForDrawing(json: any, budget: Budget): any {
  // The player writes `ln` and `cl` of any type into the page as an id and a class: they never reach it. The one other
  // use of `cl` is a mask's true/false flag, which is kept there and only as a boolean.
  const strip = (v: any, d: number, mask: boolean) => {
    if (d > 64 || !v || typeof v !== "object") return;
    budget.charge(1);
    if (Array.isArray(v)) { for (const x of v) strip(x, d + 1, mask); return; }
    delete v.ln;
    if (!(mask && typeof v.cl === "boolean")) delete v.cl;
    for (const [k, x] of Object.entries(v)) strip(x, d + 1, k === "masksProperties");
  };
  if (json && typeof json === "object") {
    delete json.segments;
    if (json.fonts && Array.isArray(json.fonts.list)) {
      json.fonts = { list: json.fonts.list.map((f: any) => { budget.charge(1); const o: Record<string, unknown> = {}; for (const k of FONT_KEYS) if (f && typeof f === "object" && k in f) o[k] = f[k]; return o; }) };
    } else delete json.fonts;
    strip(json, 0, false);
  }
  return json;
}
/** an image embedded as data:image/png|jpeg|webp|gif;base64, (the only kind a Lottie may carry) */
function embeddedImage(p: string): boolean {
  const head = p.slice(0, 40).toLowerCase();
  for (const t of ["png", "jpeg", "webp", "gif"]) if (head.startsWith(`data:image/${t};base64,`)) return true;
  return false;
}
/** The names a Lottie file offers as colour slots: layer, shape and group names that start with `dh-` */
export function lottieNames(json: any): string[] {
  const out = new Set<string>();
  const walk = (v: any, d: number) => {
    if (d > 40 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const x of v) walk(x, d + 1); return; }
    if (typeof v.nm === "string" && v.nm.startsWith("dh-")) out.add(v.nm);
    for (const x of Object.values(v)) walk(x, d + 1);
  };
  walk(json, 0);
  return [...out];
}
/** Paints every fill and stroke inside a layer or group named in `rgb` (name -> [r, g, b] in 0..1). Returns how many it painted. */
export function recolourLottie(json: any, rgb: Record<string, [number, number, number]>, budget: Budget): number {
  let painted = 0;
  const paint = (v: any, c: [number, number, number], d: number) => {
    if (d > 64 || !v || typeof v !== "object") return;
    budget.charge(1);
    if (Array.isArray(v)) { for (const x of v) paint(x, c, d + 1); return; }
    if ((v.ty === "fl" || v.ty === "st") && v.c && typeof v.c === "object") {
      const q = v.c;
      if (q.a === 1 && Array.isArray(q.k)) for (const kf of q.k) { if (Array.isArray(kf.s)) kf.s = [c[0], c[1], c[2], kf.s[3] ?? 1]; if (Array.isArray(kf.e)) kf.e = [c[0], c[1], c[2], kf.e[3] ?? 1]; }
      else q.k = [c[0], c[1], c[2], Array.isArray(q.k) && typeof q.k[3] === "number" ? q.k[3] : 1];
      painted++;
    }
    for (const x of Object.values(v)) paint(x, c, d + 1);
  };
  const find = (v: any, d: number) => {
    if (d > 64 || !v || typeof v !== "object") return;
    budget.charge(1);
    if (Array.isArray(v)) { for (const x of v) find(x, d + 1); return; }
    if (typeof v.nm === "string" && Object.hasOwn(rgb, v.nm)) { paint(v, rgb[v.nm], 0); return; }
    for (const x of Object.values(v)) find(x, d + 1);
  };
  find(json, 0);
  return painted;
}
