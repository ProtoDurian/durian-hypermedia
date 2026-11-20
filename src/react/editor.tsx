// The editor part (```editor): a file tree and one file pane; steps are edits, shown before and after.
import React, { useMemo } from "react";
import type { HighlightedCode } from "codehike/code";
import { Editor, type EdStep } from "../ui/parts";
import { useDh, plainCode } from "./context";
import type { EditorBlock } from "../types";
export function editorProps(b: EditorBlock) {
  let rows = 8;
  const files = b.files.map((f) => {
    if (f.code != null) rows = Math.max(rows, f.code.split("\n").length);
    return { path: f.path, lang: f.lang, commit: f.commit, made: f.made, open: f.open, code: f.code != null ? ((f.hl as HighlightedCode) ?? plainCode(f.code, f.lang)) : null, error: f.error };
  });
  const steps: EdStep[] = b.steps.map((s) => {
    const lang = b.files.find((f) => f.path === s.file)?.lang ?? "text";
    rows = Math.max(rows, s.after.split("\n").length);
    return { title: s.title, file: s.file, before: (s.beforeHl as HighlightedCode) ?? plainCode(s.before, lang), after: (s.afterHl as HighlightedCode) ?? plainCode(s.after, lang), added: s.added, removed: s.removed, error: s.error };
  });
  return { files, steps, rows: Math.min(rows, 18) };
}
export function EditorPart({ block }: { block: EditorBlock }) {
  const { ui } = useDh();
  const p = useMemo(() => editorProps(block), [block]);
  if (!p.files.length) return <div className="cw-error">an editor needs at least one file</div>;
  return <Editor files={p.files} steps={p.steps} rows={p.rows} ui={ui} />;
}
export default EditorPart;
