#!/usr/bin/env bun
// The weather part's units menu in a real browser: real mouse clicks and real key presses on the sample built by
// `bun scripts/part-check.ts weather` (run that first; it writes dist/part-check/weather). Reads the numbers from the DOM.
//   bun src/parts/weather/units-check.ts          (needs the browser lane: bash slot.sh browser -- ...)
// Checks: °C -> °F -> °C round trip exact; the second weather part (written in °F) follows the choice; Tab reaches each button
// and Enter and Space pick it; the choice is in localStorage and survives a reload; the static part has no menu and does
// not change; no policy violation and no script error. Exit 1 on any failure.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { launch, type Page } from "../../../scripts/cdp";

const PKG = resolve(import.meta.dir, "../../..");
const OUT = join(PKG, "dist/part-check/weather");
if (!existsSync(join(OUT, "index.html"))) { console.error("run `bun scripts/part-check.ts weather` first"); process.exit(2); }
const freePort = () => { const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") }); const p = s.port; s.stop(true); return p; };
const PORT = freePort();
const server = Bun.spawn(["bun", join(PKG, "example/serve.ts"), OUT, String(PORT), "--trusted-types"], { stdout: "ignore", stderr: "inherit" });
const fails: string[] = [];
const log: string[] = [];
let p: Page | null = null;
const run = <T = unknown>(expr: string) => p!.eval<T>(expr);
const COLLECT = `(() => { const s = window.__dh = { csp: [], errors: [] };
  document.addEventListener("securitypolicyviolation", (e) => s.csp.push(e.effectiveDirective + " " + (e.sample || "").slice(0, 60)));
  window.addEventListener("error", (e) => s.errors.push(String(e.message).slice(0, 200)));
  const ce = console.error.bind(console); console.error = (...a) => { s.errors.push("console.error " + a.map(String).join(" ").slice(0, 200)); ce(...a); }; })();`;
const eq = (what: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); log.push(`${ok ? "ok  " : "FAIL"} ${what}: ${JSON.stringify(got)}`); if (!ok) fails.push(`${what}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`); };
// the text of every element marked data-wx=<what> in the nth weather part
const nums = (n: number, what: string) => run<string[]>(`[...document.querySelectorAll('.dh-part-weather')[${n}].querySelectorAll('[data-wx="${what}"]')].map((e) => e.textContent)`);
const centre = (n: number, unit: string) => run<number[] | null>(`(() => { const b = document.querySelectorAll('.dh-part-weather')[${n}].querySelector('[data-unit="${unit}"]'); if (!b) return null; b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
async function click(n: number, unit: string) {
  const at = await centre(n, unit);
  if (!at) { fails.push(`no button ${unit} in part ${n}`); return; }
  await p!.mouse("mouseMoved", at[0], at[1]); await p!.mouse("mousePressed", at[0], at[1], "left", 1); await p!.mouse("mouseReleased", at[0], at[1], "left", 0);
  await p!.sleep(150);
}
const pressed = () => run<string[]>(`[...document.querySelectorAll('.dh-part-weather')[0].querySelectorAll('[aria-pressed="true"]')].map((b) => b.getAttribute("data-unit"))`);
try {
  await new Promise((r) => setTimeout(r, 700));
  if (server.exitCode !== null) throw new Error(`the page server did not start on port ${PORT}`);
  p = await launch();
  await p.send("Page.addScriptToEvaluateOnNewDocument", { source: COLLECT });
  await p.viewport(1280, 900, false);
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await run(`try { localStorage.clear(); } catch {}`);
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.sleep(600);
  const parts = await run<number>(`document.querySelectorAll('.dh-part-weather').length`);
  eq("three weather parts", parts, 3);
  const c0 = await nums(0, "hi"), w0 = await nums(0, "wind"), o0 = await nums(1, "hi");
  eq("part 0 starts in the fence's °C", c0, ["18°", "16°", "14°", "13°", "12°"]);
  eq("part 1 starts in the fence's °F", o0, ["48°", "52°", "57°", "59°", "55°", "51°"]);
  eq("part 0 menu pressed", await pressed(), ["temp:c", "wind:kmh", "rain:mm", "pressure:hpa"]);
  eq("the static part has no menu", await run<number>(`document.querySelectorAll('.dh-part-weather')[2].querySelectorAll('button, [data-dh-slot="units"]').length`), 0);
  const s0 = await nums(2, "hi");
  // a real mouse click on °F
  await click(0, "temp:f");
  eq("°F: numbers switch", await nums(0, "hi"), ["64°", "61°", "57°", "55°", "54°"]);
  eq("°F: the pressed button follows", (await pressed())[0], "temp:f");
  eq("part 1 (written in °F) follows the shared choice: still °F", await nums(1, "hi"), o0);
  await click(0, "temp:c");
  eq("°C again: the first numbers, exactly", await nums(0, "hi"), c0);
  await click(0, "temp:f"); await click(0, "temp:c"); await click(0, "temp:f"); await click(0, "temp:c");
  eq("two more round trips: still exact", await nums(0, "hi"), c0);
  // the second part: switch it to °C, the first (still °C) and then pick °F on the second: the first follows (shared)
  await click(1, "temp:c");
  eq("part 1 shows °C", await nums(1, "hi"), ["9°", "11°", "14°", "15°", "13°", "11°"]);
  eq("part 0 follows part 1 (one choice for the page): °C", await nums(0, "hi"), c0);
  await click(1, "temp:f");
  eq("part 0 follows part 1 to °F", await nums(0, "hi"), ["64°", "61°", "57°", "55°", "54°"]);
  eq("the static part never changes", await nums(2, "hi"), s0);
  // other groups
  await click(0, "wind:mph"); eq("wind in mph", (await nums(0, "wind")).slice(0, 2), ["7 mph", "9 mph"]);
  await click(0, "wind:ms"); eq("wind in m/s", (await nums(0, "wind")).slice(0, 2), ["3.3 m/s", "4.2 m/s"]);
  await click(0, "wind:kn"); eq("wind in knots", (await nums(0, "wind")).slice(0, 2), ["6 kn", "8 kn"]);
  await click(0, "rain:in"); eq("rain in inches", (await nums(0, "precip")).slice(2, 3), ["0.24 in"]);
  await click(0, "pressure:inhg"); eq("pressure in inHg", (await nums(0, "pressure")).slice(0, 1), ["30.15 inHg"]);
  await click(0, "wind:kmh"); await click(0, "rain:mm"); await click(0, "pressure:hpa");
  eq("wind back in km/h", await nums(0, "wind"), w0);
  // the keyboard: Tab from °F reaches °C... order is c, f: focus °C, Tab to °F, Enter picks it; Space picks °C back
  await click(0, "temp:c");
  await run(`document.querySelectorAll('.dh-part-weather')[0].querySelector('[data-unit="temp:c"]').focus()`);
  await p.key("Tab", "Tab", 9);
  eq("Tab moves to the next button (°F)", await run<string | null>(`document.activeElement && document.activeElement.getAttribute("data-unit")`), "temp:f");
  // Enter as a keyboard sends it: the key with its carriage return (the driver adds text only to one-character keys)
  await p.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r" });
  await p.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await p.sleep(150);
  eq("Enter on °F switches the numbers", (await nums(0, "hi"))[0], "64°");
  await run(`document.querySelectorAll('.dh-part-weather')[0].querySelector('[data-unit="temp:c"]').focus()`);
  await p.key(" ", "Space", 32); await p.sleep(150);
  eq("Space on °C switches them back", await nums(0, "hi"), c0);
  eq("the focused button shows a focus ring (outline)", await run<boolean>(`(() => { const b = document.querySelectorAll('.dh-part-weather')[0].querySelector('[data-unit="temp:c"]'); b.focus(); const o = getComputedStyle(b).outlineStyle; return o !== "none"; })()`), true);
  // remembered
  await click(0, "temp:f"); await click(0, "wind:mph");
  const kept = JSON.parse((await run<string | null>(`localStorage.getItem("dh-wx-units")`)) ?? "{}");
  eq("stored under dh-wx-units", [kept.temp, kept.wind], ["f", "mph"]);
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.sleep(700);
  eq("after a reload: °F", (await nums(0, "hi"))[0], "64°");
  eq("after a reload: mph", (await nums(0, "wind"))[0], "7 mph");
  eq("after a reload the menu shows the choice", (await pressed()).slice(0, 2), ["temp:f", "wind:mph"]);
  eq("after a reload the static part is still in the fence's unit", await nums(2, "hi"), s0);
  // a blocked storage: nothing throws and the choice works until reload
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await run(`localStorage.clear()`);
  const st = await run<{ csp: string[]; errors: string[] }>(`window.__dh`);
  eq("no policy violation", st.csp, []);
  eq("no script error", st.errors, []);
} catch (e) {
  fails.push(`the check stopped: ${(e as Error).message}`);
} finally {
  await p?.close().catch(() => {});
  server.kill();
  await server.exited;
}
console.log(log.join("\n"));
console.log(fails.length ? `units-check weather: ${fails.length} failure(s)\n- ${fails.join("\n- ")}` : "units-check weather: ok");
process.exit(fails.length ? 1 : 0);
