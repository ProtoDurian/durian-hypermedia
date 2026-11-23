// The Lottie part (format version 11): lottie-web's light build (no expressions, so no eval), loaded when the part scrolls
// near. Our own controls (play, pause, a slider, speed, replay). It plays while on screen and stops off it; with reduced
// motion (or start=paused) it shows a still frame. The file is checked at load against the caps (size, frames, layers,
// no expressions, no remote assets) before the library is even fetched. Colour slots named dh-c1 ... take the theme.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Budget } from "../../core/budget";
import type { PartViewProps } from "../types";
import { Icon, Menu, STR, cssVar, toneVar, useMediaUrl, useNear, useReducedMotion, useThemeTick } from "../downloads/media-ui";
import { mediaText } from "../downloads/media-fetch";
import { checkLottieData, recolourLottie } from "./check";
import type { LottieSpec } from "./part";

const H = { s: 160, m: 260, l: 380 } as const;
const SPEEDS = [0.5, 1, 1.5, 2];
function cssToRgb(v: string): [number, number, number] | null {
  try { const c = document.createElement("canvas"); c.width = c.height = 1; const g = c.getContext("2d")!; g.fillStyle = "#000"; g.fillStyle = v; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0] / 255, d[1] / 255, d[2] / 255]; } catch { return null; }
}

/** a budget of its own for reading the file in the browser, sized to the nodes cap (the page's budget was spent when it was parsed) */
const scratch = (nodes: number) => new Budget({ steps: 2 * nodes + 10_000, values: nodes + 10_000, chars: 0 }, null, null, "the lottie part");

export default function LottieView({ data: spec }: PartViewProps<LottieSpec>) {
  const url = useMediaUrl();
  const srcUrl = url(spec.src, "image"), caps = spec.caps;
  const root = useRef<HTMLDivElement>(null), holder = useRef<HTMLDivElement>(null), slider = useRef<HTMLInputElement>(null), label = useRef<HTMLSpanElement>(null);
  const anim = useRef<any>(null), raw = useRef<string>(""), total = useRef(0), want = useRef(false);
  const [err, setErr] = useState(""), [ready, setReady] = useState(false), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(spec.speed);
  const reduced = useReducedMotion(), near = useNear(root, 120), theme = useThemeTick();
  const still = reduced || spec.paused;
  want.current = !still;

  // build (or rebuild after a theme change) the animation from the checked file
  const build = useCallback(async (resume: number | null) => {
    const h = holder.current, r = root.current; if (!h || !r || !raw.current) return;
    const lottie = (await import("lottie-web/build/player/lottie_light")).default as any;
    const data = JSON.parse(raw.current);
    if (spec.colours.length) {
      const map: Record<string, [number, number, number]> = {};
      for (const c of spec.colours) { const rgb = cssToRgb(cssVar(r, toneVar(c.tone))); if (rgb) map[c.name] = rgb; }
      recolourLottie(data, map, scratch(caps.nodes));
    }
    anim.current?.destroy(); h.textContent = "";
    const a = lottie.loadAnimation({ container: h, renderer: "svg", loop: spec.loop, autoplay: false, animationData: data, rendererSettings: { preserveAspectRatio: "xMidYMid meet", progressiveLoad: false } });
    anim.current = a; total.current = a.totalFrames || Math.max(1, (data.op ?? 0) - (data.ip ?? 0));
    a.setSpeed(speed);
    if (slider.current) { slider.current.max = String(Math.max(1, Math.round(total.current) - 1)); }
    a.addEventListener("enterFrame", (e: any) => { const f = Math.round(e.currentTime); if (slider.current && document.activeElement !== slider.current) slider.current.value = String(f); if (label.current) label.current.textContent = `${STR.frame} ${f + 1} / ${Math.round(total.current)}`; });
    a.addEventListener("complete", () => setPlaying(false));
    const stillFrame = Math.max(0, Math.floor(total.current * 0.9));
    if (resume !== null) a.goToAndStop(resume, true); else if (!want.current) a.goToAndStop(stillFrame, true);
    setReady(true);
    if (want.current && resume === null) { /* the near effect starts it */ }
  }, [spec.colours, spec.loop, speed]);

  useEffect(() => {
    let dead = false; const controller = new AbortController();
    (async () => {
      try {
        if (!srcUrl) throw new Error(STR.addressRefused);
        const text = await mediaText(srcUrl, caps.bytes, controller.signal);
        if (dead) return;
        const json = JSON.parse(text);
        const why = checkLottieData(json, new Blob([text]).size, scratch(caps.nodes), caps);
        if (why) throw new Error(why);
        if (dead) return; raw.current = text; await build(null);
      } catch (e: any) { if (!dead) setErr(`${spec.src}: ${e.message ?? e}`); }
    })();
    return () => { dead = true; controller.abort(); anim.current?.destroy(); anim.current = null; };
  }, [srcUrl, caps]); // eslint-disable-line
  // a theme change repaints the colour slots
  useEffect(() => { if (ready && spec.colours.length) { const f = anim.current?.currentFrame ?? 0; void build(Math.round(f)); } }, [theme]); // eslint-disable-line
  // plays while on screen, stops off it (never with reduced motion or start=paused, until the reader presses Play)
  useEffect(() => {
    const a = anim.current; if (!a || !ready) return;
    if (near && !still && !playing && !userPaused.current) { a.play(); setPlaying(true); }
    else if (!near && playing) { a.pause(); setPlaying(false); }
  }, [near, ready, still]); // eslint-disable-line
  const userPaused = useRef(false);
  const toggle = () => { const a = anim.current; if (!a) return; if (playing) { a.pause(); userPaused.current = true; setPlaying(false); } else { userPaused.current = false; if (a.currentFrame >= total.current - 1 && !spec.loop) a.goToAndPlay(0, true); else a.play(); setPlaying(true); } };
  const replay = () => { const a = anim.current; if (!a) return; userPaused.current = false; a.goToAndPlay(0, true); setPlaying(true); };
  useEffect(() => { anim.current?.setSpeed(speed); }, [speed]);
  const h = H[spec.height as keyof typeof H] ?? 260;
  return (
    <div ref={root} className={`lt dh-media${playing ? " is-playing" : ""}`} data-h={spec.height}>
      {spec.title ? <p className="lt-title">{spec.title}</p> : null}
      <div className="lt-stage" style={{ height: h }} data-dh-slot="stage">
        <div ref={holder} className="lt-holder" role="img" aria-label={spec.alt} />
        {!ready && !err ? <span className="lt-load">{STR.loading}</span> : null}
        {err ? <p className="m-err" role="alert">{err}</p> : null}
      </div>
      {!err ? (
        <div className="m-row lt-row">
          <button type="button" className="m-play m-play-s" data-dh-slot="play" onClick={toggle} disabled={!ready} aria-label={playing ? STR.pause2 : STR.play} title={playing ? STR.pause2 : STR.play}><Icon n={playing ? "pause" : "play"} size={20} /></button>
          <button type="button" className="m-ctl" onClick={replay} disabled={!ready} aria-label={STR.replay} title={STR.replay}><Icon n="replay" /></button>
          <input ref={slider} className="lt-range" type="range" min={0} max={100} step={1} defaultValue={0} disabled={!ready} aria-label={STR.frame}
            onInput={(e) => { const a = anim.current; if (!a) return; a.pause(); userPaused.current = true; setPlaying(false); a.goToAndStop(+(e.target as HTMLInputElement).value, true); }} />
          <span ref={label} className="lt-frame" aria-hidden="true" />
          <Menu label={STR.speed} value={`${speed}×`} slot="speed" wide icon="speed" items={SPEEDS.map((s) => ({ key: String(s), label: `${s}×` }))} onPick={(k) => setSpeed(+k)} />
        </div>
      ) : null}
      <p className="lt-alt" data-dh-slot="alt">{spec.alt}{still && ready ? ` (${STR.stillFrame})` : ""}</p>
    </div>
  );
}
