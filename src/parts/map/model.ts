// The map part : places, routes and areas as text; the host picks the provider.
//
//   ```map title="Lunch near the office"
//   place office "Office" 37.7897, -122.3972 [c1] note="Front door on Mission Street"
//   route walk "Walk to lunch" by=walk [acc]: office -> 37.7889, -122.3990 -> cafe
//   area zone "Delivery zone" [warn]: 37.791, -122.401; 37.791, -122.394; 37.786, -122.394
//   view 37.788, -122.398 zoom=15
//   @step The office.
//   focus office
//   show walk
//   ```
//
// Coordinates are latitude first, decimal degrees. A route stop is a place id or `lat, lng`; a `lat, lng` stop is a
// point the line passes through, so a route can follow roads with no router (the host's router, when it has one,
// replaces the straight lines between the stops). This module is pure: the parser, the projection, the distances and
// the LLM view. The view draws the map with real SVG and HTML.
import type { Budget } from "../../core/budget";
import { COLOUR_WORDS, colourError, takeColour, takeLabel, takeQuoted, unknownKeys, type PErr } from "../kit/places";
import { GEO_LIMITS, fmtNum, isUsState, rangeOf, regionBox, regionName, regionPoint, regionRow, suggestRegions, type Scale } from "./geo"; 

export const MAP_WAYS = ["walk", "bike", "drive", "transit", "straight", "flight"] as const;
export type Way = (typeof MAP_WAYS)[number];
export const MAP_CAPS = { places: 100, shapes: 50, points: 2000, fills: GEO_LIMITS.fills, arcs: GEO_LIMITS.arcs };
export const MAP_KEYS = ["title", "view", "scale", "unit", "diverge", "min", "max", "steps", "spin", "none"]; 
export const SCALE_WORDS = ["heat", "steps"];
export type LL = { lat: number; lng: number };
export type MPlace = LL & { id: string; label: string; colour: string; note: string; line: number; from: number };
export type Stop = { place?: string } & LL;
export type MRoute = { id: string; label: string; way: Way; colour: string; stops: Stop[]; line: number; from: number; shownAt: number };
export type MArea = { id: string; label: string; colour: string; corners: LL[]; line: number; from: number; shownAt: number };
export type MStep = { title: string; line: number; focus: string | null; show: string[]; view: { center: LL; zoom: number | null } | null };
/** p11 places2: a region (country "DE", US state "US-CA") coloured by a value */
export type MFill = { code: string; name: string; value: number; raw: string; note: string; line: number; from: number };
/** p11 places2: where an arc starts or ends: a place, a region (its label point) or a pair */
export type MEnd = LL & { place?: string; region?: string; name: string };
export type MArc = { id: string; auto: boolean; a: MEnd; b: MEnd; value: number; raw: string; label: string; colour: string; line: number; from: number; shownAt: number };
export type MapSpec = {
  title: string; places: MPlace[]; routes: MRoute[]; areas: MArea[]; view: { center: LL; zoom: number | null } | null;
  steps: MStep[]; errors: PErr[]; geoPointLimit: number;
  fills: MFill[]; arcs: MArc[]; scale: Scale; globe: boolean; spin: boolean; 
};

const NUM = String.raw`[+-]?\d+(?:\.\d+)?`;
const PAIR = new RegExp(String.raw`^(${NUM})\s*,\s*(${NUM})$`);
const ID = String.raw`[A-Za-z0-9_.\-]+`;
const VAL = String.raw`[+-]?\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?`; 

// ---------- geometry (pure) ----------
const R = 6371008.8; // metres, mean earth radius
const rad = (d: number) => (d * Math.PI) / 180;
/** straight-line (great-circle) distance in metres */
export function haversine(a: LL, b: LL): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function kmWords(m: number): string {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
/** Web Mercator in the unit square at zoom 0 (the same projection the tile providers draw) */
export function merc(p: LL): { x: number; y: number } {
  const s = Math.sin(rad(Math.max(-85.0511, Math.min(85.0511, p.lat))));
  return { x: (p.lng + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
}
export function unmerc(x: number, y: number): LL {
  const n = Math.PI - 2 * Math.PI * y;
  return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng: x * 360 - 180 };
}
/** a great-circle arc of n+1 points (a `flight`) */
export function arc(a: LL, b: LL, n = 32): LL[] {
  const la1 = rad(a.lat), lo1 = rad(a.lng), la2 = rad(b.lat), lo2 = rad(b.lng);
  const d = haversine(a, b) / R;
  if (d < 1e-9) return [a, b];
  const out: LL[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    out.push({ lat: (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI, lng: (Math.atan2(y, x) * 180) / Math.PI });
  }
  return out;
}
/** the points a route is drawn through, with no router: the stops, or the arc for a flight */
export function routePath(r: MRoute): LL[] {
  if (r.way === "flight") { const out: LL[] = []; for (let i = 0; i < r.stops.length - 1; i++) out.push(...arc(r.stops[i], r.stops[i + 1]).slice(i ? 1 : 0)); return out; }
  return r.stops.map((s) => ({ lat: s.lat, lng: s.lng }));
}
export const routeLength = (r: MRoute): number => r.stops.slice(1).reduce((n, s, i) => n + haversine(r.stops[i], s), 0);
/** true when a route has points the author wrote in between (a path that follows the roads as written) */
export const hasWrittenPath = (r: MRoute): boolean => r.stops.some((s, i) => !s.place && i > 0 && i < r.stops.length - 1);

export type Box = { minX: number; minY: number; maxX: number; maxY: number };
export function boxOf(points: LL[]): Box | null {
  if (!points.length) return null;
  const b: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of points) { const m = merc(p); b.minX = Math.min(b.minX, m.x); b.maxX = Math.max(b.maxX, m.x); b.minY = Math.min(b.minY, m.y); b.maxY = Math.max(b.maxY, m.y); }
  return b;
}
/** every point of a spec (places, route paths, area corners) */
export function allPoints(s: MapSpec): LL[] {
  return [...s.places, ...s.routes.flatMap(routePath), ...s.areas.flatMap((a) => a.corners), ...fillPoints(s), ...s.arcs.flatMap((a) => [a.a, a.b])];
}
/** the corners of the boxes of the filled regions. With 6 or more other US states filled, Alaska and Hawaii are left out of the
 *  default view (the view would be the whole Pacific); the reader can zoom out, and the list under the map has every value. */
export function fillPoints(s: MapSpec): LL[] {
  const lower = s.fills.filter((f) => isUsState(f.code) && f.code !== "US-AK" && f.code !== "US-HI").length;
  return s.fills.flatMap((f) => (lower >= 6 && (f.code === "US-AK" || f.code === "US-HI")) ? [] : regionBox(f.code));
}
/** a camera: the centre in Mercator units and `scale`, pixels per unit square (256 * 2^zoom) */
export type Camera = { cx: number; cy: number; zoom: number };
/** the camera that fits a box in a w by h pixel area with a margin; zoom is fractional */
export function fitBox(b: Box | null, w: number, h: number, pad = 56, maxZoom = 17): Camera {
  if (!b) return { cx: 0.5, cy: 0.5, zoom: 1 };
  const bw = Math.max(b.maxX - b.minX, 1e-7), bh = Math.max(b.maxY - b.minY, 1e-7);
  const zx = Math.log2(Math.max(10, w - pad * 2) / (256 * bw)), zy = Math.log2(Math.max(10, h - pad * 2) / (256 * bh));
  return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, zoom: Math.max(0, Math.min(maxZoom, zx, zy)) };
}
export function cameraAt(center: LL, zoom: number): Camera { const m = merc(center); return { cx: m.x, cy: m.y, zoom }; }
/** a point in pixels inside a w by h area under a camera */
export function toPx(p: LL, c: Camera, w: number, h: number): { x: number; y: number } {
  const m = merc(p), s = 256 * 2 ** c.zoom;
  return { x: w / 2 + (m.x - c.cx) * s, y: h / 2 + (m.y - c.cy) * s };
}
/** the length of a scale bar: a round number of metres that fills about `px` pixels at this latitude and zoom */
export function scaleBar(c: Camera, lat: number, px = 96): { metres: number; px: number } {
  const mPerPx = (40075016.686 * Math.cos(rad(lat))) / (256 * 2 ** c.zoom);
  const raw = mPerPx * px;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((k) => k * pow).filter((m) => m <= raw).pop() ?? pow;
  return { metres: nice, px: nice / mPerPx };
}
export const osmLink = (p: LL, zoom = 17): string => `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=${zoom}/${p.lat}/${p.lng}`;

// ---------- parsing ----------
type PartLike = { head: string; body: string; bodyLine: number; steps: { title: string; raw: string; line: number }[]; attrs: Record<string, string> };

function coord(a: string, b: string, line: number, what: string, errors: PErr[]): LL | null {
  const lat = +a, lng = +b;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) { errors.push({ line, msg: `${what}: latitude ${a} is outside -90 to 90 (the latitude comes first, then the longitude)` }); return null; }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) { errors.push({ line, msg: `${what}: longitude ${b} is outside -180 to 180 (the latitude comes first, then the longitude)` }); return null; }
  return { lat, lng };
}

export function parseMap(p: PartLike, budget?: Budget, caps = MAP_CAPS, geoPointLimit = GEO_LIMITS.geoPoints): MapSpec {
  const errors: PErr[] = [];
  const spec: MapSpec = { title: p.attrs.title ?? "", places: [], routes: [], areas: [], view: null, steps: [], errors, geoPointLimit,
    fills: [], arcs: [], scale: { kind: "heat", unit: "", diverge: null, min: null, max: null, bins: 5, none: "No data" }, globe: false, spin: true };
  for (const m of unknownKeys(p.attrs, MAP_KEYS, "map")) errors.push({ line: 0, msg: m });
  readKeys(p.attrs, spec, p.bodyLine - 1);
  const ids = new Map<string, number>();
  let points = 0;
  type Pending = { kind: "route" | "area" | "arc"; raw: string; line: number; from: number };
  const fillAt = new Map<string, number>();
  const pending: Pending[] = [];
  const takeId = (id: string, line: number, what: string): boolean => {
    if (ids.has(id)) { errors.push({ line, msg: `${what} id "${id}" is used twice (first at line ${ids.get(id)}); ids are unique inside a map` }); return false; }
    ids.set(id, line);
    return true;
  };
  const scan = (text: string, baseLine: number, from: number, step: MStep | null) => {
    text.split("\n").forEach((raw, i) => {
      const line = baseLine + i;
      budget?.charge(raw.length + 1, 1, raw.length);
      let t = raw.trim();
      if (!t || t.startsWith("//")) return;
      const w = t.match(/^(place|route|area|fill|arc|view|focus|show)\b\s*(.*)$/);
      if (!w) { errors.push({ line, msg: `map: cannot read "${t.slice(0, 50)}"; a line starts with place, route, area, fill, arc, view${step ? ", focus or show" : ""}` }); return; }
      const [, kind, rest] = w;
      if (kind === "place") {
        const m = rest.match(new RegExp(String.raw`^(${ID})\s+"([^"]*)"\s+(${NUM})\s*,\s*(${NUM})\s*(.*)$`));
        if (!m) { errors.push({ line, msg: `map: a place line is: place <id> "label" <lat>, <lng> [colour] [note="..."]` }); return; }
        let tail = m[5];
        const q = takeQuoted(tail, "note"); tail = q.rest;
        const c = takeColour(tail); tail = c.rest;
        if (c.raw !== null && !c.word) errors.push({ line, msg: colourError("map place", c.raw) });
        if (tail) errors.push({ line, msg: `map: unexpected "${tail.slice(0, 30)}" after the place; a place line ends with an optional [colour] and note="..."` });
        const ll = coord(m[3], m[4], line, `place ${m[1]}`, errors);
        if (!takeId(m[1], line, "place")) return;
        if (ll) { spec.places.push({ id: m[1], label: m[2], ...ll, colour: c.word ?? "c1", note: q.value ?? "", line, from }); points++; }
        return;
      }
      if (kind === "fill") {
        const m = rest.match(new RegExp(String.raw`^(\S+)\s+(${VAL})\s*(.*)$`));
        if (!m) { errors.push({ line, msg: `map: a fill line is: fill <region> <value> [note="..."], like: fill DE 83.2 (a country code, or a US state like US-CA)` }); return; }
        let tail = m[3];
        const q = takeQuoted(tail, "note"); tail = q.rest;
        if (tail) errors.push({ line, msg: `map: unexpected "${tail.slice(0, 30)}" after the value; a fill line ends with an optional note="..."` });
        const row = regionRow(m[1]);
        if (!row) {
          budget?.charge(300);
          const sug = suggestRegions(m[1]);
          errors.push({ line, msg: `map: "${m[1]}" is not a region code${sug.length ? `; did you mean ${sug.join(", ")}?` : ""} (countries are ISO 3166-1 alpha-2 codes like DE, upper case; US states are US-CA, US-NY and so on)` });
          return;
        }
        if (fillAt.has(m[1])) { errors.push({ line, msg: `map: ${m[1]} (${row[1]}) is filled twice (first at line ${fillAt.get(m[1])}); each region has one value` }); return; }
        fillAt.set(m[1], line);
        spec.fills.push({ code: m[1], name: row[1], value: +m[2].replace(/_/g, ""), raw: m[2], note: q.value ?? "", line, from });
        return;
      }
      if (kind === "route" || kind === "area" || kind === "arc") { pending.push({ kind, raw: rest, line, from }); return; }
      if (kind === "view") {
        const m = rest.match(new RegExp(String.raw`^(${NUM})\s*,\s*(${NUM})(?:\s+zoom=(\S+))?\s*$`));
        if (!m) { errors.push({ line, msg: `map: a view line is: view <lat>, <lng> zoom=<0-18>` }); return; }
        const ll = coord(m[1], m[2], line, "view", errors);
        let zoom: number | null = null;
        if (m[3] !== undefined) { zoom = +m[3]; if (!Number.isFinite(zoom) || zoom < 0 || zoom > 18) { errors.push({ line, msg: `map: zoom ${m[3]} is outside 0 to 18` }); zoom = null; } }
        if (ll) { if (step) step.view = { center: ll, zoom }; else spec.view = { center: ll, zoom }; }
        return;
      }
      // focus, show: only under a step
      if (!step) { errors.push({ line, msg: `map: "${kind}" belongs under an @step line (it moves the camera or draws a shape in that step)` }); return; }
      const id = rest.trim();
      if (!new RegExp(`^${ID}$`).test(id)) { errors.push({ line, msg: `map: "${kind}" takes one id, like "${kind} office"` }); return; }
      if (kind === "focus") step.focus = id; else step.show.push(id);
    });
  };
  // the head first, then each step (a step's own lines are visible from that step on)
  scan(p.head, p.bodyLine, -1, null);
  p.steps.forEach((s, k) => {
    const st: MStep = { title: s.title, line: s.line, focus: null, show: [], view: null };
    spec.steps.push(st);
    scan(s.raw, s.line + 1, k, st);
  });
  // routes and areas are read after every place is known
  const placeById = new Map(spec.places.map((x) => [x.id, x]));
  for (const pe of pending) {
    if (pe.kind === "route") {
      const m = headOf(pe.raw);
      if (!m) { errors.push({ line: pe.line, msg: `map: a route line is: route <id> "label" by=<way> [colour]: <stop> -> <stop>` }); continue; }
      let head = m[3];
      const c = takeColour(head); head = c.rest;
      if (c.raw !== null && !c.word) errors.push({ line: pe.line, msg: colourError("map route", c.raw) });
      let way: Way = "straight";
      const by = head.match(/\bby=(\S+)/);
      if (by) { head = head.replace(by[0], "").trim(); if ((MAP_WAYS as readonly string[]).includes(by[1])) way = by[1] as Way; else errors.push({ line: pe.line, msg: `map route ${m[1]}: unknown way "${by[1]}"; ways are ${MAP_WAYS.join(", ")}` }); }
      if (head) errors.push({ line: pe.line, msg: `map route ${m[1]}: unexpected "${head.slice(0, 30)}" before the colon; write by=<way> and an optional [colour]` });
      const stops: Stop[] = [];
      let bad = false;
      for (const raw of m[4].split("->").map((x) => x.trim())) {
        if (!raw) { errors.push({ line: pe.line, msg: `map route ${m[1]}: an empty stop; write stops as place ids or "lat, lng" with -> between them` }); bad = true; continue; }
        const pm = raw.match(PAIR);
        if (pm) { const ll = coord(pm[1], pm[2], pe.line, `route ${m[1]}`, errors); if (ll) stops.push(ll); else bad = true; continue; }
        const pl = placeById.get(raw);
        if (!pl) { errors.push({ line: pe.line, msg: `map route ${m[1]}: stop "${raw}" is not a place id or a "lat, lng" pair; the places are ${spec.places.map((x) => x.id).join(", ") || "(none yet)"}` }); bad = true; continue; }
        stops.push({ place: pl.id, lat: pl.lat, lng: pl.lng });
      }
      if (!bad && stops.length < 2) errors.push({ line: pe.line, msg: `map route ${m[1]} needs at least 2 stops` });
      if (!takeId(m[1], pe.line, "route")) continue;
      points += stops.length;
      if (!bad && stops.length >= 2) spec.routes.push({ id: m[1], label: m[2] ?? m[1], way, colour: c.word ?? "acc", stops, line: pe.line, from: pe.from, shownAt: pe.from });
    } else if (pe.kind === "arc") {
      readArc(pe, spec, placeById, errors, takeId);
    } else {
      const m = headOf(pe.raw);
      if (!m) { errors.push({ line: pe.line, msg: `map: an area line is: area <id> "label" [colour]: <lat>, <lng>; <lat>, <lng>; ...` }); continue; }
      let head = m[3];
      const c = takeColour(head); head = c.rest;
      if (c.raw !== null && !c.word) errors.push({ line: pe.line, msg: colourError("map area", c.raw) });
      if (head) errors.push({ line: pe.line, msg: `map area ${m[1]}: unexpected "${head.slice(0, 30)}" before the colon; an area has a label and an optional [colour]` });
      const corners: LL[] = [];
      let bad = false;
      for (const raw of m[4].split(";").map((x) => x.trim()).filter(Boolean)) {
        const pm = raw.match(PAIR);
        if (!pm) { errors.push({ line: pe.line, msg: `map area ${m[1]}: corner "${raw}" is not "lat, lng"; separate corners with ;` }); bad = true; continue; }
        const ll = coord(pm[1], pm[2], pe.line, `area ${m[1]}`, errors); if (ll) corners.push(ll); else bad = true;
      }
      if (!bad && corners.length < 3) errors.push({ line: pe.line, msg: `map area ${m[1]} has ${corners.length} corner${corners.length === 1 ? "" : "s"}; an area needs at least 3` });
      if (!takeId(m[1], pe.line, "area")) continue;
      points += corners.length;
      if (!bad && corners.length >= 3) spec.areas.push({ id: m[1], label: m[2] ?? m[1], colour: c.word ?? "acc", corners, line: pe.line, from: pe.from, shownAt: pe.from });
    }
  }
  // caps
  if (spec.places.length > caps.places) errors.push({ line: p.bodyLine, msg: `map has ${spec.places.length} places; the cap is ${caps.places}: split it into two maps` });
  if (spec.routes.length + spec.areas.length > caps.shapes) errors.push({ line: p.bodyLine, msg: `map has ${spec.routes.length + spec.areas.length} routes and areas; the cap is ${caps.shapes}: split it into two maps` });
  if (spec.fills.length > caps.fills) errors.push({ line: p.bodyLine, msg: `map has ${spec.fills.length} fill lines; the cap is ${caps.fills}: split it into two maps` });
  if (spec.arcs.length > caps.arcs) errors.push({ line: p.bodyLine, msg: `map has ${spec.arcs.length} arcs; the cap is ${caps.arcs}: keep the biggest flows, or split it into two maps` });
  if (points > caps.points) errors.push({ line: p.bodyLine, msg: `map has ${points} points (places, stops and corners); the cap is ${caps.points}: simplify the lines` });
  // what a head route or area does with steps: it is drawn only from the step that shows it
  if (spec.steps.length) {
    const shownIn = new Map<string, number>();
    spec.steps.forEach((s, k) => { for (const id of s.show) if (!shownIn.has(id)) shownIn.set(id, k); });
    for (const r of spec.routes) if (r.from < 0) r.shownAt = shownIn.get(r.id) ?? 0;
    for (const a of spec.areas) if (a.from < 0) a.shownAt = shownIn.get(a.id) ?? 0;
    for (const a of spec.arcs) if (a.from < 0) a.shownAt = shownIn.get(a.id) ?? 0;
  } else { for (const r of spec.routes) r.shownAt = 0; for (const a of spec.areas) a.shownAt = 0; for (const a of spec.arcs) a.shownAt = 0; }
  // steps name known ids
  const known = new Set([...spec.places.map((x) => x.id), ...spec.routes.map((x) => x.id), ...spec.areas.map((x) => x.id), ...spec.arcs.map((x) => x.id)]);
  for (const s of spec.steps) {
    if (s.focus && !known.has(s.focus) && !regionRow(s.focus)) errors.push({ line: s.line, msg: `map step "${s.title}": focus ${s.focus} is not a place, route, area or region code; the ids are ${[...known].join(", ") || "(none)"}` });
    for (const id of s.show) if (!known.has(id)) errors.push({ line: s.line, msg: `map step "${s.title}": show ${id} is not a place, route or area; the ids are ${[...known].join(", ")}` });
  }
  if (!spec.places.length && !spec.routes.length && !spec.areas.length && !spec.fills.length && !spec.arcs.length && !errors.length) errors.push({ line: p.bodyLine, msg: `map is empty: add a place, like: place office "Office" 37.7897, -122.3972, or a region value, like: fill DE 83.2` });
  return spec;
}

// ---------- p11 places2: the fence keys and the arc line ----------
function readKeys(attrs: Record<string, string>, spec: MapSpec, line: number) {
  const err = (msg: string) => spec.errors.push({ line, msg });
  const num = (k: string): number | null => { if (attrs[k] === undefined) return null; const n = Number(attrs[k]); if (!Number.isFinite(n)) { err(`map: ${k}=${attrs[k]} is not a number`); return null; } return n; };
  if (attrs.view !== undefined) { if (attrs.view === "globe") spec.globe = true; else if (attrs.view !== "flat") err(`map: view=${attrs.view} is not a view; use view=globe (a turning globe) or view=flat (the default)`); }
  if (attrs.scale !== undefined) { if (SCALE_WORDS.includes(attrs.scale)) spec.scale.kind = attrs.scale as Scale["kind"]; else err(`map: scale=${attrs.scale} is not a scale; the scales are ${SCALE_WORDS.join(", ")} (heat is a smooth ramp, steps is a few even bands)`); }
  if (attrs.steps !== undefined) { const n = num("steps"); if (n !== null) { if (!Number.isInteger(n) || n < 3 || n > 9) err(`map: steps=${attrs.steps} is outside 3 to 9 bands`); else spec.scale.bins = n; } }
  if (attrs.unit !== undefined) spec.scale.unit = attrs.unit;
  if (attrs.none !== undefined) spec.scale.none = attrs.none;
  spec.scale.diverge = num("diverge"); spec.scale.min = num("min"); spec.scale.max = num("max");
  if (spec.scale.min !== null && spec.scale.max !== null && spec.scale.min >= spec.scale.max) err(`map: min=${spec.scale.min} is not below max=${spec.scale.max}`);
  if (attrs.spin !== undefined) { if (attrs.spin === "off") spec.spin = false; else if (attrs.spin !== "on") err(`map: spin=${attrs.spin} is not a choice; use spin=off (a still globe) or spin=on (the default)`); }
}
type EndReq = { raw: string; place?: string };
const ID_CH = /[A-Za-z0-9_.\-]/;
/** "<id> "label" <words>: <body>" cut by hand (0.6.2: linear time): [whole, id, label | undefined, head, body] or null */
function headOf(raw: string): [string, string, string | undefined, string, string] | null {
  let i = 0; while (i < raw.length && ID_CH.test(raw[i])) i++;
  if (i === 0) return null;
  let j = i; while (j < raw.length && /\s/.test(raw[j])) j++;
  let label: string | undefined;
  if (raw[j] === '"') { const k = raw.indexOf('"', j + 1); if (k >= 0) { label = raw.slice(j + 1, k); j = k + 1; } }
  const c = raw.indexOf(":", j);
  return c < 0 ? null : [raw, raw.slice(0, i), label, raw.slice(j, c).trim(), raw.slice(c + 1).trim()];
}
function readArc(pe: { raw: string; line: number; from: number }, spec: MapSpec, placeById: Map<string, MPlace>, errors: PErr[], takeId: (id: string, line: number, what: string) => boolean) {
  const arrow = pe.raw.indexOf("->"), m = arrow < 0 ? null : [pe.raw, pe.raw.slice(0, arrow).trim(), pe.raw.slice(arrow + 2).trim()];
  const usage = `map: an arc line is: arc <from> -> <to> <value> ["label"] [colour] [id=name], where from and to are a place id, a region code (DE, US-CA) or "lat, lng"`;
  if (!m) { errors.push({ line: pe.line, msg: usage }); return; }
  const r = m[2].match(new RegExp(String.raw`^(?:(${NUM}\s*,\s*${NUM})|(${ID}))\s+(${VAL})(.*)$`));
  if (!r) { errors.push({ line: pe.line, msg: `${usage}; the value (a number) comes after the end point` }); return; }
  let tail = r[4];
  const lab = takeLabel(tail); tail = lab.rest;
  const idm = tail.match(/\bid=(\S+)/); if (idm) tail = tail.replace(idm[0], " ");
  const c = takeColour(tail); tail = c.rest;
  if (c.raw !== null && !c.word) errors.push({ line: pe.line, msg: colourError("map arc", c.raw) });
  if (tail.trim()) errors.push({ line: pe.line, msg: `map arc: unexpected "${tail.trim().slice(0, 30)}"; after the value an arc takes an optional "label", [colour] and id=name` });
  const end = (e: EndReq, side: string): MEnd | null => {
    const pm = e.raw.match(PAIR);
    if (pm) { const ll = coord(pm[1], pm[2], pe.line, `arc ${side}`, errors); return ll ? { ...ll, name: `${ll.lat}, ${ll.lng}` } : null; }
    const pl = placeById.get(e.raw);
    if (pl) return { lat: pl.lat, lng: pl.lng, place: pl.id, name: pl.label };
    const rp = regionPoint(e.raw);
    if (rp) return { ...rp, region: e.raw, name: regionName(e.raw) };
    const sug = suggestRegions(e.raw);
    errors.push({ line: pe.line, msg: `map arc: "${e.raw}" (the ${side} end) is not a place id, a region code or a "lat, lng" pair${sug.length ? `; did you mean ${sug.join(", ")}?` : ""}; the places are ${spec.places.map((x) => x.id).join(", ") || "(none)"}` });
    return null;
  };
  const a = end({ raw: m[1].trim() }, "from"), b = end({ raw: (r[1] ?? r[2]).trim() }, "to");
  const value = +r[3].replace(/_/g, "");
  if (!(value > 0)) { errors.push({ line: pe.line, msg: `map arc: the value ${r[3]} is not above 0; the width of an arc is its value, so write a positive number` }); return; }
  if (!a || !b) return;
  if (a.lat === b.lat && a.lng === b.lng) { errors.push({ line: pe.line, msg: `map arc: from and to are the same point (${a.name}); an arc joins two different places` }); return; }
  const id = idm ? idm[1] : `arc-${spec.arcs.length + 1}`;
  if (idm && !takeId(id, pe.line, "arc")) return;
  spec.arcs.push({ id, auto: !idm, a, b, value, raw: r[3], label: lab.value ?? "", colour: c.word ?? "acc", line: pe.line, from: pe.from, shownAt: pe.from });
}

// ---------- the LLM view ----------
const WAY_WORDS: Record<Way, string> = { walk: "on foot", bike: "by bike", drive: "by car", transit: "by public transport", straight: "in a straight line", flight: "by air" };
export function mapLlm(spec: MapSpec): string {
  const out: string[] = [`Map: ${spec.title || "untitled"}.`];
  const name = (s: Stop) => (s.place ? spec.places.find((x) => x.id === s.place)?.label ?? s.place : `${s.lat}, ${s.lng}`);
  if (spec.places.length) {
    out.push("", "Places:");
    for (const p of spec.places) out.push(`- ${p.label} (${p.lat}, ${p.lng})${p.note ? `: ${p.note}` : ""}`);
  }
  if (spec.routes.length) {
    out.push("", "Routes:");
    for (const r of spec.routes) out.push(`- ${r.label}, ${WAY_WORDS[r.way]}: ${r.stops.map(name).join(" -> ")} (about ${kmWords(routeLength(r))} in a straight line)`);
  }
  if (spec.areas.length) {
    out.push("", "Areas:");
    for (const a of spec.areas) out.push(`- ${a.label} (${a.corners.length} corners)`);
  }
  if (spec.fills.length) {
    const sc = spec.scale, unit = sc.unit ? ` (${sc.unit})` : "", vals = spec.fills.map((f) => f.value), n = vals.length;
    out.push("", `Values: ${n} region${n === 1 ? "" : "s"}, from ${fmtNum(Math.min(...vals))} to ${fmtNum(Math.max(...vals))}${sc.diverge !== null ? `, shown around ${sc.diverge}` : ""}.`, "", `| region | value${unit} |`, "| --- | --- |");
    for (const f of spec.fills) out.push(`| ${f.name} | ${f.raw}${f.note ? ` (${f.note})` : ""} |`);
  }
  if (spec.arcs.length) {
    out.push("", "Arcs:");
    const u = spec.scale.unit ? ` ${spec.scale.unit}` : "";
    for (const a of spec.arcs) out.push(`- ${a.a.name} -> ${a.b.name}: ${a.raw}${u}${a.label ? ` (${a.label})` : ""}`);
  }
  if (spec.globe) out.push("", "Shown as a turning globe.");
  if (spec.steps.length) { out.push("", "Steps:"); spec.steps.forEach((s, i) => out.push(`${i + 1}. ${s.title}`)); }
  return out.join("\n");
}
export { COLOUR_WORDS };
