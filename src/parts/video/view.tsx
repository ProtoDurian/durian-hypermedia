// The video part (format version 11): our own controls over the browser's video element. A big play button on the poster,
// a seek bar with the chapters as segments (hover shows the chapter and, with thumbs:, a still), time, volume, speed,
// captions drawn by us from WebVTT, picture in picture and full screen. Keys as on the big sites; on a phone a double
// tap on the left or right third jumps 10 s. `clip` is a short silent loop that plays only while in view.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Budget, partLimitsOf } from "../../core/budget";
import type { PartViewProps } from "../types";
import { extOf, fmtTime } from "../downloads/media";
import { Icon, Menu, STR, clamp, onButton, pct, typing, useDrag, useMediaUrl, useNear, useReducedMotion } from "../downloads/media-ui";
import { mediaText } from "../downloads/media-fetch";
import { Transcript } from "../audio/transcript";
import { parseVtt, speakerOf, type VttCue } from "../audio/timed";
import type { VideoSpec } from "./part";

const MIME: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", ogv: "video/ogg", mov: "video/quicktime", m3u8: "application/vnd.apple.mpegurl" };
type Thumb = { src: string; x: number; y: number; w: number; h: number } | null;
/** "sprite.jpg#xywh=0,0,160,90" to the file and [x, y, w, h] (160 by 90 when there is none): one scan, no regular expression */
function splitXywh(t: string): [string, [number, number, number, number]] {
  const k = t.indexOf("#xywh=");
  const dflt: [number, number, number, number] = [0, 0, 160, 90];
  if (k < 0) return [t, dflt];
  const nums = t.slice(k + 6).split(",");
  if (nums.length !== 4) return [t, dflt];
  const v = nums.map((n) => (n.length > 0 && n.length < 6 && [...n].every((c) => c >= "0" && c <= "9") ? +n : NaN));
  return v.some((n) => Number.isNaN(n)) ? [t, dflt] : [t.slice(0, k), [v[0], v[1], v[2], v[3]]];
}

/** a budget of its own for reading one file in the browser (the page's budget was spent when the page was parsed) */
const scratch = () => new Budget(partLimitsOf(), null, null, "the video part");

export default function VideoView({ data: spec }: PartViewProps<VideoSpec>) {
  const url = useMediaUrl();
  const src = url(spec.src, "image") ?? "";
  const caps = spec.caps;
  const posterUrl = spec.poster ? url(spec.poster, "image") : null;
  const sourceUrls = [spec.src, ...spec.sources].map((s) => ({ s, u: url(s, "image") })).filter((x): x is { s: string; u: string } => !!x.u);
  const root = useRef<HTMLDivElement>(null), vid = useRef<HTMLVideoElement>(null), bar = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(spec.start), [dur, setDur] = useState(spec.duration ?? 0), [playing, setPlaying] = useState(false), [started, setStarted] = useState(false), [buffered, setBuffered] = useState(0);
  const [rate, setRate] = useState(1), [muted, setMuted] = useState(spec.clip), [vol, setVol] = useState(1), [cc, setCc] = useState(-1), [tracks, setTracks] = useState<Record<number, VttCue[]>>({});
  const [thumbs, setThumbs] = useState<{ start: number; end: number; text: string }[]>([]), [hover, setHover] = useState<{ x: number; t: number } | null>(null), [idle, setIdle] = useState(false);
  const [full, setFull] = useState(false), [err, setErr] = useState(""), [flash, setFlash] = useState<{ side: "l" | "r"; n: number } | null>(null), [open, setOpen] = useState(spec.transcript === "open");
  const [cues, setCues] = useState(spec.cues), [pipOk, setPipOk] = useState(false);
  const reduced = useReducedMotion(), near = useNear(root, 120);
  const dragging = useRef(false), tref = useRef(spec.start), idleT = useRef<any>(0), tap = useRef<{ at: number; side: string; timer: any } | null>(null);
  const D = dur || spec.duration || 0;
  const needsHls = extOf(spec.src) === "m3u8";

  const seek = useCallback((to: number) => { const v = vid.current, d = (v && Number.isFinite(v.duration) && v.duration) || D; const x = clamp(to, 0, d || to); tref.current = x; if (v) v.currentTime = x; setT(x); }, [D]);
  const toggle = useCallback(() => { const v = vid.current; if (!v) return; if (v.paused) { setStarted(true); void v.play().catch(() => setErr(`${STR.loadFail}: ${spec.src}`)); } else v.pause(); }, [spec.src]);

  useEffect(() => {
    const v = vid.current; if (!v) return;
    const meta = () => { if (Number.isFinite(v.duration)) setDur(v.duration); if (spec.start && v.currentTime < 0.01) v.currentTime = spec.start; };
    const time = () => { if (!dragging.current) { tref.current = v.currentTime; setT(v.currentTime); } };
    const prog = () => { try { setBuffered(v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0); } catch {} };
    const pl = () => { setPlaying(true); setStarted(true); }, pa = () => setPlaying(false), er = () => setErr(`${STR.loadFail}: ${spec.src}`);
    const evs: [string, any][] = [["loadedmetadata", meta], ["durationchange", meta], ["timeupdate", time], ["progress", prog], ["play", pl], ["pause", pa], ["ended", pa], ["error", er]];
    for (const [n, f] of evs) v.addEventListener(n, f);
    if (v.readyState >= 1) meta();
    setPipOk(!!(document as any).pictureInPictureEnabled && !!v.requestPictureInPicture);
    return () => { for (const [n, f] of evs) v.removeEventListener(n, f); };
  }, [spec.src, spec.start]);
  useEffect(() => { const v = vid.current; if (v) { v.playbackRate = rate; v.muted = muted; v.volume = vol; } }, [rate, muted, vol]);
  useEffect(() => { const f = () => setFull(document.fullscreenElement === root.current); document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);
  // a clip plays while it is in view, and stops off screen or with reduced motion
  useEffect(() => { const v = vid.current; if (!v || !spec.clip) return; if (near && !reduced) void v.play().catch(() => {}); else v.pause(); }, [near, reduced, spec.clip]);
  // a transcript file
  useEffect(() => {
    if (!spec.transcriptFile || spec.cues.length) return; let dead = false;
    const tu = url(spec.transcriptFile, "image"); if (!tu) return;
    const controller = new AbortController();
    mediaText(tu, caps.transcriptBytes, controller.signal).then((txt) => { if (dead) return; const l = parseVtt(txt, scratch(), caps.vttCues).map((c) => { const [sp, text] = speakerOf(c.text); return { t: c.start, speaker: sp, text: text.split("\n").join(" "), line: 0 }; }); setCues(l.slice(0, caps.transcriptLines)); }).catch(() => {});
    return () => { dead = true; controller.abort(); };
  }, [spec.transcriptFile, spec.cues.length, url, caps]);
  // captions: the chosen track is fetched once, and drawn by us
  useEffect(() => {
    if (cc < 0 || tracks[cc]) return; let dead = false;
    const cu = url(spec.captions[cc].src, "image");
    if (!cu) { setTracks((x) => ({ ...x, [cc]: [] })); return; }
    const controller = new AbortController();
    mediaText(cu, caps.vttBytes, controller.signal).then((txt) => { if (!dead) setTracks((x) => ({ ...x, [cc]: parseVtt(txt, scratch(), caps.vttCues) })); }).catch(() => { if (!dead) setTracks((x) => ({ ...x, [cc]: [] })); });
    return () => { dead = true; controller.abort(); };
  }, [cc, spec.captions, url, caps, tracks]);
  useEffect(() => { const d = spec.captions.findIndex((c) => c.default); if (d >= 0) setCc(d); }, [spec.captions]);
  // thumbnails
  useEffect(() => {
    if (!spec.thumbs) return; let dead = false;
    const th = url(spec.thumbs, "image"); if (!th) return;
    const controller = new AbortController();
    mediaText(th, caps.thumbsBytes, controller.signal).then((txt) => { if (!dead) setThumbs(parseVtt(txt, scratch(), caps.vttCues).map((c) => ({ start: c.start, end: c.end, text: c.text.trim() }))); }).catch(() => {});
    return () => { dead = true; controller.abort(); };
  }, [spec.thumbs, url, caps]);

  // controls hide after a while of a playing video with no pointer movement
  const wake = useCallback(() => { setIdle(false); clearTimeout(idleT.current); idleT.current = setTimeout(() => { if (!root.current?.contains(document.activeElement) || document.activeElement === stage.current) setIdle(true); }, 2600); }, []);
  useEffect(() => { if (!playing) { clearTimeout(idleT.current); setIdle(false); } else wake(); return () => clearTimeout(idleT.current); }, [playing, wake]);

  const segs = useMemo(() => {
    const ch = spec.chapters; const total = D || 1;
    if (!ch.length) return [{ a: 0, b: total, title: "" }];
    const starts = ch[0].t > 0 ? [{ t: 0, title: "" }, ...ch] : ch;
    return starts.map((c, i) => ({ a: c.t, b: starts[i + 1]?.t ?? total, title: c.title }));
  }, [spec.chapters, D]);
  const drag = useDrag((f, phase) => { dragging.current = phase !== "up"; const to = f * (D || 0); tref.current = to; setT(to); if (phase === "up") seek(to); }, (cx) => { const r = bar.current!.getBoundingClientRect(); return clamp((cx - r.left) / r.width, 0, 1); });
  const segAt = (tm: number) => segs.find((s) => tm >= s.a && tm < s.b) ?? segs[segs.length - 1];
  const thumbAt = (tm: number): Thumb => {
    const c = thumbs.find((x) => tm >= x.start && tm < x.end) ?? null; if (!c) return null;
    const [file, xywh] = splitXywh(c.text);
    const u = url(file, "image"); if (!u) return null;
    return { src: u, x: xywh[0], y: xywh[1], w: xywh[2], h: xywh[3] };
  };

  const fullscreen = () => { const r = root.current as any; if (document.fullscreenElement) void document.exitFullscreen(); else if (r?.requestFullscreen) void r.requestFullscreen().catch(() => {}); else (vid.current as any)?.webkitEnterFullscreen?.(); };
  const pip = () => { const v = vid.current as any; if ((document as any).pictureInPictureElement) void (document as any).exitPictureInPicture(); else void v?.requestPictureInPicture?.().catch(() => {}); };

  const key = (e: React.KeyboardEvent) => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key, step = (s: number) => { e.preventDefault(); seek(tref.current + s); wake(); };
    if ((k === " " || k === "Enter") && onButton(e)) return;
    if (k === " " || k === "k") { e.preventDefault(); toggle(); }
    else if (k === "j") step(-10); else if (k === "l") step(10);
    else if (k === "ArrowLeft") step(-5); else if (k === "ArrowRight") step(5);
    else if (k === "ArrowUp") { e.preventDefault(); setVol((v) => clamp(v + 0.1, 0, 1)); setMuted(false); } else if (k === "ArrowDown") { e.preventDefault(); setVol((v) => clamp(v - 0.1, 0, 1)); }
    else if (k === "f") { e.preventDefault(); fullscreen(); } else if (k === "c" && spec.captions.length) { e.preventDefault(); setCc((c) => (c < 0 ? Math.max(0, spec.captions.findIndex((x) => x.default)) : -1)); }
    else if (k === "i" && pipOk) { e.preventDefault(); pip(); } else if (k === "m") setMuted((m) => !m);
    else if ((k === "," || k === ".") && vid.current?.paused) { e.preventDefault(); seek(tref.current + (k === "." ? 1 : -1) / 30); }
    else if (k.length === 1 && k >= "0" && k <= "9") { e.preventDefault(); seek((+k / 10) * D); }
    else if (k === "Home") { e.preventDefault(); seek(0); } else if (k === "End") { e.preventDefault(); seek(D); }
  };
  // a tap on the picture: play or pause; a double tap on the left or right third jumps 10 s (a mouse double click is full screen)
  const stageUp = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, .vm-bar")) return;
    const r = stage.current!.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, side = x < 1 / 3 ? "l" : x > 2 / 3 ? "r" : "m", now = performance.now();
    if (e.pointerType === "mouse") { if (tap.current && now - tap.current.at < 320) { clearTimeout(tap.current.timer); tap.current = null; fullscreen(); } else { tap.current = { at: now, side, timer: setTimeout(() => { tap.current = null; toggle(); }, 300) }; } wake(); return; }
    if (tap.current && now - tap.current.at < 320 && side !== "m" && tap.current.side === side) {
      clearTimeout(tap.current.timer); tap.current = null; seek(tref.current + (side === "l" ? -10 : 10)); setFlash({ side, n: Math.random() }); window.setTimeout(() => setFlash(null), 700);
    } else { if (tap.current) clearTimeout(tap.current.timer); tap.current = { at: now, side, timer: setTimeout(() => { tap.current = null; if (idle || !playing) toggle(); else wake(); }, 300) }; }
  };

  const capCue = cc >= 0 ? (tracks[cc] ?? []).find((c) => t >= c.start && t < c.end) : undefined;
  const title = spec.title || spec.src.split("/").pop() || "";
  const ctl = !playing || !idle;
  const skip = spec.skip;
  const chapterNow = segAt(t)?.title;
  const fracT = D ? t / D : 0;
  const hoverSeg = hover ? segAt(hover.t) : null, hoverThumb = hover ? thumbAt(hover.t) : null;

  if (spec.clip) {
    return (
      <div ref={root} className={`vm vm-clip dh-media${playing ? " is-playing" : ""}`} data-clip="1" data-h={spec.height}>
        <div className="vm-stage" data-dh-slot="poster">
          <video ref={vid} muted loop playsInline preload="metadata" poster={posterUrl ?? undefined} aria-label={title}>{sourceUrls.map(({ s, u }) => <source key={s} src={u} type={MIME[extOf(s)]} />)}</video>
          <button type="button" className="vm-clipbtn m-ctl" onClick={toggle} aria-label={playing ? STR.pause : STR.play}><Icon n={playing ? "pause" : "play"} size={20} /></button>
          {!reduced ? null : <span className="vm-cliphint">{STR.stillFrame}</span>}
        </div>
      </div>
    );
  }
  return (
    <div ref={root} className={`vm dh-media${playing ? " is-playing" : ""}${started ? " is-started" : ""}${ctl ? " has-ctl" : " no-ctl"}${full ? " is-full" : ""}`} data-h={spec.height} onKeyDown={key} onPointerMove={() => playing && wake()}>
      <div ref={stage} className="vm-stage" tabIndex={0} role="group" aria-label={title} onPointerUp={stageUp}>
        <video ref={vid} playsInline preload="metadata" loop={spec.loop} poster={posterUrl ?? undefined} data-dh-slot="poster">
          {sourceUrls.map(({ s, u }) => <source key={s} src={u} type={MIME[extOf(s)]} />)}
        </video>
        {!started && !playing ? <button type="button" className="vm-bigplay" data-dh-slot="big-play" onClick={toggle} aria-label={`${STR.play}: ${title}`}><Icon n="play" size={38} /></button> : null}
        {flash ? <span className={`vm-flash vm-flash-${flash.side}`} key={flash.n}>{flash.side === "l" ? "−10" : "+10"}</span> : null}
        {capCue ? <div className="vm-cc" data-dh-slot="captions" aria-live="off">{capCue.text.split("\n").map((l, i) => <span key={i}>{l}</span>)}</div> : null}
        {needsHls && typeof document !== "undefined" && vid.current && !vid.current.canPlayType("application/vnd.apple.mpegurl") ? <p className="m-err">This browser cannot play streams; a host can pass hls.js.</p> : null}
        <div className="vm-bar" data-dh-slot="bar">
          <div className="vm-seek" ref={bar} role="slider" tabIndex={0} aria-label={`${STR.seek}: ${title}`} aria-valuemin={0} aria-valuemax={Math.round(D)} aria-valuenow={Math.round(t)} aria-valuetext={`${fmtTime(t)} ${STR.of} ${fmtTime(D)}${chapterNow ? `, ${chapterNow}` : ""}`}
            {...drag} onPointerMove={(e) => { const r = bar.current!.getBoundingClientRect(); const f = clamp((e.clientX - r.left) / r.width, 0, 1); setHover({ x: f, t: f * D }); drag.onPointerMove(e); }} onPointerLeave={() => setHover(null)}>
            <div className="vm-track">
              {segs.map((s, i) => {
                const len = Math.max(1e-6, s.b - s.a), p = clamp((t - s.a) / len, 0, 1), b = clamp((buffered - s.a) / len, 0, 1);
                return <div key={i} className="vm-seg" data-dh-slot="chapter" style={{ flex: `${len} 1 0` }}><i className="vm-buf" style={{ width: pct(b) }} /><i className="vm-played" style={{ width: pct(p) }} /></div>;
              })}
              <i className="vm-knob" style={{ left: pct(fracT) }} />
            </div>
            {hover && D ? (
              <div className="vm-tip" data-dh-slot="thumb" style={{ left: `clamp(60px, ${pct(hover.x)}, calc(100% - 60px))` }}>
                {hoverThumb ? <span className="vm-thumb" style={{ width: hoverThumb.w, height: hoverThumb.h, backgroundImage: `url("${hoverThumb.src}")`, backgroundPosition: `-${hoverThumb.x}px -${hoverThumb.y}px` }} /> : null}
                {hoverSeg?.title ? <b>{hoverSeg.title}</b> : null}<span>{fmtTime(hover.t)}</span>
              </div>
            ) : null}
          </div>
          <div className="m-row">
            <button type="button" className="m-ctl" onClick={toggle} aria-label={playing ? STR.pause : STR.play} title={playing ? STR.pause : STR.play}><Icon n={playing ? "pause" : "play"} /></button>
            {skip ? <button type="button" className="m-ctl vm-skip" onClick={() => seek(tref.current - skip)} aria-label={`${STR.back} ${skip} ${STR.seconds}`}><Icon n="back" /><span className="m-ctl-n">{skip}</span></button> : null}
            <span className="m-vol vm-vol" data-dh-slot="volume">
              <button type="button" className="m-ctl" onClick={() => setMuted((m) => !m)} aria-label={muted ? STR.unmute : STR.mute} aria-pressed={muted}><Icon n={muted || vol === 0 ? "mute" : "vol"} /></button>
              <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} aria-label={STR.volume} onChange={(e) => { setVol(+e.target.value); setMuted(+e.target.value === 0); }} />
            </span>
            <span className="vm-time" data-dh-slot="time">{fmtTime(t)} / {fmtTime(D)}</span>
            <span className="m-grow" />
            {spec.speed ? <Menu label={STR.speed} value={`${rate}×`} slot="speed" wide icon="speed" items={spec.speeds.map((s) => ({ key: String(s), label: `${s}×` }))} onPick={(k) => setRate(+k)} /> : null}
            {spec.captions.length ? <Menu label={STR.captions} value={cc < 0 ? STR.captionsOff : spec.captions[cc].label} slot="captions-menu" icon="cc" items={[{ key: "-1", label: STR.captionsOff }, ...spec.captions.map((c, i) => ({ key: String(i), label: c.label }))]} onPick={(k) => setCc(+k)} /> : null}
            {cues.length && spec.transcript !== "off" ? <button type="button" className="m-ctl" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label={STR.transcript} title={STR.transcript}><Icon n="text" /></button> : null}
            {spec.download && src ? <a className="m-ctl" href={src} download aria-label={STR.download}><Icon n="dl" /></a> : null}
            {pipOk ? <button type="button" className="m-ctl" data-dh-slot="pip" onClick={pip} aria-label={STR.pip} title={STR.pip}><Icon n="pip" /></button> : null}
            <button type="button" className="m-ctl" data-dh-slot="fullscreen" onClick={fullscreen} aria-label={full ? STR.exitFullscreen : STR.fullscreen} title={full ? STR.exitFullscreen : STR.fullscreen}><Icon n={full ? "unfull" : "full"} /></button>
          </div>
        </div>
      </div>
      {open && cues.length ? <Transcript cues={cues} t={t} onSeek={seek} reduced={reduced} /> : null}
      {!sourceUrls.length ? <p className="m-err" role="note">{STR.addressRefused}</p> : err ? <p className="m-err" role="alert">{err}</p> : null}
    </div>
  );
}
