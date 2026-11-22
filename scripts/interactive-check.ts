#!/usr/bin/env bun
// Prove the interactive part's frame in headless Chrome (format version 11): a resolved [[interactive:...]] runs with
// interactive="on" and InteractivePart, and its probes read what the sandbox allows. A probe's only way out is its height
// (the one message the page accepts), so each probe adds a bit to the height for every door it finds shut:
//   1 storage refused, 2 cookies refused, 4 fetch refused, 8 the page out of reach (height 400 + 10 x bits)
// and the server counts every request a frame makes (it must be 0). Three page policies:
//   open    script-src 'self' 'unsafe-inline', Trusted Types required, policy dh-interactive listed: the part runs
//   strict  script-src 'self' (no inline): the frame keeps the page's policy, so it never answers and stops after 5 s
//   denied  Trusted Types required, dh-interactive not listed: the part keeps its still
//   bun scripts/interactive-check.ts
import React from "react";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "../src/index";
import { documentJson } from "../src/react/hydrate";
import { buildCss } from "./build-css";
import { launch } from "./cdp";

const PKG = resolve(import.meta.dir, "..");
// inside the package, so the page's script finds React; removed when the check ends
const OUT = mkdtempSync(join(PKG, "example", ".ix-check-"));
const probe = [
  "@html",
  `<div id="box" style="height:10px"></div>`,
  "@script",
  `var f = 0;`,
  `try { window["local" + "Storage"].setItem("k", "v"); } catch (e) { f |= 1; }`,
  `try { document["coo" + "kie"] = "a=1"; if (!document["coo" + "kie"]) f |= 2; } catch (e) { f |= 2; }`,
  `try { var w = window["par" + "ent"]; void w.document.body; } catch (e) { f |= 8; }`,
  `var done = function () { document.getElementById("box").style.height = (400 + f * 10) + "px"; };`,
  `try { window["fe" + "tch"]("/beacon").then(function () { done(); }, function () { f |= 4; done(); }); } catch (e) { f |= 4; done(); }`,
  "@fallback",
  "The probe's still.",
].join("\n");
const leave = ["@html", `<p>leaves</p>`, "@script", `setTimeout(function () { window["loc" + "ation"].href = "about:blank"; }, 300);`].join("\n");
const parts: Record<string, string> = { "interactive:probe": probe, "interactive:leave": leave };
const doc = parse(`[[interactive:probe "Probe"]]\n\n[[interactive:leave "Leaves"]]\n`, { resolveReference: ({ type, name }) => ({ state: "ready", part: parts[`${type}:${name}`] }) });
if (doc.problems.length) { console.error(doc.problems); process.exit(2); }

writeFileSync(join(OUT, "client.tsx"), `import React from "react"; import { createRoot } from "react-dom/client";
import { DhDocument } from ${JSON.stringify(join(PKG, "src/react/strict.tsx"))};
import { InteractivePart } from ${JSON.stringify(join(PKG, "src/react/interactive.tsx"))};
const doc = JSON.parse(document.getElementById("dh-doc").textContent);
createRoot(document.getElementById("dh-root")).render(<DhDocument doc={doc} interactive="on" components={{ interactive: InteractivePart }} />);`);
const b = await Bun.build({ entrypoints: [join(OUT, "client.tsx")], outdir: OUT, target: "browser", minify: true, define: { "process.env.NODE_ENV": '"production"' } });
if (!b.success) { console.error(b.logs); process.exit(2); }
writeFileSync(join(OUT, "styles.css"), buildCss());
const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><script type="module" src="/client.js"></script></head><body><div id="dh-root"></div><script type="application/json" id="dh-doc">${documentJson(doc)}</script></body></html>`;
const CSP: Record<string, string> = {
  open: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; require-trusted-types-for 'script'; trusted-types dh-interactive",
  strict: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
  denied: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; require-trusted-types-for 'script'; trusted-types other-policy",
};
let beacons = 0;
const server = Bun.serve({
  port: 0, hostname: "127.0.0.1",
  fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/beacon") { beacons++; return new Response("seen"); }
    if (u.pathname === "/client.js") return new Response(Bun.file(join(OUT, "client.js")), { headers: { "Content-Type": "text/javascript" } });
    if (u.pathname === "/styles.css") return new Response(Bun.file(join(OUT, "styles.css")), { headers: { "Content-Type": "text/css" } });
    const k = u.pathname.slice(1);
    return CSP[k] ? new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": CSP[k] } }) : new Response("no", { status: 404 });
  },
});
const READ = `(() => [...document.querySelectorAll(".dh-ix")].map((x) => ({ state: x.dataset.ixState, frame: !!x.querySelector("iframe"), sandbox: x.querySelector("iframe")?.getAttribute("sandbox") ?? null, height: x.querySelector("iframe")?.style.height ?? null, chip: x.querySelector(".dh-ix-chip")?.textContent ?? null })))()`;
const p = await launch();
const results: Record<string, any> = {};
let bad = 0;
const want = (name: string, ok: boolean, got: unknown) => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: ${JSON.stringify(got)}`}`); if (!ok) bad++; };
try {
  await p.goto(`http://127.0.0.1:${server.port}/open`);
  await p.sleep(2500);
  const open = (results.open = await p.eval<any[]>(READ));
  const probeH = parseInt(open[0]?.height ?? "0", 10);
  want("open: the probe runs (it reported its height)", open[0]?.state === "running" && open[0]?.frame, open[0]);
  want("open: sandbox is allow-scripts, nothing else", open[0]?.sandbox === "allow-scripts", open[0]?.sandbox);
  // 400 + 10 x bits, plus the frame body's 8 px padding above and below (a frame's reported height is never under its
  // current height, 280 px, so the bits ride above it)
  const f = (probeH - 416) / 10;
  want("open: storage, cookies, fetch and the page are all refused (bits 1+2+4+8)", f === 15, { height: probeH, bits: f });
  want("open: the frame that loads a second page is stopped, its still shown", open[1]?.state === "stopped" && !open[1]?.frame && /tried to leave/.test(open[1]?.chip ?? ""), open[1]);
  await p.goto(`http://127.0.0.1:${server.port}/strict`);
  await p.sleep(1000);
  const early = await p.eval<any[]>(READ);
  await p.sleep(5500);
  const strict = (results.strict = await p.eval<any[]>(READ));
  want("strict: starting at 1 s (no answer yet)", early[0]?.state === "starting", early[0]);
  want("strict: stopped after 5 s with no answer, still shown", strict[0]?.state === "stopped" && !strict[0]?.frame && /did not answer/.test(strict[0]?.chip ?? ""), strict[0]);
  await p.goto(`http://127.0.0.1:${server.port}/denied`);
  await p.sleep(1000);
  const denied = (results.denied = await p.eval<any[]>(READ));
  want("denied: no frame, the still with the reason", denied[0]?.state === "stopped" && !denied[0]?.frame && /does not allow it/.test(denied[0]?.chip ?? ""), denied[0]);
  want("no frame reached the server (beacons)", beacons === 0, beacons);
} finally {
  await p.close();
  server.stop(true);
  rmSync(OUT, { recursive: true, force: true });
}
console.log(JSON.stringify({ results, beacons }));
process.exit(bad ? 1 : 0);
