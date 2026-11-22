// Format version 10, the labels round before the 0.6.0 tag.
// 1. the 3D labels rule: only real participants show a label (a camera that only frames names no one; a connector
//    needs a send along it or both ends taking part).
// 2. kube-proxy: only the nodes first; the service comes in at the step that calls it.
// 3. Kubernetes: each zoom pulls the box it opens out of its box (lifts nest), and each zoom out puts it back.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileScene, sceneLlm, type Frame, type Compiled } from "../src/core/scene";
import { OUT, wireLabelOn, labelOn } from "../src/core/depth";
import { stillCheck } from "../src/core/still9";

const steps = (src: string) => { const [head, ...rest] = src.split(/^@step /m); return { head, steps: rest.map((r, k) => { const [t, ...body] = r.split("\n"); return { title: t, raw: body.join("\n"), line: 100 * (k + 1) }; }) }; };
const ONLY = { view: "3d", only: "3d" };
const scene = (src: string, info: Record<string, string> = ONLY) => { const s = steps(src); return compileScene(s.head, s.steps, 1, info); };
const box = (f: Frame, id: string) => f.boxes.find((b) => b.id === id && b.key > 0)!;
const ids = (f: Frame) => (f.part ? f.part.map((k) => f.boxes.find((b) => b.key === k)!.id).sort() : null);
const wire = (f: Frame, label: string) => f.edges.filter((e) => e.label === label).map((e) => e.part);
const FIX = join(import.meta.dir, "../fixtures/format");
const slug = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const page = (h: string) => {
  const file = readdirSync(FIX).find((x) => x.replace(/^\d+-/, "").startsWith(slug(h)))!;
  const m = readFileSync(join(FIX, file), "utf8").match(/^```animation([^\n]*)\n([\s\S]*?)^```$/m)!;
  const info: Record<string, string> = {};
  for (const w of m[1].trim().split(/\s+/).filter(Boolean)) { const [k, v] = w.split("="); if (v) info[k] = v; else if (k === "3d" || k === "2d") info.view = k; else if (k === "only") info.only = info.view ?? "3d"; }
  const s = steps(m[2]);
  return { name: file, src: { head: s.head, steps: s.steps.map((x) => ({ ...x, title: x.title.trim() })), base: 1, info } };
};
const comp = (src: ReturnType<typeof page>["src"], info = src.info) => compileScene(src.head, src.steps, src.base, info);
const K8S = "3D: Kubernetes, cluster to container", PROXY = "3D only: a packet through kube-proxy";

// two nodes; kube-proxy writes rules on node 1; two pods
const N = `group c "cluster"
group n1 "node 1" in c closed=hidden
group n2 "node 2" in c closed=hidden
group fe "frontend" in n1
box app "app" in fe
box kp "kube-proxy" in n1
box r1 "rules" in n1
group w2 "web-2" in n2
box ng "nginx" in w2
kp --> r1 "writes"
`;

describe("1. the labels rule: only real participants", () => {
  test("a camera line that frames what later steps use names no one: lifting two pods shows only the pods", () => {
    const c = scene(`${N}@step a\nzoom into n1 n2\n@step b\nlift fe w2\ncamera fe w2 r1\n@step c\nsay fe: hi`);
    expect(c.errors).toEqual([]);
    expect(ids(c.frames[1])).toEqual(["app", "fe", "ng", "w2"]);
    // and the camera staying on r1 afterwards does not make it take part either
    expect(ids(c.frames[2])).toEqual(["app", "fe", "ng", "w2"]);
  });
  test("a step that only moves the camera names its targets (a focus on one thing); a camera that stays names no one", () => {
    const c = scene(`${N}@step a\nzoom into n1\n@step b\ncamera r1\n@step c\ncamera r1`);
    expect(ids(c.frames[1])).toEqual(["r1"]);
    expect(ids(c.frames[2])).toBeNull(); // nothing in particular: every label shows
  });
  test("what a zoom opens takes part, with what it reveals", () => {
    const c = scene(`${N}@step a\nzoom into n1\n@step b`);
    expect(c.errors).toEqual([]);
    expect(ids(c.frames[0])).toEqual(["app", "fe", "kp", "n1", "r1"]);
  });
  test("a connector's label: on when both ends take part or a send runs along it; one end is not enough", () => {
    const c = scene(`${N}@step a\nzoom into n1\n@step b\nhighlight r1\n@step c\nsend "rule" kp -> r1\n@step d\ncamera all`);
    expect(wire(c.frames[0], "writes")).toEqual([true]); // both ends revealed
    expect(wire(c.frames[1], "writes")).toEqual([false]); // only r1 takes part
    expect(wire(c.frames[2], "writes")).toEqual([true]); // a send runs along it
    expect(wire(c.frames[3], "writes")).toEqual([undefined]); // every label shows
    expect([wireLabelOn({ part: false }, new Set([1])), wireLabelOn({ part: true }, new Set([1])), wireLabelOn({ part: false }, null), wireLabelOn(undefined, new Set([1]))]).toEqual([false, true, true, true]);
    expect(labelOn([3], new Set([2]))).toBe(false);
  });
  test("a thing that moves from one end of a connector to the other travels along it; a step's beat frames get the same verdict", () => {
    const c = scene(`box a "a"\nbox b "b"\nbox z "z"\na -> b "wire"\ntoken t "x" at a\n@step one\nhighlight z\n@step two\nmove t to b\n@step three\nhighlight a\nthen\nhighlight z`);
    expect(c.errors).toEqual([]);
    expect([wire(c.frames[0], "wire"), wire(c.frames[1], "wire"), wire(c.frames[2], "wire")]).toEqual([[false], [true], [false]]);
    const beats = c.beats?.[2] ?? [];
    expect(beats.length).toBeGreaterThan(0);
    for (const bf of beats) expect(wire(bf, "wire")).toEqual([false]);
  });
  test("the 3D stage reads the connector verdict (anim3d uses wireLabelOn, not either end)", () => {
    const src = readFileSync(join(import.meta.dir, "../src/ui/anim3d.ts"), "utf8");
    expect(src).toContain("const on = wireLabelOn(e, partSet);");
    expect(src).not.toContain("labelOn([e.from, e.to], partSet)");
  });
  test("kube-proxy on the page: while the pods are lifted, neither 'iptables rules' nor 'writes' takes part until the packet meets the rules", () => {
    const { src } = page(PROXY), c = comp(src);
    const li = src.steps.findIndex((s) => /^lift /m.test(s.raw)), meet = src.steps.findIndex((s) => /^send .* fe -> r1$/m.test(s.raw));
    for (let k = li; k < meet; k++) {
      expect([k + 1, ids(c.frames[k])!.includes("r1")]).toEqual([k + 1, false]);
      expect([k + 1, wire(c.frames[k], "writes")]).toEqual([k + 1, [false, false]]);
    }
    expect(ids(c.frames[meet])!.includes("r1")).toBe(true);
    for (let k = meet; k < c.frames.length - 1; k++) expect([k + 1, wire(c.frames[k], "writes")]).toEqual([k + 1, [false, false]]);
  });
});

describe("2. kube-proxy: only the nodes first; the service comes in when the frontend calls it", () => {
  test("no service before the call step; it is added there and stays; the caption says so", () => {
    const { src } = page(PROXY), c = comp(src);
    expect(src.head).not.toMatch(/^pill svc/m);
    const call = src.steps.findIndex((s) => /^add pill svc /m.test(s.raw));
    expect(call).toBeGreaterThan(1);
    expect(src.steps[call].title).toMatch(/calls the service/);
    expect(src.steps[call].raw).toMatch(/^say fe above: GET 192\.0\.2\.10:80$/m);
    for (let k = 0; k < call; k++) expect([k + 1, !!box(c.frames[k], "svc")]).toEqual([k + 1, false]);
    for (let k = call; k < c.frames.length; k++) expect([k + 1, !!box(c.frames[k], "svc")]).toEqual([k + 1, true]);
    // step 1: the cluster and its nodes, nothing else drawn
    expect(c.frames[0].boxes.filter((b) => b.key > 0 && !b.hidden).map((b) => b.id).sort()).toEqual(["c", "n1", "n2"]);
  });
  test("still: nothing moves when the service comes in (wide, phone, narrow); documentation addresses only", () => {
    const { src } = page(PROXY);
    for (const info of [src.info, { ...src.info, phone: "1" }, { ...src.info, narrow: "1" }]) expect([info, stillCheck(comp(src, info))]).toEqual([info, []]);
    const text = src.head + src.steps.map((s) => s.title + s.raw).join("");
    for (const ip of text.match(/\b\d+\.\d+\.\d+\.\d+\b/g) ?? []) expect(ip).toMatch(/^(192\.0\.2|198\.51\.100)\./);
  });
  test("the rewrite step frames the rules and web-2, and the reply step the frontend again", () => {
    const { src } = page(PROXY);
    const rw = src.steps.findIndex((s) => /^say r1 below: /m.test(s.raw)), back = src.steps.findIndex((s) => /^send "from 192\.0\.2\.10" r1 -> fe$/m.test(s.raw));
    expect(src.steps[rw].raw).toMatch(/^camera r1 w2$/m);
    expect(src.steps[back].raw).toMatch(/^camera fe w2 r1$/m);
  });
});

describe("3. lifts nest: each zoom pulls the box it opens out, each zoom out puts it back", () => {
  test("a thing inside a lifted one may rise again; a thing holding a lifted one may not; putting back the outer one settles both", () => {
    expect(scene(`${N}@step a\nzoom into n1\nlift n1\n@step b\nzoom into fe\nlift fe`).errors).toEqual([]);
    const bad = scene(`${N}@step a\nzoom into n1\n@step b\nlift fe\n@step c\nlift n1`).errors.map((e) => e.msg);
    expect(bad[0]).toContain("holds fe, which is lifted");
    expect(scene(`${N}@step a\nzoom into n1\nlift n1 fe\n@step b`).errors[0].msg).toContain("fe is inside n1; lift n1 alone");
    const c = scene(`${N}@step a\nzoom into n1\nlift n1\n@step b\nlift fe\n@step c\nput back n1`);
    expect(c.errors).toEqual([]);
    expect([box(c.frames[1], "n1").lift, box(c.frames[1], "fe").lift]).toEqual([true, true]);
    expect([box(c.frames[2], "n1").lift, box(c.frames[2], "fe").lift]).toEqual([undefined, undefined]);
  });
  test("with nested lifts only the innermost lifted thing stays strong and takes part; what it rose out of fades", () => {
    const c = scene(`${N}@step a\nzoom into n1\nlift n1\n@step b\nlift fe\n@step c\nsay fe: hi`);
    const f = c.frames[1];
    expect([box(f, "fe").vis, box(f, "app").vis, box(f, "kp").vis, box(f, "n1").vis]).toEqual([undefined, undefined, OUT, OUT]);
    expect(ids(f)).toEqual(["app", "fe"]);
    expect(ids(c.frames[2])).toEqual(["app", "fe"]);
  });
  test("the 3D stage stacks nested lifts (a pod lifted out of a lifted node rises above it) and leaves each outline on its own floor", () => {
    const src = readFileSync(join(import.meta.dir, "../src/ui/anim3d.ts"), "utf8");
    expect(src).toContain("m += x.lift ?? 0");
    expect(src).toContain("o.sock.position.y = -(it.lift ?? 0) * LIFT_UP - pop + 1;");
  });
  test("Kubernetes on the page: zoom into node 1 lifts it, zoom into cache-1 lifts the pod, redis rises out of its pod; zoom out and zoom out all put each back", () => {
    const { src } = page(K8S), c = comp(src);
    expect(c.errors).toEqual([]);
    const at = (re: RegExp) => src.steps.findIndex((s) => re.test(s.raw));
    const zn = at(/^zoom into n1$/m), zp = at(/^zoom into p2$/m), li = at(/^lift k3$/m), pb = at(/^put back k3$/m), zo = at(/^zoom out$/m), za = at(/^zoom out all$/m);
    expect(src.steps[zn].raw).toMatch(/^lift n1$/m);
    expect(src.steps[zp].raw).toMatch(/^lift p2$/m);
    const up = (k: number, id: string) => !!box(c.frames[k], id)?.lift;
    for (let k = zn; k < za; k++) expect([k + 1, up(k, "n1")]).toEqual([k + 1, true]);
    for (let k = zp; k < zo; k++) expect([k + 1, up(k, "p2")]).toEqual([k + 1, true]);
    for (let k = li; k < pb; k++) expect([k + 1, up(k, "k3")]).toEqual([k + 1, true]);
    expect([up(zo, "p2"), up(zo, "n1")]).toEqual([false, true]);
    expect([up(za, "n1"), up(za, "p2")]).toEqual([false, false]);
    // the floor plan never changes: node 1 and cache-1 go back exactly
    const r = (k: number, id: string) => { const b = box(c.frames[k], id); return [b.x, b.y, b.w, b.h]; };
    expect([r(za, "n1"), r(zo, "p2")]).toEqual([r(0, "n1"), r(zn, "p2")]);
    // the captions say it, and the LLM view too
    expect(src.steps[zn].title).toMatch(/rises out of the cluster/);
    expect(src.steps[zp].title).toMatch(/rises out of node 1/);
    expect(sceneLlm(c)).toContain("lift n1 out of c");
    expect(sceneLlm(c)).toContain("lift p2 out of n1");
    expect(sceneLlm(c)).toMatch(/p2 settle back into place/);
  });
  test("Kubernetes: who takes part per step (the Redis focus kept: only redis while the camera goes to it)", () => {
    const c = comp(page(K8S).src);
    expect(c.frames.map(ids)).toEqual([null, ["n1", "p1", "p2"], ["k3", "p2"], ["k3"], ["k3"], ["k3b", "p2"], ["n1", "p1", "p2"], null]);
  });
  test("both samples: still check (wide, phone, narrow)", () => {
    for (const h of [K8S, PROXY]) { const { src } = page(h); for (const info of [src.info, { ...src.info, phone: "1" }, { ...src.info, narrow: "1" }]) expect([h, info, stillCheck(comp(src, info))]).toEqual([h, info, []]); }
  });
});
