// The diff part's view (format version 11): files with a header that folds, line numbers on both sides, the changed words
// marked inside a changed line, long unchanged runs folded, unified or split. Unified on a narrow stage and split on a
// wide one (the part's own measured width); two buttons switch it and `view=` fixes it. On a narrow stage a line does not
// wrap (a wrapped line would lose its sign and its number): the body scrolls inside its own box, the two numbers and the
// sign stay in view at the left, and the hunk head and the fold button stay one box wide at the left. Static draws every
// file open with no button; a folded run stays a plain "... N lines" row. Every element is a React element.
import React, { useMemo, useState } from "react";
import { Budget, partLimitsOf } from "../../core/budget";
import { useStatic } from "../kit/static";
import { cx } from "../kit/view";
import type { PartViewProps } from "../types";
import { rowsOf, splitPairs, type DFile, type DLine, type DRow, type DiffData } from "./part";

/** the stage width from which `auto` draws split */
export const DIFF_WIDE = 760;
// a layout made while drawing pays from a budget of its own (made per diff): the page's budget was charged when the page was parsed
const scratch = () => new Budget(partLimitsOf(), null, null, "the diff part");
const u = (ui: unknown, key: string, d: string): string => ((ui as Record<string, string> | undefined)?.[key]) ?? d;
const W = { cannot: "This diff cannot be drawn:" };
const SIGN: Record<string, string> = { "+": "+", "-": "−", " ": "" };

function Words({ line }: { line: DLine }) {
  if (!line.marks?.length) return <>{line.text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  line.marks.forEach(([a, b], i) => { if (a > at) out.push(line.text.slice(at, a)); out.push(<span key={i} className="diff-w">{line.text.slice(a, b)}</span>); at = b; });
  if (at < line.text.length) out.push(line.text.slice(at));
  return <>{out}</>;
}

function Stat({ adds, dels }: { adds: number; dels: number }) {
  const total = adds + dels, n = 5, a = total ? Math.round((adds / total) * n) : 0;
  return (
    <span className="diff-stat" aria-label={`${adds} added, ${dels} removed`}>
      <b className="diff-adds">+{adds}</b><b className="diff-dels">{"−"}{dels}</b>
      <span className="diff-sq" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} className={i < a ? "a" : total ? "d" : ""} />)}</span>
    </span>
  );
}

type SRow = { t: "line"; a: DLine | null; b: DLine | null } | Exclude<DRow, { t: "line" }>;
/** the rows with the opened folds put back in, then the split rows made from the same ones */
function splitRows(rows: DRow[], budget: Budget): SRow[] {
  const out: SRow[] = [];
  let run: DLine[] = [];
  const flush = () => { for (const [a, b] of splitPairs(run, budget)) out.push({ t: "line", a, b }); run = []; };
  for (const r of rows) { if (r.t === "line") run.push(r.line); else { flush(); out.push(r); } }
  flush();
  return out;
}

function GapRow({ r, cols, fi, set, can, ui }: { r: Extract<DRow, { t: "gap" }>; cols: number; fi: number; set: (k: string) => void; can: boolean; ui: unknown }) {
  const text = `… ${r.n} ${u(ui, "diffLines", "lines")}`;
  return <tr className="diff-gap"><td colSpan={cols}>{r.hidden && can ? <button type="button" className="diff-fold" onClick={() => set(`${fi}:${r.id}`)}>{text}</button> : <span className="diff-gapt">{text}</span>}</td></tr>;
}

function FileView({ f, fi, shown, ui, still }: { f: DFile; fi: number; shown: "split" | "unified" | null; ui: unknown; still: boolean }) {
  const [shut, setShut] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const adds = f.hunks.reduce((n, h) => n + h.lines.filter((l) => l.k === "+").length, 0), dels = f.hunks.reduce((n, h) => n + h.lines.filter((l) => l.k === "-").length, 0);
  const name = f.newName && f.newName !== "/dev/null" ? f.newName : f.oldName;
  const renamed = f.oldName && f.newName && f.oldName !== f.newName && f.oldName !== "/dev/null" && f.newName !== "/dev/null";
  const base = useMemo(() => rowsOf(f, scratch()), [f]);
  const rows = useMemo(() => {
    const out: DRow[] = [];
    for (const r of base) { if (r.t === "gap" && r.hidden && open[`${fi}:${r.id}`]) for (const l of r.hidden) out.push({ t: "line", line: l }); else out.push(r); }
    return out;
  }, [base, open, fi]);
  const srows = useMemo(() => (shown === "unified" ? [] : splitRows(rows, scratch())), [rows, shown]);
  const isShut = shut && !still;
  const title = renamed ? <>{f.oldName} <span className="diff-to">{"→"}</span> {f.newName}</> : name;
  const opener = (k: string) => setOpen((s) => ({ ...s, [k]: true }));
  return (
    <section className={cx("diff-file", isShut && "is-shut")} aria-label={name}>
      <h4 className="diff-fh">
        {still
          ? <span className="diff-fb"><span className="diff-name">{title}</span></span>
          : <button type="button" className="diff-fb" aria-expanded={!isShut} onClick={() => setShut(!shut)}><span className="chev" aria-hidden="true" /><span className="diff-name">{title}</span></button>}
        {f.note && <span className="diff-note">{f.note}</span>}
        <Stat adds={adds} dels={dels} />
      </h4>
      {!isShut && (
        <div className="diff-body">
          {shown !== "split" && (
            <table className="diff-u" aria-label={`${name}, ${u(ui, "diffUnified", "Unified").toLowerCase()}`}><tbody>
              {rows.map((r, i) => r.t === "hunk"
                ? <tr key={i} className="diff-hunk"><td colSpan={4}><span className="diff-stick">{r.head}</span></td></tr>
                : r.t === "gap" ? <GapRow key={i} r={r} cols={4} fi={fi} set={opener} can={!still} ui={ui} />
                : <tr key={i} className={cx("diff-l", r.line.k === "+" && "is-add", r.line.k === "-" && "is-del")}>
                    <td className="diff-n">{r.line.old ?? ""}</td><td className="diff-n">{r.line.new ?? ""}</td><td className="diff-s" aria-hidden="true">{SIGN[r.line.k]}</td>
                    <td className="diff-t"><span className="diff-sr">{r.line.k === "+" ? "added: " : r.line.k === "-" ? "removed: " : ""}</span><Words line={r.line} /></td>
                  </tr>)}
            </tbody></table>
          )}
          {shown !== "unified" && (
            <table className="diff-sp" aria-label={`${name}, ${u(ui, "diffSplit", "Split").toLowerCase()}`}><tbody>
              {srows.map((r, i) => r.t === "hunk"
                ? <tr key={i} className="diff-hunk"><td colSpan={6}><span className="diff-stick">{r.head}</span></td></tr>
                : r.t === "gap" ? <GapRow key={i} r={r} cols={6} fi={fi} set={opener} can={!still} ui={ui} />
                : <tr key={i} className="diff-l">
                    <td className={cx("diff-n", r.a?.k === "-" && "is-del")}>{r.a?.old ?? ""}</td><td className={cx("diff-s", r.a?.k === "-" && "is-del")} aria-hidden="true">{r.a ? SIGN[r.a.k] : ""}</td><td className={cx("diff-t", r.a?.k === "-" && "is-del", !r.a && "is-empty")}>{r.a && <Words line={r.a} />}</td>
                    <td className={cx("diff-n diff-mid", r.b?.k === "+" && "is-add")}>{r.b?.new ?? ""}</td><td className={cx("diff-s", r.b?.k === "+" && "is-add")} aria-hidden="true">{r.b ? SIGN[r.b.k] : ""}</td><td className={cx("diff-t", r.b?.k === "+" && "is-add", !r.b && "is-empty")}>{r.b && <Words line={r.b} />}</td>
                  </tr>)}
            </tbody></table>
          )}
        </div>
      )}
    </section>
  );
}

export default function DiffView({ data, ui, static: stp, stage }: PartViewProps<DiffData>) {
  const sx = useStatic(stp, 0);
  const [mode, setMode] = useState<"auto" | "split" | "unified">(data.view || "auto");
  if (data.plain) {
    return (
      <div className="diff diff-plain" data-dh-static={sx.on || undefined}>
        {data.errors[0] && <div className="cw-error">{W.cannot} {data.errors[0].msg}</div>}
        {data.src && <pre className="diff-src" tabIndex={0}>{data.src}</pre>}
      </div>
    );
  }
  // auto: the part's own measured width decides; before the first measure (the server's HTML) both are drawn and CSS shows one
  const auto = stage.width === 0 ? null : stage.width >= DIFF_WIDE ? "split" : "unified";
  const shown = mode === "auto" ? auto : mode;
  const label = shown ?? "unified";
  const count = data.files.length;
  return (
    <div className="diff" data-view={shown ?? "auto"} data-dh-static={sx.on || undefined}>
      <div className="diff-bar">
        <span className="diff-title">{data.title || `${count} ${count === 1 ? u(ui, "diffFile", "file") : u(ui, "diffFiles", "files")} ${u(ui, "diffChanged", "changed")}`}</span>
        <Stat adds={data.adds} dels={data.dels} />
        {!data.view && !sx.on && (
          <span className="seg diff-seg" role="group" aria-label={u(ui, "diffView", "View")}>
            <button type="button" aria-pressed={label === "unified"} onClick={() => setMode("unified")}>{u(ui, "diffUnified", "Unified")}</button>
            <button type="button" aria-pressed={label === "split"} onClick={() => setMode("split")}>{u(ui, "diffSplit", "Split")}</button>
          </span>
        )}
      </div>
      {data.files.map((f, fi) => <FileView key={fi} f={f} fi={fi} shown={shown} ui={ui} still={sx.on} />)}
    </div>
  );
}
