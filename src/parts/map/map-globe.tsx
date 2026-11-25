// The globe (the format, the format): the map's regions on a turning sphere. three.js draws only the sphere (our own boundary data
// painted into one texture, lit softly, seen through an orthographic camera); the pins, the arcs, the region outline, the card and
// every gesture are ours, drawn in the DOM from the same projection, so the look and the touch rules are those of the flat map:
// one finger scrolls the page, two fingers turn and pinch, a mouse drags, Ctrl + scroll zooms, arrows turn, + and - zoom.
// It spins slowly until the reader touches it, the card opens or the reader pauses it; a reduced-motion reader gets it still.
// three.js loads only when a globe is on a page (a dynamic import). With no WebGL the part falls back to the flat map.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { inRegion, type RegionPoly } from "./geo";
import { GLOBE_K, clampLat, globeR, liftedArc, project, unproject, wrapLng, type GCam, type Proj } from "./globe";
import type { MapSpec, MFill } from "./model";
import { reducedMotion } from "../../ui/parts";
import type { GeoData } from "./map-geo";

const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;
export { GLOBE_K, clampLat, project, unproject, liftedArc };
export type { GCam, Proj };
export type GlobeApi = { w: number; h: number; R: number; cam: GCam; proj: (lat: number, lng: number, h?: number) => Proj; arcPoints: (a: { lat: number; lng: number }, b: { lat: number; lng: number }, n?: number) => { x: number; y: number; vis: boolean }[] };
export type GlobeHandle = { zoom: (dz: number) => void; fit: () => void; pause: () => void };
export type GlobeProps = {
  motionOff?:boolean;
  spec: MapSpec; geo: GeoData; fills: MFill[]; colours: Map<string, string>; label: string;
  /** a camera target: the globe turns to it (a new `nonce` is a new target) */
  focus: { lat: number; lng: number; k: number; nonce: number } | null;
  spinning: boolean; active: string | null;
  onRegion: (code: string | null, at: { x: number; y: number }, how: "hover" | "click" | "leave") => void;
  onFail: (why: string) => void; onUser: () => void; onSpinEnd: () => void;
  children: (api: GlobeApi) => React.ReactNode;
};

/** a colour in the canvas's own words (rgb or color()): the page's tokens resolved by the browser, so light and dark follow */
function resolver(host: HTMLElement) {
  const probe = document.createElement("span");
  Object.assign(probe.style,{position:"absolute",width:"0",height:"0",overflow:"hidden",visibility:"hidden",pointerEvents:"none"});
  host.appendChild(probe);
  const cache = new Map<string, string>();
  return { col(expr: string) { let c = cache.get(expr); if (c === undefined) { probe.style.color = ""; probe.style.color = expr; c = getComputedStyle(probe).color; cache.set(expr, c); } return c; }, done: () => probe.remove() };
}

const TEX_W = 2048, TEX_H = 1024;
function paint(canvas: HTMLCanvasElement, host: HTMLElement, geo: GeoData, fills: MFill[], colours: Map<string, string>, states: boolean) {
  const ctx = canvas.getContext("2d"); if (!ctx) return;
  const rs = resolver(host);
  const X = (lng: number) => ((lng + 180) / 360) * TEX_W, Y = (lat: number) => ((90 - lat) / 180) * TEX_H;
  const trace = (poly: RegionPoly) => { ctx.beginPath(); for (const p of poly) for (const ring of p) { ring.forEach(([lng, lat], i) => (i ? ctx.lineTo(X(lng), Y(lat)) : ctx.moveTo(X(lng), Y(lat)))); ctx.closePath(); } };
  ctx.fillStyle = rs.col("var(--map-ocean)"); ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.strokeStyle = rs.col("var(--map-graticule)"); ctx.lineWidth = 1;
  ctx.beginPath(); for (let lng = -180; lng <= 180; lng += 30) { ctx.moveTo(X(lng), 0); ctx.lineTo(X(lng), TEX_H); } for (let lat = -60; lat <= 60; lat += 30) { ctx.moveTo(0, Y(lat)); ctx.lineTo(TEX_W, Y(lat)); } ctx.stroke();
  const filled = new Set(fills.map((f) => f.code));
  const land = rs.col("var(--map-land)"), edge = rs.col("var(--map-border)");
  ctx.lineJoin = "round"; ctx.lineWidth = 1.2;
  const draw = (code: string, poly: RegionPoly, fill: string | null) => { trace(poly); ctx.fillStyle = fill ?? land; ctx.fill("evenodd"); ctx.strokeStyle = edge; ctx.stroke(); };
  if (geo.world) for (const [code, poly] of geo.world) if (!filled.has(code) && !(states && code === "US")) draw(code, poly, null);
  if (states && geo.us) for (const [code, poly] of geo.us) if (!filled.has(code)) draw(code, poly, null);
  for (const f of fills) { const poly = f.code.startsWith("US-") ? geo.us?.get(f.code) : geo.world?.get(f.code); if (poly) draw(f.code, poly, rs.col(colours.get(f.code) ?? "var(--map-heat-hi)")); }
  rs.done();
}

const bboxes = (m: Map<string, RegionPoly> | null) => { const out = new Map<string, [number, number, number, number]>(); if (m) for (const [c, poly] of m) { let a = 180, b = 90, d = -180, e = -90; for (const p of poly) for (const [x, y] of p[0]) { if (x < a) a = x; if (x > d) d = x; if (y < b) b = y; if (y > e) e = y; } out.set(c, [a, b, d, e]); } return out; };

export const GlobeStage = forwardRef<GlobeHandle, GlobeProps>(function GlobeStage(p, ref) {
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), tex = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 640, h: 480 });
  const initial = useMemo<GCam>(() => {
    const v = p.spec.view; if (v) return { lat: clampLat(v.center.lat), lng: v.center.lng, k: 1 };
    const all: { lat: number; lng: number }[] = [...p.spec.places, ...p.spec.arcs.flatMap((a) => [a.a, a.b])];
    for (const f of p.fills) { const r = (p.geo.us?.get(f.code) ?? p.geo.world?.get(f.code)); if (r) { const b = r[0][0]; const xs = b.map((q) => q[0]), ys = b.map((q) => q[1]); all.push({ lng: (Math.min(...xs) + Math.max(...xs)) / 2, lat: (Math.min(...ys) + Math.max(...ys)) / 2 }); } }
    if (!all.length) return { lat: 20, lng: 10, k: 1 };
    let x = 0, y = 0, z = 0;
    for (const q of all) { x += Math.cos(rad(q.lat)) * Math.sin(rad(q.lng)); y += Math.sin(rad(q.lat)); z += Math.cos(rad(q.lat)) * Math.cos(rad(q.lng)); }
    const n = Math.hypot(x, y, z);
    if (n < 0.2 * all.length) return { lat: 20, lng: 10, k: 1 }; // points all round the globe: a plain view
    return { lat: clampLat(deg(Math.asin(y / n)) * 0.8), lng: deg(Math.atan2(x, z)), k: 1 };
  }, [p.spec, p.geo.world, p.geo.us]);
  const [cam, setCamState] = useState<GCam>(initial);
  const [ready, setReady] = useState(false);
  const camRef = useRef(cam), sizeRef = useRef(size), dirty = useRef(true), glReady = useRef(false);
  const gl = useRef<{ render: () => void; resize: () => void; repaint: () => void; dispose: () => void } | null>(null);
  const anim = useRef<{ from: GCam; to: GCam; t0: number } | null>(null), idleAt = useRef(0), dragMoved = useRef(0), hot = useRef(false);
  const props = useRef(p); props.current = p;
  const setCam = useCallback((c: GCam) => { camRef.current = c; dirty.current = true; setCamState(c); }, []);
  const R = (s: { w: number; h: number }, k: number) => globeR(s.w, s.h, k);
  const boxes = useMemo(() => ({ w: bboxes(p.geo.world), u: bboxes(p.geo.us) }), [p.geo.world, p.geo.us]);

  // measure the stage
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const read = () => { const r = el.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height); if (!w || !h || (w === sizeRef.current.w && h === sizeRef.current.h)) return; sizeRef.current = { w, h }; setSize({ w, h }); dirty.current = true; gl.current?.resize(); };
    read(); const ro = new ResizeObserver(read); ro.observe(el); return () => ro.disconnect();
  }, []);

  // three.js: the sphere, its texture, the lights
  const statesOn = p.fills.some((f) => f.code.startsWith("US-"));
  useEffect(() => {
    const host = stage.current, cv = canvas.current; if (!host || !cv || !p.geo.world) return;
    let dead = false;
    (async () => {
      try {
        const THREE = await import("three");
        if (dead) return;
        const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20); camera.position.set(0, 0, 6);
        scene.add(new THREE.AmbientLight(0xffffff, 1.55)); const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(-0.5, 0.7, 1); scene.add(sun);
        // our own sphere: longitude and latitude map straight to the texture, so the picture and the DOM overlay agree
        const nu = 96, nv = 48, pos: number[] = [], uv: number[] = [], idx: number[] = [];
        for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const lat = 90 - (180 * j) / nv, lng = -180 + (360 * i) / nu; pos.push(Math.cos(rad(lat)) * Math.sin(rad(lng)), Math.sin(rad(lat)), Math.cos(rad(lat)) * Math.cos(rad(lng))); uv.push(i / nu, 1 - j / nv); }
        for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + nu + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
        const geom = new THREE.BufferGeometry(); geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geom.setAttribute("normal", new THREE.Float32BufferAttribute(pos, 3)); geom.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geom.setIndex(idx);
        const tcv = document.createElement("canvas"); tcv.width = TEX_W; tcv.height = TEX_H; tex.current = tcv;
        const texture = new THREE.CanvasTexture(tcv); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        const mat = new THREE.MeshLambertMaterial({ map: texture }); const mesh = new THREE.Mesh(geom, mat); scene.add(mesh);
        // Theme/data changes must repaint even below the viewport: full-page capture and print can see it there.
        const repaint = () => { const q = props.current; paint(tcv, host, q.geo, q.fills, q.colours, q.fills.some((f) => f.code.startsWith("US-"))); texture.needsUpdate = true; render(); dirty.current = false; };
        const resize = () => { const s = sizeRef.current; renderer.setSize(s.w, s.h, false); dirty.current = true; };
        const render = () => {
          const c = camRef.current, s = sizeRef.current, r = R(s, c.k);
          camera.left = -s.w / 2 / r; camera.right = s.w / 2 / r; camera.top = s.h / 2 / r; camera.bottom = -s.h / 2 / r; camera.updateProjectionMatrix();
          mesh.rotation.set(rad(c.lat), -rad(c.lng), 0, "XYZ");
          renderer.render(scene, camera);
        };
        gl.current = { render, resize, repaint, dispose: () => { texture.dispose(); geom.dispose(); mat.dispose(); renderer.dispose(); } };
        resize(); repaint(); render(); dirty.current=false; glReady.current = true; host.dataset.gl = "ready"; setReady(true);
      } catch (e: any) { if (!dead) props.current.onFail(String(e?.message ?? e).slice(0, 80)); }
    })();
    return () => { dead = true; glReady.current = false; gl.current?.dispose(); gl.current = null; };
  }, [p.geo.world]);
  // new values or a new theme: paint the texture again
  useEffect(() => { gl.current?.repaint(); }, [p.fills, p.colours, p.geo.us, statesOn]);
  useEffect(() => {
    const again = () => gl.current?.repaint();
    const mo = new MutationObserver(again); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)"); mq?.addEventListener?.("change", again); window.addEventListener("dh-theme", again);
    return () => { mo.disconnect(); mq?.removeEventListener?.("change", again); window.removeEventListener("dh-theme", again); };
  }, []);

  // a camera target from the part (a step, a list row, the fit button)
  const flyTo = useCallback((to: GCam) => {
    const from = camRef.current; let dl = wrapLng(to.lng - from.lng);
    const target = { lat: clampLat(to.lat), lng: from.lng + dl, k: Math.max(GLOBE_K.min, Math.min(GLOBE_K.max, to.k)) };
    if (props.current.motionOff || reducedMotion()) { setCam({ ...target, lng: wrapLng(target.lng) }); return; }
    anim.current = { from, to: target, t0: performance.now() }; dirty.current = true; props.current.onUser();
  }, [setCam]);
  useEffect(() => { if (p.focus) flyTo(p.focus); }, [p.focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ({
    zoom: (dz: number) => { const c = camRef.current; flyTo({ ...c, k: c.k * 2 ** dz }); },
    fit: () => flyTo(initial),
    pause: () => {},
  }), [flyTo, initial]);

  // the loop: draws when something changed, spins when it may
  useEffect(() => {
    let raf = 0, last = performance.now(), visible = true;
    let io: IntersectionObserver | null = null;
    try { io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); }, { rootMargin: "100px" }); if (stage.current) io.observe(stage.current); } catch { /* still draws */ }
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) { last = now; return; }
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const a = anim.current;
      if (a) {
        const k = Math.min(1, (now - a.t0) / 640), e = 1 - (1 - k) ** 3;
        setCam({ lat: a.from.lat + (a.to.lat - a.from.lat) * e, lng: wrapLng(a.from.lng + (a.to.lng - a.from.lng) * e), k: a.from.k + (a.to.k - a.from.k) * e });
        if (k >= 1) anim.current = null;
      } else if (props.current.spinning && !props.current.motionOff && !reducedMotion() && now - idleAt.current > 3000 && !hot.current && !props.current.active) {
        const c = camRef.current; setCam({ ...c, lng: wrapLng(c.lng + 7 * dt) });
      }
      if (dirty.current && glReady.current) { dirty.current = false; gl.current?.render(); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); io?.disconnect(); };
  }, [setCam]);

  // gestures
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const rel = (e: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const touched = () => { idleAt.current = performance.now(); props.current.onUser(); props.current.onSpinEnd(); };
    const turn = (dx: number, dy: number) => { const c = camRef.current, r = R(sizeRef.current, c.k); setCam({ lat: clampLat(c.lat + deg(dy / r)), lng: wrapLng(c.lng - deg(dx / r) / Math.max(0.35, Math.cos(rad(c.lat)))), k: c.k }); };
    const zoomBy = (f: number) => { const c = camRef.current; anim.current = null; setCam({ ...c, k: Math.max(GLOBE_K.min, Math.min(GLOBE_K.max, c.k * f)) }); };
    let drag: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { if (e.pointerType === "touch" || e.button !== 0 || (e.target as Element).closest(".map-ctl, .dh-pop, .map-pin, .map-arc-hit")) return; drag = { x: e.clientX, y: e.clientY }; dragMoved.current = 0; anim.current = null; touched(); };
    // the region under a pointer (a filled one), by looking the point up in our own boundary data
    const regionAt = (px: number, py: number): string | null => {
      const c = camRef.current, s = sizeRef.current, ll = unproject(px, py, c, s.w, s.h, R(s, c.k)); if (!ll) return null;
      const q = props.current, tryCode = (code: string, poly: RegionPoly | undefined, b?: [number, number, number, number]) => !!poly && !!b && ll.lng >= b[0] && ll.lng <= b[2] && ll.lat >= b[1] && ll.lat <= b[3] && inRegion(poly, ll.lng, ll.lat);
      for (const f of q.fills) { const us = f.code.startsWith("US-"); if (tryCode(f.code, us ? q.geo.us?.get(f.code) : q.geo.world?.get(f.code), (us ? boxes.u : boxes.w).get(f.code))) return f.code; }
      return null;
    };
    let hoverTimer: ReturnType<typeof setTimeout> | null = null, hoverCode: string | null = null;
    const onMove = (e: PointerEvent) => {
      if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!dragMoved.current && Math.hypot(dx, dy) < 4) return; dragMoved.current = performance.now(); drag = { x: e.clientX, y: e.clientY }; turn(dx, dy); return; }
      if (e.pointerType !== "mouse" || !el.contains(e.target as Node) || (e.target as Element).closest(".map-ctl, .dh-pop, .map-pin, .map-arc-hit")) return;
      const at = rel(e), code = regionAt(at.x, at.y);
      el.style.cursor = code ? "pointer" : "";
      if (code === hoverCode) return;
      hoverCode = code; if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => props.current.onRegion(code, at, code ? "hover" : "leave"), code ? 150 : 280);
      hot.current = !!code;
    };
    const onLeave = () => { hot.current = false; };
    const onUp = () => { drag = null; };
    const onClick = (e: MouseEvent) => {
      if (dragMoved.current && performance.now() - dragMoved.current < 250) { e.stopPropagation(); e.preventDefault(); return; }
      if ((e.target as Element).closest(".map-ctl, .dh-pop, .map-pin, .map-arc-hit")) return;
      const at = rel(e); props.current.onRegion(regionAt(at.x, at.y), at, "click");
    };
    const onWheel = (e: WheelEvent) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); touched(); zoomBy(Math.exp(-e.deltaY * 0.01)); };
    const onDbl = (e: MouseEvent) => { if ((e.target as Element).closest(".map-ctl, .dh-pop")) return; touched(); zoomBy(1.6); };
    let pinch: { d: number; x: number; y: number; k: number } | null = null;
    const two = (t: TouchList) => { const a = t[0], b = t[1]; return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), ...rel({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }) }; };
    const onTS = (e: TouchEvent) => { if (e.touches.length >= 2) { const t = two(e.touches); pinch = { d: Math.max(10, t.d), x: t.x, y: t.y, k: camRef.current.k }; anim.current = null; touched(); if (e.cancelable) e.preventDefault(); } };
    const onTM = (e: TouchEvent) => {
      if (!pinch || e.touches.length < 2) return; if (e.cancelable) e.preventDefault();
      const t = two(e.touches); turn(t.x - pinch.x, t.y - pinch.y); pinch.x = t.x; pinch.y = t.y; dragMoved.current = performance.now(); touched();
      const c = camRef.current; setCam({ ...c, k: Math.max(GLOBE_K.min, Math.min(GLOBE_K.max, pinch.k * (Math.max(10, t.d) / pinch.d))) });
    };
    const onTE = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest(".dh-pop, input, select, textarea")) return;
      const k = e.key, step = 12 * (camRef.current.k > 2 ? 0.5 : 1);
      touched();
      if (k === "ArrowLeft") setCam({ ...camRef.current, lng: wrapLng(camRef.current.lng - step) }); else if (k === "ArrowRight") setCam({ ...camRef.current, lng: wrapLng(camRef.current.lng + step) });
      else if (k === "ArrowUp") setCam({ ...camRef.current, lat: clampLat(camRef.current.lat + step) }); else if (k === "ArrowDown") setCam({ ...camRef.current, lat: clampLat(camRef.current.lat - step) });
      else if (k === "+" || k === "=") zoomBy(1.5); else if (k === "-" || k === "_") zoomBy(1 / 1.5); else if (k === "0" || k === "Home") flyTo(initial); else return;
      e.preventDefault();
    };
    el.addEventListener("pointerdown", onDown); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); window.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onLeave); el.addEventListener("click", onClick, true); el.addEventListener("wheel", onWheel, { passive: false }); el.addEventListener("dblclick", onDbl);
    el.addEventListener("touchstart", onTS, { passive: false }); el.addEventListener("touchmove", onTM, { passive: false }); el.addEventListener("touchend", onTE); el.addEventListener("touchcancel", onTE); el.addEventListener("keydown", onKey);
    return () => {
      if (hoverTimer) clearTimeout(hoverTimer);
      el.removeEventListener("pointerdown", onDown); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onLeave); el.removeEventListener("click", onClick, true); el.removeEventListener("wheel", onWheel); el.removeEventListener("dblclick", onDbl);
      el.removeEventListener("touchstart", onTS); el.removeEventListener("touchmove", onTM); el.removeEventListener("touchend", onTE); el.removeEventListener("touchcancel", onTE); el.removeEventListener("keydown", onKey);
    };
  }, [boxes, initial, flyTo, setCam]);

  const r = R(size, cam.k);
  const haloScale = (r * 2 + 40) / 100;
  const api: GlobeApi = {
    w: size.w, h: size.h, R: r, cam,
    proj: (lat, lng, h = 0) => project(lat, lng, h, cam, size.w, size.h, r),
    arcPoints: (a, b, n) => liftedArc(a, b, n).map((q) => { const o = project(q.lat, q.lng, q.h, cam, size.w, size.h, r); return { x: o.x, y: o.y, vis: o.vis }; }),
  };
  // the outline of the region the card is about: its near-side points, in runs
  const outline = (() => {
    if (!p.active) return null; const us = p.active.startsWith("US-"), poly = us ? p.geo.us?.get(p.active) : p.geo.world?.get(p.active); if (!poly) return null;
    const runs: string[] = [];
    for (const pg of poly) for (const ring of pg) { let run: string[] = []; for (const [lng, lat] of ring) { const o = project(lat, lng, 0, cam, size.w, size.h, r); if (o.vis) run.push(`${run.length ? "L" : "M"}${o.x.toFixed(1)} ${o.y.toFixed(1)}`); else if (run.length) { runs.push(run.join("")); run = []; } } if (run.length) runs.push(run.join("")); }
    return runs.join("");
  })();
  return (
    <div className="map-stage is-globe" ref={stage} tabIndex={0} role="group" aria-label={p.label} data-dh-slot="globe" data-lat={cam.lat.toFixed(3)} data-lng={cam.lng.toFixed(3)} data-k={cam.k.toFixed(3)}>
      <div className="map-halo" aria-hidden="true" style={{ width: 100, height: 100, left: "50%", top: "50%", transform: `translate(-50%, -50%) scale(${haloScale})`, filter: `blur(${5 / haloScale}px)` }} />
      <canvas className="map-gl" ref={canvas} aria-hidden="true" />
      {!ready ? <div className="map-gl-wait" role="status">Loading the globe…</div> : null}
      <svg className="map-svg map-gsvg" viewBox={`0 0 ${size.w} ${size.h}`} width="100%" height="100%" aria-hidden="true">
        {outline ? <path className="map-outline" d={outline} /> : null}
      </svg>
      {p.children(api)}
    </div>
  );
});
