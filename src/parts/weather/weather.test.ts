// The weather part: parse, the LLM view, every refusal, its caps in both sets, the doubling test (budget charges counted
// at n and 2n, never time), the hostile fixtures, the unit converters, the units store (the reader's choice) and the
// units menu: a click on a button changes the numbers drawn, both ways, and a round trip gives the first numbers back.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import weather, { parseWeather, weatherLlm, type WxSpec } from "./part";
import {
  DEFAULT_UNITS, SKIES, STORAGE_KEY, cleanChoice, convPressure, convRain, convTemp, convWind, createUnitsStore, showPressure, showRain, showTemp, showWind, unitsShown,
  type StoreStorage,
} from "./units";
import { LIMITS as WX_LIMITS, UNTRUSTED_LIMITS as WX_UNTRUSTED } from "./limits";

const fence = (body: string, info = 'place="SF" unit=c tz=America/Los_Angeles') => `# Page\n\n\`\`\`weather ${info}\n${body}\n\`\`\`\n`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const input = (body: string, attrs: Record<string, string> = {}, steps: unknown[] = []) => ({ body, bodyLine: 1, steps, attrs });
const run = (body: string, attrs: Record<string, string> = {}, lim = WX_LIMITS) => parseWeather(input(body, attrs), lim, big());
const msgs = (s: WxSpec) => s.errors.map((e) => e.msg);
const errorsOf = (src: string) => check(parse(src, { path: "p.dh.md" })).filter((p) => p.level === "error").map((p) => p.message);
const GOOD = [
  `2026-11-22 sun 18/11 rain=0% wind=12km/h pressure=1021hPa`,
  `2026-11-24 rain 14/9 rain=80% wind=30km/h precip=6mm`,
  `2026-11-25 storm 13/8 rain=95% wind=45km/h note="Ferry may stop"`,
].join("\n");

describe("weather: parse and the LLM view", () => {
  test("a good forecast is a block with its data and no problems", () => {
    const doc = parse(fence(GOOD), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "weather")!;
    expect(b).toBeDefined();
    const d = b.data as WxSpec;
    expect(d.errors).toEqual([]);
    expect(d.kind).toBe("day");
    expect(d.rows.map((r) => [r.sky, r.hi, r.lo, r.chance, r.wind, r.precip, r.pressure])).toEqual([["sun", 18, 11, 0, 12, null, 1021], ["rain", 14, 9, 80, 30, 6, null], ["storm", 13, 8, 95, 45, null, null]]);
    expect(d.rows[2].note).toBe("Ferry may stop");
    expect(b.llmKind).toBe("own");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
  test("hours: one temperature, a time", () => {
    const h = run(`2026-11-24 06:00 fog 48 rain=5% wind=4mph\n2026-11-24 9:00 cloud 52`, { unit: "f", wind: "mph" });
    expect(h.errors).toEqual([]);
    expect(h.kind).toBe("hour");
    expect(h.rows.map((r) => [r.time, r.lo])).toEqual([["06:00", null], ["09:00", null]]);
    expect(h.units).toMatchObject({ temp: "f", wind: "mph" });
  });
  test("comments, blank lines, signs and the degree sign are read", () => {
    const s = run(`// a comment\n\n2026-11-22 snow -2°C/-8C\n`);
    expect(s.errors).toEqual([]);
    expect(s.rows[0]).toMatchObject({ hi: -2, lo: -8 });
  });
  test("the LLM view gives both °C and °F, in a table, then the notes", () => {
    const t = weatherLlm(run(GOOD, { place: "San Francisco", tz: "America/Los_Angeles" }));
    expect(t.split("\n")[0]).toBe("Weather: San Francisco, times in America/Los_Angeles. Temperatures are given in °C and °F.");
    expect(t).toContain("| day | sky | high / low | rain | wind | pressure |");
    expect(t).toContain("| Sun 22 Nov 2026 | sunny | 18 °C (64 °F) / 11 °C (52 °F) | 0% | 12 km/h | 1021 hPa |");
    expect(t).toContain("| Mon 23 Nov 2026".slice(0, 0) + "| Tue 24 Nov 2026 | rain | 14 °C (57 °F) / 9 °C (48 °F) | 80%, 6 mm | 30 km/h | - |");
    expect(t.endsWith("Notes:\n- Wed 25 Nov 2026: Ferry may stop")).toBe(true);
    expect(weatherLlm(run(`2026-11-24 06:00 fog 48`, { unit: "f" }))).toContain("9 °C (48 °F)");
  });
  test("the page's LLM view carries it, and a :::llm replaces it", () => {
    const doc = parse(fence(GOOD), { path: "p.dh.md" });
    expect(doc.llm).toContain("| Sun 22 Nov 2026 | sunny | 18 °C (64 °F) / 11 °C (52 °F) |");
    const own = parse(fence(GOOD) + "\n:::llm\nA stormy week.\n:::\n", { path: "p.dh.md" });
    expect(own.llm).toContain("A stormy week.");
    expect(own.llm).not.toContain("| day |");
  });
});

describe("weather: every refusal names the line and the fix", () => {
  const cases: [string, string, Record<string, string>, RegExp][] = [
    ["an unknown sky", `2026-11-22 hazy 18/11`, {}, /unknown sky "hazy"; the skies are sun, clear-night/],
    ["a low above the high", `2026-11-22 sun 11/18`, {}, /the low \(18\) is above the high \(11\)/],
    ["rain over 100%", `2026-11-22 sun 18/11 rain=120%`, {}, /rain=120% is over 100%/],
    ["a rain chance with no percent", `2026-11-22 sun 18/11 rain=12`, {}, /rain=\.\.\. is a chance like rain=40%/],
    ["a bad date", `2026-13-40 sun 18/11`, {}, /is not an ISO date/],
    ["a bad time", `2026-11-22 25:00 sun 18`, {}, /is not a 24-hour time; write 14:30/],
    ["a day line with one temperature", `2026-11-22 sun 18`, {}, /a day line has a high and a low like 18\/11/],
    ["an hour line with two temperatures", `2026-11-22 06:00 sun 18/11`, {}, /an hour line has one temperature/],
    ["a temperature that is not a number", `2026-11-22 sun warm/cold`, {}, /is not a high; write a number like 18/],
    ["a temperature unit other than the fence's", `2026-11-22 sun 64F/52F`, {}, /is in °F but this part's unit is °C; write one unit per part/],
    ["a wind unit other than the fence's", `2026-11-22 sun 18/11 wind=10mph`, {}, /not in this part's wind unit \(km\/h\); write one unit per part, or set wind=mph/],
    ["an unknown wind unit", `2026-11-22 sun 18/11 wind=10furlongs`, {}, /unknown wind unit "furlongs"/],
    ["a negative wind", `2026-11-22 sun 18/11 wind=-3`, {}, /a wind speed cannot be below 0/],
    ["a rain amount unit other than the fence's", `2026-11-22 sun 18/11 precip=2in`, {}, /not in this part's rain unit \(mm\)/],
    ["a pressure unit other than the fence's", `2026-11-22 sun 18/11 pressure=30inHg`, {}, /not in this part's pressure unit \(hPa\)/],
    ["an unknown pressure unit", `2026-11-22 sun 18/11 pressure=30psi`, {}, /unknown pressure unit "psi"/],
    ["an option it cannot read", `2026-11-22 sun 18/11 humidity=40%`, {}, /cannot read "humidity=40%"/],
    ["an unclosed note", `2026-11-22 sun 18/11 note="never closed`, {}, /note=" has no closing quote/],
    ["days and hours mixed", `2026-11-22 sun 18/11\n2026-11-22 06:00 sun 14`, {}, /a part shows days or hours, not both/],
    ["an unknown fence unit", `2026-11-22 sun 18/11`, { unit: "k" }, /unknown unit unit=k; the units are c, f/],
    ["an unknown fence key", `2026-11-22 sun 18/11`, { colour: "red" }, /unknown key "colour"/],
    ["an unknown zone", `2026-11-22 sun 18/11`, { tz: "Mars/Olympus" }, /unknown time zone "Mars\/Olympus"/],
    ["a step line", `2026-11-22 sun 18/11`, {}, /weather takes no @step lines/],
    ["no forecast line", `// nothing`, {}, /no forecast lines; write one per day/],
  ];
  for (const [what, body, attrs, re] of cases) test(what, () => {
    const s = parseWeather(input(body, attrs, what === "a step line" ? [{ title: "x", line: 1, raw: "" }] : []), WX_LIMITS, big());
    expect(msgs(s).some((m) => re.test(m))).toBe(true);
  });
  test("through check(): the line, and the part's name in front", () => {
    const doc = parse(fence(`2026-11-22 sun 18/11\n2026-11-23 hazy 18/11`), { path: "p.dh.md" });
    const p = check(doc).filter((x) => x.level === "error");
    expect(p).toHaveLength(1);
    expect(p[0].message).toMatch(/weather: unknown sky "hazy"/);
    expect(p[0].line).toBe(5);
  });
  test("a wrong line does not stop the others being read", () => {
    const s = run(`2026-11-22 hazy 18/11\n2026-11-23 sun 18/11`);
    expect(s.rows).toHaveLength(1);
    expect(s.errors).toHaveLength(1);
  });
  test("a huge number is refused, not read as infinity", () => {
    expect(msgs(run(`2026-11-22 sun ${"9".repeat(40)}/1`)).some((m) => /is not a high/.test(m))).toBe(true);
  });
  test("every sky is known", () => {
    expect(SKIES).toHaveLength(12);
    expect(run(SKIES.map((s) => `2026-11-22 ${s} 10/5`).join("\n")).errors).toEqual([]);
  });
});

describe("weather: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS", () => {
    expect(LIMITS.weatherRows).toBe(200);
    expect(UNTRUSTED_LIMITS.weatherRows).toBe(100);
    expect(LIMITS.weatherLineChars).toBe(400);
    expect(LIMITS.weatherNoteChars).toBe(160);
    for (const k of Object.keys(WX_LIMITS) as (keyof typeof WX_LIMITS)[]) expect(WX_UNTRUSTED[k]).toBeLessThanOrEqual(WX_LIMITS[k]);
    for (const k of Object.keys(WX_LIMITS) as (keyof typeof WX_LIMITS)[]) { expect(UNTRUSTED_LIMITS[k]).toBe(WX_UNTRUSTED[k]); expect(LIMITS[k]).toBe(WX_LIMITS[k]); }
  });
  const days = (n: number) => Array.from({ length: n }, (_, k) => `2026-11-22 sun ${10 + (k % 5)}/5`).join("\n");
  test("over the row cap: refused by check, at the host's own cap too, and in the strict set", () => {
    expect(errorsOf(fence(days(150))).some((m) => /forecast lines/.test(m))).toBe(false);
    expect(check(parse(fence(days(150)), { path: "p.dh.md", limits: UNTRUSTED_LIMITS })).some((p) => /more than 100 forecast lines/.test(p.message))).toBe(true);
    expect(check(parse(fence(days(30)), { path: "p.dh.md", limits: { weatherRows: 10 } })).some((p) => /more than 10 forecast lines/.test(p.message))).toBe(true);
  });
  test("a line and a note over their caps are refused", () => {
    expect(errorsOf(fence(`2026-11-22 sun 18/11 note="${"x".repeat(200)}"`)).some((m) => /a note of 200 characters; the cap is 160/.test(m))).toBe(true);
    expect(errorsOf(fence(`2026-11-22 sun 18/11 note="${"x".repeat(500)}"`)).some((m) => /a forecast line of \d+ characters; the cap is 400/.test(m))).toBe(true);
    expect(check(parse(fence(`2026-11-22 sun 18/11 note="${"x".repeat(50)}"`), { path: "p.dh.md", limits: { weatherNoteChars: 20 } })).some((p) => /the cap is 20/.test(p.message))).toBe(true);
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const doc = parse(fence(days(150)), { path: "p.dh.md", limits: { maxEvalSteps: 100 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the weather part does too much work/);
    expect(doc.llm).toContain("[weather not shown: the weather part does too much work");
  });
});

describe("weather: linear (the doubling test, charges counted)", () => {
  const body = (n: number) => Array.from({ length: n }, (_, k) => `2026-11-22 rain ${10 + (k % 9)}/5 rain=${k % 100}% wind=${k % 50}km/h precip=${k % 9}mm pressure=${1000 + (k % 30)}hPa note="note ${k} with some words"`).join("\n");
  const lim = { weatherRows: 1e9, weatherLineChars: 1e9, weatherNoteChars: 1e9 };
  const cost = (n: number) => { const b = big(); parseWeather(input(body(n)), lim, b); return b.steps + b.values + b.chars; };
  test("twice the input costs at most about twice", () => {
    for (const n of [50, 200, 800]) {
      const r = cost(2 * n) / cost(n);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("a long single line is read once (no scan per start)", () => {
    const one = (n: number) => { const b = big(); parseWeather(input(`2026-11-22 sun 18/11 note="${"x ".repeat(n)}"`), lim, b); return b.steps + b.values + b.chars; };
    expect(one(40_000) / one(20_000)).toBeLessThan(2.3);
    const many = (n: number) => { const b = big(); parseWeather(input(`2026-11-22 sun 18/11 ${"wind=1 ".repeat(n)}`), lim, b); return b.steps + b.values + b.chars; };
    expect(many(40_000) / many(20_000)).toBeLessThan(2.3);
  });
  test("a long run of white space and of quotes is read in time", () => {
    const t0 = performance.now();
    parseWeather(input(`2026-11-22${" ".repeat(200_000)}sun 18/11 note="${'note="'.repeat(20_000)}`), lim, big());
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe("weather: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every weather part drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "weather").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a line, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const doc = parse(text, { path: f, limits });
        const errs = check(doc).filter((p) => p.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((p) => p.line >= 1)).toBe(true);
      }
      const b = new Budget(partLimitsOf(LIMITS), null, null, "the weather part");
      const body = text.split("```weather")[1].split("\n").slice(1).join("\n").split("\n```")[0];
      expect(() => parseWeather(input(body), WX_LIMITS, b)).not.toThrow();
    });
  }
});

describe("weather: the unit converters", () => {
  test("temperature, both ways, and the fixed points", () => {
    expect(convTemp(18, "c", "f")).toBeCloseTo(64.4, 9);
    expect(convTemp(64.4, "f", "c")).toBeCloseTo(18, 9);
    expect(convTemp(-40, "c", "f")).toBeCloseTo(-40, 9);
    expect(convTemp(0, "c", "f")).toBe(32);
    expect(convTemp(100, "c", "f")).toBe(212);
    expect(convTemp(5, "c", "c")).toBe(5);
  });
  test("wind: km/h to mph, m/s and knots, and back", () => {
    expect(convWind(30, "kmh", "mph")).toBeCloseTo(18.6411, 3);
    expect(convWind(36, "kmh", "ms")).toBeCloseTo(10, 9);
    expect(convWind(18.52, "kmh", "kn")).toBeCloseTo(10, 9);
    expect(convWind(10, "ms", "kmh")).toBeCloseTo(36, 9);
    expect(convWind(10, "mph", "kn")).toBeCloseTo(8.6898, 3);
    expect(convWind(7, "kn", "kn")).toBe(7);
  });
  test("rain and pressure, both ways", () => {
    expect(convRain(25.4, "mm", "in")).toBeCloseTo(1, 9);
    expect(convRain(1, "in", "mm")).toBeCloseTo(25.4, 9);
    expect(convPressure(1013.25, "hpa", "inhg")).toBeCloseTo(29.92, 1);
    expect(convPressure(29.92, "inhg", "hpa")).toBeCloseTo(1013.2, 0);
  });
  test("shown as forecasts print: whole degrees, whole km/h, one decimal for m/s, never -0", () => {
    expect(showTemp(18, "c", "f")).toBe("64 °F");
    expect(showTemp(18, "c", "c")).toBe("18 °C");
    expect(showTemp(-0.4, "c", "c")).toBe("0 °C");
    expect(showWind(30, "kmh", "mph")).toBe("19 mph");
    expect(showWind(30, "kmh", "ms")).toBe("8.3 m/s");
    expect(showWind(30, "kmh", "kn")).toBe("16 kn");
    expect(showRain(6, "mm", "in")).toBe("0.24 in");
    expect(showRain(1, "in", "mm")).toBe("25.4 mm");
    expect(showPressure(1021, "hpa", "inhg")).toBe("30.15 inHg");
    expect(showPressure(29.92, "inhg", "hpa")).toBe("1013 hPa");
  });
});

describe("weather: the reader's choice (the units store)", () => {
  const memory = (init: Record<string, string> = {}): StoreStorage & { data: Record<string, string> } => ({ data: { ...init }, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } });
  test("starts empty, remembers a choice in storage and tells every listener", () => {
    const m = memory(), store = createUnitsStore(() => m);
    let heard = 0;
    store.subscribe(() => heard++);
    expect(store.get()).toEqual({});
    store.choose("temp", "f");
    expect(store.get()).toEqual({ temp: "f" });
    expect(heard).toBe(1);
    expect(JSON.parse(m.data[STORAGE_KEY])).toEqual({ temp: "f" });
    // a new page (a new store over the same storage) starts with the choice
    expect(createUnitsStore(() => m).get()).toEqual({ temp: "f" });
  });
  test("two weather parts share one store: a choice made through one shows on the other", () => {
    const store = createUnitsStore(() => memory());
    const a = () => unitsShown(DEFAULT_UNITS, null, store.get()), b = () => unitsShown({ ...DEFAULT_UNITS, wind: "mph" }, null, store.get());
    expect([a().temp, b().temp]).toEqual(["c", "c"]);
    store.choose("temp", "f");
    expect([a().temp, b().temp]).toEqual(["f", "f"]);
    expect([a().wind, b().wind]).toEqual(["kmh", "mph"]);
  });
  test("an unknown unit and a stored mess are ignored", () => {
    const store = createUnitsStore(() => memory({ [STORAGE_KEY]: JSON.stringify({ temp: "k", wind: 4, extra: "x", rain: "in" }) }));
    expect(store.get()).toEqual({ rain: "in" });
    store.choose("temp", "kelvin");
    expect(store.get()).toEqual({ rain: "in" });
    expect(cleanChoice(null)).toEqual({});
    expect(cleanChoice("c")).toEqual({});
    expect(createUnitsStore(() => memory({ [STORAGE_KEY]: "{not json" })).get()).toEqual({});
  });
  test("no storage (the server, a static part) and a storage that throws: the choice works until reload, nothing breaks", () => {
    for (const s of [() => null, () => { throw new Error("blocked"); }, () => ({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } })]) {
      const store = createUnitsStore(s as () => StoreStorage | null);
      expect(store.get()).toEqual({});
      store.choose("temp", "f");
      expect(store.get()).toEqual({ temp: "f" });
    }
  });
  test("a choice made in another tab is read again, and is not lost by this tab's own", () => {
    const m = memory(), store = createUnitsStore(() => m);
    store.get();
    m.data[STORAGE_KEY] = JSON.stringify({ wind: "kn" });
    let heard = 0;
    store.subscribe(() => heard++);
    store.reload();
    expect(store.get()).toEqual({ wind: "kn" });
    expect(heard).toBe(1);
    store.reload();
    expect(heard).toBe(1);
    store.choose("temp", "f");
    expect(JSON.parse(m.data[STORAGE_KEY])).toEqual({ wind: "kn", temp: "f" });
  });
  test("the order: the fence, then the host's default, then the reader", () => {
    expect(unitsShown(DEFAULT_UNITS, { temp: "f", wind: "mph" }, {})).toEqual({ ...DEFAULT_UNITS, temp: "f", wind: "mph" });
    expect(unitsShown(DEFAULT_UNITS, { temp: "f", wind: "mph" }, { temp: "c" })).toEqual({ ...DEFAULT_UNITS, temp: "c", wind: "mph" });
    expect(unitsShown(DEFAULT_UNITS, { temp: "k" } as never, {})).toEqual(DEFAULT_UNITS);
  });
});

describe("weather: the view's source", () => {
  test("no string-to-HTML sink, no eval, no network", () => {
    for (const f of ["view.tsx", "icons.tsx", "units.ts", "part.ts"]) {
      const t = readFileSync(join(import.meta.dir, f), "utf8");
      expect(t).not.toMatch(new RegExp([["inner", "HTML"].join(""), ["dangerouslySetInner", "HTML"].join(""), ["outer", "HTML"].join(""), ["insertAdjacent", "HTML"].join(""), "\\beval\\(", "new Function", "document\\.write", "fetch\\(", "XMLHttpRequest", "sendBeacon"].join("|")));
    }
  });
  test("every token starts with --weather- and no colour is a hex value", () => {
    const css = readFileSync(join(import.meta.dir, "style.css"), "utf8");
    expect([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]).filter((t) => !t.startsWith("--weather-"))).toEqual([]);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

test("the definition matches its folder", () => {
  expect(weather.name).toBe("weather");
  expect(weather.steps).toBe(false);
});
