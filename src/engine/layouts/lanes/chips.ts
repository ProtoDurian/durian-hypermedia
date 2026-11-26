// render2: a line's words never cover a card's title. The composed stage puts a line's words chip inside its target, just
// past the arrowhead, when it finds no room on its own line; it keeps an earlier step's words in the gap as taken for
// every step the line shows, so a reply (gt 10's "201 pending", "callback refund.succeeded", gt 05's DNS answers, gt
// 02's ACK, gt 03's GET) sat on the card's title. Here a words chip that covers a card (the top band of a card that holds
// others) moves onto its own line, in the gap, where it covers no card and no other chip shown in its steps; with no such
// place it stays where the stage put it.
import { measure, type Item } from "../../../core/stage-core";
import type { Model } from "../../types";
import { idOfBox, isWire, shownAt } from "./items";

type R = { x: number; y: number; w: number; h: number };
const meets = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
type Pts = [number, number][];
/** render2: the distance from pt to a polyline */
const segDist = (pts: Pts, x: number, y: number) => { let d = Infinity; for (let j = 1; j < pts.length; j++) { const [x0, y0] = pts[j - 1], [x1, y1] = pts[j], dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy, u = L ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L)) : 0; d = Math.min(d, Math.hypot(x - x0 - u * dx, y - y0 - u * dy)); } return d; };
/** render2: does a polyline run through r (shrunk by 1)? */
const through = (pts: Pts, r: R) => { const x0 = r.x + 1, y0 = r.y + 1, x1 = r.x + r.w - 1, y1 = r.y + r.h - 1; for (let j = 1; j < pts.length; j++) { const [ax, ay] = pts[j - 1], [bx, by] = pts[j]; let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay; let ok = true; for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]] as [number, number][]) { if (p === 0) { if (q < 0) { ok = false; break; } continue; } const t = q / p; if (p < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; } else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; } } if (ok && t1 > t0) return true; } return false; };
const HEAD = 28; // a holder's heading band (its title)
const CH = 20;   // a chip's height (stage-core chip)
const PAD = 14;

/** the items with every line-words chip that covers a card moved onto its line; a new array (moved items are copies) */
export function chipsOffTitles(items: Item[], model: Model, last: number, width: number, height = Infinity): Item[] {
  const holders = new Set(Object.values(model.things).flatMap((t) => (t.parent ? [t.parent] : [])));
  const known = new Set(Object.keys(model.things));
  const steps = (it: Item) => { const out: number[] = []; for (let k = 1; k <= last; k++) if (shownAt(it, k)) out.push(k); return out; };
  // the cards at a step: a holder only by its heading (its title and lines, down to the first card it holds)
  const cardsAt = new Map<number, R[]>();
  const cards = (k: number): R[] => {
    let hit = cardsAt.get(k); if (hit) return hit;
    const boxes = new Map<string, R>();
    for (const it of items) {
      if (it.k !== "box" || !it.id || !shownAt(it, k) || /(^|\s)stg-(chip|pill)(\s|$)/.test(it.cls ?? "")) continue;
      const id = idOfBox(it.id)!; if (known.has(id)) boxes.set(id, { x: it.x, y: it.y, w: it.w, h: it.h });
    }
    hit = [...boxes].map(([id, r]) => {
      if (!holders.has(id)) return r;
      const kids = Object.values(model.things).filter((t) => t.parent === id).map((t) => boxes.get(t.id)).filter((b): b is R => !!b && b.y > r.y);
      return { ...r, h: kids.length ? Math.max(HEAD, Math.min(...kids.map((b) => b.y)) - r.y - 2) : Math.min(r.h, HEAD) };
    });
    cardsAt.set(k, hit); return hit;
  };
  const out = items.slice();
  // the stage's tag chips (a box chip with no line's words): drawn on the strip above a card
  const tags = (k: number): R[] => out.flatMap((t) => (t.k === "box" && /(^|\s)stg-chip(\s|$)/.test(t.cls ?? "") && (t as { bar?: Record<string, unknown> }).bar?.["edge-label"] === undefined && shownAt(t, k) ? [t as R] : []));
  const chipBoxes = () => out.flatMap((it, i) => (it.k === "box" && /(^|\s)stg-chip(\s|$)/.test(it.cls ?? "") ? [{ i, it }] : []));
  // a chip the stage left off the stage (gt 05's second "198.51.100.20", under it) takes its place first: the room by its
  // line is its own before a chip over a title takes it
  const off = (it: Item) => it.k === "box" && (it.y < 0 || it.y + it.h > height - 1);
  for (const { i, it } of chipBoxes().sort((a, b) => Number(off(b.it)) - Number(off(a.it)))) {
    if (it.k !== "box") continue;
    const label = (it as { bar?: Record<string, unknown> }).bar?.["edge-label"]; if (label === undefined) continue;
    const S = steps(it); if (!S.length) continue;
    const own = new Set<number>(); for (let j = i + 1; j < out.length && out[j].k === "text" && (out[j] as { f?: string }).f === "chip"; j++) own.add(j); // its words
    const box: R = { x: it.x, y: it.y, w: it.w, h: it.h };
    const covered = S.flatMap((k) => cards(k).filter((c) => meets(box, c)));
    const below = box.y + box.h > height - 1 || box.y < 0; // under (or over) the stage: cut off
    // a card's tag (its state chip on the strip above it: gt 05's "300 s") is covered as a title is
    const tagged = S.flatMap((k) => tags(k).filter((c) => meets(box, c)));
    // the stage's own words shown in its steps (lane headings, notes, a line's tone words): a moved chip covers none
    const words = (k: number): R[] => out.flatMap((t, j) => {
      if (t.k !== "text" || own.has(j) || !shownAt(t, k) || !t.s) return [];
      const tw = measure(t.s, t.f), x = t.anchor === "middle" ? t.x - tw / 2 : t.anchor === "end" ? t.x - tw : t.x;
      return [{ x: x - 2, y: t.y - 13, w: tw + 4, h: 17 }];
    });
    const others = (k: number) => chipBoxes().filter((o) => o.i !== i && o.it.k === "box" && shownAt(o.it, k)).map((o) => o.it as R);
    // render2 (page2's review, 390): a chip on another line's chip ("redirect to /authorize" on "click Sign in") or on the
    // stage's words (gt 05's "198.51.100.20" on the lane word "Resolver") moves as one on a title does
    const onChip = S.some((k) => others(k).some((c) => meets(box, c))), onWords = S.some((k) => words(k).some((c) => meets(box, c)));
    const lines = out.filter((p): p is Extract<Item, { k: "path" }> => p.k === "path" && isWire(p) && S.some((k) => shownAt(p, k)));
    // render2 (page2's review at 390): its own line is the connector that comes in the step it does, the nearest; a chip far
    // from it (gt 03's GET in the browser's column, gt 10's callback on the provider-bank lines) or that another line runs
    // through moves onto its own line
    // (else the line the step's own words are on: `p -> sb: callback ...` names it, the stage's wire is "p>sb")
    const said = (model.steps[((it as { from?: number }).from ?? 0) - 1]?.facts ?? []).flatMap((x) => (x.k === "rel" && x.words === label && model.relations[x.rel] ? [model.relations[x.rel]] : [])); // every line the step says these words on (gt 05 says one answer twice)
    const byWords = lines.filter((p) => said.some((r) => (p as { id?: string }).id === `${r.from}>${r.to}` || (p as { id?: string }).id === `${r.to}>${r.from}`));
    const ownLine = (byWords.length ? byWords : lines.filter((p) => (p as { from?: number }).from === (it as { from?: number }).from)).sort((a, b) => segDist(a.pts, box.x + box.w / 2, box.y + box.h / 2) - segDist(b.pts, box.x + box.w / 2, box.y + box.h / 2))[0];
    const crossedBy = (r: R) => S.some((k) => lines.some((p) => p !== ownLine && shownAt(p, k) && through(p.pts, r)));
    const far = !!ownLine && segDist(ownLine.pts, box.x + box.w / 2, box.y + box.h / 2) > 36;
    if (!covered.length && !below && !tagged.length && !onChip && !onWords && !far && !crossedBy(box)) continue;
    // its line: its own, else a connector shown in its steps with an end at a card it covers, the nearest to it
    const near = (pt: [number, number], c: R) => pt[0] >= c.x - 8 && pt[0] <= c.x + c.w + 8 && pt[1] >= c.y - 8 && pt[1] <= c.y + c.h + 8 + 40;
    const mid = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const dist = (p: Extract<Item, { k: "path" }>) => Math.min(...p.pts.map(([x, y]) => Math.hypot(x - mid.x, y - mid.y)));
    const nearest = (covered.length ? lines.filter((p) => covered.some((c) => near(p.pts[0], c) || near(p.pts[p.pts.length - 1], c))) : lines).sort((a, b) => dist(a) - dist(b))[0];
    const mine = ownLine ?? nearest;
    if (!mine) continue;
    // its own line first, then (no room by it: a short line boxed in) the nearest line, as before
    const tryLines = [...new Set([ownLine, nearest].filter((p): p is Extract<Item, { k: "path" }> => !!p))];
    const alongOn = (ln: Extract<Item, { k: "path" }>, f: number): [number, number] => { const mine = ln; const len = mine.pts.slice(1).reduce((a, q, j) => a + Math.hypot(q[0] - mine.pts[j][0], q[1] - mine.pts[j][1]), 0);
      let d = len * f;
      for (let j = 1; j < mine.pts.length; j++) {
        const [x0, y0] = mine.pts[j - 1], [x1, y1] = mine.pts[j], sl = Math.hypot(x1 - x0, y1 - y0);
        if (d <= sl || j === mine.pts.length - 1) { const u = sl ? Math.min(1, d / sl) : 0; return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]; }
        d -= sl;
      }
      return mine.pts[0];
    };
    let strict = true; // render2: first where no other line runs through it, then (none) anywhere else free
    const free = (r: R) => r.x >= PAD - 0.5 && r.x + r.w <= width - PAD + 0.5 && r.y >= 2 && r.y + r.h <= height - 1 && S.every((k) => !cards(k).some((c) => meets(r, c)) && !others(k).some((c) => meets(r, c)) && !words(k).some((c) => meets(r, c))) && (!strict || !crossedBy(r));
    let spot: R | null = null;
    // a chip moved only because a line runs through it takes no place another line runs through
    const must = covered.length > 0 || below || tagged.length > 0 || onChip || onWords || far;
    for (const ln of tryLines) { if (spot) break;
    for (const pass of must ? [true, false] : [true]) { strict = pass; if (spot) break;
    for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
      const [x, y] = alongOn(ln, f);
      // over or under the line, then (render2: a phone's vertical lines) beside it, then a little further off
      const spots: [number, number][] = [[x - box.w / 2, y - CH - 4], [x - box.w / 2, y + 4], [x - box.w / 2, y - CH - 16], [x - box.w / 2, y + 16],
        [x + 6, y - CH / 2], [x - box.w - 6, y - CH / 2], [x - box.w / 2, y - CH - 28], [x - box.w / 2, y + 28]];
      for (const [sx, top] of spots) {
        const r = { x: Math.max(PAD, Math.min(width - PAD - box.w, sx)), y: top, w: box.w, h: box.h };
        if (free(r)) { spot = r; break; }
      }
      if (spot) break;
    }
    }
    // no room on its line (a gap narrower than the words): just over the card it covered, then just under it, near the line's end
    if (!spot) {
      const end = mine.pts[mine.pts.length - 1];
      for (const c of covered) for (const top of [c.y - CH - 4, c.y + c.h + 4]) for (const x of [end[0], c.x + c.w / 2, c.x + box.w / 2 + 6, c.x + c.w - box.w / 2 - 6]) {
        const r = { x: Math.max(PAD, Math.min(width - PAD - box.w, x - box.w / 2)), y: top, w: box.w, h: box.h };
        if (!spot && free(r)) spot = r;
      }
    }
    // a chip on a tag: beside the tag on its strip, else just over it; a chip off the stage: slid back onto it, where it was
    if (!spot) for (const t of tagged) for (const [x, y] of [[t.x - box.w - 6, t.y], [t.x + t.w + 6, t.y], [t.x + t.w / 2 - box.w / 2, t.y - CH - 4]]) {
      const r = { x: Math.max(PAD, Math.min(width - PAD - box.w, x)), y, w: box.w, h: box.h };
      if (!spot && free(r)) spot = r;
    }
    // render2: a chip on another chip with no room by its line (a line a few px long between two cards: gt 03 at 390): just
    // under the other chip, else over it, else beside it on its row
    if (!spot && onChip) for (const o of S.flatMap((k) => others(k).filter((c) => meets(box, c)))) for (const [x, y] of [[box.x, o.y + o.h + 2], [o.x, o.y + o.h + 2], [box.x, o.y - box.h - 2], [o.x + o.w + 4, o.y], [o.x - box.w - 4, o.y]]) {
      const r = { x: Math.max(PAD, Math.min(width - PAD - box.w, x)), y, w: box.w, h: box.h };
      if (!spot && free(r)) spot = r;
    }
    if (!spot && below) for (const dx of [0, -box.w / 2, box.w / 2, -box.w, box.w]) {
      const r = { x: Math.max(PAD, Math.min(width - PAD - box.w, box.x + dx)), y: Math.max(2, Math.min(height - 1 - box.h, box.y)), w: box.w, h: box.h };
      if (!spot && free(r)) spot = r;
    }
    }
    if (!spot) continue;
    const dx = spot.x - box.x, dy = spot.y - box.y;
    out[i] = { ...it, x: it.x + dx, y: it.y + dy };
    // its words: the chip texts right after its box
    for (let j = i + 1; j < out.length; j++) { const t = out[j]; if (t.k !== "text" || t.f !== "chip") break; out[j] = { ...t, x: t.x + dx, y: t.y + dy }; }
  }
  return out;
}
