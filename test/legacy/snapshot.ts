// A snapshot of what the plain (pre-version-11-words) charts give: every fixture's doccheck issues, each chart's
// first evaluation and the LLM view. Taken on the commit before the chart words were added (see chart-legacy.test.ts).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** the fixtures that use the new chart words are not part of the guard */
const NEW = /^format\/7[4-9]-chart-/;

export async function snapshot(root: string): Promise<Record<string, unknown>> {
  const { parse, check } = await import(join(root, "src/index"));
  const out: Record<string, unknown> = {};
  const files: string[] = [];
  for (const dir of ["fixtures", "fixtures/format", "fixtures/hostile", "test/legacy"]) {
    for (const f of readdirSync(join(root, dir)).sort()) if (f.endsWith(".md")) files.push(join(dir, f));
  }
  for (const f of files) {
    const rel = f.replace(/^fixtures\//, "");
    if (NEW.test(rel)) continue;
    const doc = parse(readFileSync(join(root, f), "utf8"), { path: rel });
    const charts: unknown[] = [];
    const walk = (bs: any[]) => bs.forEach((b) => {
      if (b.type === "chart") charts.push({ controls: b.controls, x: b.initial?.x, series: b.initial?.series, error: b.initial?.error, y: b.initial?.y });
      if (b.items) b.items.forEach((i: any) => i.blocks && walk(i.blocks));
      if (b.blocks) walk(b.blocks);
    });
    walk(doc.blocks);
    out[rel] = { issues: check(doc).map((i: any) => `${i.level} ${i.line ?? ""} ${i.message}`), charts, llm: doc.llm };
  }
  return out;
}
