// Looks at every radial kind: writes one html page with all of them at 1280 and 390 wide, light and dark, shot with headless Chrome.
// usage: bun test/engine/chradial/shoot.ts <outdir>   (a test helper, not a test; stops its server and deletes its Chrome profile)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, killAll } from "../../../scripts/cdp";
import { CHART } from "../../../src/engine/charts";
import { DOTS12_CTX, DOTS12V, DOTS6, DOTS_CTX, DOUGHNUT, PIE, POLAR, RADAR, SPANS, UNITS, UNITS_PANEL, ctx } from "./fixtures";
import { toSvg } from "./svg";
const out = process.argv[2] ?? "shots"; mkdirSync(out, { recursive: true });
const cases = [[PIE, null], [DOUGHNUT, null], [POLAR, null], [RADAR, null], [DOTS6, null], [DOTS6, [DOTS12V]], [UNITS, null], [UNITS_PANEL, null], [SPANS, null]] as const;
const page = (w: number, phone: boolean, dark: boolean) => {
  const rect = { x: 0, y: 0, w: Math.min(w - 24, 720), h: phone ? 420 : 340 };
  const body = cases.map(([s, v]) => { const p = CHART[s.kind].draw(s, (v as number[][] | null) ?? s.series.map((x) => x.values), { ...rect, h: s.kind === "dots" ? 240 : s.kind === "spans" ? 180 : s.kind === "units" ? 280 : rect.h }, ctx(phone, s.kind !== "dots" ? {} : v ? DOTS12_CTX : DOTS_CTX)); return `<h4>${s.kind}${v ? " (year)" : ""}${s === UNITS_PANEL ? " (panel)" : ""}</h4>${toSvg(p, rect.w, s.kind === "dots" ? 240 : s.kind === "spans" ? 180 : s.kind === "units" ? 280 : rect.h, dark)}`; }).join("");
  return `<!doctype html><meta charset=utf-8><body style="margin:12px;font-family:sans-serif;background:${dark ? "#1c1c1c" : "#fff"};color:${dark ? "#eee" : "#222"}">${body}`;
};
const pages = new Map<string, string>();
const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (r) => new Response(pages.get(new URL(r.url).pathname) ?? "", { headers: { "content-type": "text/html" } }) });
const b = await launch();
try {
  for (const [w, mobile] of [[1280, false], [390, true]] as const) for (const dark of [false, true]) {
    const name = `radial-${w}-${dark ? "dark" : "light"}`; pages.set(`/${name}.html`, page(w, mobile, dark));
    await b.viewport(w, 900, mobile); await b.goto(`http://127.0.0.1:${srv.port}/${name}.html`); await b.sleep(300);
    const h = await b.eval<number>("document.documentElement.scrollHeight");
    await b.shot(join(out, `${name}.png`), { x: 0, y: 0, width: w, height: h });
  }
} finally { await b.close(); killAll(); srv.stop(true); }
console.log("done", out);
