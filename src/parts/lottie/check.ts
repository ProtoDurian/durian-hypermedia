// What a Lottie file must pass before anything draws it, and the colour slots (format version 11). Pure; the view calls
// these in the browser when the file has loaded, before lottie-web is fetched.
import type { Budget } from "../../core/budget";

export interface LottieCaps { bytes: number; frames: number; layers: number; nodes: number }

/** the file as a Lottie checks: size, frames, layers, values, no expressions, no remote assets. null = fine, else why not.
 *  `budget` is charged for the walk (the view passes a budget of its own sized to the nodes cap). */
export function checkLottieData(json: any, bytes: number, budget: Budget, caps: LottieCaps): string | null {
  if (bytes > caps.bytes) return `the file is ${Math.round(bytes / 1024)} KB; Lottie files may be at most ${Math.round(caps.bytes / 1024)} KB`;
  if (!json || typeof json !== "object" || Array.isArray(json)) return `the file is not a Lottie animation (a JSON object with layers)`;
  if (!Array.isArray(json.layers)) return `the file is not a Lottie animation (no "layers")`;
  const frames = (+json.op || 0) - (+json.ip || 0);
  if (!(frames > 0)) return `the file has no frames (ip and op)`;
  if (frames > caps.frames) return `the animation has ${Math.round(frames)} frames; the most is ${caps.frames}`;
  let nodes = 0, layers = 0, bad: string | null = null;
  const walk = (v: any, depth: number) => {
    if (bad) return;
    budget.charge(1, 1);
    if (++nodes > caps.nodes) { bad = `the file is too big to check (more than ${caps.nodes} values)`; return; }
    if (depth > 64) { bad = "the file nests deeper than 64 levels"; return; }
    if (Array.isArray(v)) { for (const x of v) { walk(x, depth + 1); if (bad) return; } return; }
    if (v && typeof v === "object") {
      // a layer has a numeric type and a transform; a shape's type is a word
      if (typeof v.ty === "number" && "ks" in v && ++layers > caps.layers) { bad = `more than ${caps.layers} layers (the cap)`; return; }
      for (const [k, x] of Object.entries(v)) {
        // an expression is a string held under "x" next to an animated value: { a: 0, k: ..., x: "var $bm_rt; ..." }
        if (k === "x" && typeof x === "string" && x.length > 0) { bad = `the file has an expression (Lottie scripts are not run; export without expressions)`; return; }
        walk(x, depth + 1);
        if (bad) return;
      }
    }
  };
  walk(json.layers, 0);
  if (bad) return bad;
  for (const a of Array.isArray(json.assets) ? json.assets : []) {
    walk(a, 0);
    if (bad) return bad;
    if (a && typeof a === "object" && ("p" in a || "u" in a) && !("layers" in a)) {
      const p = String(a.p ?? ""), u = String(a.u ?? "");
      if (u) return `the file loads an image from "${u.slice(0, 40)}" (remote or separate files are not allowed; embed it or draw with shapes)`;
      if (!embeddedImage(p)) return `the file loads an image from "${p.slice(0, 40)}" (remote or separate files are not allowed; embed it or draw with shapes)`;
    }
  }
  if (typeof json.fr === "number" && (json.fr <= 0 || json.fr > 240)) return `the frame rate ${json.fr} is not from 1 to 240`;
  return null;
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
