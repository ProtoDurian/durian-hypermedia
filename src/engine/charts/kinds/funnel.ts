// funnel as primitives (lane chwire; port of the Funnel of src/parts/chart-kinds/view.tsx). One band per stage, `stage:<i>` (a path of
// the same four corners for every number), its words `stage:<i>:name|name2|val|share`, the drop between stages `stage:<i>:drop`.
// The height depends on the number of stages only. `stageLabel` is the old placement rule, copied as it was redesigned.
import type { Prim } from "../../types";
import type { View } from "../../../parts/chart-kinds/compute";
import { fullOf, paint, pct, r2 } from "./axisframe";
import type { KMark, KindImpl } from "./common";

type F = Extract<View, { kind: "funnel" }>;
/** each stage is a band of this height with the same gap under it (the drop from the stage above sits in the gap) */
const BAND = 48, GAP = 26, MAX_W = 760; // at most 760 px wide, centred
/** charts2: a stage's width is the square root of its share of the first (100% is the full width, 25% half of it, 2.8% a sixth), so a
 *  stage of a few percent is still a band its words can sit in; each band narrows all the way to the next stage's width, so the funnel
 *  is one shape (it narrowed half way, then jumped: 100% to 70%, then 18%). The share words say the real numbers. */
export const stageWidth = (value: number, first: number, full: number): number => Math.max(6, Math.sqrt(Math.max(0, value) / (first || 1)) * full);
const trunc = (s: string, n: number): string => (s.length <= n ? s : s.slice(0, Math.max(1, n - 1)) + "…");

/** where a stage's words go: inside the band, on one line, when they fit its width (name, count and, on a wide chart, the share of the first);
 *  else beside it on the right, the name over the count (a name too long for the room takes two lines, the second cut only past the room); else inside again with the name cut. The count
 *  is never cut. The character widths are generous (Poppins 14 px: a name about 7.2 px a character, a bold count 8.5) */
export function stageLabel(name: string, value: string, share: string, top: number, bot: number, w: number): { name: string; value: string; share?: string; name2?: string; x: number; anchor: "middle" | "start"; stack?: boolean } {
  const cw = 8, vw = value.length * 9 + 10, sw = share ? share.length * 7 + 10 : 0, mid = w / 2;
  // the band's width where the words sit (the middle third of its height): the narrowest and the widest of it
  const at = (f: number): number => top + (bot - top) * f, inside = Math.min(at(0.37), at(0.63)) - 16, widest = Math.max(at(0.37), at(0.63));
  const need = (nm: string, sh: boolean): number => nm.length * cw + vw + (sh ? sw : 0);
  if (need(name, true) <= inside) return { name, value, share: share || undefined, x: mid, anchor: "middle" };
  if (need(name, false) <= inside) return { name, value, x: mid, anchor: "middle" };
  const edge = mid + widest / 2 + 10, side = w - edge - 2;
  if (side >= 90) {
    const per = Math.max(3, Math.floor(side / cw)), shareOk = share && vw + sw - 10 <= side ? share : undefined;
    if (name.length <= per) return { name, value, share: shareOk, x: edge, anchor: "start", stack: true };
    // too long for one line: the name takes two (broken at a space when there is one near the middle), the second cut only past the room
    let cut = name.lastIndexOf(" ", per);
    if (cut < Math.min(4, per / 2)) cut = per;
    return { name: name.slice(0, cut).trimEnd(), name2: trunc(name.slice(cut).trimStart(), per), value, share: shareOk, x: edge, anchor: "start", stack: true };
  }
  // charts2: a full-width band with no room beside it: the name over the count, inside, before any cut (format/65 at 390: "Visited the si…")
  if (name.length * cw <= inside + 16 && vw <= inside + 16) return { name, value, x: mid, anchor: "middle", stack: true };
  return { name: trunc(name, Math.max(3, Math.floor((inside - vw) / cw))), value, x: mid, anchor: "middle" };
}

export const funnel: KindImpl = {
  kind: "funnel",
  height: (view) => { const n = (view as F).stages.length; return n * BAND + (n - 1) * GAP + 8; },
  build(view, rect, ctx) {
    const v = view as F, n = v.stages.length, w = rect.w, mid = rect.x + w / 2, p = paint(v.tone);
    const cw = Math.min(w - 8, MAX_W), max = v.stages[0].value || 1;
    const wd = (x: number): number => stageWidth(x, max, cw); // charts2
    const prims: Prim[] = [], texts: Prim[] = [], marks: KMark[] = [];
    v.stages.forEach((s, i) => {
      const y0 = rect.y + i * (BAND + GAP), top = wd(s.value), bot = i < n - 1 ? wd(v.stages[i + 1].value) : top * 0.84; // charts2: to the next stage's width
      const K = `stage:${i}`, t = n > 1 ? i / (n - 1) : 0;
      prims.push({ k: "path", key: K, d: `M${r2(mid - top / 2)} ${r2(y0)}H${r2(mid + top / 2)}L${r2(mid + bot / 2)} ${r2(y0 + BAND)}H${r2(mid - bot / 2)}Z`, role: p.role, width: "thin", fill: "soft", cls: `kd-fun kd-r${Math.round(46 - t * 22)} ${p.cls}` });
      const val = fullOf(v.fmt, s.value), lab = stageLabel(s.name, val, pct(s.ofFirst), top, bot, w); // charts2: the share on a phone too (stageLabel drops it when it does not fit)
      const dy = y0 + BAND / 2 + 4.5, X = rect.x + lab.x, gapW = 8;
      const put = (key: string, x: number, y: number, text: string, cls: string, font: "title" | "sub", ink: "ink" | "muted"): void => { texts.push({ k: "text", key: `${K}:${key}`, x: r2(x), y: r2(y), lines: [text], font, anchor: "start", ink, cls }); };
      const wName = ctx.measure(lab.name, "title"), wVal = ctx.measure(lab.value, "title"), wShare = lab.share ? ctx.measure(lab.share, "sub") : 0;
      if (lab.stack) {
        const ny = dy - (lab.name2 ? 18 : 9), vy = lab.name2 ? ny + 36 : ny + 19; // eng-stagebars: 18 px between lines (the title font's line height), so stacked words never touch
        // charts2: stacked inside a band (anchor middle): each line centred on the band
        const c = lab.anchor === "middle", xn = c ? X - wName / 2 : X, xv = c ? X - (wVal + (lab.share ? gapW + wShare : 0)) / 2 : X;
        put("name", xn, ny, lab.name, "kd-st-name", "title", "ink");
        if (lab.name2) put("name2", xn, ny + 18, lab.name2, "kd-st-name", "title", "ink");
        put("val", xv, vy, lab.value, "kd-st-val", "title", "ink");
        if (lab.share) put("share", xv + wVal + gapW, vy, lab.share, "kd-st-share", "sub", "muted");
      } else {
        const total = wName + gapW + wVal + (lab.share ? gapW + wShare : 0), x0 = X - total / 2;
        put("name", x0, dy, lab.name, "kd-st-name", "title", "ink");
        put("val", x0 + wName + gapW, dy, lab.value, "kd-st-val", "title", "ink");
        if (lab.share) put("share", x0 + wName + gapW + wVal + gapW, dy, lab.share, "kd-st-share", "sub", "muted");
      }
      if (i < n - 1 && s.value > 0) texts.push({ k: "text", key: `${K}:drop`, x: r2(mid), y: r2(y0 + BAND + GAP / 2 + 4), lines: [`−${pct(1 - v.stages[i + 1].value / s.value)}`], font: "sub", anchor: "middle", ink: "muted", cls: "kd-drop" });
      marks.push({ key: K, kind: "stage", rect: { x: rect.x, y: r2(y0), w: r2(w), h: i < n - 1 ? BAND + GAP / 2 : BAND + 4 }, title: s.name, meta: `${fullOf(v.fmt, s.value)} · ${pct(s.ofFirst)} of the first`, text: s.ofPrev === null ? undefined : `${pct(s.ofPrev)} of the stage before; ${pct(1 - s.ofPrev)} dropped out.` });
    });
    return { prims: [...prims, ...texts], marks };
  },
};
