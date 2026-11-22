// The audio part (format version 11): our own player. A waveform drawn from peaks that moves with the sound, chapters,
// markers, a transcript that follows, and the --audio-* tokens. Rendered to HTML on the server (a still shell) and alive in
// the browser. No HTML strings; the wave is a canvas that reads its colours from the part's own tokens. Every address goes
// through the host's urlPolicy; nothing plays until the reader presses Play (no autoplay).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Budget, partLimitsOf } from "../../core/budget";
import type { PartViewProps } from "../types";
import { Icon, Menu, STR, clamp, cssVar, onButton, sameOrigin, toneVar, typing, useDrag, useMediaUrl, useReducedMotion, useThemeTick } from "../downloads/media-ui";
import { fmtTime } from "../downloads/media";
import { Transcript } from "./transcript";
import { parseVtt, speakerOf, type Cue } from "./timed";
import { barsOf, peaksOf } from "./peaks-data";
import type { AudioSpec } from "./part";

const H = { s: 56, m: 96, l: 140 } as const;

/** x of a time on the wave (chapters are separated by a gap), and the time of an x */
export function waveMap(dur: number, width: number, chapterT: number[], gap: number) {
  const starts = chapterT.filter((t) => t > 0 && t < dur);
  const usable = Math.max(1, width - gap * starts.length);
  const xOf = (t: number) => { const tt = clamp(t, 0, dur); let k = 0; while (k < starts.length && starts[k] <= tt) k++; return (tt / Math.max(dur, 1e-6)) * usable + k * gap; };
  const tOf = (x: number) => { let lo = 0, hi = dur; for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (xOf(mid) < x) lo = mid; else hi = mid; } return hi; };
  return { xOf, tOf, usable, starts };
}

type Cols = { wave: string; played: string; played2: string; head: string; buffer: string; marker: string };
const readCols = (el: Element, tone: string): Cols => ({
  wave: cssVar(el, "--audio-wave") || "gray", played: cssVar(el, "--audio-played") || "royalblue", played2: cssVar(el, "--audio-played-2") || cssVar(el, "--audio-played") || "rebeccapurple",
  head: cssVar(el, "--audio-playhead") || "royalblue", buffer: cssVar(el, "--audio-buffer") || "lightgray", marker: cssVar(el, toneVar(tone)) || "royalblue",
});

export default function AudioView({ data: spec }: PartViewProps<AudioSpec>) {
  const url = useMediaUrl();
  const src = url(spec.src) ?? "";
  const peaksUrl = spec.peaks ? url(spec.peaks) : null, transcriptUrl = spec.transcriptFile ? url(spec.transcriptFile) : null;
  const caps = spec.caps;
  const root = useRef<HTMLDivElement>(null), audioEl = useRef<HTMLAudioElement>(null), canvas = useRef<HTMLCanvasElement>(null), wrap = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(spec.start), [dur, setDur] = useState(spec.duration ?? 0), [playing, setPlaying] = useState(false), [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false), [vol, setVol] = useState(1), [buffered, setBuffered] = useState(0), [peaks, setPeaks] = useState<number[] | null>(null);
  const [cues, setCues] = useState<Cue[]>(spec.cues), [open, setOpen] = useState(spec.transcript === "open"), [w, setW] = useState(0), [err, setErr] = useState(""), [note, setNote] = useState("");
  const reduced = useReducedMotion(), themeTick = useThemeTick();
  const tref = useRef(spec.start), dragging = useRef(false), cols = useRef<Cols | null>(null), analyser = useRef<AnalyserNode | null>(null), freq = useRef<Uint8Array | null>(null), raf = useRef(0);
  const height = H[spec.height as keyof typeof H] ?? 96;
  const chapterT = useMemo(() => spec.chapters.map((c) => c.t), [spec.chapters]);
  const D = dur || spec.duration || 0;
  const map = useMemo(() => waveMap(D || 1, w || 600, chapterT, 3), [D, w, chapterT]);

  // ---- the audio element
  const seek = useCallback((to: number) => {
    const a = audioEl.current, d = (a && Number.isFinite(a.duration) && a.duration) || D || 0;
    const v = clamp(to, 0, d || to); tref.current = v; if (a) a.currentTime = v; setT(v);
  }, [D]);
  const toggle = useCallback(() => { const a = audioEl.current; if (!a) return; if (a.paused) void a.play().catch(() => setErr(STR.loadFail)); else a.pause(); }, []);
  useEffect(() => {
    const a = audioEl.current; if (!a) return;
    const onMeta = () => { if (Number.isFinite(a.duration)) setDur(a.duration); if (spec.start && a.currentTime < 0.01) a.currentTime = spec.start; };
    const onTime = () => { if (!dragging.current) { tref.current = a.currentTime; setT(a.currentTime); } };
    const onProg = () => { try { setBuffered(a.buffered.length ? a.buffered.end(a.buffered.length - 1) : 0); } catch {} };
    const on = ["loadedmetadata", "durationchange"].map((n) => (a.addEventListener(n, onMeta), n));
    a.addEventListener("timeupdate", onTime); a.addEventListener("progress", onProg);
    const pl = () => setPlaying(true), pa = () => setPlaying(false), er = () => setErr(`${STR.loadFail}: ${spec.src}`);
    a.addEventListener("play", pl); a.addEventListener("pause", pa); a.addEventListener("ended", pa); a.addEventListener("error", er);
    if (a.readyState >= 1) onMeta();
    return () => { on.forEach((n) => a.removeEventListener(n, onMeta)); a.removeEventListener("timeupdate", onTime); a.removeEventListener("progress", onProg); a.removeEventListener("play", pl); a.removeEventListener("pause", pa); a.removeEventListener("ended", pa); a.removeEventListener("error", er); };
  }, [spec.src, spec.start]);
  useEffect(() => { const a = audioEl.current; if (a) { a.playbackRate = rate; a.muted = muted; a.volume = vol; } }, [rate, muted, vol]);

  // ---- peaks: a peaks file, else decode the file when it is on our own origin and small, else a flat line until it plays
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        if (peaksUrl) {
          const r = await fetch(peaksUrl); const txt = await r.text();
          if (txt.length > caps.peaksBytes) throw new Error(`the peaks file is over ${Math.round(caps.peaksBytes / 1000)} KB`);
          const p = peaksOf(JSON.parse(txt), caps.waveformSamples); if (!p) throw new Error(`the peaks file is not audiowaveform JSON, or has over ${caps.waveformSamples} samples`);
          if (!dead) setPeaks(p); return;
        }
      } catch (e: any) { if (!dead) setNote(`Peaks: ${e.message ?? e}; the wave is drawn from the file instead.`); }
      try {
        if (!src || !sameOrigin(src)) return;
        const head = await fetch(src, { method: "HEAD" }).catch(() => null);
        const len = +(head?.headers.get("content-length") ?? 0);
        if (len > caps.decodeBytes) { if (!dead) setNote(`The file is over ${Math.round(caps.decodeBytes / 1048576)} MB, so its wave is not drawn before it plays.`); return; }
        const buf = await (await fetch(src)).arrayBuffer();
        if (buf.byteLength > caps.decodeBytes) return;
        const ctx = new OfflineAudioContext(1, 1, 22050);
        const au = await ctx.decodeAudioData(buf);
        const ch = au.getChannelData(0), n = Math.min(caps.waveformSamples, 1600), out = new Array<number>(n).fill(0), per = Math.max(1, Math.floor(ch.length / n));
        for (let i = 0; i < n; i++) { let m = 0; for (let k = i * per; k < Math.min(ch.length, (i + 1) * per); k += 4) { const v = Math.abs(ch[k]); if (v > m) m = v; } out[i] = m; }
        const top = Math.max(0.01, ...out); if (!dead) setPeaks(out.map((x) => x / top));
      } catch { /* a flat line until it plays */ }
    })();
    return () => { dead = true; };
  }, [peaksUrl, src, caps]);

  // ---- a transcript file (WebVTT or SRT), when the author named one
  useEffect(() => {
    if (!transcriptUrl || spec.cues.length) return;
    let dead = false;
    fetch(transcriptUrl).then((r) => r.text()).then((txt) => {
      const budget = new Budget(partLimitsOf(), null, null, "the audio part");
      const list = parseVtt(txt, budget, caps.vttCues).map((c): Cue => { const [sp, text] = speakerOf(c.text); return { t: c.start, speaker: sp, text: text.split("\n").join(" "), line: 0 }; });
      if (!dead) setCues(list.slice(0, caps.transcriptLines));
    }).catch(() => {});
    return () => { dead = true; };
  }, [transcriptUrl, spec.cues.length, caps]);

  // ---- the wave
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const draw = useCallback(() => {
    const c = canvas.current, r = root.current; if (!c || !r) return;
    const cw = c.clientWidth, ch = c.clientHeight; if (!cw || !ch) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
    const g = c.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    if (!cols.current) cols.current = readCols(r, spec.tone);
    const k = cols.current, now = tref.current, style = spec.wave;
    const barW = parseFloat(cssVar(r, "--audio-bar-w")) || 3, barGap = parseFloat(cssVar(r, "--audio-bar-gap")) || 2;
    const gap = parseFloat(cssVar(r, "--audio-chapter-gap")) || 3;
    const live = style === "live";
    const grad = g.createLinearGradient(0, 0, cw, 0); grad.addColorStop(0, k.played); grad.addColorStop(1, k.played2);
    const mid = ch / 2, maxH = ch * 0.92;
    // sound level around the playhead, from the analyser when there is one, else from a slow pulse on the peaks
    const lv = (i: number): number => {
      if (!playing || reduced) return 0;
      if (analyser.current && freq.current) { analyser.current.getByteFrequencyData(freq.current as any); return (freq.current[Math.min(freq.current.length - 1, 2 + i * 3)] ?? 0) / 255; }
      return 0.5 + 0.5 * Math.sin(performance.now() / 110 + i * 0.9);
    };
    const place = live ? null : waveMap(D || 1, cw, chapterT, gap);
    const px = live ? cw / 2 : place!.xOf(now);
    const pitch = barW + barGap, n = Math.max(1, Math.floor((live ? cw : place!.usable) / pitch));
    const WINDOW = 8; // seconds shown by the live wave
    const peakAt = (tm: number) => { if (!peaks || !D) return 0.04; const i = clamp(Math.floor((tm / D) * peaks.length), 0, peaks.length - 1); return peaks[i]; };
    const bars = live ? null : barsOf(peaks ?? [], n);
    const count = live ? n : n;
    for (let i = 0; i < count; i++) {
      let x: number, tm: number, amp: number;
      if (live) { x = i * pitch; tm = now + ((x - cw / 2) / cw) * WINDOW; if (tm < 0 || tm > D) continue; amp = peakAt(tm); }
      else { tm = ((i + 0.5) / n) * D; x = place!.xOf(tm) - barW / 2; amp = bars![i] ?? 0; }
      const dist = Math.abs(x + barW / 2 - px) / pitch;
      const bounce = !reduced && playing && dist < 16 ? (1 + 0.55 * lv(Math.round(dist)) * Math.exp(-(dist * dist) / 60)) : 1;
      const hgt = clamp((style === "dots" ? Math.max(0.06, amp) : Math.max(0.05, amp)) * maxH * bounce, 3, maxH);
      const isPlayed = x + barW / 2 <= px;
      g.fillStyle = isPlayed ? grad : k.wave;
      if (style === "dots") {
        const rows = Math.max(1, Math.round(hgt / 7)); g.beginPath();
        for (let j = 0; j < rows; j++) { g.moveTo(x + barW / 2 + 1.6, mid - ((rows - 1) / 2 - j) * 7); g.arc(x + barW / 2, mid - ((rows - 1) / 2 - j) * 7, Math.max(1.4, barW / 2), 0, Math.PI * 2); }
        g.fill();
      } else if (style === "mirror") {
        const top = ch * 0.62, up = hgt * 0.62, dn = hgt * 0.34;
        g.beginPath(); g.roundRect(x, top - up, barW, up, barW / 2); g.fill();
        g.globalAlpha = 0.35; g.beginPath(); g.roundRect(x, top + 2, barW, dn, barW / 2); g.fill(); g.globalAlpha = 1;
      } else if (style === "line") {
        // drawn after the loop as a path
      } else { g.beginPath(); g.roundRect(x, mid - hgt / 2, barW, hgt, barW / 2); g.fill(); }
    }
    if (style === "line") {
      const pts: [number, number][] = [];
      for (let i = 0; i < count; i++) { const tm = ((i + 0.5) / n) * D; const x = place!.xOf(tm); const amp = (bars![i] ?? 0) * maxH * 0.5; pts.push([x, amp]); }
      const path = (upto: number) => { g.beginPath(); g.moveTo(pts[0]?.[0] ?? 0, mid); for (const [x, a] of pts) if (x <= upto) g.lineTo(x, mid - a); g.lineTo(Math.min(upto, pts[pts.length - 1]?.[0] ?? 0), mid); for (let i = pts.length - 1; i >= 0; i--) if (pts[i][0] <= upto) g.lineTo(pts[i][0], mid + pts[i][1]); g.closePath(); };
      g.fillStyle = k.wave; path(cw); g.fill(); g.fillStyle = grad; path(px); g.fill();
    }
    // the buffered part: a thin line under the wave
    if (!live && buffered && D) { g.fillStyle = k.buffer; g.fillRect(0, ch - 2, place!.xOf(buffered), 2); }
    // the playhead: a line with a dot
    g.fillStyle = k.head; g.fillRect(Math.round(px) - 1, 2, 2, ch - 4); g.beginPath(); g.arc(px, 4, 4, 0, Math.PI * 2); g.fill();
  }, [D, peaks, chapterT, spec.wave, spec.tone, playing, reduced, buffered]);
  // colours are read again when the theme changes
  useEffect(() => { cols.current = null; draw(); }, [themeTick, draw]);
  useEffect(() => { draw(); }, [t, w, peaks, draw]);
  // while it plays, the wave is redrawn on every frame (the playhead glides and the bars around it move with the sound)
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(raf.current); return; }
    const a = audioEl.current;
    // the analyser reads the sound only when the file is on our own origin (a cross-origin file would go silent)
    if (a && !analyser.current && sameOrigin(src)) {
      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        const ctx = new AC(); const s = ctx.createMediaElementSource(a); const an = ctx.createAnalyser(); an.fftSize = 128; an.smoothingTimeConstant = 0.7;
        s.connect(an); an.connect(ctx.destination); analyser.current = an; freq.current = new Uint8Array(an.frequencyBinCount);
      } catch { /* the pulse stands in */ }
    }
    const loop = () => { if (a && !dragging.current) tref.current = a.currentTime; draw(); raf.current = requestAnimationFrame(loop); };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, draw, src]);

  // ---- seeking on the wave: a click, a drag, keys
  const drag = useDrag((f, phase) => {
    dragging.current = phase !== "up";
    const to = map.tOf(f * (w || 1)); tref.current = to; setT(to); draw();
    if (phase === "up") seek(to);
    else if (phase === "down") { /* the sound follows on release; the wave follows the finger now */ }
  }, (cx) => { const r = wrap.current!.getBoundingClientRect(); return clamp((cx - r.left) / r.width, 0, 1); });

  const chapterNow = useMemo(() => { let k = -1; for (let i = 0; i < spec.chapters.length; i++) if (spec.chapters[i].t <= t + 0.05) k = i; return k; }, [spec.chapters, t]);
  const key = (e: React.KeyboardEvent) => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key, step = (s: number) => { e.preventDefault(); seek(tref.current + s); };
    if ((k === " " || k === "Enter") && onButton(e)) return;
    if (k === " " || k === "k") { e.preventDefault(); toggle(); }
    else if (k === "j") step(-10); else if (k === "l") step(10);
    else if (k === "ArrowLeft") step(-5); else if (k === "ArrowRight") step(5);
    else if (k === "Home") { e.preventDefault(); seek(0); } else if (k === "End") { e.preventDefault(); seek(D); }
    else if (k === "," || k === ".") { e.preventDefault(); const i = spec.speeds.indexOf(rate); setRate(spec.speeds[clamp((i < 0 ? spec.speeds.indexOf(1) : i) + (k === "." ? 1 : -1), 0, spec.speeds.length - 1)]); }
    else if (k.length === 1 && k >= "0" && k <= "9") { e.preventDefault(); seek((+k / 10) * D); }
    else if (k === "m") setMuted((m) => !m);
  };

  const title = spec.title || spec.src.split("/").pop() || "";
  const valueText = `${fmtTime(t)} ${STR.of} ${fmtTime(D)}`;
  const skip = spec.skip || 10;

  return (
    <div ref={root} className={`am dh-media${spec.compact ? " is-compact" : ""}${playing ? " is-playing" : ""}`} data-wave={spec.wave} data-h={spec.height} data-tone={spec.tone} onKeyDown={key}
      style={{ "--audio-wave-h": `${height}px` } as React.CSSProperties}>
      <audio ref={audioEl} src={src || undefined} preload="metadata" loop={spec.loop} />
      <div className="am-top">
        <button type="button" className="m-play" data-dh-slot="play" onClick={toggle} aria-label={playing ? STR.pause : STR.play} title={playing ? STR.pause : STR.play}><Icon n={playing ? "pause" : "play"} size={26} /></button>
        {spec.compact ? null : (
          <div className="am-title"><b>{title}</b><span className="am-sub" aria-live="off">{chapterNow >= 0 ? spec.chapters[chapterNow].title : " "}</span></div>
        )}
        <div className="am-wavebox">
          <div className="am-wave" ref={wrap} data-dh-slot="wave" role="slider" tabIndex={0} aria-label={`${STR.seek}${spec.title ? `: ${spec.title}` : ""}`} aria-valuemin={0} aria-valuemax={Math.round(D)} aria-valuenow={Math.round(t)} aria-valuetext={valueText} {...drag}>
            <canvas ref={canvas} aria-hidden="true" />
            {spec.markers.map((m, i) => (
              <button key={i} type="button" className={`am-flag tone-${m.tone}${map.xOf(m.t) > (w || 600) * 0.5 ? " is-right" : ""}`} data-dh-slot="marker" style={{ left: spec.wave === "live" ? undefined : `${map.xOf(m.t)}px`, ...(spec.wave === "live" ? { display: "none" } : {}) }} onPointerDown={(e) => e.stopPropagation()} onClick={() => seek(m.t)} aria-label={`${STR.markers}: ${fmtTime(m.t)} ${m.title}`}>
                <Icon n="flag" size={14} /><span className="am-flag-tip">{fmtTime(m.t)} {m.title}</span>
              </button>
            ))}
          </div>
          <div className="am-time" data-dh-slot="time"><span>{fmtTime(t)}</span><span className="am-time-sep">/</span><span>{fmtTime(D)}</span></div>
        </div>
      </div>
      {spec.chapters.length && !spec.compact ? (
        <div className="am-chapters" role="group" aria-label={STR.chapters}>
          {spec.chapters.map((c, i) => <button key={i} type="button" className="m-chip" data-dh-slot="chapter" aria-current={i === chapterNow ? "true" : undefined} onClick={() => seek(c.t)}><span className="m-chip-t">{fmtTime(c.t)}</span>{c.title}</button>)}
        </div>
      ) : null}
      <div className="m-row">
        {spec.skip ? <button type="button" className="m-ctl" onClick={() => seek(tref.current - skip)} aria-label={`${STR.back} ${skip} ${STR.seconds}`} title={`${STR.back} ${skip} ${STR.seconds}`}><Icon n="back" /><span className="m-ctl-n">{skip}</span></button> : null}
        {spec.skip ? <button type="button" className="m-ctl" onClick={() => seek(tref.current + skip)} aria-label={`${STR.forward} ${skip} ${STR.seconds}`} title={`${STR.forward} ${skip} ${STR.seconds}`}><Icon n="fwd" /><span className="m-ctl-n">{skip}</span></button> : null}
        <span className="m-grow" />
        {spec.speed ? <Menu label={STR.speed} value={`${rate}×`} slot="speed" wide items={spec.speeds.map((s) => ({ key: String(s), label: `${s}×` }))} onPick={(k) => setRate(+k)} icon="speed" /> : null}
        {spec.volume ? (
          <span className="m-vol" data-dh-slot="volume">
            <button type="button" className="m-ctl" onClick={() => setMuted((m) => !m)} aria-label={muted ? STR.unmute : STR.mute} aria-pressed={muted} title={muted ? STR.unmute : STR.mute}><Icon n={muted || vol === 0 ? "mute" : "vol"} /></button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} aria-label={STR.volume} onChange={(e) => { setVol(+e.target.value); setMuted(+e.target.value === 0); }} />
          </span>
        ) : null}
        {spec.download && src ? <a className="m-ctl" href={src} download aria-label={STR.download} title={STR.download}><Icon n="dl" /></a> : null}
        {spec.transcript !== "off" && (cues.length || transcriptUrl) ? <button type="button" className="m-ctl has-text" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={STR.transcript}><Icon n="text" size={20} /><span>{STR.transcript}</span></button> : null}
      </div>
      {open && cues.length ? <Transcript cues={cues} t={t} onSeek={seek} reduced={reduced} /> : null}
      {!src ? <p className="m-err" role="note">{STR.addressRefused}</p> : err ? <p className="m-err" role="alert">{err}</p> : note ? <p className="m-note">{note}</p> : null}
    </div>
  );
}
