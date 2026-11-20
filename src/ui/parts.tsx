// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The interactive parts. Each is rendered to HTML at build time and hydrated in the browser with the same props.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pre, type HighlightedCode } from "codehike/code";
import { HANDLERS_BASE, annotate, lineNumbers, mark, focus, type Ann } from "./ch";
import { STILL_BASE, stillRows, rowsCode, stillAnns, stillLines, walkRuns, type Packed } from "./codewalk";
import type { Ui } from "./ui";

// still when the reader asks for less motion, or when a host style turns motion off (data-dh-motion="off" on any element)
export const reducedMotion = () => typeof window !== "undefined" && (!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !!document.querySelector('[data-dh-motion="off"]'));
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------------------------------------------------------------- controls: Back, (Play), the slider, Next
export function Controls(p: { ui: Ui; i: number; n: number; onGo: (k: number) => void; playing?: boolean; onPlay?: () => void; slider?: boolean; label?: string; nextDisabled?: boolean; children?: React.ReactNode }) {
  const { ui, i, n } = p;
  return (
    <div className="ctl" role="group" aria-label={p.label ?? ui.step}>
      <button type="button" className="btn" onClick={() => p.onGo(i - 1)} disabled={i <= 0}>{ui.back}</button>
      {p.onPlay && <button type="button" className="btn btn-play" onClick={p.onPlay} aria-pressed={!!p.playing}>{p.playing ? ui.pause : ui.play}</button>}
      <div className="ctl-mid">
        {p.children ?? (p.slider !== false && n > 1 ? (
          <input type="range" className="ctl-range" min={0} max={n - 1} step={1} value={i} aria-label={ui.step} aria-valuetext={`${ui.step} ${i + 1} / ${n}`} onChange={(e) => p.onGo(+e.currentTarget.value)} style={{ ["--pct" as any]: `${n > 1 ? (i / (n - 1)) * 100 : 0}%` }} />
        ) : null)}
        <span className="ctl-count" aria-live="polite">{i + 1} / {n}</span>
      </div>
      <button type="button" className="btn btn-go" onClick={() => p.onGo(i + 1)} disabled={p.nextDisabled ?? i >= n - 1}>{ui.next}</button>
    </div>
  );
}
// arrow keys step the part that has focus
function onArrows(e: React.KeyboardEvent, go: (d: number) => void) {
  if ((e.target as HTMLElement).closest("input,select,textarea")) return;
  if (e.key === "ArrowRight") { go(1); e.preventDefault(); }
  if (e.key === "ArrowLeft") { go(-1); e.preventDefault(); }
}

// ---------------------------------------------------------------- code walk: Code Hike slideshow with a step slider
// note: React children (the package draws the parsed inline tree); the site passes an HTML string with its own Note (codewalk-html.tsx)
export type WalkStep = { file: string; repo: string; commit: string | null; lines: [number, number] | null; focus: [number, number] | null; marks: number[]; code: HighlightedCode | null; dedent: number; note: React.ReactNode; error: string | null; animated?: boolean; key?: string };
export type WalkNoteProps = { k: number; active: boolean; note: React.ReactNode };
// the default note: React children only, so no HTML string reaches the DOM
export function WalkNote({ k, active, note }: WalkNoteProps) {
  return <div className={cx("cw-note", active && "is-active")} aria-hidden={!active}><span className="cw-num">{k + 1}</span>{note}</div>;
}
// Two modes (format version 7). Animated: only for the same code changing, the morph of Code Hike. Still: the whole file, the
// step's lines open and marked, the rest folded; a move switches marks and folds at once. Steps joined by animated moves form
// a run; a run of one step is still.
export function CodeWalk({ steps, files, ui, rows, Note = WalkNote }: { steps: WalkStep[]; files?: Record<string, Packed>; ui: Ui; rows: number; Note?: React.ComponentType<WalkNoteProps> }) {
  const [i, setI] = useState(0);
  const [opened, setOpened] = useState<{ i: number; keys: string[] }>({ i: 0, keys: [] });
  const go = (k: number) => setI(Math.max(0, Math.min(steps.length - 1, k)));
  const s = steps[i];
  const { run, still } = useMemo(() => walkRuns(steps.map((x) => !!x.animated)), []);
  const pack = still[i] && s.lines ? files?.[s.key ?? ""] : undefined;
  const keys = opened.i === i ? opened.keys : [];
  const view = useMemo(() => {
    if (pack && s.lines) {
      const r = stillRows(pack.lines.length, s.lines, new Set(keys));
      return { rows: r, code: rowsCode(pack, r, stillAnns(r, s.focus, s.marks, s.lines)) };
    }
    if (!s.code || !s.lines) return null;
    const a = s.lines[0];
    const anns: Ann[] = [];
    if (s.focus) anns.push({ name: "focus", from: s.focus[0] - a + 1, to: s.focus[1] - a + 1 });
    for (const m of s.marks) anns.push({ name: "mark", from: m - a + 1, to: m - a + 1 });
    return { rows: null, code: annotate(s.code, anns) };
  }, [i, keys.join()]);
  const open = (k: string) => setOpened({ i, keys: [...keys, k] });
  const foldLabel = (n: number) => ui.foldLines.replace("{n}", String(n));
  return (
    <div className="cw" tabIndex={0} onKeyDown={(e) => onArrows(e, (d) => go(i + d))} aria-roledescription="code walk">
      <div className="cw-file">
        <span className="cw-path">{s.repo ? <span className="cw-repo">{s.repo}/</span> : null}{s.file}</span>
        <span className="cw-meta">{s.lines ? `${ui.lines} ${s.lines[0]}–${s.lines[1]}` : ""}{s.commit ? ` · ${ui.pinned} ${s.commit.slice(0, 7)}` : ""}</span>
      </div>
      <div className={cx("cw-code", view?.rows && "cw-still")} style={{ ["--rows" as any]: rows }}>
        {view?.rows
          ? <Pre key={`s${i}`} code={view.code} handlers={[...STILL_BASE, mark, focus, stillLines(view.rows, open, foldLabel)]} className="ch-pre" />
          : view ? <Pre key={`r${run[i]}`} code={view.code} handlers={[...HANDLERS_BASE, lineNumbers(s.lines![0])]} className="ch-pre" />
          : <div className="cw-error">{s.error ?? "no code"}</div>}
      </div>
      <div className="cw-notes">
        {steps.map((st, k) => <Note key={k} k={k} active={k === i} note={st.note} />)}
      </div>
      <Controls ui={ui} i={i} n={steps.length} onGo={go} label={ui.step} />
    </div>
  );
}

// ---------------------------------------------------------------- editor: a small IDE for reading code (the file tree and one pane)
export type EdFile = { path: string; lang: string; commit: string | null; made: boolean; code: HighlightedCode | null; error: string | null; open?: boolean };
export type EdStep = { title: string; file: string; before: HighlightedCode; after: HighlightedCode; added: number[]; removed: number[]; error: string | null };
type TreeNode = { name: string; path: string; kids: TreeNode[]; file?: number };
function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", kids: [] };
  // drop the folders every file shares, so the tree starts where the files differ
  const parts = paths.map((p) => p.split("/"));
  let common = 0;
  while (parts.length > 1 && parts.every((p) => p.length > common + 1 && p[common] === parts[0][common])) common++;
  paths.forEach((p, fi) => {
    let n = root;
    const segs = p.split("/").slice(common);
    segs.forEach((seg, k) => {
      const last = k === segs.length - 1;
      let c = n.kids.find((x) => x.name === seg && (last ? x.file !== undefined : x.file === undefined));
      if (!c) { c = { name: seg, path: segs.slice(0, k + 1).join("/"), kids: [], ...(last ? { file: fi } : {}) }; n.kids.push(c); }
      n = c;
    });
  });
  const sort = (n: TreeNode) => { n.kids.sort((a, b) => (a.file === undefined ? 0 : 1) - (b.file === undefined ? 0 : 1) || a.name.localeCompare(b.name)); n.kids.forEach(sort); };
  sort(root);
  return root;
}
const extOf = (n: string) => (n.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
export function FileIcon({ name, folder, open }: { name: string; folder?: boolean; open?: boolean }) {
  if (folder) return <span className={cx("fi fi-dir", open && "is-open")} aria-hidden="true" />;
  return <span className="fi fi-file" data-ext={extOf(name)} aria-hidden="true">{extOf(name).slice(0, 2) || "·"}</span>;
}
export function Editor({ files, steps, ui, rows }: { files: EdFile[]; steps: EdStep[]; ui: Ui; rows: number }) {
  const first = Math.max(0, files.findIndex((f) => f.open));
  const [cur, setCur] = useState(first);   // the file in the pane
  const [k, setK] = useState(0);           // 0: the files as they are; k: after edit k
  const [before, setBefore] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const tree = useMemo(() => buildTree(files.map((f) => f.path)), []);
  const goStep = (n: number) => {
    const c = Math.max(0, Math.min(steps.length, n));
    setK(c); setBefore(false);
    // stepping shows the file the edit is in
    if (c > 0) { const fi = files.findIndex((f) => f.path === steps[c - 1].file); if (fi >= 0) setCur(fi); }
  };
  const f = files[cur];
  // the pane: the file after every edit up to k that touched it; the edit of step k itself is marked
  let code: HighlightedCode | null = f.code, anns: Ann[] = [];
  let lastJ = -1;
  for (let j = 0; j < k; j++) if (steps[j].file === f.path) lastJ = j;
  if (lastJ >= 0) {
    const s = steps[lastJ], isNow = lastJ === k - 1;
    if (isNow && before) { code = s.before; anns = s.removed.map((n) => ({ name: "del", from: n, to: n })); }
    else { code = s.after; if (isNow) anns = s.added.map((n) => ({ name: "add", from: n, to: n })); }
  }
  const shown = code ? annotate(code, anns) : null;
  const touched = (path: string) => steps.slice(0, k).some((s) => s.file === path);
  const renderNode = (n: TreeNode, depth: number): React.ReactNode => n.kids.map((c) => {
    if (c.file === undefined) {
      const isClosed = !!closed[c.path];
      return (
        <li key={c.path} role="treeitem" aria-expanded={!isClosed}>
          <button type="button" className="ide-row" style={{ ["--d" as any]: depth }} onClick={() => setClosed((s) => ({ ...s, [c.path]: !isClosed }))}>
            <span className={cx("chev", !isClosed && "is-open")} aria-hidden="true" /><FileIcon name={c.name} folder open={!isClosed} /><span className="ide-name">{c.name}</span>
          </button>
          {!isClosed && <ul role="group">{renderNode(c, depth + 1)}</ul>}
        </li>
      );
    }
    return (
      <li key={c.path} role="treeitem" aria-selected={cur === c.file}>
        <button type="button" className={cx("ide-row", cur === c.file && "is-cur")} style={{ ["--d" as any]: depth }} onClick={() => setCur(c.file!)}>
          <span className="chev chev-none" aria-hidden="true" /><FileIcon name={c.name} /><span className="ide-name">{c.name}</span>{touched(files[c.file].path) && <span className="fx-badge b-changed ide-badge">{(ui.marks as any).edited ?? "edited"}</span>}
        </button>
      </li>
    );
  });
  const step = k > 0 ? steps[k - 1] : null;
  return (
    <div className="ide" onKeyDown={(e) => steps.length > 0 && onArrows(e, (d) => goStep(k + d))}>
      <div className="ide-body" style={{ ["--rows" as any]: rows }}>
        <nav className="ide-side" aria-label={ui.files}>
          <div className="ide-side-head">{ui.explorer}</div>
          <ul role="tree">{renderNode(tree, 0)}</ul>
        </nav>
        <div className="ide-main">
          <div className="ide-crumbs"><FileIcon name={f.path} /><span>{f.path.split("/").join(" › ")}</span>{f.commit ? <span className="ide-pin"> · {ui.pinned} {f.commit.slice(0, 7)}</span> : null}</div>
          <div className="ide-code" tabIndex={0}>{shown ? <Pre code={shown} handlers={[...HANDLERS_BASE, lineNumbers(1)]} className="ch-pre" /> : <div className="cw-error">{f.error ?? "no code"}</div>}</div>
        </div>
      </div>
      {steps.length > 0 && (
        <div className="ide-steps">
          <div className="ide-step-title">
            <span className="cw-num">{k}</span><span className="ide-step-t">{step ? step.title : ui.original}</span>
            {step && step.removed.length > 0 && (
              <span className="seg" role="group" aria-label={ui.beforeAfter}>
                <button type="button" aria-pressed={before} onClick={() => setBefore(true)}>{ui.before}</button>
                <button type="button" aria-pressed={!before} onClick={() => setBefore(false)}>{ui.after2}</button>
              </span>
            )}
          </div>
          <Controls ui={ui} i={k} n={steps.length + 1} onGo={goStep} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- file tree: an IDE file explorer
export type TreeRow = { depth: number; name: string; folder: boolean; badges: string[]; closed: boolean; note: string; gap: boolean; path: string };
export type Tree = { title: string | null; rows: TreeRow[] };
// a mark is shown as its own word (the source writes "(new)", the page shows "new"): no letters to learn
export function FileTree({ trees, ui }: { trees: Tree[]; ui: Ui }) {
  const [k, setK] = useState(0);
  const [closed, setClosed] = useState<Record<string, boolean>>(() => Object.fromEntries(trees.flatMap((t) => t.rows.filter((r) => r.folder && r.closed).map((r) => [r.path, true]))));
  const t = trees[k];
  const prev = k > 0 ? new Set(trees[k - 1].rows.map((r) => r.path)) : null;
  const maxRows = Math.max(...trees.map((x) => x.rows.length));
  // a row is hidden when any folder above it is closed
  const visible: TreeRow[] = [];
  const stack: { depth: number; closed: boolean }[] = [];
  for (const r of t.rows) {
    while (stack.length && stack[stack.length - 1].depth >= r.depth) stack.pop();
    if (!stack.some((s) => s.closed)) visible.push(r);
    if (r.folder) stack.push({ depth: r.depth, closed: !!closed[r.path] });
  }
  const label = (b: string) => (ui.marks as any)[b] ?? b;
  return (
    <div className="fx" onKeyDown={(e) => trees.length > 1 && onArrows(e, (d) => setK((x) => Math.max(0, Math.min(trees.length - 1, x + d))))}>
      <div className="fx-head"><span className="fx-title">{ui.explorer}</span>{t.title && <span className="fx-step">{t.title}</span>}</div>
      <ul className="fx-list" role="tree" style={{ ["--rows" as any]: trees.length > 1 ? maxRows : t.rows.length }}>
        {visible.map((r) => {
          const isNew = prev && !prev.has(r.path);
          if (r.gap) return <li key={r.path + r.depth} className="fx-row fx-gap" style={{ ["--d" as any]: r.depth }} role="none"><span className="fx-dots" aria-label={ui.more}>⋯</span><span className="fx-gap-t">{r.note || ui.more}</span></li>;
          const isClosed = r.folder && !!closed[r.path];
          return (
            <li key={r.path} role="treeitem" aria-expanded={r.folder ? !isClosed : undefined} className={cx("fx-row", isNew && "is-new", r.badges.includes("removed") && "is-removed")} style={{ ["--d" as any]: r.depth }}>
              {r.folder ? (
                <button type="button" className="fx-line" onClick={() => setClosed((s) => ({ ...s, [r.path]: !isClosed }))}>
                  <span className={cx("chev", !isClosed && "is-open")} aria-hidden="true" /><FileIcon name={r.name} folder open={!isClosed} /><span className="fx-name">{r.name.replace(/\/$/, "")}</span>
                  {r.badges.map((b) => <span key={b} className={`fx-badge b-${b}`}>{label(b)}</span>)}
                </button>
              ) : (
                <span className="fx-line">
                  <span className="chev chev-none" aria-hidden="true" /><FileIcon name={r.name} /><span className="fx-name">{r.name}</span>
                  {r.badges.map((b) => <span key={b} className={`fx-badge b-${b}`}>{label(b)}</span>)}
                </span>
              )}
              {r.note && <span className="fx-note">{r.note}</span>}
            </li>
          );
        })}
      </ul>
      {trees.length > 1 && <Controls ui={ui} i={k} n={trees.length} onGo={(x) => setK(Math.max(0, Math.min(trees.length - 1, x)))} />}
    </div>
  );
}

// ---------------------------------------------------------------- terminal: the shell-session convention
// A command line ($, % or # for root) is typed at its prompt, highlighted as bash; every other line is output, shown whole.
export type Tok = [string, string | null];
export type TermLine = { k: "cmd" | "out"; text: string; prompt?: string; hl?: Tok[] };
// the first n characters of a highlighted command
function typedToks(l: TermLine, n: number): React.ReactNode[] {
  const toks: Tok[] = l.hl ?? [[l.text, null]];
  const out: React.ReactNode[] = [];
  let left = n;
  toks.forEach(([s, c], i) => { if (left <= 0) return; const part = s.slice(0, left); left -= s.length; out.push(c ? <span key={i} style={{ color: c }}>{part}</span> : part); });
  return out;
}
export function Terminal({ steps, ui, title }: { steps: { title: string; lines: TermLine[] }[]; ui: Ui; title: string | null }) {
  const [k, setK] = useState(0);
  const [typed, setTyped] = useState<number>(Infinity); // characters of the current step shown so far; Infinity = all
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  // what a step shows, in order: a command is typed key by key, an output line appears whole
  const script = (s: { lines: TermLine[] }) => s.lines.map((l) => (l.k === "cmd" ? l.text.length + 1 : 1));
  const total = (j: number) => script(steps[j]).reduce((a, b) => a + b, 0);
  useEffect(() => {
    if (reducedMotion()) { setTyped(Infinity); setStarted(true); return; }
    setTyped(0);
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setStarted(true); io.disconnect(); } }, { threshold: 0.5 });
    if (box.current) io.observe(box.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!started || typed === Infinity) return;
    if (typed >= total(k)) {
      if (playing) { if (k < steps.length - 1) { const t = setTimeout(() => { setK(k + 1); setTyped(0); }, 1100); return () => clearTimeout(t); } setPlaying(false); }
      return;
    }
    let at = typed, li = 0; const sc = script(steps[k]);
    while (li < sc.length && at >= sc[li]) { at -= sc[li]; li++; }
    const line = steps[k].lines[li];
    const typing = line && line.k === "cmd" && at < sc[li] - 1;
    const delay = typing ? (at === 0 ? 380 : 42 + Math.random() * 40) : line?.k === "out" ? 140 : 260;
    const t = setTimeout(() => setTyped(typed + 1), delay);
    return () => clearTimeout(t);
  }, [typed, started, k, playing]);
  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight }); }, [typed, k]);
  const go = (j: number) => { const c = Math.max(0, Math.min(steps.length - 1, j)); setK(c); setTyped(reducedMotion() || c < k ? Infinity : 0); setStarted(true); };
  const out: React.ReactNode[] = [];
  let cursorShown = false;
  let lastPrompt = "$";
  for (let j = 0; j <= k; j++) {
    const s = steps[j];
    if (s.title) out.push(<div key={`t${j}`} className="t-step"># {s.title}</div>);
    let left = j < k ? Infinity : typed;
    for (const [li, l] of s.lines.entries()) {
      if (left <= 0) break;
      const key = `${j}-${li}`;
      if (l.k === "cmd") {
        lastPrompt = l.prompt ?? "$";
        const n = Math.min(l.text.length, left);
        const done = left > l.text.length;
        out.push(<div key={key} className="t-line t-cmd"><span className={l.prompt === "#" ? "t-pr t-root" : "t-pr"}>{l.prompt ?? "$"}</span>{typedToks(l, n)}{!done && <span className="t-cur" aria-hidden="true" />}</div>);
        if (!done) cursorShown = true;
        left -= l.text.length + 1;
      } else {
        out.push(<div key={key} className="t-line t-out">{l.text}</div>);
        left -= 1;
      }
    }
  }
  if (!cursorShown) out.push(<div key="idle" className="t-line"><span className="t-pr">{lastPrompt}</span><span className="t-cur" aria-hidden="true" /></div>);
  const rows = Math.min(16, steps.reduce((a, s) => a + s.lines.length + (s.title ? 1 : 0), 0) + 1);
  return (
    <div className="term" ref={box}>
      <div className="term-chrome"><span className="win-dots" aria-hidden="true"><i /><i /><i /></span><span className="term-title">{title ?? ui.terminal}</span></div>
      <div className="term-body" ref={body} style={{ ["--rows" as any]: rows }} role="log" aria-label={ui.terminal}>{out}</div>
      {steps.length > 1 ? <Controls ui={ui} i={k} n={steps.length} onGo={go} playing={playing} onPlay={() => { if (!playing && k === steps.length - 1) go(0); setPlaying(!playing); }} />
        : <div className="ctl ctl-one"><button type="button" className="btn" onClick={() => go(0)}>{ui.replay}</button></div>}
    </div>
  );
}

// ---------------------------------------------------------------- diagram: a mermaid block; with steps it builds up one step at a time
// Every step is drawn at once into one grid cell, so the stage is as tall as the biggest step and never jumps.
// Draw: a host's own renderer for each step (it gets the mermaid source); without it the page's script draws [data-mermaid] boxes.
export type DiagramDrawProps = { src: string; title: string; step: number; active: boolean };
export function Diagram({ steps, ui, Draw }: { steps: { title: string; src: string }[]; ui: Ui; Draw?: React.ComponentType<DiagramDrawProps> }) {
  const [i, setI] = useState(0);
  const go = (k: number) => setI(Math.max(0, Math.min(steps.length - 1, k)));
  return (
    <div className="dg" tabIndex={steps.length > 1 ? 0 : undefined} onKeyDown={(e) => steps.length > 1 && onArrows(e, (d) => go(i + d))}>
      <div className="dg-stack">
        {steps.map((s, k) => Draw
          ? <div key={k} className={cx("diagram", "is-drawn", k === i && "is-active")} data-dh-host-diagram aria-hidden={k !== i}><pre className="mermaid-src"><code>{s.src}</code></pre><div className="mermaid-svg"><Draw src={s.src} title={s.title} step={k} active={k === i} /></div></div>
          : <div key={k} className={cx("diagram", k === i && "is-active")} data-mermaid aria-hidden={k !== i}><pre className="mermaid-src"><code>{s.src}</code></pre></div>)}
      </div>
      {steps.length > 1 && <>
        <div className="anim-cap" aria-live="polite"><span className="cw-num">{i + 1}</span><span>{steps[i].title}</span></div>
        <Controls ui={ui} i={i} n={steps.length} onGo={go} />
      </>}
    </div>
  );
}
