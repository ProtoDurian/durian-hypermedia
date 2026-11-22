#!/usr/bin/env bun
// One part's browser check (format version 11): builds a page from only that part's sample, serves it under the strict
// CSP with Trusted Types, and opens it in one headless Chrome at 1280 and 390, light and dark.
//   bun scripts/part-check.ts <name> [--out <dir>]     (default out: dist/part-check/<name>)
// Files in src/parts/<name>/media/ are served as media/ (a sample refers to them as media/<file>).
// For each of the 4 views: the part is drawn (every [data-dh-part=<name>] has a size), no sideways scroll of the page,
// no text under 11 px inside the part, every Next button pressed once with no error; a screenshot of each view. Then the
// same sample rendered in the browser only (createRoot) under the policy: 0 Trusted Types violations, 0 script errors.
// A control page proves the policy is on. Exit 1 on any failure. The browser and the server are closed in any case.
import { launch, type Page } from "./cdp";
import React from "react";
import { renderToString } from "react-dom/server";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "../src/index";
import { DhDocument } from "../src/react/index";
import { documentJson } from "../src/react/hydrate";
import { buildCss } from "./build-css";

const PKG = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--out");
if (!name || !existsSync(join(PKG, "src/parts", name, "sample.md"))) { console.error("usage: bun scripts/part-check.ts <part name> [--out <dir>] (a folder under src/parts/ with a sample.md)"); process.exit(2); }
// a part of a sentence (a folder with an inline.ts and no part.ts) is found by its inline frame, not by a stage box
const INLINE_ONLY = existsSync(join(PKG, "src/parts", name, "inline.ts")) && !existsSync(join(PKG, "src/parts", name, "part.ts"));
const SEL = INLINE_ONLY ? `[data-dh-inline="${name}"]` : `.dh-part-stage[data-dh-part="${name}"]`;
const OUT = resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : join(PKG, "dist/part-check", name));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- the page: only this part's sample ----
mkdirSync(join(OUT, "assets"), { recursive: true });
mkdirSync(join(OUT, "shots"), { recursive: true });
// a part's own sample files (images, audio ...) in src/parts/<name>/media/ are served next to the page as media/
if (existsSync(join(PKG, "src/parts", name, "media"))) cpSync(join(PKG, "src/parts", name, "media"), join(OUT, "media"), { recursive: true });
writeFileSync(join(OUT, "assets/styles.css"), buildCss() + "\n" + readFileSync(join(PKG, "example/site.css"), "utf8"));
const built = await Bun.build({ entrypoints: [join(PKG, "example/client.tsx"), join(PKG, "example/client-tt.tsx"), join(PKG, "example/tt-control.ts")], outdir: join(OUT, "assets"), splitting: true, format: "esm", minify: true, target: "browser", naming: { entry: "[name].[ext]", chunk: "c-[hash].[ext]" }, define: { "process.env.NODE_ENV": '"production"' } });
if (!built.success) { console.error(built.logs); process.exit(1); }
const text = `---\ntitle: ${name}\n---\n# ${name}\n\n${readFileSync(join(PKG, "src/parts", name, "sample.md"), "utf8")}`;
const doc = parse(text, { path: `${name}.sample.dh.md` });
const shell = (body: string, json: string, script: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(name)} · part check</title><link rel="stylesheet" href="assets/styles.css"><script type="module" src="assets/${script}.js"></script></head><body><main class="ex-main">${body}</main><script type="application/json" id="dh-doc">${json}</script></body></html>`;
writeFileSync(join(OUT, "index.html"), shell(`<div id="dh-root">${renderToString(React.createElement(DhDocument, { doc }))}</div>`, documentJson(doc), "client"));
writeFileSync(join(OUT, "tt.html"), shell(`<div id="dh-root"></div>`, documentJson(doc), "client-tt"));
writeFileSync(join(OUT, "_tt-control.html"), `<!doctype html><html><head><meta charset="utf-8"><title>tt control</title><script type="module" src="assets/tt-control.js"></script></head><body><div class="dh-doc" id="box"></div></body></html>`);

const COLLECT = `(() => {
  const s = window.__dh = { csp: [], errors: [] };
  document.addEventListener("securitypolicyviolation", (e) => s.csp.push(e.effectiveDirective + " " + (e.sourceFile || "").split("/").pop() + ":" + e.lineNumber + " " + (e.sample || "").slice(0, 60)));
  window.addEventListener("error", (e) => s.errors.push(String(e.message).slice(0, 200)));
  window.addEventListener("unhandledrejection", (e) => s.errors.push("rejection " + String(e.reason).slice(0, 200)));
  const ce = console.error.bind(console); console.error = (...a) => { s.errors.push("console.error " + a.map(String).join(" ").slice(0, 200)); ce(...a); };
})();`;
// what the page shows, read from the DOM (never from the part's own data)
const MEASURE = (part: string) => `(() => {
  const parts = [...document.querySelectorAll('${SEL}')];
  const sizes = parts.map((p) => { const r = p.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  let small = 0, smallest = 99;
  for (const p of parts) for (const t of p.querySelectorAll("text, p, span, li, button, summary, div")) {
    if (!t.childNodes.length || ![...t.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
    const r = t.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const fs = parseFloat(getComputedStyle(t).fontSize) || 0;
    const svg = t.closest("svg"); const scale = svg && svg.getScreenCTM ? Math.abs(svg.getScreenCTM().a) : 1;
    const px = fs * scale; if (px < smallest) smallest = px; if (px < 11 - 0.01) small++;
  }
  const se = document.scrollingElement;
  return { count: parts.length, sizes, sideways: se.scrollWidth - se.clientWidth, small, smallest: Math.round(smallest * 10) / 10 };
})()`;

// a port nobody holds (the system picks it): a fixed or random one can land on another run's server and check its pages
const freePort = () => { const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") }); const p = s.port; s.stop(true); return p; };
const PORT = freePort();
const server = Bun.spawn(["bun", join(PKG, "example/serve.ts"), OUT, String(PORT), "--trusted-types"], { stdout: "ignore", stderr: "inherit" });
let p: Page | null = null;
const fails: string[] = [];
const views: Record<string, unknown>[] = [];
try {
  await new Promise((r) => setTimeout(r, 700));
  if (server.exitCode !== null) throw new Error(`the page server did not start on port ${PORT}: the check is broken`);
  p = await launch();
  await p.send("Page.addScriptToEvaluateOnNewDocument", { source: COLLECT });
  // the control: under the policy a plain string into innerHTML throws and is reported
  await p.viewport(1280, 900, false);
  await p.goto(`http://127.0.0.1:${PORT}/_tt-control.html`);
  await p.sleep(400);
  const c = await p.eval<{ csp: string[] }>(`window.__dh`);
  if (!c.csp.some((x) => x.startsWith("require-trusted-types-for")) || !(await p.eval<boolean>(`!!window.__ttThrew`))) { fails.push("the Trusted Types control did not report: the check is broken"); throw new Error("control"); }
  for (const [w, h, mobile] of [[1280, 900, false], [390, 844, true]] as const) for (const theme of ["light", "dark"] as const) {
    const tag = `${w}-${theme}`;
    await p.viewport(w, h, mobile);
    await p.goto(`http://127.0.0.1:${PORT}/index.html`);
    await p.eval(`document.documentElement.dataset.theme = "${theme}"`);
    await p.sleep(600);
    const m = await p.eval<{ count: number; sizes: number[][]; sideways: number; small: number; smallest: number }>(MEASURE(name));
    // every step forward once, by a real click on each Next button that is enabled
    const nexts = await p.eval<number>(`(() => { let n = 0; document.querySelectorAll('[data-dh-part="${name}"] .ctl button').forEach((b) => { if (/Next|→/.test(b.textContent) && !b.disabled) { b.click(); n++; } }); return n; })()`);
    await p.sleep(400);
    const s = await p.eval<{ csp: string[]; errors: string[] }>(`window.__dh`);
    const docH = await p.eval<number>(`Math.ceil(document.documentElement.scrollHeight)`);
    await p.shot(join(OUT, "shots", `${name}-${tag}.png`), { x: 0, y: 0, width: w, height: Math.min(docH, 6000) });
    if (INLINE_ONLY || await p.eval<boolean>(`!!document.querySelector('[data-dh-inline="${name}"]')`)) {
      // a part of a sentence: put a real mouse over the first one, as a reader does, and take the page again (a card opens). The
      // browser page has no focus in this headless run, so a card that opens on :focus is seen only by a pointer here.
      const at = await p.eval<number[] | null>(`(() => { const e = document.querySelector('[data-dh-inline="${name}"] button, [data-dh-inline="${name}"] [tabindex]'); if (!e) return null; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (at) await p.mouse("mouseMoved", at[0], at[1]);
      await p.sleep(500);
      const o = await p.eval<{ csp: string[]; errors: string[] }>(`window.__dh`);
      await p.shot(join(OUT, "shots", `${name}-${tag}-open.png`), { x: 0, y: 0, width: w, height: Math.min(await p.eval<number>(`Math.ceil(document.documentElement.scrollHeight)`), 6000) });
      if (o.csp.length > s.csp.length) fails.push(`${tag}: opening a ${name} gave policy violations`);
      if (o.errors.length > s.errors.length) fails.push(`${tag}: opening a ${name} gave script errors: ${o.errors.slice(s.errors.length, s.errors.length + 3).join(" | ")}`);
    }
    views.push({ view: tag, ...m, nexts, csp: s.csp.length, errors: s.errors });
    if (!m.count || m.sizes.some(([a, b]) => !a || !b)) fails.push(`${tag}: the part is not drawn (${m.count} found, sizes ${JSON.stringify(m.sizes)})`);
    if (m.sideways > 0) fails.push(`${tag}: the page scrolls sideways by ${m.sideways} px`);
    if (m.small) fails.push(`${tag}: ${m.small} text(s) under 11 px (smallest ${m.smallest} px)`);
    if (s.csp.length) fails.push(`${tag}: ${s.csp.length} policy violation(s): ${s.csp.slice(0, 3).join(" | ")}`);
    if (s.errors.length) fails.push(`${tag}: script errors: ${s.errors.slice(0, 3).join(" | ")}`);
  }
  // rendered in the browser only, every element made on the page under the policy
  await p.viewport(1280, 900, false);
  await p.goto(`http://127.0.0.1:${PORT}/tt.html`);
  await p.sleep(800);
  await p.eval(`document.querySelectorAll('[data-dh-part="${name}"] .ctl button').forEach((b) => { if (/Next|→/.test(b.textContent) && !b.disabled) b.click(); })`);
  await p.sleep(400);
  const tt = await p.eval<{ csp: string[]; errors: string[] }>(`window.__dh`);
  const ttCount = await p.eval<number>(`document.querySelectorAll('${SEL}').length`);
  views.push({ view: "trusted-types (browser only)", count: ttCount, csp: tt.csp.length, errors: tt.errors });
  if (!ttCount) fails.push("trusted types: the part is not drawn");
  if (tt.csp.length) fails.push(`trusted types: ${tt.csp.length} violation(s): ${tt.csp.slice(0, 3).join(" | ")}`);
  if (tt.errors.length) fails.push(`trusted types: script errors: ${tt.errors.slice(0, 3).join(" | ")}`);
} catch (e) {
  if ((e as Error).message !== "control") fails.push(`the check stopped: ${(e as Error).message}`);
} finally {
  await p?.close().catch(() => {});
  server.kill();
  await server.exited;
}
writeFileSync(join(OUT, "result.json"), JSON.stringify({ part: name, problems: doc.problems, views, fails }, null, 2));
console.log(JSON.stringify({ part: name, views }, null, 1));
console.log(fails.length ? `part-check ${name}: ${fails.length} failure(s)\n- ${fails.join("\n- ")}` : `part-check ${name}: ok (4 views and the Trusted Types run; shots in ${join(OUT, "shots")})`);
process.exit(fails.length ? 1 : 0);
