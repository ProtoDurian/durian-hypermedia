// The animation part (```animation): one engine for every scene, 2D (SVG) and 3D (three.js, loaded only when opened).
import React from "react";
import { Animation } from "../ui/anim";
import { useDh } from "./context";
import type { AnimationBlock } from "../types";
export function AnimationPart({ block }: { block: AnimationBlock }) {
  const { ui } = useDh();
  return <Animation src={block.anim} srText={block.llm} ui={ui} />;
}
export default AnimationPart;
