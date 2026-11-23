// The record entity (SPEC 3.2): a box with a title band and one row per field, as a class or a table needs.
//   record order "Order" as=entity: id: uuid [pk], customer_id: uuid [fk], ---, total(): Money
// Each row is a thing of its own, <id>.<name>, so a line may end on it, a step may highlight it and a note may sit on it.
// "---" starts the next band (a class's methods). A row may start with + - # ~ and end with tags in square brackets.
// Pure: the sizes and the place of every word are worked out here, and the renderer only draws them.
export const RECORD_AS = ["class", "abstract", "interface", "enum", "data", "entity"] as const;
export const FIELD_TAGS = ["pk", "fk", "unique", "null", "static", "abstract"] as const;
export const RECORD_LIMITS = { fields: 60, chars: 200 };
export interface Field { sign: string; name: string; type: string; tags: string[]; band?: true }
type Z = { font: number; head: number; minW: number };
type Measure = (s: string, font: number) => number;
type Wrap = (s: string, font: number, maxW: number) => string[];

const STEREO: Record<string, string> = { interface: "interface", enum: "enum", data: "record" };
const CHIPS: Record<string, string> = { pk: "PK", fk: "FK", unique: "unique", null: "null" };

// split at commas that are not inside quotes or brackets ("Map<K, V>", "pay(a, b)")
export function splitFields(tail: string): string[] {
  const out: string[] = [];
  let cur = "", depth = 0, q = false;
  for (let i = 0; i < tail.length; i++) {
    const ch = tail[i], before = tail[i - 1] ?? "";
    if (ch === '"') { q = !q; continue; }
    if (!q) {
      if ("([{".includes(ch) || (ch === "<" && /\w/.test(before))) depth++;
      else if (depth && (")]}".includes(ch) || (ch === ">" && before !== "=" && before !== "-"))) depth--;
      else if (ch === "," && !depth) { out.push(cur.trim()); cur = ""; continue; }
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

export function parseField(text: string): Field {
  let t = text.trim(), tags: string[] = [];
  const tg = t.match(/\s\[([a-z ,]+)\]$/);
  if (tg) {
    const ws = tg[1].split(/[\s,]+/).filter(Boolean), bad = ws.find((w) => !(FIELD_TAGS as readonly string[]).includes(w));
    if (bad) throw new Error(`"${bad}" is not a field tag (${FIELD_TAGS.join(", ")}): id: uuid [pk]`);
    tags = ws; t = t.slice(0, tg.index).trim();
  }
  let sign = "";
  const s = t.match(/^([+#~-])\s*(?=\S)/);
  if (s) { sign = s[1]; t = t.slice(s[0].length); }
  let depth = 0, at = -1;
  for (let i = 0; i < t.length && at < 0; i++) {
    if ("([{".includes(t[i])) depth++;
    else if (")]}".includes(t[i])) depth--;
    else if (t[i] === ":" && !depth) at = i;
  }
  return { sign, name: (at < 0 ? t : t.slice(0, at)).trim(), type: at < 0 ? "" : t.slice(at + 1).trim(), tags };
}

// the fields after a record's colon, each with its id
export function recordFields(id: string, tail: string | null): { id: string; field: Field }[] {
  const out: { id: string; field: Field }[] = [], seen = new Map<string, number>();
  let band = false;
  for (const raw of tail ? splitFields(tail) : []) {
    if (/^-{3,}$/.test(raw)) { band = true; continue; }
    if (raw.length > RECORD_LIMITS.chars) throw new Error(`record ${id}: a field has ${raw.length} characters; at most ${RECORD_LIMITS.chars}, put the rest in a note`);
    const field = parseField(raw);
    if (!field.name) throw new Error(`record ${id}: a field needs a name: id: uuid (got "${raw}")`);
    if (band) { field.band = true; band = false; }
    const key = field.name.match(/^[A-Za-z0-9_-]+/)?.[0] ?? `f${out.length}`, n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    out.push({ id: `${id}.${key}${n > 1 ? `-${n}` : ""}`, field });
    if (out.length > RECORD_LIMITS.fields) throw new Error(`record ${id} has more than ${RECORD_LIMITS.fields} fields; show the ones this page talks about, and say the rest in a note`);
  }
  return out;
}

export const fieldText = (f: Field) => `${f.sign ? `${f.sign} ` : ""}${f.name}${f.type ? `: ${f.type}` : ""}`;
export const fieldLlm = (f: Field) => `${fieldText(f)}${f.tags.length ? ` ${f.tags.join(" ")}` : ""}`;

// ---------------------------------------------------------------- sizes
// a word on a record: x from the row's left, or (right) from its right edge; y from the row's top, the middle of the line
export interface Word { t: string; x: number; y: number; cls: "sign" | "name" | "type" | "key"; w: number; right?: true }
export interface RowLay { h: number; font: number; words: Word[]; band?: true; method?: true; italic?: true; under?: true }
export interface HeadLay { h: number; w: number; font: number; lines: { t: string; y: number }[]; chip?: { t: string; y: number; w: number } }
export interface RecordLay { w: number; head: HeadLay; rows: RowLay[] }

export const FIELD_MIN = 11;
export const fieldFont = (z: Z) => Math.max(FIELD_MIN, z.font - 1);
const KEY_FONT = 11, KEY_PAD = 4, PX = 10, GAP = 12, WIDE = 400, PHONE = 250;
// mono: every letter is 0.6 of the size; a wide script (CJK) is wider, as the engine measures it
const monoW = (s: string, font: number, textW: Measure) => (/^[\x20-\x7e]*$/.test(s) ? s.length * 0.6 * font : Math.max([...s].length * 0.6 * font, textW(s, font)));

export function recordLayout(title: string, as: string, fields: Field[], z: Z, phone: boolean, textW: Measure, wrap: Wrap): RecordLay {
  const max = phone ? PHONE : WIDE, font = fieldFont(z), lh = Math.round(font * 1.4), hf = Math.max(12, z.font);
  const mw = (s: string, f = font) => monoW(s, f, textW);
  // the wrap measures proportional words: give it the room that the same words take in mono
  const fold = (s: string, f: number, room: number) => (mw(s, f) <= room ? [s] : wrap(s, f, (room * textW(s, f)) / Math.max(1, mw(s, f))));
  const titles = fold(title, hf, max - 2 * PX), stereo = STEREO[as];
  const chipH = stereo ? 19 : 0, hlh = Math.round(hf * 1.35);
  const head: HeadLay = {
    font: hf, h: chipH + titles.length * hlh + 14,
    w: Math.max(...titles.map((t) => mw(t, hf) * 1.03), stereo ? mw(stereo, KEY_FONT) + 12 : 0) + 2 * PX + 4,
    lines: titles.map((t, k) => ({ t, y: 7 + chipH + (k + 0.5) * hlh })),
    ...(stereo ? { chip: { t: stereo, y: 15, w: mw(stereo, KEY_FONT) + 12 } } : {}),
  };
  const signW = fields.some((f) => f.sign) ? mw("+ ") : 0, x0 = PX + signW;
  const keys = fields.map((f) => f.tags.flatMap((t) => (CHIPS[t] ? [{ t: CHIPS[t], w: mw(CHIPS[t], KEY_FONT) + 2 * KEY_PAD }] : [])));
  const keysW = keys.map((ks) => ks.reduce((n, k) => n + k.w + 4, 0));
  // names share one column where name, type and keys fit side by side; a longer row stacks its type under its name
  const side = fields.map((f, k) => x0 + mw(f.name) + (f.type ? GAP + mw(f.type) : 0) + keysW[k] + PX <= max);
  const nameCol = Math.max(0, ...fields.map((f, k) => (side[k] && f.type ? mw(f.name) : 0)));
  let w = Math.max(z.minW + 24, head.w);
  const rows = fields.map((f, k): RowLay => {
    const words: Word[] = [], mid = (n: number) => 4 + (n + 0.5) * lh;
    if (f.sign) words.push({ t: f.sign, x: PX, y: mid(0), cls: "sign", w: mw(f.sign) });
    const room = max - x0 - PX - keysW[k];
    const names = side[k] ? [f.name] : fold(f.name, font, room);
    names.forEach((t, j) => words.push({ t, x: x0, y: mid(j), cls: "name", w: mw(t) }));
    let n = names.length;
    if (f.type) {
      const beside = side[k] && x0 + nameCol + GAP + mw(f.type) + keysW[k] + PX <= max;
      const x = beside ? x0 + nameCol + GAP : side[k] ? x0 + mw(f.name) + GAP : x0 + 8;
      const types = side[k] ? [f.type] : fold(f.type, font, max - x0 - 8 - PX);
      types.forEach((t, j) => words.push({ t, x, y: mid(side[k] ? j : n + j), cls: "type", w: mw(t) }));
      if (!side[k]) n += types.length;
    }
    w = Math.max(w, ...words.map((q) => q.x + q.w + (q.y === mid(0) ? keysW[k] : 0) + PX));
    let right = PX;
    for (const key of [...keys[k]].reverse()) { words.push({ t: key.t, x: right, y: mid(0), cls: "key", w: key.w, right: true }); right += key.w + 4; }
    return { h: Math.max(22, n * lh + 8), font, words, ...(f.band ? { band: true as const } : {}), ...(f.name.includes("(") ? { method: true as const } : {}), ...(f.tags.includes("abstract") ? { italic: true as const } : {}), ...(f.tags.includes("static") ? { under: true as const } : {}) };
  });
  return { w: Math.ceil(w), head, rows };
}
