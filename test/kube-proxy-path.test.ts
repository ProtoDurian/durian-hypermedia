// 0.7.0-rc.3, the owner's row 6: kube-proxy sends nothing itself, and the packet goes the real way. The frontend's veth,
// node 1's kernel (a rule kube-proxy wrote rewrites the service IP to web-2's), node 1's network card, the VPC, node 2's
// network card and kernel, web-2's veth; the reply comes back the same hops and node 1's conntrack undoes the rewrite.
// The scene is flat (2D) and holds one fixed view. The other Kubernetes and service-mesh samples lose the same shortcut.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileScene } from "../src/core/scene";

const FIX = join(import.meta.dir, "../fixtures/format");
const read = (name: string) => readFileSync(join(FIX, name), "utf8");
const KP = "66-animation-a-packet-through-kube-proxy.dh.md";
const fence = (text: string) => text.match(/^```animation([^\n]*)\n([\s\S]*?)^```$/m)!;
const scene = (info: Record<string, string> = {}) => {
  const m = fence(read(KP)), [head, ...rest] = m[2].split(/^@step /m);
  const steps = rest.map((r, k) => { const [t, ...b] = r.split("\n"); return { title: t.trim(), raw: b.join("\n"), line: 100 * (k + 1) }; });
  return { head, steps, c: compileScene(head, steps, 1, { layout: "row", ...info }) };
};

describe("kube-proxy: through node 1's card, the VPC and node 2's card", () => {
  // (0.7.0-rc.5, review SHOULD 13) a step whose words say conntrack writes or undoes the rewrite lights conntrack, and
  // only it; the rule's rewrite lights the rules box in a step of its own (step 7 said conntrack but lit the rules)
  test("what a step says conntrack does, it lights conntrack (ct1) for", () => {
    const { steps } = scene();
    const lit = (raw: string) => raw.split("\n").filter((l) => l.startsWith("highlight ")).map((l) => l.slice(10).trim());
    const says = steps.filter((s) => /conntrack (writes|undoes)/.test(s.title));
    expect(says.length).toBe(2);
    for (const s of says) expect([s.title, lit(s.raw)]).toEqual([s.title, ["ct1"]]);
    const rw = steps.find((s) => /rewrites the destination/.test(s.title))!;
    expect([rw.title.includes("conntrack"), lit(rw.raw)]).toEqual([false, ["r1"]]);
  });
  test("the fixture is the flat scene (layout=row, no 3d), 23 steps, no errors wide or on a phone", () => {
    expect(fence(read(KP))[1].trim()).toBe("layout=row");
    expect(readdirSync(FIX).some((f) => f.includes("3d-only-a-packet-through-kube-proxy"))).toBe(false);
    const { steps, c } = scene();
    expect(steps.length).toBe(23); expect(c.errors).toEqual([]); expect(c.frames.length).toBe(23);
    expect(scene({ phone: "1", narrow: "1" }).c.errors).toEqual([]);
  });
  test("the path in order, there and back: no hop from node 1's rules straight into a pod", () => {
    const { steps } = scene();
    const sends = steps.flatMap((s) => s.raw.split("\n").filter((l) => l.startsWith("send ")).map((l) => l.replace(/"[^"]*" /, "").slice(5)));
    expect(sends).toEqual(["fe -> v1", "v1 -> r1", "r1 -> e1", "e1 -> vr", "vr -> e2", "e2 -> rt2", "rt2 -> v2", "v2 -> w2", "w2 -> v2", "v2 -> rt2", "rt2 -> e2", "e2 -> vr", "vr -> e1", "e1 -> ct1", "ct1 -> v1", "v1 -> fe"]);
    expect(sends).not.toContain("r1 -> w2");
  });
  test("kube-proxy only writes rules; the VPC's rule is named; conntrack undoes the rewrite; no camera moves", () => {
    const { head, steps } = scene(), text = [head, ...steps.map((s) => s.title + "\n" + s.raw)].join("\n");
    expect(text).not.toMatch(/send [^\n]*kp[12]\b/);
    expect(text).toMatch(/box vr "VPC"[^\n]*route table/);
    expect(text).toMatch(/conntrack undoes the rewrite/);
    expect(text).not.toMatch(/pod to pod/);
    for (const w of ["camera", "zoom", "lift", "closed="]) expect([w, text.includes(w)]).toEqual([w, false]);
  });
  test("on a phone node 1 stands above the VPC, above node 2", () => {
    const f = scene({ phone: "1", narrow: "1" }).c.frames[0], at = (id: string) => f.boxes.find((b) => b.id === id)!;
    expect(at("n1").y + at("n1").h).toBeLessThan(at("vr").y);
    expect(at("vr").y + at("vr").h).toBeLessThan(at("n2").y);
  });
});

describe("the other Kubernetes and service-mesh samples: no shortcut either", () => {
  test("no fixture says a packet goes pod to pod or that a service routes on its own", () => {
    for (const f of readdirSync(FIX)) expect([f, /pod to pod|A service routes to pods|The service spreads requests/.test(read(f))]).toEqual([f, false]);
  });
  test("pods and a service: rules on every node pick a pod (52, and the same scene in 72)", () => {
    for (const f of ["52-animation-pods-nodes-a-service.dh.md", "72-3d-a-2d-scene-unchanged.dh.md"]) {
      expect(read(f)).toMatch(/rules on every node pick one/); expect(read(f)).toMatch(/The rules now pick among the running pods only/);
    }
  });
  test("the service mesh: mutual TLS out of node 1's card, across the network, into node 2's card (53)", () => {
    expect(read("53-animation-a-service-mesh.dh.md")).toMatch(/sends it from its pod.s IP, out through node 1.s network card/); expect(read("53-animation-a-service-mesh.dh.md")).toMatch(/The network under the cluster carries the encrypted bytes toward node 2/);
  });
});
