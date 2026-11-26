#!/usr/bin/env bun
// The motion sweep (owner point 28): plays every step of an animation fence in a real browser and samples every frame
// of the transition, looking for (a) jitter: words, lines of words and packets that shake, reverse or jump inside a step;
// (b) the starting zoom: step 1 closer than fitted, cut, or tiny; (c) zoom-in breakage: the reader zooms (+ key, Ctrl + wheel,
// a two-finger pinch) and then steps: the camera jumps, words vanish, packets jitter.
//   bun scripts/sweep.ts --run <match run dir with site/> --out <dir> [--only <glob>] [--width 1280|390] [--jobs N] [--zoom 0|1]
// It reads the pages of a `scripts/match.ts --engine new` run (its site/ folder) and changes nothing in an engine.
import { launch, killAll, type Page } from "./cdp";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (k: string, d = "") => (args.includes(k) ? (args[args.indexOf(k) + 1] ?? d) : d);
const RUN = resolve(opt("--run")), OUT = resolve(opt("--out", join(RUN, "sweep")));
const WIDTHS = opt("--width") ? [Number(opt("--width"))] : [1280, 390];
const JOBS = Math.max(1, Math.min(3, Number(opt("--jobs", "2")) | 0 || 2));
const ZOOM = opt("--zoom", "1") !== "0";
const only = opt("--only");
const globRe = (g: string) => new RegExp("^" + g.replace(/[.+^$()|\\[\]]/g, (c) => "\\" + c).replace(/\*/g, ".*").replace(/\?/g, ".").replace(/\{([^}]*)\}/g, (_, a: string) => "(?:" + a.split(",").join("|") + ")") + "$");
const matcher = only ? globRe(/[*?{]/.test(only) ? only : `*${only}*`) : null;
if (!RUN || !existsSync(join(RUN, "site"))) { console.error("--run needs a match run folder with site/"); process.exit(2); }
mkdirSync(join(OUT, "shots"), { recursive: true });
const slugs = readdirSync(join(RUN, "site")).filter((n) => n.endsWith(".html")).map((n) => n.slice(0, -5)).filter((s) => !matcher || matcher.test(s.replace(/_md_/, ".md#").replace(/_/g, "/")) || matcher.test(s)).sort();
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) { const p = decodeURIComponent(new URL(req.url).pathname); if (p.includes("..")) return new Response("no", { status: 400 }); const f = Bun.file(join(RUN, p.startsWith("/assets/") ? "site" + p : "site" + p)); return f.size ? new Response(f) : new Response("", { status: 404 }); } });
const BASE = `http://127.0.0.1:${server.port}`;
const freePort = () => { const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") }); const p = s.port; s.stop(true); return p; };

// ---- the in-page recorder: every animation frame of a transition, in scene units
const REC = `(() => {
  if (window.__sw) return;
  const op = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1 && e.tagName !== "BODY"; e = e.parentElement) { const v = parseFloat(getComputedStyle(e).opacity); if (!isNaN(v)) o *= v; if (e.tagName.toLowerCase() === "svg") break; } return o; };
  const snap = () => {
    const root = document.querySelector("figure.part") || document.body;
    const svg = root.querySelector("svg.eng-svg");
    if (!svg) { const h3 = root.querySelector(".eng-3d"); if (!h3) return null;
      const hr = h3.getBoundingClientRect(), words = [], seen = {};
      h3.querySelectorAll(".scn3-labels > div").forEach((el) => { const s = el.textContent.trim(); if (!s) return; const b = el.getBoundingClientRect(); if (!b.width) return;
        const k = (el.className.split(" ")[0] || "") + "|" + s; seen[k] = (seen[k] || 0) + 1;
        const o = (parseFloat(el.style.opacity || "1") || 0) * (getComputedStyle(el).visibility === "hidden" || getComputedStyle(el).display === "none" ? 0 : 1);
        words.push([k + "#" + seen[k], Math.round((b.left + b.width / 2 - hr.left) * 100) / 100, Math.round((b.top + b.height / 2 - hr.top) * 100) / 100, Math.round(o * 100) / 100, b.left < hr.left - 1 || b.right > hr.right + 1 || b.top < hr.top - 1 || b.bottom > hr.bottom + 1 ? 1 : 0]); });
      return { t: performance.now(), vb: [0, 0, hr.width, hr.height], rw: hr.width, words, dots: [] }; }
    const r = svg.getBoundingClientRect(), vb = (svg.getAttribute("viewBox") || "0 0 1 1").split(/\\s+/).map(Number);
    const sc = (x, y) => [vb[0] + ((x - r.left) / r.width) * vb[2], vb[1] + ((y - r.top) / r.height) * vb[3]];
    const words = [], seen = {};
    svg.querySelectorAll("text").forEach((t) => {
      const s = t.textContent.trim(); if (!s) return;
      const b = t.getBoundingClientRect(); if (!b.width) return;
      const k0 = (t.closest("[data-key]") || t).getAttribute("data-key") || "", k = k0 + "|" + s; seen[k] = (seen[k] || 0) + 1;
      const c = sc(b.left + b.width / 2, b.top + b.height / 2);
      words.push([k + "#" + seen[k], Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100, Math.round(op(t) * 100) / 100, b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1 ? 1 : 0]);
    });
    const dots = [...svg.querySelectorAll("circle.eng-dot")].map((c) => [+c.getAttribute("cx"), +c.getAttribute("cy"), Math.round(op(c) * 100) / 100]);
    return { t: performance.now(), vb, rw: r.width, words, dots };
  };
  window.__sw = { frames: [], on: false, snap,
    start() { this.frames = []; this.on = true; const loop = () => { if (!this.on) return; const s = snap(); if (s) this.frames.push(s); requestAnimationFrame(loop); }; requestAnimationFrame(loop); },
    stop() { this.on = false; const f = this.frames; this.frames = []; return f; } };
})()`;

type Frame = { t: number; vb: number[]; rw: number; words: [string, number, number, number, number][]; dots: [number, number, number][] };
interface Jitter { detail?: Record<string, number[][]>; camera: number; words: string[]; jumps: string[]; dots: number; frames: number; ms: number; camJump: number }
const sgn = (v: number, eps: number) => (Math.abs(v) < eps ? 0 : v > 0 ? 1 : -1);
/** reversals of a series: direction changes whose swing is at least `amp` */
function reversals(s: number[], eps: number, amp: number): number {
  let n = 0, dir = 0, ext = s[0], runStart = s[0];
  for (let i = 1; i < s.length; i++) {
    const d = sgn(s[i] - s[i - 1], eps); if (!d) continue;
    if (dir && d !== dir && Math.abs(ext - runStart) >= amp) n++;
    if (d !== dir) { runStart = s[i - 1]; dir = d; }
    ext = s[i];
  }
  return n;
}
/** zig-zags: a step one way then straight back the other, both of at least `eps` (a smooth arc turns with tiny steps; a shake does not) */
function zigs(s: number[], eps: number): { n: number; swing: number } {
  let n = 0, swing = 0;
  for (let i = 1; i + 1 < s.length; i++) { const a = s[i] - s[i - 1], b = s[i + 1] - s[i]; if (a * b < 0 && Math.min(Math.abs(a), Math.abs(b)) >= eps) { n++; swing = Math.max(swing, Math.min(Math.abs(a), Math.abs(b))); } }
  return { n, swing };
}
function analyse(frames: Frame[], before: number[] | null): Jitter {
  const out: Jitter = { camera: 0, words: [], jumps: [], dots: 0, frames: frames.length, ms: frames.length ? Math.round(frames[frames.length - 1].t - frames[0].t) : 0, camJump: 0 };
  if (frames.length < 3) return out;
  for (let i = 0; i < 4; i++) out.camera += zigs(frames.map((f) => f.vb[i]), 0.5).n;
  if (before) out.camJump = Math.round(Math.max(Math.abs(frames[0].vb[0] - before[0]), Math.abs(frames[0].vb[1] - before[1]), Math.abs(frames[0].vb[2] - before[2])) * 10) / 10;
  const keys = new Map<string, { x: number; y: number }[]>(); // words that stay solid the whole transition
  const solid = (k: string) => frames.every((f) => f.words.some((w) => w[0] === k && w[3] > 0.6));
  for (const k of new Set(frames[0].words.map((w) => w[0]))) {
    if (!solid(k)) continue;
    const ser = frames.map((f) => { const w = f.words.find((q) => q[0] === k)!; return { x: w[1], y: w[2] }; });
    keys.set(k, ser);
  }
  for (const [k, ser] of keys) {
    const xs = ser.map((p) => p.x), ys = ser.map((p) => p.y);
    const zx = zigs(xs, 1), zy = zigs(ys, 1), rv = zx.n + zy.n;
    const path = xs.reduce((a, v, i) => (i ? a + Math.hypot(v - xs[i - 1], ys[i] - ys[i - 1]) : 0), 0), net0 = Math.hypot(xs[xs.length - 1] - xs[0], ys[ys.length - 1] - ys[0]);
    if (rv) { out.words.push(`${k.replace(/#\d+$/, "")} (${rv} zigs, up to ${Math.round(Math.max(zx.swing, zy.swing) * 10) / 10} px each, path ${Math.round(path)} px, net ${Math.round(net0)} px)`); if (Object.keys(out.detail ??= {}).length < 3) out.detail![k] = ser.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]); }
    const tot = Math.hypot(xs[xs.length - 1] - xs[0], ys[ys.length - 1] - ys[0]);
    let big = 0;
    for (let i = 1; i < ser.length; i++) big = Math.max(big, Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
    // a single frame covers most of the way (a teleport), over 30 scene px, while the word has frames either side
    if (ser.length > 6 && big > 30 && big > 0.75 * Math.max(tot, big) && tot > 30 && Math.hypot(xs[1] - xs[0], ys[1] - ys[0]) < big * 0.9 && Math.hypot(xs[ser.length - 1] - xs[ser.length - 2], ys[ser.length - 1] - ys[ser.length - 2]) < big * 0.9) out.jumps.push(`${k.replace(/#\d+$/, "")} (${Math.round(big)} px)`);
    else if (big > 60 && tot < big * 0.4) out.jumps.push(`${k.replace(/#\d+$/, "")} there and back (${Math.round(big)} px)`);
  }
  // packets: the same dot (by index) turning back on itself more than once while it shows
  const nd = Math.min(...frames.map((f) => f.dots.length));
  for (let j = 0; j < nd && j < 12; j++) {
    const ser = frames.filter((f) => f.dots[j][2] > 0.5).map((f) => ({ x: f.dots[j][0], y: f.dots[j][1] }));
    if (ser.length < 5) continue;
    let flips = 0, last: { dx: number; dy: number } | null = null;
    for (let i = 1; i < ser.length; i++) {
      const d = { dx: ser[i].x - ser[i - 1].x, dy: ser[i].y - ser[i - 1].y };
      if (Math.hypot(d.dx, d.dy) < 1.2) continue;
      if (last && d.dx * last.dx + d.dy * last.dy < 0) flips++;
      last = d;
    }
    out.dots += flips > 1 ? flips : 0;
  }
  return out;
}

interface StepRes { step: number; jitter: Jitter }
interface View { spread?: number; zoom: number; fitted: boolean; tiny: number; cut: number; words: number; vb: number[] }
interface Res { id: string; width: number; steps: number; three: boolean; start: View | null; plain: StepRes[]; zoomed: { how: string; before: View | null; after: View | null; step: StepRes; shot?: string; note?: string }[]; error?: string; ms: number }

const VIEW = `(() => { const root = document.querySelector("figure.part") || document.body, svg = root.querySelector("svg.eng-svg");
  if (!svg) { const h3 = root.querySelector(".eng-3d"); if (!h3) return null; const hr = h3.getBoundingClientRect(); let tiny = 0, cut = 0, words = 0, x0 = 1e9, x1 = -1e9;
    h3.querySelectorAll(".scn3-labels > div").forEach((el) => { if (!el.textContent.trim()) return; const b = el.getBoundingClientRect(); if (!b.width || getComputedStyle(el).display === "none" || (parseFloat(el.style.opacity || "1") || 0) < 0.5) return; words++; x0 = Math.min(x0, b.left); x1 = Math.max(x1, b.right); if (parseFloat(getComputedStyle(el).fontSize) < 9.5) tiny++; if (b.left < hr.left - 1 || b.right > hr.right + 1 || b.top < hr.top - 1 || b.bottom > hr.bottom + 1) cut++; });
    return { zoom: 1, spread: Math.round(Math.max(0, x1 - x0)), fitted: true, tiny, cut, words, vb: [0, 0, Math.round(hr.width), Math.round(hr.height)] }; }
  const r = svg.getBoundingClientRect(), vb = (svg.getAttribute("viewBox") || "0 0 1 1").split(/\\s+/).map(Number), view = +svg.getAttribute("width") || r.width;
  let tiny = 0, cut = 0, words = 0; const scale = r.width / vb[2];
  svg.querySelectorAll("text").forEach((t) => { if (!t.textContent.trim()) return; const b = t.getBoundingClientRect(); if (!b.width) return; let o = 1; for (let e = t; e && e.tagName.toLowerCase() !== "svg"; e = e.parentElement) { const v = parseFloat(getComputedStyle(e).opacity); if (!isNaN(v)) o *= v; } if (o < 0.5) return; words++;
    if (parseFloat(getComputedStyle(t).fontSize) * scale < 9.5) tiny++;
    if (b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1) cut++; });
  return { zoom: Math.round((view / vb[2]) * 100) / 100, fitted: svg.style.overflow === "visible", tiny, cut, words, vb: vb.map((v) => Math.round(v * 10) / 10) }; })()`;
const STEPS = `(() => { const s = document.querySelector(".stg[data-steps]"); return s ? +s.getAttribute("data-steps") : 0; })()`;
const RECT = `(() => { const r = document.querySelector("svg.eng-svg") || document.querySelector(".eng-3d"); if (!r) return null; const b = r.getBoundingClientRect(), top = Math.max(b.top, 60), bot = Math.min(b.bottom, innerHeight - 140); return { x: b.left, y: top, w: b.width, h: Math.max(20, bot - top) }; })()`; // the part of the stage on screen (a tall phone stage runs past the screen: the fingers must land on it)
const IS3D = `(() => { const r = document.querySelector("figure.part") || document.body; return !!r.querySelector(".eng-3d") && !r.querySelector("svg.eng-svg"); })()`;

async function go(p: Page, _k: number) { await p.eval(`(() => { const r = document.querySelector("figure.part") || document.body; const b = r.querySelector(".btn-go"); if (b) b.click(); })()`); }
async function center(p: Page) { await p.eval(`(document.querySelector("figure.part") || document.body).scrollIntoView({ block: "center" })`); await p.sleep(120); }
async function transition(p: Page, k: number, before: number[] | null, wait: number): Promise<StepRes> {
  await p.eval(`window.__sw.start()`);
  await go(p, k);
  await p.sleep(wait);
  const frames = await p.eval<Frame[]>(`window.__sw.stop()`);
  return { step: k, jitter: analyse(frames, before) };
}

async function runFence(p: Page, slug: string, width: number): Promise<Res> {
  const t0 = Date.now(), res: Res = { id: slug, width, steps: 0, three: false, start: null, plain: [], zoomed: [], ms: 0 };
  try {
    await p.viewport(width, 900, width < 700);
    await p.dark(false);
    await p.goto(`${BASE}/${slug}.html`);
    await p.eval(`document.fonts ? document.fonts.ready.then(() => 1) : 1`);
    await p.eval(REC);
    await center(p); await p.sleep(900);
    res.steps = await p.eval<number>(STEPS);
    res.three = await p.eval<boolean>(IS3D);
    res.start = await p.eval<View | null>(VIEW);
    if (!res.start || res.steps < 2) { res.ms = Date.now() - t0; return res; }
    const wait = (k: number) => 2300;
    let vb = res.start.vb;
    for (let k = 2; k <= res.steps; k++) {
      await center(p);
      const r = await transition(p, k, null, wait(k));
      res.plain.push(r);
      vb = (await p.eval<View | null>(VIEW))?.vb ?? vb;
    }
    if (!ZOOM) { res.ms = Date.now() - t0; return res; }
    // zoom-in: from step 1 each way of zooming in, then the next step (and the one after), sampled
    const ways: { how: string; run: () => Promise<void> }[] = [
      ...(res.three ? [{ how: "+ button twice", run: async () => { for (let i = 0; i < 2; i++) { await p.eval(`[...document.querySelectorAll("figure.part .stg-btn")].find((b) => b.getAttribute("aria-label") === "Zoom in").click()`); await p.sleep(150); } } }] : []),
      { how: "+ key twice", run: async () => { await p.eval(`(document.querySelector("figure.part .stg") || document.querySelector(".stg")).focus()`); await p.key("+", "Equal", 187); await p.sleep(120); await p.key("+", "Equal", 187); } },
      { how: res.three ? "wheel" : "Ctrl + wheel", run: async () => { const b = (await p.eval<{ x: number; y: number; w: number; h: number }>(RECT))!; const m = res.three ? 0 : 2; if (res.three) { await p.mouse("mouseMoved", b.x + b.w / 2, b.y + b.h / 2); await p.mouse("mousePressed", b.x + b.w / 2, b.y + b.h / 2, "left", 1); await p.mouse("mouseReleased", b.x + b.w / 2, b.y + b.h / 2, "left", 0); await p.sleep(200); } await p.wheel(b.x + b.w * 0.5, b.y + b.h * 0.5, 0, -120, m); await p.sleep(120); await p.wheel(b.x + b.w * 0.5, b.y + b.h * 0.5, 0, -120, m); } },
      ...(width < 700 ? [{ how: "pinch", run: async () => {
        const b = (await p.eval<{ x: number; y: number; w: number; h: number }>(RECT))!, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        await p.touch("touchStart", [{ x: cx, y: cy }]); await p.touch("touchEnd", []); await p.sleep(150);
        await p.touch("touchStart", [{ x: cx - 30, y: cy }, { x: cx + 30, y: cy }]);
        for (let i = 1; i <= 8; i++) { await p.touch("touchMove", [{ x: cx - 30 - i * 12, y: cy }, { x: cx + 30 + i * 12, y: cy }]); await p.sleep(20); }
        await p.touch("touchEnd", []);
      } }] : []),
    ];
    for (const w of ways) {
      await p.goto(`${BASE}/${slug}.html`); await p.eval(`document.fonts ? document.fonts.ready.then(() => 1) : 1`); await p.eval(REC); await center(p); await p.sleep(1600);
      await w.run(); await p.sleep(500);
      const before = await p.eval<View | null>(VIEW);
      const shotDir = join(OUT, "shots", slug, String(width)); mkdirSync(shotDir, { recursive: true });
      const box = await p.eval<{ x: number; y: number; width: number; height: number }>(`(() => { const r = (document.querySelector("figure.part") || document.body).getBoundingClientRect(); return { x: Math.max(0, r.left + scrollX - 4), y: Math.max(0, r.top + scrollY - 4), width: Math.min(innerWidth, r.width + 8), height: Math.min(r.height + 8, 1800) }; })()`);
      const f1 = join(shotDir, `zoom-${w.how.replace(/\W+/g, "-")}-a.png`);
      await p.shot(f1, box);
      const step = await transition(p, 2, before?.vb ?? null, 2300);
      const after = await p.eval<View | null>(VIEW);
      res.zoomed.push({ how: w.how, before, after, step, shot: f1.slice(OUT.length + 1), note: before && (res.three ? Math.abs((before.spread ?? 0) - (res.start.spread ?? 0)) < 0.05 * (res.start.spread || 1) : before.zoom <= res.start.zoom + 0.02) ? "the zoom did not take" : undefined });
    }
  } catch (e) { res.error = String((e as Error).message ?? e).slice(0, 200); }
  res.ms = Date.now() - t0;
  return res;
}

const queue = slugs.slice();
const results: Res[] = [];
let done = 0;
async function worker() {
  let page: Page | null = null, used = 0;
  while (true) {
    const slug = queue.shift(); if (!slug) break;
    for (const width of WIDTHS) {
      if (!page || used >= 25) { await page?.close().catch(() => {}); page = await launch(freePort()); used = 0; }
      used++;
      const r = await Promise.race([runFence(page, slug, width), new Promise<Res>((res) => setTimeout(() => res({ id: slug, width, steps: 0, three: false, start: null, plain: [], zoomed: [], error: "timeout 240 s", ms: 240000 }), 240_000))]);
      if (r.error) { await page.close().catch(() => {}); page = null; }
      results.push(r);
      writeFileSync(join(OUT, `${slug}-${width}.json`), JSON.stringify(r));
    }
    done++; if (done % 5 === 0) console.log(`sweep: ${done}/${slugs.length}`);
  }
  await page?.close().catch(() => {});
}
console.log(`sweep: ${slugs.length} fences x ${WIDTHS.join(" and ")} px, ${JOBS} Chrome, into ${OUT}`);
try { await Promise.all(Array.from({ length: JOBS }, () => worker())); } finally { killAll(); server.stop(true); }
writeFileSync(join(OUT, "all.json"), JSON.stringify(results));
console.log("sweep: done");
process.exit(0);
