// Side-by-side pictures for review (not a test): the old stage's drawing of a fixture's time block next to the
// timeline layout's, at one width, for chosen steps. Both are drawn here from their own data with the stage's
// classes and tokens: the old from its Items (the stage's paint rules), the new from its primitives only
// (role, tone, fill, edge, cls), so a missing field in a primitive shows as a picture that differs.
//   bun test/engine/time/preview.ts <outdir> [fixture number ...]      writes <outdir>/<nn>-<w>.html and .png
import { mkdirSync, readdirSync, writeFileSync, cpSync } from "node:fs";
import { join } from "node:path";
import { launch, killAll } from "../../../scripts/cdp";
import { buildCss } from "../../../scripts/build-css";
import { compileStage, layoutStage } from "../../../src/core/stage";
import { setPhoneFont } from "../../../src/core/stage-core";
import { Timeline } from "../../../src/engine/layouts/time";
import { readFileSync as readText } from "node:fs";
import { shownAt } from "../../../src/engine/layouts/time/prims";
import { paint, pathD } from "../../../src/ui/stage";
import type { Prim } from "../../../src/engine/types";
import { loadFence, timeModel } from "./lower";

const ROOT = join(import.meta.dir, "../../..");
const out = process.argv[2]; const nums = process.argv.slice(3);
if (!out) throw new Error("usage: preview.ts <outdir> [numbers]");
mkdirSync(out, { recursive: true }); cpSync(join(ROOT, "example/fonts"), join(out, "fonts"), { recursive: true });
const fonts = [300, 400, 500, 600].map((w) => `@font-face{font-family:"Poppins";font-weight:${w};src:url("fonts/poppins-${w}-latin.woff2") format("woff2")}`).join("\n")
  + `\n@font-face{font-family:"IBM Plex Mono";font-weight:400;src:url("fonts/ibmplexmono-400-latin.woff2") format("woff2")}`;
const css0 = buildCss() + "\n" + fonts + "\n:root{--font-sans:Poppins,sans-serif;--stg-font:Poppins,sans-serif} body{margin:8px;font-family:Poppins,sans-serif}.dh-doc{background:var(--surface)} ${timeCss} .dh-doc{--stg-bg:var(--surface)} .stg-t.stg-halo{paint-order:stroke;stroke:var(--stg-bg);stroke-width:5px;stroke-linejoin:round} h4{font:600 12px Poppins;margin:6px 0 2px;color:#666}";
const timeCss = readText(join(ROOT, "src/engine/layouts/time/time.css"), "utf8");
const css = css0.replace("${timeCss}", timeCss);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const num = (n: number) => Math.round(n * 100) / 100;

function oldSvg(items: any[], k: number, w: number, h: number, roles: Record<string, number>, phone: boolean) {
  const body = items.filter((it) => shownAt(it, k)).map((it) => {
    const hot = it.hot?.includes(k) ? " stg-hot" : "", dim = it.dim?.includes(k) ? " stg-dim" : "";
    if (it.k === "box") return `<rect class="stg-box ${it.cls ?? ""}${it.thick ? " stg-thick" : ""}${it.dash ? " stg-dash" : ""}${hot}${dim}" x="${it.x}" y="${it.y}" width="${Math.max(0, it.w)}" height="${Math.max(0, it.h)}" rx="${it.r ?? 8}" style="fill:${paint(it.fill, roles)};stroke:${paint(it.stroke, roles)}"/>`;
    if (it.k === "text") return `<text class="stg-t stg-f-${it.f}${it.halo ? " stg-halo" : ""}${hot}${dim}" x="${it.x}" y="${it.y}" text-anchor="${it.anchor ?? "start"}" ${it.rotate === 90 ? `transform="rotate(-90 ${it.x} ${it.y})"` : ""} style="fill:${paint(it.ink, roles)}">${esc(it.s)}</text>`;
    if (it.k === "path") return `<g class="stg-edge${it.dash ? " stg-dash" : ""}${hot}${dim}"><path class="stg-line" d="${pathD(it.pts, it.curve)}" style="stroke:${paint(it.ink, roles)};stroke-width:${it.w ?? ""}"/></g>`;
    return "";
  }).join("");
  return svgWrap(body, w, h, phone);
}
const svgWrap = (b: string, w: number, h: number, phone: boolean) => `<svg class="stg-svg${phone ? " stg-phone" : ""}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${b}</svg>`;

/** a primitive drawn from its own fields only */
function newSvg(prims: Prim[], w: number, h: number, roles: Record<string, number>, phone: boolean) {
  const rc = (r: string | null | undefined) => (r && roles[r] !== undefined ? roles[r] : undefined);
  const tn = (t: string | null | undefined) => (t === "accent" ? "acc" : t);
  const col = (role: string | null | undefined, tone: string | null | undefined, part: "line" | "soft" | "ink") => {
    const n = rc(role); if (n !== undefined) return part === "line" ? `var(--c${n})` : `var(--c${n}-${part})`;
    if (tone) return part === "line" ? `var(--${tn(tone)})` : `var(--${tn(tone)}-${part})`;
    return "var(--muted)";
  };
  const body = prims.map((p) => {
    const cls = p.cls ?? "";
    const toneOf = (p as any).tone ?? /\btn-(\w+)/.exec(cls)?.[1] ?? null;
    if (p.k === "rect") {
      const fill = p.fill === "none" ? "none" : p.fill === "band" ? "var(--surface-2)" : p.fill === "faint" ? "var(--surface)" : p.fill === "soft" ? col(p.role, toneOf, "soft") : col(p.role, toneOf, "line");
      const edge = p.edge === "none" || !p.edge ? "none" : p.edge === "line" ? "var(--line)" : p.edge === "faint" ? "var(--scn-faint-edge, var(--line))" : col(p.role, toneOf, "line");
      return `<rect class="${cls}" x="${p.rect.x}" y="${p.rect.y}" width="${p.rect.w}" height="${p.rect.h}" rx="${p.r ?? 0}" style="fill:${fill};stroke:${edge}"/>`;
    }
    if (p.k === "text") {
      const ink = p.ink === "ink" ? "var(--ink)" : p.ink === "muted" ? "var(--muted)" : col(p.role, p.tone, /stg-ink-strong/.test(cls) ? "line" : "ink");
      const rot = /stg-rot90/.test(cls) ? `transform="rotate(-90 ${p.x} ${p.y})"` : "";
      return `<text class="${cls} stg-f-${p.font}" x="${p.x}" y="${p.y}" text-anchor="${p.anchor}" ${rot} style="fill:${ink}">${p.lines.map((l, i) => `<tspan x="${p.x}" dy="${i ? 16 : 0}">${esc(l)}</tspan>`).join("")}</text>`;
    }
    if (p.k === "path") {
      const wv = p.width === "thin" ? 1.2 : p.width === "hot" ? 2.2 : 1.6;
      const sw = /stg-w-([\d.]+)/.exec(cls)?.[1] ?? wv;
      // a path with no role or tone is a stage colour: time.css says which, by its pi-<name> class
      const stroke = p.role || toneOf ? col(p.role, toneOf, "line") : "";
      return `<g class="${cls}"><path class="stg-line" d="${p.d}" style="${stroke ? `stroke:${stroke};` : ""}stroke-width:${sw}${p.dashed ? ";stroke-dasharray:6 4" : ""}"/></g>`;
    }
    return "";
  }).join("");
  return svgWrap(body, w, h, phone);
}

const files = readdirSync(join(ROOT, "fixtures/stage")).filter((f) => f.endsWith(".dh.md") && (!nums.length || nums.includes(f.slice(0, 2))));
const page = await launch();
for (const f of files) for (const w of [1280, 390]) {
  const fence = loadFence(join(ROOT, "fixtures/stage", f));
  const old = compileStage(fence.head, fence.steps, fence.base, {}, fence.roles), plan = layoutStage(old.model, w);
  setPhoneFont(w < 480);
  const placed = Timeline.place({ model: timeModel(fence), states: [], container: null, members: [], regions: [] }, { width: w, phone: w < 480, look: "stage", measure: () => 0, wrap: () => [], child: () => { throw 0; }, problem: () => {} } as any);
  const n = Math.max(1, fence.steps.length), picks = [...new Set([1, n])];
  let html = `<style>${css}</style>`;
  for (const k of picks) html += `<h4>step ${k}: OLD stage</h4>${oldSvg(plan.items, k, plan.w, plan.h, fence.roles, plan.phone ?? w < 480)}<h4>step ${k}: NEW timeline layout</h4>${newSvg(placed.decor(k), placed.w, placed.h, fence.roles, w < 480)}`;
  const name = `${f.slice(0, 2)}-${w}`;
  writeFileSync(join(out, name + ".html"), `<!doctype html><meta charset="utf-8"><body style="width:${w}px"><div class="dh-doc">${html}</div>`);
  await page.viewport(w, 900, w < 480);
  await page.goto("file://" + join(out, name + ".html")); await page.sleep(400);
  const hgt = await page.eval<number>("document.documentElement.scrollHeight");
  await page.viewport(w, Math.min(8000, hgt + 20), w < 480); await page.sleep(150);
  await page.shot(join(out, name + ".png"));
  console.log(name, "ok");
}
await page.close(); killAll();
