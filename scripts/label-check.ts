#!/usr/bin/env bun
// The chart-label check: no two labels of a chart overlap, at any width (format version 11).
//   bun scripts/label-check.ts [--widths 390,360,1280] [--out <dir>] <page.dh.md>...     (default page: fixtures/parts/samples.dh.md)
// Each page is built and drawn in headless Chrome at each width (light theme, scrolled through so lazy drawings run). In every
// svg (a chart) the words of its <text> elements are measured as the polygons they are drawn as (rotated words too, by their
// screen matrix) and any two that overlap by more than 1 px are reported with their words; the month names of a calendar chart
// are measured the same way; a word on a sunburst arc must lie on its arc; a trace's event diamonds count as things words must not cover. A Chart.js canvas draws its words with fillText: those calls are recorded (the last full draw of each
// canvas is kept) and measured the same way, by the matrix and the alignment each word was drawn with.
// Exit 1 on any overlap. The browser and the server are closed in any case.
import { launch } from "./cdp";
import React from "react";
import { renderToString } from "react-dom/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { parse } from "../src/index";
import { DhDocument } from "../src/react/index";
import { documentJson } from "../src/react/hydrate";
import { buildCss } from "./build-css";

const PKG = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const WIDTHS = opt("--widths", "390,360").split(",").map(Number);
const OUT = resolve(opt("--out", join(PKG, "dist/label-check")));
const valueArgs = new Set([opt("--widths", ""), opt("--out", "")]);
const pages = args.filter((a) => !a.startsWith("--") && !valueArgs.has(a));
if (!pages.length) pages.push(join(PKG, "fixtures/parts/samples.dh.md"));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

mkdirSync(join(OUT, "assets"), { recursive: true });
writeFileSync(join(OUT, "assets/styles.css"), buildCss() + "\n" + readFileSync(join(PKG, "example/site.css"), "utf8"));
const built = await Bun.build({ entrypoints: [join(PKG, "example/client.tsx")], outdir: join(OUT, "assets"), splitting: true, format: "esm", minify: false, target: "browser" });
if (!built.success) { console.error(built.logs); process.exit(1); }
const names: string[] = [];
pages.forEach((f, k) => {
  const path = resolve(f);
  if (!existsSync(path)) { console.error(`no such page: ${f}`); process.exit(2); }
  const doc = parse(readFileSync(path, "utf8"), { path: basename(path) });
  const name = `p${k}.html`;
  names.push(name);
  writeFileSync(join(OUT, name), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(basename(path))}</title><link rel="stylesheet" href="assets/styles.css"><script type="module" src="assets/client.js"></script></head><body><main class="ex-main"><div id="dh-root">${renderToString(React.createElement(DhDocument, { doc }))}</div></main><script type="application/json" id="dh-doc">${documentJson(doc)}</script></body></html>`);
});

// recorded before the page's scripts run: every fillText of a canvas (text, matrix, alignment, width), reset when the canvas is cleared
const RECORD = `(() => {
  const P = CanvasRenderingContext2D.prototype, ft = P.fillText, st = P.strokeText, cr = P.clearRect;
  const log = (ctx, fn, args) => { const c = ctx.canvas; (c.__t = c.__t || []).push({ s: String(args[0]), x: args[1], y: args[2], m: ctx.getTransform(), a: ctx.textAlign, b: ctx.textBaseline, font: ctx.font, w: ctx.measureText(String(args[0])).width }); return fn.apply(ctx, args); };
  P.fillText = function (...a) { return log(this, ft, a); };
  P.strokeText = function (...a) { return st.apply(this, a); };
  P.clearRect = function (x, y, w, h) { if (w >= this.canvas.width * 0.9 && h >= this.canvas.height * 0.9) this.canvas.__t = []; return cr.call(this, x, y, w, h); };
})();`;
// every svg's words as polygons in screen pixels; overlaps by SAT with the words shrunk by 1 px on each side
const MEASURE = `(() => {
  const polys = (el) => { const b = el.getBBox(), m = el.getScreenCTM(); if (!m || !b.width || !b.height) return null;
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]); return pts; };
  const shrink = (p) => { const cx = p.reduce((s, q) => s + q[0], 0) / 4, cy = p.reduce((s, q) => s + q[1], 0) / 4; return p.map(([x, y]) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1; return [x - dx / d, y - dy / d]; }); };
  const axes = (p) => [0, 1].map((i) => { const a = p[i], b = p[i + 1]; const nx = -(b[1] - a[1]), ny = b[0] - a[0], l = Math.hypot(nx, ny) || 1; return [nx / l, ny / l]; });
  const proj = (p, [nx, ny]) => { const v = p.map(([x, y]) => x * nx + y * ny); return [Math.min(...v), Math.max(...v)]; };
  const hit = (p, q) => { for (const ax of [...axes(p), ...axes(q)]) { const a = proj(p, ax), b = proj(q, ax); if (a[1] <= b[0] || b[1] <= a[0]) return false; } return true; };
  const out = [];
  const svgs = [...document.querySelectorAll("svg")].filter((s) => s.querySelector("text") && s.closest(".ck-svg, [data-dh-part], .dh-part-stage") );
  svgs.forEach((svg, si) => {
    const words = [...svg.querySelectorAll("text")].filter((t) => t.textContent.trim() && getComputedStyle(t).display !== "none" && getComputedStyle(t).visibility !== "hidden" && +getComputedStyle(t).opacity > 0.05).map((t) => ({ t, p: polys(t) })).filter((w) => w.p).map((w) => ({ ...w, q: shrink(w.p) }));
    const part = svg.closest("[data-dh-part]")?.getAttribute("data-dh-part") || svg.getAttribute("class") || "svg";
    for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) if (hit(words[i].q, words[j].q)) out.push({ part, svg: si, a: words[i].t.textContent.trim().slice(0, 40), b: words[j].t.textContent.trim().slice(0, 40) });
    // a word on a sunburst arc must lie wholly on its own arc: along its middle and both edges, the thing seen at each point (words
    // are not hit-tested) is the arc it belongs to, not the centre, another arc or the empty page
    for (const t of svg.querySelectorAll(".ck-arc-t")) {
      t.scrollIntoView({ block: "center", inline: "center" });
      const g = t.closest("g"), b = t.getBBox(), m = t.getScreenCTM(); if (!m || !g) continue;
      let cut = false;
      for (const fy of [0.15, 0.5, 0.85]) for (let i = 0; i < 9; i++) {
        const x = b.x + (b.width * (i + 0.5)) / 9, y = b.y + b.height * fy;
        const e = document.elementFromPoint(m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
        if (!e || e.closest("g") !== g) cut = true;
      }
      if (cut) out.push({ part, svg: si, a: t.textContent.trim().slice(0, 40), b: "outside its own arc" });
    }
    // an event mark (a trace's log diamond) is a thing words must stay clear of, the part of a word the plot's clip hides counts too
    const evMarks = [...svg.querySelectorAll(".tr-log")].map((m) => ({ m, p: polys(m) })).filter((w) => w.p).map((w) => shrink(w.p));
    for (const w of words) for (const q of evMarks) if (hit(w.q, q)) out.push({ part, svg: si, a: w.t.textContent.trim().slice(0, 40), b: "event mark" });
  });
  // the month names of a calendar chart are html spans in a row
  document.querySelectorAll(".ck-cal-in").forEach((row, si) => { const sp = [...row.querySelectorAll(".ck-cal-m")].map((e) => ({ e, r: e.getBoundingClientRect() })); for (let i = 0; i + 1 < sp.length; i++) if (sp[i].r.right > sp[i + 1].r.left + 1) out.push({ part: "chart-kinds", svg: "calendar " + si, a: sp[i].e.textContent, b: sp[i + 1].e.textContent }); });
  // canvases: each recorded word is a box (its width, the font's size high) placed by its matrix, alignment and baseline
  let canvases = 0;
  document.querySelectorAll("canvas").forEach((cv, ci) => {
    const t = cv.__t; if (!t || !t.length) return; canvases++;
    const boxes = t.filter((w) => w.s.trim()).map((w) => { const px = parseFloat(/(\\d+(?:\\.\\d+)?)px/.exec(w.font)?.[1] || "12"), dx = w.a === "center" ? -w.w / 2 : w.a === "right" || w.a === "end" ? -w.w : 0, dy = w.b === "middle" ? -px / 2 : w.b === "top" || w.b === "hanging" ? 0 : -px * 0.8;
      const m = w.m, pt = (x, y) => [m.a * (w.x + x) + m.c * (w.y + y) + m.e, m.b * (w.x + x) + m.d * (w.y + y) + m.f]; return { s: w.s, q: shrink([pt(dx, dy), pt(dx + w.w, dy), pt(dx + w.w, dy + px), pt(dx, dy + px)]) }; });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (hit(boxes[i].q, boxes[j].q)) out.push({ part: "chart (canvas)", svg: "canvas " + ci, a: boxes[i].s.slice(0, 40), b: boxes[j].s.slice(0, 40) });
  });
  return { svgs: svgs.length + canvases, out, rects: out.map((o) => { const s = typeof o.svg === "number" ? svgs[o.svg] : document.querySelectorAll("canvas")[parseInt(String(o.svg).replace(/\\D/g, ""))]; if (!s) return null; s.scrollIntoView({ block: "center" }); const r = s.getBoundingClientRect(); return [Math.max(0, r.left + scrollX), r.top + scrollY, Math.min(innerWidth, r.width), r.height]; }) };
})()`;

const freePort = () => { const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") }); const p = s.port; s.stop(true); return p; };
const PORT = freePort();
const server = Bun.spawn(["bun", join(PKG, "example/serve.ts"), OUT, String(PORT)], { stdout: "ignore", stderr: "inherit" });
let bad = 0;
const rows: string[] = [];
let p: Awaited<ReturnType<typeof launch>> | null = null;
try {
  await new Promise((r) => setTimeout(r, 700));
  if (server.exitCode !== null) throw new Error(`the page server did not start on port ${PORT}: the check is broken`);
  p = await launch();
  await p.send("Page.addScriptToEvaluateOnNewDocument", { source: RECORD });
  for (const w of WIDTHS) for (const [k, name] of names.entries()) {
    await p.viewport(w, 844, w < 700);
    await p.goto(`http://127.0.0.1:${PORT}/${name}`);
    await p.sleep(500);
    // scroll through the page so every lazy drawing runs
    const h = await p.eval<number>(`document.documentElement.scrollHeight`);
    for (let y = 0; y < h; y += 700) { await p.eval(`window.scrollTo(0, ${y})`); await p.sleep(60); }
    await p.sleep(900);
    const m = await p.eval<{ svgs: number; out: { part: string; svg: number | string; a: string; b: string }[]; rects: ([number, number, number, number] | null)[] }>(MEASURE);
    // a picture of each chart that has an overlap (once per chart)
    const shot = new Set<string>();
    for (const [i, o] of m.out.entries()) { const r = m.rects[i], key = String(o.svg); if (!r || shot.has(key)) continue; shot.add(key); mkdirSync(join(OUT, "shots"), { recursive: true }); await p.sleep(150); await p.shot(join(OUT, "shots", `${basename(pages[k]).replace(/\W/g, "-")}-${w}-${o.part}-${key}.png`), { x: r[0], y: r[1], width: r[2], height: r[3] }); }
    rows.push(`${basename(pages[k])} at ${w}: ${m.svgs} charts read, ${m.out.length} overlaps`);
    for (const o of m.out) { bad++; rows.push(`  OVERLAP ${o.part} #${o.svg}: "${o.a}" over "${o.b}"`); }
  }
} finally {
  await p?.close?.();
  server.kill();
}
console.log(rows.join("\n"));
console.log(bad ? `label-check: ${bad} overlaps` : "label-check: ok");
process.exit(bad ? 1 : 0);
