#!/usr/bin/env bun
// Serve the example site with a strict Content-Security-Policy header.
//   bun example/serve.ts [dir] [port] [--strict-style]
// --strict-style also drops 'unsafe-inline' from style-src, to see what still needs it.
// --trusted-types adds require-trusted-types-for 'script' (no HTML string may reach a DOM sink).
import { join, resolve, normalize } from "node:path";
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DIR = resolve(args[0] ?? join(import.meta.dir, "dist"));
const PORT = +(args[1] ?? 4517);
const style = process.argv.includes("--strict-style") ? "style-src 'self'" : "style-src 'self' 'unsafe-inline'";
const tt = process.argv.includes("--trusted-types") ? "; require-trusted-types-for 'script'" : "";
export const CSP = `default-src 'self'; script-src 'self'; ${style}; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'${tt}`;
const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", js: "text/javascript", css: "text/css", json: "application/json", svg: "image/svg+xml", png: "image/png", woff2: "font/woff2" };
// Enabled only by the browser checker: count requests at the server, including slow responses.
const tileProbe = process.argv.includes("--tile-probe");
const tileStats = new Map<string, {total: number; open: number; peak: number; per: Record<string, number>}>();
const hungTiles = new Set<() => void>();
let hangReleased = false;
Bun.serve({
  port: PORT, hostname: "127.0.0.1",
  idleTimeout: tileProbe ? 30 : undefined,
  async fetch(req) {
    const url = new URL(req.url);
    if (tileProbe && url.pathname === "/__tile-stats") return Response.json(tileStats.get(url.searchParams.get("case") ?? "normal") ?? {total:0,open:0,peak:0,per:{}});
    if (tileProbe && url.pathname === "/__tile-release") {
      hangReleased = true; // Browser-queued requests arriving after release must finish too.
      const released = hungTiles.size;
      for (const release of hungTiles) { hungTiles.delete(release); release(); }
      return Response.json({released});
    }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = normalize(join(DIR, p));
    if (!file.startsWith(DIR)) return new Response("no", { status: 403 });
    const f = Bun.file(file);
    if (!(await f.exists())) return new Response("not found", { status: 404 });
    if (tileProbe && p === "/media/test-tile.png") {
      const scenario = url.searchParams.get("case") ?? "normal", key = ["z", "x", "y"].map(k => url.searchParams.get(k)).join("/");
      let s = tileStats.get(scenario);
      if (!s) { s = {total:0,open:0,peak:0,per:{}}; tileStats.set(scenario, s); }
      s.total++; s.open++; s.peak = Math.max(s.peak, s.open); s.per[key] = (s.per[key] ?? 0) + 1;
      try {
        if (scenario === "hang" && !hangReleased) await new Promise<void>(resolve => hungTiles.add(resolve));
        if (scenario === "slow") await Bun.sleep(600);
        if (scenario === "all" || (scenario === "one" && key === "3/4/4")) return new Response("missing tile", {status:404,headers:{"Cache-Control":"no-store"}});
        return new Response(await f.arrayBuffer(), {headers:{"Content-Type":"image/png","Cache-Control":"no-store"}});
      } finally { s.open--; }
    }
    return new Response(f, { headers: { "Content-Type": TYPES[file.split(".").pop()!] ?? "application/octet-stream", "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff" } });
  },
});
console.log(`serving ${DIR} on http://127.0.0.1:${PORT}/ with CSP: ${CSP}`);
