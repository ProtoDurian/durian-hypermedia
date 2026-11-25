// Format version 10, pure core (no DOM): every Format fixture compiles; a scene inside a scene; map, put, get; 3D only;
// closed=hidden; nested zooms; lift and put back; the 3D labels rule; lines (no crossing, no odd bends); words never
// under 11 px at the story camera at 1280, 390 and 360; candlesticks; free alignment grids; own marks and prefixes; the
// banner is refused; the hydration order's queue.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, check, llmView, FORMAT_VERSION, VERSION } from "../src/index";
import { compileScene, parseScene, sceneLlm, phoneInfo, storyView, inFrame, minFont, frameLines, wordRects, lineThrough, MIN_PX, type Frame, type Compiled, type Line, type Pt, type Rect } from "../src/core/scene";
import { stillCheck } from "../src/core/still9";
import { MAX_DEPTH, MIN_SUB_STEPS, sceneMove, sceneFrames, stepScene } from "../src/core/scenes";
import { hashOf } from "../src/core/data";
import { OUT, LIFT_UP, visOf, labelOn, REST_MS } from "../src/core/depth";
import { segX, distSeg, turnsBack, wiggles, resample } from "../src/core/route";
import { phoneStageH } from "../src/core/readable";
import { HydrationOrder } from "../src/react/turn";

const FIX = join(import.meta.dir, "../fixtures/format");
const split = (src: string) => { const [head, ...rest] = src.split(/^@step /m); return { head, steps: rest.map((r, k) => { const [t, ...body] = r.split("\n"); return { title: t, raw: body.join("\n"), line: 100 * (k + 1) }; }) }; };
const scene = (src: string, info: Record<string, string> = {}) => { const s = split(src); return compileScene(s.head, s.steps, 1, info); };
const errs = (src: string, info: Record<string, string> = {}) => scene(src, info).errors.map((e) => e.msg);
const box = (f: Frame, id: string) => f.boxes.find((b) => b.id === id && b.key > 0)!;

// every animation fence of every Format fixture, as the scene compiler reads it
interface Fence { name: string; head: string; steps: { title: string; raw: string; line: number }[]; info: Record<string, string>; c: Compiled }
const fixtureFiles = () => readdirSync(FIX).filter((x) => x.endsWith(".dh.md")).sort();
const fences = (): Fence[] => {
  const out: Fence[] = [];
  for (const f of fixtureFiles()) {
    const t = readFileSync(join(FIX, f), "utf8");
    for (const m of t.matchAll(/^```animation([^\n]*)\n([\s\S]*?)^```$/gm)) {
      const info: Record<string, string> = {};
      for (const w of m[1].trim().split(/\s+/).filter(Boolean)) { const [k, v] = w.split("="); if (v) info[k] = v; else if (k === "3d" || k === "2d") info.view = k; else if (k === "only") info.only = info.view ?? "3d"; }
      const s = split(m[2]);
      out.push({ name: f, head: s.head, steps: s.steps.map((x) => ({ ...x, title: x.title.trim() })), info, c: compileScene(s.head, s.steps, 1, info) });
    }
  }
  return out;
};
const ALL = fences();

describe("format version 11: the numbers", () => {
  test("format version 11, package 0.7.0", () => { expect(FORMAT_VERSION).toBe(11); expect(VERSION).toBe("0.7.0"); expect(JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8")).version).toBe("0.7.0"); });
  test("every Format fixture parses and its animations compile with no refusal", () => {
    expect(ALL.length).toBeGreaterThanOrEqual(27);
    expect(ALL.flatMap((x) => x.c.errors.map((e) => `${x.name}: ${e.msg}`))).toEqual([]);
    const bad: string[] = [];
    for (const f of fixtureFiles()) {
      const d = parse(readFileSync(join(FIX, f), "utf8"));
      bad.push(...check(d).filter((p) => p.level === "error").map((p) => `${f}: ${p.message}`));
    }
    expect(bad).toEqual([]);
  }, 30000);
  test("the version 10 samples are fixtures", () => {
    // (0.7.0-rc.3, owner row 6) the Format page's kube-proxy scene is flat now; the 3D-only sample it replaced is a test fixture
    const names = [...fixtureFiles(), ...readdirSync(join(import.meta.dir, "fixtures-3d"))].join(" ");
    for (const n of ["candlestick", "your-own-tiers", "three-tiers-or-seven", "alignment-grid-any-size", "colours-and-regions", "marks-and-prefixes", "3d-only", "seven-network-layers", "array-a-map-and-a-tree"]) expect(names).toContain(n);
    expect(names).not.toContain("banner");
  });
  test("nothing a step does not change moves, wide and on a phone, in every fixture scene", () => {
    const bad: string[] = [];
    for (const x of ALL) {
      const phone = compileScene(x.head, x.steps, 1, phoneInfo(x.c, x.info, 324));
      for (const c of [x.c, phone]) bad.push(...stillCheck(c).map((v) => `${x.name} step ${v.step}: ${v.id}`));
    }
    expect(bad).toEqual([]);
  });
});

// ---------------------------------------------------------------- a scene inside a scene
const NEST = `box a "browser"
box t "TCP"
box w "wire"
a -> t -> w
scene up "TCP, up close" layout=row
  group snd "sender"
  token m "message" in snd
  group rcv "receiver"
  snd -> rcv
end
@step The browser sends.
highlight a
@step Up close.
enter up from t
@step It splits.
split m into 2 "seg"
@step It crosses.
move m.1 m.2 into rcv
@step Back out.
leave
@step On to the wire.
highlight w
`;
describe("scenes: enter and leave", () => {
  test("scene <id> \"label\" ... end; enter <scene> from <thing>; leave", () => {
    const c = scene(NEST);
    expect(c.errors).toEqual([]);
    expect(c.scene.subs?.map((s) => [s.id, s.label])).toEqual([["up", "TCP, up close"]]);
    expect(c.scene.steps[1].ops).toMatchObject([{ op: "enter", id: "up", from: "t" }]);
    expect(c.scene.steps[4].ops).toMatchObject([{ op: "leave", id: null }]);
  });
  test("refused: no end, a scene never entered, a story that ends inside, nesting too deep, an unknown scene", () => {
    expect(errs(NEST.replace("end\n", "")).join()).toContain("has no \"end\" line");
    expect(errs(NEST.replace("enter up from t", "enter down from t")).join()).toContain("no scene down (scenes: up)");
    expect(errs(NEST.replace("@step Back out.\nleave\n", "@step Back out.\nhighlight a\n")).join()).toContain("");
    expect(errs(NEST.replace("@step It crosses.\nmove m.1 m.2 into rcv\n", "")).join()).toContain(`has 1 step of its own`);
    expect(MAX_DEPTH).toBeGreaterThanOrEqual(2);
    expect(MIN_SUB_STEPS).toBe(2);
  });
  test("the frame of the scene the story is in; the overview comes back exactly where it was left", () => {
    const c = scene(NEST);
    expect(box(c.frames[2], "snd")).toBeDefined();
    expect(box(c.frames[2], "a")).toBeUndefined();
    const at = (k: number) => ["a", "t", "w"].map((id) => { const b = box(c.frames[k], id); return `${b.x},${b.y},${b.w},${b.h}`; });
    expect(at(5)).toEqual(at(0));
  });
  test("the move between scenes: going in flies into the thing entered from; no move inside one scene; still across the move", () => {
    const c = scene(NEST);
    expect(sceneMove(c, 0, 0, 0.5)).toBeNull();
    expect(sceneMove(c, 2, 3, 0.5)).toBeNull();
    expect(sceneMove(c, 0, 1, 0.25)?.dir).toBe("in");
    expect(sceneMove(c, 3, 4, 0.25)?.dir).toBe("out");
    expect(stillCheck(c)).toEqual([]);
    expect(stepScene(c, 2).depth).toBe(1);
    expect(sceneFrames(c, 2).length).toBeGreaterThan(0);
  });
  test("the LLM view indents a scene's steps under the step that enters it", () => {
    const l = sceneLlm(scene(NEST));
    expect(l).toContain("TCP, up close");
    expect(l).toMatch(/\n\s{2,}\d+\. It splits\./);
  });
});

describe("map, put, get", () => {
  const MAP = `map cache "cache": u7: Ana, u12: Ben\n@step a\nget cache u7\n@step b\nput cache u9: Cy\n@step c\nput cache u7: Dee\n`;
  test("map is a table of key and value; get lights an entry; put adds one or replaces a value", () => {
    const c = scene(MAP);
    expect(c.errors).toEqual([]);
    expect(box(c.frames[0], "cache").kind).toBe("table");
    expect(box(c.frames[0], "cache.u7").ent.cells).toEqual(["u7", "Ana"]);
    expect(c.fx[0].highlights.map((h) => h.key)).toEqual([box(c.frames[0], "cache.u7").key]);
    expect(box(c.frames[1], "cache.u9").ent.cells).toEqual(["u9", "Cy"]);
    expect(box(c.frames[2], "cache.u7").ent.cells).toEqual(["u7", "Dee"]);
  });
  test("buckets=n: a hash table, the bucket is the sum of the letters' codes mod n", () => {
    const c = scene(`map h "h" buckets=4: ana: 3, cy: 9, ben: 7\n@step a\nget h cy\n@step b\nput h dee: 4\n`);
    expect(c.errors).toEqual([]);
    expect([hashOf("ana", 4), hashOf("cy", 4), hashOf("ben", 4), hashOf("dee", 4)]).toEqual([0, 0, 1, 2]);
    expect(box(c.frames[0], "h.cy").ent.parent).toBe("h.b0");
    expect(box(c.frames[1], "h.dee").ent.parent).toBe("h.b2");
  });
  test("get reads an array by index; mistakes name the fix", () => {
    expect(scene(`array a: 5, 8, 13\n@step a\nget a 2\n@step b\nhighlight a\n`).errors).toEqual([]);
    expect(errs(MAP.replace("get cache u7", "get cache u8")).join()).toContain("cache has no key u8 (keys: u7, u12)");
    expect(errs(`box b\n@step a\nput b k: 1\n@step b\n`).join()).toContain("put works on a map");
    expect(errs(`map m: a: 1, a: 2\n@step a\n@step b`).join()).toContain("written twice");
  });
  test("the LLM view", () => {
    const llm = sceneLlm(scene(MAP));
    expect(llm).toContain(`map cache "cache": u7: Ana, u12: Ben`);
    expect(llm).toContain(`get cache u7 -> Ana`);
    expect(llm).toContain(`put cache u7: Dee (it replaces the old value)`);
  });
});

// ---------------------------------------------------------------- depth
const K = `group c "cluster"
pill svc "service" in c
group n1 "node 1" in c closed=hidden
group n2 "node 2" in c closed=hidden
group p1 "pod a" in n1 closed=hidden
box a1 "app" in p1
group p2 "pod b" in n1
box b1 "db" in p2
group p3 "pod c" in n2
box c1 "web" in p3
`;
const ONLY = { view: "3d", only: "3d" };
describe("3D only, closed=hidden, nested zooms, lift and put back, labels", () => {
  test("3d only: no flat form; the LLM view says so; only goes after 3d", () => {
    const c = scene(`box a\n@step one\n@step two`, ONLY);
    expect(c.errors).toEqual([]);
    expect(c.scene.attrs.only3d).toBe(true);
    expect(sceneLlm(c)).toStartWith("Animation, 2 steps, 3D only.");
    expect(errs(`box a\n@step one\n@step two`, { view: "2d", only: "2d" })[0]).toContain("only goes after 3d");
  });
  test("closed=hidden: the inside is not drawn and has no words, but keeps its room; closed=yes stays faint", () => {
    const c = scene(`${K}group r "router" closed=yes\nbox q "queue" in r\n@step one\n@step two`);
    const f = c.frames[0];
    for (const id of ["p1", "a1", "p2", "b1", "p3", "c1"]) expect([id, box(f, id).hidden, box(f, id).lbl, visOf(box(f, id))]).toEqual([id, true, null, 0]);
    expect(box(f, "q").faint).toBe(true);
    expect(errs(`group g closed=maybe\n@step a\n@step b`)[0]).toContain("or hidden");
    expect(errs(`${K}@step one\nhighlight b1\n@step two`)[0]).toContain("is closed (its inside is not drawn)");
  });
  test("zooms nest: into a node, then a pod; zoom out goes back one level; zoom out all, all the way", () => {
    const c = scene(`${K}@step a\nzoom into n1\n@step b\nzoom into p1\n@step c\nzoom out\n@step d\nzoom into p1\n@step e\nzoom out all`);
    expect(c.errors).toEqual([]);
    const shown = (k: number, id: string) => !box(c.frames[k], id).hidden;
    expect([shown(0, "p1"), shown(0, "a1"), shown(0, "b1"), shown(0, "c1")]).toEqual([true, false, true, false]);
    expect([shown(1, "a1"), shown(1, "b1")]).toEqual([true, true]);
    expect([shown(2, "p1"), shown(2, "a1")]).toEqual([true, false]);
    expect([shown(4, "p1"), shown(4, "a1")]).toEqual([false, false]);
    expect(c.frames[4].look).toBeNull();
    expect(errs(`${K}@step a\nzoom into n1 p1\n@step b`)[0]).toContain("p1 is inside n1; zoom into n1 first");
    expect(errs(`${K}@step a\nzoom out all\n@step b`)[0]).toContain("nothing is zoomed into");
  });
  test("a deep zoom fades what is outside it; the LLM view says what a zoom does", () => {
    const c = scene(`${K}@step a\nzoom into n1\n@step b\nhighlight svc\n@step c\nzoom out`);
    for (const id of ["c", "svc", "n2"]) expect([id, box(c.frames[0], id).vis]).toEqual([id, OUT]);
    expect(box(c.frames[1], "svc").vis).toBeUndefined();
    expect(sceneLlm(scene(`${K}@step a\nzoom into n1 n2\n@step b\nzoom out all`))).toContain("zoom out all the way");
  });
  test("lift: the lifted thing and what it holds rise, the rest fades; nothing moves on the floor plan; put back sets it down", () => {
    const Z = `${K}@step a\nzoom into n1 n2\n`;
    const c = scene(`${Z}@step b\nlift p2 p3\n@step c\nput back`, ONLY);
    expect(c.errors).toEqual([]);
    const f = c.frames[1];
    expect([box(f, "p2").lift, box(f, "p3").lift, box(f, "b1").lift]).toEqual([true, true, undefined]);
    for (const id of ["c", "svc", "n1", "n2", "p1"]) expect([id, box(f, id).vis]).toEqual([id, OUT]);
    for (const id of ["p2", "b1", "p3", "c1", "n1"]) { const r = c.frames.map((g) => { const b = box(g, id); return `${b.x},${b.y},${b.w},${b.h},${b.layer}`; }); expect(new Set(r).size).toBe(1); }
    expect(box(c.frames[2], "p2").lift).toBeUndefined();
    expect(LIFT_UP).toBeGreaterThan(40);
    expect(errs(`${Z}@step b\nlift p2\n@step c\nlift p2`, ONLY)[0]).toContain("already lifted; put back p2 first");
    expect(errs(`${Z}@step b\nlift p2 p3\n@step c\nput back`, {}).filter((m) => m.includes("3D-only word"))).toHaveLength(2);
  });
  test("the labels rule: while a step plays only who takes part shows a label; a step that touches nothing keeps every label", () => {
    const c = scene(`${K}@step a\nzoom into n1\n@step b\nlift p2`, ONLY);
    const ids = (f: Frame) => (f.part ?? []).map((k) => f.boxes.find((b) => b.key === k)!.id).sort();
    expect(ids(c.frames[0])).toEqual(["b1", "n1", "p1", "p2"]);
    expect(scene(`${K}@step a\ncamera all\n@step b`).frames[0].part).toBeUndefined();
    const part = new Set([2, 5]);
    expect([labelOn([2], part), labelOn([3], part), labelOn([3, 5], part)]).toEqual([true, false, true]);
    expect(REST_MS).toBeGreaterThan(500);
  });
});

// ---------------------------------------------------------------- lines (the count of tools/lines10.ts, from the engine's own geometry)
const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Pt) => Math.hypot(v.x, v.y);
const distLine = (p: Pt, pts: Pt[]) => { let m = Infinity; for (let i = 0; i + 1 < pts.length; i++) m = Math.min(m, distSeg(p, pts[i], pts[i + 1])); return m; };
function centreWay(a: Rect, b: Rect): Pt[] {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const cut = (r: Rect, c: Pt, o: Pt) => { const dx = o.x - c.x, dy = o.y - c.y; const k = Math.min(Math.abs(r.w / 2 / (dx || 1e-9)), Math.abs(r.h / 2 / (dy || 1e-9)), 1); return { x: c.x + dx * k, y: c.y + dy * k }; };
  return [cut(a, ca, cb), cut(b, cb, ca)];
}
function shapeFaults(pts0: Pt[], obst: Rect[], ends: [Rect, Rect]) {
  const pts = resample(pts0, 2);
  const P = pts[0], Q = pts[pts.length - 1];
  const bx = { x0: Math.min(P.x, Q.x) - 4, x1: Math.max(P.x, Q.x) + 4, y0: Math.min(P.y, Q.y) - 4, y1: Math.max(P.y, Q.y) + 4 };
  let out = 0;
  for (const p of pts) out = Math.max(out, bx.x0 - p.x, p.x - bx.x1, bx.y0 - p.y, p.y - bx.y1);
  const clear = !obst.some((r) => lineThrough(centreWay(ends[0], ends[1]), r, 1));
  return { swing: out > 10 && clear, scurve: wiggles(pts0) > 0, double: turnsBack(pts0) > 0 };
}
// crossings, touches, bunched ends, swings, s-curves and doubles-back in one frame
function lineFaults(f: Frame): { crossings: number; touches: number; bunched: number; odd: number; items: string[] } {
  const res = { crossings: 0, touches: 0, bunched: 0, odd: 0, items: [] as string[] };
  const lines = frameLines(f);
  const byKey = new Map(f.boxes.map((b) => [b.key, b]));
  const id = (k: number) => byKey.get(k)?.id ?? String(k);
  const nm = (l: Line) => `${l.send ? "send " : ""}${id(l.ends[0])}->${id(l.ends[1])}`;
  const things = f.boxes.filter((b) => !b.container && !["text", "token", "pointer"].includes(b.kind));
  const words = wordRects(f);
  const ancestors = (k: number) => { const o = new Set<number>(); let b = byKey.get(k); while (b) { o.add(b.key); const p = b.ent.parent; b = p ? f.boxes.find((x) => x.id === p) : undefined; } return o; };
  for (const l of lines) {
    const ends = new Set([...ancestors(l.ends[0]), ...ancestors(l.ends[1])]);
    const obst = [...things.filter((b) => !ends.has(b.key)), ...words.filter((w) => w.r !== l.own && !(w.key != null && ends.has(w.key))).map((w) => w.r)];
    const sf = shapeFaults(l.pts, obst, [byKey.get(l.ends[0])!, byKey.get(l.ends[1])!]);
    for (const [k, on] of [["swing", sf.swing], ["s-curve", sf.scurve], ["doubles back", sf.double]] as const) if (on) { res.odd++; res.items.push(`${k} ${nm(l)}`); }
  }
  const same = (a: Line, b: Line) => (a.ends[0] === b.ends[0] && a.ends[1] === b.ends[1]) || (a.ends[0] === b.ends[1] && a.ends[1] === b.ends[0]);
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = lines[i], B = lines[j];
    if (same(A, B)) continue;
    const shared = A.ends.filter((k) => B.ends.includes(k));
    const near: Pt[] = [];
    for (const L of [A, B]) L.ends.forEach((k, e) => { if (shared.includes(k)) near.push(e ? L.pts[L.pts.length - 1] : L.pts[0]); });
    const ok = (p: Pt) => !near.some((n) => len(sub(p, n)) < 14);
    for (const k of shared) {
      const pa = A.ends[0] === k ? A.pts[0] : A.pts[A.pts.length - 1], pb = B.ends[0] === k ? B.pts[0] : B.pts[B.pts.length - 1];
      if (len(sub(pa, pb)) < 6) { res.bunched++; res.items.push(`bunched at ${id(k)}: ${nm(A)} / ${nm(B)}`); }
    }
    let crossed = false;
    for (let a = 0; a + 1 < A.pts.length && !crossed; a++) for (let b = 0; b + 1 < B.pts.length; b++) { const x = segX(A.pts[a], A.pts[a + 1], B.pts[b], B.pts[b + 1]); if (x && ok(x)) { crossed = true; break; } }
    if (crossed) { res.crossings++; res.items.push(`crossing ${nm(A)} x ${nm(B)}`); continue; }
    let run = 0, touch = false;
    for (const p of resample(A.pts, 2)) { if (ok(p) && distLine(p, B.pts) < 2.5) { run += 2; if (run >= 10) { touch = true; break; } } else run = 0; }
    if (touch) { res.touches++; res.items.push(`touch ${nm(A)} / ${nm(B)}`); }
  }
  return res;
}
describe("lines: no crossing, no odd bends", () => {
  test("every fixture scene, every step, wide and phone: 0 crossings, touches, bunched ends, swings, s-curves, doubles-back", () => {
    const bad: string[] = [];
    let frames = 0;
    for (const x of ALL) {
      const phone = compileScene(x.head, x.steps, 1, phoneInfo(x.c, x.info, 324));
      for (const [layout, c] of [["wide", x.c], ["phone", phone]] as const) c.frames.forEach((f, k) => { frames++; bad.push(...lineFaults(f).items.map((i) => `${x.name} (${layout}) step ${k + 1}: ${i}`)); });
    }
    expect(frames).toBeGreaterThan(350);
    expect(bad).toEqual([]);
  });
  test("every line is at least 32 units, and the counter catches a swing, a turn back and two lines drawn over each other", () => {
    const f = ALL.find((x) => x.name.includes("service-mesh"))!.c.frames[0];
    for (const l of frameLines(f)) expect(len(sub(l.pts[0], l.pts[l.pts.length - 1]))).toBeGreaterThan(0);
    expect(turnsBack([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }, { x: 0, y: 10 }])).toBeGreaterThan(0);
    expect(wiggles([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 6 }, { x: 60, y: 6 }, { x: 60, y: 12 }, { x: 90, y: 12 }])).toBeGreaterThan(0);
    expect(segX({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).not.toBeNull();
  });
});

// ---------------------------------------------------------------- words never under 11 px
const SCREENS = [
  { key: "1280", stage: 714, h: (a: number) => Math.min(0.7 * 800, Math.max(260, 714 / a)) },
  { key: "390", stage: 390, h: (a: number) => Math.min(0.74 * 844, Math.max(Math.min(0.62 * 844, 360), 390 / a)) },
  { key: "360", stage: 360, h: (a: number) => Math.min(0.74 * 780, Math.max(Math.min(0.62 * 780, 360), 360 / a)) },
] as const;
describe("words are never under 11 px at the story camera", () => {
  for (const sc of SCREENS) test(`every step of every fixture scene at ${sc.key}: smallest words >= ${MIN_PX} px, everything the step touches in frame`, () => {
    let steps = 0;
    const bad: string[] = [];
    for (const x of ALL) {
      const phone = sc.stage < 480;
      const info = phone ? phoneInfo(x.c, x.info, sc.stage) : x.info;
      const c = phone ? compileScene(x.head, x.steps, 1, info) : x.c;
      const w = sc.stage, h = sc.h(c.aspect);
      c.frames.forEach((f, k) => {
        const v = storyView(f, w / h, w);
        const px = minFont(f) * Math.min(w / v.w, h / v.h);
        const r = inFrame(f, v);
        if (px < MIN_PX - 0.01) bad.push(`${x.name} step ${k + 1}: ${px.toFixed(1)} px`);
        if (r.ok !== r.total) bad.push(`${x.name} step ${k + 1}: in frame ${r.ok}/${r.total}`);
        steps++;
      });
    }
    expect(steps).toBeGreaterThan(180);
    expect(bad).toEqual([]);
  });
  test("a phone stage is as tall as the scene's shape asks, between 360 and 74% of the screen", () => {
    expect(phoneStageH(390, 1.5)).toBe(360);
    expect(phoneStageH(390, 0.4)).toBeCloseTo(0.74 * 800, 5);
  });
});

// ---------------------------------------------------------------- the other parts
const doc = (name: string, opts = {}) => parse(readFileSync(join(FIX, fixtureFiles().find((x) => x.includes(name))!), "utf8"), opts);
describe("candlesticks", () => {
  test("a chart kind: data [open, high, low, close] a period; the LLM view is a table", () => {
    const d = doc("chart-candlestick");
    expect(d.blocks.some((b) => b.type === "chart")).toBe(true);
    expect(llmView(d)).toContain("| day | open | high | low | close |");
    expect(check(d).filter((p) => p.level === "error")).toEqual([]);
  });
  test("high below the close, or a candle that is not four numbers, is refused with the fix", () => {
    const page = (data: string) => `---\ntitle: T\ndescription: D\n---\n\n\`\`\`chart\nkind: candlestick\nx: { label: day, values: [a, b] }\nseries:\n  - name: p\n    data: ${data}\n\`\`\`\n`;
    const m = (data: string) => check(parse(page(data), { path: "t.dh.md" })).filter((p) => p.level === "error").map((p) => p.message).join(" | ");
    expect(m("[[1, 2, 0, 1], [1, 2, 0, 1]]")).not.toContain("high");
    expect(m("[[1, 0, 0, 1], [1, 2, 0, 1]]").toLowerCase()).toContain("high");
    expect(m("[[1, 2, 0], [1, 2, 0, 1]]").length).toBeGreaterThan(0);
  });
});
describe("alignment grids of any size", () => {
  test("2 to 6 names an axis, axes may differ; colours and regions are read; the LLM view keeps a table and a line per region", () => {
    const d = doc("alignment-grid-any-size");
    expect(check(d).filter((p) => p.level === "error")).toEqual([]);
    const al = d.blocks.filter((b) => b.type === "alignment") as any[];
    expect(al.length).toBeGreaterThan(0);
    expect(al.some((b) => b.align.xs.length !== b.align.ys.length)).toBe(true);
    const r = doc("colours-and-regions");
    expect(check(r).filter((p) => p.level === "error")).toEqual([]);
    expect(llmView(r)).toMatch(/region/i);
    const page = (axis: string) => `---\ntitle: T\ndescription: D\n---\n\n\`\`\`alignment\nx: ${axis}\ny: a .. b\n\`\`\`\n`;
    expect(check(parse(page("only"), { path: "t.dh.md" })).some((p) => p.level === "error" && /at least the two ends|2 to 6/.test(p.message))).toBe(true);
    expect(check(parse(page("a .. b .. c .. d .. e .. f .. g"), { path: "t.dh.md" })).some((p) => p.level === "error" && /an axis may have 2 to 6/.test(p.message))).toBe(true);
  });
  test("a tier list takes any names and any count", () => {
    const d = doc("three-tiers-or-seven");
    const t = (d.blocks.filter((b) => b.type === "tierlist") as any[]).map((b) => b.tier.tiers.length);
    expect(t).toContain(3);
    expect(t).toContain(7);
  });
});

describe("own marks and prefixes", () => {
  test("a page's front matter defines them; only what a part uses reaches the part", () => {
    const d = doc("marks-and-prefixes");
    expect(check(d).filter((p) => p.level === "error")).toEqual([]);
    const tree = d.blocks.find((b) => b.type === "filetree") as any;
    expect(Object.keys(tree.marks).sort()).toEqual(["deprecated", "experimental"]);
    expect(tree.marks.deprecated).toEqual({ label: "deprecated", colour: "warn", means: "still works, but will be removed" });
    const term = d.blocks.find((b) => b.type === "terminal" && Object.keys((b as any).prefixes).length) as any;
    expect(Object.keys(term.prefixes)).toEqual([">>>"]);
    expect(term.steps.some((s: any) => s.lines.some((l: any) => l.prompt === ">>>"))).toBe(true);
  });
  test("the LLM view reads a mark as its label, and lists a custom prompt under the terminal", () => {
    const l = llmView(doc("marks-and-prefixes"));
    expect(l).toContain("(deprecated)");
    expect(l).toMatch(/>>> is Python/);
  });
  const PAGE = (fm: string) => `---\ntitle: T\ndescription: D\n${fm}---\n\n\`\`\`filetree\napp/\n  a.ts  (stale)\n\`\`\`\n`;
  test("a mark nobody defined is refused, naming where to define it", () => {
    const m = check(parse(PAGE(""), { path: "t.dh.md" })).filter((p) => p.level === "error").map((p) => p.message).join(" | ");
    expect(m).toContain('unknown mark "(stale)"');
    expect(m).toContain("marks option of parse()");
  });
  test("the marks and prefixes options define them for every page; a page's own entry wins", () => {
    const marks = { stale: { label: "old", colour: "warn" } };
    const d = parse(PAGE(""), { path: "t.dh.md", marks });
    expect(check(d).filter((p) => p.level === "error")).toEqual([]);
    expect((d.blocks[0] as any).marks).toEqual({ stale: { label: "old", colour: "warn", means: "" } });
    const own = parse(PAGE("marks:\n  stale:\n    label: ancient\n    colour: bad\n"), { path: "t.dh.md", marks });
    expect((own.blocks[0] as any).marks.stale.label).toBe("ancient");
    expect(llmView(d)).toContain("(old)");
    const t = parse("```terminal\n>>> 1 + 1\n2\n```\n", { path: "t.dh.md", prefixes: { ">>>": { label: "Python", colour: "c4" } } });
    expect((t.blocks[0] as any).steps[0].lines[0]).toMatchObject({ k: "cmd", prompt: ">>>", text: "1 + 1" });
  });
  test("a bad definition in the options is refused: a built-in name, a hex colour, an unknown key", () => {
    const bad = (marks: any) => check(parse(PAGE(""), { path: "t.dh.md", marks })).filter((p) => p.level === "error").map((p) => p.message).join(" | ");
    expect(bad({ new: { label: "x", colour: "warn" } })).toContain("is built in");
    expect(bad({ stale: { label: "x", colour: "#ff0000" } })).toContain("never a hex value");
    expect(bad({ stale: { label: "x", colour: "warn", icon: "!" } })).toContain('unknown key "icon"');
  });
});

describe("the banner is gone", () => {
  const text = `---\ntitle: T\ndescription: D\nbanner: { kind: new, text: Hello }\n---\n\nBody.\n`;
  test("the page has no banner in its tree; check() refuses a front matter banner and :::banner, each with the fix", () => {
    const d = parse(text, { path: "t.md" });
    expect("banner" in d).toBe(false);
    const m = check(d).filter((p) => p.level === "error").map((p) => p.message);
    expect(m.some((x) => x.includes("banner was removed in format version 10") && x.includes("callout under the title"))).toBe(true);
    const c = check(parse(`:::banner\nhi\n:::\n\nBody.\n`, { path: "t.md" })).filter((p) => p.level === "error");
    expect(c.length).toBeGreaterThan(0);
  });
  test("a page without one is clean, and no source file of the package names a banner", () => {
    expect(check(parse(`---\ntitle: T\ndescription: D\n---\n\nBody.\n`, { path: "t.md" })).filter((p) => p.level === "error")).toEqual([]);
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.(tsx?|css)$/.test(e.name) ? [join(dir, e.name)] : []));
    const hits = walk(join(import.meta.dir, "../src")).filter((f) => /banner/i.test(readFileSync(f, "utf8")) && !f.endsWith("doccheck.ts"));
    expect(hits.map((f) => f.split("/src/")[1])).toEqual([]);
  });
});

// ---------------------------------------------------------------- the hydration order's queue (no DOM: a fake observer)
describe("hydration order", () => {
  const mark = (top: number, parent: object = {}) => ({ getBoundingClientRect: () => ({ top, bottom: top + 100 }), parentElement: parent }) as unknown as HTMLElement;
  test("one part per turn, the ones on screen first, then page order; a part drawn lets the next go", async () => {
    (globalThis as any).innerHeight = 800;
    const o = new HydrationOrder();
    const order: string[] = [];
    const parts = [["a", 3000], ["b", 3200], ["c", 100], ["d", 5000]] as const;
    for (const [k, top] of parts) { const e = o.entry(k); e.promise.then(() => { order.push(k); setTimeout(() => o.drawn(k), 0); }); o.attach(k, mark(top)); }
    await new Promise((r) => setTimeout(r, 120));
    expect(order).toEqual(["c", "a", "b", "d"]);
  });
  test("stop() lets every waiting part go; a part that comes after is not held", async () => {
    const o = new HydrationOrder();
    const e = o.entry("x");
    o.stop();
    await e.promise;
    expect(o.entry("y").released).toBe(true);
  });
});
