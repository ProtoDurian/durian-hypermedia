// The weather part's view: the numbers drawn in each unit, the units menu (a click on a button switches them, both ways,
// and a round trip is exact), static and the server.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import { parse } from "../../index";
import { UI } from "../../ui/ui";
import type { PartBlock, PartViewProps } from "../types";
import type { WxSpec } from "./part";
import View, { Forecast, UnitsMenu } from "./view";
import { DhContext, DEFAULT_SLOTS } from "../../react/context";
import { DhDocument } from "../../react";
import { createUnitsStore, unitsShown, type Units } from "./units";

const fence = (body: string, info = 'place="SF" unit=c tz=America/Los_Angeles') => `# Page\n\n\`\`\`weather ${info}\n${body}\n\`\`\`\n`;
// ---- the view: the numbers drawn, and a click on the menu ----
const FORECAST = [
  `2026-11-22 sun 18/11 rain=0% wind=12km/h pressure=1021hPa`,
  `2026-11-24 rain 14/9 rain=80% wind=30km/h precip=6mm pressure=1004hPa`,
  `2026-11-25 storm 3/-4 rain=95% wind=45km/h precip=14mm pressure=996hPa`,
].join("\n");
const spec = (info: string, body = FORECAST) => (parse(fence(body, info), { path: "p.dh.md" }).blocks.find((b) => b.type === "weather") as PartBlock<WxSpec>);
const draw = (block: PartBlock<WxSpec>, stp: PartViewProps<WxSpec>["static"], width = 900, host?: Partial<Units>) => {
  const v = <View {...({ block, data: block.data, static: stp, ui: UI.en, stage: { width, theme: "light", motion: "off", report() {} } } satisfies PartViewProps<WxSpec>)} />;
  // a host's default units come through the document's partOptions (DocumentView partOptions={{ weather: { units } }})
  const settings = { ui: UI.en, slots: DEFAULT_SLOTS, components: {}, hostBlocks: new Map(), hostInlines: new Map(), llmPeek: false, demoteHeadings: 0, partOptions: { weather: { units: host } } };
  return renderToStaticMarkup(host ? <DhContext.Provider value={settings}>{v}</DhContext.Provider> : v);
};
/** the text of every element marked data-wx="<what>", in order */
const marks = (html: string, what: string) => [...html.matchAll(new RegExp(`data-wx="${what}"[^>]*>([^<]*)<`, "g"))].map((m) => m[1]);
/** find the elements of a React tree for which fn is true */
function find(node: React.ReactNode, fn: (el: React.ReactElement<any>) => boolean, out: React.ReactElement<any>[] = []): React.ReactElement<any>[] {
  if (Array.isArray(node)) { for (const n of node) find(n, fn, out); return out; }
  if (!React.isValidElement(node)) return out;
  const el = node as React.ReactElement<any>;
  if (fn(el)) out.push(el);
  find(el.props?.children, fn, out);
  return out;
}

describe("weather: the view draws the forecast in the unit asked", () => {
  const b = spec("place=SF unit=c wind=kmh rain=mm pressure=hpa");
  const data = b.data;
  test("the fence's unit by default", () => {
    const html = renderToStaticMarkup(<Forecast spec={data} units={data.units} />);
    expect(marks(html, "hi")).toEqual(["18°", "14°", "3°"]);
    expect(marks(html, "lo")).toEqual(["11°", "9°", "-4°"]);
    expect(marks(html, "wind")).toEqual(["12 km/h", "30 km/h", "45 km/h"]);
    expect(marks(html, "precip")).toEqual(["–", "6 mm", "14 mm"]);
    expect(marks(html, "pressure")).toEqual(["1021 hPa", "1004 hPa", "996 hPa"]);
  });
  test("every unit shows its numbers", () => {
    const f = renderToStaticMarkup(<Forecast spec={data} units={{ temp: "f", wind: "mph", rain: "in", pressure: "inhg" }} />);
    expect(marks(f, "hi")).toEqual(["64°", "57°", "37°"]);
    expect(marks(f, "lo")).toEqual(["52°", "48°", "25°"]);
    expect(marks(f, "wind")).toEqual(["7 mph", "19 mph", "28 mph"]);
    expect(marks(f, "precip")).toEqual(["–", "0.24 in", "0.55 in"]);
    expect(marks(f, "pressure")).toEqual(["30.15 inHg", "29.65 inHg", "29.41 inHg"]);
    const k = renderToStaticMarkup(<Forecast spec={data} units={{ ...data.units, wind: "ms" }} />);
    expect(marks(k, "wind")).toEqual(["3.3 m/s", "8.3 m/s", "12.5 m/s"]);
    const n = renderToStaticMarkup(<Forecast spec={data} units={{ ...data.units, wind: "kn" }} />);
    expect(marks(n, "wind")).toEqual(["6 kn", "16 kn", "24 kn"]);
  });
  test("a forecast written in °F shows °C when asked", () => {
    const h = spec("unit=f wind=mph", `2026-11-24 06:00 fog 48 wind=4mph\n2026-11-24 09:00 cloud 52 wind=8mph`).data;
    expect(marks(renderToStaticMarkup(<Forecast spec={h} units={h.units} />), "hi")).toEqual(["48°", "52°"]);
    expect(marks(renderToStaticMarkup(<Forecast spec={h} units={{ ...h.units, temp: "c", wind: "kmh" }} />), "hi")).toEqual(["9°", "11°"]);
    expect(marks(renderToStaticMarkup(<Forecast spec={h} units={{ ...h.units, temp: "c", wind: "kmh" }} />), "wind")).toEqual(["6 km/h", "13 km/h"]);
  });
  test("the page draws no network address and no script: our own icons only", () => {
    const html = draw(b, undefined);
    expect(html).not.toMatch(/<img|<image|http:|https:|<script|<link|url\(/);
    expect((html.match(/<svg/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("weather: the units menu is a real, keyboard-reachable control, and a click switches the numbers", () => {
  const b = spec("place=SF unit=c wind=kmh rain=mm pressure=hpa");
  const data = b.data;
  /** one screen: the menu over a store, a click = calling the button's own onClick, then the numbers drawn from the store */
  function screen() {
    const store = createUnitsStore(() => null);
    const units = () => unitsShown(data.units, null, store.get());
    const menu = () => <UnitsMenu spec={data} units={units()} onChoose={(k, v) => store.choose(k, v)} />;
    // a UnitsMenu is a function component: call it to get its elements, as the renderer does
    const buttons = () => find(UnitsMenu({ spec: data, units: units(), onChoose: (k, v) => store.choose(k, v) }), (el) => el.type === "button");
    const click = (unit: string) => { const el = buttons().find((x) => x.props["data-unit"] === unit); if (!el) throw new Error(`no button ${unit}`); el.props.onClick(); };
    const html = () => renderToStaticMarkup(<Forecast spec={data} units={units()} />);
    return { click, html, menu, buttons, store };
  }
  test("the menu is made of buttons (Tab reaches each), grouped and named, with the chosen one pressed", () => {
    const { menu, buttons } = screen();
    const html = renderToStaticMarkup(menu());
    expect(buttons().map((x) => x.props["data-unit"])).toEqual(["temp:c", "temp:f", "wind:kmh", "wind:mph", "wind:ms", "wind:kn", "rain:mm", "rain:in", "pressure:hpa", "pressure:inhg"]);
    expect(buttons().every((x) => x.props.type === "button" && x.props.tabIndex !== -1 && typeof x.props.onClick === "function")).toBe(true);
    expect(html).not.toContain('tabindex="-1"');
    expect(html).toContain('aria-label="Units"');
    for (const g of ["Temperature", "Wind", "Rain", "Pressure"]) expect(html).toContain(`aria-label="${g}"`);
    expect([...html.matchAll(/aria-pressed="true"[^>]*>([^<]*)</g)].map((m) => m[1])).toEqual(["°C", "km/h", "mm", "hPa"]);
  });
  test("a click on °F changes the numbers, a click on °C changes them back: the round trip is exact", () => {
    const s = screen();
    const first = s.html();
    expect(marks(first, "hi")).toEqual(["18°", "14°", "3°"]);
    s.click("temp:f");
    const f = s.html();
    expect(marks(f, "hi")).toEqual(["64°", "57°", "37°"]);
    expect(marks(f, "lo")).toEqual(["52°", "48°", "25°"]);
    expect(f).not.toBe(first);
    s.click("temp:c");
    expect(s.html()).toBe(first);
    s.click("temp:f");
    expect(s.html()).toBe(f);
    s.click("temp:c");
    expect(s.html()).toBe(first);

  });
  test("every other unit switches its own numbers and no others, and round-trips", () => {
    const s = screen();
    const first = s.html();
    s.click("wind:mph"); expect(marks(s.html(), "wind")).toEqual(["7 mph", "19 mph", "28 mph"]); expect(marks(s.html(), "hi")).toEqual(["18°", "14°", "3°"]);
    s.click("wind:ms"); expect(marks(s.html(), "wind")).toEqual(["3.3 m/s", "8.3 m/s", "12.5 m/s"]);
    s.click("wind:kn"); expect(marks(s.html(), "wind")).toEqual(["6 kn", "16 kn", "24 kn"]);
    s.click("rain:in"); expect(marks(s.html(), "precip")).toEqual(["–", "0.24 in", "0.55 in"]);
    s.click("pressure:inhg"); expect(marks(s.html(), "pressure")).toEqual(["30.15 inHg", "29.65 inHg", "29.41 inHg"]);
    s.click("wind:kmh"); s.click("rain:mm"); s.click("pressure:hpa");
    expect(s.html()).toBe(first);
  });
  test("the choice is kept in the store (so every weather part and a reload see it)", () => {
    const s = screen();
    s.click("temp:f");
    expect(s.store.get()).toEqual({ temp: "f" });
  });
  test("a part with no wind, rain amount or pressure has only the temperature group", () => {
    const d = spec("unit=c", `2026-11-22 sun 18/11`).data;
    const els = find(UnitsMenu({ spec: d, units: d.units, onChoose() {} }), (el) => el.type === "button");
    expect(els.map((x) => x.props["data-unit"])).toEqual(["temp:c", "temp:f"]);
  });
});

describe("weather: static and the server", () => {
  const b = spec("place=SF unit=c wind=kmh rain=mm pressure=hpa");
  test("live: a menu; static (the fence, the document, print): the forecast whole in the fence's unit, no menu", () => {
    const live = draw(b, undefined);
    expect(live).toContain("data-dh-slot=\"units\"");
    expect(live).toContain('data-unit="temp:f"');
    for (const stp of ["", "1"]) {
      const html = draw(b, stp);
      expect(html).not.toContain("data-dh-slot=\"units\"");
      expect(html).not.toContain("<button");
      expect(html).not.toContain("remembered in this browser");
      expect(html).toContain("data-dh-static");
      expect(marks(html, "hi")).toEqual(["18°", "14°", "3°"]);
    }
  });
  test("static ignores a host default and the reader's stored choice; the server draws the fence's unit", () => {
    const f = spec("unit=c", FORECAST);
    expect(marks(draw(f, "", 900, { temp: "f" }), "hi")).toEqual(["18°", "14°", "3°"]);
    // the server's page: no storage is read (renderToStaticMarkup has no window), the fence's unit
    expect(marks(draw(f, undefined), "hi")).toEqual(["18°", "14°", "3°"]);
  });
  test("the fence's static attribute makes the part static", () => {
    const html = draw(spec("static unit=c"), "");
    expect(html).not.toContain("<button");
  });
  test("a hint to swipe is drawn only when the forecast is wider than the part", () => {
    const many = spec("unit=c", Array.from({ length: 9 }, (_, k) => `2026-11-${String(10 + k).padStart(2, "0")} sun 18/11`).join("\n"));
    expect(draw(many, undefined, 390)).toContain("visibility:visible");
    expect(draw(many, undefined, 2400)).toContain("visibility:hidden");
    expect(draw(many, undefined, 0)).toContain("visibility:hidden");
    expect(draw(spec("unit=c", `2026-11-22 sun 18/11`), undefined, 390)).not.toContain("wx-hint");
  });
  test("an empty forecast (only errors) still draws", () => {
    const b2 = { ...b, data: { ...b.data, rows: [] } } as PartBlock<WxSpec>;
    expect(() => draw(b2, undefined)).not.toThrow();
  });
});


describe("weather: the host's default units come through DhDocument partOptions", () => {
  const page = fence(FORECAST);
  const html = (partOptions?: Record<string, unknown>) => renderToStaticMarkup(<DhDocument doc={parse(page, { path: "p.dh.md" })} partOptions={partOptions} />);
  test("temp f: 18 and 11 degrees C are 64 and 52; the fence's own unit is the default without it", () => {
    expect(marks(html({ weather: { units: { temp: "f" } } }), "hi")).toContain("64°");
    expect(marks(html(), "hi")).toContain("18°");
  });
  test("an unknown word or a wrong type is ignored", () => {
    expect(marks(html({ weather: { units: { temp: "kelvin", wind: 5 } } }), "hi")).toContain("18°");
    expect(marks(html({ weather: "f" }), "hi")).toContain("18°");
  });
});
