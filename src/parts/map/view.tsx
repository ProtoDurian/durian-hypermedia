// The map part (the format). One drawing for every provider: the base map (tiles) comes from Leaflet, MapLibre or Google
// when the host passes a provider and the map scrolls near (site/src/map-providers.ts); with none, a still picture of the
// same view is the base. Pins, routes, areas, regions coloured by a value, arcs, the popover, the zoom buttons, the scale bar
// and every gesture are ours, so the look and the touch rules are the same on all of them: one finger scrolls the page, two
// fingers move and zoom the map, Ctrl + wheel zooms, a mouse drags, arrows pan, + and - zoom, Tab walks the pins.

import {useDh} from "../../react/context";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allPoints, arc, boxOf, cameraAt, fitBox, haversine, hasWrittenPath, kmWords, merc, osmLink, routeLength, routePath, scaleBar, toPx, unmerc, type Camera, type LL, type MapSpec, type MPlace, type MRoute } from "./model";
import { rangeOf, regionBox, regionName, regionPoint } from "./geo";
import { ArcDraw, Filled, Land, ScaleLegend, ValuesPanel, arcGeom, arcTitle, fillColours, geoTransform, needsLand, useGeo, valueWords, type ArcGeom } from "./map-geo";
import type { GlobeApi, GlobeHandle } from "./map-globe";
import type { Basemap, MapHost } from "./host";
import { Controls, reducedMotion } from "../../ui/parts";
import { StepTitle } from "../kit/view";
import { usePop } from "../kit/places-pop";
import { useStatic, StaticSteps, type StaticProp } from "../kit/static"; 
import type { Ui } from "../../ui/ui";

const GlobeStage = React.lazy(() => import("./map-globe").then((m) => ({ default: m.GlobeStage })));
const MIN_Z = 1, MAX_Z = 18, DEFAULT = { w: 640, h: 420 };
const isGeo = (s: MapSpec) => s.fills.length > 0 || s.arcs.length > 0 || s.globe; // a map of regions, arcs or a globe may show the whole world
const minZOf = (s: MapSpec) => (isGeo(s) ? 0.3 : MIN_Z);
const WAY_WORDS: Record<string, string> = { walk: "on foot", bike: "by bike", drive: "by car", transit: "by public transport", straight: "straight line", flight: "by air" };

/** the camera of step i: the view line, the last focus, or everything fitted */
export function cameraFor(spec: MapSpec, i: number, w: number, h: number): Camera {
  const clampZ = (z: number) => Math.max(minZOf(spec), Math.min(MAX_Z, z));
  // a map of regions keeps its zoom buttons (top right, 8 px in, 32 px wide) off the data: 52 px at the right stay clear
  const fitAll = fitBox(boxOf(allPoints(spec)), w, h, isGeo(spec) ? 20 : 56, 17, isGeo(spec) ? 52 : 0);
  let cam: Camera = spec.view ? cameraAt(spec.view.center, spec.view.zoom ?? fitAll.zoom) : fitAll;
  const find = (id: string): LL[] | null => {
    const p = spec.places.find((x) => x.id === id); if (p) return [p];
    const r = spec.routes.find((x) => x.id === id); if (r) return routePath(r);
    const a = spec.areas.find((x) => x.id === id); if (a) return a.corners;
    const ar = spec.arcs.find((x) => x.id === id); if (ar) return [ar.a, ar.b];
    const rb = regionBox(id); return rb.length ? rb : null;
  };
  for (let k = 0; k <= i && k < spec.steps.length; k++) {
    const s = spec.steps[k];
    if (s.view) cam = cameraAt(s.view.center, s.view.zoom ?? cam.zoom);
    if (s.focus) {
      const pts = find(s.focus);
      if (pts?.length === 1) cam = cameraAt(pts[0], Math.min(17, Math.max(fitAll.zoom, cam.zoom) + 1.5));
      else if (pts) cam = fitBox(boxOf(pts), w, h, 64);
    }
  }
  return { ...cam, zoom: clampZ(cam.zoom) };
}
/** where the globe turns for step i: the last focus (a place, a region or an arc), or null for the whole view */
export function globeTargetFor(spec: MapSpec, i: number): { lat: number; lng: number; k: number } | null {
  let out: { lat: number; lng: number; k: number } | null = null;
  for (let k = 0; k <= i && k < spec.steps.length; k++) {
    const s = spec.steps[k];
    if (s.view) out = { ...s.view.center, k: 1.6 };
    if (s.focus) {
      const id = s.focus, p = spec.places.find((x) => x.id === id), ar = spec.arcs.find((x) => x.id === id), rp = regionPoint(id);
      if (p) out = { lat: p.lat, lng: p.lng, k: 2.4 };
      else if (ar) out = { lat: (ar.a.lat + ar.b.lat) / 2, lng: Math.abs(ar.a.lng - ar.b.lng) > 180 ? (ar.a.lng + ar.b.lng) / 2 + 180 : (ar.a.lng + ar.b.lng) / 2, k: 1.5 };
      else if (rp) { const b = regionBox(id); out = { ...rp, k: b.length ? Math.max(1.4, Math.min(3.4, 60 / Math.max(6, b[2].lng - b[0].lng))) : 2 }; }
    }
  }
  return out;
}

const gridStep = (zoom: number) => { const deg = 360 / (2 ** zoom); const steps = [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 45]; return steps.find((s) => s >= deg * 0.4) ?? 45; };
const codeOf = (t: EventTarget | null): string | null => (t as Element | null)?.closest?.("[data-code]")?.getAttribute("data-code") ?? null;

function MapRenderer({ spec, host, ui, static: stp, motionOff }: { motionOff:boolean; spec: MapSpec; host: MapHost | null; ui: Ui; static?: StaticProp }) {
  // static (SPEC 4.1): the chosen step (the last by default), its camera set at once (no flight), no controls, no hint
  const sx = useStatic(stp, spec.steps.length, spec.steps.map((x) => x.title));
  const [stepLive, setStep] = useState(0);
  const step = sx.on ? sx.i : stepLive;
  const [size, setSize] = useState(DEFAULT);
  const [view, setViewState] = useState<Camera>(() => cameraFor(spec, step, DEFAULT.w, DEFAULT.h));
  const [routed, setRouted] = useState<Record<string, LL[]>>({});
  const [based, setBased] = useState(false);
  const [note, setNote] = useState("");
  const stage = useRef<HTMLDivElement|null>(null), baseEl = useRef<HTMLDivElement>(null), part = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view), sizeRef = useRef(size), moved = useRef(false), raf = useRef(0), base = useRef<Basemap | null>(null), dragged = useRef(0);
  viewRef.current = view; sizeRef.current = size;
  const popHost = useRef<HTMLDivElement|null>(null);
  const pop = usePop(popHost,!sx.on);
  const n = spec.steps.length;
  // a part made static in the browser (print, reduce motion) jumps to its step: the camera is set, not flown
  useEffect(() => { setViewState(cameraFor(spec, step, sizeRef.current.w, sizeRef.current.h)); }, [sx.on]); // eslint-disable-line
  // regions, arcs and the globe
  const clampZ = (z: number) => Math.max(minZOf(spec), Math.min(MAX_Z, z));
  const geoMap = isGeo(spec);
  const [modeLive, setMode] = useState<"flat" | "globe">(spec.globe ? "globe" : "flat");
  const mode = sx.on ? "flat" : modeLive;
  const [spinning, setSpinning] = useState(spec.spin && !sx.on && !motionOff && !reducedMotion());
  useEffect(()=>{if(motionOff)setSpinning(false);},[motionOff]);
  const [gfocus, setGfocus] = useState<{ lat: number; lng: number; k: number; nonce: number } | null>(null);
  const globeRef = useRef<GlobeHandle>(null);
  const nonce = useRef(0);
  const geo = useGeo(spec, true);
  const visibleFills = useMemo(() => spec.fills.filter((f) => f.from <= step), [spec, step]);
  const range = useMemo(() => rangeOf(spec.fills.map((f) => f.value), spec.scale), [spec]);
  const colours = useMemo(() => fillColours(spec.fills, range, spec), [spec, range]);
  const hideCodes = useMemo(() => new Set(visibleFills.map((f) => f.code)), [visibleFills]);
  const states = visibleFills.some((f) => f.code.startsWith("US-"));
  const arcsNow = spec.arcs.filter((a) => a.shownAt <= step);
  const vmax = Math.max(...spec.arcs.map((a) => a.value), 1e-9);
  const rankOf = useMemo(() => { const o = new Map<string, number>(); [...spec.fills].sort((a, b) => b.value - a.value).forEach((f, i) => o.set(f.code, i + 1)); return o; }, [spec]);
  const unit = spec.scale.unit;
  const ptr = useRef<{ x: number; y: number } | null>(null);
  const tabRegions = visibleFills.length <= 12, tabArcs = arcsNow.length <= 12; // with more, the list under the map is the way in for keys

  const setView = useCallback((v: Camera) => { viewRef.current = v; setViewState(v); base.current?.setView(v); }, []);
  const fly = useCallback((to: Camera) => {
    cancelAnimationFrame(raf.current);
    const from = viewRef.current;
    if (motionOff || reducedMotion() || (Math.abs(from.cx - to.cx) < 1e-9 && Math.abs(from.cy - to.cy) < 1e-9 && Math.abs(from.zoom - to.zoom) < 1e-6)) { setView(to); return; }
    const t0 = performance.now(), ms = 640;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - (1 - k) ** 3;
      setView({ cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e, zoom: from.zoom + (to.zoom - from.zoom) * e });
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [setView,motionOff]);

  // measure the stage; until the reader moves the map, a new size re-fits the step's view
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
      if (!w || !h || (w === sizeRef.current.w && h === sizeRef.current.h)) return;
      sizeRef.current = { w, h }; setSize({ w, h }); base.current?.resize();
      if (!moved.current) setView(cameraFor(spec, stepRef.current, w, h));
    };
    read();
    const ro = new ResizeObserver(read); ro.observe(el);
    return () => ro.disconnect();
  }, [spec, setView, mode]);
  const stepRef = useRef(0); stepRef.current = step;
  const turnGlobe = (to: { lat: number; lng: number; k: number } | null) => { if (to) setGfocus({ ...to, nonce: ++nonce.current }); else globeRef.current?.fit(); };
  const goStep = (k: number) => {
    const s = Math.max(0, Math.min(n - 1, k)); setStep(s); stepRef.current = s; moved.current = false; pop.close();
    fly(cameraFor(spec, s, sizeRef.current.w, sizeRef.current.h));
    if (mode === "globe") turnGlobe(globeTargetFor(spec, s));
  };
  const fit = () => { if (mode === "globe") { globeRef.current?.fit(); return; } moved.current = false; fly(cameraFor(spec, stepRef.current, sizeRef.current.w, sizeRef.current.h)); };

  // the provider: loaded when the map scrolls near, only if the host asked for one (not under the globe)
  useEffect(() => {
    if (sx.on || mode !== "flat" || !host?.openBasemap || !baseEl.current || !stage.current) return;
    let dead = false;
    const go = async () => {
      try {
        const b = await host.openBasemap!(baseEl.current!, viewRef.current);
        if (dead) { b.destroy(); return; }
        base.current = b; b.resize(); b.setView(viewRef.current); setBased(true);
      } catch (e: any) { if (!dead) setNote(e?.message === "no-key" ? "Google Maps needs the host's key, so this is the still picture." : "The map provider could not load, so this is the still picture."); }
    };
    let io: IntersectionObserver | null = null;
    try { io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io?.disconnect(); go(); } }, { rootMargin: "300px 0px" }); io.observe(stage.current); } catch { go(); }
    return () => { dead = true; io?.disconnect(); base.current?.destroy(); base.current = null; setBased(false); };
  }, [host, mode, sx.on]);

  // the host's router: a route follows the roads between its stops when the host has one
  const visible = (from: number) => from <= step;
  useEffect(() => {
    if (sx.on || !host?.route) return;
    let dead = false;
    (async () => {
      for (const r of spec.routes) {
        if (r.shownAt > step || routed[r.id] || r.way === "straight" || r.way === "flight" || hasWrittenPath(r)) continue;
        let pts:LL[]|null=null;try{pts=await host.route!(r.way,r.stops);}catch{/* routing failure preserves the honest dashed line */}
        if (pts && pts.length<=2000 && pts.every(p=>Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lng)&&Math.abs(p.lng)<=180) && !dead) setRouted((o) => ({ ...o, [r.id]: pts }));
      }
    })();
    return () => { dead = true; };
  }, [host, spec, step, sx.on]);

  // gestures: a mouse drags, Ctrl + wheel zooms, two fingers move and zoom; one finger is left to the page
  useEffect(() => {
    const el = stage.current; if (sx.on || !el) return;
    const world = (v: Camera) => 256 * 2 ** v.zoom;
    const panBy = (dx: number, dy: number) => { const v = viewRef.current, s = world(v); moved.current = true; setView({ ...v, cx: v.cx - dx / s, cy: Math.max(0, Math.min(1, v.cy - dy / s)) }); };
    const zoomAt = (px: number, py: number, dz: number) => {
      const v = viewRef.current, { w, h } = sizeRef.current, z = clampZ(v.zoom + dz), s0 = world(v), s1 = 256 * 2 ** z;
      moved.current = true;
      setView({ cx: v.cx + (px - w / 2) / s0 - (px - w / 2) / s1, cy: Math.max(0, Math.min(1, v.cy + (py - h / 2) / s0 - (py - h / 2) / s1)), zoom: z });
    };
    (el as any).__zoom = (dz: number) => zoomAt(sizeRef.current.w / 2, sizeRef.current.h / 2, dz);
    const rel = (e: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    let drag: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0 || (e.target as Element).closest(".map-ctl, .pop")) return;
      drag = { x: e.clientX, y: e.clientY }; dragged.current = 0; cancelAnimationFrame(raf.current);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && el.contains(e.target as Node)) ptr.current = rel(e);
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!dragged.current && Math.hypot(dx, dy) < 4) return;
      dragged.current = performance.now(); drag = { x: e.clientX, y: e.clientY }; panBy(dx, dy);
    };
    const onUp = () => { drag = null; };
    const onClickCap = (e: MouseEvent) => { if (dragged.current && performance.now() - dragged.current < 250) { e.stopPropagation(); e.preventDefault(); } };
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault(); const p = rel(e); zoomAt(p.x, p.y, -e.deltaY * 0.01);
    };
    const onDbl = (e: MouseEvent) => { if ((e.target as Element).closest(".map-ctl, .pop")) return; const p = rel(e); zoomAt(p.x, p.y, 1); };
    // two fingers
    let pinch: { d: number; cx: number; cy: number; v: Camera } | null = null;
    const two = (t: TouchList) => { const a = t[0], b = t[1]; return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), ...rel({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }) }; };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) { const t = two(e.touches); pinch = { d: Math.max(10, t.d), cx: t.x, cy: t.y, v: viewRef.current }; cancelAnimationFrame(raf.current); if (e.cancelable) e.preventDefault(); }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length < 2) return;
      if (e.cancelable) e.preventDefault();
      const t = two(e.touches), { w, h } = sizeRef.current, v0 = pinch.v, z = clampZ(v0.zoom + Math.log2(Math.max(10, t.d) / pinch.d)), s0 = world(v0), s1 = 256 * 2 ** z;
      // the world point that was under the first centre stays under the fingers' new centre
      const wx = v0.cx + (pinch.cx - w / 2) / s0, wy = v0.cy + (pinch.cy - h / 2) / s0;
      moved.current = true; dragged.current = performance.now();
      setView({ cx: wx - (t.x - w / 2) / s1, cy: Math.max(0, Math.min(1, wy - (t.y - h / 2) / s1)), zoom: z });
    };
    const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest(".dh-pop, input, select, textarea")) return;
      const k = e.key;
      if (k === "ArrowLeft") panBy(80, 0); else if (k === "ArrowRight") panBy(-80, 0); else if (k === "ArrowUp") panBy(0, 80); else if (k === "ArrowDown") panBy(0, -80);
      else if (k === "+" || k === "=") zoomAt(sizeRef.current.w / 2, sizeRef.current.h / 2, 1); else if (k === "-" || k === "_") zoomAt(sizeRef.current.w / 2, sizeRef.current.h / 2, -1);
      else if (k === "0" || k === "Home") { moved.current = false; fly(cameraFor(spec, stepRef.current, sizeRef.current.w, sizeRef.current.h)); } else return;
      e.preventDefault();
    };
    el.addEventListener("pointerdown", onDown); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); window.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClickCap, true); el.addEventListener("wheel", onWheel, { passive: false }); el.addEventListener("dblclick", onDbl);
    el.addEventListener("touchstart", onTouchStart, { passive: false }); el.addEventListener("touchmove", onTouchMove, { passive: false }); el.addEventListener("touchend", onTouchEnd); el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("pointerdown", onDown); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClickCap, true); el.removeEventListener("wheel", onWheel); el.removeEventListener("dblclick", onDbl);
      el.removeEventListener("touchstart", onTouchStart); el.removeEventListener("touchmove", onTouchMove); el.removeEventListener("touchend", onTouchEnd); el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("keydown", onKey);
    };
  }, [spec, setView, fly, mode, sx.on]);

  const px = (p: LL) => toPx(p, view, size.w, size.h);
  const pts = (ps: LL[]) => ps.map((p) => { const q = px(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(" ");
  const placesNow = spec.places.filter((p) => visible(p.from < 0 ? 0 : p.from));
  const routesNow = spec.routes.filter((r) => r.shownAt <= step), areasNow = spec.areas.filter((a) => a.shownAt <= step);
  const center = unmerc(view.cx, view.cy);
  const bar = scaleBar(view, center.lat);
  const gs = gridStep(view.zoom);
  const grid: React.ReactNode[] = [];
  if (!based) {
    const tl = unmerc(view.cx - size.w / 2 / (256 * 2 ** view.zoom), view.cy - size.h / 2 / (256 * 2 ** view.zoom));
    const br = unmerc(view.cx + size.w / 2 / (256 * 2 ** view.zoom), view.cy + size.h / 2 / (256 * 2 ** view.zoom));
    for (let lng = Math.ceil(tl.lng / gs) * gs, k = 0; lng <= br.lng && k < 60; lng += gs, k++) { const x = px({ lat: 0, lng }).x; grid.push(<line key={`x${k}`} x1={x} x2={x} y1={0} y2={size.h} />); }
    for (let lat = Math.floor(tl.lat / gs) * gs, k = 0; lat >= br.lat && k < 60; lat -= gs, k++) { const y = px({ lat, lng: 0 }).y; grid.push(<line key={`y${k}`} y1={y} y2={y} x1={0} x2={size.w} />); }
  }
  const pinAt = (p: MPlace) => { const q = px(p); return { x: q.x, y: q.y }; };
  const openPlace = (p: MPlace) => ({ data: { id: p.id, title: p.label, meta: `${p.lat}, ${p.lng}`, text: p.note || undefined, tone: p.colour, actions: [{ label: "Open in maps", href: osmLink(p) }] }, at: pinAt(p) });
  const zoom = (dz: number) => { if (mode === "globe") globeRef.current?.zoom(dz); else (stage.current as any)?.__zoom?.(dz); };
  const attribution = mode === "flat" && based && host?.provider === "leaflet" ? (host.attribution ?? "© OpenStreetMap contributors") : mode === "flat" && based && host?.provider === "maplibre" ? (host.attribution ?? "") : "";
  const showList = (p: MPlace) => {
    pop.close();
    if (mode === "globe") { turnGlobe({ lat: p.lat, lng: p.lng, k: 2.4 }); setTimeout(() => pop.show({ data: openPlace(p).data, at: { x: sizeRef.current.w / 2, y: sizeRef.current.h / 2 } }), 800); }
    else { moved.current = true; fly(cameraAt(p, Math.max(view.zoom, 16))); const o = openPlace(p); setTimeout(() => pop.show(o), 700); }
    (mode === "globe" ? part.current : stage.current)?.scrollIntoView?.({ block: "nearest" });
  };

  // ---- regions and arcs: the cards
  const regionData = (code: string) => {
    const f = spec.fills.find((x) => x.code === code); if (!f) return null;
    const rank = rankOf.get(code), cnt = spec.fills.length;
    return { id: code, title: f.name, meta: valueWords(f.raw, unit), text: f.note || (cnt > 1 ? `Number ${rank} of ${cnt}, highest first` : undefined) };
  };
  const regionOpen = (code: string, at?: { x: number; y: number } | null) => {
    const data = regionData(code); if (!data) return null;
    const lp = regionPoint(code), p = lp ? px(lp) : { x: size.w / 2, y: size.h / 2 };
    return { data, at: at ?? p };
  };
  const arcData = (a: (typeof spec.arcs)[number]) => ({ id: a.id, title: arcTitle(a), meta: valueWords(a.raw, unit), text: a.label || undefined, tone: a.colour });
  const arcOpen = (a: (typeof spec.arcs)[number], at?: { x: number; y: number }) => { const g = arcGeom(a, view, size.w, size.h, vmax); return { data: arcData(a), at: at ?? g.mid }; };
  const stagePt = (e: { clientX: number; clientY: number; currentTarget?: unknown }) => { const r = stage.current?.getBoundingClientRect(); return r && typeof e.clientX === "number" ? { x: e.clientX - r.left, y: e.clientY - r.top } : null; };
  const regionHandlers = {
    onPointerOver: (e: React.PointerEvent) => { const c = codeOf(e.target); if (c && e.pointerType === "mouse") pop.anchor(c, () => regionOpen(c, stagePt(e))!).onPointerEnter(e); },
    onPointerOut: (e: React.PointerEvent) => { const c = codeOf(e.target); if (c && e.pointerType === "mouse") pop.anchor(c, () => regionOpen(c)!).onPointerLeave(e); },
    onClick: (e: React.MouseEvent) => { const c = codeOf(e.target); if (c) pop.anchor(c, () => regionOpen(c, stagePt(e))!).onClick(e); },
    onFocus: (e: React.FocusEvent) => { const c = codeOf(e.target); if (c && (e.target as Element).matches(":focus-visible")) { const o = regionOpen(c); if (o) pop.show(o); } },
    onKeyDown: (e: React.KeyboardEvent) => { const c = codeOf(e.target); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); const o = regionOpen(c); if (o) { if (pop.open?.data.id === c) pop.close(); else pop.show(o); } } },
  };
  const showRegion = (code: string) => {
    pop.close();
    const o = (at?: { x: number; y: number }) => regionOpen(code, at);
    if (mode === "globe") { const rp = regionPoint(code), b = regionBox(code); if (rp) turnGlobe({ ...rp, k: b.length ? Math.max(1.4, Math.min(3.4, 60 / Math.max(6, b[2].lng - b[0].lng))) : 2 }); setTimeout(() => { const q = o({ x: sizeRef.current.w / 2, y: sizeRef.current.h / 2 }); if (q) pop.show(q); }, 800); }
    else { moved.current = true; const b = regionBox(code); if (b.length) fly(fitBox(boxOf(b), sizeRef.current.w, sizeRef.current.h, 48, 8)); setTimeout(() => { const q = o(); if (q) pop.show(q); }, 700); }
    (mode === "globe" ? part.current : stage.current)?.scrollIntoView?.({ block: "nearest" });
  };
  const showArc = (id: string) => {
    const a = spec.arcs.find((x) => x.id === id); if (!a) return; pop.close();
    if (mode === "globe") { turnGlobe({ lat: (a.a.lat + a.b.lat) / 2, lng: Math.abs(a.a.lng - a.b.lng) > 180 ? (a.a.lng + a.b.lng) / 2 + 180 : (a.a.lng + a.b.lng) / 2, k: 1.4 }); setTimeout(() => pop.show({ data: arcData(a), at: { x: sizeRef.current.w / 2, y: sizeRef.current.h / 2 } }), 800); }
    else { moved.current = true; fly(fitBox(boxOf([a.a, a.b]), sizeRef.current.w, sizeRef.current.h, 90, 10)); setTimeout(() => pop.show({ data: arcData(a), at: { x: sizeRef.current.w / 2, y: sizeRef.current.h * 0.35 } }), 700); }
    (mode === "globe" ? part.current : stage.current)?.scrollIntoView?.({ block: "nearest" });
  };
  const hasRegions = spec.fills.length > 0;
  const lowIsNone = !based && mode === "flat" ? hasRegions : hasRegions;
  const openId = pop.open?.data.id ?? null;
  const arcLabel = (a: (typeof spec.arcs)[number]) => `${arcTitle(a)}: ${valueWords(a.raw, unit)}${a.label ? `. ${a.label}` : ""}`;

  // ---- the globe's overlay: pins and arcs, projected from the same camera the sphere is drawn with
  const globeOverlay = (api: GlobeApi) => (
    <>
      <svg className="map-svg map-isvg" viewBox={`0 0 ${api.w} ${api.h}`} width="100%" height="100%" role="group" aria-label="Flows">
        {arcsNow.map((a) => {
          const ps = api.arcPoints(a.a, a.b, 36), runs: string[] = []; let run = "";
          for (const q of ps) { if (q.vis) run += `${run ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`; else if (run) { runs.push(run); run = ""; } }
          if (run) runs.push(run);
          if (!runs.length) return null;
          const A = api.proj(a.a.lat, a.a.lng, 0), B = api.proj(a.b.lat, a.b.lng, 0);
          const g: ArcGeom = { d: runs.join(""), w: 2 + 12 * Math.sqrt(a.value / vmax), a: { x: A.x, y: A.y }, b: { x: B.x, y: B.y }, wrap: 0, mid: ps[Math.floor(ps.length / 2)], aVis: A.vis, bVis: B.vis };
          return <ArcDraw key={a.id} arc={a} g={g} on={openId === a.id} tab={tabArcs && !sx.on} label={arcLabel(a)} pl={`pl-${a.colour}`} anchor={pop.anchor(a.id, () => arcOpen(a, g.mid))} />;
        })}
      </svg>
      <div className="map-pins" data-dh-slot="pins">
        {placesNow.map((p) => { const q = api.proj(p.lat, p.lng, 0); return (
          <div key={p.id} className="map-pin-anchor" style={{ transform: `translate(${q.x}px, ${q.y}px)`, display: q.vis ? undefined : "none" }}>
          <button disabled={sx.on} type="button" className={`map-pin pl-${p.colour} ${openId === p.id ? "is-on" : ""} ${q.x>api.w*.6?"is-left":""}`} data-dh-slot="pin" aria-label={`${p.label}, ${p.lat}, ${p.lng}${p.note ? `. ${p.note}` : ""}`} {...pop.anchor(p.id, () => ({ ...openPlace(p), at: { x: q.x, y: q.y } }))}>
            <span className="map-dot" aria-hidden="true">{p.label.trim().slice(0, 1).toUpperCase()}</span>
            <span className="map-pin-label" aria-hidden="true">{p.label}</span>
          </button>
          </div>
        ); })}
      </div>
    </>
  );
  const onGlobeRegion = (code: string | null, at: { x: number; y: number }, how: "hover" | "click" | "leave") => {
    if (how === "leave") { if (pop.open && spec.fills.some((f) => f.code === pop.open!.data.id)) pop.close(); return; }
    if (!code) { if (how === "click") pop.close(); return; }
    if (how === "click" && pop.open?.data.id === code) { pop.close(); return; }
    const o = regionOpen(code, at); if (o) pop.show(o);
  };
  const toggleMode = () => { pop.close(); setNote(""); setMode((m) => (m === "flat" ? "globe" : "flat")); };
  const flatCls = `map-stage${geoMap ? " is-geo" : ""}`;

  return (
    <div className="map" data-dh-part="map" data-dh-static={sx.on || undefined} data-based={mode === "globe" ? "globe" : based ? host?.provider : "still"} data-geo={geoMap ? "1" : undefined} ref={part}>
      {spec.title ? <div className="map-title">{spec.title}</div> : null}
      {mode === "globe" ? (
        <div className="map-globe-wrap" ref={popHost}>
          <React.Suspense fallback={<div className="map-stage is-globe is-loading" role="status">Loading the globe…</div>}>
            <GlobeStage motionOff={motionOff} ref={globeRef} spec={spec} geo={geo} fills={visibleFills} colours={colours} label={`Globe${spec.title ? `: ${spec.title}` : ""}. Arrow keys turn it, plus and minus zoom.`} focus={gfocus} spinning={spinning} active={spec.fills.some((f) => f.code === openId) ? openId : null}
              onRegion={onGlobeRegion} onFail={() => { setNote("This browser cannot draw the globe, so this is the flat map."); setMode("flat"); }} onUser={() => {}} onSpinEnd={() => setSpinning(false)}>
              {(api) => (
                <>
                  {globeOverlay(api)}
                  <div className="map-ctl" role="group" aria-label="Globe controls">
                    <button disabled={sx.on} type="button" className="map-btn" aria-label="Zoom in" onClick={() => zoom(1)}>+</button>
                    <button disabled={sx.on} type="button" className="map-btn" aria-label="Zoom out" onClick={() => zoom(-1)}>−</button>
                    <button disabled={sx.on} type="button" className="map-btn map-fit" aria-label="Turn back to the start" onClick={fit}><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
                    <button disabled={sx.on} type="button" className="map-btn map-spin" aria-label={spinning ? "Pause the turning" : "Turn slowly"} aria-pressed={spinning} onClick={() => setSpinning((v) => !v)}><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">{spinning ? <path d="M6 4v12M14 4v12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /> : <path d="M6 4l9 6-9 6z" fill="currentColor" />}</svg></button>
                  </div>
                  {pop.node}
                </>
              )}
            </GlobeStage>
          </React.Suspense>
          {geoMap ? <div className="map-ctl-l" role="group" aria-label="View"><button disabled={sx.on} type="button" className="map-btn map-mode" onClick={toggleMode}>Flat map</button></div> : null}
        </div>
      ) : (
      <div className={flatCls} ref={(el) => {stage.current=el;popHost.current=el;}} tabIndex={sx.on?-1:0} role="group" aria-label={`Map${spec.title ? `: ${spec.title}` : ""}. ${spec.places.length} places${hasRegions ? `, ${visibleFills.length} regions with values` : ""}${spec.arcs.length ? `, ${arcsNow.length} flows` : ""}. Arrow keys move the map, plus and minus zoom.`}>
        <div className="map-base" ref={baseEl} aria-hidden="true" />
        <svg className="map-svg" viewBox={`0 0 ${size.w} ${size.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" data-dh-slot="still">
          {!based && <rect className="map-field" width={size.w} height={size.h} />}
          <g className="map-grid">{grid}</g>
        </svg>
        {needsLand(spec) ? (
          <svg className="map-svg map-isvg" viewBox={`0 0 ${size.w} ${size.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="group" aria-label="Regions">
            <g className="map-geo" transform={geoTransform(view, size.w, size.h)} {...regionHandlers}>
              {!based && geo.world ? <Land geo={geo} hide={hideCodes} states={states} /> : null}
              {geo.world ? <Filled geo={geo} fills={visibleFills} colours={colours} unit={unit} on={openId} tab={tabRegions && !sx.on} /> : null}
            </g>
          </svg>
        ) : null}
        <svg className="map-svg" viewBox={`0 0 ${size.w} ${size.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {areasNow.map((a) => <polygon key={a.id} className={`map-area pl-${a.colour}`} data-dh-slot="area" points={pts(a.corners)} />)}
          {routesNow.map((r) => {
            const path = r.way === "flight" ? routePath(r) : routed[r.id] ?? routePath(r);
            const solid = r.way === "flight" || !!routed[r.id] || hasWrittenPath(r);
            return (
              <g key={r.id} className={`map-route pl-${r.colour} ${solid ? "is-solid" : "is-dashed"}`} data-dh-slot="route">
                <polyline className="map-casing" points={pts(path)} {...(solid ? { pathLength: 1 } : {})} />
                <polyline className="map-line" points={pts(path)} {...(solid ? { pathLength: 1 } : {})} />
              </g>
            );
          })}
        </svg>
        {arcsNow.length ? (
          <svg className="map-svg map-isvg" viewBox={`0 0 ${size.w} ${size.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="group" aria-label="Flows">
            {arcsNow.map((a) => { const g = arcGeom(a, view, size.w, size.h, vmax); return <ArcDraw key={a.id} arc={a} g={g} on={openId === a.id} tab={tabArcs} label={arcLabel(a)} pl={`pl-${a.colour}`} anchor={pop.anchor(a.id, () => arcOpen(a, ptr.current ?? g.mid))} />; })}
          </svg>
        ) : null}
        <div className="map-pins" data-dh-slot="pins">
          {placesNow.map((p) => { const q = px(p); return (
            <div key={p.id} className="map-pin-anchor" style={{ transform: `translate(${q.x / size.w * 100}%, ${q.y / size.h * 100}%)` }}>
            <button disabled={sx.on} type="button" className={`map-pin pl-${p.colour} ${pop.open?.data.id === p.id ? "is-on" : ""} ${q.x > size.w * .6 ? "is-left" : ""}`} data-dh-slot="pin" aria-label={`${p.label}, ${p.lat}, ${p.lng}${p.note ? `. ${p.note}` : ""}`} {...pop.anchor(p.id, () => openPlace(p))}>
              <span className="map-dot" aria-hidden="true">{p.label.trim().slice(0, 1).toUpperCase()}</span>
              <span className="map-pin-label" aria-hidden="true">{p.label}</span>
            </button>
            </div>
          ); })}
        </div>
        {!sx.on && <div className="map-ctl" role="group" aria-label="Zoom">
          <button disabled={sx.on} type="button" className="map-btn" aria-label="Zoom in" onClick={() => zoom(1)}>+</button>
          <button disabled={sx.on} type="button" className="map-btn" aria-label="Zoom out" onClick={() => zoom(-1)}>−</button>
          <button disabled={sx.on} type="button" className="map-btn map-fit" aria-label="Show everything" onClick={fit}><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        </div>}
        {geoMap && !sx.on ? <div className="map-ctl-l" role="group" aria-label="View"><button type="button" className="map-btn map-mode" onClick={toggleMode}>Globe</button></div> : null}
        <div className="map-scale" aria-hidden="true"><span style={{ width: Math.max(8, Math.round(bar.px)) }} />{bar.metres >= 1000 ? `${bar.metres / 1000} km` : `${bar.metres} m`}</div>
        {attribution ? <div className="map-attr" data-dh-slot="attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">{attribution}</a></div> : null}
        {pop.node}
      </div>
      )}
      {!sx.on && <p className="map-hint">{mode === "globe" ? "A mouse drags to turn · two fingers turn and pinch · Ctrl + scroll zooms · arrows and + − on the keyboard" : "A mouse drags · two fingers move and pinch · Ctrl + scroll zooms · arrows and + − on the keyboard"}</p>}
      {note ? <p className="map-note" role="status">{note}</p> : null}
      {hasRegions ? <ScaleLegend spec={spec} range={range} lowIsNone={lowIsNone} /> : null}
      {n ? (
        <>
          {sx.on ? <StaticSteps titles={spec.steps.map((x) => x.title)} i={step} print={sx.print} /> : <><p className="map-cap" aria-live="polite"><StepTitle titles={spec.steps.map(x => x.title)} index={step} /></p>
          <Controls ui={ui} i={step} n={n} onGo={goStep} label="Map steps" /></>}
        </>
      ) : null}
      {((sx.on ? routesNow.length + areasNow.length : spec.routes.length + spec.areas.length) > 0) ? (
        <ul className="map-legend" data-dh-slot="legend" aria-hidden={!(routesNow.length || areasNow.length) || undefined}>
          {(sx.on ? routesNow : spec.routes).map((r) => (
            <li key={r.id} className={`pl-${r.colour}${r.shownAt > step ? " dh-step-hidden" : ""}`} aria-hidden={r.shownAt > step || undefined}><span className={`map-sw ${r.way === "flight" || hasWrittenPath(r) || routed[r.id] ? "" : "is-dashed"}`} aria-hidden="true" />
              <b>{r.label}</b> {WAY_WORDS[r.way]} · about {kmWords(routeLength(r))}{routed[r.id] ? " · follows the roads" : r.way === "flight" ? " · great-circle arc" : hasWrittenPath(r) ? " · path as written" : " · straight line"}</li>
          ))}
          {(sx.on ? areasNow : spec.areas).map((a) => <li key={a.id} className={`pl-${a.colour}${a.shownAt > step ? " dh-step-hidden" : ""}`} aria-hidden={a.shownAt > step || undefined}><span className="map-sw is-area" aria-hidden="true" /><b>{a.label}</b> area, {a.corners.length} corners</li>)}
        </ul>
      ) : null}
      <ValuesPanel still={sx.on} spec={spec} fills={visibleFills} arcs={arcsNow} onShow={showRegion} onArc={showArc} open={openId} />
      {spec.places.length ? (
      <ul className="map-places" data-dh-slot="places">
        {spec.places.map((p) => (
          <li key={p.id} className={`map-place-row pl-${p.colour}`} data-dh-slot="place-row">
            <span className="map-dot" aria-hidden="true">{p.label.trim().slice(0, 1).toUpperCase()}</span>
            <span className="map-place-text"><b>{p.label}</b> <code>{p.lat}, {p.lng}</code>{p.note ? <span className="map-place-note">{p.note}</span> : null}</span>
            <span className="map-place-acts"><button disabled={sx.on} type="button" className="btn btn-s" onClick={() => showList(p)}>Show on map</button><a className="btn btn-s" href={osmLink(p)} target="_blank" rel="noopener noreferrer">Open in maps</a></span>
          </li>
        ))}
      </ul>
      ) : null}
    </div>
  );
}

export default function MapView(p: import("../types").PartViewProps<MapSpec>) {
  const {map}=useDh();
  if(p.data.errors.length)return <div className="cw-error">{p.data.errors[0].msg}</div>;
  return <MapRenderer motionOff={p.stage.motion==="off"} spec={p.data} host={map??null} ui={p.ui} static={p.static}/>;
}
