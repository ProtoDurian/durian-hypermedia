// The chart fences of the five axis kinds (histogram boxplot violin funnel waterfall), read by the real chart-kinds parser:
// the sample, the part's fixtures and every chart fence of fixtures/format and fixtures/parts/samples. Shared by the test and the gallery.
import { readFileSync, readdirSync } from "node:fs";
import { Budget } from "../../../src/core/budget";
import { LIMITS } from "../../../src/safety";
import { parseChartKinds } from "../../../src/parts/chart-kinds/part";
import type { View } from "../../../src/parts/chart-kinds/compute";

export const MINE = ["histogram", "boxplot", "violin", "funnel", "waterfall"];
export const FILES = [
  "src/parts/chart-kinds/sample.md", "src/parts/chart-kinds/fixtures/good-kinds.dh.md", "src/parts/chart-kinds/fixtures/hostile-caps.dh.md",
  ...readdirSync("fixtures/format").filter((f) => /chart/.test(f)).map((f) => `fixtures/format/${f}`), "fixtures/parts/samples.dh.md",
];
export interface Fence { name: string; kind: string; title: string; views: View[]; stepTitles: string[] }
export function fences(): Fence[] {
  const out: Fence[] = [];
  for (const f of FILES) {
    const t = readFileSync(f, "utf8"); let n = 0;
    for (const m of t.matchAll(/^```chart\n([\s\S]*?)^```/gm)) {
      n++;
      const kind = /^kind:\s*(\w+)/m.exec(m[1])?.[1] ?? "";
      if (!MINE.includes(kind)) continue;
      const big = new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
      const d = parseChartKinds(m[1], 1, 1, LIMITS, big);
      if (d.errors.length || !d.steps.length) continue;
      out.push({ name: `${f.split("/").pop()!.replace(/\.dh\.md$|\.md$/, "")}#${n}-${kind}`, kind, title: d.title, views: d.steps.map((s) => s.view), stepTitles: d.steps.map((s) => s.title) });
    }
  }
  return out;
}
