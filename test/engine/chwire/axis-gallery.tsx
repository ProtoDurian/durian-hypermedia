// Draws every chart of the five axis kinds (histogram boxplot violin funnel waterfall) through the engine's chart painter and writes one
// HTML page per width (for screenshots). usage: bun test/engine/chwire/axis-gallery.tsx <outdir>
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Prims } from "../../../src/engine/charts/paint";
import { kindBuild, kindHeight, specOfView } from "../../../src/engine/charts/kinds";
import { numbersOf } from "../../../src/engine/charts/kinds/common";
import { measure, setPhoneFont } from "../../../src/core/stage-core";
import type { View } from "../../../src/parts/chart-kinds/compute";
import { fences } from "./axis-kinds-fences";

export function draw(views: View[], step: number, w: number): { svg: string; h: number } {
  const phone = w < 480; setPhoneFont(phone);
  const v = views[step], { spec } = specOfView(v), h = kindHeight(spec, w);
  const max = views.map(numbersOf).reduce((a, b) => a.map((row, i) => row.map((x, j) => Math.max(x, b[i]?.[j] ?? -Infinity))));
  const built = kindBuild(spec, { x: 0, y: 0, w, h }, { phone, look: "stage", measure, step: 0, prev: null, max, lit: [] });
  const body = renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ fontFamily: "var(--font-sans, system-ui)", overflow: "visible" }}><Prims drawn={built.prims.map((p) => ({ p, o: 1, key: p.key }))} phone={phone} /></svg>);
  return { svg: body, h };
}
if (import.meta.main) {
  const out = process.argv[2]; mkdirSync(out, { recursive: true });
  const theme = readFileSync("src/ui/theme.css", "utf8"), css = readFileSync("src/engine/charts/kinds/axis-kinds.css", "utf8");
  for (const w of [1280, 390]) {
    let body = "";
    const seen = new Set<string>();
    for (const f of fences()) {
      const sig = f.kind + JSON.stringify(f.views[0]).length; if (seen.has(sig)) continue; seen.add(sig);
      for (let s = 0; s < f.views.length; s++) {
        try { const r = draw(f.views, s, w); body += `<section data-name="${f.name}-s${s + 1}"><h4>${f.name} step ${s + 1} (${f.kind}) ${f.title}</h4>${r.svg}</section>`; } catch (e) { body += `<section data-name="${f.name}-s${s + 1}"><h4>${f.name}</h4><pre>${String((e as Error).stack)}</pre></section>`; }
      }
    }
    writeFileSync(join(out, `gallery-${w}.html`), `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>${theme}\n${css}\nbody{margin:12px;background:var(--surface);color:var(--ink);font-family:var(--font-sans,system-ui)}section{margin:0 0 18px;max-width:${w}px}h4{margin:0 0 4px;font:600 12px system-ui}</style>${body}`);
  }
}
