#!/usr/bin/env bun
// Prove the CSP: serve the example site with a strict Content-Security-Policy and open every page in headless Chrome.
//   bun example/build.tsx && bun scripts/csp-check.ts [--strict-style] [--trusted-types [--full]] [--only <regex>] [--out results.json]
// --trusted-types: serve with require-trusted-types-for 'script' and open the tt-*.html pages (every fixture, rendered in
// the browser only by the strict entry); with --full, the ttfull-*.html pages (the full entry) instead.
// For each page it counts: CSP violations (securitypolicyviolation events), script errors, alert() calls, and
// dangerous nodes left in the document (script, iframe, object, embed, foreignObject, on* attributes, script URLs).
// It also opens the 3D view of the first animation (three.js under the CSP), steps every stepped part once, steps
// every composed stage through all its steps (each step button in order, then Back, then Play and Pause, checking
// the step count each time), and waits for charts to draw. Exit 1 when any page has a violation, an error or a dangerous node.
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

const server = Bun.spawn(["bun", join(PKG, "example/serve.ts"), DIR, String(PORT), "--tile-probe", ...(strictStyle ? ["--strict-style"] : []), ...(trusted ? ["--trusted-types"] : [])], { stdout: "pipe", stderr: "inherit" });
await new Promise((r) => setTimeout(r, 800));
if (server.exitCode !== null) { console.error(`the page server did not start on port ${PORT}: the check is broken`); process.exit(2); }

const COLLECT = `(() => {
  const s = window.__dh = { csp: [], errors: [], alerts: 0, tileMax: 0 };
  new MutationObserver(() => { s.tileMax = Math.max(s.tileMax, document.querySelectorAll('.map-base img').length); }).observe(document, {childList:true,subtree:true});
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

// every composed stage on the page: each step button in order (the count must read "k / n"), then Back (k - 1), then
// Play and Pause; a still stage (no steps, or over its budget) has no controls and is counted apart
const STEP_STAGES = `(async () => {
  const tick = () => new Promise((r) => setTimeout(() => requestAnimationFrame(() => r(0)), 60));
  const out = { stages: 0, still: 0, stepped: 0, steps: 0, bad: [] };
  const all = [...document.querySelectorAll(".dh-doc .stg, .dh-doc .stg-over")];
  for (const [i, s] of all.entries()) {
    out.stages++;
    const btns = [...s.querySelectorAll(".stg-stepbtn")], count = () => s.querySelector(".stg-count")?.textContent.replace(/\\s+/g, "");
    if (!btns.length) { out.still++; continue; }
    const n = btns.length; let ok = true;
    for (const [k, b] of btns.entries()) { b.click(); await tick(); out.steps++; if (count() !== (k + 1) + "/" + n) { ok = false; out.bad.push("stage " + i + ": step " + (k + 1) + " shows " + count()); break; } }
    const back = s.querySelector(".stg-ctl .stg-btn"); if (ok && back) { back.click(); await tick(); if (count() !== (n - 1) + "/" + n) { ok = false; out.bad.push("stage " + i + ": Back shows " + count()); } }
    const play = s.querySelector(".stg-play"); if (ok && play) { play.click(); await tick(); play.click(); await tick(); if (play.getAttribute("aria-pressed") !== "false") { ok = false; out.bad.push("stage " + i + ": Pause did not stop"); } }
    if (ok) out.stepped++;
  }
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
async function tileCases(file: string) {
  const wait = async (expression: string) => {
    for (let k=0; k<80; k++) { if (await p.eval<boolean>(expression)) return; await p.sleep(100); }
    throw new Error("tile browser check timed out");
  };
  for (const scenario of ["slow", "static", "one", "all", "policy", "cap", "hang"]) {
    const danger: string[] = [];
    const stats = async () => await (await fetch(`http://127.0.0.1:${PORT}/__tile-stats?case=${scenario}`)).json() as {total:number;open:number;peak:number;per:Record<string,number>};
    try {
      await p.goto(`http://127.0.0.1:${PORT}/${file}?tiles=${scenario}`);
      await wait(`!!document.querySelector('.map')`);
      if (scenario === "static") {
        await p.sleep(400);
        if ((await stats()).total || !await p.eval<boolean>(`!!document.querySelector('.map[data-based="still"][data-dh-static]')`)) danger.push("static map made tile requests or lost its still picture");
      } else {
        await wait(`!!document.querySelector('.map[data-based="tiles"]') || !!document.querySelector('.map-note')`);
        if (scenario === "slow") {
          await p.sleep(250);
          // Brief rests also exercise slots held by detached, still-loading images.
          for (let k=0;k<4;k++) { await p.eval(`document.querySelector('[aria-label="Zoom in"]').click()`); await p.sleep(150); }
          const at = await p.eval<{x:number;y:number}>(`(() => { const r=document.querySelector('.map-stage').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
          for (let k=0; k<40; k++) { await p.wheel(at.x,at.y,0,k<20?-120:120,2); await p.sleep(16); }
          await p.sleep(1800);
          if (!(await stats()).total || (await stats()).peak > 8) danger.push("slow tile server exceeded 8 open requests or received no requests");
        } else if (scenario === "one") {
          await wait(`!!document.querySelector('.map-base img[style*="visibility: hidden"]')`);
          const mixed = await p.eval<boolean>(`document.querySelector('.map').dataset.based === 'tiles' && [...document.querySelectorAll('.map-base img')].some(i=>i.naturalWidth>0)`);
          if (!mixed || (await stats()).per["3/4/4"] !== 2) danger.push("one 404 tile did not retry once and preserve good tiles");
          await p.eval(`document.querySelector('[aria-label="Zoom in"]').click()`);
          await p.sleep(350);
          if (!await p.eval<boolean>(`document.querySelector('.map').dataset.based === 'tiles'`)) danger.push("one 404 stopped zooming");
        } else if (scenario === "all") {
          await wait(`!!document.querySelector('.map-note')`);
          if (!await p.eval<boolean>(`document.querySelector('.map').dataset.based==='still' && document.querySelector('.map-note').textContent.includes('Tile images could not load')`)
            || Object.values((await stats()).per).some(n=>n>2)) danger.push("all failed tiles did not fall back with bounded retries");
        } else if (scenario === "policy") {
          await p.sleep(250);
          for (let k=0;k<3;k++) { await p.eval(`document.getElementById('tile-policy').click()`); await p.sleep(30); }
          await p.eval(`document.querySelector('[aria-label="Zoom in"]').click()`);
          await p.sleep(350);
          if (!await p.eval<boolean>(`document.documentElement.dataset.tileOpens==='1' && [...document.querySelectorAll('.map-base img')].some(i=>i.src.includes('policy=3'))`)) danger.push("inline policy rebuilt the base layer or the next draw used a stale policy");
        } else if (scenario === "hang") {
          for (let k=0;k<40 && !(await stats()).total;k++) await p.sleep(25);
          const at = await p.eval<{x:number;y:number}>(`(() => {const r=document.querySelector('.map-stage').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
          await p.drag(at.x,at.y,at.x+400,at.y);
          await wait(`!!document.querySelector('.map-note')`);
          const before = (await stats()).total;
          await p.eval(`document.querySelector('[aria-label="Zoom in"]').click()`);
          await p.sleep(400);
          if (!(await stats()).open || (await stats()).total !== before || !await p.eval<boolean>(`document.querySelector('.map').dataset.based==='still' && document.querySelector('.map-note').textContent.toLowerCase().includes('tile server did not answer')`)) danger.push("hung server did not fall back while retaining its unfinished request slots");
        } else {
          await p.eval(`Object.assign(document.querySelector('.map-stage').style,{width:'2048px',height:'2048px'})`);
          await wait(`document.querySelectorAll('.map-base img').length===64`);
          await p.eval(`Object.assign(document.querySelector('.map-stage').style,{width:'8192px',height:'8192px'})`);
          await wait(`!!document.querySelector('.map-note')`);
          if (!await p.eval<boolean>(`document.querySelectorAll('.map-base img').length===0 && document.querySelector('.map-note').textContent.includes('64 tiles')`)) danger.push("oversized tile view did not respect the DOM cap");
        }
      }
    } catch (e) { danger.push(String(e)); }
    finally {
      if (scenario === "hang") {
        try {
          const response = await fetch(`http://127.0.0.1:${PORT}/__tile-release`);
          if (!response.ok) throw new Error("could not release hung tile responses");
          await response.json();
          for (let k=0;k<80 && (await stats()).open;k++) await p.sleep(25);
          if ((await stats()).open) danger.push("hung tile responses remained open after the case");
        } catch (e) { danger.push(String(e)); }
      }
    }
    const s = await p.eval<{csp:string[];errors:string[];alerts:number;tileMax:number}>(`window.__dh`);
    const counts = await stats();
    if (s.tileMax > 64) danger.push("more than 64 tile images were attached");
    if (counts.peak > 8) danger.push("more than 8 tile requests were open at the server");
    danger.push(...await p.eval<string[]>(DANGER));
    const drawn = {tileRequests:counts.total,tilePeak:counts.peak,tileDomMax:s.tileMax,...(scenario === "hang" ? {tileOpenAfterCleanup:counts.open} : {})};
    const bad = s.csp.length+s.errors.length+s.alerts+danger.length;
    results.push({page:`${file}?tiles=${scenario}`,csp:s.csp,errors:s.errors,alerts:s.alerts,danger,drawn});
    console.log(`${bad?"FAIL":"ok  "} ${file}?tiles=${scenario} csp ${s.csp.length} errors ${s.errors.length} alerts ${s.alerts} danger ${danger.length} ${JSON.stringify(drawn)}`);
    for (const reason of danger) console.log(`       ${reason}`);
  }
}
for (const f of pages) {
  await p.goto(`http://127.0.0.1:${PORT}/${f}`);
  await p.sleep(900);
  // step every stepped part once and open the first animation in 3D
  await p.eval(`document.querySelectorAll(".dh-doc .btn-go").forEach((b) => { if (!b.disabled) b.click(); })`);
  const stg = await p.eval<{ stages: number; still: number; stepped: number; steps: number; bad: string[] }>(STEP_STAGES);
  const has3d = await p.eval<boolean>(`!!document.querySelector(".dh-doc .scn-mode") || !!document.querySelector(".dh-doc .scn3")`);
  if (has3d) { await p.eval(`(() => { const s = document.querySelector(".dh-doc .scn"); if (s && !s.querySelector(".scn3")) s.querySelector(".scn-mode")?.click(); })()`); for (let k = 0; k < 24; k++) { await p.sleep(250); if (await p.eval<boolean>(`!!document.querySelector(".dh-doc .scn3-canvas") && !document.querySelector(".dh-doc .scn3-loading")`)) break; } }
  const waitMs = (await p.eval<boolean>(`!!document.querySelector(".dh-doc canvas")`)) ? 1500 : 300;
  await p.sleep(waitMs);
  const danger = await p.eval<string[]>(DANGER);
  if (/^(tt-)?map-tiles\.html$/.test(f)) {
    const tiles = () => p.eval<number>(`document.querySelectorAll('.map[data-based="tiles"] .map-base img').length`);
    for (let k = 0; k < 20 && !(await tiles()); k++) await p.sleep(100);
    const before = await p.eval<string>(`[...document.querySelectorAll('.map-base img')].map(i => i.src).join('|')`);
    const positions = () => p.eval<string>(`[...document.querySelectorAll('.map-base img')].map(i => i.style.left + ',' + i.style.top).join('|')`);
    const positioned = await positions();
    const stage = await p.eval<{x: number; y: number}>(`(() => { const r = document.querySelector('.map-stage').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await p.drag(stage.x, stage.y, stage.x + 100, stage.y + 50);
    await p.sleep(150);
    if (positioned === await positions()) danger.push("local tile provider did not follow the pan gesture");
    await p.eval(`document.querySelector('.map-btn[aria-label="Zoom in"]').click()`);
    for (let k=0;k<30;k++) {
      await p.sleep(100);
      if (await p.eval<boolean>(`[...document.querySelectorAll('.map-base img')].every(i=>i.complete && i.naturalWidth>0)`)) break;
    }
    const after = await p.eval<string>(`[...document.querySelectorAll('.map-base img')].map(i => i.src).join('|')`);
    const ok = await p.eval<boolean>(`(() => { const imgs = [...document.querySelectorAll('.map-base img')]; return imgs.length > 0 && imgs.length <= 64 && imgs.every(i => i.complete && i.naturalWidth > 0 && new URL(i.src).origin === location.origin) && document.querySelector('[data-dh-slot="attribution"]').textContent === 'Example tiles (local test)'; })()`);
    if (!ok || !before || before === after) danger.push("local tile provider did not load, pan, zoom and credit its images");
  }
  const s = await p.eval<{ csp: string[]; errors: string[]; alerts: number }>(`window.__dh`);
  // a stage that did not follow its steps fails the page; a stage page whose stages were not stepped means the check is broken
  danger.push(...stg.bad);
  if (/^(tt(full)?-)?stage-/.test(f) && stg.stages - stg.still > 0 && stg.stepped === 0) danger.push("no stage was stepped: the check is broken");
  const drawn = await p.eval<Record<string, number>>(`({ charts: document.querySelectorAll(".dh-doc .chart canvas").length, webgl: [...document.querySelectorAll(".dh-doc canvas")].filter((c) => !c.closest(".chart")).length, svgStages: document.querySelectorAll(".dh-doc .scn svg").length })`);
  Object.assign(drawn, { stages: stg.stages, stagesStepped: stg.stepped, stageSteps: stg.steps, stagesStill: stg.still });
  results.push({ page: f, csp: s?.csp ?? ["no collector"], errors: s?.errors ?? [], alerts: s?.alerts ?? 0, danger, drawn });
  const bad = (s?.csp.length ?? 1) + (s?.errors.length ?? 0) + (s?.alerts ?? 0) + danger.length;
  console.log(`${bad ? "FAIL" : "ok  "} ${f}  csp ${s?.csp.length ?? "?"}  errors ${s?.errors.length ?? "?"}  alerts ${s?.alerts ?? "?"}  danger ${danger.length}  ${JSON.stringify(drawn)}`);
  for (const x of [...(s?.csp ?? []), ...(s?.errors ?? []), ...danger].slice(0, 6)) console.log(`       ${x}`);
  if (/^(tt-)?map-tiles\.html$/.test(f)) await tileCases(f);
}
await p.close();
server.kill();
const total = { pages: results.length, csp: results.reduce((a, r) => a + r.csp.length, 0), errors: results.reduce((a, r) => a + r.errors.length, 0), alerts: results.reduce((a, r) => a + r.alerts, 0), danger: results.reduce((a, r) => a + r.danger.length, 0) };
console.log(`\n${strictStyle ? "strict style-src 'self'" : "style-src 'self' 'unsafe-inline'"}${trusted ? `, require-trusted-types-for 'script' (${full ? "full entry" : "strict entry"})` : ""}: ${JSON.stringify(total)}`);
if (outFile) await Bun.write(outFile, JSON.stringify({ strictStyle, total, results }, null, 1));
process.exit(total.csp + total.errors + total.alerts + total.danger ? 1 : 0);
