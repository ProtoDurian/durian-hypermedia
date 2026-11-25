import React from "react";
import { renderToString } from "react-dom/server";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "../src/index";
import { DhDocument } from "../src/react/index";
import { documentJson } from "../src/react/hydrate";
import { buildCss } from "../scripts/build-css";
import { launch } from "../scripts/cdp";
const root = resolve(import.meta.dir, "..");

/** Public sample in the example's 800 px column, real fonts, strict CSP and Trusted Types. */
export async function partPage(source: string) {
  const doc = parse(source), dir = mkdtempSync(join(tmpdir(), "dh-places-test-"));
  const built = await Bun.build({ entrypoints: [join(root, "example/client.tsx")], outdir: dir,
    target: "browser", format: "esm", splitting: true, minify: true,
    naming: { entry: "[name].[ext]", chunk: "c-[hash].[ext]" }, define: { "process.env.NODE_ENV": '"production"' } });
  if (!built.success) { rmSync(dir, { recursive: true, force: true }); throw new Error("test page did not build"); }
  const css = buildCss() + readFileSync(join(root, "example/site.css"), "utf8");
  const html = '<!doctype html><html class="fonts-ready"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><script type="module" src="/client.js"></script><main class="ex-main"><div id="dh-root">' + renderToString(<DhDocument doc={doc} />) + '</div></main><script type="application/json" id="dh-doc">' + documentJson(doc) + '</script>';
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
    const path = new URL(req.url).pathname;
    const policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; require-trusted-types-for 'script'";
    if (path === "/favicon.ico") return new Response(null, { status: 204 });
    if (path === "/") return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": policy } });
    if (path === "/style.css") return new Response(css, { headers: { "content-type": "text/css" } });
    if (path.startsWith("/fonts/") && /^[A-Za-z0-9_-]+\.woff2$/.test(path.slice(7))) return new Response(Bun.file(join(root, "example", path.slice(1))), { headers: { "content-type": "font/woff2" } });
    return new Response(Bun.file(join(dir, path.slice(1))), { headers: { "content-type": "text/javascript" } });
  }});
  let page;
  try { try { page = await launch(); } catch { page = await launch(); } }
  catch (error) { server.stop(true); rmSync(dir, { recursive: true, force: true }); throw error; }
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: 'window.issues={errors:[],csp:[]};addEventListener("error",e=>issues.errors.push(e.message));addEventListener("unhandledrejection",e=>issues.errors.push(String(e.reason)));addEventListener("securitypolicyviolation",e=>issues.csp.push(e.effectiveDirective));' });
  return { page,
    async open(width: number, dark = false) {
      await page.viewport(width, 1100, width < 600); await page.dark(dark);
      await page.goto("http://127.0.0.1:" + server.port + "/");
      await page.eval("document.fonts.ready.then(()=>true)"); await page.sleep(400);
    },
    issues: () => page.eval<{ errors: string[]; csp: string[] }>("window.issues"),
    async close() { await page.close(); server.stop(true); rmSync(dir, { recursive: true, force: true }); },
  };
}
