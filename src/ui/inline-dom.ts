// Inline marks (SPEC 6.15) for the 3D stage's labels: elements and text nodes, never HTML.
import { spans } from "../core/inline";

export function setRich(el: HTMLElement, text: string) {
  el.replaceChildren(...spans(text).map((s) => {
    let n: Node = document.createTextNode(s.t);
    const wrap = (tag: string, cls?: string) => {
      const e = document.createElement(tag);
      if (cls) { e.className = cls; e.dataset.dhSlot = "code"; }
      e.append(n);
      n = e;
    };
    if (s.code) wrap("code", "scn-code");
    if (s.i) wrap("em");
    if (s.b) wrap("strong");
    return n;
  }));
}
