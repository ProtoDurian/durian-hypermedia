// Lane core: reading the ids a fact names (ENGINE.md 2.2: ranges `p1..p6`, lists, globs `p*`, parts `returns.Jul..Dec`).
// The parser may already expand them; core expands again so a hand-built Model reads the same. Unknown ids are kept
// as written (check names them, with the nearest known one).
import type { Id, Model } from "../types";

/** a chart's part (`returns.Jul..Dec`, `returns.Jul`): the thing it belongs to, else null */
export function partOf(model: Model, id: Id): Id | null {
  if (model.things[id]) return null;
  const dot = id.indexOf(".");
  if (dot <= 0 || id[dot + 1] === ".") return null; // `q1..q4` is a range, not a part of q1
  const base = id.slice(0, dot);
  return model.things[base] ? base : null;
}

/** the thing an id names for state and the camera: itself, or the thing a part belongs to */
export const baseOf = (model: Model, id: Id): Id => partOf(model, id) ?? id;

const NUM = /^(.*?)(\d+)$/;

/** expand ranges and globs over the model's things (and relations, for `show`/`hide`); parts stay as written */
export function expand(model: Model, ids: Id[]): Id[] {
  const out: Id[] = [];
  const push = (x: Id) => { if (!out.includes(x)) out.push(x); };
  for (const raw of ids) {
    const id = raw.trim();
    if (!id) continue;
    if (model.things[id] || model.relations[id] || partOf(model, id)) { push(id); continue; }
    if (id.includes("*")) {
      const re = new RegExp(`^${id.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
      const hit = model.order.filter((t) => re.test(t));
      if (hit.length) { hit.forEach(push); continue; }
      push(id); continue;
    }
    const r = id.split("..");
    if (r.length === 2 && r[0] && r[1]) {
      const [a, b] = r;
      const ma = NUM.exec(a), mb = NUM.exec(b);
      if (ma && mb && (mb[1] === "" || mb[1] === ma[1])) {
        const lo = Number(ma[2]), hi = Number(mb[2]);
        if (hi >= lo && hi - lo <= 500) { for (let n = lo; n <= hi; n++) push(`${ma[1]}${n}`); continue; }
      }
      const i = model.order.indexOf(a), j = model.order.indexOf(b);
      if (i >= 0 && j >= i) { model.order.slice(i, j + 1).forEach(push); continue; }
    }
    push(id);
  }
  return out;
}

/** a chart's part range as one id per category: `returns.Jul..Dec` -> returns.Jul, returns.Aug, ... (by its `x:`);
 *  anything else stays as written */
export function expandParts(model: Model, ids: Id[]): Id[] {
  const out: Id[] = [];
  for (const id of ids) {
    const base = partOf(model, id);
    const x = base ? model.things[base].chart?.x ?? [] : [];
    const part = base ? id.slice(base.length + 1) : "";
    const r = part.split("..");
    if (base && x.length && r.length === 2) {
      const i = x.indexOf(r[0]), j = x.indexOf(r[1]);
      if (i >= 0 && j >= i) { for (const c of x.slice(i, j + 1)) out.push(`${base}.${c}`); continue; }
    }
    out.push(id);
  }
  return out;
}

/** edit distance, for "did you mean" */
export function distance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** the known names nearest to an unknown one (same letters but case, a prefix, or at most a third of it changed) */
export function nearest(id: Id, known: Id[], max = 3): Id[] {
  const low = id.toLowerCase();
  const scored = known
    .map((k) => {
      const kl = k.toLowerCase();
      const d = kl === low ? 0 : kl.startsWith(low + ".") || kl.startsWith(low) || low.startsWith(kl) ? 1 : distance(low, kl);
      return { k, d };
    })
    .filter((x) => x.d <= Math.max(1, Math.floor(id.length / 3)))
    .sort((x, y) => x.d - y.d || known.indexOf(x.k) - known.indexOf(y.k));
  return scored.slice(0, max).map((x) => x.k);
}

/** does `id` sit inside `anc` (by the containers in `parentOf`), at any depth */
export function within(parentOf: (id: Id) => Id | null, id: Id, anc: Id): boolean {
  let p = parentOf(id);
  for (let n = 0; p && n < 256; n++) { if (p === anc) return true; p = parentOf(p); }
  return false;
}
