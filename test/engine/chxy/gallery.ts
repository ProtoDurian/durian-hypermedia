// Draws every xy chart fence of the fixtures through the new drawing and writes one HTML page per width (for screenshots).
// usage: bun test/engine/chxy/gallery.ts <outdir>
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromLegacy } from "../../../src/engine/charts/xy/legacy";
import { xyBuild } from "../../../src/engine/charts/xy";
import { toSvg, XY_CSS } from "../../../src/engine/charts/xy/preview";
import { measure, setPhoneFont } from "../../../src/core/stage-core";

export const FILES = [...readdirSync("fixtures/format").filter((f) => /chart/.test(f)).map((f) => `fixtures/format/${f}`), "fixtures/parts/samples.dh.md", "fixtures/showcase.dh.md", "test/legacy/extras.dh.md"];
export function fences(): { name: string; d: any }[] {
  const out: { name: string; d: any }[] = [];
  for (const f of FILES) {
    const t = readFileSync(f, "utf8"); let n = 0;
    for (const m of t.matchAll(/^```chart\n([\s\S]*?)^```/gm)) { n++; try { out.push({ name: `${f.split("/").pop()!.replace(/\.dh\.md$/, "")}#${n}`, d: Bun.YAML.parse(m[1]) }); } catch { /* not YAML */ } }
  }
  return out;
}
export function heightOf(d: any, w: number, n: number, ns: number): number {
  const phone = w < 480;
  if (d.kind === "heatmap") return Math.max(phone ? 200 : 220, 70 + ns * (phone ? 34 : 40)) + 60;
  if (d.horizontal) return Math.max(phone ? 240 : 260, 64 + n * (d.stacked ? 34 : 18 + 20 * Math.max(1, ns))) + 40;
  return phone ? 300 : 340;
}
export function drawOne(d: any, w: number) {
  const lg = fromLegacy(d);
  if (!lg || lg.error) return { lg, svg: null as string | null, built: null as any, h: 0 };
  const phone = w < 480; setPhoneFont(phone);
  const h = heightOf(d, w, lg.spec.x.length, lg.spec.series.length);
  const built = xyBuild(lg.spec, lg.values, { x: 0, y: 0, w, h }, { phone, look: "stage", measure });
  return { lg, svg: toSvg(built.prims, w, h), built, h };
}
if (import.meta.main) {
  const out = process.argv[2]; mkdirSync(out, { recursive: true });
  const theme = readFileSync("src/ui/theme.css", "utf8");
  for (const w of [640, 350]) {
    let body = "";
    for (const { name, d } of fences()) {
      try { const r = drawOne(d, w); if (r.svg) body += `<section data-name="${name}"><h4>${name} (${d.kind})</h4>${r.svg}</section>`; } catch (e) { body += `<section><h4>${name}</h4><pre>${String((e as Error).stack)}</pre></section>`; }
    }
    writeFileSync(join(out, `gallery-${w}.html`), `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>${theme}\n${XY_CSS}\nbody{margin:12px;background:var(--surface);color:var(--ink);font-family:var(--font-sans,system-ui)}section{margin:0 0 18px;max-width:${w}px}h4{margin:0 0 4px;font:600 12px system-ui}</style>${body}`);
  }
}
