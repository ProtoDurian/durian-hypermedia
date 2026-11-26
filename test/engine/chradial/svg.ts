// A small prim-to-SVG writer for looking at the radial kinds before the engine's own renderer lands (test helper only).
import type { Prim } from "../../../src/engine/types";
const PAL = ["#4e79a7", "#f28e2b", "#59a14f", "#b07aa1", "#e15759", "#76b7b2", "#edc948", "#9c755f"];
const col = (role: string | null | undefined) => (role && /^c[1-8]$/.test(role) ? PAL[+role[1] - 1] : role === "store" ? PAL[2] : role === "job" ? PAL[0] : "#888");
const TONE: Record<string, string> = { good: "#59a14f", bad: "#e15759", warn: "#f28e2b", accent: "#4e79a7" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
export function toSvg(prims: Prim[], w: number, h: number, dark = false): string {
  const ink = dark ? "#eee" : "#222", muted = dark ? "#aaa" : "#666", bg = dark ? "#1c1c1c" : "#fff", line = dark ? "#555" : "#ccc";
  const out = prims.map((p) => {
    switch (p.k) {
      case "path": { const fill = p.fill === "role" || p.fill === "soft", c = col(p.role); return `<path d="${p.d}" ${p.cls?.includes("ch-halo") ? "" : ""} fill="${fill ? c : "none"}" fill-opacity="${p.fill === "soft" ? 0.25 : 0.85}" stroke="${fill ? (p.fill === "soft" ? c : bg) : line}" stroke-width="${fill && p.fill !== "soft" ? 2 : 1.5}"/>`; }
      case "text": return `<text x="${p.x}" y="${p.y}" font-size="12" text-anchor="${p.anchor}" fill="${p.ink === "muted" ? muted : p.ink === "role" ? col(p.role) : ink}" font-family="sans-serif">${p.lines.map((l, i) => `<tspan x="${p.x}" dy="${i ? 14 : 0}">${esc(l)}</tspan>`).join("")}</text>`;
      case "dot": return `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${p.tone ? TONE[p.tone] : col(p.role)}"/>`;
      case "rect": return `<rect x="${p.rect.x}" y="${p.rect.y}" width="${p.rect.w}" height="${p.rect.h}" rx="${p.r ?? 0}" fill="${p.fill === "role" ? col(p.role) : p.fill === "faint" ? (dark ? "#262626" : "#f4f4f4") : "none"}" fill-opacity="${p.fill === "role" ? 0.5 : 1}" stroke="${p.edge === "role" ? col(p.role) : p.edge === "none" ? "none" : line}" stroke-width="${p.edge === "role" ? 2 : 1}"/>`;
      case "box": return `<rect x="${p.rect.x}" y="${p.rect.y}" width="${p.rect.w}" height="${p.rect.h}" rx="2" fill="${p.dim ? (dark ? "#333" : "#e6e6e6") : p.tone ? TONE[p.tone] : col(p.role)}" fill-opacity="${p.dim ? 1 : 0.55}" stroke="${p.lit ? ink : p.dim ? line : p.tone ? TONE[p.tone] : col(p.role)}" stroke-width="${p.lit ? 2.5 : 1}"/>`;
      case "chip": return `<text x="${p.x}" y="${p.y + 4}" font-size="12" text-anchor="middle" fill="${col(p.role)}" font-weight="bold">${esc(p.words)}</text>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${out.join("")}</svg>`;
}
