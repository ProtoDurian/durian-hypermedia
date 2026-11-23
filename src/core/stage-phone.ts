// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// denser phone forms for the composed stage (tools/stage.ts calls these from its narrow lanes).
// Never by hiding a fact and never under 11 px: a phone form is chosen only when every word of every card is still
// drawn whole (no "…", no word broken inside itself except after -. / _:). Pure: no DOM; linear in the cards.
import { docBudget } from "./stage-budget";
import { type Item, type Font, measure, LINE_H } from "./stage-core";

/** phone spacing (CSS px at scale 1): the gap between two rows of cards in a lane, between two cards of a row,
 * and between two stacked lanes (with connector labels in it, or without); a tag chip sits across its card's top edge
 * (tagLift above it), so a tagged row needs only tagTop more room */
export const PHONE = { rowGap: 10, colGap: 8, laneGap: 30, laneGapHead: 26, laneGapPlain: 20, cardMinW: 92, maxPer: 4, tagTop: 4, tagLift: 12, panelGap: 14 } as const;

/** the longest piece of a word between the places a long word may break (-. / _:): what must fit a line */
export function longestPiece(s: string, f: Font): number {
  let best = 0, cur = "";
  for (const ch of s) {
    if (ch === " ") { best = Math.max(best, measure(cur, f)); cur = ""; continue; }
    cur += ch;
    if ("-./_:".includes(ch)) { best = Math.max(best, measure(cur, f)); cur = ""; }
  }
  return Math.max(best, measure(cur, f));
}

/** Is every word of a card drawn whole at this width? `drawn` are the card's text items at that width. */
export function wholeAt(drawn: Item[], words: { s: string; f: Font }[], inner: number): boolean {
  for (const it of drawn) if (it.k === "text" && it.s.endsWith("…")) return false;
  for (const w of words) if (longestPiece(w.s, w.f) > inner) return false;
  return true;
}

/** How many cards a row of a phone lane: the count that makes the lane least tall, among the counts at which every
 * card is drawn whole and at least `cardMinW` wide. `hOf(i, cw)` is card i's height at width cw, `whole(i, cw)` whether
 * its words are whole there, `extra(row)` the room a row reserves above and below (tags and says). Ties keep fewer a row. */
export function phonePer(n: number, iw: number, hOf: (i: number, cw: number) => number, whole: (i: number, cw: number) => boolean, extra: (from: number, to: number, cw: number) => number, fallback: number, gap: number = PHONE.colGap): { per: number; h: number } {
  const total = (per: number) => { let h = 0; const cw = (iw - (per - 1) * gap) / per; for (let j = 0; j < n; j += per) { let rh = 0; for (let i = j; i < Math.min(n, j + per); i++) rh = Math.max(rh, hOf(i, cw)); h += rh + PHONE.rowGap + extra(j, Math.min(n, j + per), cw); } return h; };
  if (n <= 1) return { per: 1, h: total(1) };
  const budget = docBudget();
  let best = fallback, bestH = Infinity;
  for (let per = 1; per <= Math.min(n, PHONE.maxPer); per++) {
    const cw = (iw - (per - 1) * gap) / per;
    if (per > 1 && cw < PHONE.cardMinW) break;
    budget.charge("stage phone rows", n, n);
    let ok = true, h = 0;
    for (let i = 0; i < n && ok; i++) if (!whole(i, cw)) ok = false;
    if (!ok) continue;
    h = total(per);
    if (h < bestH - 0.5) { bestH = h; best = per; }
  }
  return { per: best, h: bestH === Infinity ? total(best) : bestH };
}

/** "and more" lines in the free cells of a lane's last row, when they fit there whole: their places, else null */
export function moreInFreeCell(more: string[], x: number, y: number, w: number, h: number): Item[] | null {
  if (!more.length || w < PHONE.cardMinW) return null;
  if (more.some((t) => measure(t, "sub") > w - 8)) return null;
  const th = more.length * LINE_H.sub;
  if (th > h) return null;
  const y0 = y + (h - th) / 2;
  return more.map((t, j) => ({ k: "text", x: x + w / 2, y: y0 + (j + 1) * LINE_H.sub - 3, s: t, f: "sub", ink: "muted", anchor: "middle" }) as Item);
}

/** a lane heading's room on a phone, beside the connector labels of the gap above it: its rect (labels keep clear) */
export function headingRect(title: string, x: number, y: number): { x: number; y: number; w: number; h: number } {
  return { x, y, w: measure(title, "lane") + 10, h: 20 };
}

/** badges in a card: on a phone a lower row and the words closer to the letter (set by the stage around a narrow layout) */
let phoneOn = false;
export const setPhone = (on: boolean) => { phoneOn = on; };
export const badgeGeo = () => (phoneOn ? { pitch: 28, h: 24, gy: 3.5, tx: 25, ty: 16.5, need: 34 } : { pitch: 34, h: 28, gy: 5, tx: 28, ty: 18.5, need: 40 });
