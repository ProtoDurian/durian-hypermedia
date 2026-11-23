// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// where the step panels go ("panels" in the setup), panels side by side ("beside" in a step), and room for
// the label of a connector between two stacked cards of one lane.
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage } from "../../src/core/stage";
import { measure, type Item } from "../../src/core/stage-core";
import { beginDocument } from "../../src/core/stage-budget";
beforeEach(() => beginDocument());
const roles = { job: 1, server: 2 };
const panel = (k: number) => `list Left ${k}\n  one: 1\n  two: 2\nlist Right ${k}\n  three: 3`;
const steps = (side: string) => [1, 2].map((k) => ({ title: `Step ${k}`, raw: `${side}${panel(k)}`, line: 10 * k }));
const head = "track: job plan, build | server ship\npanels\ntime: 0..10 | seconds\nrow job r \"run\": +go 0..10";
const textAt = (items: Item[], s: string) => items.find((i) => i.k === "text" && i.s === s) as Extract<Item, { k: "text" }> | undefined;
const boxes = (items: Item[]) => items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box");

test("'panels' puts the step panels between head blocks: under the track, over the time rows", () => {
  const c = compileStage(head, steps(""), 1, {}, roles); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), left = textAt(p.items, "Left 1")!, run = textAt(p.items, "run")!, phase = textAt(p.items, "plan")!;
  expect(phase.y).toBeLessThan(left.y); expect(left.y).toBeLessThan(run.y);
  const d = compileStage(head.replace("panels\n", ""), steps(""), 1, {}, roles), q = layoutStage(d.model, 1000);
  expect(textAt(q.items, "Left 1")!.y).toBeGreaterThan(textAt(q.items, "run")!.y); // default: after the head blocks
  expect(p.h).toBe(q.h);
});
test("'beside 1, 2' lays a step's panels side by side by shares; a phone stacks them", () => {
  const c = compileStage(head, steps("beside 1, 2\n"), 1, {}, roles); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), l = textAt(p.items, "Left 1")!, r = textAt(p.items, "Right 1")!;
  expect(Math.abs(l.y - r.y)).toBeLessThan(1); expect(r.x).toBeGreaterThan(l.x + 250);
  const frames = boxes(p.items).filter((b) => b.from === 1 && b.cls === "scn-frame");
  if (frames.length === 2) expect(frames[1].w / frames[0].w).toBeCloseTo(2, 0);
  for (const it of p.items) if (it.k === "box") expect(it.x + it.w).toBeLessThanOrEqual(1000);
  const n = layoutStage(c.model, 340), ln = textAt(n.items, "Left 1")!, rn = textAt(n.items, "Right 1")!;
  expect(rn.y).toBeGreaterThan(ln.y);
  const flat = layoutStage(compileStage(head, steps(""), 1, {}, roles).model, 1000);
  expect(p.h).toBeLessThan(flat.h); // side by side is shorter than stacked
});
test("refuses a bad share and a second 'panels'", () => {
  for (const bad of ["beside 0\n", "beside 1, x\n", "beside 10\n"]) expect(compileStage(head, steps(bad), 1, {}, roles).errors.some((e) => e.msg.includes("side by side"))).toBe(true);
  expect(compileStage(head + "\npanels", steps(""), 1, {}, roles).errors.some((e) => e.msg.includes("once"))).toBe(true);
});
test("a lone beside panel preserves its empty peer slot, with the next time inset there",()=>{
 const head='panels\ntime: 0..12 | overview\nzoom: 8..12 | enlarged\nzoom row job detail "Detail": +working 8..12\nrow job a "Run": +working 0..12';
 const ss=[{title:'Start',raw:'',line:10},{title:'Work',raw:'beside 1, 1\nlist Calculation\n  first: 1\n  second: 2',line:12},{title:'Done',raw:'beside 1, 1\nlist Result\n  first: 3',line:18}];
 const c=compileStage(head,ss,1,{},roles);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){
  const p=layoutStage(c.model,w),title=textAt(p.items,'Calculation')!,zoom=textAt(p.items,'enlarged (8..12)')!,overview=textAt(p.items,'overview')!;
  const panels=boxes(p.items).filter(i=>i.cls==='stg-region'&&i.from===2);
  expect(panels.length).toBe(1);
  if(w===1000){expect(panels[0].w).toBeLessThan(500);expect(panels[0].w).toBeGreaterThan(400);expect(Math.abs(title.y-zoom.y)).toBeLessThan(40);expect(zoom.x).toBeGreaterThan(panels[0].x+panels[0].w);}
  else {expect(zoom.y).toBeGreaterThan(title.y);expect(panels[0].w).toBeGreaterThan(280);}
  expect(overview.y).toBeGreaterThan(zoom.y);expect(overview.y).toBeGreaterThan(title.y);
  expect(zoom.from??1).toBe(1);expect(overview.from??1).toBe(1); // kept geometry, even before a step panel appears
  expect(p.items.filter(i=>i.k==='text'&&i.s==='enlarged (8..12)').length).toBe(1);
 }
 const noZoom=compileStage('panels',ss,1,{},roles);expect(noZoom.errors).toEqual([]);const p=layoutStage(noZoom.model,1000);
 expect(boxes(p.items).find(i=>i.cls==='stg-region'&&i.from===2)!.w).toBeLessThan(500);
 const below=compileStage(head.replace('zoom: 8..12 | enlarged','zoom: 8..12 | enlarged | below'),ss,1,{},roles);expect(below.errors).toEqual([]);
 const b=layoutStage(below.model,1000);expect(textAt(b.items,'enlarged (8..12)')!.y).toBeGreaterThan(textAt(b.items,'overview')!.y);
});
test("a labelled connector between stacked cards of one lane gets room, its label beside the line and on no card", () => {
  const h = "## A\njob a: first card | a line\nserver b: second card | a line";
  const ss = [{ title: "Ask", raw: "b -> a: GET /status", line: 10 }, { title: "Done", raw: "", line: 12 }];
  const c = compileStage(h, ss, 1, {}, roles); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), card = (id: string) => boxes(p.items).find((b) => b.id === id)!;
  const a = card("a"), b = card("b"), gap = b.y - (a.y + a.h);
  const plain = layoutStage(compileStage(h, [{ title: "Ask", raw: "b -> a", line: 10 }, { title: "Done", raw: "", line: 12 }], 1, {}, roles).model, 1000);
  const pa = boxes(plain.items).find((x) => x.id === "a")!, pb = boxes(plain.items).find((x) => x.id === "b")!;
  expect(gap).toBeGreaterThanOrEqual(pb.y - (pa.y + pa.h) + 28);
  const label = textAt(p.items, "GET /status")!, line = p.items.find((i) => i.k === "path" && i.id === "b>a") as Extract<Item, { k: "path" }>;
  expect(line.pts.length).toBe(2); expect(Math.abs(line.pts[0][0] - line.pts[1][0])).toBeLessThan(1);
  const lw = measure("GET /status", "chip"), lx = label.anchor === "middle" ? label.x - lw / 2 : label.x;
  expect(lx).toBeGreaterThan(line.pts[0][0]);
  for (const r of [a, b]) expect(label.y - 10 > r.y + r.h || label.y < r.y).toBe(true);
});
test("the frames of a 'beside' row grow to the panel region's height: side by side, one height", () => {
  const cards = (k: number, n: number) => `card job: left ${k}\n${Array.from({ length: n }, (_, i) => `  line ${i}`).join("\n")}\ncard server: right ${k}\n  one line`;
  const ss = [{ title: "One", raw: `beside\n${cards(1, 2)}`, line: 10 }, { title: "Two", raw: `beside\n${cards(2, 8)}`, line: 20 }];
  const c = compileStage(head, ss, 1, {}, roles); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), frames = (k: number) => boxes(p.items).filter((b) => b.from === k && b.to === k && b.cls === "scn-frame");
  const one = frames(1), two = frames(2);
  expect(one.length).toBe(2); expect(two.length).toBe(2);
  const tallest = Math.max(...two.map((b) => b.h));
  for (const b of [...one, ...two]) expect(Math.abs(b.h - tallest)).toBeLessThan(1);
});
test("a card panel is a card when it stands beside another panel (a full-width one alone stays a region)", () => {
  const ss = (side: string) => [1, 2].map((k) => ({ title: `S${k}`, raw: `${side}card job: left ${k}\n  a line\ncard server: right ${k}\n  a line`, line: 10 * k }));
  const kinds = (side: string) => boxes(layoutStage(compileStage(head, ss(side), 1, {}, roles).model, 1000).items).filter((b) => b.cls === "scn-frame" && b.from === 1 && b.to === 1).map((b) => b.bar?.kind);
  expect(kinds("beside\n")).toEqual(["card", "card"]);
  expect(kinds("")).toEqual(["panel", "panel"]);
});
test("a card panel beside another retains its labelled layout region without a second semantic item", () => {
  const ss = [1, 2].map((k) => ({ title: `S${k}`, raw: `beside\ncard job: left ${k}\n  a line\ncard server: right ${k}\n  a line`, line: 10 * k }));
  const items = boxes(layoutStage(compileStage(head, ss, 1, {}, roles).model, 1000).items).filter((b) => b.from === 1 && b.to === 1);
  const named = (label: string) => items.filter((b) => !b.bar?.ignore && b.bar?.label === label).map((b) => b.bar?.kind);
  expect(named("left 1")).toEqual(["card"]); expect(named("right 1")).toEqual(["card"]);
  expect(items.filter((b) => b.cls === "stg-region" && b.bar?.ignore === 1).map(b=>[b.bar?.kind,b.bar?.label])).toEqual([["panel","left 1"],["panel","right 1"]]); // the layout regions stay; the painted cards own their identities
});
test("a step's note under its panels keeps clear of a head block placed after them (the time block's caption)", () => {
  const s = [1, 2].map((k) => ({ title: `Step ${k}`, raw: `${panel(k)}\nbeside 1, 1\nnote: a note that sits under this step's panels, ${k}`, line: 10 * k }));
  const c = compileStage(head, s, 1, {}, roles); expect(c.errors).toEqual([]);
  for (const w of [1000, 340]) {
    const p = layoutStage(c.model, w), caption = textAt(p.items, "seconds")!;
    const strips = boxes(p.items).filter((b) => b.cls === "stg-note-strip");
    expect(strips.length).toBe(2);
    for (const b of strips) expect(b.y + b.h).toBeLessThan(caption.y - 11); // the strip ends above the caption's top
  }
});
test("a list key longer than its column wraps inside it: never into its value; the row grows to the taller side", () => {
  const key = "so this key runs on for many more words than its column";
  const s = [1, 2].map((k) => ({ title: `Step ${k}`, raw: `list Half ${k}\n  short: v\n  ${key}: the value ${k}\nlist Other ${k}\n  x: y\nbeside 1, 1`, line: 10 * k }));
  const c = compileStage(head, s, 1, {}, roles); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), value = textAt(p.items, "the value 1")!;
  const keyLines = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && i.f === "small-b" && i.from === 1 && key.includes(i.s) && i.s !== "short");
  expect(keyLines.length).toBeGreaterThan(1);
  expect(keyLines.map((t) => t.s).join(" ")).toBe(key); // every word kept, in order
  for (const t of keyLines) expect(t.x + measure(t.s, "small-b")).toBeLessThan(value.x - 4);
  const frame = boxes(p.items).find((b) => b.from === 1 && b.cls === "scn-frame")!;
  expect(frame.y + frame.h).toBeGreaterThan(Math.max(...keyLines.map((t) => t.y)));
});
