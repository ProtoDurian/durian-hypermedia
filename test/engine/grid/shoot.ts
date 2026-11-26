// Dev script (not a test): the old stage and the grid layout side by side at 1280 and 390, one PNG each per step.
//   bun test/engine/grid/shoot.ts <example site dir> <port> <out dir> [only-label]
// The site is built with `bun example/build.tsx <dir>` and served with `bun example/serve.ts <dir> <port>`.
import { launch, killAll } from "../../../scripts/cdp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Grid } from "../../../src/engine/layouts/grid";
import { ctxAt, inputOf, PANEL_WORDS } from "./helpers";
import { readModel } from "../../../src/engine/pipeline";
import { states } from "../../../src/engine/core/states";
const lowerGrid = (src: string, roles: Record<string, number>) => readModel({ body: src.replace(/\n+$/, ""), line0: 1, fence: {}, roles, format12: false });
import { primsToSvg } from "./svg";

const [SITE, PORT, OUT, only] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const FX = join(import.meta.dir, "../../../fixtures/stage");
const fencesOf = (f: string) => [...readFileSync(join(FX, f), "utf8").matchAll(/^```animation([^\n]*)\n([\s\S]*?)^```$/gm)].map((m) => m[2]);
const rolesOf = (f: string) => { const fm = /^roles:\n((?:  .*\n)+)/m.exec(readFileSync(join(FX, f), "utf8"))?.[1] ?? ""; return Object.fromEntries(fm.split("\n").filter(Boolean).map((l) => { const [k, ...v] = l.trim().split(": "); return [k, +(/c(\d)/.exec(v.join(": "))?.[1] ?? 0)]; })); };

type T = { label: string; file: string; i: number };
const targets: T[] = [];
const fx = (n: string) => ({ "02": "02-animation-a-phase-strip-and-swapped-panels.dh.md", "04": "04-animation-a-swimlane-matrix.dh.md", "34": "34-animation-bins.dh.md" })[n]!;
targets.push({ label: "02", file: fx("02"), i: 0 }, { label: "04", file: fx("04"), i: 0 });
for (let i = 0; i < 3; i++) targets.push({ label: `34-${i}`, file: fx("34"), i });
fencesOf("example-layers.dh.md").forEach((src, i) => { const m = lowerGrid(src, rolesOf("example-layers.dh.md")); if (m.steps.some((s) => s.facts.some((f) => f.k === "layout" && PANEL_WORDS.includes(f.word)))) targets.push({ label: `layers-${i}`, file: "example-layers.dh.md", i }); });

const page = await launch();
const report: any[] = [];
for (const t of targets) {
  if (only && !t.label.startsWith(only)) continue;
  const src = fencesOf(t.file)[t.i], roles = rolesOf(t.file), model = lowerGrid(src, roles);
  const href = `http://127.0.0.1:${PORT}/stage-${t.file.replace(/\.dh\.md$/, "")}.html`;
  for (const W of [1280, 390]) {
    await page.viewport(W, 900, W < 480);
    await page.goto(href); await page.sleep(900);
    const info = await page.eval<{ w: number; steps: number }>(`(() => { const s = document.querySelectorAll('.stg')[${t.i}]; const v = [...s.querySelectorAll('svg.stg-svg')].find((e) => e.getBoundingClientRect().width > 0); return { w: +v.getAttribute('width'), steps: +s.getAttribute('data-steps') || 1 }; })()`);
    const ctx = ctxAt(info.w), placed = Grid.place(inputOf(model, states(model)), ctx);
    const svgs = Array.from({ length: model.steps.length }, (_, k) => `<div id="n${k + 1}" style="display:block;margin:0 0 20px">${primsToSvg(placed.decor(k + 1), placed.w, placed.h, roles, ctx.phone)}</div>`).join("");
    const name = `gridnew-${t.label}-w${W}.html`;
    writeFileSync(join(SITE, name), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="assets/styles.css"></head><body><main class="ex-main"><div class="dh-doc"><div class="stg" style="width:${info.w}px"><div class="stg-plan">${svgs}</div></div></div></main></body></html>`);
    for (let k = 1; k <= info.steps; k++) {
      await page.goto(href); await page.sleep(500);
      await page.eval(`(() => { const s = document.querySelectorAll('.stg')[${t.i}]; const b = s.querySelector('[data-bar-step="${k}"]'); if (b) b.click(); s.scrollIntoView({block:'start'}); })()`);
      await page.sleep(700);
      const r = await page.eval<any>(`(() => { const r = document.querySelectorAll('.stg')[${t.i}].getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
      await page.shot(join(OUT, `old-${t.label}-w${W}-k${k}.png`), { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: Math.min(W, r.width + 8), height: r.height + 8 });
    }
    await page.goto(`http://127.0.0.1:${PORT}/${name}`); await page.sleep(700);
    for (let k = 1; k <= model.steps.length; k++) {
      const r = await page.eval<any>(`(() => { const r = document.getElementById('n${k}').getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
      await page.shot(join(OUT, `new-${t.label}-w${W}-k${k}.png`), { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: Math.min(W, r.width + 8), height: r.height + 8 });
    }
    report.push({ label: t.label, W, planW: info.w, newW: placed.w, newH: placed.h, steps: model.steps.length, oldSteps: info.steps });
  }
}
await page.close(); killAll();
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));
