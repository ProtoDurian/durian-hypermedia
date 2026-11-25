// The terminal part (```terminal, ```console): commands typed at their prompt, output shown whole, one command per step.
import React from "react";
import { Terminal } from "../ui/parts";
import { staticOfAttr } from "../parts/react";
import { useDh } from "./context";
import type { TerminalBlock } from "../types";
export function TerminalPart({ block }: { block: TerminalBlock }) {
  // static (SPEC 4.1): the fence's own static= wins, then the page's (front matter static: true) or the host's
  const { ui, static: docStatic } = useDh(), fence = staticOfAttr(block.attrs?.static), stp = fence !== undefined ? fence : docStatic;
  return <Terminal steps={block.steps as any} title={block.title} ui={ui} prefixes={block.prefixes} static={stp} />;
}
export default TerminalPart;
