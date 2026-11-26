// What an LLM reads in place of one of these charts: a header, notes where the chart needs one, and the numbers as a table.
import type { ChartSpec } from "../../types";
import { readXy } from "./model";
import { fullText } from "../axis";

const plain = (v: number): string => (Number.isFinite(v) ? String(+v.toFixed(4)) : "");
export function xyLlm(spec: ChartSpec, values: number[][]): string[] {
  const m = readXy(spec, values);
  const out: string[] = [];
  const f = (v: number, ax: "y" | "y2" | "x" = "y") => (Number.isFinite(v) ? fullText(v, m.ax[ax].format, m.ax[ax].currency) : "");
  const kinds = [...new Set(m.sers.map((s) => s.kind))];
  out.push(`Chart (${m.stacked === "percent" ? "100% stacked " : m.stacked ? "stacked " : ""}${m.kind === "bar" || m.kind === "line" || m.kind === "area" ? kinds.join(" + ") : m.kind})${spec.title ? `: ${spec.title}` : ""}`);
  const notes: string[] = [];
  if (m.horizontal) notes.push("The bars run horizontally.");
  if (m.hasY2) notes.push(`Right axis (y2${m.ax.y2.label ? `: ${m.ax.y2.label}` : ""}): ${m.sers.filter((s) => s.axis === "y2").map((s) => s.name).join(", ")}.`);
  const logs = (["x", "y", "y2"] as const).filter((a) => m.ax[a].log);
  if (logs.length) notes.push(`Log scale on ${logs.join(" and ")}.`);
  if (m.kind === "candlestick") notes.push("Each row is one candle: open, highest, lowest and close; up means the close is at or above the open.");
  if (m.kind === "bubble") notes.push("Size is the size of the bubble.");
  if (m.stacked === "percent") notes.push("Each bar or area is scaled to 100%; the cells hold the real values.");
  if (m.sers.some((s) => s.lo)) notes.push(`A cell "a to b" is a floating bar from a to b.`);
  if (notes.length) out.push("", notes.join(" "));
  out.push("");
  const table = (cols: string[], rows: string[][]) => { out.push(`| ${cols.join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)); };
  if (m.kind === "scatter" || m.kind === "bubble") {
    table(["series", m.ax.x.label || "x", m.ax.y.label || "y", ...(m.kind === "bubble" ? ["size"] : [])], m.sers.flatMap((s) => (s.pts ?? []).map((p) => [s.name, f(p.x, "x"), f(p.y), ...(m.kind === "bubble" ? [plain(p.r ?? NaN)] : [])])));
  } else if (m.kind === "heatmap") {
    table([m.ax.y.label && m.ax.x.label ? `${m.ax.y.label} \\ ${m.ax.x.label}` : m.ax.y.label || m.ax.x.label || "", ...m.x], m.sers.map((s) => [s.name, ...m.x.map((_, j) => f(s.y[j]))]));
  } else if (m.kind === "candlestick") {
    const c = m.sers.find((s) => s.kind === "candles"), lines = m.sers.filter((s) => s.kind === "line");
    table([m.ax.x.label || "period", "open", "high", "low", "close", ...lines.map((s) => s.name)], m.x.map((x, i) => [x, ...[0, 1, 2, 3].map((k) => f(c?.candles?.[i]?.[k] ?? NaN)), ...lines.map((s) => f(s.y[i], s.axis))]));
  } else {
    table([m.ax.x.label || "", ...m.sers.map((s) => s.name)], m.x.map((x, i) => [x, ...m.sers.map((s) => (s.lo ? `${f(s.lo[i], s.axis)} to ${f(s.y[i], s.axis)}` : f(s.y[i], s.axis)))]));
  }
  for (const a of m.anns) out.push("", `- ${a.when || ""} ${a.label} (${a.kind === "threshold" ? (a.goal ? "goal" : "threshold") : a.kind})${a.text ? `: ${a.text}` : ""}`.replace("-  ", "- "));
  return out;
}
