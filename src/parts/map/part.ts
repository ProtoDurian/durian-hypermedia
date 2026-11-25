import { definePart } from "../types";
import { parseMap, mapLlm, type MapSpec } from "./model";
export default definePart<MapSpec>({
  name: "map", form: "fenced", steps: true, llmKind: "own", dependencies: ["three"],
  parse: (input, ctx) => parseMap(input, ctx.budget, { places:ctx.limits.mapPlaces, shapes:ctx.limits.mapShapes, points:ctx.limits.mapPoints, fills:ctx.limits.mapFills, arcs:ctx.limits.mapArcs }, ctx.limits.mapGeoPoints),
  llm: s => s.errors.length ? `[Map not shown: ${s.errors[0].msg}]` : mapLlm(s),
  check: (s,input) => s.errors.map(e => ({line:e.line || input.line,message:e.msg.replace(/^map:\s*/,"")})),
});
