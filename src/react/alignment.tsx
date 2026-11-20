// The alignment grid part (```alignment): two named axes, cells with labels, items in cells or at points.
import React from "react";
import { Alignment } from "../ui/align";
import { useDh } from "./context";
import type { AlignmentBlock } from "../types";
export function AlignmentPart({ block }: { block: AlignmentBlock }) {
  const { ui } = useDh();
  return <Alignment spec={block.align} ui={ui} />;
}
export default AlignmentPart;
