#!/usr/bin/env bun
// A filmstrip of one transition for the eye: from step k-1, press Next and shoot the part as fast as the browser allows.
//   bun scripts/sweep-film.ts --run <match run dir> --slug <page slug> --width 1280|390 --steps 2,3 --out <dir> [--frames 8] [--zoom plus|wheel|none]
// Writes <out>/<slug>-<width>-s<k>.png (the frames side by side, each captioned with its time in ms).
import { launch, killAll } from "./cdp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (k: string, d = "") => (args.includes(k) ? (args[args.indexOf(k) + 1] ?? d) : d);
const RUN = resolve(opt("--run")), SLUG = opt("--slug"), WIDTH = Number(opt("--width", "1280")), OUT = resolve(opt("--out"));
const STEPS = opt("--steps", "2").split(",").map(Number), FRAMES = Number(opt("--frames", "8")), ZOOM = opt("--zoom", "none");
mkdirSync(OUT, { recursive: true });
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) { const p = decodeURIComponent(new URL(req.url).pathname); if (p.includes("..")) return new Response("no", { status: 400 }); const f = Bun.file(join(RUN, p.startsWith("/assets/") ? "site" + p : p.startsWith("/film/") ? "film-tmp" + p.slice(5) : "site" + p)); return f.size ? new Response(f) : new Response("", { status: 404 }); } });
const s0 = Bun.serve({ port: 0, fetch: () => new Response("") }); const port = s0.port; s0.stop(true);
const p = await launch(port);
const PART = `(document.querySelector("figure.part") || document.body)`;
try {
  await p.viewport(WIDTH, 900, WIDTH < 700);
  const sleep = p.sleep;
  for (const k of STEPS) {
    await p.goto(`http://127.0.0.1:${server.port}/${SLUG}.html`);
    await p.eval(`document.fonts ? document.fonts.ready.then(() => 1) : 1`);
    await p.eval(`${PART}.scrollIntoView({ block: "center" })`); await sleep(800);
    for (let i = 2; i < k; i++) { await p.eval(`${PART}.querySelector(".btn-go").click()`); await sleep(2600); }
    if (ZOOM !== "none") {
      const b = await p.eval<{ x: number; y: number; w: number; h: number }>(`(() => { const e = ${PART}.querySelector("svg.eng-svg") || ${PART}.querySelector(".eng-3d"); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
      if (ZOOM === "plus") { await p.eval(`${PART}.querySelector(".stg").focus()`); await p.key("+", "Equal", 187); await sleep(100); await p.key("+", "Equal", 187); }
      else { await p.wheel(b.x + b.w / 2, b.y + b.h / 2, 0, -120, 2); await sleep(100); await p.wheel(b.x + b.w / 2, b.y + b.h / 2, 0, -120, 2); }
      await sleep(500);
    }
    const box = await p.eval<{ x: number; y: number; width: number; height: number }>(`(() => { const e = ${PART}.querySelector("svg.eng-svg") || ${PART}.querySelector(".eng-3d"); const r = e.getBoundingClientRect(); return { x: Math.max(0, r.left + scrollX), y: Math.max(0, r.top + scrollY), width: r.width, height: r.height }; })()`);
    const shots: { f: string; ms: number }[] = [];
    const t0 = Date.now();
    await p.eval(`${PART}.querySelector(".btn-go").click()`);
    const want = Math.min(FRAMES, 14), dir = join(resolve(RUN), "film-tmp"); mkdirSync(dir, { recursive: true });
    for (let i = 0; i < want; i++) { const f = `${SLUG}-${WIDTH}-s${k}-${i}.png`; await p.shot(join(dir, f), box); shots.push({ f, ms: Date.now() - t0 }); await sleep(Math.max(0, (i + 1) * (2000 / want) - (Date.now() - t0))); }
    const cell = WIDTH >= 1000 ? 420 : 195, cols = WIDTH >= 1000 ? 3 : 6;
    writeFileSync(join(dir, `film-${k}.html`), `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#888;font:12px sans-serif}.g{display:flex;flex-wrap:wrap;gap:6px;padding:6px;width:${(cell + 6) * cols + 6}px;box-sizing:border-box}figure{margin:0;width:${cell}px;background:#fff}figcaption{padding:1px 4px;background:#222;color:#fff}img{width:100%;display:block}</style><div class="g">${shots.map((s) => `<figure><figcaption>${s.ms} ms</figcaption><img src="/film/${s.f}"></figure>`).join("")}</div>`);
    await p.viewport(cols * (cell + 6) + 12, 900, false);
    await p.goto(`http://127.0.0.1:${server.port}/film/film-${k}.html`); await sleep(400);
    const sz = await p.eval<{ w: number; h: number }>(`(() => { const r = document.querySelector(".g").getBoundingClientRect(); return { w: Math.ceil(r.right + 6), h: Math.ceil(r.bottom + 6) }; })()`);
    await p.shot(join(OUT, `${SLUG}-${WIDTH}-s${k}${ZOOM !== "none" ? "-z" + ZOOM : ""}.png`), { x: 0, y: 0, width: sz.w, height: Math.min(sz.h, 8000) });
    await p.viewport(WIDTH, 900, WIDTH < 700);
  }
} finally { await p.close(); killAll(); server.stop(true); }
process.exit(0);
