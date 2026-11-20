// The terminal part (```terminal, ```console): commands typed at their prompt, output shown whole, one command per step.
import React from "react";
import { Terminal } from "../ui/parts";
import { useDh } from "./context";
import type { TerminalBlock } from "../types";
export function TerminalPart({ block }: { block: TerminalBlock }) {
  const { ui } = useDh();
  return <Terminal steps={block.steps as any} title={block.title} ui={ui} />;
}
export default TerminalPart;
