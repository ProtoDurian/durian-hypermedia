import type { PartInput } from "../types";
import type { Budget } from "../../core/budget";
import { isSpace, type Err } from "../kit/text";
export type Src = PartInput;
export type Issue11 = Err;
export function checkAttrs(src: Src, keys: string[], name: string, errors: Err[], budget: Budget) {
  for (const k of Object.keys(src.attrs)) {
    budget.charge(1 + k.length, 1);
    if (!["title", "id", "llm", "static", ...keys].includes(k)) errors.push({ line: src.line, msg: `${name}: unknown option "${k}" (use ${keys.join(", ")})` });
  }
}
export function bodyLines(body: string, base: number, budget: Budget) {
  budget.charge(1 + Math.ceil(body.length / 16));
  const out: { text: string; line: number }[] = [];
  let line = base;
  for (let a = 0; a <= body.length; line++) {
    let z = body.indexOf("\n", a); if (z < 0) z = body.length;
    budget.charge(2 + z - a, 1, z - a);
    const text = body.slice(a, z).trimEnd();
    if (text.trim() && !text.trimStart().startsWith("//") && !(text.trimStart().startsWith("@step") && (text.trimStart().length === 5 || isSpace(text.trimStart()[5])))) out.push({ text, line });
    a = z + 1; if (z === body.length) break;
  }
  return out;
}
export function numberText(s: string, negative = true) {
  let i = negative && s[0] === "-" ? 1 : 0, n = 0;
  while (i < s.length && s[i] >= "0" && s[i] <= "9") { i++; n++; }
  if (!n) return false;
  if (s[i] === ".") { i++; n = 0; while (i < s.length && s[i] >= "0" && s[i] <= "9") { i++; n++; } if (!n) return false; }
  return i === s.length && Number.isFinite(+s);
}
export function chartLine(text: string): [string, string, string, string, string] | null {
  let i = 0; while (i < text.length && isSpace(text[i])) i++;
  const indent = text.slice(0, i), start = i;
  while (i < text.length && !isSpace(text[i])) i++;
  const a = text.slice(start, i); if (!numberText(a, false) || !isSpace(text[i])) return null;
  while (i < text.length && isSpace(text[i])) i++;
  const e = i; while (i < text.length && !isSpace(text[i])) i++;
  const b = text.slice(e, i); if (!numberText(b, false) || !isSpace(text[i])) return null;
  while (i < text.length && isSpace(text[i])) i++;
  return i < text.length ? [text, indent, a, b, text.slice(i)] : null;
}
export function foldedLine(text: string): [string, string, string] | null {
  const t = text.trim(); let i = t.length - 1;
  while (i >= 0 && !isSpace(t[i])) i--;
  if (i < 0) return null;
  const names = t.slice(0, i).trimEnd(), count = t.slice(i + 1);
  return names && numberText(count) ? [t, names, count] : null;
}
/** Stable UTF-16 lexicographic order using binary radix partitions, bounded by the text length. */
export function textOrder<T>(items: T[], key: (item: T) => string, budget?: Budget): T[] {
  const out: T[] = [], todo = [{ items, at: 0, bit: 15 }];
  while (todo.length) {
    const task = todo.pop()!;
    if (task.items.length < 2) { out.push(...task.items); continue; }
    const end: T[] = [], zero: T[] = [], one: T[] = [];
    for (const item of task.items) {
      budget?.charge(1, 1);
      const s = key(item);
      if (s.length <= task.at) end.push(item);
      else ((s.charCodeAt(task.at) & (1 << task.bit)) ? one : zero).push(item);
    }
    out.push(...end);
    const at = task.bit ? task.at : task.at + 1, bit = task.bit ? task.bit - 1 : 15;
    if (one.length) todo.push({ items: one, at, bit });
    if (zero.length) todo.push({ items: zero, at, bit });
  }
  return out;
}
