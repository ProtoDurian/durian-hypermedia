// The code walk part (```codewalk): one step per code reference, animated within the same code, still between files.
import React, { useMemo } from "react";
import type { HighlightedCode } from "codehike/code";
import { CodeWalk, type WalkStep } from "../ui/parts";
import { packCode, walkRuns, type Packed } from "../ui/codewalk";
import { staticOfAttr } from "../parts/react";
import { useDh, plainCode, linesUpTo } from "./context";
import { Inline } from "./markdown";
import type { CodeWalkBlock } from "../types";
const dedent = (text: string) => { const ls = text.split("\n"); let by = Infinity; for (const l of ls) if (l.trim()) by = Math.min(by, l.match(/^[ \t]*/)![0].length); const n = Number.isFinite(by) ? by : 0; return { text: ls.map((l) => l.slice(n)).join("\n"), by: n }; };
export function codewalkProps(b: CodeWalkBlock) {
  const steps: WalkStep[] = [];
  const files: Record<string, Packed> = {};
  let rows = 6;
  const { still } = walkRuns(b.steps.map((s) => !!s.animated));
  b.steps.forEach((s, k) => {
    let code: HighlightedCode | null = null, by = s.dedent ?? 0;
    const whole = b.walkFiles?.[s.key] ?? null;
    if (still[k] && s.lines && whole != null && !s.error) {
      if (!files[s.key]) files[s.key] = (b.walkHl?.[s.key] as Packed) ?? packCode(plainCode(whole, s.lang));
      const folds = (s.lines[0] > 3 ? 1 : 0) + (files[s.key].lines.length - s.lines[1] > 2 ? 1 : 0);
      rows = Math.max(rows, s.lines[1] - s.lines[0] + 1 + folds * 1.5 + (s.lines[0] > 1 && s.lines[0] <= 3 ? s.lines[0] - 1 : 0));
    } else if (s.code) {
      if (s.hl) code = s.hl as HighlightedCode; else { const d = dedent(s.code); by = d.by; code = plainCode(d.text, s.lang); }
      rows = Math.max(rows, linesUpTo(s.code, 20));
    }
    // the note is the safe inline tree from parse(), drawn as React children (no HTML string)
    steps.push({ file: s.file, repo: s.repo, commit: s.commit, lines: s.lines, focus: s.focus, marks: s.marks, code, dedent: by, note: <Inline c={s.note ?? []} />, error: s.error, animated: !!s.animated, key: s.key });
  });
  return { steps, files, rows: Math.min(rows, 20) };
}
export function CodeWalkPart({ block }: { block: CodeWalkBlock }) {
  // static (SPEC 4.1): the fence's own static= wins, then the page's (front matter static: true) or the host's
  const { ui, static: docStatic } = useDh(), fence = staticOfAttr(block.attrs?.static), stp = fence !== undefined ? fence : docStatic;
  const p = useMemo(() => codewalkProps(block), [block]);
  if (!p.steps.length) return <div className="cw-error">a code walk needs at least one step</div>;
  return <CodeWalk steps={p.steps} files={p.files} rows={p.rows} ui={ui} static={stp} />;
}
export default CodeWalkPart;
