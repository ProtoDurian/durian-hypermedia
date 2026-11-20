#!/usr/bin/env bun
// Bundle size per entry point, minified and gzipped, the way a host's bundler would ship it.
//   bun scripts/sizes.ts [--md]
// "first load": the entry and every chunk it imports at once; react and react-dom are left out (the host ships them
// once; their size is printed apart). The parser entry has no React.
// "later": chunks loaded only when needed (chart.js when a chart mounts, three.js when a reader opens 3D, mermaid).
// "own": the package's code alone, every dependency left out.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PKG = resolve(import.meta.dir, "..");
export const ENTRIES: [string, string][] = [
  ["durian-hypermedia (parse, llmView, check)", "src/index.ts"],
  ["durian-hypermedia/react (every part)", "src/react/index.tsx"],
  ["durian-hypermedia/react/strict (every part, host draws mermaid)", "src/react/strict.tsx"],
  ["durian-hypermedia/react/document (no part)", "src/react/document.tsx"],
  ["react/terminal", "src/react/terminal.tsx"],
  ["react/filetree", "src/react/filetree.tsx"],
  ["react/editor", "src/react/editor.tsx"],
  ["react/codewalk", "src/react/codewalk.tsx"],
  ["react/chart", "src/react/chart.tsx"],
  ["react/mermaid", "src/react/mermaid.tsx"],
  ["react/mermaid-host", "src/react/mermaid-host.tsx"],
  ["react/animation", "src/react/animation.tsx"],
  ["react/tierlist", "src/react/tierlist.tsx"],
  ["react/alignment", "src/react/alignment.tsx"],
  ["react/containers", "src/react/containers.tsx"],
];
const DEPS = ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "codehike", "chart.js", "three", "mermaid", "marked", "dompurify"];
const BASE = ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"];
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

async function measure(entry: string, external: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "dh-size-"));
  const r = await Bun.build({ entrypoints: [join(PKG, entry)], outdir: dir, splitting: true, format: "esm", minify: true, target: "browser", external, define: { "process.env.NODE_ENV": '"production"' } });
  if (!r.success) throw new Error(r.logs.join("\n"));
  const files = new Map<string, string>();
  for (const o of r.outputs) if (o.path.endsWith(".js")) files.set(o.path.split("/").pop()!, await o.text());
  const ent = r.outputs.find((o) => o.kind === "entry-point")!.path.split("/").pop()!;
  // static imports only ("import ... from './c.js'"), not import("./c.js")
  const first = new Set<string>();
  const visit = (f: string) => { if (first.has(f) || !files.has(f)) return; first.add(f); for (const m of files.get(f)!.matchAll(/(?:^|[;}\s])(?:import|export)\s*(?:[^"';()]*?\s*from\s*)?["']\.\/([^"']+)["']/g)) visit(m[1]); };
  visit(ent);
  let firstRaw = 0, firstGz = 0, laterRaw = 0, laterGz = 0;
  for (const [f, t] of files) { const gz = Bun.gzipSync(Buffer.from(t)).length; if (first.has(f)) { firstRaw += t.length; firstGz += gz; } else { laterRaw += t.length; laterGz += gz; } }
  rmSync(dir, { recursive: true, force: true });
  return { firstRaw, firstGz, laterRaw, laterGz };
}

export async function sizes() {
  const reactOnly = await (async () => { const dir = join(PKG, "node_modules/.cache/dh-size"); await Bun.write(join(dir, "e.ts"), `import * as R from "react"; import * as D from "react-dom/client"; console.log(R, D);`); const r = await Bun.build({ entrypoints: [join(dir, "e.ts")], minify: true, target: "browser", define: { "process.env.NODE_ENV": '"production"' }, root: PKG }); const t = await r.outputs[0].text(); rmSync(dir, { recursive: true, force: true }); return { raw: t.length, gz: Bun.gzipSync(Buffer.from(t)).length }; })();
  const rows: string[][] = [];
  for (const [name, entry] of ENTRIES) {
    const all = await measure(entry, entry === "src/index.ts" ? [] : BASE);
    const own = await measure(entry, DEPS);
    rows.push([name, `${kb(all.firstRaw)} / ${kb(all.firstGz)}`, all.laterRaw ? `${kb(all.laterRaw)} / ${kb(all.laterGz)}` : "none", `${kb(own.firstRaw + own.laterRaw)} / ${kb(own.firstGz + own.laterGz)}`]);
  }
  return { rows, react: reactOnly };
}
if (import.meta.main) {
  const { rows, react } = await sizes();
  const md = process.argv.includes("--md");
  if (md) {
    console.log(`React 18 + react-dom (the host ships these once): ${kb(react.raw)} / ${kb(react.gz)} gzip; not counted in the rows below except the parser row (no React).\n`);
    console.log("| Entry | First load (min / gzip) | Later, on demand (min / gzip) | Own code only (min / gzip) |\n| --- | --- | --- | --- |");
    for (const r of rows) console.log(`| ${r.join(" | ")} |`);
  } else {
    console.log(`react + react-dom: ${kb(react.raw)} / ${kb(react.gz)}`);
    for (const r of rows) console.log(r.join("  |  "));
  }
}
