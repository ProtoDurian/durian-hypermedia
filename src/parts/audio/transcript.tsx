// The transcript drawer shared by audio and video: lines that light with the sound, a click that seeks, a search box.
// The lit line is kept in view inside the box only; the page never scrolls by itself.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { fmtTime } from "../downloads/media";
import { Icon, STR } from "../downloads/media-ui";
import type { Cue } from "./timed";

export function Transcript({ cues, t, onSeek, reduced }: { cues: Cue[]; t: number; onSeek: (t: number) => void; reduced: boolean }) {
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const active = useMemo(() => { let k = -1; for (let i = 0; i < cues.length; i++) if (cues[i].t <= t + 0.05) k = i; else break; return k; }, [cues, t]);
  useEffect(() => {
    const b = box.current; if (!b || active < 0 || q) return;
    const el = b.querySelector<HTMLElement>(`[data-cue="${active}"]`); if (!el) return;
    const want = el.offsetTop - b.clientHeight / 3;
    if (Math.abs(b.scrollTop - want) > 4) b.scrollTo({ top: want, behavior: reduced ? "auto" : "smooth" });
  }, [active, q, reduced]);
  const q2 = q.trim().toLowerCase();
  const shown = cues.map((c, i) => ({ c, i })).filter(({ c }) => !q2 || (c.speaker + " " + c.text).toLowerCase().includes(q2));
  const hi = (s: string): React.ReactNode => {
    if (!q2) return s;
    const out: React.ReactNode[] = []; let at = 0, k = 0; const low = s.toLowerCase();
    for (let f = low.indexOf(q2); f >= 0; f = low.indexOf(q2, at)) { if (f > at) out.push(s.slice(at, f)); out.push(<mark key={k++}>{s.slice(f, f + q2.length)}</mark>); at = f + q2.length; }
    out.push(s.slice(at)); return out;
  };
  return (
    <div className="am-transcript" data-dh-slot="transcript">
      <label className="am-search"><Icon n="search" size={18} /><input type="search" value={q} placeholder={STR.search} aria-label={STR.search} onChange={(e) => setQ(e.target.value)} />{q2 ? <span className="am-count">{shown.length} {STR.of} {cues.length}</span> : null}</label>
      <div className="am-lines" ref={box} role="list">
        {shown.length ? shown.map(({ c, i }) => (
          <button key={i} type="button" role="listitem" data-cue={i} data-dh-slot={i === active ? "cue-active" : "cue"} className={`am-cue${i === active ? " is-active" : ""}`} aria-current={i === active ? "true" : undefined} onClick={() => onSeek(c.t)}>
            <span className="am-cue-t">{fmtTime(c.t)}</span>{c.speaker ? <b className="am-cue-sp">{hi(c.speaker)}</b> : null}<span className="am-cue-x">{hi(c.text)}</span>
          </button>
        )) : <p className="am-none">{STR.noMatch}</p>}
      </div>
    </div>
  );
}
