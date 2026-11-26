// render2: a line's words never cover a card's title (lanes/chips.ts). The page review: chips over the titles in the
// refund (gt 10), DNS (gt 05), TCP (gt 02, the ACK) and OAuth (gt 03, the GET) scenes.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { layStage } from "../../../src/engine/layouts/lanes";
import { chipsOffTitles } from "../../../src/engine/layouts/lanes/chips";
import { idOfBox, isWire, shownAt } from "../../../src/engine/layouts/lanes/items";
import { atSizes } from "../../../src/engine/render/font";
import { migrate } from "../../../src/engine/parse/migrate";
import { measure } from "../../../src/core/stage-core";
import type { Item } from "../../../src/core/stage-core";
import type { Model, Prim } from "../../../src/engine/types";

type R = { x: number; y: number; w: number; h: number };
const meets = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** line-word chips that cover a card (a card that holds others: its heading, down to the first card it holds), per step */
function covering(items: Item[], model: Model, last: number): string[] {
  const holders = new Set(Object.values(model.things).flatMap((t) => (t.parent ? [t.parent] : [])));
  const out: string[] = [];
  for (let k = 1; k <= last; k++) {
    const boxes = items.filter((it): it is Extract<Item, { k: "box" }> => it.k === "box" && !!it.id && shownAt(it, k) && !/stg-(chip|pill)/.test(it.cls ?? "") && !!model.things[idOfBox(it.id)!]);
    const cards = boxes.map((b) => {
      const id = idOfBox(b.id)!; if (!holders.has(id)) return b;
      const kids = boxes.filter((c) => model.things[idOfBox(c.id)!]?.parent === id && c.y > b.y);
      return { ...b, h: kids.length ? Math.max(28, Math.min(...kids.map((c) => c.y)) - b.y - 2) : Math.min(b.h, 28) };
    });
    for (const it of items) {
      const label = it.k === "box" ? (it as { bar?: Record<string, unknown> }).bar?.["edge-label"] : undefined;
      if (label !== undefined && shownAt(it, k) && cards.some((c) => meets(it as R, c))) out.push(`step ${k}: ${label}`);
    }
  }
  return out;
}

const SCENES = ["fixtures/gt/02-tcp-handshake.dh.md", "fixtures/gt/03-oauth-login.dh.md", "fixtures/gt/05-dns-lookup.dh.md", "fixtures/gt/10-payment-refund.dh.md", "fixtures/gt/11-cache-stampede.dh.md", "fixtures/stage/01-animation-a-composed-stage.dh.md"];
describe("a line's words cover no card's title", () => {
  for (const file of SCENES) test(file, () => {
    const c = compile(fencesOf(join(ROOT, file), readFileSync(join(ROOT, file), "utf8"), file)[0].src);
    const last = Math.max(1, c.states.length - 1);
    let before = 0;
    // the stage widths a 1280 page and a 390 phone give a part (ui/stage.tsx SSR_W)
    for (const w of [1178, 800, 730, 356, 341]) atSizes(w < 480, () => {
      const laid = layStage(c.model, w, () => {});
      before += covering(laid.items, c.model, last).length;
      const after = chipsOffTitles(laid.items, c.model, last, laid.w, laid.h);
      expect(covering(after, c.model, last)).toEqual([]);
      // a moved chip stays on the stage (the stage's own places are its own) and keeps its words with it
      after.forEach((it, i) => { if (it !== laid.items[i] && it.k === "box" && /stg-chip/.test(it.cls ?? "")) { expect(it.x).toBeGreaterThanOrEqual(0); expect(it.x + it.w).toBeLessThanOrEqual(laid.w + 0.5); expect(it.y + it.h).toBeLessThanOrEqual(laid.h); } });
      after.forEach((it, i) => { if (it.k === "box" && /stg-chip/.test(it.cls ?? "") && after[i + 1]?.k === "text") { const t = after[i + 1] as Extract<Item, { k: "text" }>; expect(Math.abs(t.x - (it.x + it.w / 2))).toBeLessThan(1); } });
    });
    if (file !== "fixtures/gt/11-cache-stampede.dh.md") expect(before).toBeGreaterThan(0); // the stage's own place did cover a title
  });
});

// render2 (fmt12's review): gt 05 step 7, the "198.51.100.20" chip sat on the "300 s" tag over the card, and the stage put
// the second one under the stage (cut off). As drawn, in both forms: every line's words chip is on the stage and on no tag.
describe("a line's words sit on the stage and on no tag", () => {
  const meetsTag = (r: R, t: { x: number; y: number; words: string }) => meets(r, { x: t.x, y: t.y, w: measure(t.words, "chip") + 18, h: 18 });
  for (const file of SCENES) test(file, () => {
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const src of [fencesOf(join(ROOT, file), text, "old")[0].src, fencesOf(join(ROOT, file), migrate(text), "new")[0].src]) {
      const c = compile(src);
      for (const w of [1178, 800, 356, 341]) atSizes(w < 480, () => {
        const p = c.plan(w);
        for (let k = 1; k < c.states.length; k++) {
          const f = p.frame(k), tags = f.filter((q): q is Extract<Prim, { k: "chip" }> => q.k === "chip");
          for (const q of f) if (q.k === "rect" && /stg-chip/.test(q.cls ?? "")) {
            expect([q.rect.x >= -0.5, q.rect.y >= -0.5, q.rect.x + q.rect.w <= p.w + 0.5, q.rect.y + q.rect.h <= p.h + 0.5]).toEqual([true, true, true, true]);
            expect(tags.filter((t) => meetsTag(q.rect, t)).map((t) => `step ${k}: ${t.words}`)).toEqual([]);
          }
        }
      });
    }
  });
});

// render2 (page2's review at 390): "redirect to /authorize" lay on "click Sign in" (gt 03), "198.51.100.20" on the lane
// word "Resolver" (gt 05). A line's words chip covers no other chip and no word of the stage in its steps.
describe("a line's words cover no other chip and no stage words", () => {
  for (const file of SCENES) test(file, () => {
    const c = compile(fencesOf(join(ROOT, file), readFileSync(join(ROOT, file), "utf8"), file)[0].src);
    const last = Math.max(1, c.states.length - 1), bad: string[] = [];
    for (const w of [1178, 800, 356, 341]) atSizes(w < 480, () => {
      const laid = layStage(c.model, w, () => {}), after = chipsOffTitles(laid.items, c.model, last, laid.w, laid.h);
      const chips = after.flatMap((it, i) => (it.k === "box" && /stg-chip/.test(it.cls ?? "") ? [{ i, it }] : []));
      for (const { i, it } of chips) {
        const label = (it as { bar?: Record<string, unknown> }).bar?.["edge-label"]; if (label === undefined) continue;
        const own = new Set<number>(); for (let j = i + 1; j < after.length && after[j].k === "text" && (after[j] as { f?: string }).f === "chip"; j++) own.add(j);
        for (let k = 1; k <= last; k++) {
          if (!shownAt(it, k)) continue;
          for (const o of chips) if (o.i !== i && shownAt(o.it, k) && meets(it as R, o.it as R)) bad.push(`${w} step ${k}: ${label} on a chip`);
          after.forEach((t, j) => { if (t.k !== "text" || own.has(j) || !shownAt(t, k) || !t.s || t.f === "chip") return; const tw = measure(t.s, t.f), x = t.anchor === "middle" ? t.x - tw / 2 : t.anchor === "end" ? t.x - tw : t.x; if (meets(it as R, { x, y: t.y - 11, w: tw, h: 13 })) bad.push(`${w} step ${k}: ${label} on "${t.s}"`); });
        }
      }
    });
    expect(bad).toEqual([]);
  });
});

// render2 (page2's review at 390): "GET /photos + token" (gt 03) sat in the browser's column, "callback refund.succeeded"
// (gt 10) on the provider-bank lines: a chip sits by its own line (the connector that comes in its step)
describe("a line's words sit by their own line", () => {
  const segDist = (pts: [number, number][], x: number, y: number) => { let d = Infinity; for (let j = 1; j < pts.length; j++) { const [x0, y0] = pts[j - 1], [x1, y1] = pts[j], dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy, u = L ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L)) : 0; d = Math.min(d, Math.hypot(x - x0 - u * dx, y - y0 - u * dy)); } return d; };
  for (const [file, label] of [["fixtures/gt/03-oauth-login.dh.md", "GET /photos + token"], ["fixtures/gt/10-payment-refund.dh.md", "callback refund.succeeded"]]) test(`${file}: ${label}`, () => {
    const c = compile(fencesOf(join(ROOT, file), readFileSync(join(ROOT, file), "utf8"), file)[0].src), last = Math.max(1, c.states.length - 1);
    for (const w of [1178, 356, 341]) atSizes(w < 480, () => {
      const laid = layStage(c.model, w, () => {}), after = chipsOffTitles(laid.items, c.model, last, laid.w, laid.h);
      const chip = after.find((it) => it.k === "box" && (it as { bar?: Record<string, unknown> }).bar?.["edge-label"] === label) as Extract<Item, { k: "box" }>;
      const from = (chip as { from?: number }).from;
      const rel = Object.values(c.model.relations).find((r) => c.model.steps[(from ?? 1) - 1]?.facts.some((x) => x.k === "rel" && x.rel === r.id && x.words === label));
      const lines = after.filter((p): p is Extract<Item, { k: "path" }> => p.k === "path" && isWire(p) && (rel ? [`${rel.from}>${rel.to}`, `${rel.to}>${rel.from}`].includes((p as { id?: string }).id ?? "") : (p as { from?: number }).from === from));
      const d = Math.min(...lines.map((p) => segDist(p.pts, chip.x + chip.w / 2, chip.y + chip.h / 2)));
      expect(d).toBeLessThanOrEqual(40); // by it: just under the two cards it joins when the line is shorter than its words
    });
  });
});
