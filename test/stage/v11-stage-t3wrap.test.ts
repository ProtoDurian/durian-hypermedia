// 0.7.0-rc.3 review MUST 4 (rc.5: now step tables, below): the layers example's routing table T3 at 1280: a card line of addresses ran past the card's
// border (digits draw wider than the measure says). Off a phone, a card line whose drawn width would cross the border
// breaks again by drawn width; a line that fits keeps its place. Public fixtures/stage/example-layers.dh.md.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
import { drawnW, type Item } from "../../src/core/stage-core";

const SRC = readFileSync(join(import.meta.dir, "../../fixtures/stage/example-layers.dh.md"), "utf8");
const fm = SRC.slice(0, SRC.indexOf("\n---\n", 4)), roles: Record<string, number> = {};
for (const m of fm.slice(fm.indexOf("\nroles:\n")).matchAll(/^  ([a-z][\w-]*): (?:c(\d)|\{[^}]*colour: c(\d)[^}]*\})/gm)) roles[m[1]] = +(m[2] ?? m[3]);
const section = (title: string, w: number) => {
  const at = SRC.indexOf(`\n## ${title}\n`); expect(at).toBeGreaterThan(0);
  const src = SRC.slice(at).match(/^```animation[^\n]*\n([\s\S]*?)^```$/m)![1];
  const parts = src.split(/^@step /m), steps = parts.slice(1).map((s, i) => { const nl = s.indexOf("\n"); return { title: s.slice(0, nl), raw: s.slice(nl + 1), line: i + 1 }; });
  beginDocument(); const c = compileStage(parts[0], steps, 1, {}, roles); expect(c.errors).toEqual([]);
  beginDocument(); return layoutStage(c.model, w);
};
type Box = Extract<Item, { k: "box" }>; type Text = Extract<Item, { k: "text" }>;

// 0.7.0-rc.5 (rc.4 review SHOULD 1 and 2): section 6's routing tables are step tables (prefix | learned from | next hop |
// out), the chosen row lit, as sections 5 and 8 draw theirs; routers A and B hold no room for a table shown later
const sh = (i: Item, k: number) => (i.on ? i.on.includes(k) : k >= (i.from ?? 1) && (!i.to || k <= i.to));
for (const w of [1280, 1180]) test(`6 at ${w}: routing tables T3 and T4 are step tables, the chosen row lit, every line inside the stage`, () => {
  const p = section("6. Two internet routers: how they know the way", w);
  for (const [k, name, chosen] of [[2, "T3", ""], [3, "T3", "198.51.100.128/26"], [4, "T3", "203.0.113.0/24"], [5, "T3", "203.0.113.0/24"], [8, "T4", ""], [9, "T4", "203.0.113.64/26"]] as const) {
    const ts = p.items.filter((it): it is Text => it.k === "text" && sh(it, k));
    const head = ts.find((t) => t.s === `routing table ${name}`)!; expect(head).toBeDefined();
    expect(ts.filter((t) => Math.abs(t.y - head.y) < 1).map((t) => t.s)).toEqual([`routing table ${name}`, "learned from", "next hop", "out"]); // four columns
    const lit = ts.filter((t) => t.y > head.y && t.ink === "acc:ink").map((t) => t.s);
    expect(lit[0] ?? "").toBe(chosen); // the chosen row is lit, from its prefix on (none in the step that only shows the table)
    for (const t of ts.filter((t) => t.y > head.y - 2 && (!t.anchor || t.anchor === "start"))) expect({ s: t.s, past: t.x + drawnW(t.s, t.f) > p.w - 4 }).toEqual({ s: t.s, past: false });
  }
  const step1 = p.items.filter((it): it is Box => it.k === "box" && sh(it, 1) && ["ra", "rb"].includes(String((it as { id?: string }).id)));
  expect(step1.length).toBe(2); for (const b of step1) expect(b.h).toBeLessThan(200); // no room held inside for a table (they were 330-530 px)
});
