// engine-smoke: compile animation fixtures through the one engine and server-render them with engine="new".
// usage: bun scripts/engine-smoke.tsx <fixture name parts...>   (from the package root)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
const pkg = join(import.meta.dir, "..");
const { parse } = await import(join(pkg, "src/index"));
const { DhDocument } = await import(join(pkg, "src/react/index"));
const { tryEngine } = await import(join(pkg, "src/engine/bridge"));
const files: string[] = [];
for (const d of ["format", "stage"]) for (const f of readdirSync(join(pkg, "fixtures", d))) if (f.endsWith(".dh.md")) files.push(join(d, f));
for (const want of process.argv.slice(2)) {
  const f = files.find((x) => x.includes(want)); if (!f) { console.log(want, "no file"); continue; }
  const doc = parse(readFileSync(join(pkg, "fixtures", f), "utf8"), { path: f });
  const all: any[] = []; const walk = (bs: any[]) => { for (const b of bs ?? []) { all.push(b); walk(b.children ?? b.blocks ?? []); } }; walk(doc.blocks); const blocks = all.filter((b) => b.type === "animation");
  for (const b of blocks) { const t = tryEngine(b); console.log(f, t.c ? `compiled: ${t.c.states.length - 1} steps, plan ${Math.round(t.c.plan(1000).w)}x${Math.round(t.c.plan(1000).h)}` : `NOT: ${t.err?.slice(0, 160)}`); }
  try { const html = renderToString(<DhDocument doc={doc} engine="new" />); console.log("  ssr:", html.includes('class="stg eng') || html.includes("eng ") ? "engine root" : "no engine root", html.includes("dh-error") ? "ERROR shown" : "", html.length); }
  catch (e) { console.log("  ssr threw:", String(e).slice(0, 200)); }
}
