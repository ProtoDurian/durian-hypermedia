// The animation part (```animation): one engine for every scene, 2D (SVG) and 3D (three.js, loaded only when opened).
// A composed stage (0.7.0: lanes, cards, panels, a time block; every animation unless its fence asks for the graph
// engine) carries `block.stage` and is drawn by the stage instead.
import React from "react";
import { Animation } from "../ui/anim";
import { Stage } from "../ui/stage";
import { useDh } from "./context";
import { staticOfAttr } from "../parts/react";
import type { AnimationBlock } from "../types";
export function AnimationPart({ block }: { block: AnimationBlock }) {
  const { ui, static: docStatic } = useDh();
  if (block.stage) {
    const fence = staticOfAttr(block.attrs?.static);
    return <Stage src={block.stage.src} roles={block.stage.roles} ui={ui} srText={block.llm ?? undefined} static={fence !== undefined ? fence : docStatic} />;
  }
  return <Animation src={block.anim} srText={block.llm} ui={ui} />;
}
export default AnimationPart;
