// The weather part's units: the converters (the page and the LLM view use the same ones), and the reader's choice, kept in
// one store that every weather part on a page shares. Pure: no React, no DOM; the storage is passed in, so a test can use
// its own and the server uses none.
export const SKIES = ["sun", "clear-night", "partly", "cloud", "fog", "drizzle", "rain", "storm", "snow", "sleet", "hail", "wind"] as const;
export type Sky = (typeof SKIES)[number];
export const SKY_WORDS: Record<Sky, string> = { sun: "sunny", "clear-night": "clear night", partly: "partly cloudy", cloud: "cloudy", fog: "fog", drizzle: "drizzle", rain: "rain", storm: "storm", snow: "snow", sleet: "sleet", hail: "hail", wind: "windy" };

export const TEMP_UNITS = ["c", "f"], WIND_UNITS = ["kmh", "mph", "ms", "kn"], RAIN_UNITS = ["mm", "in"], PRESSURE_UNITS = ["hpa", "inhg"];
export type Units = { temp: string; wind: string; rain: string; pressure: string };
export const DEFAULT_UNITS: Units = { temp: "c", wind: "kmh", rain: "mm", pressure: "hpa" };
export const UNIT_LISTS: Record<keyof Units, string[]> = { temp: TEMP_UNITS, wind: WIND_UNITS, rain: RAIN_UNITS, pressure: PRESSURE_UNITS };
export const UNIT_WORDS: Record<string, string> = { c: "°C", f: "°F", kmh: "km/h", mph: "mph", ms: "m/s", kn: "kn", mm: "mm", in: "in", hpa: "hPa", inhg: "inHg" };

// ---------- conversion ----------
const KMH_PER: Record<string, number> = { kmh: 1, mph: 1.609344, ms: 3.6, kn: 1.852 };
const INHG_PER_HPA = 0.02953;
export const convTemp = (v: number, from: string, to: string) => (from === to ? v : from === "c" ? (v * 9) / 5 + 32 : ((v - 32) * 5) / 9);
export const convWind = (v: number, from: string, to: string) => (from === to ? v : (v * KMH_PER[from]) / KMH_PER[to]);
export const convRain = (v: number, from: string, to: string) => (from === to ? v : from === "mm" ? v / 25.4 : v * 25.4);
export const convPressure = (v: number, from: string, to: string) => (from === to ? v : from === "hpa" ? v * INHG_PER_HPA : v / INHG_PER_HPA);
// a number as a forecast prints it; never "-0"
const round = (v: number, d: number) => { const k = 10 ** d, r = Math.round(v * k) / k; return r === 0 ? 0 : r; };
/** the number alone, in the unit `to` (whole degrees, whole km/h, mph and knots, one decimal for m/s, mm to a tenth, inches to a hundredth) */
export const numTemp = (v: number, from: string, to: string) => round(convTemp(v, from, to), 0);
export const numWind = (v: number, from: string, to: string) => round(convWind(v, from, to), to === "ms" ? 1 : 0);
export const numRain = (v: number, from: string, to: string) => round(convRain(v, from, to), to === "in" ? 2 : 1);
export const numPressure = (v: number, from: string, to: string) => round(convPressure(v, from, to), to === "inhg" ? 2 : 0);
export const showTemp = (v: number, from: string, to: string) => `${numTemp(v, from, to)} ${UNIT_WORDS[to]}`;
export const showWind = (v: number, from: string, to: string) => `${numWind(v, from, to)} ${UNIT_WORDS[to]}`;
export const showRain = (v: number, from: string, to: string) => `${numRain(v, from, to)} ${UNIT_WORDS[to]}`;
export const showPressure = (v: number, from: string, to: string) => `${numPressure(v, from, to)} ${UNIT_WORDS[to]}`;

// ---------- the reader's choice ----------
/** The key the choice is kept under in the browser's storage, shared by every weather part on the page (and the site). */
export const STORAGE_KEY = "dh-wx-units";
export type Choice = Partial<Units>;
/** keep only known keys with known values (a stored value is untrusted) */
export function cleanChoice(v: unknown): Choice {
  const out: Choice = {};
  if (!v || typeof v !== "object") return out;
  for (const k of Object.keys(UNIT_LISTS) as (keyof Units)[]) {
    const x = (v as Record<string, unknown>)[k];
    if (typeof x === "string" && UNIT_LISTS[k].includes(x)) out[k] = x;
  }
  return out;
}
/** the units shown: the fence's, then the host's default, then the reader's choice */
export const unitsShown = (fence: Units, host: Choice | null | undefined, choice: Choice): Units => ({ ...fence, ...cleanChoice(host), ...choice });

export type StoreStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void };
export interface UnitsStore {
  /** the reader's choice so far (the same object until it changes) */
  get(): Choice;
  /** set one unit; every weather part on the page re-draws; remembered in storage */
  choose(key: keyof Units, value: string): void;
  subscribe(listener: () => void): () => void;
  /** read the storage again (another tab changed it) */
  reload(): void;
}
/** A store over a storage (or none): reads once, writes inside try/catch (a blocked storage only means the choice resets on reload). */
export function createUnitsStore(storage: () => StoreStorage | null): UnitsStore {
  let choice: Choice = {}, loaded = false;
  const listeners = new Set<() => void>();
  const read = (): Choice => { try { const s = storage(); const raw = s?.getItem(STORAGE_KEY); return raw ? cleanChoice(JSON.parse(raw)) : {}; } catch { return {}; } };
  const same = (a: Choice, b: Choice) => (Object.keys(UNIT_LISTS) as (keyof Units)[]).every((k) => a[k] === b[k]);
  const load = () => { if (!loaded) { loaded = true; choice = read(); } };
  return {
    get() { load(); return choice; },
    choose(key, value) {
      if (!UNIT_LISTS[key]?.includes(value)) return;
      load();
      choice = { ...choice, [key]: value };
      // merge with what is stored now, so a choice made in another tab is not lost
      try { const s = storage(); s?.setItem(STORAGE_KEY, JSON.stringify({ ...read(), [key]: value })); } catch { /* no storage: the choice resets on reload */ }
      for (const l of [...listeners]) l();
    },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
    reload() { const next = read(); if (!same(next, choice)) { choice = next; for (const l of [...listeners]) l(); } },
  };
}
/** the browser's localStorage, or null (server, a blocked storage) */
export const browserStorage = (): StoreStorage | null => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };
/** the one store of this page */
export const pageStore: UnitsStore = createUnitsStore(browserStorage);
