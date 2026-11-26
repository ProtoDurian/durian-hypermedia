// The three marks of captions, speech and notes (SPEC 6.15): `code`, **bold** and *italic*. Words on the stage stay plain.
// A mark that is not closed stays as typed.
import type { TextRun } from "../types";

const MARK = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;

/** the runs of `s`; one plain run when it has no marks */
export function parseMarks(s: string): TextRun[] {
  const out: TextRun[] = [];
  let at = 0;
  for (const m of s.matchAll(MARK)) {
    if (m.index! > at) out.push({ text: s.slice(at, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], code: true } : m[2] !== undefined ? { text: m[2], bold: true } : { text: m[3], italic: true });
    at = m.index! + m[0].length;
  }
  if (at < s.length || !out.length) out.push({ text: s.slice(at) });
  return out;
}
/** `s` without its marks (what is measured) */
export const plainOf = (s: string): string => parseMarks(s).map((r) => r.text).join("");
/** whether `s` has a mark */
export const hasMarks = (s: string): boolean => parseMarks(s).some((r) => r.code || r.bold || r.italic);
/** the runs of one wrapped line of `plain`: lines are cut from the plain text in order, so line i is found after line i-1 */
export function runsOfLines(s: string, lines: string[]): TextRun[][] {
  const runs = parseMarks(s), chars: { c: string; r: TextRun }[] = [];
  for (const r of runs) for (const c of r.text) chars.push({ c, r });
  const plain = chars.map((x) => x.c).join("");
  let at = 0;
  return lines.map((l) => {
    const i = plain.indexOf(l, at); if (i < 0) return [{ text: l }];
    at = i + l.length;
    const out: TextRun[] = [];
    for (const x of chars.slice(i, i + l.length)) { const last = out[out.length - 1]; if (last && last.code === x.r.code && last.bold === x.r.bold && last.italic === x.r.italic) last.text += x.c; else out.push({ text: x.c, code: x.r.code, bold: x.r.bold, italic: x.r.italic }); }
    return out;
  });
}
