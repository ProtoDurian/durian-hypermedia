// llm3: the one engine's LLM view says what the old view said. Each layout adds the facts only it holds through its one
// hook (LayoutPlugin.llm), and core/llm.ts places a `Step k: ` line under step k. One test per family of facts the old
// view had and the new one lost: a token's fields, a table's rows, a chart's axis and values, a timeline's items, a
// step panel, a key, and the cap note of a block too large to draw.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { llmView, parse } from "../../../src/index";
import { llm } from "../../../src/engine/core/llm";
import { states } from "../../../src/engine/core/states";
import type { LayoutPlugin, Model } from "../../../src/engine/types";
import { EXAMPLES } from "./examples";

const FX = join(import.meta.dir, "../../../fixtures");
/** the new engine's LLM view of the n-th animation fence of a fixture, read alone (as the gate's LLM diff reads it) */
function viewOf(file: string, n = 1): string {
  const text = readFileSync(join(FX, file), "utf8");
  const fm = text.startsWith("---\n") ? text.slice(0, text.indexOf("\n---", 4) + 4) : "";
  const fences = [...text.matchAll(/^```animation([^\n]*)\n([\s\S]*?)\n```$/gm)];
  const f = fences[n - 1]; if (!f) throw new Error(`no fence ${n} in ${file}`);
  const page = `${fm ? fm + "\n\n" : ""}\`\`\`animation${f[1]}\n${f[2]}\n\`\`\`\n`;
  return llmView(parse(page, { path: basename(file), engine: "new" }), { engine: "new" });
}
/** the lines before step 1 (the setup, with the layouts' setup facts) */
const setupOf = (view: string): string => view.slice(0, view.indexOf("\n1. "));
/** the lines under step k's caption (up to the next step) */
function stepBody(view: string, k: number): string {
  const lines = view.split("\n"), at = lines.findIndex((l) => l.startsWith(`${k}. `));
  if (at < 0) return "";
  const end = lines.findIndex((l, i) => i > at && /^\d+\. /.test(l));
  return lines.slice(at + 1, end < 0 ? undefined : end).join("\n");
}

describe("llm3: the facts only a layout holds", () => {
  test("tokens: a nested packet's fields, at the start and after a step changes them", () => {
    const v = viewOf("stage/example-layers.dh.md", 1);
    expect(v).toContain("Ethernet frame (link), 64 bytes");
    expect(v).toContain("FCS 4f 32 f5 0b");
    expect(v).toContain("target 00:00:00:00:00:00 (not known) 192.0.2.1");
    expect(stepBody(v, 5)).toContain("FCS ec 4e aa 87");
    expect(stepBody(v, 5)).toContain("ARP request is now ARP reply");
  });
  test("table: a routing table's columns and rows, under the step that shows it", () => {
    const body = stepBody(viewOf("stage/example-layers.dh.md", 11), 1);
    expect(body).toContain("Columns: the server's table T5 | learned from | next hop | out");
    expect(body).toContain("0.0.0.0/0 | default (set by hand) | 203.0.113.65 | copper to B, matches, longest: chosen");
  });
  test("chart: a bar block's axis at the top, its values and limit under their steps", () => {
    const v = viewOf("stage/22-animation-a-bar-chart-in-a-scene.dh.md");
    expect(setupOf(v)).toContain("axis 0, 0.5, 1, 1.5");
    expect(stepBody(v, 1)).toContain("Values: Mon 0.7, Tue 0.8, Wed 0.9, Thu 1, Fri 1.4, Sat 1.3, Sun 0.9.");
    expect(stepBody(v, 2)).toContain("Limit 1.2: cap 1.2×.");
    const g = viewOf("gt/09-election-count.dh.md");
    expect(g).toContain("axis 0, 20, 40, 60, 80");
    expect(g).toContain("Values: Ada Lin 26, Ben Ortiz 14.");
  });
  test("timeline: the time axis and its items with the setup, a phase under its step", () => {
    const v = viewOf("stage/13-test-a-late-timeline.dh.md");
    expect(setupOf(v)).toContain("Time from 0 to 24 seconds (from step 3):");
    expect(setupOf(v)).toContain("First: empty 0 to 6 (dashed)");
    expect(stepBody(v, 2)).toContain("At: review.");
  });
  test("panel: a step's card panel in a lanes scene, under that step", () => {
    const v = viewOf("stage/example-layers.dh.md", 2);
    expect(stepBody(v, 1)).toContain("SYN, laptop to server (seq 419; MSS 1460; window 64240)");
    expect(stepBody(v, 2)).not.toContain("seq 419");
  });
  test("key: the lanes' key under the step that adds it", () => {
    const body = stepBody(viewOf("gt/01-git-rebase.dh.md"), 4);
    expect(body).toContain("Key (commit): original commit.");
    expect(body).toContain("Key (replay): copied by the rebase.");
  });
  test("cap note: a block over the things cap says so, with the engine too", () => {
    const text = readFileSync(join(FX, "hostile/09-animation-too-many-things.dh.md"), "utf8");
    for (const engine of ["old", "new"] as const) expect(llmView(parse(text, { path: "09.dh.md", engine }), { engine })).toContain("not shown: about 1201 things on the stage; the limit is 300");
  });
});

describe("llm3: the core's words", () => {
  test("a layout's `Step k:` line goes under step k, `End:` last, any other line with the setup", () => {
    const m = EXAMPLES.B();
    const plug: LayoutPlugin = { name: m.layout, place: () => ({ w: 0, h: 0, at: () => ({}), decor: () => [] }), llm: () => ["Setup fact.", "Step 2: two's fact.", "End: last words.", "Step 99: out of range."] };
    const v = llm(m as Model, states(m), { [m.layout]: plug });
    expect(setupOf(v)).toContain("Setup fact.");
    expect(stepBody(v, 2).split("\n").at(-1)).toBe("   two's fact.");
    expect(v.split("\n").at(-1)).toBe("last words.");
    expect(v).toContain("Step 99: out of range.");
  });
  test("a tone says what it means; a cleared tone is back to normal; a dashed line's send says dashed", () => {
    const v = viewOf("gt/11-cache-stampede.dh.md");
    expect(v).toMatch(/turns warn \(a warning\)/);
    expect(v).toMatch(/turns bad \(in trouble\)/);
    expect(v).toMatch(/tone cleared, back to normal/);
    expect(viewOf("gt/01-git-rebase.dh.md")).toContain("c -> c2: same change (dashed)");
  });
});
