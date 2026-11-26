// A small painter for primitives, used by the tests and the screenshots of this lane (the real one is render/svg.tsx).
// Roles c1..c8 and tones map to the page's colour tokens.
import type { Prim } from "../../types";
import { XY_CSS } from "./css";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const col = (role: string | null | undefined, soft = false): string => {
  const r = role === "acc" ? "accent" : role ?? "c1";
  const v = r === "accent" ? "acc" : r === "muted" ? "faint" : r;
  return soft ? `var(--${v}-soft)` : `var(--${v})`;
};
const FS: Record<string, string> = { sub: "12px", chip: "11.5px", "small-b": "11.5px;font-weight:600", body: "12.5px" };

export function toSvg(prims: Prim[], w: number, h: number): string {
  const out: string[] = [];
  for (const p of prims) {
    const cls = esc(p.cls ?? "");
    switch (p.k) {
      case "rect": {
        const fill = p.fill === "role" ? col(p.role) : p.fill === "soft" ? col(p.role, true) : p.fill === "band" || p.fill === "faint" ? "var(--surface-2)" : "none";
        const stroke = p.edge === "role" ? col(p.role) : p.edge === "line" ? "var(--line)" : "none";
        out.push(`<rect class="${cls}" x="${p.rect.x}" y="${p.rect.y}" width="${Math.max(0, p.rect.w)}" height="${Math.max(0, p.rect.h)}" rx="${p.r ?? 0}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" data-key="${esc(p.key)}"/>`);
        break;
      }
      case "path": {
        const sw = p.width === "line" ? 2.5 : p.width === "hot" ? 3.5 : 1;
        const stroke = p.role ? col(p.role) : "";
        const fill = p.fill === "soft" ? col(p.role, true) : p.fill === "role" ? col(p.role) : "none";
        out.push(`<path class="${cls}" d="${p.d}" ${stroke ? `stroke="${stroke}"` : ""} stroke-width="${sw}" ${p.dashed ? 'stroke-dasharray="6 4"' : ""} fill="${fill}" ${p.fill === "soft" ? 'fill-opacity=".5"' : ""} stroke-linejoin="round" data-key="${esc(p.key)}"/>`);
        break;
      }
      case "dot": out.push(`<circle class="${cls}" cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${col(p.role)}" stroke="${p.cls?.includes("bubble") ? col(p.role) : "var(--surface)"}" stroke-width="1" data-key="${esc(p.key)}"/>`); break;
      case "box": {
        const { x, y, w: bw, h: bh } = p.rect;
        if (p.shape === "diamond") out.push(`<path class="${cls}" d="M${x + bw / 2} ${y}L${x + bw} ${y + bh / 2}L${x + bw / 2} ${y + bh}L${x} ${y + bh / 2}Z" fill="${col(p.role)}" stroke="var(--surface)"/>`);
        else out.push(`<rect class="${cls}" x="${x}" y="${y}" width="${bw}" height="${bh}" rx="1" fill="${col(p.role)}" stroke="var(--surface)" data-key="${esc(p.key)}"/>`);
        break;
      }
      case "text": {
        const fill = p.ink === "ink" ? "var(--ink)" : "var(--muted)";
        p.lines.forEach((l, i) => out.push(`<text class="${cls}" x="${p.x}" y="${p.y + i * 15}" text-anchor="${p.anchor}" style="font-size:${FS[p.font] ?? "12px"}" fill="${fill}" data-key="${esc(p.key)}">${esc(l)}</text>`));
        break;
      }
      case "chip": {
        const tw = p.words.length * 6.4 + 12;
        out.push(`<rect x="${p.x - tw / 2}" y="${p.y - 13}" width="${tw}" height="18" rx="9" fill="var(--surface)" stroke="${col(p.role)}"/><text class="${cls}" x="${p.x}" y="${p.y}" text-anchor="middle" style="font-size:11.5px" fill="var(--ink)">${esc(p.words)}</text>`);
        break;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="font-family:var(--font-sans,system-ui);overflow:visible">${out.join("")}</svg>`;
}
export { XY_CSS };
