// Draws the tree and calendar chart kinds (treemap, sunburst, calendar) through the new primitives and writes one HTML page per width.
// usage: bun test/engine/chwire/tree-kinds-gallery.ts <outdir>       (then tree-kinds-shoot.ts <outdir>)
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Budget } from "../../../src/core/budget";
import { measure, setPhoneFont } from "../../../src/core/stage-core";
import { parseChartKinds } from "../../../src/parts/chart-kinds/part";
import { LIMITS } from "../../../src/parts/chart-kinds/limits";
import type { View } from "../../../src/parts/chart-kinds/compute";
import { kindBuild, kindHeight, kindWidth, specOfView } from "../../../src/engine/charts/kinds";
import { crumbs, treeHint } from "../../../src/engine/charts/kinds/treemap";
import { toSvg } from "../../../src/engine/charts/xy/preview";

const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const FILES = ["src/parts/chart-kinds/sample.md", "src/parts/chart-kinds/fixtures/good-kinds.dh.md", "fixtures/parts/samples.dh.md"];
const tree = (kind: string, depth: number, groups: number) => {
  const kids = (k: number, g: number) => Array.from({ length: k }, (_, i) => `{ name: "Service ${g}.${i}", value: ${1 + ((i * 7 + g) % 13) * 3} }`).join(", ");
  return `kind: ${kind}\ntitle: A bigger tree\ny: { label: requests, format: number }\ndepth: ${depth}\ndata:\n${Array.from({ length: groups }, (_, g) => `  - { name: "Team number ${g}", children: [${Array.from({ length: 3 + (g % 3) }, (_, s) => `{ name: "Product ${g}.${s}", children: [${kids(3 + ((g + s) % 5), g * 10 + s)}] }`).join(", ")}] }`).join("\n")}\n`;
};
export const EXTRA = [
  { name: "big-treemap", body: tree("treemap", 3, 6) },
  { name: "big-sunburst", body: tree("sunburst", 4, 5) },
  { name: "year-calendar", body: `kind: calendar\ntitle: A year of days\ny: { label: orders }\nfrom: 2026-01-01\nto: 2026-12-31\ntone: c3\ndata: [${Array.from({ length: 300 }, (_, i) => `["${new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)}", ${(i * 37 + (i % 7) * 11) % 41}]`).filter((_, i) => i % 3 !== 2).join(", ")}]\n` },
];
interface Item { name: string; v: View; zoom: number }
export function items(): Item[] {
  const out: Item[] = [];
  const add = (name: string, body: string) => {
    const d = parseChartKinds(body, 1, 1, { ...LIMITS, chartKindsTreeDepth: 8 }, big());
    if (!d.steps.length || !["treemap", "sunburst", "calendar"].includes(d.kind)) return;
    const v = d.steps[0].view;
    out.push({ name, v, zoom: 0 });
    if (v.kind === "treemap" || v.kind === "sunburst") { const b = v.nodes.find((n) => n.depth === 1 && n.children.length); if (b) out.push({ name: `${name}-zoom`, v, zoom: b.id }); }
  };
  for (const f of FILES) { let n = 0; for (const m of readFileSync(f, "utf8").matchAll(/^```chart\n([\s\S]*?)^```/gm)) { n++; add(`${f.split("/").pop()!.replace(/\.dh\.md$|\.md$/, "")}-${n}`, m[1]); } }
  for (const e of EXTRA) add(e.name, e.body);
  return out;
}
export function drawItem(it: Item, w: number) {
  const phone = w < 480; setPhoneFont(phone);
  const { spec } = specOfView(it.v, { zoom: it.zoom });
  const h = kindHeight(spec, w), need = kindWidth(spec);
  const room = w, rect = { x: 0, y: 0, w: room, h };
  const built = kindBuild(spec, rect, { phone, look: "stage", measure, step: 0, prev: null, max: [], lit: [] });
  const crumbHtml = it.v.kind === "calendar" ? "" : `<nav>${crumbs(it.v, it.zoom).map((c, i, a) => (i < a.length - 1 ? `<b>${c.name}</b> › ` : `<i>${c.name}</i>`)).join("")}</nav>`;
  const hint = it.v.kind === "calendar" ? "" : `<p class=hint>${treeHint(it.v)}</p>`;
  return { svg: `${crumbHtml}${toSvg(built.prims, room, h)}${hint}`, built, h, need };
}
if (import.meta.main) {
  const out = process.argv[2]; mkdirSync(out, { recursive: true });
  const theme = readFileSync("src/ui/theme.css", "utf8"), css = readFileSync("src/engine/charts/kinds/tree-kinds.css", "utf8");
  for (const w of [1280, 390]) {
    let body = "";
    for (const it of items()) {
      try { const r = drawItem(it, w - 24); body += `<section data-name="${it.name}"><h4>${it.name} (${it.v.kind}${it.zoom ? `, open node ${it.zoom}` : ""})${r.need ? `, needs ${r.need}px` : ""}</h4>${r.svg}</section>`; }
      catch (e) { body += `<section data-name="${it.name}"><h4>${it.name}</h4><pre>${String((e as Error).stack)}</pre></section>`; }
    }
    writeFileSync(join(out, `gallery-${w}.html`), `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>${theme}\n${css}\nbody{margin:12px;background:var(--surface);color:var(--ink);font-family:var(--font-sans,system-ui)}section{margin:0 0 18px;max-width:${w - 24}px}h4{margin:0 0 4px;font:600 12px system-ui}nav{font:500 12px system-ui;margin:0 0 6px;color:var(--muted)}nav b{color:var(--ink);font-weight:500}.hint{margin:6px 0 0;font:12px system-ui;color:var(--muted)}svg{display:block;max-width:100%}</style>${body}`);
  }
}
