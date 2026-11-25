// The words the pass 11 chart parts add to the page (buttons, labels). English for every language for now: the rest of the
// page's words are in ui.ts per language; these fall back to English until a translator has read them.
import type { Ui } from "../../ui/ui";
const en = {
  annList: "Show the annotations as a list",
  search: "Search frames", matches: "{n} frames match · {p}% of the time", matchOne: "1 frame matches · {p}% of the time", clear: "Clear", reset: "Reset zoom", zoomed: "Zoomed to", root: "All",
  day: "Day", week: "Week", month: "Month", today: "Today", scale: "Time scale", sankeyHint: "Hover or tap a flow or a node.", flameHint: "Tap a frame to zoom in.",
  tooMuch: "This part needs more work than a page may use, so it is drawn as its source.", cannot: "This part cannot be drawn:",
  waitsFor: "Waits for", progress: "Progress", done: "Done", length: "Length", from: "From", to: "To", inFlow: "In", outFlow: "Out", self: "Self", total: "Total", share: "Share", of: "of",
  milestone: "Milestone", moved: "moved", critical: "On the longest chain", frames: "frames", hintGantt: "↔ Swipe the chart to see all of it", ganttHint: "Hover or tap a bar for its dates.", hintFlame: "↔ Swipe the chart to see all of it",
};
export type W11 = typeof en;
export const W11 = (ui: Ui): W11 => ({ ...en, ...((ui as any).w11 ?? {}) });
