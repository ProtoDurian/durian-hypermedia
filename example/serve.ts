#!/usr/bin/env bun
// Serve the example site with a strict Content-Security-Policy header.
//   bun example/serve.ts [dir] [port] [--strict-style]
// --strict-style also drops 'unsafe-inline' from style-src, to see what still needs it.
import { join, resolve, normalize } from "node:path";
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DIR = resolve(args[0] ?? join(import.meta.dir, "dist"));
const PORT = +(args[1] ?? 4517);
const style = process.argv.includes("--strict-style") ? "style-src 'self'" : "style-src 'self' 'unsafe-inline'";
export const CSP = `default-src 'self'; script-src 'self'; ${style}; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`;
const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", js: "text/javascript", css: "text/css", json: "application/json", svg: "image/svg+xml", png: "image/png", woff2: "font/woff2" };
Bun.serve({
  port: PORT, hostname: "127.0.0.1",
  async fetch(req) {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = normalize(join(DIR, p));
    if (!file.startsWith(DIR)) return new Response("no", { status: 403 });
    const f = Bun.file(file);
    if (!(await f.exists())) return new Response("not found", { status: 404 });
    return new Response(f, { headers: { "Content-Type": TYPES[file.split(".").pop()!] ?? "application/octet-stream", "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff" } });
  },
});
console.log(`serving ${DIR} on http://127.0.0.1:${PORT}/ with CSP: ${CSP}`);
