#!/usr/bin/env bun
// The match harness: the measuring stick every engine rewrite is judged by (see scripts/MATCH.md).
//   bun scripts/match.ts [--out <dir>] [--only <glob>] [--width 1280|390] [--jobs N] [--settle <ms>] [--engine new|old] [--scheme light|dark]     one run
//   bun scripts/match.ts --compare <baseline run> <new run> [--out <dir>]                 two runs side by side
// Corpus: every ```animation and ```chart fence of fixtures/ (the 22 generality scenes are in fixtures/gt/), one id per
// fence: <file under fixtures/>#<n>. Each fence is drawn alone on a page (the example site's client), opened in headless
// Chrome (scripts/cdp.ts) at 1280 and 390 px wide, and for every step (a chart: every control state it can reach) there
// is a screenshot and the measurements below. Nothing here touches an engine: it reads the page the engines draw.
import { launch, killAll, type Page } from "./cdp";
import React from "react";
import { renderToString } from "react-dom/server";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { check, llmView, parse } from "../src/index";
import { tryEngine } from "../src/engine/bridge";
import { stepMs } from "../src/engine/render/svg";
import { DhDocument } from "../src/react/index";
import { documentJson } from "../src/react/hydrate";
import { buildCss } from "./build-css";

const PKG = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const flag = (k: string) => args.includes(k);
const opt = (k: string, d = "") => (args.includes(k) ? (args[args.indexOf(k) + 1] ?? d) : d);

// ================================================================== the checks
/** The measurements of one step (or one chart state). Every field is a count: 0 is clean; compare mode lists a field that went up. */
export const CHECK_FIELDS = ["overlap", "labels", "outside", "ellipsis", "small", "sideways", "crossings", "moved", "errors"] as const;
export type Checks = Record<(typeof CHECK_FIELDS)[number], number>;
const FIELD_HELP: Record<string, string> = {
  overlap: "words (svg text) whose boxes overlap by more than 2 x 3 px",
  labels: "label-check.ts: chart and drawing words that overlap (SAT on the drawn polygons, canvas words too)",
  outside: "words drawn outside the part's box",
  ellipsis: "words that end in an ellipsis (cut)",
  small: "part-check.ts: words under 11 px on screen (canvas words too)",
  sideways: "1 when the page scrolls sideways",
  crossings: "pairs of connector lines that cross away from their ends (animations)",
  moved: "words present in the step before that sit more than 3 px elsewhere now",
  errors: "script errors and console errors since the page loaded",
};

// The repo's own in-page probes are read out of the scripts that own them and run unchanged (they are scripts, not modules,
// so importing one would run it). If a script changes shape and the probe cannot be found, the check reports null.
function probeFrom(file: string, name: string, sel = ""): string | null {
  try {
    const src = readFileSync(join(import.meta.dir, file), "utf8");
    const m = new RegExp("const " + name + " = (?:\\(part: string\\) => )?`([\\s\\S]*?)`;\\n").exec(src);
    if (!m) return null;
    return new Function("return `" + m[1].replaceAll("${SEL}", sel) + "`")() as string;
  } catch { return null; }
}
const RECORD = probeFrom("label-check.ts", "RECORD");
const LABELS = probeFrom("label-check.ts", "MEASURE");
const PART = probeFrom("part-check.ts", "MEASURE", "figure.part");
/** the page's error collector (script errors, rejections, console.error), and a no-op fallback of the canvas recorder */
const COLLECT = `(() => { const s = window.__par = { errors: 0, msgs: [] };
  const add = (m) => { s.errors++; s.msgs.push(String(m).slice(0, 120)); };
  window.addEventListener("error", (e) => add(e.message || (e.target && e.target.src) || "error")); window.addEventListener("unhandledrejection", (e) => add("rejection " + e.reason));
  const ce = console.error.bind(console); console.error = (...a) => { add(a.map(String).join(" ")); ce(...a); }; })();`;

// the part under test: the first figure of the page
const ROOT = `(document.querySelector("figure.part") || document.querySelector("[data-dh-part]") || document.body)`;
const VIS = `const vis = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.15) return false; } return true; };`;
/** words, boxes and connector crossings of the part, read from what is drawn (both animation engines and the charts draw svg) */
const PROBE = `(() => { ${VIS}
  const root = ${ROOT}, rr = root.getBoundingClientRect();
  const texts = [...root.querySelectorAll("svg text")].filter((t) => t.textContent.trim() && !t.closest(".sr-only") && vis(t)).map((t) => ({ t: t.textContent.trim().replace(/\\s+/g, " "), r: t.getBoundingClientRect() })).filter((x) => x.r.width > 0 && x.r.height > 0);
  const ov = [];
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i].r, b = texts[j].r;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 2 && h > 3) ov.push(texts[i].t + " <> " + texts[j].t);
  }
  const outside = texts.filter((x) => x.r.right > rr.right + 1 || x.r.left < rr.left - 1).map((x) => x.t);
  const ell = texts.filter((x) => x.t.endsWith("\\u2026")).map((x) => x.t);
  const words = texts.map((x) => [x.t, Math.round((x.r.left + x.r.width / 2 - rr.left) * 10) / 10, Math.round((x.r.top + x.r.height / 2 - rr.top) * 10) / 10]);
  // connector lines: stroked, unfilled paths (not markers, not clip paths); crossings are counted away from both ends
  let cross = [];
  const svgs = [...root.querySelectorAll("svg")].filter((s) => vis(s) && s.getBoundingClientRect().width > 0);
  const lines = [];
  for (const s of svgs) for (const p of s.querySelectorAll("path, polyline")) {
    if (p.closest("defs, marker, clipPath, mask, symbol") || !vis(p) || !p.getTotalLength) continue;
    const cs = getComputedStyle(p); if (cs.stroke === "none" || (cs.fill !== "none" && p.tagName === "path" && cs.fill !== "rgba(0, 0, 0, 0)")) continue;
    const L = p.getTotalLength(), m = p.getScreenCTM(); if (!m || !(L > 12) || lines.length >= 90) continue;
    const n = Math.min(48, Math.max(4, Math.ceil(L / 8))), pts = [];
    for (let i = 0; i <= n; i++) { const q = p.getPointAtLength((L * i) / n); pts.push([m.a * q.x + m.c * q.y + m.e, m.b * q.x + m.d * q.y + m.f]); }
    lines.push(pts);
  }
  const seg = (p, q, r, s) => { const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]); if (Math.abs(d) < 1e-9) return null;
    const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d, u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
    return t > 0 && t < 1 && u > 0 && u < 1 ? [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])] : null; };
  const near = (pt, pts) => Math.hypot(pt[0] - pts[0][0], pt[1] - pts[0][1]) < 12 || Math.hypot(pt[0] - pts[pts.length - 1][0], pt[1] - pts[pts.length - 1][1]) < 12;
  for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
    let hit = false;
    for (let i = 0; i + 1 < lines[a].length && !hit; i++) for (let j = 0; j + 1 < lines[b].length && !hit; j++) { const x = seg(lines[a][i], lines[a][i + 1], lines[b][j], lines[b][j + 1]); if (x && !near(x, lines[a]) && !near(x, lines[b])) hit = true; }
    if (hit) cross.push(a + "x" + b);
  }
  return { overlap: ov, outside, ellipsis: ell, words, crossings: cross, lines: lines.length };
})()`;
/** the canvas words of a chart (recorded by label-check's recorder) under 11 px */
const CANVAS_SMALL = `(() => { let n = 0; document.querySelectorAll("canvas").forEach((c) => (c.__t || []).forEach((w) => { if (!String(w.s).trim()) return; const px = parseFloat(/(\\d+(?:\\.\\d+)?)px/.exec(w.font)?.[1] || "99") * Math.abs(w.m.a); if (px < 10.99) n++; })); return n; })()`;
/** the part's box on the page, for the screenshot */
const BOX = `(() => { const r = ${ROOT}.getBoundingClientRect(); return { x: Math.max(0, r.left + scrollX - 4), y: Math.max(0, r.top + scrollY - 4), width: Math.min(innerWidth, r.width + 8), height: r.height + 8 }; })()`;

// ================================================================== the corpus
export interface Fence { id: string; kind: "animation" | "chart"; file: string; n: number; info: string; body: string; fm: string; slug: string }
const slugOf = (id: string) => id.replace(/[^A-Za-z0-9.-]+/g, "_");

function mdFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...mdFiles(p)); else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}
/** every animation and chart fence of one file, in order; a fence inside another fence (a code sample) is not one */
export function fencesOf(file: string, text: string): Fence[] {
  const lines = text.split("\n");
  let fm = "";
  if (lines[0] === "---") { const end = lines.indexOf("---", 1); if (end > 0) fm = lines.slice(0, end + 1).join("\n"); }
  const out: Fence[] = [];
  let open: { ticks: string; kind: string; info: string; body: string[] } | null = null;
  for (const line of lines) {
    if (open) {
      if (new RegExp("^" + open.ticks[0] + "{" + open.ticks.length + ",}\\s*$").test(line)) {
        if (open.kind === "animation" || open.kind === "chart") {
          const n = out.length + 1, id = `${file}#${n}`;
          out.push({ id, kind: open.kind, file, n, info: open.info, body: open.body.join("\n"), fm, slug: slugOf(id) });
        }
        open = null;
      } else open.body.push(line);
      continue;
    }
    const m = /^(`{3,}|~{3,})\s*([A-Za-z0-9_-]*)(.*)$/.exec(line);
    if (m) open = { ticks: m[1], kind: m[2], info: m[3].trim(), body: [] };
  }
  return out;
}
export function corpus(): Fence[] {
  const root = join(PKG, "fixtures"), all: Fence[] = [];
  for (const f of mdFiles(root)) all.push(...fencesOf(relative(root, f), readFileSync(f, "utf8")));
  return all;
}
const pageText = (f: Fence) => `${f.fm ? f.fm + "\n\n" : ""}\`\`\`${f.kind}${f.info ? " " + f.info : ""}\n${f.body}\n\`\`\`\n`;

// ================================================================== PNG (for compare mode: no image library is installed)
interface Img { w: number; h: number; px: Uint8Array; ch: number }
export function decodePng(buf: Uint8Array): Img {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 8, w = 0, h = 0, ct = 0;
  const idat: Uint8Array[] = [];
  while (p + 8 <= buf.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(...buf.subarray(p + 4, p + 8)), d = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); ct = buf[p + 17]; if (buf[p + 16] !== 8 || buf[p + 20] !== 0) throw new Error("png: only 8-bit, not interlaced"); }
    else if (type === "IDAT") idat.push(d);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : ct === 4 ? 2 : 0;
  if (!ch) throw new Error("png: colour type " + ct);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch, px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[dst + x - ch] : 0, b = y ? px[dst - stride + x] : 0, c = x >= ch && y ? px[dst - stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  return { w, h, px, ch };
}
/** the share of pixels that differ (any colour channel by more than 24 of 255); a picture of another size counts its extra area as different */
export function pixelScore(a: Img, b: Img): number {
  const w = Math.min(a.w, b.w), h = Math.min(a.h, b.h);
  let diff = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * a.w + x) * a.ch, j = (y * b.w + x) * b.ch;
    const ca = a.ch >= 3 ? 3 : 1, cb = b.ch >= 3 ? 3 : 1;
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.px[i + Math.min(c, ca - 1)] - b.px[j + Math.min(c, cb - 1)]));
    if (d > 24) diff++;
  }
  const area = Math.max(a.w * a.h, b.w * b.h);
  diff += area - w * h;
  return area ? diff / area : 0;
}

// ================================================================== the report
interface Step { step: number; label: string; shot: string; checks: Checks; samples?: Record<string, string[]> }
interface WidthRun { steps: Step[]; sheet?: string; error?: string; ms: number }
interface FenceRun { id: string; kind: string; file: string; n: number; info: string; slug: string; problems: number; llm: string; core?: unknown; widths: Record<string, WidthRun> }
interface Report { meta: Record<string, unknown>; fences: Record<string, FenceRun> }

const zero = (): Checks => Object.fromEntries(CHECK_FIELDS.map((k) => [k, 0])) as Checks;
const sum = (c: Checks) => CHECK_FIELDS.reduce((s, k) => s + c[k], 0);

// ================================================================== compare mode
if (flag("--compare")) {
  const [a, b] = args.slice(args.indexOf("--compare") + 1).filter((x) => !x.startsWith("--"));
  if (!a || !b) { console.error("usage: bun scripts/match.ts --compare <baseline run> <new run> [--out <dir>]"); process.exit(2); }
  const A = JSON.parse(readFileSync(join(resolve(a), "report.json"), "utf8")) as Report, B = JSON.parse(readFileSync(join(resolve(b), "report.json"), "utf8")) as Report;
  const outDir = resolve(opt("--out", resolve(b)));
  const rows: { id: string; worse: string[]; llm: { removed: string[]; added: string[] }; pix: { w: string; step: number; score: number }[]; missing?: string }[] = [];
  const img = (dir: string, rel: string) => { try { return decodePng(readFileSync(join(resolve(dir), rel))); } catch { return null; } };
  for (const id of [...new Set([...Object.keys(A.fences), ...Object.keys(B.fences)])].sort()) {
    const fa = A.fences[id], fb = B.fences[id];
    if (!fa || !fb) { rows.push({ id, worse: [], llm: { removed: [], added: [] }, pix: [], missing: !fa ? "only in the new run" : "only in the baseline" }); continue; }
    const worse: string[] = [], pix: { w: string; step: number; score: number }[] = [];
    if (fb.problems > fa.problems) worse.push(`doccheck problems ${fa.problems} -> ${fb.problems}`);
    for (const w of Object.keys(fa.widths)) {
      const wa = fa.widths[w], wb = fb.widths[w];
      if (!wb) continue;
      if (wb.error && !wa.error) worse.push(`${w}: now fails: ${wb.error.slice(0, 80)}`);
      if (wb.steps.length !== wa.steps.length) worse.push(`${w}: ${wa.steps.length} -> ${wb.steps.length} steps`);
      for (let k = 0; k < Math.min(wa.steps.length, wb.steps.length); k++) {
        for (const f of CHECK_FIELDS) if (wb.steps[k].checks[f] > wa.steps[k].checks[f]) worse.push(`${w} step ${wb.steps[k].step}: ${f} ${wa.steps[k].checks[f]} -> ${wb.steps[k].checks[f]}`);
        const ia = img(a, wa.steps[k].shot), ib = img(b, wb.steps[k].shot);
        pix.push({ w, step: wb.steps[k].step, score: ia && ib ? Math.round(pixelScore(ia, ib) * 10000) / 10000 : 1 });
      }
    }
    const la = new Set(existsSync(join(resolve(a), fa.llm)) ? readFileSync(join(resolve(a), fa.llm), "utf8").split("\n") : []);
    const lb = new Set(existsSync(join(resolve(b), fb.llm)) ? readFileSync(join(resolve(b), fb.llm), "utf8").split("\n") : []);
    rows.push({ id, worse, llm: { removed: [...la].filter((x) => !lb.has(x)), added: [...lb].filter((x) => !la.has(x)) }, pix });
  }
  const maxPix = (r: (typeof rows)[number]) => Math.max(0, ...r.pix.map((p) => p.score));
  rows.sort((x, y) => (y.missing ? 1 : 0) - (x.missing ? 1 : 0) || y.worse.length - x.worse.length || y.llm.removed.length + y.llm.added.length - (x.llm.removed.length + x.llm.added.length) || maxPix(y) - maxPix(x));
  const md: string[] = [`# Match compare`, ``, `Baseline: ${a} (${A.meta.commit})`, `New: ${b} (${B.meta.commit})`, ``];
  const nWorse = rows.filter((r) => r.worse.length).length, nLlm = rows.filter((r) => r.llm.removed.length || r.llm.added.length).length, nPix = rows.filter((r) => maxPix(r) > 0.001).length;
  md.push(`| What | Fences |`, `| --- | --- |`, `| fences compared | ${rows.length} |`, `| a check got worse | ${nWorse} |`, `| LLM view changed | ${nLlm} |`, `| a step differs by more than 0.1% of its pixels | ${nPix} |`, `| missing on one side | ${rows.filter((r) => r.missing).length} |`, ``);
  md.push(`## Worst first`, ``, `| Fence | Checks worse | LLM lines changed | Worst pixel score |`, `| --- | --- | --- | --- |`);
  for (const r of rows.filter((r) => r.missing || r.worse.length || r.llm.removed.length || r.llm.added.length || maxPix(r) > 0.001)) md.push(`| ${r.id} | ${r.missing ?? r.worse.length} | ${r.llm.removed.length + r.llm.added.length} | ${maxPix(r).toFixed(4)} |`);
  md.push(``, `## Detail`, ``);
  for (const r of rows) {
    if (!(r.worse.length || r.llm.removed.length || r.llm.added.length || maxPix(r) > 0.001)) continue;
    md.push(`### ${r.id}`, ``);
    for (const w of r.worse.slice(0, 12)) md.push(`- worse: ${w}`);
    for (const l of r.llm.removed.slice(0, 5)) md.push(`- LLM view lost: ${l}`);
    for (const l of r.llm.added.slice(0, 5)) md.push(`- LLM view gained: ${l}`);
    const top = [...r.pix].sort((p, q) => q.score - p.score).slice(0, 3).filter((p) => p.score > 0.001);
    if (top.length) md.push(`- pixels: ${top.map((p) => `${p.w} px step ${p.step}: ${p.score}`).join("; ")}`);
    md.push(``);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "compare.md"), md.join("\n"));
  writeFileSync(join(outDir, "compare.json"), JSON.stringify(rows, null, 1));
  console.log(md.slice(0, 12).join("\n"));
  console.log(`written: ${join(outDir, "compare.md")}`);
  process.exit(0);
}

// ================================================================== a run
const WIDTHS = opt("--width") ? [Number(opt("--width"))] : [1280, 390];
if (WIDTHS.some((w) => w !== 1280 && w !== 390)) { console.error("--width is 1280 or 390"); process.exit(2); }
const JOBS = Math.max(1, Math.min(4, Number(opt("--jobs", "3")) | 0 || 3));
if (Number(opt("--jobs", "3")) > 4) console.error("match: at most 4 Chrome at once; using 4");
const sha = (() => { try { return Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: PKG }).stdout.toString().trim(); } catch { return "nogit"; } })();
const RUN = resolve(opt("--out", join(PKG, "dist/match", `${sha}-${new Date().toISOString().replace(/[:.]/g, "-")}`)));
const only = opt("--only");
/** a glob over the whole id: * is any run of characters (also across /), ? one, {a,b} either */
const globRe = (g: string) => new RegExp("^" + g.replace(/[.+^$()|\\[\]]/g, (c) => "\\" + c).replace(/\*/g, ".*").replace(/\?/g, ".").replace(/\{([^}]*)\}/g, (_, a: string) => "(?:" + a.split(",").join("|") + ")") + "$");
const matcher = only ? globRe(/[*?{]/.test(only) ? only : `*${only}*`) : null;
/** --engine new|old names the engine on all three sides: parse (so the saved LLM view, the texts and the doccheck are the engine's), the server render and the client (ENGINE_DEFAULT is "new" now, so "old" must be passed too) // gate3 */
const ENGINE = opt("--engine", "old");
if (ENGINE !== "new" && ENGINE !== "old") { console.error("--engine is new or old"); process.exit(2); }
/** --scheme dark runs Chrome with prefers-color-scheme: dark (the page's tokens follow it) */
const SCHEME = opt("--scheme", "light");
if (SCHEME !== "light" && SCHEME !== "dark") { console.error("--scheme is light or dark"); process.exit(2); }
const SETTLE_MS = Number(opt("--settle", process.env.MATCH_SETTLE_MS ?? "850"));
if (!Number.isFinite(SETTLE_MS) || SETTLE_MS < 0) { console.error("--settle needs a nonnegative number of milliseconds"); process.exit(2); }

let fences = corpus();
if (matcher) fences = fences.filter((f) => matcher.test(f.id));
if (!fences.length) { console.error("no fence matches"); process.exit(2); }
for (const d of ["site/assets", "shots", "llm", "sheets", "sheet-src"]) mkdirSync(join(RUN, d), { recursive: true });
console.log(`match: ${fences.length} fences x ${WIDTHS.join(" and ")} px, ${JOBS} Chrome, into ${RUN}`);

// ---- the site: the example client, one page per fence
writeFileSync(join(RUN, "site/assets/styles.css"), buildCss() + "\n" + readFileSync(join(PKG, "example/site.css"), "utf8"));
cpSync(join(PKG, "example/fonts"), join(RUN, "site/assets/fonts"), { recursive: true });
// the example client builds its props in one place; the plugin adds the chosen engine there (the checked-in client stays as it is) // gate3
const forceEngine = { name: "match-engine", setup(build: any) {
  build.onLoad({ filter: /example\/client\.tsx$/ }, async (a: { path: string }) => {
    const text = await Bun.file(a.path).text();
    if (!text.includes("({ doc: doc!")) throw new Error("match: example/client.tsx no longer builds its props as ({ doc: doc! ...: cannot force the engine");
    return { contents: text.replace("({ doc: doc!", `({ engine: ${JSON.stringify(ENGINE)} as const, doc: doc!`), loader: "tsx" };
  });
} };
const built = await Bun.build({ entrypoints: [join(PKG, "example/client.tsx")], outdir: join(RUN, "site/assets"), splitting: true, format: "esm", minify: false, target: "browser", plugins: [forceEngine] });
if (!built.success) { console.error(built.logs); process.exit(1); }
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const runs = new Map<string, FenceRun>();
for (const f of fences) {
  const text = pageText(f);
  let doc;
  try { doc = parse(text, { path: basename(f.file), engine: ENGINE }); /* gate3 */ } catch (e) { runs.set(f.id, { id: f.id, kind: f.kind, file: f.file, n: f.n, info: f.info, slug: f.slug, problems: -1, llm: "", widths: {}, core: { error: String(e).slice(0, 200) } }); continue; }
  // --engine new: the time each step needs to settle (the new stage tweens), read by the page loop below
  const animBlock = (doc.blocks as any[]).find((b) => b.type === "animation");
  const engineRun = ENGINE === "new" && animBlock ? tryEngine(animBlock) : null;
  const waitsFor = engineRun?.c ? Array.from({ length: Math.max(1, engineRun.c.states.length - 1) }, (_, i) => stepMs(engineRun.c!, i + 1)) : [];
  writeFileSync(join(RUN, `site/${f.slug}.html`), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(f.id)}</title><link rel="stylesheet" href="assets/styles.css"><script type="module" src="assets/client.js"></script></head><body data-graph-waits='${JSON.stringify(waitsFor)}'><main class="ex-main"><div id="dh-root">${renderToString(React.createElement(DhDocument, { doc, engine: ENGINE }))}</div></main><script type="application/json" id="dh-doc">${documentJson(doc)}</script></body></html>`);
  const llm = `llm/${f.slug}.txt`;
  writeFileSync(join(RUN, llm), llmView(doc, { engine: ENGINE })); // gate3
  let problems = 0;
  try { problems = check(text, { path: basename(f.file), engine: ENGINE }).length; /* gate3 */ } catch { problems = -1; }
  runs.set(f.id, { id: f.id, kind: f.kind, file: f.file, n: f.n, info: f.info, slug: f.slug, problems, llm, core: await coreChecks(doc), widths: {} });
}

/** The pure checks of the graph engine on the fence (crossing lines, words over words, the smallest type), when this build still has them.
 *  Looked up by name at run time, so a build without them reports nothing instead of failing. */
async function coreChecks(doc: any): Promise<unknown> {
  try {
    const block = (doc.blocks ?? []).find((b: any) => b.type === "animation");
    if (!block || block.stage) return block ? { engine: "stage" } : undefined;
    const scene: any = await import("../src/core/scene").catch(() => null);
    if (!scene?.compileScene) return undefined;
    const a = block.anim, c = scene.compileScene(a.head, a.steps, a.base, a.info);
    const stepOf = (line: number) => c.scene.steps.findIndex((s: any) => s.line === line);
    const steps = c.frames.map((fr: any, k: number) => ({
      step: k + 1,
      crossings: c.warnings.filter((w: any) => stepOf(w.line) === k && /cross/.test(w.msg)).length,
      overlap: scene.overlaps ? (() => { const o = scene.overlaps(fr); return o.label + o.shape; })() : null,
      minFont: scene.minFont ? Math.round(scene.minFont(fr) * 10) / 10 : null,
    }));
    return { engine: "graph", errors: c.errors.length, warnings: c.warnings.length, steps };
  } catch (e) { return { error: String(e).slice(0, 200) }; }
}

// ---- the server (the run folder, read only)
const server = Bun.serve({
  port: 0, hostname: "127.0.0.1",
  fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname);
    if (p.includes("..")) return new Response("no", { status: 400 });
    const f = Bun.file(join(RUN, p.startsWith("/assets/") ? "site" + p : p.startsWith("/site/") || p.startsWith("/shots/") || p.startsWith("/sheet-src/") ? p : "site" + p));
    return f.size ? new Response(f) : new Response("", { status: 404 });
  },
});
const BASE = `http://127.0.0.1:${server.port}`;

// ---- one fence at one width
const freePort = () => { const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") }); const p = s.port; s.stop(true); return p; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const timeout = <T>(p: Promise<T>, ms: number, what: string) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what}: no answer in ${ms / 1000} s`)), ms))]);

/** The states to shoot: an animation's steps, a chart's control states (steps, first and last option, slider ends, each switch). */
async function plan(p: Page, kind: string): Promise<{ label: string; go: string }[]> {
  const info = await p.eval<{ steps: number; chart: any }>(`(() => { const root = ${ROOT};
    const stg = root.querySelector(".stg[data-steps]"); let steps = stg ? +stg.getAttribute("data-steps") : 0;
    if (!steps) steps = root.querySelectorAll("[data-bar-step]").length || root.querySelectorAll(".scn-steps button, ol button").length;
    const range = root.querySelector("input.ctl-range[aria-label]"); if (!steps && range) steps = +range.max + 1;
    const ctl = [];
    root.querySelectorAll(".chart-ctl select").forEach((s, i) => ctl.push({ t: "select", i, n: s.options.length, d: s.selectedIndex }));
    root.querySelectorAll(".chart-ctl input[type=range], .pc-range").forEach((s, i) => ctl.push({ t: "range", i, min: s.min, max: s.max, d: s.value }));
    root.querySelectorAll(".pc-seg-b").forEach((s, i) => ctl.push({ t: "seg", i }));
    root.querySelectorAll(".pc-check input[type=checkbox]").forEach((s, i) => ctl.push({ t: "check", i, d: s.checked }));
    return { steps, chart: ctl }; })()`);
  const out: { label: string; go: string }[] = [];
  const set = (sel: string, i: number, v: string) => `(() => { const e = ${ROOT}.querySelectorAll(${JSON.stringify(sel)})[${i}]; if (!e) return; const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e), "value"); d.set.call(e, ${JSON.stringify(v)}); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
  if (kind === "chart") {
    const stepRange = await p.eval<{ max: number } | null>(`(() => { const r = ${ROOT}.querySelector(".chart-steps input.ctl-range"); return r ? { max: +r.max } : null; })()`);
    if (stepRange) for (let k = 0; k <= stepRange.max; k++) out.push({ label: `step ${k + 1}`, go: set(".chart-steps input.ctl-range", 0, String(k)) });
    else out.push({ label: "as drawn", go: "0" });
    const seg = info.chart.filter((c: any) => c.t === "seg");
    const reset: string[] = [];
    for (const c of info.chart) {
      if (out.length >= 14) break;
      if (c.t === "select") for (const [name, idx] of [["first option", 0], ["last option", c.n - 1]] as const) { if (idx !== c.d || name === "last option") out.push({ label: `select ${c.i + 1} ${name}`, go: `(() => { const e = ${ROOT}.querySelectorAll(".chart-ctl select")[${c.i}]; if (!e) return; const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value"); d.set.call(e, e.options[${idx}].value); e.dispatchEvent(new Event("change", { bubbles: true })); })()` }); }
      else if (c.t === "range") for (const [name, v] of [["min", c.min], ["max", c.max]] as const) out.push({ label: `slider ${c.i + 1} ${name}`, go: set(".chart-ctl input[type=range], .pc-range", c.i, String(v)) });
      else if (c.t === "check") out.push({ label: `switch ${c.i + 1} flipped`, go: `${ROOT}.querySelectorAll(".pc-check input[type=checkbox]")[${c.i}].click()` });
    }
    for (const c of seg) if (out.length < 14) out.push({ label: `button ${c.i + 1}`, go: `${ROOT}.querySelectorAll(".pc-seg-b")[${c.i}].click()` });
    void reset;
    return out;
  }
  const n = Math.max(1, info.steps);
  for (let k = 1; k <= n; k++) out.push({ label: n > 1 ? `step ${k}` : "still", go: n > 1 ? `(() => { const r = ${ROOT}; const b = r.querySelector('[data-bar-step="${k}"]') || r.querySelectorAll(".scn-steps button, ol button")[${k - 1}]; if (b) { b.click(); return; } const g = r.querySelector("input.ctl-range[aria-label]"); if (g) { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value"); d.set.call(g, String(${k - 1})); g.dispatchEvent(new Event("input", { bubbles: true })); g.dispatchEvent(new Event("change", { bubbles: true })); } })()` : "0" });
  return out;
}

async function measure(p: Page, kind: string, prev: [string, number, number][] | null): Promise<{ checks: Checks; samples: Record<string, string[]>; words: [string, number, number][] }> {
  const c = zero(), samples: Record<string, string[]> = {};
  const pr = await p.eval<any>(PROBE);
  c.overlap = pr.overlap.length; if (pr.overlap.length) samples.overlap = pr.overlap.slice(0, 4);
  c.outside = pr.outside.length; if (pr.outside.length) samples.outside = pr.outside.slice(0, 4);
  c.ellipsis = pr.ellipsis.length; if (pr.ellipsis.length) samples.ellipsis = pr.ellipsis.slice(0, 4);
  if (kind === "animation") { c.crossings = pr.crossings.length; if (pr.crossings.length) samples.crossings = pr.crossings.slice(0, 4); }
  if (LABELS) { const m = await p.eval<any>(LABELS); c.labels = m.out.length; if (m.out.length) samples.labels = m.out.slice(0, 4).map((o: any) => `${o.a} <> ${o.b}`); }
  if (PART) { const m = await p.eval<any>(PART); c.small = m.small; c.sideways = m.sideways > 1 ? 1 : 0; if (m.small) samples.small = [`smallest ${m.smallest} px`]; }
  c.small += await p.eval<number>(CANVAS_SMALL);
  const er = await p.eval<{ errors: number; msgs: string[] }>(`window.__par || { errors: 0, msgs: [] }`);
  c.errors = er.errors; if (er.errors) samples.errors = er.msgs.slice(0, 3);
  const words = pr.words as [string, number, number][];
  if (prev) {
    const once = (ws: [string, number, number][]) => { const m = new Map<string, [number, number] | null>(); for (const [t, x, y] of ws) m.set(t, m.has(t) ? null : [x, y]); return m; };
    const a = once(prev), b = once(words), moved: string[] = [];
    for (const [t, q] of b) { const o = a.get(t); if (q && o && Math.hypot(q[0] - o[0], q[1] - o[1]) > 3) moved.push(t); }
    c.moved = moved.length; if (moved.length) samples.moved = moved.slice(0, 4);
  }
  return { checks: c, samples, words };
}

async function runFence(p: Page, f: Fence, width: number): Promise<WidthRun> {
  const t0 = Date.now(), steps: Step[] = [];
  const dir = join(RUN, "shots", f.slug, String(width));
  mkdirSync(dir, { recursive: true });
  try {
    await p.viewport(width, 900, width < 700);
    await p.dark(SCHEME === "dark");
    await p.goto(`${BASE}/${f.slug}.html`);
    await p.eval(`document.fonts ? document.fonts.ready.then(() => 1) : 1`);
    await p.eval(`${ROOT}.scrollIntoView({ block: "center" })`);
    await p.sleep(600);
    const states = await plan(p, f.kind);
    let prev: [string, number, number][] | null = null;
    for (const [i, s] of states.entries()) {
      if (s.go !== "0") await p.eval(s.go);
      await p.eval(`${ROOT}.scrollIntoView({ block: "center" })`);
      const wait = ENGINE === "new" ? await p.eval<number>(`Number(JSON.parse(document.body.dataset.graphWaits || "[]")[${i}] || 0)`) : 0;
      await p.sleep(Math.max(SETTLE_MS, wait + 120));
      const m = await measure(p, f.kind, prev);
      prev = m.words;
      await p.eval(`${ROOT}.scrollIntoView({ block: "center" })`);
      await p.sleep(80);
      const box = await p.eval<{ x: number; y: number; width: number; height: number }>(BOX);
      const rel = `shots/${f.slug}/${width}/${String(i + 1).padStart(2, "0")}.png`;
      await p.shot(join(RUN, rel), { ...box, height: Math.min(box.height, 6000) });
      steps.push({ step: i + 1, label: s.label, shot: rel, checks: m.checks, ...(Object.keys(m.samples).length ? { samples: m.samples } : {}) });
    }
    // the contact sheet: the steps side by side (a web page of the shots, shot in turn)
    const cell = width === 1280 ? 560 : 200;
    writeFileSync(join(RUN, "sheet-src", `${f.slug}-${width}.html`), `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#888;font:13px sans-serif}.g{display:flex;flex-wrap:wrap;gap:8px;padding:8px;width:${(cell + 8) * (width === 1280 ? 4 : 6)}px;box-sizing:border-box}figure{margin:0;width:${cell}px;background:#fff}figcaption{padding:2px 4px;background:#222;color:#fff}img{width:100%;display:block}</style><div class="g">${steps.map((s) => `<figure><figcaption>${s.step} ${esc(s.label)}</figcaption><img src="/${s.shot}"></figure>`).join("")}</div>`);
    await p.viewport(width === 1280 ? 2400 : 1260, 900, false);
    await p.goto(`${BASE}/sheet-src/${f.slug}-${width}.html`);
    await p.sleep(300);
    const sz = await p.eval<{ w: number; h: number }>(`(() => { const r = document.querySelector('.g').getBoundingClientRect(); return { w: Math.ceil(r.right + 8), h: Math.ceil(r.bottom + 8) }; })()`);
    const sheet = `sheets/${f.slug}-${width}.png`;
    await p.shot(join(RUN, sheet), { x: 0, y: 0, width: sz.w, height: Math.min(sz.h, 16000) });
    return { steps, sheet, ms: Date.now() - t0 };
  } catch (e) { return { steps, error: String((e as Error).message ?? e).slice(0, 200), ms: Date.now() - t0 }; }
}

// ---- the workers: one Chrome each, started again every 30 fences and when it dies; its profile is removed on close
const queue = fences.filter((f) => runs.get(f.id)?.problems !== -1 || runs.get(f.id)?.llm).slice();
let done = 0;
const profiles: string[] = [];
async function worker(w: number) {
  let page: Page | null = null, used = 0;
  while (true) {
    const f = queue.shift();
    if (!f) break;
    const r = runs.get(f.id)!;
    for (const width of WIDTHS) {
      if (!page || used >= 30) {
        await page?.close().catch(() => {});
        page = await launch(freePort());
        profiles.push(page.profileDir); used = 0;
        await page.send("Page.addScriptToEvaluateOnNewDocument", { source: COLLECT });
        if (RECORD) await page.send("Page.addScriptToEvaluateOnNewDocument", { source: RECORD });
      }
      used++;
      const res = await timeout(runFence(page, f, width), 150_000, `${f.id} at ${width}`).catch((e) => ({ steps: [], error: String(e.message), ms: 0 }) as WidthRun);
      r.widths[String(width)] = res;
      if (res.error && /no answer|chrome|socket|closed/i.test(res.error)) { await page.close().catch(() => {}); page = null; }
    }
    done++;
    if (done % 10 === 0 || done === fences.length) console.log(`match: ${done}/${fences.length}  ${f.id}`);
  }
  await page?.close().catch(() => {});
  void w;
}
try { await Promise.all(Array.from({ length: JOBS }, (_, w) => worker(w))); }
finally { killAll(); server.stop(true); }

// ---- the report
const meta = { commit: sha, branch: (() => { try { return Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd: PKG }).stdout.toString().trim(); } catch { return ""; } })(), when: new Date().toISOString(), widths: WIDTHS, engine: ENGINE, scheme: SCHEME, settle: SETTLE_MS, fences: fences.length, jobs: JOBS, only: only || null, fields: FIELD_HELP };
const report: Report = { meta, fences: Object.fromEntries([...runs].sort(([a], [b]) => (a < b ? -1 : 1))) };
writeFileSync(join(RUN, "report.json"), JSON.stringify(report, null, 1));

const md: string[] = [`# Match run ${sha}`, ``, `${fences.length} fences (${fences.filter((f) => f.kind === "animation").length} animation, ${fences.filter((f) => f.kind === "chart").length} chart) at ${WIDTHS.join(" and ")} px. Run ${meta.when}.`, ``];
const tot = (w: string, k: (typeof CHECK_FIELDS)[number]) => Object.values(report.fences).reduce((s, f) => s + (f.widths[w]?.steps.reduce((a, st) => a + st.checks[k], 0) ?? 0), 0);
const hit = (k: (typeof CHECK_FIELDS)[number]) => Object.values(report.fences).filter((f) => Object.values(f.widths).some((w) => w.steps.some((st) => st.checks[k] > 0))).length;
md.push(`## Counts`, ``, `| Check | ${WIDTHS[0]} px | ${WIDTHS[1] ?? "-"} px | Fences hit |`, `| --- | --- | --- | --- |`);
for (const k of CHECK_FIELDS) md.push(`| ${k} | ${tot(String(WIDTHS[0]), k)} | ${WIDTHS[1] ? tot(String(WIDTHS[1]), k) : "-"} | ${hit(k)} |`);
const steps = (w: string) => Object.values(report.fences).reduce((s, f) => s + (f.widths[w]?.steps.length ?? 0), 0);
const failed = Object.values(report.fences).filter((f) => f.problems === -1 || Object.values(f.widths).some((w) => w.error) || !Object.keys(f.widths).length);
md.push(``, `Steps and states shot: ${WIDTHS.map((w) => `${steps(String(w))} at ${w} px`).join(", ")}. Fences that did not run clean: ${failed.length}. Fences with doccheck problems: ${Object.values(report.fences).filter((f) => f.problems > 0).length}.`, ``);
if (failed.length) { md.push(`## Did not run clean`, ``, `| Fence | Width | What |`, `| --- | --- | --- |`); for (const f of failed) { const ws = Object.entries(f.widths).filter(([, w]) => w.error); if (!ws.length) md.push(`| ${f.id} | - | ${f.problems === -1 ? "parse() threw" : "not run"} |`); for (const [w, r] of ws) md.push(`| ${f.id} | ${w} | ${r.error} |`); } md.push(``); }
const score = (f: FenceRun) => Object.values(f.widths).reduce((s, w) => s + w.steps.reduce((a, st) => a + sum(st.checks) - st.checks.errors * 0, 0), 0);
md.push(`## Worst fences first`, ``, `| Fence | Check total | Worst check | Contact sheet |`, `| --- | --- | --- | --- |`);
for (const f of Object.values(report.fences).filter((f) => score(f) > 0).sort((a, b) => score(b) - score(a)).slice(0, 40)) {
  const per = CHECK_FIELDS.map((k) => [k, Object.values(f.widths).reduce((s, w) => s + w.steps.reduce((a, st) => a + st.checks[k], 0), 0)] as const).sort((a, b) => b[1] - a[1])[0];
  md.push(`| ${f.id} | ${score(f)} | ${per[0]} ${per[1]} | ${Object.values(f.widths).map((w) => w.sheet).filter(Boolean).join(" ")} |`);
}
md.push(``, `Checks (every one a count, 0 is clean):`, ``, `| Check | Meaning |`, `| --- | --- |`, ...CHECK_FIELDS.map((k) => `| ${k} | ${FIELD_HELP[k]} |`), ``);
writeFileSync(join(RUN, "summary.md"), md.join("\n"));
console.log(md.slice(0, 22).join("\n"));
console.log(`report: ${join(RUN, "report.json")}\nsummary: ${join(RUN, "summary.md")}`);
// the Chrome profiles of this run: report any that is still on disk
const left = profiles.filter((d) => existsSync(d));
if (left.length) console.error(`match: ${left.length} Chrome profile(s) still on disk: ${left.join(" ")}`);
process.exit(0);
