import {describe,expect,test} from "bun:test";
import {Budget,BudgetError,pageBudget} from "../../core/budget";
import {parse,check,LIMITS} from "../../index";
const attrs = (s: string) => Object.fromEntries([...s.matchAll(/(\w+)=("([^"]*)"|\S+)/g)].map((m) => [m[1], m[3] ?? m[2]]));
// a fenced part as the parser would hand it over: the info string's attributes, the body, the steps
function part(body: string, info = "") {
  const lines = body.split("\n"), head: string[] = [], steps: { title: string; raw: string; line: number }[] = [];
  let cur: { title: string; raw: string[]; line: number } | null = null;
  lines.forEach((l, i) => {
    const m = l.match(/^@step\s*(.*)$/);
    if (m) { if (cur) steps.push({ title: cur.title, raw: cur.raw.join("\n"), line: cur.line }); cur = { title: m[1], raw: [], line: i + 2 }; } else (cur ? cur.raw : head).push(l);
  });
  if (cur) steps.push({ title: (cur as any).title, raw: (cur as any).raw.join("\n"), line: (cur as any).line });
  return { line:1, head: head.join("\n"), body, bodyLine: 2, steps, attrs: attrs(info) };
}
const msgs = (e: { msg: string }[]) => e.map((x) => x.msg).join("\n");
import {readFileSync} from "node:fs";
import {gzipSync} from "node:zlib";
import {MAP_CAPS,allPoints,fillPoints,mapLlm,parseMap,arc,boxOf,cameraAt,fitBox,haversine,kmWords,merc,routeLength,scaleBar,toPx,unmerc,hasWrittenPath} from "./model";
import {CODE_COUNT,GEO_LIMITS,US_STATES,WORLD,binEdges,decodeRegions,fmtNum,inRegion,mixCss,mixOf,rangeOf,regionBox,regionPoint,suggestRegions,type Scale} from "./geo";
import {US_DATA,US_Q} from "./geo-us";
import {WORLD_DATA,WORLD_Q} from "./geo-world";
import {GLOBE_K,clampLat,globeR,liftedArc,project,unproject,wrapLng} from "./globe";
describe("map: parse", () => {
  const body = [
    `place office "Office" 37.7897, -122.3972 [c1] note="Front door"`,
    `place cafe "Blue Cafe" 37.7880, -122.4010 [c3]`,
    `route walk "Walk" by=walk [acc]: office -> 37.7889, -122.3987 -> cafe`,
    `area zone "Zone" [warn]: 37.791, -122.401; 37.791, -122.394; 37.786, -122.394`,
    `view 37.788, -122.398 zoom=15`,
    `@step One`, `focus office`, `@step Two`, `show walk`, `show zone`,
  ].join("\n");
  const s = parseMap(part(body, `title="T"`));
  test("places, routes, areas, view, steps", () => {
    expect(s.errors).toEqual([]);
    expect(s.places.map((p) => [p.id, p.lat, p.lng, p.colour, p.note])).toEqual([["office", 37.7897, -122.3972, "c1", "Front door"], ["cafe", 37.788, -122.401, "c3", ""]]);
    expect(s.routes[0].stops.map((x) => x.place ?? `${x.lat},${x.lng}`)).toEqual(["office", "37.7889,-122.3987", "cafe"]);
    expect(hasWrittenPath(s.routes[0])).toBe(true);
    expect(s.areas[0].corners.length).toBe(3);
    expect(s.view).toEqual({ center: { lat: 37.788, lng: -122.398 }, zoom: 15 });
    expect(s.steps.map((x) => [x.focus, x.show])).toEqual([["office", []], [null, ["walk", "zone"]]]);
  });
  test("a route or area in the head is drawn from the step that shows it", () => { expect(s.routes[0].shownAt).toBe(1); expect(s.areas[0].shownAt).toBe(1); });
  test("with no steps everything is drawn at once", () => { const t = parseMap(part(body.split("@step")[0])); expect(t.routes[0].shownAt).toBe(0); });
  test("a line under a step is drawn from that step", () => {
    const t = parseMap(part(`place a "A" 1, 1\nplace b "B" 2, 2\n@step s1\nfocus a\n@step s2\nroute r "R" by=walk: a -> b`));
    expect(t.errors).toEqual([]); expect(t.routes[0].shownAt).toBe(1);
  });
  test("distances are straight-line (haversine)", () => {
    expect(Math.round(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) / 100) / 10).toBe(111.2);
    expect(Math.round(haversine({ lat: 37.6213, lng: -122.379 }, { lat: 40.6413, lng: -73.7781 }) / 1000)).toBe(4152);
    expect(kmWords(380)).toBe("380 m"); expect(kmWords(1100)).toBe("1.1 km"); expect(kmWords(4152000)).toBe("4152 km");
    expect(routeLength(s.routes[0])).toBeGreaterThan(300);
  });
  test("Mercator round trip, camera and scale bar", () => {
    const p = { lat: 37.7897, lng: -122.3972 }, m = merc(p), q = unmerc(m.x, m.y);
    expect(q.lat).toBeCloseTo(p.lat, 6); expect(q.lng).toBeCloseTo(p.lng, 6);
    const c = fitBox(boxOf([p, { lat: 37.785, lng: -122.4025 }]), 640, 420);
    const px = toPx(p, c, 640, 420);
    expect(px.x).toBeGreaterThan(0); expect(px.x).toBeLessThan(640); expect(px.y).toBeGreaterThan(0); expect(px.y).toBeLessThan(420);
    const mid = toPx(unmerc(c.cx, c.cy), c, 640, 420); expect(mid.x).toBeCloseTo(320, 3); expect(mid.y).toBeCloseTo(210, 3);
    const bar = scaleBar(cameraAt(p, 16), p.lat);
    expect([100, 200, 50].includes(bar.metres)).toBe(true);
    expect(bar.px).toBeGreaterThan(30); expect(bar.px).toBeLessThan(140);
  });
  test("a flight is a great-circle arc: it bows north of the straight chord", () => {
    const a = arc({ lat: 37.6, lng: -122.4 }, { lat: 40.6, lng: -73.8 }, 16);
    expect(a.length).toBe(17); expect(a[0].lat).toBeCloseTo(37.6, 4); expect(a[16].lng).toBeCloseTo(-73.8, 4);
    expect(Math.max(...a.map((x) => x.lat))).toBeGreaterThan(41);
  });
});

describe("map: every refusal names the fix", () => {
  const bad = (line: string, ...more: string[]) => msgs(parseMap(part([`place a "A" 1, 1`, `place b "B" 2, 2`, line, ...more].join("\n"))).errors);
  test("latitude outside -90 to 90", () => expect(bad(`place c "C" 91, 0`)).toContain("latitude 91 is outside -90 to 90"));
  test("longitude outside -180 to 180", () => expect(bad(`place c "C" 0, 181`)).toContain("longitude 181 is outside -180 to 180"));
  test("a route stop that is not a place or a pair", () => expect(bad(`route r "R" by=walk: a -> nowhere`)).toContain(`stop "nowhere" is not a place id or a "lat, lng" pair`));
  test("fewer than 2 stops", () => expect(bad(`route r "R" by=walk: a`)).toContain("needs at least 2 stops"));
  test("an area with fewer than 3 corners", () => expect(bad(`area z "Z": 1, 1; 2, 2`)).toContain("an area needs at least 3"));
  test("an unknown way lists the ways", () => expect(bad(`route r "R" by=teleport: a -> b`)).toContain("ways are walk, bike, drive, transit, straight, flight"));
  test("a zoom outside 0 to 18", () => expect(bad(`view 1, 1 zoom=19`)).toContain("zoom 19 is outside 0 to 18"));
  test("a hex colour is refused with the words", () => { const m = bad(`place c "C" 3, 3 [#ff0000]`); expect(m).toContain("never a hex value"); expect(m).toContain("c1, c2"); });
  test("an id used twice", () => expect(bad(`place a "Again" 5, 5`)).toContain(`place id "a" is used twice`));
  test("unknown key on the fence lists the known ones", () => expect(msgs(parseMap(part(`place a "A" 1, 1`, `zoom=3`)).errors)).toContain(`unknown key "zoom" (keys: #id, title, view, scale, unit, diverge, min, max, steps, spin, none)`));
  test("focus outside a step, and focus of an unknown id", () => {
    expect(bad(`focus a`)).toContain("belongs under an @step");
    expect(msgs(parseMap(part(`place a "A" 1, 1\n@step s\nfocus zz\n@step t\nshow a`)).errors)).toContain("focus zz is not a place, route, area or region code");
  });
  test("an empty map", () => expect(msgs(parseMap(part(``)).errors)).toContain("map is empty"));
  test("caps: 100 places, 50 shapes, 2,000 points", () => {
    const places = Array.from({ length: MAP_CAPS.places + 1 }, (_, i) => `place p${i} "P" ${i % 80}, ${i % 100}`).join("\n");
    expect(msgs(parseMap(part(places)).errors)).toContain("the cap is 100");
    const shapes = `place a "A" 1, 1\nplace b "B" 2, 2\n` + Array.from({ length: 51 }, (_, i) => `route r${i} "R" by=straight: a -> b`).join("\n");
    expect(msgs(parseMap(part(shapes)).errors)).toContain("the cap is 50");
    const pts = `place a "A" 1, 1\n` + Array.from({ length: 3 }, (_, i) => `area z${i} "Z": ${Array.from({ length: 700 }, (_, k) => `${k % 80}, ${k % 90}`).join("; ")}`).join("\n");
    expect(msgs(parseMap(part(pts)).errors)).toContain("the cap is 2000");
  });
  test("the work is charged to the document budget", () => {
    expect(() => parseMap(part(Array.from({ length: 20 }, (_, i) => `place p${i} "P" 1, 1`).join("\n")),new Budget({steps:5,values:500,chars:5000}))).toThrow(BudgetError);
  });
});

const CHORO = [`fill DE 83.2`, `fill FR 68.1 note="Metropolitan"`, `fill JP 125`, `fill BR 216`, `fill US-CA 39.5`, `fill US-NY 19.6`].join("\n");

describe("choropleth: parse", () => {
  test("fill lines read as region, value, note", () => {
    const s = parseMap(part(CHORO, `title="People" unit="million" scale=steps steps=4 diverge=100`));
    expect(s.errors).toEqual([]);
    expect(s.fills.map((f) => [f.code, f.name, f.value])).toEqual([["DE", "Germany", 83.2], ["FR", "France", 68.1], ["JP", "Japan", 125], ["BR", "Brazil", 216], ["US-CA", "California", 39.5], ["US-NY", "New York", 19.6]]);
    expect(s.fills[1].note).toBe("Metropolitan");
    expect(s.scale).toMatchObject({ kind: "steps", bins: 4, unit: "million", diverge: 100 });
  });
  test("values may use _ and an exponent", () => {
    const s = parseMap(part(`fill DE 1_200_000\nfill FR 1.5e6`));
    expect(s.errors).toEqual([]);
    expect(s.fills.map((f) => f.value)).toEqual([1200000, 1500000]);
  });
  test("every region code the parser knows has a name, a label point and a box", () => {
    expect(CODE_COUNT).toBe(WORLD.length + US_STATES.length);
    for (const r of [...WORLD, ...US_STATES]) { expect(r[1].length).toBeGreaterThan(1); expect(r[5]).toBeLessThanOrEqual(r[7]); expect(r[4]).toBeLessThanOrEqual(r[6]); expect(r[2]).toBeGreaterThanOrEqual(r[5] - 0.5); expect(r[2]).toBeLessThanOrEqual(r[7] + 0.5); }
    expect(WORLD.length).toBeGreaterThan(220);
    expect(US_STATES.length).toBe(51);
  });
  test("a fill under a step is drawn from that step", () => {
    const s = parseMap(part(`fill DE 1\n@step One\nfill FR 2\n@step Two\nfocus FR`));
    expect(s.errors).toEqual([]);
    expect(s.fills.map((f) => f.from)).toEqual([-1, 0]);
  });
  test("the LLM view is a table region | value, with the unit and the range", () => {
    const out = mapLlm(parseMap(part(CHORO, `title="People" unit="million"`)));
    expect(out).toContain("| region | value (million) |");
    expect(out).toContain("| Germany | 83.2 |");
    expect(out).toContain("| France | 68.1 (Metropolitan) |");
    expect(out).toContain("Values: 6 regions, from 19.6 to 216.");
    expect(mapLlm(parseMap(part("fill DE 7")))).toContain("Values: 1 region, from 7 to 7.");
  });
});

describe("choropleth: refusals name the line and the fix", () => {
  const one = (body: string, info = "") => msgs(parseMap(part(body, info)).errors);
  test("an unknown region says what it might be", () => {
    expect(one(`fill Germany 3`)).toMatch(/"Germany" is not a region code; did you mean DE \(Germany\)/);
    expect(one(`fill de 3`)).toMatch(/did you mean DE/);
    expect(one(`fill ZZ 3`)).toMatch(/ISO 3166-1 alpha-2/);
    expect(one(`fill CA-ON 3`)).toMatch(/not a region code/);
  });
  test("a value that is not a number, a twice-filled region, stray words", () => {
    expect(one(`fill DE lots`)).toMatch(/a fill line is: fill <region> <value>/);
    expect(one(`fill DE 1\nfill DE 2`)).toMatch(/DE \(Germany\) is filled twice \(first at line 2\)/);
    expect(one(`fill DE 1 blue`)).toMatch(/unexpected "blue" after the value/);
  });
  test("unknown keys, scales, views, numbers", () => {
    expect(one(`fill DE 1`, `colour=red`)).toMatch(/unknown key "colour"/);
    expect(one(`fill DE 1`, `scale=rainbow`)).toMatch(/scales are heat, steps/);
    expect(one(`fill DE 1`, `view=cube`)).toMatch(/view=globe/);
    expect(one(`fill DE 1`, `steps=2 scale=steps`)).toMatch(/outside 3 to 9/);
    expect(one(`fill DE 1`, `diverge=zero`)).toMatch(/diverge=zero is not a number/);
    expect(one(`fill DE 1`, `min=5 max=2`)).toMatch(/min=5 is not below max=2/);
    expect(one(`fill DE 1`, `spin=fast`)).toMatch(/spin=off/);
  });
  test("a step names a region code, an arc id or a known id", () => {
    expect(one(`fill DE 1\n@step A\nfocus DE\n@step B\nfocus ZZ`)).toMatch(/focus ZZ is not a place, route, area or region code/);
    expect(one(`fill DE 1\n@step A\nfocus FR`)).toBe("");
  });
  test("caps: fills and arcs", () => {
    // every region can be filled once, so the cap of 300 is above the number of regions: a map can fill them all, never more
    expect(MAP_CAPS.fills).toBeGreaterThanOrEqual(WORLD.length + US_STATES.length);
    const all = [...WORLD, ...US_STATES].map((r) => `fill ${r[0]} 1`).join("\n");
    expect(one(all)).toBe("");
    const arcs = Array.from({ length: MAP_CAPS.arcs + 1 }, (_, i) => `arc 1.${i}, 2 -> 3.${i}, 4 5`).join("\n");
    expect(one(arcs)).toMatch(/the cap is 200/);
  });
  test("load-time caps are named and a host can lower them", () => {
    expect(GEO_LIMITS).toMatchObject({ geoPoints: 60000, fills: 300, arcs: 200 });
  });
});

describe("arcs", () => {
  const BASE = [`place sf "San Francisco" 37.77, -122.42 [c1]`, `place ber "Berlin" 52.52, 13.40 [c2]`].join("\n");
  test("place to place, place to region, region to region, pair to place", () => {
    const s = parseMap(part([BASE, `arc sf -> ber 120 "Backups" [c3] id=bk`, `arc DE -> US-CA 40`, `arc FR -> JP 9_000`, `arc 35.68, 139.69 -> sf 5.5`].join("\n"), `unit="TB"`));
    expect(s.errors).toEqual([]);
    expect(s.arcs.map((a) => [a.id, a.a.name, a.b.name, a.value])).toEqual([["bk", "San Francisco", "Berlin", 120], ["arc-2", "Germany", "California", 40], ["arc-3", "France", "Japan", 9000], ["arc-4", "35.68, 139.69", "San Francisco", 5.5]]);
    expect(s.arcs[0]).toMatchObject({ label: "Backups", colour: "c3", auto: false });
    expect(s.arcs[1].a.region).toBe("DE");
  });
  test("a region end starts at the region's label point", () => {
    const s = parseMap(part(`arc DE -> FR 3`));
    const de = regionPoint("DE")!;
    expect(s.arcs[0].a.lat).toBe(de.lat); expect(s.arcs[0].a.lng).toBe(de.lng);
    expect(de.lat).toBeGreaterThan(47); expect(de.lat).toBeLessThan(55); expect(de.lng).toBeGreaterThan(5); expect(de.lng).toBeLessThan(15);
  });
  test("the LLM view lists arcs as from -> to: value", () => {
    const out = mapLlm(parseMap(part([BASE, `arc sf -> ber 120 "Backups"`, `arc DE -> FR 3`].join("\n"), `unit="TB"`)));
    expect(out).toContain("Arcs:");
    expect(out).toContain("- San Francisco -> Berlin: 120 TB (Backups)");
    expect(out).toContain("- Germany -> France: 3 TB");
  });
  test("refusals", () => {
    const one = (b: string) => msgs(parseMap(part(b)).errors);
    expect(one(`arc DE FR 3`)).toMatch(/an arc line is: arc <from> -> <to> <value>/);
    expect(one(`arc DE -> FR`)).toMatch(/the value \(a number\) comes after the end point/);
    expect(one(`arc DE -> FR 0`)).toMatch(/value 0 is not above 0/);
    expect(one(`arc DE -> FR -4`)).toMatch(/value -4 is not above 0/);
    expect(one(`arc DE -> DE 4`)).toMatch(/same point \(Germany\)/);
    expect(one(`arc Germany -> FR 4`)).toMatch(/"Germany" \(the from end\) is not a place id, a region code.*did you mean DE \(Germany\)/);
    expect(one(`arc DE -> 95, 3 4`)).toMatch(/latitude 95 is outside/);
    expect(one(`arc DE -> FR 4 [chartreuse]`)).toMatch(/unknown colour/);
    expect(one(`arc DE -> FR 4 extra`)).toMatch(/unexpected "extra"/);
    expect(one(`arc FR -> DE 1 id=x\narc DE -> FR 2 id=x`)).toMatch(/arc id "x" is used twice/);
  });
  test("steps show an arc by id", () => {
    const s = parseMap(part(`arc DE -> FR 3 id=a\narc FR -> JP 4 id=b\n@step One\nshow a\n@step Two\nshow b`));
    expect(s.errors).toEqual([]);
    expect(s.arcs.map((a) => a.shownAt)).toEqual([0, 1]);
  });
});

describe("globe and the default view", () => {
  test("view=globe and spin", () => {
    const s = parseMap(part(`fill DE 1`, `view=globe spin=off`));
    expect(s.errors).toEqual([]); expect(s.globe).toBe(true); expect(s.spin).toBe(false);
    expect(parseMap(part(`fill DE 1`)).globe).toBe(false);
    expect(mapLlm(s)).toContain("Shown as a turning globe.");
  });
  test("the default view fits the filled regions; Alaska and Hawaii leave it when 6 other states are filled", () => {
    const states = ["US-CA", "US-NY", "US-TX", "US-FL", "US-WA", "US-OH"];
    const withAk = parseMap(part([...states, "US-AK", "US-HI"].map((c) => `fill ${c} 1`).join("\n")));
    const pts = fillPoints(withAk);
    expect(Math.min(...pts.map((p) => p.lat))).toBeGreaterThan(24); // no Hawaii (south of 20)
    expect(Math.max(...pts.map((p) => p.lat))).toBeLessThan(50);    // no Alaska (north of 51)
    const few = parseMap(part(`fill US-AK 1\nfill US-CA 2`));
    expect(Math.max(...fillPoints(few).map((p) => p.lat))).toBeGreaterThan(70); // few filled: Alaska stays in
    expect(allPoints(parseMap(part(`arc DE -> FR 2`))).length).toBe(2);
    expect(regionBox("DE").length).toBe(4);
  });
  test("an empty map still says how to start, and a fill alone is a map", () => {
    expect(msgs(parseMap(part(``)).errors)).toMatch(/fill DE 83.2/);
    expect(parseMap(part(`fill DE 1`)).errors).toEqual([]);
  });
});

describe("the colour scale", () => {
  const sc = (o: Partial<Scale> = {}): Scale => ({ kind: "heat", unit: "", diverge: null, min: null, max: null, bins: 5, none: "No data", ...o });
  test("a sequential range runs from the lowest to the highest value, a tint above zero at the bottom", () => {
    const r = rangeOf([10, 20, 30], sc());
    expect(r).toEqual({ lo: 10, hi: 30, mid: null });
    expect(mixOf(10, r, sc())).toMatchObject({ a: "hi", b: "lo", pct: 14 });
    expect(mixOf(30, r, sc())).toMatchObject({ a: "hi", b: "lo", pct: 100 });
    expect(mixOf(20, r, sc()).pct).toBe(57);
    expect(mixCss(mixOf(30, r, sc()))).toBe("color-mix(in oklab, var(--map-heat-hi) 100%, var(--map-heat-lo))");
  });
  test("min and max pin the range and values outside are clamped", () => {
    const r = rangeOf([5], sc({ min: 0, max: 10 }));
    expect(r).toEqual({ lo: 0, hi: 10, mid: null });
    expect(mixOf(50, r, sc({ min: 0, max: 10 })).pct).toBe(100);
    expect(mixOf(-5, r, sc({ min: 0, max: 10 })).pct).toBe(14);
  });
  test("diverging: the middle is neutral, the two sides use two colours, evenly out from the middle", () => {
    const s = sc({ diverge: 0 }), r = rangeOf([-4, 10], s);
    expect(r).toEqual({ lo: -10, hi: 10, mid: 0 });
    expect(mixOf(0, r, s)).toMatchObject({ a: "hi", b: "mid", pct: 10 });
    expect(mixOf(10, r, s)).toMatchObject({ a: "hi", b: "mid", pct: 100 });
    expect(mixOf(-10, r, s)).toMatchObject({ a: "neg", b: "mid", pct: 100 });
    expect(mixOf(-4, r, s).a).toBe("neg");
  });
  test("steps: a value falls into one of the bands, and the band edges are even", () => {
    const s = sc({ kind: "steps", bins: 4 }), r = rangeOf([0, 100], s);
    expect([0, 24, 25, 60, 99, 100].map((v) => mixOf(v, r, s).bin)).toEqual([0, 0, 1, 2, 3, 3]);
    expect(binEdges(r, 4)).toEqual([0, 25, 50, 75, 100]);
    expect(new Set([0, 10, 24].map((v) => mixOf(v, r, s).pct)).size).toBe(1);
  });
  test("numbers are short in a legend", () => {
    expect([0, 7, 83.24, 12500, 1250000, 3.4e9, 2e12].map(fmtNum)).toEqual(["0", "7", "83.2", "12.5 k", "1.25 M", "3.4 B", "2 T"]);
  });
  test("suggestions", () => {
    expect(suggestRegions("Japan")[0]).toBe("JP (Japan)");
    expect(suggestRegions("us-ca")[0]).toBe("US-CA (California)");
    expect(suggestRegions("Cali")[0]).toBe("US-CA (California)");
  });
});

describe("the boundary data (decoded from our own file, checked against known places)", () => {
  const world = decodeRegions(WORLD_DATA, WORLD, WORLD_Q), us = decodeRegions(US_DATA, US_STATES, US_Q);
  const where = (m: Map<string, any>, lat: number, lng: number) => [...m.keys()].filter((k) => inRegion(m.get(k), lng, lat));
  test("every region decodes to at least one polygon of at least 3 points", () => {
    expect(world.size).toBe(WORLD.length); expect(us.size).toBe(US_STATES.length);
    for (const m of [world, us]) for (const [code, poly] of m) { expect(poly.length).toBeGreaterThan(0); for (const p of poly) for (const ring of p) expect(ring.length, code).toBeGreaterThanOrEqual(3); }
  });
  test("cities fall inside their country", () => {
    const cities: [string, number, number, string][] = [["Berlin", 52.52, 13.4, "DE"], ["Paris", 48.86, 2.35, "FR"], ["Tokyo", 35.68, 139.69, "JP"], ["Sydney", -33.87, 151.21, "AU"], ["Lima", -12.05, -77.04, "PE"], ["Nairobi", -1.29, 36.82, "KE"], ["Reykjavik", 64.15, -21.9, "IS"], ["Cairo", 30.04, 31.24, "EG"], ["Kansas City", 39.1, -94.58, "US"], ["Toronto", 43.65, -79.38, "CA"], ["Moscow", 55.75, 37.62, "RU"], ["Beijing", 39.9, 116.4, "CN"]];
    for (const [name, lat, lng, code] of cities) expect(where(world, lat, lng), name).toContain(code);
    expect(where(world, 52.52, 13.4)).not.toContain("PL");
  });
  test("places in the sea fall in no country", () => {
    expect(where(world, 0, -30)).toEqual([]);       // mid Atlantic
    expect(where(world, -40, 100)).toEqual([]);     // south Indian Ocean
  });
  test("cities fall inside their US state", () => {
    const cities: [string, number, number, string][] = [["Sacramento", 38.58, -121.49, "US-CA"], ["Los Angeles", 34.05, -118.24, "US-CA"], ["Syracuse", 43.05, -76.15, "US-NY"], ["Albany", 42.65, -73.76, "US-NY"], ["Austin", 30.27, -97.74, "US-TX"], ["Spokane", 47.66, -117.43, "US-WA"], ["Orlando", 28.54, -81.38, "US-FL"], ["Springfield", 39.8, -89.65, "US-IL"], ["Denver", 39.74, -104.99, "US-CO"], ["Fairbanks", 64.84, -147.72, "US-AK"]];
    for (const [name, lat, lng, code] of cities) expect(where(us, lat, lng), name).toContain(code);
    expect(where(us, 38.58, -121.49)).not.toContain("US-NV");
  });
  test("a label point and the box of a region sit on the region", () => {
    for (const code of ["DE", "FR", "JP", "BR", "AU"]) { const r = WORLD.find((x) => x[0] === code)!; expect(r[2]).toBeGreaterThanOrEqual(r[5]); expect(r[3]).toBeLessThanOrEqual(r[6]); }
    expect(regionBox("US").map((p) => p.lat).sort((a, b) => a - b)[0]).toBeGreaterThan(24); // the mainland box, not Hawaii
  });
  test("the files are small, as DESIGN says (about 40 KB countries, 35 KB states, compressed)", () => {
    const gz = (s: string) => gzipSync(Buffer.from(s), { level: 9 }).length;
    expect(gz(WORLD_DATA)).toBeLessThan(48_000);
    expect(gz(US_DATA)).toBeLessThan(35_000);
    expect(WORLD.length + US_STATES.length).toBeGreaterThan(280);
  });
  test("a lowered point limit makes the shapes coarser, never refuses", () => {
    const full = [...world.values()].reduce((n, p) => n + p.reduce((m, q) => m + q.reduce((k, r) => k + r.length, 0), 0), 0);
    const coarse = decodeRegions(WORLD_DATA, WORLD, WORLD_Q, 6000);
    const less = [...coarse.values()].reduce((n, p) => n + p.reduce((m, q) => m + q.reduce((k, r) => k + r.length, 0), 0), 0);
    expect(coarse.size).toBe(world.size);
    expect(full).toBeGreaterThan(20000); expect(less).toBeLessThan(full * 0.6);
  });
  test("data comes from Natural Earth, public domain, said in the file", () => {
    expect(readFileSync(new URL("./geo-world.ts",import.meta.url), "utf8")).toMatch(/Natural Earth.*public domain/);
    expect(readFileSync(new URL("./geo-us.ts",import.meta.url), "utf8")).toMatch(/Natural Earth.*public domain/);
  });
});

describe("globe geometry (worked out separately: spheres, not the engine's own numbers)", () => {
  const W = 800, H = 600, R = 200;
  const cam0 = { lat: 0, lng: 0, k: 1 };
  test("the point the camera faces is at the centre; a pole is straight up; 90 degrees round is on the edge", () => {
    const c = project(20, 10, 0, { lat: 20, lng: 10, k: 1 }, W, H, R);
    expect(c.x).toBeCloseTo(W / 2, 6); expect(c.y).toBeCloseTo(H / 2, 6); expect(c.vis).toBe(true);
    const n = project(90, 0, 0, cam0, W, H, R); expect(n.x).toBeCloseTo(W / 2, 6); expect(n.y).toBeCloseTo(H / 2 - R, 6);
    const e = project(0, 90, 0, cam0, W, H, R); expect(e.x).toBeCloseTo(W / 2 + R, 6); expect(e.y).toBeCloseTo(H / 2, 6);
    const e60 = project(0, 60, 0, cam0, W, H, R); expect(e60.x).toBeCloseTo(W / 2 + R * Math.sin(Math.PI / 3), 6); expect(e60.vis).toBe(true);
  });
  test("the far side is hidden", () => {
    expect(project(0, 180, 0, cam0, W, H, R).vis).toBe(false);
    expect(project(0, 100, 0, cam0, W, H, R).vis).toBe(false);
    expect(project(0, 80, 0, cam0, W, H, R).vis).toBe(true);
  });
  test("turning east by 30 degrees moves the centre's longitude to the left", () => {
    const c = { lat: 0, lng: 30, k: 1 };
    expect(project(0, 30, 0, c, W, H, R).x).toBeCloseTo(W / 2, 6);
    expect(project(0, 0, 0, c, W, H, R).x).toBeCloseTo(W / 2 - R * Math.sin(Math.PI / 6), 6);
  });
  test("tilting north by 40 degrees brings the north pole nearer the top edge's front", () => {
    const c = { lat: 40, lng: 0, k: 1 };
    expect(project(90, 0, 0, c, W, H, R).y).toBeCloseTo(H / 2 - R * Math.cos((40 * Math.PI) / 180), 6);
    expect(project(40, 0, 0, c, W, H, R).y).toBeCloseTo(H / 2, 6);
  });
  test("a pointer over a place gives the place back (project then unproject)", () => {
    const c = { lat: 35, lng: -40, k: 1.4 };
    for (const [lat, lng] of [[48.86, 2.35], [10, -70], [60, -20], [0, -40], [35, -40], [-20, -60]] as [number, number][]) {
      const p = project(lat, lng, 0, c, W, H, R), q = unproject(p.x, p.y, c, W, H, R)!;
      expect(q.lat, `${lat},${lng}`).toBeCloseTo(lat, 5); expect(q.lng).toBeCloseTo(lng, 5);
    }
    expect(unproject(W / 2 + R * 1.05, H / 2, cam0, W, H, R)).toBeNull();
  });
  test("an arc rises in the middle, joins its two ends and stays on the great circle", () => {
    const a = { lat: 37.77, lng: -122.42 }, b = { lat: 50.11, lng: 8.68 }, pts = liftedArc(a, b, 28);
    expect(pts[0].h).toBeCloseTo(0, 9); expect(pts[28].h).toBeCloseTo(0, 9); expect(pts[14].h).toBeGreaterThan(0.1);
    expect(pts[0].lat).toBeCloseTo(a.lat, 6); expect(pts[28].lng).toBeCloseTo(b.lng, 6);
    const total = haversine(a, b);
    for (const p of pts) expect(Math.abs(haversine(a, p) + haversine(p, b) - total)).toBeLessThan(total * 1e-6 + 1);
    expect(pts[14].lat).toBeGreaterThan(60); // the great circle from California to Germany passes over Canada and Greenland, far north
  });
  test("an arc point above the far side is seen past the edge, and hidden behind the globe", () => {
    expect(project(0, 180, 0.3, cam0, W, H, R).vis).toBe(false);
    expect(project(0, 100, 0.3, cam0, W, H, R).vis).toBe(true);
  });
  test("helpers", () => {
    expect(wrapLng(190)).toBeCloseTo(-170, 9); expect(wrapLng(-181)).toBeCloseTo(179, 9); expect(wrapLng(540)).toBeCloseTo(-180, 9);
    expect(clampLat(120)).toBe(85); expect(clampLat(-99)).toBe(-85);
    expect(globeR(800, 600, 1)).toBeCloseTo(270, 9); expect(globeR(390, 600, 2)).toBeCloseTo(351, 9);
    expect(GLOBE_K.min).toBeLessThan(1); expect(GLOBE_K.max).toBeGreaterThan(2);
  });
});

