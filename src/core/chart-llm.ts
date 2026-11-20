// Synced from the Durian Hypermedia sources by scripts/sync.ts: edit the source, not this copy.
// chart-llm: what an LLM reads in place of a chart with fixed data: a header line, a short note when the chart
// needs one (mixed, second axis, log scale, floating bars, 100% stacked, bubble size), and the data as a table.
import { evalChart, chartMeta } from "./chart";

const cell = (v: any): string => (Array.isArray(v) ? (v.length === 2 && v.every((n) => typeof n === "number") ? `${v[0]} to ${v[1]}` : v.join(", ")) : String(v ?? ""));
const list = (xs: string[]) => xs.join(", ");

// returns null when the chart cannot be drawn (the caller then gives its source)
export function chartTable(d: any): string | null {
  const r = evalChart(d);
  if (r.error) return null;
  const m = chartMeta(d);
  const kinds = [...new Set(r.series.map((s) => s.kind ?? d.kind))];
  const mixedName = m.mixed ? kinds.join(" + ") : d.kind;
  const head = `Chart (${m.stacked === "percent" ? "100% stacked " : m.stacked ? "stacked " : ""}${mixedName}${d.title ? `): ${d.title}` : ")"}`;
  const notes: string[] = [];
  const names = (f: (s: (typeof r.series)[number]) => boolean) => list(r.series.filter(f).map((s) => s.name));
  const own = (s: (typeof r.series)[number]) => s.kind ?? d.kind;
  if (m.horizontal) notes.push("The bars run horizontally.");
  if (m.mixed) for (const [k, word] of [["bar", "Bars"], ["line", "Lines"], ["area", "Areas"]]) { const these = names((s) => own(s) === k); if (these) notes.push(`${word}: ${these}.`); }
  if (m.y2) {
    const y2 = names((s) => s.axis === "y2");
    notes.push(`Right axis (y2${d.y2?.label ? `: ${d.y2.label}` : ""}): ${y2}. Left axis${d.y?.label ? ` (${d.y.label})` : ""}: ${names((s) => s.axis !== "y2")}.`);
  }
  if (m.stacked === "percent") notes.push("Each bar or area is scaled to 100%; the cells hold the real values.");
  const logs = [m.scale.x === "log" && m.points ? "x" : "", m.scale.y === "log" ? "y" : "", m.scale.y2 === "log" && m.y2 ? "y2" : ""].filter(Boolean);
  if (logs.length) notes.push(`Log scale on ${logs.join(" and ")}.`);
  if (r.series.some((s) => s.data.some((v) => Array.isArray(v)))) notes.push(`A cell "a to b" is a floating bar from a to b.`);
  if (d.kind === "bubble") notes.push("Size is the size of the bubble.");
  const top = notes.length ? `${head}\n\n${notes.join(" ")}` : head;
  if (m.points) {
    const bubble = d.kind === "bubble";
    const xl = (typeof d.x === "object" && !Array.isArray(d.x) && d.x?.label) || "x";
    const rows = r.series.flatMap((s) => s.data.map((pt: any) => `| ${s.name} | ${cell(pt.x)} | ${cell(pt.y)} |${bubble ? ` ${cell(pt.r)} |` : ""}`));
    return `${top}\n\n| series | ${xl} | ${d.y?.label ?? "y"} |${bubble ? " size |" : ""}\n| --- | --- | --- |${bubble ? " --- |" : ""}\n${rows.join("\n")}`;
  }
  const xl = typeof d.x === "object" && !Array.isArray(d.x) ? d.x.label ?? "" : "";
  const first = xl || (m.round ? "part" : d.kind === "radar" ? "axis" : "x");
  const cols = [first, ...r.series.map((s) => s.name)];
  const rows = r.x.map((x, i) => `| ${cell(x)} | ${r.series.map((s) => cell(s.data[i])).join(" | ")} |`);
  return `${top}\n\n| ${cols.join(" | ")} |\n| ${cols.map(() => "---").join(" | ")} |\n${rows.join("\n")}`;
}
