// Synced from the Durian Hypermedia sources by scripts/sync.ts: edit the source, not this copy.
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
  return { ...h, annotations: [...h.annotations, ...anns.map((a) => ({ name: a.name, query: "", fromLineNumber: a.from, toLineNumber: a.to }))] };
}
