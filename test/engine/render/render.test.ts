// Lane render: the router, the story camera and the tween, on hand-built rects and primitives.
import { describe, expect, test } from "bun:test";
import { route, routeTaken, pathPoints, PORT_GAP } from "../../../src/engine/render/route";
import { focusRect, storyCamera, zoomAt, MAX_ZOOM } from "../../../src/engine/render/camera";
import { tweenFrames } from "../../../src/engine/render/svg";
import { chipW, stackTokens } from "../../../src/engine/render/prims";
import type { Prim, Rect, Relation } from "../../../src/engine/types";

const rel = (from: string, to: string): Relation => ({ id: `${from}->${to}`, from, to, style: "arrow", label: null, role: null, setup: true, src: { line: 1 } });
const R = (x: number, y: number, w = 100, h = 50): Rect => ({ x, y, w, h });
const hits = (pts: { x: number; y: number }[], r: Rect) => pts.slice(1).some((q, i) => {
  const p = pts[i]; for (let k = 0; k <= 20; k++) { const x = p.x + ((q.x - p.x) * k) / 20, y = p.y + ((q.y - p.y) * k) / 20; if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true; } return false;
});
const rightAngles = (pts: { x: number; y: number }[]) => pts.slice(1).every((q, i) => Math.abs(q.x - pts[i].x) < 0.6 || Math.abs(q.y - pts[i].y) < 0.6);
const cross = (p: any, p2: any, q: any, q2: any) => { const d = (p2.x - p.x) * (q2.y - q.y) - (p2.y - p.y) * (q2.x - q.x); if (Math.abs(d) < 1e-9) return false; const t = ((q.x - p.x) * (q2.y - q.y) - (q.y - p.y) * (q2.x - q.x)) / d, u = ((q.x - p.x) * (p2.y - p.y) - (q.y - p.y) * (p2.x - p.x)) / d; return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98; };

describe("route", () => {
  test("two things side by side: one straight line, ending PORT_GAP short of each outline", () => {
    const a = R(0, 0), b = R(300, 0), obst = [a, b];
    const pts = pathPoints(route(rel("a", "b"), a, b, obst));
    expect(pts.length).toBe(2);
    expect(pts[0].y).toBe(pts[1].y);
    expect(pts[0].x).toBeCloseTo(100 + PORT_GAP, 1);
    expect(pts[1].x).toBeCloseTo(300 - PORT_GAP, 1);
  });
  test("a thing in the way: the line goes around it at right angles", () => {
    const a = R(0, 0), b = R(400, 0), c = R(180, -20, 100, 90), obst = [a, b, c];
    const pts = pathPoints(route(rel("a", "b"), a, b, obst));
    expect(hits(pts, c)).toBe(false);
    expect(rightAngles(pts)).toBe(true);
  });
  test("the same ends give the same path (no jitter between steps)", () => {
    const a = R(0, 0), b = R(300, 120);
    expect(route(rel("a", "b"), a, b, [a, b])).toBe(route(rel("a", "b"), { ...a }, { ...b }, [{ ...a }, { ...b }]));
  });
  test("lines from one side fan out: each leaves from its own point", () => {
    const a = R(0, 100, 100, 120), b = R(300, 0), c = R(300, 140), d = R(300, 280), obst = [a, b, c, d];
    const starts = [b, c, d].map((t) => pathPoints(route(rel("a", "x"), a, t, obst))[0]);
    expect(new Set(starts.map((p) => `${p.x},${p.y}`)).size).toBe(3);
  });
  test("two lines in one frame do not cross where another way is free", () => {
    const a = R(0, 0), b = R(0, 200), c = R(400, 0), d = R(400, 200), obst = [a, b, c, d];
    const p1 = pathPoints(route(rel("a", "d"), a, d, obst)), p2 = pathPoints(route(rel("b", "c"), b, c, obst));
    let n = 0; for (let i = 1; i < p1.length; i++) for (let j = 1; j < p2.length; j++) if (cross(p1[i - 1], p1[i], p2[j - 1], p2[j])) n++;
    // two diagonals of a square must cross once at most; never more
    expect(n).toBeLessThanOrEqual(1);
  });
  test("a container holding an end is not in the way; its heading is", () => {
    const box = R(0, 0, 300, 200), a = R(20, 60, 100, 50), b = R(500, 10), obst = [box, a, b];
    const pts = pathPoints(route(rel("a", "b"), a, b, obst));
    expect(hits(pts, { x: 0, y: 0, w: 170, h: 26 })).toBe(false);
  });
});

describe("camera", () => {
  const whole = R(0, 0, 1000, 500);
  test("nothing touched: the whole scene", () => { expect(focusRect([], whole, false)).toEqual(whole); });
  test("never closer than MAX_ZOOM, in the scene's shape, inside it", () => {
    const f = focusRect([R(100, 100, 20, 20)], whole, false);
    expect(whole.w / f.w).toBeLessThanOrEqual(MAX_ZOOM + 1e-6);
    expect(f.w / f.h).toBeCloseTo(2, 3);
    expect(f.x).toBeGreaterThanOrEqual(0); expect(f.x + f.w).toBeLessThanOrEqual(1000 + 1e-6);
  });
  test("a scene that fits the stage at natural size: the story camera frames all of it on every step", () => {
    for (const k of [1, 2, 5]) expect(storyCamera(k, whole, { w: 1000, h: 500 }, [], [R(800, 400, 50, 50)])).toEqual(whole);
  });
  test("a scene wider than the stage: a window at natural size (never smaller), on what the step touches", () => {
    const wide = R(0, 0, 900, 300), view = { w: 360, h: 300 };
    const cam = storyCamera(3, wide, view, [], [R(700, 100, 60, 40)]);
    expect(cam.w).toBeCloseTo(360, 3);
    expect(cam.x).toBeLessThanOrEqual(700); expect(cam.x + cam.w).toBeGreaterThanOrEqual(760);
  });
  test("eng-sweep: zooming in again and again stops at 4x the stage's natural size, never 16x", () => {
    let v = R(0, 0, 1000, 500);
    for (let i = 0; i < 6; i++) v = zoomAt(v, 3, { x: v.x + v.w / 2, y: v.y + v.h / 2 }, whole, 1000);
    expect(v.w).toBeCloseTo(250, 3);
    expect(zoomAt(R(0, 0, 360, 300), 100, { x: 100, y: 100 }, R(0, 0, 900, 300), 360).w).toBeCloseTo(90, 3);
  });
  test("the reader zooms between 4x and the whole scene", () => {
    const v = R(0, 0, 1000, 500);
    expect(zoomAt(v, 100, { x: 500, y: 250 }, whole).w).toBeCloseTo(250, 3);
    expect(zoomAt(v, 0.01, { x: 500, y: 250 }, whole).w).toBeCloseTo(1000, 3);
  });
});

describe("tween", () => {
  const box = (x: number): Prim => ({ k: "box", key: "t:a", id: "a", shape: "box", rect: R(x, 0), role: null, tone: null });
  test("the same key glides; positions only", () => {
    const mid = tweenFrames([box(0)], [box(100)], 0.5);
    expect(mid.length).toBe(1);
    expect((mid[0].p as any).rect.x).toBeCloseTo(50, 3);
    expect(mid[0].o).toBe(1);
  });
  test("a new key fades in, a gone key fades out; at the end only the new frame", () => {
    const b: Prim = { ...box(0), key: "t:b", id: "b" } as Prim;
    const start = tweenFrames([box(0)], [b], 0);
    expect(start.find((d) => d.key === "t:b")!.o).toBe(0);
    expect(start.find((d) => d.key.startsWith("t:a"))!.o).toBe(1);
    expect(tweenFrames([box(0)], [b], 1).map((d) => d.key)).toEqual(["t:b"]);
  });
  test("changed words cross-fade in place", () => {
    const A: Prim = { k: "chip", key: "t:a:is", x: 0, y: 0, words: "LISTEN", role: null };
    const B: Prim = { ...A, words: "SYN-RECEIVED" } as Prim;
    const mid = tweenFrames([A], [B], 0.5);
    expect(mid.map((d) => d.key).sort()).toEqual(["t:a:is", "t:a:is~was"]);
  });
});

describe("camera: least scale", () => {
  test("taking a cut thing in whole never grows the window past natural size", () => {
    const wide = R(0, 0, 1200, 300), view = { w: 360, h: 300 };
    const things = [R(0, 20, 200, 60), R(250, 20, 200, 60), R(500, 20, 200, 60), R(750, 20, 200, 60), R(1000, 20, 180, 60)];
    for (const touched of things) {
      const cam = storyCamera(2, wide, view, things, [touched]);
      expect(cam.w).toBeLessThanOrEqual(360 + 1e-6);
      expect(cam.h).toBeLessThanOrEqual(300 + 1e-6);
    }
  });
});

describe("route: lines a layout drew", () => {
  test("the router keeps off a line the layout routed itself in the same frame", () => {
    const a = R(0, 100), b = R(400, 100), obst = [a, b];
    // the layout's line runs straight across the gap, right where the router's straight line would go
    routeTaken(obst, "M103 125L397 125");
    const pts = pathPoints(route(rel("b", "a"), b, a, obst));
    const onIt = pts.slice(1).some((q, i) => Math.abs(q.y - 125) < 3 && Math.abs(pts[i].y - 125) < 3);
    expect(onIt).toBe(false);
  });
});

describe("tokens at one thing", () => {
  test("two tokens on one thing sit side by side, centred where they were", () => {
    const tok = (id: string): Prim => ({ k: "chip", key: `t:${id}`, id, x: 100, y: 50, words: id, role: null, cls: "eng-token" } as Prim);
    const out = stackTokens([tok("a"), tok("b")]) as any[];
    const [a, b] = out;
    expect(b.x).toBeGreaterThanOrEqual(a.x + chipW("a") + 3.9);
    expect((a.x + b.x + chipW("b")) / 2).toBeCloseTo(100 + chipW("a") / 2, 0);
  });
});

describe("route: both ways between two things", () => {
  test("a line back beside a straight line there already runs parallel to it, never across it", () => {
    const a = R(80, 0, 50, 50), b = R(95, 120, 90, 80), obst = [a, b];
    routeTaken(obst, "M117 53L117 117");
    const pts = pathPoints(route(rel("b", "a"), b, a, obst));
    expect(pts.length).toBe(2);
    expect(Math.abs(pts[0].x - 117)).toBeGreaterThanOrEqual(8);
    expect(pts[0].x).toBe(pts[1].x);
  });
});

describe("route: a heading in the way", () => {
  test("a line leaves further along its side and enters from the side when the straight way crosses a heading", () => {
    const box = R(60, 460, 130, 72), a = R(45, 402, 57, 36), b = R(71, 494, 44, 28), obst = [box, a, b];
    const pts = pathPoints(route(rel("a", "b"), a, b, obst));
    expect(hits(pts, { x: 60, y: 460, w: 130, h: 26 })).toBe(false);
  });
});
