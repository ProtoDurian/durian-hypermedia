// 0.7.0-rc.3 review, row 4 (one focus per step) and row 6 (the service mesh takes the real path, as kube-proxy does):
// in the kube-proxy scene (format 66) and the service mesh (format 53) a step lights one thing or moves one token, never
// two (and the array, map and tree scene, format 63: the tree's last two nodes light in steps of their own); the mesh's encrypted call leaves node 1 through its network card, crosses the network under the cluster and
// enters node 2 through its card: the scene draws that hop instead of a straight proxy-to-proxy line.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileScene } from "../src/core/scene";

const FIX = join(import.meta.dir, "../fixtures/format");
const MESH = "53-animation-a-service-mesh.dh.md", KP = "66-animation-a-packet-through-kube-proxy.dh.md", DATA = "63-animation-an-array-a-map-and-a-tree-in-one-scene.dh.md";
const parse = (name: string) => {
  const m = readFileSync(join(FIX, name), "utf8").match(/^```animation([^\n]*)\n([\s\S]*?)^```$/m)!;
  const [head, ...rest] = m[2].split(/^@step /m);
  const steps = rest.map((r, k) => { const [t, ...b] = r.split("\n"); return { title: t.trim(), raw: b.join("\n"), line: 100 * (k + 1) }; });
  const info = Object.fromEntries(m[1].trim().split(/\s+/).filter((w) => w.includes("=")).map((w) => w.split("=")));
  return { head, steps, info };
};
/** what a step puts in focus: each thing it lights and each token or arrow it sends (words, notes and says are not a focus) */
const focus = (raw: string) => raw.split("\n").filter((l) => /^(highlight|send) /.test(l.trim()));

describe("one focus per step (row 4)", () => {
  for (const name of [KP, MESH, DATA]) test(`${name.slice(0, 2)}: no step lights two things or sends two tokens`, () => {
    const { steps } = parse(name);
    expect(steps.filter((s) => focus(s.raw).length > 1).map((s) => s.title)).toEqual([]);
  });
});

describe("the service mesh goes through both nodes and the network under them (row 6)", () => {
  const { head, steps, info } = parse(MESH);
  test("it compiles wide and on a phone, with no camera moves", () => {
    expect(compileScene(head, steps, 1, info).errors).toEqual([]);
    expect(compileScene(head, steps, 1, { ...info, phone: "1", narrow: "1" }).errors).toEqual([]);
    expect(/\bcamera\b|\bzoom\b/.test(head + steps.map((s) => s.raw).join("\n"))).toBe(false);
  });
  test("each pod sits on its own node, beside that node's network card; the network is between the nodes", () => {
    expect(head).toMatch(/^group pa "pod: orders" in n1\b/m); expect(head).toMatch(/^group pb "pod: payments" in n2\b/m);
    expect(head).toMatch(/^box e1 "network card" in n1\b/m); expect(head).toMatch(/^box e2 "network card" in n2\b/m);
    expect(head).toMatch(/^box net "the network"/m);
  });
  test("no line and no send goes proxy to proxy; the call's hops run app, proxy, card, network, card, proxy, app", () => {
    expect(head).not.toMatch(/^pxa -> pxb/m);
    const hops = steps.flatMap((s) => focus(s.raw).filter((l) => l.startsWith("send ")).map((l) => l.replace(/^send (arrow |both )?("[^"]*" )?/, "")));
    expect(hops).not.toContain("pxa -> pxb");
    expect(hops.slice(0, 6)).toEqual(["a -> pxa", "pxa -> e1", "e1 -> net", "net -> e2", "e2 -> pxb", "pxb -> b"]);
    expect(hops.slice(-5)).toEqual(["pxa -> e1", "e1 -> net", "net -> e2", "e2 -> pxb", "pxb -> b"]);
  });
  test("the control plane pushes its retry rule once, to the orders proxy (the one that retries), one arrow in its step", () => {
    const pushes = steps.filter((s) => /cfg -> px[ab]/.test(s.raw)).map((s) => focus(s.raw));
    expect(pushes).toEqual([[expect.stringMatching(/^send arrow "retry: 2" cfg -> pxa$/)]]);
  });
});

// (rc.3 review row 4, the rule for two lit things) a step may light two or more things only when its words name ONE
// relation between them (compare, collide, talk to, read, an even load); separate facts get steps of their own. Every
// fixture step that lights 2+ things is on this list, so a new one is a choice someone makes on purpose
describe("2+ lit things only where the caption names one relation", () => {
  const KEEP = [
    "47 Bubble sort compares neighbours. 5 and 2 are out of order.",
    "47 It compares 5 and 8: in order, so they stay.",
    `49 hash("grape") mod 5 is also 2: a collision.`,
    "57 The load is even: the three cooks now have about the same amount of work.",
    "67 Look at one layer: TCP on both machines talks only to TCP. The layers above and below are its tools.",
    "67 The web server's reply goes back to the browser the same way, one layer per hop.",
    "73 The L2 cache asks RAM, and RAM has x (a hit). The disk is not needed.",
    "94 One run generates both files from it.",
  ];
  test("every fixture: the steps that light 2+ things are exactly the kept ones", () => {
    const got: string[] = [];
    for (const name of readdirSync(FIX).filter((f) => f.endsWith(".dh.md")).sort()) {
      for (const m of readFileSync(join(FIX, name), "utf8").matchAll(/^```animation([^\n]*)\n([\s\S]*?)^```$/gm)) {
        const [head, ...rest] = m[2].split(/^@step /m);
        const steps = rest.map((r, k) => { const [t, ...b] = r.split("\n"); return { title: t.trim(), raw: b.join("\n"), line: 100 * (k + 1) }; });
        const info = Object.fromEntries(m[1].trim().split(/\s+/).filter((w) => w.includes("=")).map((w) => w.split("=")));
        const c = compileScene(head, steps, 1, info);
        if (c.errors.length) continue;
        c.fx.forEach((x, i) => { if (new Set(x.highlights.map((h) => h.key)).size > 1) got.push(`${name.slice(0, 2)} ${steps[i].title}`); });
      }
    }
    expect(got).toEqual(KEEP);
  });
});
