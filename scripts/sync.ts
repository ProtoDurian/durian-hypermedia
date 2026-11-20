#!/usr/bin/env bun
// Copy the current Durian Hypermedia sources into the package, with the rewrites the package needs.
//   bun scripts/sync.ts [<source folder>]      (default: the folder above this package)
// Re-runnable: it only writes src/core/, src/ui/, SPEC.md and scripts/cdp.ts. Package-only code lives elsewhere
// in src/ (index.ts, document.ts, safety.ts, react/, host/, styles/) and is never touched.
//
// What it copies:
//   tools/dh-lib.ts, expr.ts, chart.ts, scene.ts, doccheck.ts and every tools/ module they import -> src/core/
//   site/src/* (components and CSS; not client.tsx, the site's own page script)                -> src/ui/
//   SPEC.md -> SPEC.md;  tools/cdp.ts -> scripts/cdp.ts (the headless-Chrome driver the CSP check uses)
// Rewrites:
//   node:fs, node:path, node:child_process, node:crypto  -> src/host/* (pure stand-ins: the package never reads files)
//   Bun.YAML.parse(...)                                   -> yamlParse(...) from src/host/yaml (Bun, or a parser the host sets)
//   "../../tools/x" in the UI                             -> "../core/x"
//   names of the people and projects that made it         -> neutral words (scripts/public-text.ts)
// Any other node: import fails the sync, so a new dependency is never copied in silently.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { publicText, loadRewrites } from "./public-text";

const PKG = resolve(import.meta.dir, "..");
const SRC = resolve(process.argv[2] ?? join(PKG, ".."));
const CORE_ROOTS = ["dh-lib.ts", "expr.ts", "chart.ts", "scene.ts", "doccheck.ts"];
const UI_SKIP = new Set(["client.tsx"]);
const HOST: Record<string, string> = { "node:fs": "fs", "node:path": "path", "node:child_process": "child_process", "node:crypto": "crypto" };
const MARK = "// Synced from the Durian Hypermedia sources by scripts/sync.ts: edit the source, not this copy.\n";

const read = (p: string) => readFileSync(p, "utf8");
const nRewrites = loadRewrites(SRC);
const problems: string[] = [];

function rewriteNode(text: string, file: string, hostRel: string): string {
  return text.replace(/from\s+"(node:[a-z_]+)"/g, (m, mod: string) => {
    if (!HOST[mod]) { problems.push(`${file}: imports ${mod}, which has no stand-in in src/host/`); return m; }
    return `from "${hostRel}/${HOST[mod]}"`;
  });
}
function rewriteYaml(text: string, hostRel: string): string {
  if (!/Bun\.YAML\.parse\(/.test(text)) return text;
  const out = text.replace(/Bun\.YAML\.parse\(/g, "yamlParse(");
  return `import { yamlParse } from "${hostRel}/yaml";\n` + out;
}
function header(text: string): string {
  const body = text.replace(/^#!.*\n/, "");
  return MARK + body;
}
const leftover = (text: string, file: string) => {
  if (/\bBun\./.test(text.replace(/\/\/.*$/gm, ""))) problems.push(`${file}: still uses Bun.* after the rewrites`);
};

// ---- core: the roots and every local module they import
function localImports(text: string): string[] {
  return [...text.matchAll(/from\s+"\.\/([\w.-]+)"/g), ...text.matchAll(/import\(\s*"\.\/([\w.-]+)"\s*\)/g)].map((m) => m[1]);
}
const core = new Set<string>();
const queue = [...CORE_ROOTS];
while (queue.length) {
  const f = queue.shift()!;
  const name = f.endsWith(".ts") || f.endsWith(".tsx") ? f : existsSync(join(SRC, "tools", f + ".ts")) ? f + ".ts" : f + ".tsx";
  if (core.has(name)) continue;
  const p = join(SRC, "tools", name);
  if (!existsSync(p)) { problems.push(`tools/${name} is imported but does not exist`); continue; }
  core.add(name);
  queue.push(...localImports(read(p)));
}
const coreDir = join(PKG, "src/core"), uiDir = join(PKG, "src/ui");
rmSync(coreDir, { recursive: true, force: true }); rmSync(uiDir, { recursive: true, force: true });
mkdirSync(coreDir, { recursive: true }); mkdirSync(uiDir, { recursive: true });
for (const name of [...core].sort()) {
  let t = read(join(SRC, "tools", name)).replace(/^#!.*\n/, "");
  t = rewriteNode(t, `tools/${name}`, "../host");
  t = rewriteYaml(t, "../host");
  leftover(t, `tools/${name}`);
  writeFileSync(join(coreDir, name), header(publicText(t)));
}

// ---- ui: every component, helper and stylesheet of the site, except the site's page script
const ui: string[] = [];
for (const e of readdirSync(join(SRC, "site/src"), { withFileTypes: true })) {
  if (!e.isFile() || UI_SKIP.has(e.name) || !/\.(tsx?|css)$/.test(e.name)) continue;
  let t = read(join(SRC, "site/src", e.name)).replace(/^#!.*\n/, "");
  if (e.name.endsWith(".css")) { writeFileSync(join(uiDir, e.name), publicText(t)); ui.push(e.name); continue; }
  t = t.replace(/(from\s+|import\(\s*)"\.\.\/\.\.\/tools\/([\w.-]+)"/g, (_, a, m) => {
    if (!core.has(m + ".ts") && !core.has(m + ".tsx") && !core.has(m)) problems.push(`site/src/${e.name} imports tools/${m}, which is not among the core modules`);
    return `${a}"../core/${m}"`;
  });
  t = rewriteNode(t, `site/src/${e.name}`, "../host");
  t = rewriteYaml(t, "../host");
  leftover(t, `site/src/${e.name}`);
  for (const m of t.matchAll(/from\s+"\.\.\/(?!core\/|host\/)([^"]+)"/g)) problems.push(`site/src/${e.name} imports ../${m[1]}, outside the copied folders`);
  writeFileSync(join(uiDir, e.name), header(publicText(t)));
  ui.push(e.name);
}

// ---- the spec and the browser driver
writeFileSync(join(PKG, "SPEC.md"), publicText(read(join(SRC, "SPEC.md"))));
mkdirSync(join(PKG, "scripts"), { recursive: true });
writeFileSync(join(PKG, "scripts/cdp.ts"), header(read(join(SRC, "tools/cdp.ts"))));

console.log(`core (${core.size}): ${[...core].sort().join(", ")}`);
console.log(`ui (${ui.length}): ${ui.sort().join(", ")}`);
console.log(`SPEC.md, scripts/cdp.ts; ${nRewrites} public-text rewrites (public-rewrites.json in the source folder)`);
if (problems.length) { console.error("\nproblems:\n  " + problems.join("\n  ")); process.exit(1); }

// ---- fixtures from the Format page
const { makeFormatFixtures } = await import("./fixtures");
console.log(`fixtures/format: ${makeFormatFixtures(SRC).length} fixtures`);
