// Scenes a reader should see whole (format version 11): a still scene (no steps), and any scene drawn static (SPEC 4.1).
// The story camera of a story follows its steps; here nothing would move it to what is off the stage, so the layout
// gives way instead of the view: as written, else top to bottom. Words never go under the least size; a drawing still
// too wide for that scrolls sideways in its own box (src/ui/anim.tsx), and the stage takes the height that this needs.
import { compileScene, MARGIN, NARROW, union, type Compiled } from "./scene";
import { BudgetError } from "./budget";
import { leastScale, phoneScene } from "./readable";

export const STAGE = 700; // the stage's width in the server's HTML, before the page knows it
const MOST = 1.15; // never drawn much over natural size
// a tall scene is as tall as it is (the page scrolls; a cap of 1600 cut it to a part of itself); a short one is as short
// as it is, its drawing and the margin (a floor of 260 drew a line of three boxes in a frame four times its height)
const HIGH = 8000, LOW = 4 * MARGIN;

export function wholeSize(c: Compiled): { w: number; h: number } {
  const all = union(c.frames.map((f) => f.bounds));
  return { w: all.w + 2 * MARGIN, h: all.h + 2 * MARGIN };
}
export function fitsWide(c: Compiled, px: number): boolean {
  if (!c.frames.length) return true;
  return wholeSize(c).w * Math.max(...c.frames.map((f) => leastScale(f, px))) <= px + 0.5;
}
/** the layout that shows the scene whole at a stage px wide: as written (with the phone's spacing under NARROW), else
 *  top to bottom. Each layout is compiled once per scene, on its own work budget (core/readable.ts phoneScene): one over
 *  its budget keeps the layout before it */
export function wholeLayout(wide: Compiled, px: number, rows = false): Compiled {
  if (!px || !wide.frames.length) return wide;
  let c = px < NARROW ? phoneScene(wide, false) ?? wide : wide;
  if (fitsWide(c, px)) return c;
  const narrow = phoneScene(wide, true);
  c = narrow?.frames.length ? narrow : c;
  // a diagram (state, class, ER): a rank still too wide for the least word is taken over several rows (fit=)
  if (!rows || fitsWide(c, px) || !wide.src) return c;
  const least = Math.max(...c.frames.map((f) => leastScale(f, px)));
  const src = wide.src;
  try {
    const fit = compileScene(src.head, src.steps, src.base, { ...src.info, ...(px < NARROW ? { phone: "1" } : {}), narrow: "1", fit: String(Math.max(120, Math.floor(px / least - 4 * MARGIN))) });
    return fit.frames.length ? fit : c;
  } catch (e) { if (!(e instanceof BudgetError)) throw e; return c; }
}
// the page lays out for a width a little under its stage's, so a drag of the window's edge does not lay out on each pixel
export const layoutWidth = (px: number) => Math.floor(px / 16) * 16;
// the camera that shows it all, where the words stay big enough; else none (the story's camera then)
export function wholeView(c: Compiled, ar: number, px: number): { x: number; y: number; w: number; h: number } | null {
  if (!c.frames.length) return null;
  const all = union(c.frames.map((f) => f.bounds));
  const w0 = all.w + 2 * MARGIN, h0 = all.h + 2 * MARGIN;
  const w = Math.max(w0, h0 * ar, px ? px / MOST : 0), h = w / ar;
  if (px && px / w < Math.max(...c.frames.map((f) => leastScale(f, px))) - 0.01) return null;
  return { x: all.x + all.w / 2 - w / 2, y: all.y + all.h / 2 - h / 2, w, h };
}
// a static scene shows one step, and shows it whole: on a stage too small for the least word it is drawn smaller, never cut
export const oneStep = (c: Compiled, i: number): Compiled => ({ ...c, frames: [c.frames[Math.max(0, Math.min(c.frames.length - 1, i))]] });
export function staticView(c: Compiled, ar: number, px: number): { x: number; y: number; w: number; h: number } {
  const s = wholeSize(c), all = union(c.frames.map((f) => f.bounds));
  const w = Math.max(s.w, s.h * ar, px ? px / MOST : 0), h = w / ar;
  return { x: all.x + all.w / 2 - w / 2, y: all.y + all.h / 2 - h / 2, w, h };
}
/** wholeAspect's height as CSS, for a container whose width is the stage's (100cqw) */
export const wholeHeightCss = (s: { w: number; h: number }): string => `clamp(${LOW}px, min(${+(MOST * s.h).toFixed(3)}px, ${+(s.h / s.w).toFixed(6)} * 100cqw), ${HIGH}px)`;
/** the same height in pixels for a stage w wide (what the browser draws; the test holds the two together) */
export const wholeHeightPx = (s: { w: number; h: number }, w: number): number => Math.min(HIGH, Math.max(LOW, Math.min(MOST * s.h, (s.h / s.w) * w)));
/** the layout widths a whole scene's height is known at on the server (layoutWidth's 16 px steps, phone to wide) */
export const WHOLE_WS: number[] = Array.from({ length: 61 }, (_, k) => 240 + 16 * k);
/** No load shift (SPEC 6.14): a whole scene's stage height for every layout width, as custom properties for the part's
 *  style attribute (no <style> element, no HTML string: strict Trusted Types holds). --wh is the height at the widest
 *  width; --wh-a, --wh-b ... the other layouts' heights; --wh<width> names the one a width takes where it is not --wh.
 *  src/ui/parts.css picks the one for the stage's width with a container query per width in WHOLE_WS. i: static's step */
export function wholeHeightVars(wide: Compiled, i?: number, rows = false): Record<string, string> {
  const at = (b: number) => { const c = wholeLayout(wide, b, rows); return c.frames.length ? wholeHeightCss(wholeSize(i == null ? c : oneStep(c, i))) : null; };
  const top = at(WHOLE_WS[WHOLE_WS.length - 1]);
  if (!top) return {};
  const out: Record<string, string> = { "--wh": top }, named = new Map<string, string>([[top, "--wh"]]);
  for (const b of WHOLE_WS) {
    const h = at(b);
    if (!h || h === top) continue;
    let n = named.get(h);
    if (!n) { n = `--wh-${String.fromCharCode(97 + named.size - 1)}`; named.set(h, n); out[n] = h; }
    out[`--wh${b}`] = `var(${n})`;
  }
  return out;
}
// the stage's shape that shows it whole
export function wholeAspect(c: Compiled, px: number): number {
  if (!c.frames.length) return c.aspect;
  const w = px || STAGE, s = wholeSize(c);
  return w / Math.min(HIGH, Math.max(LOW, s.h * Math.min(MOST, w / s.w)));
}
