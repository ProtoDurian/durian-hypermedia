// Hand scans for the diagram fences, each linear in the line (SPEC 3.2): where a regular expression would
// look again from every place in a long run.
const space = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);

// a line's last "label", when a space is before it
export function endLabel(s: string): { body: string; label: string } {
  const none = { body: s, label: "" };
  if (s.length < 3 || !s.endsWith('"')) return none;
  const open = s.lastIndexOf('"', s.length - 2);
  if (open < 1 || !space(s[open - 1])) return none;
  let from = open;
  while (space(s[from - 1])) from--;
  return { body: s.slice(0, from), label: s.slice(open + 1, -1) };
}

// "Line []" is "Line[]": no space before a bracket that closes the text
export function joinBrackets(s: string): string {
  if (!s.endsWith("]")) return s;
  for (let i = Math.max(1, s.lastIndexOf("]", s.length - 2) + 1); i < s.length; i++) {
    if (s[i] !== "[" || !space(s[i - 1])) continue;
    let from = i;
    while (space(s[from - 1])) from--;
    return s.slice(0, from) + s.slice(i);
  }
  return s;
}

// <left> <mark> <right>: the left is one word, the right what `right` (anchored) reads. Only three places can hold the
// mark: the first in the word, the word's end, after the word.
export function around(s: string, mark: string, right: RegExp): { left: string; right: RegExpMatchArray } | null {
  let end = 0;
  while (end < s.length && !space(s[end])) end++;
  if (!end) return null;
  let next = end;
  while (space(s[next])) next++;
  const word = s.slice(0, end), places: [number, number][] = [], first = word.indexOf(mark, 1);
  if (first > 0) places.push([first, first]);
  if (end - mark.length > 0 && word.endsWith(mark)) places.push([end - mark.length, end - mark.length]);
  if (s.startsWith(mark, next)) places.push([end, next]);
  for (const [to, at] of places) {
    let from = at + mark.length;
    while (space(s[from])) from++;
    const m = s.slice(from).match(right);
    if (m) return { left: s.slice(0, to), right: m };
  }
  return null;
}

// a column's words: "two words", ->, or a word with the brackets that follow it, numeric(10, 2)
export function columnWords(s: string): string[] {
  const out: string[] = [];
  let closes = true;
  for (let i = 0; i < s.length;) {
    if (space(s[i]) || s[i] === "(") { i++; continue; }
    if (s.startsWith("->", i)) { out.push("->"); i += 2; continue; }
    if (s[i] === '"') {
      const close = s.indexOf('"', i + 1);
      if (close >= 0) { out.push(s.slice(i + 1, close)); i = close + 1; continue; }
    }
    let j = i;
    while (j < s.length && !space(s[j]) && s[j] !== "(" && !s.startsWith("->", j)) j++;
    if (s[j] === "(" && closes) {
      const close = s.indexOf(")", j);
      if (close < 0) closes = false; else j = close + 1;
    }
    out.push(s.slice(i, j));
    i = j;
  }
  return out;
}
