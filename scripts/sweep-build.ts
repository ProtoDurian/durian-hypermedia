#!/usr/bin/env bun
// Rebuild the example client of a match run's site with the current source (engine "new" forced, as match.ts does), into a copy.
//   bun scripts/sweep-build.ts <match run dir> <new run dir>
import { cpSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
const [from, to] = process.argv.slice(2).map((p) => resolve(p));
const PKG = resolve(import.meta.dir, "..");
mkdirSync(to, { recursive: true });
cpSync(join(from, "site"), join(to, "site"), { recursive: true });
const forceNew = { name: "match-engine-new", setup(build: any) {
  build.onLoad({ filter: /example\/client\.tsx$/ }, async (a: { path: string }) => {
    const text = await Bun.file(a.path).text();
    if (!text.includes("({ doc: doc!")) throw new Error("example/client.tsx no longer builds its props as ({ doc: doc!");
    return { contents: text.replace("({ doc: doc!", '({ engine: "new" as const, doc: doc!'), loader: "tsx" };
  });
} };
const built = await Bun.build({ entrypoints: [join(PKG, "example/client.tsx")], outdir: join(to, "site/assets"), splitting: true, format: "esm", minify: false, target: "browser", plugins: [forceNew] });
if (!built.success) { console.error(built.logs); process.exit(1); }
console.log("built into " + to);
