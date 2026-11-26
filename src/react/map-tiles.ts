// Image-only base tiles. The map part owns overlays, controls and gestures.
import { applyUrlPolicy } from "../safety";
import type { Camera } from "../parts/map/model";
import type { Basemap, BasemapContext, MapHost } from "../parts/map/host";
export type { Basemap, BasemapContext, MapHost } from "../parts/map/host";

export interface TileProviderOptions {
  /** Host-owned template with {z}, {x}, {y}; there is no default server. */
  tiles?: string;
  /** Required plain-text credit. */
  attribution?: string;
  referrerPolicy?: "no-referrer" | "strict-origin" | "strict-origin-when-cross-origin";
  /** Requires the tile server to send suitable CORS headers; omits cross-origin credentials. */
  crossOrigin?: "anonymous";
  /** Per-attempt timeout, including queue time; hosts may lower the 12-second default. */
  timeoutMs?: number;
}
export class TileTemplateError extends Error { name = "TileTemplateError"; }
export const TILE_TIMEOUT_MS = 12_000;
interface Tile { key: string; z: number; x: number; y: number; left: number; top: number; size: number }
const MAX_TILES = 64, MAX_LOADING = 8;

/** Web Mercator, 256-pixel tiles; repeat longitude, clip latitude. */
export function tileLayout(v: Camera, width: number, height: number): Tile[] {
  if (![v.cx, v.cy, v.zoom, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error("Invalid tile camera or size");
  const zoom = Math.max(0, Math.min(18, v.zoom)), z = Math.floor(zoom), n = 2 ** z;
  const size = 256 * 2 ** (zoom - z), cx = ((v.cx % 1) + 1) % 1 * n, cy = Math.max(0, Math.min(1, v.cy)) * n;
  const x0 = Math.floor(cx - width / 2 / size), x1 = Math.ceil(cx + width / 2 / size) - 1;
  const y0 = Math.max(0, Math.floor(cy - height / 2 / size)), y1 = Math.min(n - 1, Math.ceil(cy + height / 2 / size) - 1);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES) throw new Error("Tile viewport exceeds 64 tiles");
  const tiles: Tile[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push({ key: `${z}/${x}/${y}`, z, x: ((x % n) + n) % n, y, left: width / 2 + (x - cx) * size, top: height / 2 + (y - cy) * size, size });
  return tiles;
}

function openTiles(options: TileProviderOptions, el: HTMLElement, first: Camera, context: BasemapContext): Basemap {
  if (!options.tiles?.trim()) throw new Error("Tile template is required");
  if (!options.attribution?.trim()) throw new Error("Tile attribution is required");
  const template = options.tiles;
  if (!["z", "x", "y"].every(k => template.includes(`{${k}}`)) || /[{}]/.test(template.replace(/\{[zxy]\}/g, ""))) throw new TileTemplateError("Invalid tile template: require {z}, {x}, {y} and no other placeholders");
  const referrerPolicy = options.referrerPolicy ?? "no-referrer";
  if (!["no-referrer", "strict-origin", "strict-origin-when-cross-origin"].includes(referrerPolicy)) throw new Error("Invalid tile referrer policy");
  if (options.crossOrigin !== undefined && options.crossOrigin !== "anonymous") throw new Error("Invalid tile cross-origin mode");
  const timeoutMs = options.timeoutMs ?? TILE_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > TILE_TIMEOUT_MS) throw new Error("Invalid tile timeout");
  const doc = el.ownerDocument, layer = doc.createElement("div"), credit = doc.createElement("div");
  layer.style.position = "absolute"; layer.style.inset = "0"; layer.style.overflow = "hidden"; layer.style.pointerEvents = "none";
  credit.className = "map-attr"; credit.textContent = options.attribution;
  credit.style.pointerEvents = "none";
  type Entry = { img: HTMLImageElement; url: string; state: "queued" | "loading" | "done" | "failed"; retries: number; timedOut?: boolean; timer?: ReturnType<typeof setTimeout> };
  const entries = new Map<string, Entry>();
  const inFlight = new Set<Entry>();
  let view = first, dead = false, failed = false;
  let quietUntil = 0, timer: ReturnType<typeof setTimeout> | undefined;
  // Removing an image source does not reliably abort its network request. Detached images
  // keep their sources, handlers and slots until the browser reports completion.
  const discard = (e: Entry) => { clearTimeout(e.timer); e.img.remove(); if (!inFlight.has(e)) { e.img.onload = null; e.img.onerror = null; e.img.removeAttribute("src"); } };
  const clear = () => { for (const e of entries.values()) discard(e); entries.clear(); };
  const fail = (reason: string) => { failed = true; clearTimeout(timer); clear(); credit.remove(); context.onStatus?.(reason); };
  const allFailed = () => { if (entries.size && [...entries.values()].every(e => e.state === "failed")) fail([...entries.values()].some(e => e.timedOut) ? "Tile server did not answer" : "Tile images could not load"); };
  const image = (previous?: HTMLImageElement) => {
    const img = doc.createElement("img");
    img.alt = ""; img.draggable = false; img.referrerPolicy = referrerPolicy;
    if (options.crossOrigin) img.crossOrigin = options.crossOrigin;
    img.style.position = "absolute"; img.style.maxWidth = "none";
    img.style.width = "256px"; img.style.height = "256px"; img.style.transformOrigin = "0 0";
    if (previous) { img.style.left = previous.style.left; img.style.top = previous.style.top; img.style.transform = previous.style.transform; }
    return img;
  };
  const arm = (key: string, e: Entry) => { clearTimeout(e.timer); e.timer = setTimeout(() => expire(key, e), timeoutMs); };
  const expire = (key: string, e: Entry): void => {
    if (dead || failed || entries.get(key) !== e || e.state === "done" || e.state === "failed") return;
    const next: Entry = {img:image(e.img),url:e.url,state:e.retries ? "failed" : "queued",retries:1,timedOut:true};
    // A timed-out request still owns its physical slot. Its replacement may wait for
    // that slot, and has its own timeout so a fully hung queue can still fall back.
    discard(e); entries.set(key,next); layer.append(next.img);
    if (next.state === "failed") next.img.style.visibility = "hidden";
    else arm(key,next);
    pump(); allFailed();
  };
  const pump = () => {
    if (dead || failed) return;
    if (Date.now() < quietUntil) { clearTimeout(timer); timer = setTimeout(pump, quietUntil - Date.now()); return; }
    for (const [key, e] of entries) {
      if (inFlight.size >= MAX_LOADING) break;
      if (e.state !== "queued") continue;
      inFlight.add(e); e.state = "loading";
      const current = () => !dead && !failed && entries.get(key) === e;
      const settle = (ok: boolean) => {
        if (!inFlight.delete(e)) return;
        e.img.onload = null; e.img.onerror = null;
        if (!current()) { e.img.removeAttribute("src"); pump(); return; }
        clearTimeout(e.timer);
        if (ok) e.state = "done";
        else {
          e.img.removeAttribute("src"); e.state = e.retries++ < 1 ? "queued" : "failed";
          if (e.state === "failed") e.img.style.visibility = "hidden";
          else arm(key,e);
        }
        pump(); allFailed();
      };
      e.img.onload = () => settle(true); e.img.onerror = () => settle(false);
      e.img.src = e.url;
    }
  };
  const draw = () => {
    if (dead || failed) return;
    const r = el.getBoundingClientRect();
    // A hidden stage is measured again by resize before it loads anything.
    if (!r.width || !r.height) return;
    // Check the whole camera before making any request, including reused tiles.
    const wanted = tileLayout(view, r.width, r.height).map(t => {
      const raw = template.replace(/\{([zxy])\}/g, (_, k: "z" | "x" | "y") => String(t[k]));
      const url = applyUrlPolicy(raw, "image", context.urlPolicy);
      if (!url) throw new Error("Tile URL refused by image policy");
      return { ...t, url };
    });
    const keys = new Set(wanted.map(t => t.key));
    for (const [key, e] of entries) if (!keys.has(key) || wanted.find(t => t.key === key)!.url !== e.url) { discard(e); entries.delete(key); }
    for (const t of wanted) {
      let e = entries.get(t.key);
      if (!e) {
        const img = image();
        e = { img, url: t.url, state: "queued", retries: 0 }; entries.set(t.key, e); layer.append(img); arm(t.key,e);
      }
      e.img.style.left = `${t.left}px`; e.img.style.top = `${t.top}px`;
      e.img.style.transform = `scale(${t.size / 256})`;
    }
    clearTimeout(timer); quietUntil = Date.now() + 100;
    timer = setTimeout(pump, 100); allFailed();
  };
  // Initial refusal throws into the map part's ordinary still-picture note.
  try { draw(); } catch (e) { clear(); throw e; }
  el.append(layer); el.append(credit);
  const redraw = () => { try { draw(); } catch (e) { fail(e instanceof Error ? e.message : "Tile provider failed"); } };
  return { setView(v) { view = v; redraw(); }, resize: redraw, destroy() { dead = true; clearTimeout(timer); clear(); layer.remove(); credit.remove(); } };
}

/** Safe to import alongside react/strict. The document supplies its image URL policy. */
export function tileProvider(options: TileProviderOptions): MapHost {
  return { provider: "tiles", attribution: options.attribution, openBasemap: async (el, first, context = {}) => openTiles(options, el, first, context) };
}
