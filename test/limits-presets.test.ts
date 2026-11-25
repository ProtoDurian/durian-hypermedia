// The two sets of caps (0.6.2): LIMITS for authored pages, UNTRUSTED_LIMITS for text nobody reviewed. The YAML pages here
// are made up with the counts of the largest real pages measured (one chart of about 1,800 nodes; a page of about
// 11,500 nodes and 80,500 characters of YAML): LIMITS reads them, UNTRUSTED_LIMITS refuses them. Counts only.
import { describe, expect, test } from "bun:test";
import { PART_LIMITS } from "../src/parts/generated/limits";
import { parse, LIMITS, UNTRUSTED_LIMITS } from "../src/index";
import { yamlNodeCount } from "../src/host/yaml";
import { workTotal } from "../src/core/work";

const F = "```";
/** a chart whose YAML has about `nodes` nodes and `chars` characters: a series of numbers padded to the length */
function chartOf(nodes: number, chars: number): { text: string; yaml: string } {
  const n = nodes - 8, pad = Math.max(1, Math.ceil((chars - 60) / n) - 2);
  const data = Array.from({ length: n }, (_, i) => String(i).padStart(pad, "1")).join(", ");
  const yaml = `kind: line\ntitle: Runs\nx: { label: run }\nseries:\n  - name: y\n    data: [${data}]`;
  return { text: `${F}chart\n${yaml}\n${F}\n`, yaml };
}
const yamlRefused = (d: ReturnType<typeof parse>) => d.problems.filter((p) => /YAML/.test(p.message)).length + d.blocks.filter((b: any) => /YAML/.test(String(b.initial?.error ?? (b.type === "error" ? b.message : "")))).length;

describe("the two sets of caps", () => {
  test("UNTRUSTED_LIMITS is LIMITS with smaller YAML, animation, chart and reference caps", () => {
    const smaller = ["maxYamlNodes", "maxPageYamlNodes", "maxPageYamlChars", "maxAnimWork", "maxPageAnimWork", "maxChartAnnotations", "maxChartSteps", "maxChartHeatCells", "maxCalcRows", "maxCalcInputs", "maxReferences", "maxReferenceBytes", "maxSvgBytes"] as const;
    for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
      if (k in PART_LIMITS) continue; // a folder part's own caps: test/parts.test.ts checks the strict one is no higher
      if ((smaller as readonly string[]).includes(k)) expect(UNTRUSTED_LIMITS[k]).toBeLessThan(LIMITS[k]);
      else expect(UNTRUSTED_LIMITS[k]).toBe(LIMITS[k]);
    }
    expect([LIMITS.maxYamlNodes, LIMITS.maxYamlChars, LIMITS.maxPageYamlNodes, LIMITS.maxPageYamlChars]).toEqual([3_000, 32_000, 24_000, 200_000]);
    expect([UNTRUSTED_LIMITS.maxYamlNodes, UNTRUSTED_LIMITS.maxYamlChars, UNTRUSTED_LIMITS.maxPageYamlNodes, UNTRUSTED_LIMITS.maxPageYamlChars]).toEqual([1_000, 32_000, 4_000, 64_000]);
    expect([LIMITS.maxAnimWork, LIMITS.maxPageAnimWork, UNTRUSTED_LIMITS.maxAnimWork, UNTRUSTED_LIMITS.maxPageAnimWork]).toEqual([15e6, 64e6, 3e6, 6e6]);
  });
  test("the largest real chart: LIMITS reads it, UNTRUSTED_LIMITS refuses it", () => {
    const c = chartOf(1_800, 10_000);
    expect(yamlNodeCount(c.yaml)).toBeGreaterThanOrEqual(1_786);
    expect(c.yaml.length).toBeGreaterThanOrEqual(9_000);
    expect(yamlRefused(parse(c.text))).toBe(0);
    expect(yamlRefused(parse(c.text, { limits: UNTRUSTED_LIMITS }))).toBeGreaterThan(0);
  });
  test("the largest real page of YAML: LIMITS reads all of it, UNTRUSTED_LIMITS refuses the charts past its page caps", () => {
    const charts = Array.from({ length: 7 }, () => chartOf(1_650, 11_550));
    const page = charts.map((c) => c.text).join("\n");
    expect(charts.reduce((n, c) => n + yamlNodeCount(c.yaml), 0)).toBeGreaterThanOrEqual(11_530);
    expect(charts.reduce((n, c) => n + c.yaml.length, 0)).toBeGreaterThanOrEqual(80_584);
    const d = parse(page);
    expect(yamlRefused(d)).toBe(0);
    expect(d.blocks.filter((b) => b.type === "chart").length).toBe(7);
    expect(yamlRefused(parse(page, { limits: UNTRUSTED_LIMITS }))).toBeGreaterThan(0);
  });
  test("an animation between the two caps: LIMITS draws it, UNTRUSTED_LIMITS refuses it", () => {
    const L = [`${F}animation`];
    for (let i = 0; i < 50; i++) L.push(`box b${i} "b${i}"`);
    for (let s = 0; s < 150; s++) L.push(`@step step ${s}`, `send "m" b${s % 50} -> b${(s * 7 + 3) % 50}`, `highlight b${(s * 3) % 50}`);
    L.push(F);
    const text = L.join("\n");
    const u0 = workTotal(); const d = parse(text); const units = workTotal() - u0;
    expect(units).toBeGreaterThan(UNTRUSTED_LIMITS.maxAnimWork);
    expect(units).toBeLessThan(LIMITS.maxAnimWork);
    expect(d.blocks.filter((b) => b.type === "error")).toEqual([]);
    const u = parse(text, { limits: UNTRUSTED_LIMITS });
    expect(u.blocks.filter((b: any) => b.type === "error" && /layout work/.test(b.message)).length).toBe(1);
  });
});
