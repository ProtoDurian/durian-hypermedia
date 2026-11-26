import { expect, test } from "bun:test";
import { tileLayout, tileProvider, TileTemplateError } from "../src/react/map-tiles";

class Element {
  constructor(readonly network = new Set<Element>()) {}
  style: Record<string, string> = {};
  children: Element[] = [];
  parent: Element | null = null;
  textContent = "";
  private source = "";
  get src() { return this.source; }
  set src(value: string) { this.source = value; if (value) this.network.add(this); }
  finish(ok = true) { this.network.delete(this); (ok ? this.onload : this.onerror)?.(); }
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 512;
  height = 512;
  ownerDocument = { createElement: () => new Element(this.network) };
  append(e: Element) { this.children.push(e); e.parent = this; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null; }
  removeAttribute(name: string) { if (name === "src") this.source = ""; }
  getBoundingClientRect() { return { width: this.width, height: this.height }; }
}
const camera = { cx: .5, cy: .5, zoom: 2 };
const template = "/tiles/{z}/{x}/{y}.png";
const root = () => new Element();
const open = async (el: Element, options: any = {}, context: any = {}) => tileProvider({ tiles: template, attribution: "Example tiles", ...options }).openBasemap!(el as any, camera, context);

test("retired image requests keep their slots until their events finish", async () => {
  const el = root(); el.width = 1536; el.height = 768;
  const base = await open(el);
  await Bun.sleep(120);
  const old = [...el.network];
  expect(old.length).toBe(8);
  base.setView({cx: .8, cy: .5, zoom: 10});
  await Bun.sleep(120);
  expect(el.network.size).toBeLessThanOrEqual(8);
  old[0].finish();
  expect(el.network.size).toBe(8);
  base.destroy();
  for (const img of [...el.network]) img.finish();
});

test("camera motion waits for 100 ms of quiet before starting image requests", async () => {
  const el = root(), base = await open(el);
  expect(el.network.size).toBe(0);
  for (let i=0; i<4; i++) { base.setView({...camera, cx:.5+i/100}); await Bun.sleep(30); }
  expect(el.network.size).toBe(0);
  await Bun.sleep(120);
  expect(el.network.size).toBeGreaterThan(0);
  base.destroy();
  for (const img of [...el.network]) img.finish();
});

test("tile templates require all XYZ placeholders and refuse unsupported placeholders", async () => {
  for (const tiles of ["/tiles.png", "/{z}/{x}.png", "/{s}/{z}/{x}/{y}.png", "/{z}/{x}/{y}{r}.png", "/{z}/{x}/{y}/{oops.png"]) {
    await expect(open(root(), {tiles})).rejects.toThrow("Invalid tile template");
    await expect(open(root(), {tiles})).rejects.toBeInstanceOf(TileTemplateError);
  }
});

test("host chooses a supported referrer policy and optional anonymous CORS", async () => {
  const el = root(), base = await open(el, {referrerPolicy:"strict-origin-when-cross-origin",crossOrigin:"anonymous"});
  const img = el.children[0].children[0] as any;
  expect(img.referrerPolicy).toBe("strict-origin-when-cross-origin");
  expect(img.crossOrigin).toBe("anonymous");
  base.destroy();
  const other = root(), defaults = await open(other);
  expect((other.children[0].children[0] as any).referrerPolicy).toBe("no-referrer");
  expect((other.children[0].children[0] as any).crossOrigin).toBeUndefined();
  defaults.destroy();
  await expect(open(root(), {referrerPolicy:"unsafe-url"})).rejects.toThrow("Invalid tile referrer policy");
});

test("hung requests keep slots while queued retries time out to the still picture", async () => {
  const el = root(); el.width=1536; el.height=768;
  const status: (string|null)[]=[];
  const base = await open(el,{timeoutMs:150},{onStatus:(s:string|null)=>status.push(s)});
  await Bun.sleep(380);
  expect(status.at(-1)?.toLowerCase()).toContain("tile server did not answer");
  expect(el.children[0].children.length).toBe(0);
  expect(el.network.size).toBe(8);
  base.setView({...camera,zoom:10});
  await Bun.sleep(120);
  expect(el.network.size).toBe(8);
  base.destroy();
  for (const img of [...el.network]) img.finish();
});

test("a timed-out tile stays blank beside good tiles; late original responses do not replace its retry", async () => {
  const el = root(), status: (string|null)[]=[];
  const base = await open(el,{timeoutMs:250},{onStatus:(s:string|null)=>status.push(s)});
  await Bun.sleep(120);
  const layer=el.children[0];
  layer.children.slice(1).forEach(img=>img.finish());
  await Bun.sleep(450);
  expect(status).toEqual([]);
  expect(layer.children.length).toBe(4);
  expect(layer.children.filter(img=>img.style.visibility==="hidden").length).toBe(1);
  expect(el.network.size).toBe(2);
  for (const img of [...el.network]) img.finish();
  expect(layer.children.filter(img=>img.style.visibility==="hidden").length).toBe(1);
  expect(el.network.size).toBe(0);
  base.destroy();
});

test("tile timeouts may be lowered but must stay within the bounded default", async () => {
  for (const timeoutMs of [0,-1,Infinity,12001]) await expect(open(root(),{timeoutMs})).rejects.toThrow("Invalid tile timeout");
});

test("camera tiles: positions, fractional zoom, wrapping and polar clipping", () => {
  const tiles = tileLayout(camera, 512, 512);
  expect(tiles.map(t => [t.x, t.y, t.left, t.top, t.size])).toEqual([
    [1, 1, 0, 0, 256], [2, 1, 256, 0, 256], [1, 2, 0, 256, 256], [2, 2, 256, 256, 256],
  ]);
  const half = tileLayout({ ...camera, zoom: 2.5 }, 512, 512);
  expect(half[0].size).toBeCloseTo(256 * Math.sqrt(2));
  expect(tileLayout({ cx: 0, cy: 0, zoom: 1 }, 512, 512).map(t => [t.x, t.y])).toEqual([[1, 0], [0, 0]]);
});

test("policy receives every image URL, rewrites sources, and reuses visible tiles", async () => {
  const el = root(), calls: string[] = [];
  const base = await open(el, {}, { urlPolicy: (url: string, kind: string) => { calls.push(kind); return url.replace("/tiles/", "/safe/"); } });
  await Bun.sleep(120);
  const layer = el.children[0], before = [...layer.children];
  expect(before.length).toBe(4);
  expect(before.every(t => t.src.startsWith("/safe/"))).toBe(true);
  expect(calls).toEqual(["image", "image", "image", "image"]);
  base.setView({ ...camera, cx: .51 });
  expect(layer.children.filter(t => before.includes(t)).length).toBe(4);
  base.destroy();
  expect(el.children).toEqual([]);
});

test("missing template or attribution and unsafe or refused URLs draw no tiles", async () => {
  for (const options of [{ tiles: undefined }, { attribution: " " }, { tiles: "javascript:run()" }, { tiles: "blob:example" }]) {
    const el = root();
    await expect(open(el, options)).rejects.toThrow();
    expect(el.children).toEqual([]);
  }
  const el = root();
  await expect(open(el, {}, { urlPolicy: () => null })).rejects.toThrow("Tile URL refused");
  expect(el.children).toEqual([]);
  await expect(open(root(), {}, { urlPolicy: () => "data:image/png;base64,x" })).rejects.toThrow();
});

test("attribution is text; policy refusal after pan clears the layer and reports its reason", async () => {
  const el = root(), status: (string | null)[] = [];
  let refuse = false;
  const base = await open(el, { attribution: "<b>Example</b>" }, { urlPolicy: (u: string) => refuse ? null : u, onStatus: (s: string | null) => status.push(s) });
  expect(el.children[1].textContent).toBe("<b>Example</b>");
  refuse = true;
  base.setView({ ...camera, cx: .9 });
  expect(el.children[0].children.length).toBe(0);
  expect(status.at(-1)).toContain("Tile URL refused");
  base.destroy();
});

test("DOM tiles and outstanding loads stay bounded during rapid pan and zoom; late events do nothing", async () => {
  const el = root(), status: (string | null)[] = [];
  const base = await open(el, {}, { onStatus: (s: string | null) => status.push(s) });
  await Bun.sleep(120);
  const stale = el.children[0].children[0].onerror;
  for (let i = 0; i < 100; i++) {
    base.setView({ cx: i / 20, cy: .5, zoom: 3 + i % 3 / 2 });
    expect(el.children[0].children.length).toBeLessThanOrEqual(64);
    expect(el.children[0].children.filter(t => t.src && t.onload).length).toBeLessThanOrEqual(8);
  }
  base.destroy();
  const count = status.length;
  stale?.();
  expect(status.length).toBe(count);
});

test("one failed tile among loaded tiles stays blank and the map keeps panning", async () => {
  const el = root(), status: (string | null)[] = [];
  const base = await open(el, {}, { onStatus: (s: string | null) => status.push(s) });
  await Bun.sleep(120);
  const layer = el.children[0], first = layer.children[0];
  layer.children.slice(1).forEach(t => t.finish());
  first.finish(false); // one retry
  first.finish(false); // then blank, without losing the good tiles
  expect(layer.children.length).toBe(4);
  expect(first.src).toBe("");
  expect(first.onerror).toBeNull();
  expect(status).toEqual([]);
  base.setView({ ...camera, cx: .6 });
  expect(layer.children.length).toBeGreaterThan(0);
  expect(status).toEqual([]);
  base.destroy();
});

test("only all failed tiles report a still-picture reason and clear the view", async () => {
  const el = root(), status: (string | null)[] = [];
  const base = await open(el, {}, { onStatus: (s: string | null) => status.push(s) });
  await Bun.sleep(120);
  const tiles = [...el.children[0].children];
  for (const tile of tiles) { tile.finish(false); tile.finish(false); }
  expect(status.at(-1)).toContain("Tile images could not load");
  expect(el.children[0].children.length).toBe(0);
  base.destroy();
});

test("load queue starts eight, advances on completion, and releases retired sources after their events", async () => {
  const el = root(); el.width = 1536; el.height = 768;
  const base = await open(el);
  await Bun.sleep(120);
  const layer = el.children[0], all = [...layer.children];
  expect(all.length).toBe(24);
  expect(all.filter(t => t.src).length).toBe(8);
  all[0].finish();
  expect(all.filter(t => t.src).length).toBe(9);
  expect(all.filter(t => t.src && t.onload).length).toBe(8);
  el.width = 256; el.height = 256; base.resize();
  expect(layer.children.length).toBe(4);
  expect(el.network.size).toBe(8);
  expect(all.filter(t => !layer.children.includes(t) && el.network.has(t)).every(t => t.src && t.onload && t.onerror)).toBe(true);
  base.destroy();
  for (const img of [...el.network]) img.finish();
  expect(all.every(t => !t.src && !t.onload && !t.onerror)).toBe(true);
});

test("oversized viewport refuses before allocation and a policy may refuse one tile of a camera", async () => {
  const el = root(); el.width = 100000;
  await expect(open(el)).rejects.toThrow("64 tiles");
  expect(el.children).toEqual([]);
  let calls = 0;
  const second = root();
  await expect(open(second, {}, { urlPolicy: (u: string) => ++calls === 3 ? null : u })).rejects.toThrow("Tile URL refused");
  expect(calls).toBe(3);
  expect(second.children).toEqual([]);
});
