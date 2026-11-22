// The legacy chart guard is captured from ef56df7; run this file with the baseline tree and output path.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { usesChart11 } from "../../src/core/chart11";

export async function chartSnapshot(root: string, fixturesRoot = root) {
  const { parseDoc } = await import(join(root, "src/core/dh-lib.ts"));
  const { checkDoc } = await import(join(root, "src/core/doccheck.ts"));
  const { evalChart } = await import(join(root, "src/core/chart.ts"));
  const files: string[] = [];
  const scan = (dir: string) => {
    for (const f of readdirSync(join(fixturesRoot, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, f.name);
      if (f.isDirectory()) scan(path);
      else if (f.name.endsWith(".md")) files.push(path);
    }
  };
  scan("fixtures"); scan("test");
  const result: Record<string, unknown> = {};
  for (const file of files) {
    const text = readFileSync(join(fixturesRoot, file), "utf8");
    let index = 0;
    for (const match of text.matchAll(/^```chart[^\n]*\n([\s\S]*?)^```[ \t]*$/gm)) {
          const node = { body: match[1] };
          const key = file + "#" + index++;
          let spec: any;
          try { spec = Bun.YAML.parse(node.body); } catch { continue; }
          if (usesChart11(spec)) continue;
          const source = "```chart\n" + node.body + "\n```\n";
          const single = parseDoc("legacy.dh.md", source);
          const issues: any[] = [];
          checkDoc(single, undefined, issues);
          result[key] = { source, issues, evaluation: evalChart(spec) };
    }
  }
  return JSON.parse(JSON.stringify(result));
}
if (import.meta.main) {
  const [root, output] = process.argv.slice(2);
  await Bun.write(output, JSON.stringify(await chartSnapshot(resolve(root), resolve(".")), null, 2) + "\n");
}
