// Port of core/scene.ts leafGeom for the classic look; data cells belong to the data layout.
import { CHIP, TOKEN_DOT, METER_ROOM, cut, wrapEven, textW, personIcon, cylRy, type SizeTok } from "../../../core/scene";
import { chipW } from "../../../core/chipw";

const linesW = (lines: string[], font: number) => Math.max(0, ...lines.map((l) => textW(l, font)));

// the size of a shape from its label and its size tokens; its label wraps first
export function leafGeom(e: { label: string; kind: string; level: string | undefined }, z: SizeTok): { w: number; h: number; lines: string[] } {
  const text = e.label ?? "", kind = e.kind;
  const wrap = (k = 1) => (text ? wrapEven(text, z.font, z.maxW * k) : []);
  switch (kind) {
    case "row": return { w: 0, h: z.minH - 8, lines: [] };
    // a token waiting in a container (format version 9): the same chip as a token at a thing
    case "token": { const t = cut(text, CHIP.font, CHIP.maxW); return { w: chipW(t, CHIP.font) + 2 * CHIP.px + TOKEN_DOT, h: CHIP.h, lines: [t] }; }
    // format version 11: a state machine's start dot and end ring
    case "initial": return { w: 18, h: 18, lines: [] };
    case "final": return { w: 22, h: 22, lines: [] };
    case "text": { const lines = wrap(1.4); return { w: linesW(lines, z.font) + 4, h: lines.length * z.lh + 4, lines }; }
    case "dot": { const lines = wrap(); return { w: Math.max(18, linesW(lines, z.font) + 4), h: 16 + (lines.length ? 4 + lines.length * z.lh : 0), lines }; }
    case "person": { const I = personIcon(z), lines = wrap(); return { w: Math.max(I + 10, linesW(lines, z.font) + 6), h: I + 4 + lines.length * z.lh, lines }; }
    case "circle": { const lines = wrap(0.75); const d = Math.max(z.minH + 10, linesW(lines, z.font) + 2 * z.py + 10, lines.length * z.lh + 2 * z.py + 10); return { w: d, h: d, lines }; }
    case "cylinder": { const ry = cylRy(z), lines = wrap(); return { w: Math.max(z.minW, linesW(lines, z.font) + 2 * z.px), h: Math.max(z.minH + 2 * ry, lines.length * z.lh + 2 * z.py + 2 * ry), lines }; }
    case "cloud": { const lines = wrap(); return { w: Math.max(z.minW * 1.3, linesW(lines, z.font) + 2 * z.px + 40), h: Math.max(z.minH + 20, lines.length * z.lh + 2 * z.py + 24), lines }; }
    case "diamond": { const lines = wrap(0.8); return { w: Math.max(z.minW * 1.25, linesW(lines, z.font) * 1.5 + 2 * z.px), h: Math.max(z.minH * 1.4, lines.length * z.lh * 1.7 + 2 * z.py), lines }; }
    case "pill": { const lines = wrap(); const h = Math.max(z.minH - 4, lines.length * z.lh + 2 * z.py - 2); return { w: Math.max(z.minW, linesW(lines, z.font) + 2 * z.px + (lines.length > 1 ? h * 0.3 : 6)), h, lines }; }
    default: { const lines = wrap(); return { w: Math.max(z.minW, linesW(lines, z.font) + 2 * z.px), h: Math.max(z.minH, lines.length * z.lh + 2 * z.py) + (e.level != null ? METER_ROOM : 0), lines }; }
  }
}
