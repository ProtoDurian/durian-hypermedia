// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// Code walk, still mode (format version 7): no morph. The step's file is shown whole; the step's lines are open and
// marked, the rest is folded into one-line "… 12 lines" bars the reader can open. Moving to the next step switches the
// marks and the folds at once (with a short fade, which reduced motion drops).
// The whole file is highlighted once at build time and sent packed (colours as numbers, one list per line); the page
// cuts the lines it shows from it, so a file used by many steps is sent once.
import React from "react";
import { InnerLine, getPreRef, InnerPre, type AnnotationHandler, type CustomPreProps, type HighlightedCode } from "codehike/code";

type PTok = string | [string, number] | [string, number, unknown];
export type Packed = { lang: string; meta: string; themeName: string; style: unknown; colors: string[]; lines: PTok[][] };

// HighlightedCode -> one token list per line, colours in a palette
export function packCode(h: HighlightedCode): Packed {
  const colors: string[] = [];
  const idx = (c: string) => { let i = colors.indexOf(c); if (i < 0) { i = colors.length; colors.push(c); } return i; };
  const lines: PTok[][] = [[]];
  for (const t of h.tokens as any[]) {
    const text: string = typeof t === "string" ? t : t[0];
    text.split("\n").forEach((part, k) => {
      if (k > 0) lines.push([]);
      if (!part) return;
      if (typeof t === "string" || t[1] == null) lines[lines.length - 1].push(part);
      else lines[lines.length - 1].push(t.length > 2 ? [part, idx(t[1]), t[2]] : [part, idx(t[1])]);
    });
  }
  return { lang: h.lang, meta: h.meta, themeName: h.themeName, style: h.style, colors, lines };
}

export type Row = { n: number } | { fold: [number, number] };
// The rows a still step shows: the open range, and one fold bar before and after it (a fold of 1 or 2 lines is not worth a bar).
// `opened` holds "top" / "bottom" for a fold the reader opened.
export function stillRows(total: number, open: [number, number], opened: ReadonlySet<string> = new Set()): Row[] {
  const [a, b] = open;
  const rows: Row[] = [];
  const side = (from: number, to: number, key: string) => {
    if (to < from) return;
    if (to - from + 1 <= 2 || opened.has(key)) for (let n = from; n <= to; n++) rows.push({ n });
    else rows.push({ fold: [from, to] });
  };
  side(1, a - 1, "top");
  for (let n = a; n <= b; n++) rows.push({ n });
  side(b + 1, total, "bottom");
  return rows;
}

// the lines of `rows` as one highlighted block (a fold bar is an empty line the Line handler replaces)
export function rowsCode(p: Packed, rows: Row[], anns: { name: "focus" | "mark"; from: number; to: number }[]): HighlightedCode {
  const tokens: any[] = [];
  const texts: string[] = [];
  rows.forEach((r, k) => {
    if (k > 0) tokens.push("\n");
    if ("fold" in r) { texts.push(""); return; }
    const line = p.lines[r.n - 1] ?? [];
    texts.push(line.map((t) => (typeof t === "string" ? t : t[0])).join(""));
    for (const t of line) tokens.push(typeof t === "string" ? t : t.length > 2 ? [t[0], p.colors[t[1]], t[2]] : [t[0], p.colors[t[1]]]);
  });
  const code = texts.join("\n");
  return { value: code, code, lang: p.lang, meta: p.meta, themeName: p.themeName, style: p.style, tokens, annotations: anns.map((a) => ({ name: a.name, query: "", fromLineNumber: a.from, toLineNumber: a.to })) } as unknown as HighlightedCode;
}

// the open range's focus and marks, as row numbers in the shown block
export function stillAnns(rows: Row[], focus: [number, number] | null, marks: number[], open: [number, number]) {
  const at = (n: number) => rows.findIndex((r) => "n" in r && r.n === n) + 1;
  const f = focus ?? open;
  const anns: { name: "focus" | "mark"; from: number; to: number }[] = [{ name: "focus", from: at(f[0]), to: at(f[1]) }];
  for (const m of marks) anns.push({ name: "mark", from: at(m), to: at(m) });
  return anns;
}

// a Pre that never animates: it only scrolls the focus into view when it appears (the walk remounts it on every step)
export class StillPre extends React.Component<CustomPreProps> {
  ref: React.RefObject<HTMLPreElement>;
  constructor(props: CustomPreProps) { super(props); this.ref = getPreRef(this.props); }
  render() { return <InnerPre merge={this.props} style={{ position: "relative" }} />; }
  componentDidMount() {
    const pre = this.ref.current;
    const first = pre?.querySelector<HTMLElement>("[data-focus=true]");
    if (!pre || !first) return;
    const top = first.getBoundingClientRect().top - pre.getBoundingClientRect().top;
    if (top > pre.clientHeight - 24 || top < 0) pre.scrollTop += top - 12;
  }
}
const stillPre: AnnotationHandler = { name: "still-pre", PreWithRef: StillPre };

// line numbers (the file's own) and the fold bars
export function stillLines(rows: Row[], onOpen: (key: string) => void, label: (n: number) => string): AnnotationHandler {
  return {
    name: "still-lines",
    Line: (props) => {
      const r = rows[props.lineNumber - 1];
      if (r && "fold" in r) {
        const n = r.fold[1] - r.fold[0] + 1;
        const key = r.fold[0] === 1 ? "top" : "bottom";
        return (
          <div className="ch-row ch-fold-row">
            <span className="ch-ln" aria-hidden="true" />
            <button type="button" className="cw-fold" aria-expanded={false} onClick={() => onOpen(key)}>{label(n)}<span className="cw-fold-range"> · {r.fold[0]}–{r.fold[1]}</span></button>
          </div>
        );
      }
      return (
        <div className="ch-row">
          <span className="ch-ln" aria-hidden="true">{r && "n" in r ? r.n : props.lineNumber}</span>
          <InnerLine merge={props} className="ch-code" />
        </div>
      );
    },
  };
}
export const STILL_BASE: AnnotationHandler[] = [stillPre];

// A run is a group of steps joined by animated moves. A run of one step is still; a longer run morphs inside itself.
export function walkRuns(animated: boolean[]): { run: number[]; still: boolean[] } {
  const run: number[] = [];
  animated.forEach((a, k) => run.push(a && k > 0 ? run[k - 1] : k));
  const still = run.map((r, k) => run.filter((x) => x === r).length === 1);
  return { run, still };
}
