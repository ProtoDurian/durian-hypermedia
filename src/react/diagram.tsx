// The state, class and ER parts (```state, ```class, ```er): each is its own small language that compiles to a scene
// (core/diagrams.ts), so the animation engine draws it: its layout, line router, step player and notes. A source that
// cannot be drawn shows the reason and its own text, never a half drawing.
import React from "react";
import { Animation } from "../ui/anim";
import { useDh } from "./context";
import { staticOfAttr } from "../parts/react";
import type { DiagramBlock } from "../types";
export function DiagramPart({ block }: { block: DiagramBlock }) {
  const { ui, static: docStatic } = useDh();
  if (block.refused?.length) {
    return <>
      <div className="cw-error" role="note">{`This ${block.type} is not drawn: ${block.refused[0].msg}`}</div>
      <pre className="part-plain"><code>{block.body}</code></pre>
    </>;
  }
  const fence = staticOfAttr(block.attrs?.static);
  return <Animation src={block.anim} srText={block.llm} ui={ui} static={fence !== undefined ? fence : docStatic} />;
}
export default DiagramPart;
