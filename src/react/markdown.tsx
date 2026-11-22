// The Markdown tree as React elements. No HTML strings: every text is a React text node, so it is escaped.
// URLs were checked by parse(); the renderer checks them again with the same policy (defence in depth).
import React from "react";
import { Pre, type HighlightedCode } from "codehike/code";
import { mark, add, del, lineTokens } from "../ui/ch";
import { applyUrlPolicy } from "../safety";
import { useDh, plainCode } from "./context";
import { inlineText } from "../markdown";
import type { MdBlock, MdInline, MarkdownBlock } from "../types";

// the mouse icon: the button the action presses is filled; a double click adds a "2", a scroll arrows, a drag a move arrow
const MOUSE_L = "M3 11a8 8 0 0 1 7.2-7.96V13H3z", MOUSE_R = "M11.8 3.04A8 8 0 0 1 19 11v2h-7.2z";
function MouseIcon({ press, badge }: { press: string; badge: string }) {
  return (
    <svg className="dh-mouse-icon" viewBox="0 0 31 30" width="31" height="30" aria-hidden="true">
      <path className={press === "l" ? "mp" : "mo"} d={MOUSE_L} /><path className={press === "r" ? "mp" : "mo"} d={MOUSE_R} />
      <path className="mb" d="M3 11a8 8 0 0 1 16 0v10a8 8 0 0 1-16 0z" />
      <line className="ml" x1="11" y1="3" x2="11" y2="13" /><line className="ml" x1="3" y1="13" x2="19" y2="13" />
      <rect className={press === "w" ? "mw mp" : "mw"} x="9.6" y="6" width="2.8" height="5.4" rx="1.4" />
      {badge === "2" ? <><circle className="mbadge" cx="25" cy="7.5" r="6.5" /><text className="mbadge-t" x="25" y="11" textAnchor="middle">2</text></>
        : badge === "scroll" ? <path className="ma" d="M25 2.5l3.5 4h-7zM25 23.5l3.5-4h-7z" />
        : badge === "drag" ? <path className="ma" d="M21.5 18h6M25.5 15l3 3-3 3" fill="none" />
        : badge === "drop" ? <path className="ma" d="M25 13v8M22 18l3 3 3-3" fill="none" />
        : badge === "hover" ? <path className="ma" d="M22 5q3 2.5 0 5M25.5 3q4.5 4.5 0 9" fill="none" />
        : badge === "select" ? <path className="ma" d="M23 14h4M25 14v9M23 23h4" fill="none" /> : null}
    </svg>
  );
}

export function Inline({ c }: { c: MdInline[] }): React.ReactElement {
  const { urlPolicy, hostInlines, slots } = useDh();
  return <>{c.map((x, i) => {
    switch (x.t) {
      case "text": return <React.Fragment key={i}>{x.v}</React.Fragment>;
      case "strong": return <strong key={i}><Inline c={x.c} /></strong>;
      case "em": return <em key={i}><Inline c={x.c} /></em>;
      case "del": return <del key={i}><Inline c={x.c} /></del>;
      case "code": return slots.InlineCode ? <slots.InlineCode key={i} text={x.v} /> : <code key={i}>{x.v}</code>;
      case "br": return <br key={i} />;
      case "link": {
        const href = x.href == null ? null : applyUrlPolicy(x.href, "link", x.href.startsWith("#") ? undefined : urlPolicy);
        if (href == null) return <span key={i} className="dh-link-off"><Inline c={x.c} /></span>;
        const external = /^[a-z][a-z0-9+.-]*:|^\/\//i.test(href);
        if (slots.Link) return <slots.Link key={i} href={href} title={x.title} external={external}><Inline c={x.c} /></slots.Link>;
        return <a key={i} href={href} title={x.title} {...(external ? { rel: "noreferrer noopener", target: "_blank" } : {})}><Inline c={x.c} /></a>;
      }
      case "img": {
        const src = x.src == null ? null : applyUrlPolicy(x.src, "image", urlPolicy);
        return src == null ? <span key={i} className="dh-img-off">{x.alt}</span> : <img key={i} src={src} alt={x.alt} title={x.title} loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
      }
      case "coderef": return <span key={i} className="coderef" tabIndex={0} title={x.ref}><Inline c={x.c} /></span>;
      case "kbd": return (
        <span key={i} className="dh-keys" aria-label={x.label}>
          {x.chords.map((ch, k) => <React.Fragment key={k}>{k > 0 && <span className="dh-then">then</span>}<span className="dh-chord">{ch.map((key, j) => <React.Fragment key={j}>{j > 0 && <span className="dh-plus">+</span>}<kbd>{key}</kbd></React.Fragment>)}</span></React.Fragment>)}
        </span>
      );
      case "ref": { const R = hostInlines.get(x.name); return R ? <R key={i} text={x.text} data={x.data} /> : <span key={i} className="dh-ref" data-dh-ref={x.name}>{x.text}</span>; }
      case "mouse": return <span key={i} className="dh-mouse"><MouseIcon press={x.press} badge={x.badge} /><span className="dh-mouse-act">{x.act}</span>{x.target ? <> <b>{x.target}</b></> : null}</span>;
    }
  })}</>;
}

export function CodeBlock({ text, lang, hl }: { text: string; lang: string; hl?: unknown }) {
  // one text token per line: Code Hike splits a many-line token once per line (long code would render in quadratic time)
  const code = lineTokens((hl as HighlightedCode | undefined) ?? plainCode(text, lang || "text"));
  return <div className="code-block">{lang ? <span className="code-lang">{lang}</span> : null}<Pre code={code} handlers={[mark, add, del]} className="ch-pre" /></div>;
}

export function Md({ blocks }: { blocks: MdBlock[] }): React.ReactElement {
  const { slots, demoteHeadings } = useDh();
  return <>{blocks.map((b, i) => {
    switch (b.t) {
      case "p": return <p key={i}><Inline c={b.c} /></p>;
      case "text": return <React.Fragment key={i}><Inline c={b.c} /></React.Fragment>;
      case "h": {
        const level = Math.min(6, Math.max(1, b.depth + demoteHeadings));
        if (slots.Heading) return <slots.Heading key={i} depth={b.depth} level={level} id={b.id} text={b.text}><Inline c={b.c} /></slots.Heading>;
        const H = `h${level}` as "h2"; return <H key={i} id={b.id}><a className="h-anchor" href={`#${b.id}`} aria-hidden="true" tabIndex={-1}>#</a><Inline c={b.c} /></H>; }
      case "list": {
        const items = b.items.map((it, k) => <li key={k} className={it.task ? "task" : undefined}>{it.task ? <input type="checkbox" checked={it.checked} disabled readOnly /> : null}<Md blocks={it.c} /></li>);
        return b.ordered ? <ol key={i} start={b.start != null && b.start !== 1 ? b.start : undefined}>{items}</ol> : <ul key={i}>{items}</ul>;
      }
      case "quote": return <blockquote key={i}><Md blocks={b.c} /></blockquote>;
      case "callout": {
        const [first, ...rest] = b.c;
        return <slots.Callout key={i} kind={b.kind} label={b.label}>
          {first?.t === "p" ? <p><strong>{b.label}:</strong> <Inline c={first.c} /></p> : <><p><strong>{b.label}:</strong></p>{first ? <Md blocks={[first]} /> : null}</>}
          <Md blocks={rest} />
        </slots.Callout>;
      }
      case "code": return slots.Code ? <slots.Code key={i} lang={b.lang} text={b.text} meta={b.meta ?? ""} hl={b.hl} /> : <CodeBlock key={i} text={b.text} lang={b.lang} hl={b.hl} />;
      case "table": return slots.Table ? (
        <slots.Table key={i} align={b.align} headText={b.head.map(inlineText)}
          head={b.head.map((c, k) => <Inline key={k} c={c} />)} rows={b.rows.map((r) => r.map((c, j) => <Inline key={j} c={c} />))} />
      ) : (
        <div key={i} className="table-wrap"><table>
          <thead><tr>{b.head.map((c, k) => <th key={k} style={b.align[k] ? { textAlign: b.align[k]! } : undefined}><Inline c={c} /></th>)}</tr></thead>
          <tbody>{b.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} style={b.align[j] ? { textAlign: b.align[j]! } : undefined}><Inline c={c} /></td>)}</tr>)}</tbody>
        </table></div>
      );
      case "hr": return <hr key={i} />;
      case "raw": return <pre key={i} className="dh-raw"><code>{b.text}</code></pre>;
    }
  })}</>;
}

/** One Markdown block of a Document. */
export function MarkdownPart({ block }: { block: MarkdownBlock }) { return <Md blocks={block.md} />; }
export default MarkdownPart;
