// A test-only drawing of the grid layout's primitives, in the old stage's own SVG classes and paints, so the page's stage.css
// styles it and a screenshot can sit next to the old stage's. The real renderer is the render lane's; this one only reads
// what paint.ts wrote (role, tone, `gf-`/`ge-` classes, font, ink).
import { paint } from "../../../src/ui/stage";
import { FONT, measure } from "../../../src/core/stage-core";
import type { Prim } from "../../../src/engine/types";

/** the arrowhead at the end of a path made of M, L, C and Q commands (the tangent of its last piece) */
function head(d: string, size = 10): string {
  const nums = (d.match(/[MLCQ][^MLCQ]*/g) ?? []).map((c) => c.slice(1).trim().split(/[\s,]+/).map(Number));
  const last = nums.at(-1) ?? [], prev = nums.at(-2) ?? [];
  const bx = last.at(-2)!, by = last.at(-1)!;
  let ax = last.length >= 4 ? last.at(-4)! : prev.at(-2)!, ay = last.length >= 4 ? last.at(-3)! : prev.at(-1)!;
  if (ax === bx && ay === by) { ax = prev.at(-2)!; ay = prev.at(-1)!; }
  let dx = bx - ax, dy = by - ay; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const q = 0.6;
  return `M${bx} ${by}L${bx - dx * size - dy * size * q} ${by - dy * size + dx * size * q}L${bx - dx * size + dy * size * q} ${by - dy * size - dx * size * q}Z`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const TONE = (t: string | null | undefined) => (t === "accent" ? "acc" : t);
const cl = (cls: string | undefined, p: string) => new RegExp(`(?:^|\\s)${p}-?(\\S+)`).exec(cls ?? "")?.[1];
const mk = (role: string | null | undefined, tone: string | null | undefined, part: string) => (part === "none" ? "none" : role ? `role:${role}:${part}` : tone ? `${TONE(tone)}:${part}` : part);

function strike(p: Extract<Prim, { k: "text" }>, cls: string): string {
  if (!/g-strike/.test(cls)) return "";
  const t = p.lines.join(" "), F = FONT[p.font], wd = measure(t, p.font) / (F.mono || F.weight >= 500 ? 1 : 0.95);
  const x0 = p.anchor === "middle" ? p.x - wd / 2 : p.anchor === "end" ? p.x - wd : p.x, my = p.y - F.size * 0.32;
  return `<line class="stg-struck-line" x1="${x0 - 1}" y1="${my}" x2="${x0 + wd + 1}" y2="${my}"/>`;
}
export function primsToSvg(prims: Prim[], w: number, h: number, roles: Record<string, number>, phone: boolean): string {
  const body = prims.map((p) => {
    const cls = (p as { cls?: string }).cls ?? "";
    const state = `stg-i${/g-hot/.test(cls) ? " stg-hot" : ""}${/g-dim/.test(cls) ? " stg-dim" : ""}`;
    switch (p.k) {
      case "box": {
        const f = cl(p.cls, "gf") ?? "none", e = cl(p.cls, "ge") ?? "none", n = p.role ? roles[p.role] : undefined;
        const old = (p.cls ?? "").split(/\s+/).filter((x) => x && !/^(gf|ge)-/.test(x) && !/^g-/.test(x)).join(" ");
        const ftone = /(^|\s)gt-fill(\s|$)/.test(cls), rx = cl(p.cls, "g-r") ?? "8";
        const style = `fill:${paint(mk(ftone ? null : p.role, p.tone, f), roles)};stroke:${paint(mk(p.tone ? null : p.role, p.tone, e), roles)}`;
        return `<rect class="${state} stg-box ${old} ${n !== undefined ? `cc cc-${n}` : ""} ${p.lit ? "stg-thick" : ""} ${p.dashed ? "stg-dash" : ""}" x="${p.rect.x}" y="${p.rect.y}" width="${p.rect.w}" height="${p.rect.h}" rx="${rx}" style="${style}"/>`;
      }
      case "rect": return `<rect class="${state} stg-box" x="${p.rect.x}" y="${p.rect.y}" width="${p.rect.w}" height="${p.rect.h}" rx="${p.r ?? 8}" style="fill:${p.fill === "faint" ? "var(--surface)" : "none"};stroke:var(--line)"/>`;
      case "text": {
        const ink = p.ink === "ink" ? "ink" : p.ink === "muted" ? "muted" : p.role ? `role:${p.role}:ink` : `${TONE(p.tone)}:ink`;
        return `<g class="${state}"><text class="stg-t stg-f-${p.font}${/g-strike/.test(cls) ? " stg-struck" : ""}${/g-halo/.test(cls) ? " stg-halo" : ""}" x="${p.x}" y="${p.y}" text-anchor="${p.anchor}" style="fill:${paint(ink, roles)}">${esc(p.lines.join(" "))}</text>${strike(p, cls)}</g>`;
      }
      case "path": return `<g class="${state} stg-edge"><path class="stg-line" d="${p.d}" style="stroke:${paint(p.role ? `role:${p.role}:line` : "ink-2", roles)};fill:${p.fill === "role" ? paint(p.role ? `role:${p.role}:line` : "ink-2", roles) : "none"}"/>${p.arrow ? `<path class="stg-head" d="${head(p.d)}" style="fill:${paint(p.role ? `role:${p.role}:line` : "ink-2", roles)}"/>` : ""}</g>`;
      case "chip": return `<g class="${state}"><rect class="stg-badge" x="${p.x}" y="${p.y}" width="17" height="17" rx="4" style="fill:${paint(`role:${p.role}:line`, roles)}"/><text class="stg-t stg-f-small-b stg-badge-t" x="${p.x + 8.5}" y="${p.y + 12.5}" text-anchor="middle">${esc(p.words)}</text></g>`;
      case "dot": return `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" style="fill:${paint(`role:${p.role}:line`, roles)}"/>`;
    }
  }).join("");
  return `<svg class="stg-svg${phone ? " stg-phone" : ""}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">${body}</svg>`;
}
