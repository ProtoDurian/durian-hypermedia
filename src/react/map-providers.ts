// The map providers (the map contract): the host picks one; the source is the same on all.
//
// A provider here is only the **base map under our own drawing**: tiles, and nothing else. Pins, routes, areas, the
// popover, the zoom buttons and every gesture are ours (the map part), so the look is one on Leaflet, MapLibre and
// Google, and so is the way two fingers move the map. A provider is told the view (Web Mercator centre and a zoom in
// 256-pixel tiles) and draws that, with its own handlers all off.
//
// This file is the host's opt-in entry `react/map-providers`: it is loaded only when the host passes a provider, only
// when a map scrolls near. Leaflet 1.9.4 writes a string to `innerHTML` when it loads (its inline-SVG test), MapLibre
// makes a worker from a URL and Google's loader adds a script; none of these runs under strict Trusted Types, so the
// strict build never imports this file. Use react/map-tiles for image-only tiles under strict Trusted Types,
// or use the map without a provider for the still picture and the list of places.
import { unmerc, type Camera } from "../parts/map/model";
import type { MapHost, Basemap } from "../parts/map/host";
export type { MapHost, Basemap };

export type MapProviderOptions = {
  provider?: "leaflet" | "maplibre" | "google";
  /** leaflet: a tile URL template ({z}/{x}/{y}); OpenStreetMap's standard tiles by default for a host that names none */
  tiles?: string;
  attribution?: string;
  /** maplibre: a style URL or a style object (a raster style works); workerUrl: where this site serves maplibre-gl-worker.mjs */
  style?: unknown;
  workerUrl?: string;
  /** google: the host's own key; with none the part shows the still picture and says so */
  apiKey?: string;
  mapId?: string;
  /** routing: the host's own router; never a public demo server, never ours */
  routing?: { provider: "osrm"; url: string } | { provider: "google" };
};

export const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

export async function openBasemap(host: MapProviderOptions, el: HTMLElement, first: Camera): Promise<Basemap> {
  if (host.provider === "maplibre") return openMapLibre(host, el, first);
  if (host.provider === "google") return openGoogle(host, el, first);
  return openLeaflet(host, el, first);
}

async function openLeaflet(host: MapProviderOptions, el: HTMLElement, first: Camera): Promise<Basemap> {
  const L: any = (await import("leaflet")).default ?? (await import("leaflet"));
  const c = unmerc(first.cx, first.cy);
  const map = L.map(el, {
    zoomControl: false, attributionControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false,
    boxZoom: false, keyboard: false, tap: false, zoomSnap: 0, zoomAnimation: false, markerZoomAnimation: false, fadeAnimation: false, inertia: false,
    center: [c.lat, c.lng], zoom: first.zoom,
  });
  L.tileLayer(host.tiles ?? OSM_TILES, { maxZoom: 19, tileSize: 256, crossOrigin: "anonymous", referrerPolicy: "origin", keepBuffer: 1 }).addTo(map);
  return {
    setView(v) { const p = unmerc(v.cx, v.cy); map.setView([p.lat, p.lng], v.zoom, { animate: false }); },
    resize() { map.invalidateSize({ animate: false }); },
    destroy() { try { map.remove(); } catch {} },
  };
}

async function openMapLibre(host: MapProviderOptions, el: HTMLElement, first: Camera): Promise<Basemap> {
  const ml: any = await import("maplibre-gl");
  const lib = ml.default ?? ml;
  if (host.workerUrl) lib.setWorkerUrl(host.workerUrl);
  const c = unmerc(first.cx, first.cy);
  // MapLibre counts zoom in 512-pixel tiles: one less than ours at the same scale
  const map = new lib.Map({ container: el, style: host.style, center: [c.lng, c.lat], zoom: first.zoom - 1, interactive: false, attributionControl: false, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true } });
  return {
    setView(v) { const p = unmerc(v.cx, v.cy); map.jumpTo({ center: [p.lng, p.lat], zoom: v.zoom - 1 }); },
    resize() { map.resize(); },
    destroy() { try { map.remove(); } catch {} },
  };
}

async function openGoogle(host: MapProviderOptions, el: HTMLElement, first: Camera): Promise<Basemap> {
  if (!host.apiKey) throw new Error("no-key");
  const loader: any = await import("@googlemaps/js-api-loader");
  loader.setOptions({ key: host.apiKey, v: "weekly" });
  const { Map: GMap } = await loader.importLibrary("maps");
  const c = unmerc(first.cx, first.cy);
  const map = new GMap(el, { center: { lat: c.lat, lng: c.lng }, zoom: first.zoom, disableDefaultUI: true, gestureHandling: "none", keyboardShortcuts: false, clickableIcons: false, mapId: host.mapId, colorScheme: "FOLLOW_SYSTEM" });
  return {
    setView(v) { const p = unmerc(v.cx, v.cy); map.moveCamera({ center: { lat: p.lat, lng: p.lng }, zoom: v.zoom }); },
    resize() {},
    destroy() { map.unbindAll?.(); el.replaceChildren(); },
  };
}

/** a route between its stops through the host's own router: the points to draw, or null (the part keeps the stops) */
export async function routeVia(host: MapProviderOptions, way: string, stops: { lat: number; lng: number }[]): Promise<{ lat: number; lng: number }[] | null> {
  const r = host.routing;
  if (!r) return null;
  try {
    if (r.provider === "osrm") {
      const profile = way === "walk" ? "foot" : way === "bike" ? "bike" : way === "drive" ? "car" : null;
      if (!profile) return null;
      const url = `${r.url.replace(/\/$/, "")}/route/v1/${profile}/${stops.map((s) => `${s.lng},${s.lat}`).join(";")}?overview=full&geometries=geojson`;
      const res = await fetch(url,{signal:AbortSignal.timeout(10000)});
      if (!res.ok) return null;
      if(Number(res.headers.get("content-length"))>1_000_000){await res.body?.cancel();return null;}
      const reader=res.body?.getReader();if(!reader)return null;
      let size=0;const chunks:Uint8Array[]=[];
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1_000_000){await reader.cancel();return null;}chunks.push(value);}}finally{reader.releaseLock();}
      const data=new Uint8Array(size);let pos=0;for(const chunk of chunks){data.set(chunk,pos);pos+=chunk.byteLength;}
      const j = JSON.parse(new TextDecoder().decode(data));
      const co: [number, number][] | undefined = j?.routes?.[0]?.geometry?.coordinates;
      return co && co.length>1 && co.length<=2000 && co.every(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Math.abs(p[0])<=180&&Number.isFinite(p[1])&&Math.abs(p[1])<=90) ? co.map(([lng,lat])=>({lat,lng})) : null;
    }
    if (r.provider === "google" && host.provider === "google" && host.apiKey) {
      const loader: any = await import("@googlemaps/js-api-loader");
      const { DirectionsService } = await loader.importLibrary("routes");
      const mode = way === "walk" ? "WALKING" : way === "bike" ? "BICYCLING" : way === "drive" ? "DRIVING" : way === "transit" ? "TRANSIT" : null;
      if (!mode) return null;
      const res = await new DirectionsService().route({ origin: stops[0], destination: stops[stops.length - 1], waypoints: stops.slice(1, -1).map((s) => ({ location: s })), travelMode: mode });
      const path: any[] = res?.routes?.[0]?.overview_path ?? [];
      return path.length > 1 && path.length <= 2000 ? path.map((p) => ({ lat: p.lat(), lng: p.lng() })) : null;
    }
  } catch { /* a failed route keeps the straight lines */ }
  return null;
}

/** Opt in from host code. Import only this entry when a third-party base map is wanted. */
export function mapProvider(options: MapProviderOptions): MapHost {
  return {provider:options.provider??"leaflet",attribution:options.attribution??(options.provider==="google"?"Google Maps":OSM_ATTRIBUTION),openBasemap:(el,first)=>openBasemap(options,el,first),route:options.routing?(way,stops)=>routeVia(options,way,stops):undefined};
}
