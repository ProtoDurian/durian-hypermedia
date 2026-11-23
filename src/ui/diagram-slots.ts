// The hook names of the engine-drawn diagrams (SPEC 3.2): what a host may restyle, and what a thing is called.
import type { Box } from "../core/scene";

export function slotOf(part: string | undefined, b: Box): string | undefined {
  if (part !== "state") return undefined;
  if (b.kind === "initial") return "start";
  if (b.kind === "final") return "end";
  if (b.kind === "diamond") return b.ent.tone === "acc" ? "current" : "choice";
  if (b.kind === "group") return "group";
  if (b.kind === "box") return b.ent.tone === "acc" ? "current" : "state";
  return undefined;
}
// a line's hooks: the line, the word on it, the words at its ends, its end shapes
export interface LineSlots { line?: string; label?: string; end?: string; mark?: string }
export function lineSlots(part: string | undefined): LineSlots {
  if (part === "state") return { line: "transition", label: "event" };
  if (part === "class") return { line: "relation", label: "relation-label", end: "multiplicity" };
  if (part === "er") return { line: "relation", label: "verb", end: "cardinality", mark: "cardinality" };
  return {};
}
export function wordOf(part: string | undefined, b: Box): string {
  if (part === "state") return { box: "state", diamond: "choice", group: "group of states", initial: "start", final: "end" }[b.kind] ?? b.kind;
  if (part === "class") return b.kind === "field" ? "member" : b.ent.as === "data" ? "record" : b.ent.as ?? "class";
  if (part === "er") return b.kind === "field" ? "column" : "entity";
  return b.kind;
}
