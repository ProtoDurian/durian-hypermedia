// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// Code Hike (codehike.org, v1.1.0) annotation handlers used by every code view on the pages.
// - SmoothPre: token transitions between steps (Code Hike's token-transitions util) and scroll-to-focus.
// - focus / mark / add / del: block annotations, added from the part's data (the code itself carries no comments).
// - lineNumbers(start): the file's own line numbers.
import React from "react";
import { InnerLine, InnerPre, InnerToken, getPreRef, type AnnotationHandler, type CustomPreProps, type HighlightedCode } from "codehike/code";
import { calculateTransitions, getStartingSnapshot, type TokenTransitionsSnapshot } from "codehike/utils/token-transitions";

const MAX_MS = 700;
const reduced = () => typeof window !== "undefined" && (!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !!document.querySelector('[data-dh-motion="off"]'));

export class SmoothPre extends React.Component<CustomPreProps> {
  ref: React.RefObject<HTMLPreElement>;
  constructor(props: CustomPreProps) { super(props); this.ref = getPreRef(this.props); }
  render() { return <InnerPre merge={this.props} style={{ position: "relative" }} />; }
  componentDidMount() { this.scrollToFocus(true); }
  getSnapshotBeforeUpdate() { return this.ref.current ? getStartingSnapshot(this.ref.current) : null; }
  componentDidUpdate(_p: never, _s: never, snap: TokenTransitionsSnapshot | null) {
    const pre = this.ref.current;
    if (pre && snap && !reduced()) {
      for (const { element, keyframes, options } of calculateTransitions(pre, snap)) {
        const { translateX, translateY, ...kf } = keyframes as any;
        if (translateX && translateY) kf.translate = [`${translateX[0]}px ${translateY[0]}px`, `${translateX[1]}px ${translateY[1]}px`];
        element.animate(kf, { duration: options.duration * MAX_MS, delay: options.delay * MAX_MS, easing: options.easing, fill: "both" });
      }
    }
    this.scrollToFocus(false);
  }
  scrollToFocus(first: boolean) {
    const pre = this.ref.current;
    if (!pre) return;
    const els = pre.querySelectorAll<HTMLElement>("[data-focus=true]");
    if (!els.length) return;
    const box = pre.getBoundingClientRect();
    let top = Infinity, bottom = -Infinity;
    els.forEach((e) => { const r = e.getBoundingClientRect(); top = Math.min(top, r.top - box.top); bottom = Math.max(bottom, r.bottom - box.top); });
    if (bottom > pre.clientHeight || top < 0) pre.scrollTo({ top: pre.scrollTop + top - 12, behavior: first || reduced() ? "instant" as ScrollBehavior : "smooth" });
  }
}

export const tokenTransitions: AnnotationHandler = {
  name: "token-transitions",
  PreWithRef: SmoothPre,
  Token: (props) => <InnerToken merge={props} style={{ display: "inline-block" }} />,
};
// focus: only the focused lines get a class. Pass 2 also gave every line a "dim" class through Line, but Code Hike
// applies Line to annotated lines too, so the whole block went dim. The CSS now dims only the rows of a block that
// holds a focus and are not focused themselves (parts.css, .ch-pre:has(.ch-focus)).
export const focus: AnnotationHandler = {
  name: "focus",
  AnnotatedLine: ({ annotation, ...props }) => <InnerLine merge={props} data-focus={true} className="ch-line ch-focus" />,
};
export const mark: AnnotationHandler = {
  name: "mark",
  AnnotatedLine: ({ annotation, ...props }) => <InnerLine merge={props} className="ch-line ch-mark" />,
};
export const add: AnnotationHandler = { name: "add", AnnotatedLine: ({ annotation, ...props }) => <InnerLine merge={props} className="ch-line ch-add" data-sign="+" /> };
export const del: AnnotationHandler = { name: "del", AnnotatedLine: ({ annotation, ...props }) => <InnerLine merge={props} className="ch-line ch-del" data-sign="−" /> };
export function lineNumbers(start: number): AnnotationHandler {
  return {
    name: "line-numbers",
    Line: (props) => (
      <div className="ch-row">
        <span className="ch-ln" aria-hidden="true">{props.lineNumber + start - 1}</span>
        <InnerLine merge={props} className="ch-code" />
      </div>
    ),
  };
}
export const HANDLERS_BASE = [tokenTransitions, mark, add, del, focus];

// add block annotations to a highlighted block (line numbers are 1-based within the block)
export type Ann = { name: "focus" | "mark" | "add" | "del"; from: number; to: number };
export function annotate(h: HighlightedCode, anns: Ann[]): HighlightedCode {
  const lines = (h.code ?? "").split("\n").length;
  return { ...lineTokens(h), annotations: [...h.annotations, ...mergeLineAnns(anns, lines).map((a) => ({ name: a.name, query: "", fromLineNumber: a.from, toLineNumber: a.to }))] };
}
// One-line annotations of one name on neighbouring lines, as one annotation over those lines (a line marked twice is in
// two of them). Code Hike gives each line the annotations around it, and none of these handlers draws a block, so the
// lines draw the same; but it walks every line once per annotation, so a step with thousands of marks cost their
// product. Annotations over more than one line, or outside 1..lines, stay as they are. A line marked more than 8 times
// with one name keeps 8 (each only repeats the class name; Code Hike nests one level per repeat).
export function mergeLineAnns<A extends { name: string; from: number; to: number }>(anns: A[], lines: number): { name: A["name"]; from: number; to: number }[] {
  const out: { name: A["name"]; from: number; to: number }[] = [];
  const counts = new Map<A["name"], Map<number, number>>();
  for (const a of anns) {
    if (a.from !== a.to || !Number.isInteger(a.from) || a.from < 1 || a.from > lines) { out.push({ name: a.name, from: a.from, to: a.to }); continue; }
    let m = counts.get(a.name);
    if (!m) counts.set(a.name, (m = new Map()));
    m.set(a.from, (m.get(a.from) ?? 0) + 1);
  }
  for (const [name, m] of counts) {
    // layer k holds the lines marked at least k times; each layer's runs of neighbouring lines become one annotation
    let at = [...m.keys()].sort((x, y) => x - y);
    for (let layer = 1; at.length && layer <= 8; layer++) {
      for (let i = 0; i < at.length; ) { let j = i; while (j + 1 < at.length && at[j + 1] === at[j] + 1) j++; out.push({ name, from: at[i], to: at[j] }); i = j + 1; }
      at = at.filter((l) => m.get(l)! > layer);
    }
  }
  return out;
}
// Code Hike cuts a text token at its first line end and joins the rest back together, again for every line, so one
// token holding many lines costs the square of its line count (plain code is one token; highlighted code keeps a run
// of blank lines in one). The same text as one token per line draws the same lines in one pass.
export function lineTokens(h: HighlightedCode): HighlightedCode {
  const ts = h.tokens as unknown[];
  const many = ts.some((t) => typeof t === "string" && t.indexOf("\n") >= 0 && t.indexOf("\n", t.indexOf("\n") + 1) >= 0);
  if (!many) return h;
  const out: unknown[] = [];
  for (const t of ts) if (typeof t === "string" && t.indexOf("\n") >= 0) { for (const p of t.split(/(?<=\n)/)) out.push(p); } else out.push(t);
  return { ...h, tokens: out } as HighlightedCode;
}
