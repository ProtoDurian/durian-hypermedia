// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// The composed stage's renamed words. A scene written with an old
// word is told the new one: `"enter" is now "show": say "show t4" instead`. Hand-written string scans only (no regular
// expression on author text); each check looks at one line once.

/** what the scene has declared so far (so a word is only called old where its block is in the scene) */
export type WordScope = { heads: Set<string>; roles: Set<string> };
type Old = { word: string; now: string; where: "step" | "setup" | "under"; block?: string; fix: (t: string) => string | null };

const first = (t: string) => { const k = t.indexOf(" "); return (k < 0 ? t : t.slice(0, k)).replace(/:$/, ""); };
const swap = (t: string, a: string, b: string) => b + t.slice(a.length);
const say = (o: Old, line: string) => `"${o.word}" is now "${o.now}": say "${line}" instead`;

/** step words that come before "keep" (keep at, keep span, keep dot, keep mark, keep fill) */
export const KEEP_WORDS = ["at", "span", "dot", "mark", "fill"];

const OLD: Old[] = [
  // one verb for appear (show) and one for light (light)
  { word: "enter", now: "show", where: "step", block: "matrix", fix: (t) => swap(t, "enter", "show") },
  { word: "spot", now: "light", where: "step", block: "matrix", fix: (t) => swap(t, "spot", "light") },
  { word: "cell", now: "light", where: "step", block: "matrix", fix: (t) => swap(t, "cell", "light") },
  { word: "new", now: "light", where: "step", block: "columns", fix: (t) => swap(t, "new", "light") },
  { word: "bar", now: "light", where: "step", block: "bars", fix: (t) => swap(t, "bar", "light") },
  { word: "head", now: "heading", where: "step", block: "bars", fix: (t) => swap(t, "head", "heading") },
  { word: "ghost", now: "dim", where: "step", fix: (t) => (t.includes(": ") ? null : swap(t, "ghost", "dim")) },
  { word: "dash", now: "dashed", where: "step", fix: (t) => (t.includes(": ") ? null : swap(t, "dash", "dashed")) },
  { word: "chip", now: "mark", where: "step", fix: (t) => { const k = t.indexOf(": "); if (k < 0) return null; const [tone, ...rm] = t.slice(k + 2).split(" | "); return "mark" + t.slice(4, k) + ": " + [tone.trim(), ...rm.map((x) => x.trim())].join(" "); } },
  // time: no glued short codes
  { word: "tmark", now: "keep at", where: "step", fix: (t) => swap(t, "tmark", "keep at") },
  { word: "tspan", now: "keep span", where: "step", fix: (t) => swap(t, "tspan", "keep span") },
  { word: "tdot", now: "dot", where: "step", fix: (t) => swap(t, "tdot", "dot") },
  { word: "tarrow", now: "arrow", where: "step", fix: (t) => swap(t, "tarrow", "arrow") },
  { word: "marker", now: "at", where: "setup", block: "time", fix: (t) => swap(t, "marker", "at") },
  { word: "zoomrow", now: "zoom row", where: "setup", block: "time", fix: (t) => swap(t, "zoomrow", "zoom row") },
  { word: "zoomticks", now: "zoom ticks", where: "setup", block: "time", fix: (t) => swap(t, "zoomticks", "zoom ticks") },
  { word: "ruler", now: "(nothing)", where: "setup", block: "time", fix: (t) => (t.trim() === "ruler: lines" ? "" : null) },
  { word: "rows", now: "spacing", where: "setup", block: "sheet", fix: (t) => (t.trim() === "rows: tall" ? "spacing: roomy" : null) },
  { word: "values", now: "plot", where: "setup", block: "time", fix: (t) => swap(t, "values", "plot") },
  { word: "mark", now: "leaving: darker", where: "under", block: "columns", fix: (t) => (t.trim() === "mark leaving" ? "leaving: darker" : null) },
  // the matrix's columns, the worksheet's labels, the bars' tabs, a bin that comes later
  { word: "band", now: "column", where: "setup", block: "matrix", fix: (t) => swap(t, "band", "column") },
  { word: "cols", now: "labels", where: "setup", block: "sheet", fix: (t) => swap(t, "cols", "labels") },
  { word: "switch", now: "tabs", where: "under", block: "bars", fix: (t) => swap(t, "switch", "tabs") },
];

function message(o: Old, t: string): string {
  if (o.word === "ruler") return `"ruler: lines" is gone: the stage draws what the ruler needs; drop this line`;
  if (o.word === "chip") return `"chip" is now "mark" (the tone, then the words): say "${o.fix(t) ?? "mark id token: bad words"}" instead`;
  const f = o.fix(t);
  return f ? say(o, f) : `"${o.word}" is now "${o.now}"`;
}

/** an old word on this line: the message saying the new one, or null. `where`: a step line, a setup line, or a line
 * indented under the setup line `parent`. */
export function oldWord(t: string, where: "step" | "setup" | "under", scope: WordScope, parent = ""): string | null {
  const w = first(t);
  if (scope.roles.has(w)) return null; // a card line of a role with that name
  for (const o of OLD) {
    if (o.word !== w || o.where !== where) continue;
    if (o.block && !scope.heads.has(o.block)) continue;
    if (where === "under" && first(parent) !== o.block) continue;
    if ((o.word === "ruler" || o.word === "mark" || o.word === "rows") && o.fix(t) === null) continue;
    return message(o, t);
  }
  if (where === "setup" && w === "bin" && scope.heads.has("bins")) {
    const k = t.indexOf(": "), head = k < 0 ? t : t.slice(0, k), f = head.lastIndexOf(" from ");
    if (f > 0 && isNum(head.slice(f + 6))) { const id = idOfBin(head.slice(0, f)); return `a bin that comes later is shown with "show": drop "from ${head.slice(f + 6).trim()}" and write "show ${id}" in step ${head.slice(f + 6).trim()}`; }
  }
  if (where === "step") {
    // bars: "move Fri -> Mon (2), Fri -> Tue (1)" -> "move 2 from Fri to Mon; 1 from Fri to Tue"
    if (w === "move" && scope.heads.has("bars") && t.includes(" -> ")) {
      const fix = t.slice(5).split(",").map((x) => { const k = x.indexOf(" -> "), p = x.lastIndexOf(" ("); if (k < 0) return x.trim(); const a = x.slice(0, k).trim(), b = (p > k ? x.slice(k + 4, p) : x.slice(k + 4)).trim(), n = p > k ? x.slice(p + 2).replace(")", "").trim() : "1"; return `${n} from ${a} to ${b}`; }).join("; ");
      return `"move a -> b (k)" is now "move k from a to b": say "move ${fix}" instead`;
    }
    if (w === "keep") {
      const w2 = first(t.slice(5));
      // "keep a -> b: words" (a connector whose words stay while its line does) is fine
      if (!KEEP_WORDS.includes(w2) && !/ (<-->|<->|-->|->|<--|<-) /.test(t.slice(5))) return `"keep" goes before at, span, dot, mark, fill or a connector: say "keep mark${t.slice(4)}" instead`;
    }
    if (w === "dim" && t.endsWith(" none")) return `"none" is now "off": say "${t.slice(0, -5)} off" instead`;
    if (w === "tone" && t.endsWith(" acc")) return `the tone "acc" is now "accent": say "${t.slice(0, -4)} accent" instead`;
    if (w === "mark" || w === "keep") { const k = t.indexOf(": "); if (k > 0 && first(t.slice(k + 2)) === "acc") return `the tone "acc" is now "accent": say "${t.slice(0, k + 2)}accent${t.slice(k + 5)}" instead`; }
  }
  // bracket words on a time row or mark
  for (const [a, b] of [["[focus]", "[lit]"], ["[idle]", "[dashed]"], ["[acc]", "[accent]"]] as const)
    if (t.includes(a)) return `"${a}" is now "${b}": say "${t.split(a).join(b)}" instead`;
  return null;
}
const isNum = (s: string) => { const x = s.trim(); if (!x) return false; for (const ch of x) if (ch < "0" || ch > "9") return false; return true; };
/** "bin job c \"Odd\"" -> c */
function idOfBin(s: string): string { const ws = s.split(" ").filter(Boolean); return ws[2] ?? ws.at(-1) ?? "id"; }
