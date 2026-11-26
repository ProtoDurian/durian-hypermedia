// blocks2: the front ends (parse/lower-stage.ts, parse/parse12.ts) call this last, once per model: a scene whose layout is
// one of the head-block layouts gets the Model things (parts) and step facts that decide what its drawing shows at a step.
import type { Model } from "../types";
import { timeParts } from "./time";
import { sheetParts } from "./sheet";
import { gridParts } from "./grid";
import { HOST } from "./parts";
import { PANEL_WORDS } from "./grid/legacy";

/** heads of one family and step panels (the grid's words): the panels are a grid laid out under the heads, a container the head layout hosts */
function hostPanels(model: Model): void {
  if (!["timeline", "sheet", "wrap", "track"].includes(model.layout) || model.things[HOST]) return;
  if (!model.steps.some((s) => s.facts.some((f) => f.k === "layout" && (PANEL_WORDS as readonly string[]).includes(f.word.replace(/^keep /, ""))))) return;
  const line = model.steps[0]?.src.line ?? 0;
  model.things[HOST] = { id: HOST, role: null, title: "", lines: [], flags: ["grid", "part"], shape: "box", layout: "grid", container: true, parent: null, region: null, order: model.order.length, values: null, keys: {}, chart: null, src: { line } };
  model.order.push(HOST);
}

export function blockParts(model: Model): void {
  hostPanels(model);
  const host = model.things[HOST]?.layout === "grid" && model.layout !== "grid" ? HOST : null; // the grid that holds the panels under another layout's heads
  if (host) gridParts(model, host);
  switch (model.layout) {
    case "timeline": timeParts(model); break;
    case "sheet": case "wrap": case "track": sheetParts(model); break;
    case "grid": gridParts(model); break;
    default: break;
  }
}
