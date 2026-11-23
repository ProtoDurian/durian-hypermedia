// What the state, class and ER parts share (SPEC 3.2). Each part's own small language is the source:
// doccheck and the LLM view read it, and it compiles to an animation scene (src/core/scene.ts), so the three parts have the
// engine's layout, line router, stage and checks. Pure.
import { compileScene, type SceneError } from "./scene";
import { animOverMessage, animPartBudget, metered, work } from "./work";
import { BudgetError } from "./budget";
import { unclosedTick } from "./inline";


export type DiagramName = "state" | "class" | "er";
export interface DiagramSrc { head: string; steps: { title: string; raw: string; line: number }[]; base: number; info: Record<string, string>; part: DiagramName; title: string }
// shape: what a translation must keep; texts: what a translation may change
export interface Diagram { src: DiagramSrc; errors: SceneError[]; warnings: SceneError[]; llm: string; shape: string; texts: string[]; code: string[] }
export interface DiagramIn { name: DiagramName; attrs: Record<string, string>; head: string; bodyLine: number; steps: { title: string; raw: string; line: number }[] }
export interface Line { text: string; indent: boolean; line: number; step: number } // step: -1 before the first @step

export const DIAGRAM_LIMITS = { things: 60, lines: 120, steps: 40, chars: 300, source: 1500 };
export const COLOURS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "acc", "good", "warn", "bad", "muted"];
export const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const INFO = ["id", "title", "dir", "static", "zoom"];

export function linesOf(p: DiagramIn): Line[] {
  const out: Line[] = [];
  const read = (raw: string, first: number, step: number) => raw.split("\n").forEach((l, k) => {
    if (!l.trim() || l.trim().startsWith("//")) return;
    out.push({ text: l.trim(), indent: /^\s/.test(l), line: first + k, step });
  });
  read(p.head, p.bodyLine, -1);
  p.steps.forEach((s, k) => read(s.raw, s.line + 1, k));
  return out;
}

// the words at the end of a declaration: "label", note="...", [colour]
export interface Tail { label: string | null; note: string; colour: string; rest: string }
export function tailOf(text: string, what: string): Tail {
  let label: string | null = null, note = "", colour = "", rest = "";
  const re = /note="([^"]*)"|"([^"]*)"|\[([A-Za-z0-9#_-]+)\](?=\s|$)|([A-Za-z_][\w-]*)=("[^"]*"|\S+)|(\S+)/g;
  for (const m of text.matchAll(re)) {
    if (m[1] !== undefined) note = m[1];
    else if (m[2] !== undefined) { if (label != null) throw new Error(`${what} has two labels`); label = m[2]; }
    else if (m[3]) { if (!COLOURS.includes(m[3])) throw new Error(`${what}: "${m[3]}" is not a colour word (${COLOURS.join(", ")}); never a hex value`); colour = m[3]; }
    else if (m[4]) throw new Error(`${what} takes note="..." only, not ${m[4]}=`);
    else rest += (rest ? " " : "") + m[6];
  }
  return { label, note, colour, rest };
}

// a word in a scene line's quotes (a double quote inside would end it)
const CLOSE_QUOTE = String.fromCharCode(0x201d);
export const q = (s: string) => `"${s.replace(/"/g, CLOSE_QUOTE)}"`;
export const FAMILY = COLOURS.filter((c) => /^c\d$/.test(c));
export const toneOf = (colour: string) => (!colour || FAMILY.includes(colour) ? "plain" : colour === "bad" ? "hot" : colour);
export const colourWords = (colour: string) => (!colour ? "" : FAMILY.includes(colour) ? ` is=${colour}` : ` tone=${toneOf(colour)}`);

// the scene a part stands for, and which line of the author's each scene line came from
export class Out {
  private head: { text: string; line: number }[] = [];
  private body: { text: string; line: number }[][];
  private colours = new Set<string>();
  constructor(private p: DiagramIn) { this.body = p.steps.map(() => []); }
  add(text: string, line: number, step = -1) { (step < 0 ? this.head : this.body[step]).push({ text, line }); }
  decl(text: string, line: number, step = -1) { this.add(step < 0 ? text : `add ${text}`, line, step); }
  use(colour: string) { if (FAMILY.includes(colour)) this.colours.add(colour); return colourWords(colour); }
  scene(info: Record<string, string>): { src: DiagramSrc; lineOf: (n: number) => number } {
    const top = this.p.bodyLine - 1, at: number[] = [top];
    // a colour keeps its number, whichever are used
    const last = Math.max(-1, ...[...this.colours].map((c) => FAMILY.indexOf(c)));
    const head = [...FAMILY.slice(0, last + 1).map((c) => ({ text: `family ${c}`, line: top })), ...this.head];
    for (const h of head) at.push(h.line);
    const steps = this.p.steps.map((s, k) => {
      const line = at.length;
      at.push(s.line);
      for (const b of this.body[k]) at.push(b.line);
      return { title: s.title, raw: this.body[k].map((b) => b.text).join("\n"), line };
    });
    return { src: { head: head.map((h) => h.text).join("\n"), steps, base: 1, info, part: this.p.name, title: this.p.attrs.title ?? "" }, lineOf: (n) => at[n] ?? top };
  }
}

// the checks every part has, then the part's own work, then the engine's
function buildIn(p: DiagramIn, info: Record<string, string>, run: (out: Out, err: (line: number, msg: string) => void, warn: (line: number, msg: string) => void, lines: Line[]) => { llm: string; shape: string; texts: string[]; notes: { text: string; line: number }[]; things: number; links: number; rows?: number }): Diagram {
  const errors: SceneError[] = [], warnings: SceneError[] = [], top = p.bodyLine - 1;
  const err = (line: number, msg: string) => { errors.push({ line, msg }); }, warn = (line: number, msg: string) => { warnings.push({ line, msg }); };
  const out = new Out(p), bad = (): Diagram => ({ src: out.scene(info).src, errors, warnings, llm: "", shape: "", texts: [], code: [] });
  try {
    for (const k of Object.keys(p.attrs)) if (!INFO.includes(k)) err(top, `${k}= is not a key of ${p.name} (${INFO.map((x) => (x === "id" ? "#id" : `${x}=`)).join(", ")})`);
    if (p.attrs.zoom) info = { ...info, zoom: p.attrs.zoom };
    if (p.attrs.dir) { if (["right", "down"].includes(p.attrs.dir)) info = { ...info, dir: p.attrs.dir }; else err(top, `dir=${p.attrs.dir}: dir is right or down`); }
    if (p.steps.length > DIAGRAM_LIMITS.steps) { err(p.steps[DIAGRAM_LIMITS.steps].line, `${p.name} has ${p.steps.length} steps; at most ${DIAGRAM_LIMITS.steps}, split the story into two diagrams`); return bad(); }
    for (const s of p.steps) {
      if (!s.title) err(s.line, "@step needs a caption: the sentence a reader sees for this step");
      else if (unclosedTick(s.title)) err(s.line, "this caption has a backtick that is not closed: write `code` with one before and one after");
    }
    const lines = linesOf(p);
    if (lines.length > DIAGRAM_LIMITS.source) { err(lines[DIAGRAM_LIMITS.source].line, `${p.name} has ${lines.length} lines of source; at most ${DIAGRAM_LIMITS.source}, split it into two diagrams`); return bad(); }
    // reading is linear: each line once, against maps of what came before
    work(lines.reduce((n, l) => n + 1 + l.text.length, 0));
    const long = lines.find((l) => l.text.length > DIAGRAM_LIMITS.chars);
    if (long) { err(long.line, `this line has ${long.text.length} characters; at most ${DIAGRAM_LIMITS.chars}, put the rest in a note`); return bad(); }
    const r = run(out, err, warn, lines);
    if (r.things > DIAGRAM_LIMITS.things) err(top, `${p.name} has ${r.things} boxes; at most ${DIAGRAM_LIMITS.things}, show the part this page talks about and split the rest into a second diagram`);
    if (r.links > DIAGRAM_LIMITS.lines) err(top, `${p.name} has ${r.links} lines between boxes; at most ${DIAGRAM_LIMITS.lines}, split it into two diagrams`);
    if (!r.things && !errors.length) err(top, `${p.name} is empty: nothing to draw`);
    for (const n of r.notes) if (unclosedTick(n.text)) err(n.line, "this note has a backtick that is not closed: write `code` with one before and one after");
    const { src, lineOf } = out.scene(info);
    if (!errors.length) {
      const c = compileScene(src.head, src.steps, src.base, src.info);
      for (const e of c.errors) err(lineOf(e.line), e.msg);
      for (const w of c.warnings) warn(lineOf(w.line), w.msg);
    }
    return { src, errors, warnings, llm: r.llm, shape: r.shape, texts: [p.attrs.title ?? "", ...p.steps.map((s) => s.title), ...r.texts].filter(Boolean), code: [...p.steps.map((s) => s.title), ...r.notes.map((n) => n.text)] };
  } catch (e) {
    // a spent budget is a refusal of this part, and its plain source is shown; nothing carries on
    if (!(e instanceof BudgetError)) throw e;
    err(top, (animOverMessage(e) ?? e.message).replace(/animations/g, "drawings").replace(/animation/g, "drawing"));
    return bad();
  }
}

export const cell = (s: string) => s.replace(/\|/g, "\\|");
export const sentences = (xs: string[]) => xs.filter(Boolean).join(" ");

// the checks every part has, then the part's own work, then the engine's: reading and layout are one animation work
// budget (core/work.ts), taken from the page's when parse() runs
export function build(p: DiagramIn, info: Record<string, string>, run: Parameters<typeof buildIn>[2]): Diagram {
  try { return metered(animPartBudget(), () => buildIn(p, info, run)); }
  catch (e) {
    if (!(e instanceof BudgetError)) throw e;
    const msg = (animOverMessage(e) ?? e.message).replace(/animations/g, "drawings").replace(/animation/g, "drawing");
    return { src: new Out(p).scene(info).src, errors: [{ line: p.bodyLine - 1, msg }], warnings: [], llm: "", shape: "", texts: [], code: [] };
  }
}
