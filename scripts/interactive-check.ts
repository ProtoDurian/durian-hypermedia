#!/usr/bin/env bun
// Prove the interactive part's frame in headless Chrome (format version 11): a resolved [[interactive:...]] runs with
// interactive="on" and InteractivePart, and its probes read what the sandbox allows. A probe's only way out is its height
// (the one message the page accepts), so each probe adds a bit to the height for every door it finds shut:
//   1 storage refused, 2 cookies refused, 4 fetch refused, 8 the page out of reach (height 400 + 10 x bits)
// and the server counts every request a frame makes (it must be 0). Three page policies:
//   open    script-src 'self' 'unsafe-inline', Trusted Types required, policy dh-interactive listed: the part runs
//   strict  script-src 'self' (no inline): the frame keeps the page's policy, so it never answers and stops after 5 s
//   denied  Trusted Types required, dh-interactive not listed: the part keeps its still
//   guarded open plus frame-src 'none': a frame that hides the word location and navigates is refused by the page's
//           policy before any request; under open the navigation's one request is counted (the frame is then stopped)
//   bun scripts/interactive-check.ts
import React from "react";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "../src/index";
import { documentJson } from "../src/react/hydrate";
import { buildCss } from "./build-css";
import { launch } from "./cdp";
import { interactiveFrame } from "../src/core/interactive";

const framed = process.argv.includes("--frame-src");

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
const leave = ["@html", `<p>leaves</p>`, "@script", `setTimeout(function () { window["loc" + "ation"].href = "/leave"; }, 300);`].join("\n");
const frameProbe = probe.replace("400 + f * 10", "400 + f").replace("@fallback", [
  `window.addEventListener("securitypolicyviolation", function (e) { if (e.blockedURI.endsWith("/beacon-send")) { f |= 64; done(); } });`,
  `try { var x = new window["XML" + "HttpRequest"](); x.open("GET", "/beacon"); x.onerror = function () { f |= 16; done(); }; x.send(); } catch (e) { f |= 16; }`,
  `try { var s = new window["Web" + "Socket"]("ws:" + "/" + "/" + new URL(document.URL).host + "/beacon-ws"); s.onerror = function () { f |= 32; done(); }; } catch (e) { f |= 32; }`,
  `try { if (!navigator["send" + "Beacon"]("/beacon-send", "x")) f |= 64; } catch (e) { f |= 64; }`,
  `try { window["indexed" + "DB"].open("x"); } catch (e) { f |= 128; }`,
  `setTimeout(function () { var w = window["par" + "ent"]; w.postMessage({dhHeight:1200, other:true}, "*"); w.postMessage({dhHeight:NaN}, "*"); w.postMessage({dhReady:true}, "*"); }, 500);`,
  "@fallback",
].join("\n"));
const parts: Record<string, string> = { "interactive:probe": framed ? frameProbe : probe, "interactive:leave": leave };
parts["interactive:theme"] = ["@html", '<div id="theme-box"></div>', "@script",
  `function themeHeight(){document.getElementById("theme-box").style.height=((document.documentElement.style.colorScheme==="dark"?300:200)+(document.documentElement.style.getPropertyValue("--acc")==="rgb(1, 2, 3)"?20:0))+"px"}`,
  `new MutationObserver(themeHeight).observe(document.documentElement,{attributes:true,attributeFilter:["style"]});themeHeight();`,
].join("\n");
const doc = parse(`[[interactive:probe "Probe"]]\n\n[[interactive:leave "Leaves"]]\n${framed ? '\n[[interactive:theme "Theme"]]\n' : ""}`, { resolveReference: ({ type, name }) => ({ state: "ready", part: parts[`${type}:${name}`] }) });
if (doc.problems.length) { console.error(doc.problems); process.exit(2); }

writeFileSync(join(OUT, "client.tsx"), `import React from "react"; import { createRoot } from "react-dom/client";
import { DhDocument } from ${JSON.stringify(join(PKG, "src/react/strict.tsx"))};
import { InteractivePart } from ${JSON.stringify(join(PKG, "src/react/interactive.tsx"))};
const doc = JSON.parse(document.getElementById("dh-doc").textContent);
const variant = location.pathname.slice(1);
window.ixViolations = [];
window.addEventListener("securitypolicyviolation", e => window.ixViolations.push(e.violatedDirective));
const Host = (props) => {
  // Deliberately bypass the parser here: static must refuse author handlers even in a host-supplied tree.
  const block = variant.startsWith("framed-static") ? { ...props.block, html: props.block.html + "<img src=data:,bad onerror=document.body.style.height=900+'px'>" } : props.block;
  return <InteractivePart {...props} block={block} frameSrc={variant === "framed-invalid" ? "data:text/html,no" : variant === "framed-cross" ? "https://example.com/frame" : variant.endsWith("-silent") ? "/silent-frame" : variant.endsWith("-unrestricted") ? "/unrestricted-frame" : "/interactive-frame"} />;
};
createRoot(document.getElementById("dh-root")).render(<DhDocument doc={doc} theme={variant.startsWith("framed") ? "light" : undefined} interactive={variant.startsWith("framed-static") ? "static" : variant === "framed-off" ? "off" : "on"} components={{ interactive: variant.startsWith("framed") ? Host : InteractivePart }} />);`);
const b = await Bun.build({ entrypoints: [join(OUT, "client.tsx")], outdir: OUT, target: "browser", minify: true, define: { "process.env.NODE_ENV": '"production"' } });
if (!b.success) { console.error(b.logs); process.exit(2); }
writeFileSync(join(OUT, "styles.css"), buildCss());
const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><script type="module" src="/client.js"></script></head><body><div id="dh-root"></div><script type="application/json" id="dh-doc">${documentJson(doc)}</script></body></html>`;
const CSP: Record<string, string> = {
  open: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; require-trusted-types-for 'script'; trusted-types dh-interactive",
  strict: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
  guarded: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; require-trusted-types-for 'script'; trusted-types dh-interactive",
  denied: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; require-trusted-types-for 'script'; trusted-types other-policy",
};
let beacons = 0, leaves = 0, frames = 0;
const shell = interactiveFrame();
for (const k of ["framed", "framed-static", "framed-static-silent", "framed-static-unrestricted", "framed-exact", "framed-off", "framed-silent", "framed-invalid", "framed-cross"]) CSP[k] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'";

// These cases intentionally bypass parse(): the public shell must protect itself from arbitrary framers.
const rawClient = `const frame=document.getElementById("shell"), kind=new URL(location.href).searchParams.get("case");
window.shellMessages=[];
const data={dhInit:true,mode:"on",html:"<p>Shell check</p>",css:"",script:"window.parent.postMessage({ran:true,origin:window.origin},'*')",dhTokens:{},dark:false};
if(kind==="oversize")data.html="é".repeat(102401);
if(kind==="boundary")data.html=" ".repeat(204800-data.script.length);
function post(){frame.contentWindow.postMessage(data,"*")}
window.addEventListener("message",e=>{if(e.source!==frame.contentWindow)return;window.shellMessages.push(e.data);if(e.data&&e.data.dhReady)post()});
frame.addEventListener("load",post);`;
const rawPage = (src: string, sandbox = true) => `<!doctype html><html><body><iframe id="shell" ${sandbox ? 'sandbox="allow-scripts"' : ""} src="${src}"></iframe><script src="/shell-check.js"></script></body></html>`;
// A synthetic same-origin message isolates the source check from the origin check; the real self-post is refused too.
const selfPost = `<script>window.addEventListener("load",function(){var data={dhInit:true,mode:"on",html:"<p>Self init</p>",css:"",script:"window.parent.postMessage({selfInit:true},'*')",dhTokens:{},dark:false};window.postMessage(data,"*");window.dispatchEvent(new MessageEvent("message",{source:window,origin:location.origin,data:data}))});</script>`;
const server = Bun.serve({
  port: 0, hostname: "127.0.0.1",
  fetch(req) {
    const u = new URL(req.url);
    if (["/interactive-frame", "/silent-frame", "/self-frame", "/no-header-frame", "/no-ancestors-frame", "/unrestricted-frame"].includes(u.pathname)) {
      frames++;
      const html = u.pathname === "/silent-frame" ? shell.html.replace("{dhHeight:n}", "{ignored:n}") : u.pathname === "/self-frame" ? shell.html.replace("<body>", "<body>" + selfPost) : u.pathname === "/unrestricted-frame" ? shell.html.replace('restriction.content="script-src \'none\'"', 'restriction.content="img-src data:"') : shell.html;
      const csp = u.pathname === "/no-ancestors-frame" ? shell.csp.replace(/; frame-ancestors 'self'/, "") : shell.csp;
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", ...(u.pathname === "/no-header-frame" ? {} : { "Content-Security-Policy": csp }) } });
    }
    if (u.pathname === "/shell-check.js") return new Response(rawClient, { headers: { "Content-Type": "text/javascript" } });
    if (u.pathname === "/shell-check") {
      const kind = u.searchParams.get("case");
      const src = kind === "self" ? "/self-frame" : kind === "no-header" ? "/no-header-frame" : "/interactive-frame";
      return new Response(rawPage(src, kind !== "no-header" && kind !== "header-sandbox"), { headers: { "Content-Type": "text/html" } });
    }
    if (u.pathname === "/beacon" || u.pathname === "/beacon-send" || u.pathname === "/beacon-ws") { beacons++; return new Response("seen"); }
    if (u.pathname === "/leave") { leaves++; return new Response("left"); }
    if (u.pathname === "/client.js") return new Response(Bun.file(join(OUT, "client.js")), { headers: { "Content-Type": "text/javascript" } });
    if (u.pathname === "/styles.css") return new Response(Bun.file(join(OUT, "styles.css")), { headers: { "Content-Type": "text/css" } });
    const k = u.pathname.slice(1);
    const csp = k === "framed-exact" ? CSP[k].replace("frame-src 'self'", `frame-src ${u.origin}/interactive-frame`) : CSP[k];
    return csp ? new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp } }) : new Response("no", { status: 404 });
  },
});
const otherSite = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) {
  const u = new URL(req.url);
  if (u.pathname === "/shell-check.js") return new Response(rawClient, { headers: { "Content-Type": "text/javascript" } });
  const route = u.searchParams.get("case") === "origin" ? "/no-ancestors-frame" : "/interactive-frame";
  return new Response(rawPage(`http://localhost:${server.port}${route}`, false), { headers: { "Content-Type": "text/html" } });
} });
const READ = `(() => [...document.querySelectorAll(".dh-ix")].map((x) => ({ state: x.dataset.ixState, frame: !!x.querySelector("iframe"), sandbox: x.querySelector("iframe")?.getAttribute("sandbox") ?? null, height: x.querySelector("iframe")?.style.height ?? null, chip: x.querySelector(".dh-ix-chip")?.textContent ?? null })))()`;
let p = await launch();
const results: Record<string, any> = {};
let bad = 0;
const want = (name: string, ok: boolean, got: unknown) => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: ${JSON.stringify(got)}`}`); if (!ok) bad++; };
try {
  if (!framed) {
  await p.goto(`http://127.0.0.1:${server.port}/open`);
  await p.sleep(2500);
  const open = (results.open = await p.eval<any[]>(READ));
  const probeH = parseInt(open[0]?.height ?? "0", 10);
  want("open: the probe runs (it reported its height)", open[0]?.state === "running" && open[0]?.frame, open[0]);
  want("open: sandbox is allow-scripts, nothing else", open[0]?.sandbox === "allow-scripts", open[0]?.sandbox);
  // 400 + 10 x bits, plus the frame body's 8 px padding above and below
  const f = (probeH - 416) / 10;
  want("open: storage, cookies, fetch and the page are all refused (bits 1+2+4+8)", f === 15, { height: probeH, bits: f });
  want("open: the frame that loads a second page is stopped, its still shown", open[1]?.state === "stopped" && !open[1]?.frame && /tried to leave/.test(open[1]?.chip ?? ""), open[1]);
  const leftOpen = leaves;
  results.leavesOpen = leftOpen;
  console.log(`info open: a frame that hides the word location and navigates made ${leftOpen} request(s) before it was stopped`);
  leaves = 0;
  await p.goto(`http://127.0.0.1:${server.port}/guarded`);
  await p.sleep(2500);
  const guarded = (results.guarded = await p.eval<any[]>(READ));
  want("guarded (frame-src 'none'): the probe still runs", guarded[0]?.state === "running", guarded[0]);
  want("guarded (frame-src 'none'): the navigation makes no request", leaves === 0, leaves);
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
  } else {
    for (const kind of ["blocked", "origin"]) {
      await p.goto(`http://127.0.0.1:${otherSite.port}/?case=${kind}`);
      await p.sleep(700);
      const messages = await p.eval<any[]>("window.shellMessages");
      want(`shell: cross-site unsandboxed framer cannot run (${kind})`, !messages.some(x=>x.ran), messages);
      if (kind === "origin") want("shell: missing ancestor header control actually loaded", messages.some(x=>x.dhReady), messages);
    }
    for (const kind of ["header-sandbox", "no-header", "self", "oversize", "boundary"]) {
      await p.goto(`http://127.0.0.1:${server.port}/shell-check?case=${kind}`);
      await p.sleep(700);
      const messages = await p.eval<any[]>("window.shellMessages");
      if (kind === "header-sandbox") want("shell: header alone forces opaque origin without iframe sandbox", messages.some(x=>x.ran && x.origin==="null"), messages);
      if (kind === "no-header") want("shell: without header and sandbox, bootstrap refuses to run", messages.length === 0, messages);
      if (kind === "self") want("shell: self init refused, legitimate parent init accepted", !messages.some(x=>x.selfInit) && messages.some(x=>x.ran), messages);
      if (kind === "oversize") want("shell: over 204800 UTF-8 bytes refuses init", messages.some(x=>x.dhReady) && !messages.some(x=>x.ran || typeof x.dhHeight==="number"), messages);
      if (kind === "boundary") want("shell: exactly 204800 bytes accepts init", messages.some(x=>x.ran), messages);
    }
    await p.goto(`http://127.0.0.1:${server.port}/framed`);
    await p.sleep(2000);
    const active = results.framed = await p.eval<any[]>(READ);
    want("frameSrc: runs under parent script-src self and trusted-types none", active[0]?.state === "running", active[0]);
    want("frameSrc: exact sandbox", active[0]?.sandbox === "allow-scripts", active[0]);
    want("frameSrc: storage, cookies, fetch, parent, XHR, WebSocket, beacon, indexedDB refused (255)", parseInt(active[0]?.height ?? "0") === 671, active[0]);
    want("frameSrc: no srcdoc", await p.eval(`[...document.querySelectorAll("iframe")].every(f=>!f.hasAttribute("srcdoc"))`), active);
    want("frameSrc: stopped after second load", active[1]?.state === "stopped" && !active[1]?.frame, active[1]);
    results.leavesFramed = leaves;
    console.log(`info frameSrc: a frame that hides the word location and navigates made ${leaves} request(s) before it was stopped`);
    want("frameSrc: navigation residual is one request", leaves === 1, leaves);
    leaves = 0;
    await p.goto(`http://127.0.0.1:${server.port}/framed-exact`);
    await p.sleep(1200);
    const exact = results.exact = await p.eval<any[]>(READ);
    want("frameSrc exact-path policy: shell runs and off-route navigation sends zero requests", exact[0]?.state === "running" && leaves === 0, { exact, leaves });
    // Return to the broad-policy measurement to exercise the remaining channel and theme checks.
    await p.goto(`http://127.0.0.1:${server.port}/framed`);
    await p.sleep(2000);
    await p.eval(`window.postMessage({dhHeight:1200},"*");window.postMessage({dhReady:true},"*")`);
    await p.sleep(100);
    want("frameSrc: wrong-source replies ignored", (await p.eval<any[]>(READ))[0]?.height === active[0]?.height, await p.eval(READ));
    want("frameSrc: initial light theme delivered", active[2]?.height === "216px", active[2]);
    // Cross-origin frames outside the viewport may have ResizeObserver throttled by Chromium.
    await p.eval(`document.querySelectorAll(".dh-ix")[2].scrollIntoView()`);
    await p.eval(`document.querySelector(".dh-doc").style.setProperty("--acc","rgb(1, 2, 3)");document.querySelector(".dh-doc").setAttribute("data-theme","dark")`);
    await p.sleep(1000);
    want("frameSrc: changed theme tokens and dark flag delivered", (await p.eval<any[]>(READ))[2]?.height === "336px", await p.eval(READ));
    want("frameSrc: zero parent CSP / Trusted Types violations", (await p.eval<any[]>("window.ixViolations")).length === 0, await p.eval("window.ixViolations"));
    await p.goto(`http://127.0.0.1:${server.port}/framed-static`);
    await p.sleep(1000);
    const still = results.static = await p.eval<any[]>(READ);
    want("frameSrc static: markup renders, author script and handlers do not run", still[0]?.state === "static" && still[0]?.height === "80px" && still[1]?.frame, still);
    const loaded = frames;
    await p.goto(`http://127.0.0.1:${server.port}/framed-off`);
    await p.sleep(500);
    want("frameSrc off: no iframe or shell request", frames === loaded && (await p.eval<any[]>(READ)).every(x=>!x.frame), await p.eval(READ));
    for (const variant of ["framed-invalid", "framed-cross"]) {
      await p.goto(`http://127.0.0.1:${server.port}/${variant}`);
      await p.sleep(500);
      const refused = await p.eval<any[]>(READ);
      want(variant + ": invalid frame URL refused", refused.every(x=>x.state==="stopped" && !x.frame && /same-origin/.test(x.chip)), refused);
    }
    for (const variant of ["framed-silent", "framed-static-silent"]) {
      await p.goto(`http://127.0.0.1:${server.port}/${variant}`);
      await p.sleep(5500);
      const silent = results[variant] = await p.eval<any[]>(READ);
      want(`${variant}: ready alone does not satisfy the five-second height deadline`, silent[0]?.state === "stopped" && /did not answer/.test(silent[0]?.chip ?? ""), silent[0]);
    }
    await p.goto(`http://127.0.0.1:${server.port}/framed-static-unrestricted`);
    await p.sleep(5500);
    const unrestricted = await p.eval<any[]>(READ);
    want("frameSrc static: ineffective meta refuses initialization", unrestricted.every(x=>x.state === "stopped" && !x.frame && /did not answer/.test(x.chip)), unrestricted);
    await p.goto(`http://127.0.0.1:${server.port}/framed`);
    await p.sleep(500);
    await p.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: 601000 });
    await p.sleep(1000);
    const expired = await p.eval<any[]>(READ);
    want("frameSrc: stops at ten minutes", expired[0]?.state === "stopped" && /10 minutes/.test(expired[0]?.chip ?? ""), expired[0]);
    await p.close();
    p = await launch();
    await p.goto(`http://127.0.0.1:${server.port}/framed-static`);
    await p.sleep(700);
    want("frameSrc static: running before ten-minute clock", (await p.eval<any[]>(READ))[0]?.state === "static", await p.eval(READ));
    await p.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: 601000 });
    await p.sleep(1000);
    const staticExpired = await p.eval<any[]>(READ);
    want("frameSrc static: stops at ten minutes", staticExpired[0]?.state === "stopped" && /10 minutes/.test(staticExpired[0]?.chip ?? ""), staticExpired[0]);
  }
  want("no frame reached the server (beacons)", beacons === 0, beacons);
} finally {
  await p.close();
  server.stop(true);
  otherSite.stop(true);
  rmSync(OUT, { recursive: true, force: true });
}
console.log(JSON.stringify({ results, beacons, leaves }));
process.exit(bad ? 1 : 0);
