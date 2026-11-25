// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// the nest block (tools/stage-nest.ts), wrappers as boxes inside boxes
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";
import { beginDocument, newBudget, BudgetError } from "../../src/core/stage-budget";
import { FONT, measure, type Item } from "../../src/core/stage-core";

const ROLES = { app: 1, sec: 2, tcp: 3, ip: 4, link: 5 };
const HEAD = [
  "nest: The packet | outside in",
  "  link fr: Ethernet frame | 117 bytes | to 00:00:5E:00:53:01; from 00:00:5E:00:53:0A; > FCS 0e be 36 b7",
  "  ip pk: IP packet | 99 bytes | TTL 64; from 192.0.2.10; to 203.0.113.80",
  "  app rq: HTTP request | 37 bytes | GET / HTTP/1.1",
].join("\n");
const steps = (...raws: string[]) => raws.map((raw, i) => ({ title: `S${i + 1}`, raw, line: 10 * (i + 1) }));
const compile = (head: string, ...raws: string[]) => compileStage(head, steps(...raws), 1, {}, ROLES);
const boxes = (items: Item[], id: string) => items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.id === id);
const texts = (items: Item[], s: string) => items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && i.s === s);
beforeEach(() => beginDocument());

test("wrappers sit inside each other, outside first, and the LLM view lists them outside in", () => {
  const c = compile(HEAD, "light rq", "light pk: TTL 64");
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), fr = boxes(p.items, "fr")[0], pk = boxes(p.items, "pk")[0], rq = boxes(p.items, "rq")[0];
  for (const [o, i] of [[fr, pk], [pk, rq]]) { expect(i.x).toBeGreaterThan(o.x); expect(i.y).toBeGreaterThan(o.y); expect(i.x + i.w).toBeLessThan(o.x + o.w); expect(i.y + i.h).toBeLessThan(o.y + o.h); }
  // the trailer field sits under what the frame holds
  const fcs = texts(p.items, "FCS 0e be 36 b7")[0];
  expect(fcs.y).toBeGreaterThan(pk.y + pk.h);
  const llm = stageLlm(c);
  expect(llm).toContain("The packet (outside in):\n- Ethernet frame (link), 117 bytes: to 00:00:5E:00:53:01; from 00:00:5E:00:53:0A; FCS 0e be 36 b7\n  - IP packet (ip), 99 bytes: TTL 64; from 192.0.2.10; to 203.0.113.80\n    - HTTP request (app), 37 bytes: GET / HTTP/1.1");
  expect(llm).toContain("Lit: HTTP request.");
  expect(llm).toContain("Lit: TTL 64 (IP packet).");
});

test("a wrapper put round later keeps its place from the start: one box per wrapper, shown from its step", () => {
  const c = compile(HEAD, "light rq", "show pk", "show fr");
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000);
  for (const id of ["fr", "pk", "rq"]) expect(boxes(p.items, id).length).toBe(1);
  expect(boxes(p.items, "rq")[0].on).toEqual([1, 2, 3]);
  expect(boxes(p.items, "pk")[0].on).toEqual([2, 3]);
  expect(boxes(p.items, "fr")[0].on).toEqual([3]);
  const llm = stageLlm(c);
  expect(llm).toContain("IP packet is put round what it holds.");
  expect(llm).toContain("- IP packet (ip), 99 bytes, from step 2: ");
});

test("set strikes the old value and lights the new one for one step; the next step keeps only the new value", () => {
  const c = compile(HEAD, "light fr", "set pk: TTL 64 => TTL 63", "light rq");
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000);
  const old = texts(p.items, "TTL 64"), now = texts(p.items, "TTL 63");
  expect(old.find((t) => t.strike)?.on).toEqual([2]);
  expect(old.find((t) => !t.strike)?.on).toEqual([1]);
  expect(now.find((t) => t.ink === "acc:ink")?.on).toEqual([2]);
  expect(now.find((t) => t.ink === "ink")?.on).toEqual([3]);
  expect(stageLlm(c)).toContain("IP packet: TTL 64 becomes TTL 63.");
});

test("unwrap strikes a wrapper in its step and hides it after; show brings a new one back; hide leaves no mark", () => {
  const c = compile(HEAD, "light fr", "unwrap fr", "light pk", "show fr\nfields fr: to 00:00:5E:00:53:A1; > FCS 40 44 8d ca", "hide fr");
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), fr = boxes(p.items, "fr");
  expect(fr[0].on).toEqual([1, 4]);
  const dashed = p.items.find((i) => i.k === "box" && i.dash && i.on?.includes(2));
  expect(dashed?.on).toEqual([2]);
  expect(texts(p.items, "Ethernet frame").find((t) => t.strike)?.on).toEqual([2]);
  expect(texts(p.items, "FCS 40 44 8d ca")[0].on).toEqual([4]);
  const llm = stageLlm(c);
  expect(llm).toContain("Ethernet frame is taken off.");
  expect(llm).toContain("A new Ethernet frame is put round it.");
  expect(llm).toContain("Ethernet frame is gone.");
});

test("title gives a wrapper a new title from its step; the head is as tall as the tallest title", () => {
  const c = compile(HEAD, "light rq", "title rq: HTTP request, sealed\nfields rq: unreadable without the keys");
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000);
  expect(texts(p.items, "HTTP request")[0].on).toEqual([1]);
  expect(texts(p.items, "HTTP request, sealed")[0].on).toEqual([2]);
  expect(stageLlm(c)).toContain("HTTP request is now HTTP request, sealed.");
});

test("a later nest's ids are its own: show and light go to the nest that has the id", () => {
  const c = compile(HEAD + "\nnest: The answer\n  app ans: HTTP answer | 3,978 bytes | HTTP/1.1 200 OK", "light rq", "show ans");
  expect(c.errors).toEqual([]);
  expect(boxes(layoutStage(c.model, 1000).items, "ans")[0].on).toEqual([2]);
});

for (const w of [1000, 340]) test(`every item stays inside the box and no word is under 11 px at ${w}`, () => {
  const c = compile(HEAD, "light rq", "set pk: TTL 64 => TTL 63; from 192.0.2.10 => from 198.51.100.7", "unwrap fr", "show fr\nfields fr: * to 00:00:5E:00:53:A1; from 00:00:5E:00:53:02; type 0x0800 (IPv4); > FCS 40 44 8d ca, at the end");
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, w);
  for (const i of p.items) {
    if (i.k === "box") { expect(i.x).toBeGreaterThanOrEqual(0); expect(i.x + i.w).toBeLessThanOrEqual(w); expect(i.y + i.h).toBeLessThanOrEqual(p.h); }
    if (i.k === "text") { expect(FONT[i.f].size).toBeGreaterThanOrEqual(11); const x0 = i.anchor === "end" ? i.x - measure(i.s, i.f) : i.x; expect(x0).toBeGreaterThanOrEqual(0); expect(x0 + measure(i.s, i.f)).toBeLessThanOrEqual(w); }
  }
});

test("fields in one step never overlap on a line (mono widths are exact)", () => {
  const c = compile(HEAD, "light rq", "light pk");
  const p = layoutStage(c.model, 1000), ts = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && i.f === "mono" && !!i.on?.includes(1));
  for (const a of ts) for (const b of ts) if (a !== b && a.y === b.y && a.x < b.x) expect(a.x + measure(a.s, a.f)).toBeLessThanOrEqual(b.x);
});

const REFUSE: [string, string, string][] = [
  ["no wrappers", "nest: Empty", "light x"],
  ["two indentations", "nest: X\n  link a: A | 1\n    ip b: B | 2", "light a"],
  ["a line that does not read", "nest: X\n  link a A | 1", "light a"],
  ["an unknown role", "nest: X\n  blue a: A | 1", "light a"],
  ["a doubled id", "nest: X\n  link a: A | 1\n  ip a: B | 2", "light a"],
  ["an empty title", "nest: X\n  link a:  | 1", "light a"],
  ["nine wrappers", "nest: X\n" + Array.from({ length: 9 }, (_, i) => `  link a${i}: A | 1`).join("\n"), "light a0"],
];
for (const [what, head, s1] of REFUSE) test(`refuses ${what}`, () => { const c = compile(head, s1, "light " + (head.match(/ (a\d?):/)?.[1] ?? "x")); expect(c.errors.length).toBeGreaterThan(0); expect(c.errors[0].line).toBeGreaterThan(0); });
const REFUSE_OPS: [string, string][] = [
  ["set on a field it does not have", "set pk: TTL 99 => TTL 98"],
  ["set without =>", "set pk: TTL 64 TTL 63"],
  ["fields on no wrapper", "fields zz: a; b"],
  ["fields twice in a step", "fields pk: a\nfields pk: b"],
  ["show twice", "show pk\nlight fr"],
  ["unwrap when gone", "unwrap fr\nunwrap fr"],
  ["drop, not a word of the nest", "drop fr"],
  ["light of a field it does not have", "light pk: TTL 99"],
  ["title with no words", "title pk: "],
];
for (const [what, raw] of REFUSE_OPS) test(`refuses ${what}`, () => { const c = compile(HEAD, raw, what === "show twice" ? "show pk" : "light rq"); expect(c.errors.length).toBeGreaterThan(0); expect(c.errors[0].line).toBeGreaterThanOrEqual(10); });

test("work doubles with the fields (linear)", () => {
  const work = (n: number) => { const b = beginDocument(); const c = compile(`nest: X\n  link a: A | 1 | ${Array.from({ length: n }, (_, i) => `field ${i}`).join("; ")}`, "light a", "light a"); layoutStage(c.model, 1000); stageLlm(c); return 2_000_000 - b.left().work; };
  const a = work(200), b = work(400);
  expect(b).toBeGreaterThan(a * 1.5); expect(b).toBeLessThan(a * 2.2);
});

test("a hostile field list stops on the document budget", () => {
  beginDocument(newBudget(5000));
  expect(() => { const c = compile(`nest: X\n  link a: A | 1 | ${"x; ".repeat(20000)}`, "light a", "light a"); layoutStage(c.model, 1000); }).toThrow(BudgetError);
});
