// The diagrams that compile to the animation engine, by the name of their fence (SPEC 3.2).
import { stateDiagram } from "./state";
import { classDiagram } from "./class";
import { erDiagram } from "./er";
import type { Diagram, DiagramIn, DiagramName } from "./diagram";

const BY: Record<string, (p: DiagramIn) => Diagram> = { state: stateDiagram, class: classDiagram, er: erDiagram };
export const DIAGRAMS = Object.keys(BY) as DiagramName[];
export const isDiagram = (name: string): name is DiagramName => name in BY && Object.prototype.hasOwnProperty.call(BY, name);

type Part = { name: string; attrs: Record<string, string>; head: string; bodyLine: number; steps: { title: string; raw: string; line: number }[] };
// once per part: the LLM view, doccheck and the build all ask, and the budget is charged for the work once
const DONE = new WeakMap<Part, Diagram>();
export function diagramOf(p: Part): Diagram {
  let d = DONE.get(p);
  if (!d) DONE.set(p, (d = BY[p.name](p as DiagramIn)));
  return d;
}
