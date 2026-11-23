// The maths view (format version 11): the element tree KaTeX made, drawn as React elements (never an HTML string).
import React from "react";
import type { PartViewProps } from "../types";
import type { MathNode } from "./render";
import type { MathData } from "./scan";

const ATTR_NAME: Record<string, string> = { class: "className", "stroke-width": "strokeWidth", "aria-hidden": "aria-hidden", viewBox: "viewBox", preserveAspectRatio: "preserveAspectRatio" };
function styleObj(s: string): React.CSSProperties {
  const o: Record<string, string> = {};
  for (const d of s.split(";")) { const k = d.indexOf(":"); if (k < 0) continue; const p = d.slice(0, k).trim(), v = d.slice(k + 1).trim(); if (p) o[p.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v; }
  return o as React.CSSProperties;
}
/** One node of the tree (and everything under it) as React elements. */
export function MathTree({ tree }: { tree: MathNode | string }): React.ReactElement | string {
  if (typeof tree === "string") return tree;
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(tree.a ?? {})) props[k === "style" ? "style" : ATTR_NAME[k] ?? k] = k === "style" ? styleObj(v) : v;
  return React.createElement(tree.t, props, ...tree.c.map((c, i) => (typeof c === "string" ? c : <MathTree key={i} tree={c} />)));
}
/** A formula: drawn, or (KaTeX could not read it) its TeX in a code box with the reason. */
export function MathFormula({ data, tag }: { data: MathData; tag?: "span" | "div" }) {
  // `tag`: a display formula inside a paragraph is a block-level span (a div may not sit in a p)
  const Tag = tag ?? (data.display ? "div" : "span");
  if (!data.tree) return <Tag className={`math math-fail ${data.display ? "math-block" : "math-inline"}`} title={data.error} data-dh-slot="math-fail"><code>{data.tex}</code></Tag>;
  return <Tag className={`math ${data.display ? "math-block" : "math-inline"}`} data-dh-slot={data.display ? "math-block" : "math-inline"} role="math" aria-label={data.tex}><MathTree tree={data.tree} /></Tag>;
}

export default function MathView({ data }: PartViewProps<MathData>) { return <MathFormula data={data} />; }
