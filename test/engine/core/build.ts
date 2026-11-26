// Test helper for lane core: builds a Model by hand from a small format-12 text, so core can be tested before the
// parse lane lands. It reads only what the core tests need (thing lines, indent, `##`, `layout:`, relations, facts,
// `@step`); it is not the parser (src/engine/parse/parse12.ts).
import { LAYOUTS, SHAPES, type Fact, type Id, type LayoutName, type Model, type Relation, type Shape, type Step, type Thing, type Tone, type ChartKind } from "../../../src/engine/types";

const RESERVED = new Set("title layout show hide at in is text tone dim clear light say note foot split merge drop focus zoom lift put enter leave layers then pace all plain off from into".split(" "));
const ids = (s: string): Id[] => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

export function build(text: string, opts: { view?: Model["view"]; fence?: Record<string, string>; origin?: Model["origin"] } = {}): Model {
  const m: Model = {
    format: 12, origin: opts.origin ?? "format12", title: null, note: null, look: "stage", view: opts.view ?? "2d", layout: "graph",
    roles: {}, regions: [], things: {}, order: [], relations: {}, setup: [], steps: [], scenes: {}, fence: opts.fence ?? {}, layoutWords: {}, problems: [],
  };
  let layoutSet = false;
  const stack: { indent: number; id: Id }[] = [];
  const kids = new Map<Id, number>();
  let region: Id | null = null;
  let step: Step | null = null;
  let lastThing: Thing | null = null;
  const lines = text.replace(/^\n/, "").split("\n");
  lines.forEach((raw, i) => {
    const line = i + 1;
    const src = { line };
    if (!raw.trim()) return;
    const indent = raw.length - raw.trimStart().length;
    const t = raw.trim();
    const st = /^@step\s+([^:]*?)(?::\s*(.*))?$/.exec(t);
    if (st) { step = { title: st[1].trim(), caption: (st[2] ?? "").trim(), facts: [], src }; m.steps.push(step); return; }
    const out = step ? (step as Step).facts : m.setup;
    if (!step) {
      if (t.startsWith("title:")) { const [a, b] = t.slice(6).split("|"); m.title = a.trim(); m.note = b?.trim() ?? null; return; }
      if (t.startsWith("layout:")) { m.layout = t.slice(7).trim() as LayoutName; layoutSet = true; return; }
      if (t.startsWith("## ")) { const title = t.slice(3).trim(); region = title.toLowerCase().replace(/[^a-z0-9]+/g, "-"); m.regions.push({ id: region, title, flags: [], src }); stack.length = 0; return; }
      if (t.startsWith("x:") && lastThing?.chart) { lastThing.chart.x = t.slice(2).split(",").map((s) => s.trim()); return; }
      const th = /^([\w-]+) ([\w.-]+)(?: \[([^\]]*)\])?(?::\s*(.*))?$/.exec(t);
      if (th && !RESERVED.has(th[2]) && (th[1] === "plain" || th[3] !== undefined || !RESERVED.has(th[1])) && (th[3] !== undefined || th[4] !== undefined) && !/^(->|-x|~>|-->|--|<->)/.test(th[2])) {
        while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
        const parent = stack.length ? stack[stack.length - 1].id : null;
        const flags = th[3] ? th[3].split(/\s+/).filter(Boolean) : [];
        const shape = (flags.find((f) => (SHAPES as readonly string[]).includes(f)) ?? "box") as Shape;
        const layout = (flags.find((f) => (LAYOUTS as readonly string[]).includes(f)) ?? null) as LayoutName | null;
        const body = th[4] ?? "";
        const [title, ...rest] = body.split("|").map((s) => s.trim());
        const ci = flags.indexOf("chart");
        const chart = ci >= 0 ? { kind: flags[ci + 1] as ChartKind, title, unit: rest[0] ?? null, x: [], series: [{ name: title, role: null, values: [] as number[] }], flags: flags.slice(ci + 2), opts: {} } : null;
        const data = layout && ["array", "list", "stack", "queue", "map"].includes(layout);
        const thing: Thing = {
          id: th[2], role: th[1] === "plain" ? null : th[1], title: data ? th[2] : title, lines: data ? [] : rest, flags, shape, layout,
          container: !!layout, parent, region, order: parent ? kids.get(parent) ?? 0 : m.order.filter((x) => !m.things[x].parent).length,
          values: data ? body.split(/\s+/).filter(Boolean) : null, keys: {}, chart, src,
        };
        if (parent) { kids.set(parent, (kids.get(parent) ?? 0) + 1); m.things[parent].container = true; }
        m.things[thing.id] = thing; m.order.push(thing.id); lastThing = thing;
        stack.push({ indent, id: thing.id });
        return;
      }
    }
    const f = fact(m, t, src, !step);
    if (f) out.push(...f);
    else m.problems.push({ line, msg: `test build: cannot read "${t}"` });
  });
  if (!layoutSet) m.layout = m.regions.length ? "lanes" : "graph";
  return m;
}

function relation(m: Model, from: Id, to: Id, style: Relation["style"], label: string | null, role: string | null, setup: boolean, line: number): Relation {
  const id = `${from}->${to}`;
  const r = m.relations[id] ?? (m.relations[id] = { id, from, to, style, label: setup ? label : null, role, setup, src: { line } });
  return r;
}

function fact(m: Model, t: string, src: { line: number }, setup: boolean): Fact[] | null {
  let x: RegExpExecArray | null;
  if ((x = /^(show|hide) (.+)$/.exec(t))) return [{ k: x[1] as "show", ids: ids(x[2]), src }];
  if (t === "clear") return [{ k: "clear", src }];
  if (t === "then") return [{ k: "then", src }];
  if ((x = /^pace (slow|normal|fast)$/.exec(t))) return [{ k: "pace", pace: x[1] as "slow", src }];
  if ((x = /^focus (\S+)$/.exec(t))) return [{ k: "focus", target: x[1], src }];
  if ((x = /^zoom into (.+)$/.exec(t))) return [{ k: "zoom", into: ids(x[1]), src }];
  if ((x = /^zoom out( all)?$/.exec(t))) return [{ k: "zoom", into: null, ...(x[1] ? { all: true } : {}), src }];
  if ((x = /^lift (.+)$/.exec(t))) return [{ k: "lift", ids: ids(x[1]), src }];
  if ((x = /^put back ?(.*)$/.exec(t))) return [{ k: "putback", ids: ids(x[1]), src }];
  if ((x = /^layers (apart|together)$/.exec(t))) return [{ k: "layers", apart: x[1] === "apart", src }];
  if ((x = /^light ([^:]+)(?::\s*(.*))?$/.exec(t))) return [{ k: "light", ids: ids(x[1]), ...(x[2] ? { note: x[2] } : {}), src }];
  if ((x = /^say (\S+)(?: (above|below|left|right))?(?: \((\w+)\))?:\s*(.*)$/.exec(t))) return [{ k: "say", id: x[1], words: x[4], ...(x[2] ? { side: x[2] as "above" } : {}), ...(x[3] ? { role: x[3] } : {}), src }];
  if ((x = /^(note|foot):\s*(.*)$/.exec(t))) return [{ k: x[1] as "note", words: x[2], src }];
  if ((x = /^text (\S+):\s*(.*)$/.exec(t))) return [{ k: "text", id: x[1], lines: x[2].split("|").map((s) => s.trim()), src }];
  if ((x = /^tone (\S+) (good|bad|warn|accent|off)$/.exec(t))) return [{ k: "tone", ids: ids(x[1]), tone: x[2] as Tone, src }];
  if ((x = /^dim (\S+)( off)?$/.exec(t))) return [{ k: "dim", ids: ids(x[1]), on: !x[2], src }];
  if ((x = /^split (\S+) into (.+)$/.exec(t))) return [{ k: "split", id: x[1], into: ids(x[2]), labels: ids(x[2]), src }];
  if ((x = /^merge (\S+) into (\S+)$/.exec(t))) return [{ k: "merge", ids: ids(x[1]), into: x[2], src }];
  if ((x = /^drop (\S+)(?: at (\S+))?$/.exec(t))) return [{ k: "drop", ids: ids(x[1]), ...(x[2] ? { at: x[2] } : {}), src }];
  if ((x = /^(\S+) at (\S+)$/.exec(t))) return [{ k: "at", ids: ids(x[1]), place: x[2], src }];
  if ((x = /^(\S+) in (\S+)(?: (left|right))?$/.exec(t))) return [{ k: "in", ids: ids(x[1]), place: x[2], ...(x[3] ? { side: x[3] as "left" } : {}), src }];
  if ((x = /^(\S+) is (.+)$/.exec(t))) return [{ k: "is", ids: ids(x[1]), words: x[2].trim() === "-" ? null : x[2].trim(), src }];
  if ((x = /^([\w.-]+?)(?:\.(\d+))? = (.+?)(?: from (\S+))?$/.exec(t))) return [{ k: "values", id: x[1], values: x[3].split(/\s+/), from: x[4] ? ids(x[4]) : [], ...(x[2] ? { series: Number(x[2]) } : {}), src }];
  if ((x = /^([\w.,\s-]+?) (->|-->|--|<->|-x|~>) ([\w.,\s-]+?)(?: \((\w+)\))?(?::\s*(.*))?$/.exec(t))) {
    const op = x[2];
    const style: Relation["style"] = op === "-->" ? "dashed" : op === "--" ? "line" : op === "<->" ? "both" : "arrow";
    const out: Fact[] = [];
    for (const a of ids(x[1])) for (const b of ids(x[3])) {
      const r = relation(m, a, b, style, x[5] ?? null, x[4] ?? null, setup, src.line);
      if (!setup) out.push({ k: "rel", rel: r.id, words: x[5] ?? null, style: op === "-x" ? "lost" : op === "~>" ? "stream" : style, role: x[4] ?? null, src });
    }
    return out;
  }
  return null;
}
