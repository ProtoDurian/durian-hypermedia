// Lane prims: fitting a thing's words to the rect its layout gave it. The rect is the truth (a legacy-sized box is never
// re-wrapped beyond it): the words are wrapped at the rect's width less the look's padding, at the stage's sizes
// (13.5 title / 12.5 body px; the phone's own sizes under 480 px), and when they do not fit the height the steps are
//   1. the padding gets tighter,
//   2. the title steps down a size (title -> body -> sub: the smallest is the 11 px floor on a phone, 12 px elsewhere),
//   3. the optional lines (a card's sub lines, a note) take what room is left, the last one ends in an ellipsis,
//      and are dropped when not even one fits,
//   4. the title itself ends in an ellipsis (its full text stays in the model, and the LLM view).
// The title never shrinks only to make room for the optional lines.
import { LINE_H, measure, wrap, type Font } from "../../../core/stage-core";

/** a gap between the title block and the lines under it, so they never touch */
export const TITLE_GAP = 3;

/** the stage's measure of medium-weight type (title, lane) runs about 8% wider than the browser draws it (measured on
 * "frontend" 68.7 -> 62 px), so a title is wrapped at its width less that, and does not step down a size for nothing */
const MEDIUM = 1 / 0.93;
const wf = (f: Font) => (f === "title" || f === "lane" ? MEDIUM : 1);

export interface Pad { px: number; pt: number }
export interface Cand { tf: Font; sf: Font; px: number; pt: number }
export interface Fitted {
  title: string[]; sub: string[]; tf: Font; sf: Font; px: number; pt: number;
  /** words were cut: the title ended in an ellipsis */
  cut: boolean;
  /** optional lines that did not fit (all dropped) */
  dropped: boolean;
  /** the height of what is drawn, without padding */
  h: number;
}

const blockH = (tn: number, tf: Font, sn: number, sf: Font) => tn * LINE_H[tf] + (tn && sn ? TITLE_GAP : 0) + sn * LINE_H[sf];

/** the candidates, best first: the same stage fonts, then tighter, then smaller */
export function candidates(pad: Pad): Cand[] {
  const tight = { px: Math.min(pad.px, 7), pt: Math.min(pad.pt, 4) };
  return [
    { tf: "title", sf: "sub", ...pad },
    { tf: "title", sf: "sub", ...tight },
    { tf: "body", sf: "sub", ...tight },
    { tf: "sub", sf: "sub", px: Math.min(tight.px, 5), pt: Math.min(tight.pt, 3) },
  ];
}

/** `s` shortened to `w` with an ellipsis */
export function ellipsis(s: string, w: number, f: Font): string {
  if (measure(s, f) <= w) return s;
  let x = s.replace(/[\s.,;:…]+$/, "");
  while (x && measure(x + "…", f) > w) x = x.slice(0, -1).replace(/[\s.,;:]+$/, "");
  return x + "…";
}
/** the stage's wrap, except that a path too long for a line breaks after a "/" (never inside a file name such as
 * "contract.yaml"); a part still too long falls back to the stage's own break */
export function wrapWords(s: string, w: number, f: Font, max = 4): string[] {
  const toks = s.split(" ").filter((x) => x !== "");
  if (!toks.some((t) => t.includes("/") && measure(t, f) > w)) return wrap(s, w, f, max);
  const out: string[] = []; let cur = "";
  for (const tok of toks) {
    const parts = tok.includes("/") ? tok.split(/(?<=\/)/) : [tok];
    parts.forEach((p, i) => { const t = cur + (i === 0 && cur ? " " : "") + p; if (!cur || measure(t, f) <= w) cur = t; else { out.push(cur); cur = p; } });
  }
  if (cur) out.push(cur);
  const all = out.flatMap((l) => (measure(l, f) > w ? wrap(l, w, f, 99) : [l]));
  return all.length <= max ? all : [...all.slice(0, max - 1), ellipsis(all[max - 1] + "…", w, f)];
}
/** render2: a word broken where it reads badly: a piece of 2 characters or fewer ("web-" / "3"), or a file's extension
 * alone ("checkout-overview." / "json") */
export function badBreak(text: string, lines: string[]): boolean {
  const words = new Set(text.split(/\s+/).filter(Boolean));
  for (let i = 0; i + 1 < lines.length; i++) {
    const a = lines[i].trimEnd(), b = lines[i + 1].trimStart();
    const head = a.split(" ").at(-1) ?? "", tail = b.split(" ")[0] ?? "";
    if (!head || !tail || words.has(head) || words.has(tail)) continue; // broken between words, not inside one
    if (/\/$/.test(head)) continue; // after a "/" is a path's own break
    if (head.length <= 2 || tail.replace(/…$/, "").length <= 2 || (/\.$/.test(head) && /^[A-Za-z0-9]{1,5}$/.test(tail))) return true;
  }
  return false;
}
const wrapAll = (ls: string[], w: number, f: Font) => ls.filter((l) => l !== "").flatMap((l) => wrapWords(l, w, f, 99));

/** Fit a title and its optional lines in `w` x `h` (the room inside the shape, before padding). `slack` keeps a margin
 * for the browser drawing wider than the measure (about 3%). */
/** render2: the largest title size a frame's things may take (null: any): a graph scene's boxes share one size, so one box
 * that had to step down (a long file name) does not stand thin and small beside bold ones (long paths at 390) */
let titleFloor: Font | null = null;
export const TITLE_RANK: Record<string, number> = { title: 0, body: 1, sub: 2 };
export function withTitleFloor<T>(floor: Font | null, run: () => T): T { const was = titleFloor; titleFloor = floor; try { return run(); } finally { titleFloor = was; } }
export function fitWords(title: string, lines: string[], w: number, h: number, pad: Pad, slack = 0.97): Fitted {
  const all = candidates(pad), cs = titleFloor ? all.filter((c) => (TITLE_RANK[c.tf] ?? 0) >= (TITLE_RANK[titleFloor!] ?? 0)) : all, tw = (c: Cand) => Math.max(10, (w - 2 * c.px) * slack);
  const room = (c: Cand) => h - 2 * c.pt;
  // 1. everything fits: the first candidate that holds the title and all lines (render2: and breaks no word badly,
  // when a smaller one does: "web-" / "3", "checkout-overview." / "json"; else the first that fits, as before)
  for (const clean of [true, false]) for (const c of cs) {
    const t = title ? wrapWords(title, tw(c) * wf(c.tf), c.tf, 99) : [], s = wrapAll(lines, tw(c), c.sf);
    if (clean && badBreak(title, t)) continue;
    if (blockH(t.length, c.tf, s.length, c.sf) <= room(c)) return { title: t, sub: s, tf: c.tf, sf: c.sf, px: c.px, pt: c.pt, cut: false, dropped: false, h: blockH(t.length, c.tf, s.length, c.sf) };
  }
  // 2. the title in the best size it fits at; the lines take what is left (or go)
  for (const c of cs) {
    const t = title ? wrapWords(title, tw(c) * wf(c.tf), c.tf, 99) : [];
    if (blockH(t.length, c.tf, 0, c.sf) <= room(c)) {
      const left = Math.floor((room(c) - blockH(t.length, c.tf, 0, c.sf) - TITLE_GAP) / LINE_H[c.sf]);
      const all = wrapAll(lines, tw(c), c.sf);
      let s: string[] = [];
      if (t.length && left >= 1 && all.length) { s = all.slice(0, left); if (all.length > left) s[left - 1] = ellipsis(all[left - 1] + " …", tw(c), c.sf); }
      else if (!t.length && all.length) { const n = Math.max(1, Math.floor(room(c) / LINE_H[c.sf])); s = all.slice(0, n); if (all.length > n) s[n - 1] = ellipsis(all[n - 1] + " …", tw(c), c.sf); }
      return { title: t, sub: s, tf: c.tf, sf: c.sf, px: c.px, pt: c.pt, cut: false, dropped: !s.length && all.length > 0, h: blockH(t.length, c.tf, s.length, c.sf) };
    }
  }
  // 3. not even the title: the smallest candidate, the title cut to the lines that fit
  const c = cs[cs.length - 1], n = Math.max(1, Math.floor(room(c) / LINE_H[c.tf]));
  const t = title ? wrapWords(title, tw(c) * wf(c.tf), c.tf, n) : [];
  return { title: t, sub: [], tf: c.tf, sf: c.sf, px: c.px, pt: c.pt, cut: t.at(-1)?.endsWith("…") ?? false, dropped: lines.length > 0, h: blockH(t.length, c.tf, 0, c.sf) };
}
