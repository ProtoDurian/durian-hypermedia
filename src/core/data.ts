// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// data: data structures as entities that live with the rest of a scene (format version 10).
//   map cache "session cache": u7: Ana, u12: Ben        a dictionary: key and value per entry; entries are cache.u7 ...
//   map cache "session cache" buckets=4: u7: Ana        the same, drawn as a hash table: each entry sits in bucket
//                                                       hash(key) mod 4, where hash(key) is the sum of its letters' codes
//   put cache u9: Cy                                     adds the entry, or gives an existing key its new value
//   get cache u7                                         a lookup: the entry is lit for this step, and in a hash table
//                                                        its bucket is framed (a quiet outline): one focus per step
//   get ids 3                                            in an array: the cell at index 3
// A map is drawn with the parts the engine already has: a table with the columns key and value, or buckets that hold
// one box per entry. So it lays out, zooms (closed=yes, zoom into) and draws in 2D and 3D like any container.
// Pure: tools/scene.ts calls these for its parse, play and LLM view.
import type { Decl, Op, State, Ent, Fx, SceneError, Frame, SizeTok } from "./scene";
import { headW } from "./scene";
import { hiddenBy, openSet } from "./story";

// a map's key becomes part of an id (cache.u7), so it is letters, digits, - and _
export const KEY_RE = /^[A-Za-z0-9_-]+$/;
// the entries of a map, written after its colon: "u7: Ana, u12: Ben"
export function mapEntries(tail: string, id: string): string[] {
  const out: string[] = [], keys = new Set<string>();
  for (const raw of tail.split(",").map((x) => x.trim()).filter(Boolean)) {
    const k = raw.indexOf(":");
    if (k < 1) throw new Error(`map ${id}: an entry is key: value, comma between entries (map ${id}: u7: Ana, u12: Ben); got "${raw}"`);
    const key = raw.slice(0, k).trim(), value = raw.slice(k + 1).trim();
    if (!KEY_RE.test(key)) throw new Error(`map ${id}: the key "${key}" becomes part of an id (${id}.${key}), so it is letters, digits, - and _ only`);
    if (!value) throw new Error(`map ${id}: the key ${key} has no value: ${key}: <value>`);
    if (keys.has(key)) throw new Error(`map ${id}: the key ${key} is written twice; a map holds each key once`);
    keys.add(key);
    out.push(`${key}: ${value}`);
  }
  return out;
}
export const entryOf = (v: string): [string, string] => { const k = v.indexOf(":"); return [v.slice(0, k).trim(), v.slice(k + 1).trim()]; };
// the hash the page shows: the sum of the key's character codes, mod the bucket count (a real map uses a stronger
// hash; the idea, one key to one bucket, every time, is the same)
export const hashOf = (key: string, n: number) => [...key].reduce((a, ch) => a + ch.charCodeAt(0), 0) % n;
const bucketId = (m: string, b: number) => `${m}.b${b}`;

// map <id> ["label"] [buckets=<n>] ...: the add lines it stands for: the container first, then one per entry
export function mapOps(d: Decl, line: number): { head: Op; entries: Op[] } {
  const n = d.kv.buckets ? +d.kv.buckets : 0;
  const kv = { ...d.kv }; delete kv.buckets;
  const entries = (d.values ?? []).map(entryOf);
  if (n) {
    for (const [k] of entries) if (/^b\d+$/.test(k)) throw new Error(`map ${d.id}: the key ${k} looks like a bucket's id (${d.id}.b0 ...); call it something else`);
    return { head: { op: "add", decl: { ...d, kind: "buckets", kv: { ...kv, count: String(n) }, values: null }, line }, entries: entries.map(([k, v]) => ({ op: "add", decl: entryDecl(d.id, k, v, bucketId(d.id, hashOf(k, n))), line })) };
  }
  return { head: { op: "add", decl: { ...d, kind: "table", kv, values: ["key", "value"] }, line }, entries: entries.map(([k, v]) => ({ op: "add", decl: { kind: "row", id: `${d.id}.${k}`, label: null, parent: d.id, under: null, side: null, place: {}, anchor: null, kv: {}, values: [k, v] }, line })) };
}
const entryDecl = (m: string, k: string, v: string, parent: string): Decl => ({ kind: "box", id: `${m}.${k}`, label: `${k}: ${v}`, parent, under: null, side: null, place: {}, anchor: null, kv: {}, values: null });

// after the container's add line: it remembers it is a map (and how many buckets); its buckets are named <map>.b0 ...,
// so a key never meets a bucket's name
export function markMap(s: State, d: Decl) {
  const e = s.ents[d.id];
  const n = d.kv.buckets ? +d.kv.buckets : 0;
  e.map = n;
  for (let b = 0; b < n; b++) {
    const from = `${d.id}.${b}`, to = bucketId(d.id, b), x = s.ents[from];
    if (!x) continue;
    delete s.ents[from]; x.id = to; s.ents[to] = x;
    e.kids = e.kids.map((k) => (k === from ? to : k));
  }
}

const isMap = (e: Ent | undefined) => e?.map != null;
const keysOf = (s: State, m: Ent) => Object.values(s.ents).filter((e) => e.id.startsWith(`${m.id}.`) && (m.map ? e.parent?.startsWith(`${m.id}.b`) : e.parent === m.id) && e.kind !== "bucket").map((e) => e.id.slice(m.id.length + 1));

// put <map> <key>: <value>
export function applyPut(s: State, op: Extract<Op, { op: "put" }>, f: Fx, add: (d: Decl) => void, refuse: (m: string) => Error) {
  const m = s.ents[op.m];
  if (!m) throw refuse(`no map "${op.m}" on the stage`);
  if (!isMap(m)) throw refuse(`put works on a map, and ${op.m} is a ${m.kind}; declare it as map ${op.m} "label": key: value`);
  const id = `${op.m}.${op.key}`, e = s.ents[id];
  if (e) {
    if (m.map) e.label = `${op.key}: ${op.value}`; else { e.cells = [op.key, op.value]; e.label = `${op.key} · ${op.value}`; }
    f.touched.push(id);
    return;
  }
  if (m.map) add(entryDecl(op.m, op.key, op.value, bucketId(op.m, hashOf(op.key, m.map))));
  else add({ kind: "row", id, label: null, parent: op.m, under: null, side: null, place: {}, anchor: null, kv: {}, values: [op.key, op.value] });
}

// get <map> <key>, get <array> <index>: what is lit
export function getTarget(s: State, m: string, key: string, refuse: (m: string) => Error): { entry: Ent; bucket: Ent | null } {
  const e = s.ents[m];
  if (!e) throw refuse(`no map or array "${m}" on the stage`);
  if (isMap(e)) {
    const x = s.ents[`${m}.${key}`];
    if (!x) { const ks = keysOf(s, e); throw refuse(`get ${m} ${key}: ${m} has no key ${key}${ks.length ? ` (keys: ${ks.join(", ")})` : ""}; put it first: put ${m} ${key}: <value>`); }
    return { entry: x, bucket: e.map ? s.ents[x.parent!] ?? null : null };
  }
  if (e.kind === "array") {
    if (!/^\d+$/.test(key)) throw refuse(`get ${m} ${key}: an array is read by index, a whole number from 0: get ${m} 2`);
    const x = s.ents[e.kids[+key]];
    if (!x) throw refuse(`get ${m} ${key}: ${m} has ${e.kids.length} cells (index 0 to ${e.kids.length - 1})`);
    return { entry: x, bucket: null };
  }
  throw refuse(`get reads a map by key or an array by index, and ${m} is a ${e.kind}; to light anything, write highlight ${m}`);
}
export function applyGet(s: State, op: Extract<Op, { op: "get" }>, f: Fx, refuse: (m: string) => Error) {
  const { entry, bucket } = getTarget(s, op.m, op.key, refuse);
  // (0.7.0-rc.3) one focus per step: the entry is the one lit thing; its bucket is only framed, and kept in view
  if (bucket) { (f.framed ??= []).push(bucket.key); f.touched.push(bucket.id); }
  f.highlights.push({ key: entry.key, tone: "acc" });
  f.touched.push(entry.id);
}

// at the end of a step: a get may not point into a closed thing the story has not zoomed into
export function dataChecks(s: State, ops: Op[]): SceneError[] {
  const out: SceneError[] = [];
  const open = openSet(s);
  for (const op of ops) {
    if (op.op !== "get") continue;
    const id = s.ents[op.m]?.map != null ? `${op.m}.${op.key}` : s.ents[op.m]?.kids[+op.key];
    if (!id || !s.ents[id]) continue;
    const by = hiddenBy(s, id, open);
    if (by) out.push({ line: op.line, msg: `get ${op.m} ${op.key} reads inside ${by}, which is closed (its inside is drawn faint, without words): zoom into ${by} in this step or an earlier one` });
  }
  return out;
}

// the LLM view: a map in the setup line, and what get and put do under a caption
export function mapDesc(s: State, e: Ent): string {
  const label = e.label ? ` "${e.label}"` : "";
  if (e.map) {
    const items = e.kids.flatMap((b) => s.ents[b]?.kids.map((k) => `${s.ents[k].label} (bucket ${b.slice(e.id.length + 2)})`) ?? []);
    return `map ${e.id}${label}${e.closed ? " closed" : ""}, ${e.map} buckets, a key's bucket is the sum of its letters' codes mod ${e.map}: ${items.join(", ") || "empty"}`;
  }
  return `map ${e.id}${label}${e.closed ? " closed" : ""}: ${e.kids.map((k) => (s.ents[k].cells ?? []).join(": ")).join(", ") || "empty"}`;
}
export function dataLlm(prev: State, next: State, ops: Op[]): string[] {
  const out: string[] = [];
  for (const op of ops) {
    if (op.op === "put") out.push(`put ${op.m} ${op.key}: ${op.value}${prev.ents[`${op.m}.${op.key}`] ? " (it replaces the old value)" : ""}`);
    else if (op.op === "get") {
      const m = next.ents[op.m];
      if (m?.map != null) {
        const x = next.ents[`${op.m}.${op.key}`];
        const v = m.map ? (x?.label ?? "").replace(/^[^:]*:\s*/, "") : x?.cells?.[1] ?? "";
        out.push(`get ${op.m} ${op.key} -> ${v}${m.map ? ` (bucket ${hashOf(op.key, m.map)})` : ""}`);
      } else if (m) out.push(`get ${op.m} ${op.key} -> ${next.ents[m.kids[+op.key]]?.label ?? "?"}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- closed, with content (format version 10)
// A closed data structure (closed=yes or hidden, not zoomed into) must read as closed with content, not as empty or
// not loaded: its title says how many it holds ("sorted ids · 4 items"), when that fits its width. Zoomed into, the
// title is plain again. Nothing moves: only the title's words change. applyDepth (tools/depth.ts) calls it per frame.
const NOUN: Record<string, [string, string]> = { array: ["item", "items"], list: ["item", "items"], stack: ["item", "items"], queue: ["item", "items"], tree: ["node", "nodes"] };
export function countOf(s: State, e: Ent): string | null {
  const one = (n: number, w: [string, string]) => `${n} ${w[n === 1 ? 0 : 1]}`;
  if (isMap(e)) return one(keysOf(s, e).length, ["key", "keys"]);
  const w = NOUN[e.kind];
  return w ? one(e.kids.filter((k) => s.ents[k] && !s.ents[k].ghost).length, w) : null;
}
export function closedCounts(f: Frame, s: State): Frame {
  const shut = new Set(f.boxes.filter((b) => b.key > 0 && (b.faint || b.hidden)).map((b) => b.ent.parent));
  const k = (t: string) => headW(t, { head: 13 } as SizeTok); // a title's width is in proportion to its words
  for (const b of f.boxes) {
    if (b.key <= 0 || b.faint || b.hidden || !b.lbl || !b.label || !shut.has(b.id)) continue;
    const e = s.ents[b.id];
    if (!e || !(e.closed || e.hide)) continue;
    const n = countOf(s, e);
    if (!n) continue;
    const t = `${b.label} · ${n}`, w = ((b.lbl.w - 2) * k(t)) / k(b.label) + 2, pad = b.lbl.x - b.x;
    if (b.lbl.x + w > b.x + b.w - Math.max(0, pad) + 0.5) continue; // it does not fit: the plain title stays
    b.label = t; b.lines = [t]; b.lbl = { ...b.lbl, w };
  }
  return f;
}
