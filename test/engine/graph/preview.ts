// Manual browser check of the layout outputs before the shared renderer lane is ready.
// Run after `bun example/build.tsx`: bun test/engine/graph/preview.ts
import { mkdirSync, readdirSync } from "node:fs";
import { Graph } from "../../../src/engine/layouts/graph";
import { measure, wrap, setPhoneFont } from "../../../src/core/stage-core";
import { launch, killAll } from "../../../scripts/cdp";
import { fixtureInput } from "./fixture-input";
import type { LayoutInput, Placed, Rect } from "../../../src/engine/types";

const root = new URL("../../../", import.meta.url).pathname;
const out = root + "example/dist/graph-shots";
mkdirSync(out, { recursive: true });
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const fixture = readdirSync(root + "fixtures/format").find((s) => s.startsWith("50-"))!;
const text = await Bun.file(root + "fixtures/format/" + fixture).text();
const block = /^```animation[^\n]*\n([\s\S]*?)^```/m.exec(text)![1];
const chunks = block.split(/^@step\s*/m), head = chunks.shift()!;
const steps = chunks.map((s) => { const at = s.indexOf("\n"); return { title: s.slice(0, at), raw: s.slice(at + 1), line: 1 }; });
const legacy = fixtureInput(head, steps, {});

function svg(input: LayoutInput, width: number, step: number): string {
  setPhoneFont(width < 480);
  const plans = new Map<string | null, Placed>();
  const place = (id: string | null): Placed => {
    const members = input.model.order.filter((x) => input.states.some((s) => (s.things[x].in ?? input.model.things[x].parent) === id && !s.things[x].at));
    const p = Graph.place({ ...input, container: id, members }, { width, phone: width < 480, look: input.model.look,
      measure, wrap, child: place, problem: (p) => { if (!p.warn) throw new Error(p.msg); } });
    plans.set(id, p); return p;
  };
  const plan = place(null), rects: Record<string, Rect> = {};
  const walk = (p: Placed, dx: number, dy: number) => {
    for (const [id, r] of Object.entries(p.at(step))) {
      rects[id] = { ...r, x: r.x + dx, y: r.y + dy };
      const child = plans.get(id); if (child) walk(child, rects[id].x, rects[id].y);
    }
  };
  walk(plan, 0, 0);
  const paths = Object.values(input.model.relations).flatMap((rel) => {
    const a = rects[rel.from], b = rects[rel.to]; if (!a || !b) return [];
    const route = plan.routes?.(step, rel, a, b) ?? `M${a.x + a.w} ${a.y + a.h / 2}L${b.x} ${b.y + b.h / 2}`;
    return [`<path d="${route}" stroke="var(--line)" fill="none"/>`];
  }).join("");
  const boxes = Object.entries(rects).map(([id, r]) => {
    const t = input.model.things[id], label = wrap(t.title, Math.max(30, r.w - 16), "title", 4);
    const y = t.container ? r.y + 19 : r.y + (r.h - label.length * 17) / 2 + 13;
    return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="8" fill="${t.container ? "var(--group)" : "var(--card)"}" stroke="var(--line)"/><text x="${r.x + r.w / 2}" y="${y}" text-anchor="middle" font-size="13">${label.map((s, i) => `<tspan x="${r.x + r.w / 2}" dy="${i ? 17 : 0}">${escape(s)}</tspan>`).join("")}</text>`;
  }).join("");
  return `<svg width="${plan.w}" height="${plan.h}" viewBox="0 0 ${plan.w} ${plan.h}">${paths}${boxes}</svg>`;
}

const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
  const url = new URL(req.url);
  if (url.pathname === "/font.woff2") return new Response(Bun.file(root + "example/fonts/poppins-400-latin.woff2"));
  const width = Number(url.searchParams.get("width") ?? 1280), dark = url.searchParams.has("dark");
  const modern = fixtureInput('box a "Receive"\nbox b "Read"\nbox c "Write"\nbox d "Finish"\na -> c\nb -> d', [], {});
  modern.model.origin = "format12"; modern.model.look = "stage"; delete modern.model.fence["graph-src"];
  modern.model.relations = Object.fromEntries([["a", "c"], ["b", "d"]].map(([from, to], i) => [String(i), { id: String(i), from, to, label: null, role: null, setup: true, style: "arrow", src: { line: 1 } }]));
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>@font-face{font-family:Poppins;src:url(/font.woff2)}:root{--bg:${dark ? "#171a20" : "#f6f8fa"};--ink:${dark ? "#f0f3f6" : "#172133"};--line:${dark ? "#96a8c1" : "#53647a"};--card:${dark ? "#2d3a4e" : "#fff"};--group:${dark ? "#202b39" : "#eaf0f6"}}*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font-family:Poppins,sans-serif}h1{font-size:18px}h2{font-size:15px}section{margin:24px 0}.scroll{overflow:auto;border:1px solid var(--line)}svg{display:block}text{fill:var(--ink);font-family:Poppins,sans-serif}</style><h1>Graph layout port — geometry preview</h1><p>Plugin coordinates with a simple box painter. Shared renderer comparison is pending.</p><section><h2>Format 12: ranks and crossings</h2><div class="scroll">${svg(modern, width - 32, 0)}</div></section><section><h2>Legacy graph: shard movement, final step</h2><div class="scroll">${svg(legacy, width - 32, legacy.states.length - 1)}</div></section>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
} });
console.log(`geometry preview on http://127.0.0.1:${server.port}`);
const page = await launch();
try {
  for (const width of [1280, 390]) for (const dark of [false, true]) {
    await page.viewport(width, 1100, width === 390);
    await page.goto(`http://127.0.0.1:${server.port}/?width=${width}${dark ? "&dark" : ""}`);
    await page.eval("document.fonts.ready");
    const height = await page.eval<number>("Math.max(1100, document.documentElement.scrollHeight)");
    await page.shot(`${out}/graph-${width}-${dark ? "dark" : "light"}.png`, { x: 0, y: 0, width, height });
  }
  console.log(`four screenshots: ${out}`);
} finally { await page.close(); killAll(); await server.stop(); }
