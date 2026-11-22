// A seeded maker of random animations, for the work budget tests: things of every shape, containers of every kind,
// connectors, layers, families, and steps that send, say, highlight, push, pop, move, add, remove, zoom and set
// the camera. The same seed gives the same scene.
// grow: false: the steps add nothing to the stage (no add, no push), so more steps is a longer story, not a bigger scene
export interface GenSize { things: number; containers: number; edges: number; steps: number; layers?: number; label?: number; grow?: boolean }

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)] };
}

const SHAPES = ["box", "pill", "circle", "cylinder", "person", "diamond", "cloud", "dot"] as const;
const LAYOUTS = ["row", "column", "grid", "graph"] as const;
const WORDS = ["api", "cache", "queue", "worker", "db", "edge", "proxy", "shard", "replica", "client", "router", "auth"];

/** One animation's source, with the fence. */
export function genAnimation(seed: number, z: GenSize): string {
  const r = rng(seed);
  const word = () => r.pick(WORDS) + (z.label && r.next() < 0.3 ? "-" + "x".repeat(r.int(z.label)) : "");
  const L: string[] = ["```animation" + (r.next() < 0.3 ? " dir=down" : "")];
  const layers = z.layers ?? 0;
  for (let i = 0; i < layers; i++) L.push(`layer l${i} "layer ${i}"`);
  if (r.next() < 0.5) L.push(`family f0 "${word()}"`, `family f1 "${word()}"`);
  const conts: { id: string; kind: string }[] = [];
  for (let i = 0; i < z.containers; i++) {
    const kind = r.pick(["group", "group", "group", "queue", "stack", "list"] as const);
    const id = `g${i}`;
    const inside = conts.length && r.next() < 0.3 ? ` in ${r.pick(conts.filter((c) => c.kind === "group").map((c) => c.id).concat([""])) || ""}`.replace(/ in $/, "") : "";
    L.push(`${kind} ${id} "${word()} ${i}"${kind === "group" ? ` layout=${r.pick(LAYOUTS)}` : ""}${inside}${layers && !inside ? ` layer=l${r.int(layers)}` : ""}`);
    conts.push({ id, kind });
  }
  const groups = conts.filter((c) => c.kind === "group");
  const things: string[] = [];
  for (let i = 0; i < z.things; i++) {
    const id = `t${i}`;
    const g = groups.length && r.next() < 0.5 ? ` in ${r.pick(groups).id}` : layers ? ` layer=l${r.int(layers)}` : "";
    L.push(`${r.pick(SHAPES)} ${id} "${word()} ${i}"${g}${r.next() < 0.2 ? " is=f0" : ""}`);
    things.push(id);
  }
  const nodes = [...things, ...groups.map((c) => c.id)];
  for (let i = 0; i < z.edges && nodes.length > 1; i++) {
    const a = r.pick(nodes); let b = r.pick(nodes); if (b === a) b = nodes[(nodes.indexOf(a) + 1) % nodes.length];
    L.push(`${a} ${r.pick(["->", "-->", "--", "<->"])} ${b}${r.next() < 0.3 ? ` "${word()}"` : ""}`);
  }
  const stacks = conts.filter((c) => c.kind !== "group");
  let made = 0;
  const alive = new Set(things);
  for (let s = 0; s < z.steps; s++) {
    L.push(`@step step ${s}: ${word()}`);
    const n = 1 + r.int(3);
    for (let k = 0; k < n; k++) {
      if (k && r.next() < 0.2) L.push("then");
      const live = [...alive];
      const a = live.length ? r.pick(live) : null, b = live.length ? r.pick(live) : null;
      const x = r.next();
      if (a && b && a !== b && x < 0.25) L.push(`send ${r.next() < 0.4 ? "arrow " : ""}"${word()}" ${a} -> ${b}`);
      else if (a && x < 0.4) L.push(`highlight ${a}`);
      else if (a && x < 0.5) L.push(`say ${a}: ${word()} ${word()}`);
      else if (z.grow !== false && stacks.length && x < 0.6) { const q = r.pick(stacks); L.push(`push ${q.id} "${word()}" as p${made}`); alive.add(`p${made++}`); }
      else if (groups.length && a && x < 0.7) L.push(`move ${a} to ${r.pick(groups).id}`);
      else if (z.grow !== false && x < 0.8) { const id = `n${made++}`; L.push(`add ${r.pick(SHAPES)} ${id} "${word()}"${groups.length && r.next() < 0.5 ? ` in ${r.pick(groups).id}` : ""}`); alive.add(id); }
      else if (a && x < 0.87 && alive.size > 3) { L.push(`remove ${a}`); alive.delete(a); }
      else if (groups.length && x < 0.93) L.push(r.next() < 0.5 ? `zoom into ${r.pick(groups).id}` : "zoom out");
      else if (a) L.push(`camera ${a}${b && b !== a ? ` ${b}` : ""}`);
    }
  }
  L.push("```");
  return L.join("\n");
}
