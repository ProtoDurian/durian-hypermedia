#!/usr/bin/env bun
// Prove the CSP: serve the example site with a strict Content-Security-Policy and open every page in headless Chrome.
//   bun example/build.tsx && bun scripts/csp-check.ts [--strict-style] [--trusted-types [--full]] [--only <regex>] [--out results.json]
// --trusted-types: serve with require-trusted-types-for 'script' and open the tt-*.html pages (every fixture, rendered in
// the browser only by the strict entry); with --full, the ttfull-*.html pages (the full entry, mermaid in the page) instead.
// For each page it counts: CSP violations (securitypolicyviolation events), script errors, alert() calls, and
// dangerous nodes left in the document (script, iframe, object, embed, foreignObject, on* attributes, script URLs).
// It also opens the 3D view of the first animation (three.js under the CSP), steps every stepped part once, and
// waits for charts and mermaid to draw. Exit 1 when any page has a violation, an error or a dangerous node.
import { launch } from "./cdp";
import { join, resolve } from "node:path";
import { readdirSync } from "node:fs";

const PKG = resolve(import.meta.dir, "..");
const DIR = join(PKG, "example/dist");
const strictStyle = process.argv.includes("--strict-style");
const trusted = process.argv.includes("--trusted-types");
const full = process.argv.includes("--full");
const ttPrefix = full ? "ttfull-" : "tt-";
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : "";
const outFile = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "";
// a port nobody holds (the system picks it): a fixed or random one can land on another run's server and check its pages
const freePort = () => { const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") }); const p = s.port; s.stop(true); return p; };
const PORT = freePort();

const server = Bun.spawn(["bun", join(PKG, "example/serve.ts"), DIR, String(PORT), ...(strictStyle ? ["--strict-style"] : []), ...(trusted ? ["--trusted-types"] : [])], { stdout: "pipe", stderr: "inherit" });
await new Promise((r) => setTimeout(r, 800));
if (server.exitCode !== null) { console.error(`the page server did not start on port ${PORT}: the check is broken`); process.exit(2); }

const COLLECT = `(() => {
  const s = window.__dh = { csp: [], errors: [], alerts: 0 };
  document.addEventListener("securitypolicyviolation", (e) => s.csp.push(e.effectiveDirective + " " + (e.blockedURI || "") + " " + (e.sourceFile || "").split("/").pop() + ":" + e.lineNumber + " " + (e.sample || "").slice(0, 60)));
  window.addEventListener("error", (e) => s.errors.push(String(e.message).slice(0, 200)));
  window.addEventListener("unhandledrejection", (e) => s.errors.push("rejection " + String(e.reason).slice(0, 200)));
  const ce = console.error.bind(console); console.error = (...a) => { s.errors.push("console.error " + a.map(String).join(" ").slice(0, 200)); ce(...a); };
  window.alert = () => { s.alerts++; }; window.confirm = () => { s.alerts++; return false; }; window.prompt = () => { s.alerts++; return null; };
})();`;
const DANGER = `(() => {
  const d = document.querySelector(".dh-doc"); if (!d) return ["no .dh-doc"];
  const out = [];
  d.querySelectorAll("script, iframe, object, embed, foreignObject, frame, base, meta, link").forEach((e) => out.push(e.tagName));
  d.querySelectorAll("*").forEach((e) => { for (const a of e.attributes) { if (/^on/i.test(a.name)) out.push(e.tagName + "[" + a.name + "]"); if (/^(href|src|xlink:href|action|formaction)$/i.test(a.name) && /^\\s*(javascript|vbscript|data):/i.test(a.value) && !(e.tagName === "IMG" && /^data:image\\/(png|gif|jpeg|webp);/i.test(a.value))) out.push(e.tagName + "[" + a.name + "=" + a.value.slice(0, 20) + "]"); } });
  return out;
})()`;

const pages = readdirSync(DIR).filter((f) => f.endsWith(".html") && !f.startsWith("_") && f !== "index.html" && (trusted ? f.startsWith(ttPrefix) : !/^tt(full)?-/.test(f)) && (!only || new RegExp(only).test(f))).sort();
const p = await launch();
await p.send("Page.addScriptToEvaluateOnNewDocument", { source: COLLECT });
await p.viewport(1280, 900, false);
// the control page breaks the CSP on purpose: if the checker sees nothing there, it sees nothing anywhere
{
  await p.goto(`http://127.0.0.1:${PORT}/_control.html`);
  await p.sleep(500);
  const c = await p.eval<{ csp: string[] }>(`window.__dh`);
  const inline = await p.eval<number | undefined>(`window.__inline`);
  console.log(`control: ${c.csp.length} violation(s) seen, inline code ran: ${inline ? "yes" : "no"}`);
  if (c.csp.length < 2 || inline) { console.error("the control page did not report its violations: the check is broken"); process.exit(2); }
}
// under Trusted Types, a second control: a plain string into innerHTML must throw and be reported
if (trusted) {
  await p.goto(`http://127.0.0.1:${PORT}/_tt-control.html`);
  await p.sleep(500);
  const c = await p.eval<{ csp: string[] }>(`window.__dh`);
  const threw = await p.eval<boolean | undefined>(`window.__ttThrew`);
  console.log(`trusted types control: ${c.csp.length} violation(s) seen, the plain-string assignment threw: ${threw ? "yes" : "no"}`);
  if (!c.csp.some((x) => x.startsWith("require-trusted-types-for")) || !threw) { console.error("the Trusted Types control did not report: the check is broken"); process.exit(2); }
}
const results: { page: string; csp: string[]; errors: string[]; alerts: number; danger: string[]; drawn: Record<string, number> }[] = [];
for (const f of pages) {
  await p.goto(`http://127.0.0.1:${PORT}/${f}`);
  await p.sleep(900);
  // step every stepped part once and open the first animation in 3D
  await p.eval(`document.querySelectorAll(".dh-doc .btn-go").forEach((b) => { if (!b.disabled) b.click(); })`);
  const has3d = await p.eval<boolean>(`!!document.querySelector(".dh-doc .scn-mode") || !!document.querySelector(".dh-doc .scn3")`);
  if (has3d) { await p.eval(`(() => { const s = document.querySelector(".dh-doc .scn"); if (s && !s.querySelector(".scn3")) s.querySelector(".scn-mode")?.click(); })()`); for (let k = 0; k < 24; k++) { await p.sleep(250); if (await p.eval<boolean>(`!!document.querySelector(".dh-doc .scn3-canvas") && !document.querySelector(".dh-doc .scn3-loading")`)) break; } }
  const waitMs = (await p.eval<boolean>(`!!document.querySelector(".dh-doc [data-mermaid], .dh-doc canvas")`)) ? 1500 : 300;
  await p.sleep(waitMs);
  const s = await p.eval<{ csp: string[]; errors: string[]; alerts: number }>(`window.__dh`);
  const danger = await p.eval<string[]>(DANGER);
  // every node of every drawn diagram keeps its label (mermaid's labels must survive the cleaning)
  const blank = await p.eval<string[]>(`[...document.querySelectorAll(".dh-doc .diagram.is-drawn svg")].flatMap((s, i) => [...s.querySelectorAll("g.node")].filter((g) => !g.textContent.trim()).map((g) => "diagram " + i + ": blank label on " + (g.id || "a node")))`);
  if (!f.startsWith("hostile-")) danger.push(...blank);
  const drawn = await p.eval<Record<string, number>>(`({ mermaid: document.querySelectorAll(".dh-doc .diagram.is-drawn").length, mermaidFailed: document.querySelectorAll(".dh-doc .diagram.is-failed").length, charts: document.querySelectorAll(".dh-doc .chart canvas").length, webgl: [...document.querySelectorAll(".dh-doc canvas")].filter((c) => !c.closest(".chart")).length, svgStages: document.querySelectorAll(".dh-doc .scn svg").length })`);
  results.push({ page: f, csp: s?.csp ?? ["no collector"], errors: s?.errors ?? [], alerts: s?.alerts ?? 0, danger, drawn });
  const bad = (s?.csp.length ?? 1) + (s?.errors.length ?? 0) + (s?.alerts ?? 0) + danger.length;
  console.log(`${bad ? "FAIL" : "ok  "} ${f}  csp ${s?.csp.length ?? "?"}  errors ${s?.errors.length ?? "?"}  alerts ${s?.alerts ?? "?"}  danger ${danger.length}  ${JSON.stringify(drawn)}`);
  for (const x of [...(s?.csp ?? []), ...(s?.errors ?? []), ...danger].slice(0, 6)) console.log(`       ${x}`);
}
await p.close();
server.kill();
const total = { pages: results.length, csp: results.reduce((a, r) => a + r.csp.length, 0), errors: results.reduce((a, r) => a + r.errors.length, 0), alerts: results.reduce((a, r) => a + r.alerts, 0), danger: results.reduce((a, r) => a + r.danger.length, 0) };
console.log(`\n${strictStyle ? "strict style-src 'self'" : "style-src 'self' 'unsafe-inline'"}${trusted ? `, require-trusted-types-for 'script' (${full ? "full entry" : "strict entry"})` : ""}: ${JSON.stringify(total)}`);
if (outFile) await Bun.write(outFile, JSON.stringify({ strictStyle, total, results }, null, 1));
process.exit(total.csp + total.errors + total.alerts + total.danger ? 1 : 0);
