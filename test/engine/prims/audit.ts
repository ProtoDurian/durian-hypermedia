// Lane prims: a headless audit of how things are drawn (no browser): every fixture fence is compiled, every step's frame
// is walked, and the words are checked against the rect the layout gave their thing and against each other.
// Usage: bun test/engine/prims/audit.ts [--list] [glob words...]   (no words: the lane's fixtures)
import { allFixtureFences } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { LINE_H, measure, setPhoneFont } from "../../../src/core/stage-core";
import type { Prim, Rect } from "../../../src/engine/types";

export interface Hit { check: string; step: number; id: string; what: string }
const FONT_PX: Record<string, number> = { title: 13.5, body: 12.5, sub: 12, lane: 12.5, chip: 11.5, big: 21, mono: 12, "small-b": 11.5 };
const PHONE_PX: Record<string, number> = { title: 12.5, body: 11.5, sub: 11, chip: 11 };

/** the box a text prim occupies on the page (x range, y range) */
export function textBox(p: Extract<Prim, { k: "text" }>, phone: boolean): Rect {
  setPhoneFont(phone);
  const w = Math.max(0, ...p.lines.map((l) => measure(l, p.font))) * (p.font === "title" || p.font === "lane" ? 0.93 : 1); // the measure of medium type runs ~8% wide (fit.ts)
  const x = p.anchor === "start" ? p.x : p.anchor === "end" ? p.x - w : p.x - w / 2;
  const lh = LINE_H[p.font] ?? 16, px = (phone ? PHONE_PX[p.font] : undefined) ?? FONT_PX[p.font] ?? 12;
  return { x, y: p.y - px * 0.85, w, h: (p.lines.length - 1) * lh + px * 1.05 };
}
const hit = (a: Rect, b: Rect, dx = 0, dy = 0) => a.x + dx < b.x + b.w && b.x + dx < a.x + a.w && a.y + dy < b.y + b.h && b.y + dy < a.y + a.h;

export function auditFence(src: Parameters<typeof compile>[0], widths = [1280, 390]) {
  const out: Record<number, Hit[]> = {};
  const c = compile(src);
  for (const width of widths) {
    const plan = c.plan(width), phone = width < 480, hits: Hit[] = [];
    for (let step = 0; step < c.states.length; step++) {
      const frame = plan.frame(step), rects = plan.rects(step);
      const texts = frame.filter((p): p is Extract<Prim, { k: "text" }> => p.k === "text" && !p.cls?.includes("eng-words-own"));
      const boxes = texts.map((p) => ({ p, b: textBox(p, phone) }));
      for (const { p, b } of boxes) {
        const px = (phone ? PHONE_PX[p.font] : undefined) ?? FONT_PX[p.font] ?? 12;
        if (px < 11) hits.push({ check: "small", step, id: p.key, what: `${px}px` });
        if (p.lines.some((l) => l.endsWith("…"))) hits.push({ check: "ellipsis", step, id: p.key, what: p.lines.join(" / ") });
        const r = p.id ? rects[p.id] : undefined;
        if (r && !p.key.endsWith(":say") && (b.x < r.x - 1 || b.x + b.w > r.x + r.w + 1 || b.y + b.h > r.y + r.h + 3 || b.y < r.y - 3)) hits.push({ check: "outside", step, id: p.key, what: `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)} in ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}` });
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (hit(boxes[i].b, boxes[j].b, -3, -2) && hit(boxes[i].b, boxes[j].b, 3, 2)) hits.push({ check: "overlap", step, id: `${boxes[i].p.key} x ${boxes[j].p.key}`, what: `${boxes[i].p.lines[0]} | ${boxes[j].p.lines[0]}` });
      // chips (state chips, tokens) over words
      const chips = frame.filter((p): p is Extract<Prim, { k: "chip" }> => p.k === "chip");
      for (const ch of chips) {
        const cb: Rect = { x: ch.x, y: ch.y, w: Math.ceil(measure(ch.words, "chip")) + 14, h: 18 };
        for (const { p, b } of boxes) if (p.id !== ch.id && hit(cb, b, -2, -2) && hit(cb, b, 2, 2)) hits.push({ check: "chip-over-words", step, id: `${ch.key} x ${p.key}`, what: `${ch.words} | ${p.lines[0]}` });
      }
    }
    out[width] = hits;
  }
  return out;
}

if (import.meta.main) {
  const args = process.argv.slice(2), list = args.includes("--list"), words = args.filter((a) => !a.startsWith("--"));
  const want = words.length ? words : ["format/47-", "format/48-", "format/49-", "format/50-", "format/51-", "format/52-", "format/53-", "format/54-", "format/55-", "format/55a-", "format/56-", "format/57-", "format/58-", "format/59-", "format/60-", "format/61-", "format/66-", "format/93-", "format/94-", "format/95-", "stage/01-", "stage/15-", "stage/16-", "stage/17-", "stage/18-", "stage/19-"];
  const tot: Record<string, Record<number, number>> = {};
  for (const f of allFixtureFences()) {
    if (!want.some((w) => f.id.includes(w))) continue;
    let r; try { r = auditFence(f.src); } catch (e) { console.log(`${f.id}: ERROR ${(e as Error).message}`); continue; }
    const row: string[] = [];
    for (const w of [1280, 390]) {
      const by: Record<string, number> = {}; for (const h of r[w]) by[h.check] = (by[h.check] ?? 0) + 1;
      for (const [k, n] of Object.entries(by)) { (tot[k] ??= {})[w] = ((tot[k] ??= {})[w] ?? 0) + n; }
      row.push(`${w}: ${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(", ") || "clean"}`);
    }
    console.log(`${f.id}  ${row.join("  |  ")}`);
    if (list) for (const w of [1280, 390]) for (const h of r[w]) console.log(`   ${w} s${h.step} ${h.check} ${h.id} :: ${h.what}`);
  }
  console.log("TOTAL", JSON.stringify(tot));
}
