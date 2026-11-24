// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// (rc.3): an upright line never runs through a
// connector's chip shown with it where the chip's row has a free place; the chip slides along its row, 6 px or more
// clear of every upright. Stacked form at 480 px and wider only (on a phone the row's room is the "and more" words').
import { expect, test } from "bun:test";
import { compileStage, layoutStage, STAGE_WORK, STAGE_MEMORY } from "../../src/core/stage";
import { beginDocument, newBudget } from "../../src/core/stage-budget";
import type { Item } from "../../src/core/stage-core";

const SRC = `## Readers
job r1..r6: reader-north-wing-desk; reader-south-wing-desk; reader-east-wing-desk; reader-west-wing-desk; reader-main-hall-desk; reader-garden-room-desk | asks for a book
... about 900 readers a day
## Packers
job k0,k1,k2: packer zero; packer one; packer two | packs the boxes
  + (a) left bench; (b) right bench
... 12 benches, 24 packers
## Checkers
job c0,c1: checker zero; checker one | checks the boxes, then sends them on
  + (a) first look; (b) second look
## Shelf
store s: Shelf | holds the books | in the back room
job o under Packers..Checkers: Desk lead | writes the rota
@step One: The readers.
show r*
@step Two: The packers.
show k*
k0 --> r1,r4
k1 --> r2,r6
k2 --> r3,r5
@step Three: The checkers.
show c*
k0,k1,k2 --> c0,c1: boxes
@step Four: The shelf.
show s
c0,c1 --> s (store): stacks (ten a box)
show o
o --> k2,c1 x2: the rota, read
@step Five: Later.
`;
const lay = (w: number) => {
  const parts = SRC.split(/^@step /m), steps = parts.slice(1).map((s, i) => { const nl = s.indexOf("\n"); return { title: s.slice(0, nl), raw: s.slice(nl + 1), line: i + 1 }; });
  beginDocument(newBudget(STAGE_WORK, STAGE_MEMORY)); const c = compileStage(parts[0], steps, 1, {}, { job: 4, store: 3 }); expect(c.errors).toEqual([]);
  beginDocument(newBudget(STAGE_WORK, STAGE_MEMORY)); return layoutStage(c.model, w);
};
type Box = Extract<Item, { k: "box" }>; type Path = Extract<Item, { k: "path" }>;
const shown = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));

for (const w of [800, 766]) test(`at ${w}: no upright runs through or within 6 px of the shelf line's chip; the chip keeps its row`, () => {
  const p = lay(w), c = p.items.find((it): it is Box => it.k === "box" && it.bar?.["edge-label"] === "stacks (ten a box)")!;
  expect(c).toBeTruthy();
  const hits = p.items.filter((it): it is Path => it.k === "path" && [4, 5].some((k) => shown(it, k) && shown(c, k)) && it.pts.slice(1).some((q, i) => {
    const a = it.pts[i]; return Math.abs(a[0] - q[0]) < 1 && a[0] > c.x - 6 && a[0] < c.x + c.w + 6 && Math.max(a[1], q[1]) > c.y + 1 && Math.min(a[1], q[1]) < c.y + c.h - 1; })).map((q) => q.id);
  expect(hits).toEqual([]);
  const s = p.items.find((it): it is Box => it.k === "box" && (it as { id?: string }).id === "s")!; expect(c.y + c.h).toBeLessThanOrEqual(s.y); // still in the gap over the shelf
});
