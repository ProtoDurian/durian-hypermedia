// The animation part (```animation): one engine for every scene, 2D (SVG) and 3D (three.js, loaded only when opened).
// A composed stage (0.7.0: lanes, cards, panels, a time block; every animation unless its fence asks for the graph
// engine) carries `block.stage` and is drawn by the stage instead.
import React from "react";
import { Animation } from "../ui/anim";
import { Stage } from "../ui/stage";
import { useDh } from "./context";
import { staticOfAttr } from "../parts/react";
import type { AnimationBlock } from "../types";
import { ENGINE_DEFAULT, tryEngine } from "../engine/bridge";
import { EngineStage } from "../engine/render/svg";
export function AnimationPart({ block }: { block: AnimationBlock }) {
  const { ui, static: docStatic, engine } = useDh();
  // the one engine (src/engine): "new" always, "auto" where it draws this block, and a format 12 page always
  const mode = block.engine?.format12 ? "new" : engine ?? ENGINE_DEFAULT;
  if (mode !== "old") {
    const t = tryEngine(block);
    const fence = staticOfAttr(block.attrs?.static);
    if (t.c) return <EngineStage compiled={t.c} ui={ui} srText={block.llm ?? undefined} static={fence !== undefined ? fence : docStatic} />;
    if (mode === "new") return <div className="dh-error" role="alert">{t.err}</div>;
  }
  if (block.stage) {
    const fence = staticOfAttr(block.attrs?.static);
    return <Stage src={block.stage.src} roles={block.stage.roles} ui={ui} srText={block.llm ?? undefined} static={fence !== undefined ? fence : docStatic} />;
  }
  // static (SPEC 4.1): the fence's own word wins, else the page's or the host's (one state, drawn whole and flat)
  const fence = staticOfAttr(block.attrs?.static);
  return <Animation src={block.anim} srText={block.llm} ui={ui} static={fence !== undefined ? fence : docStatic} />;
}
export default AnimationPart;
