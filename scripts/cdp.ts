// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// A tiny headless-Chrome driver over the DevTools protocol (no Playwright on this box).
// Real input: Input.dispatchMouseEvent / dispatchTouchEvent / dispatchKeyEvent go through
// the browser's input pipeline, the same path as a person's mouse, finger and keyboard.
//
// No browser outlives its runner (pass 11; pass 10's helpers left 56 running for up to 19 h):
// - Chrome starts in a process group of its own; close() kills the whole group (the wrapper
//   script, the browser and every renderer), not just the first process;
// - a failed start, the runner's exit, SIGINT, SIGTERM and SIGHUP kill every group this runner made;
// - a small guard process (in its own group, so it lives on) checks the runner once a second and
//   kills the group when the runner is gone (even after SIGKILL), or when DH_CDP_MAX_S
//   (default 3600 s) has passed;
// - every protocol call times out (DH_CDP_CALL_MS, default 120 s), so a hung page cannot hang the runner.
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Page = {
  send: (method: string, params?: Record<string, unknown>) => Promise<any>;
  eval: <T = unknown>(expr: string) => Promise<T>;
  goto: (url: string) => Promise<void>;
  shot: (file: string, clip?: { x: number; y: number; width: number; height: number }) => Promise<void>;
  viewport: (w: number, h: number, mobile?: boolean) => Promise<void>;
  dark: (on: boolean) => Promise<void>;
  mouse: (type: "mouseMoved" | "mousePressed" | "mouseReleased", x: number, y: number, button?: "left" | "right" | "none", buttons?: number, modifiers?: number) => Promise<void>;
  drag: (x0: number, y0: number, x1: number, y1: number, opts?: { button?: "left" | "right"; modifiers?: number; steps?: number }) => Promise<void>;
  wheel: (x: number, y: number, dx: number, dy: number, modifiers?: number) => Promise<void>;
  key: (key: string, code?: string, keyCode?: number, modifiers?: number) => Promise<void>;
  touch: (type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number }[]) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  close: () => Promise<void>;
  /** the browser's process group id (for checks and tests) */
  pgid: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Process groups of the browsers this runner started and has not closed yet. */
const live = new Map<number, ChildProcess | null>();
export const liveBrowsers = () => [...live.keys()];

function killGroup(pgid: number) {
  try { process.kill(-pgid, "SIGKILL"); } catch {}
  const guard = live.get(pgid);
  try { guard?.kill("SIGKILL"); } catch {}
  live.delete(pgid);
}
export function killAll() { for (const g of [...live.keys()]) killGroup(g); }

let hooked = false;
function hookExit() {
  if (hooked) return;
  hooked = true;
  process.on("exit", killAll);
  for (const [sig, n] of [["SIGINT", 2], ["SIGTERM", 15], ["SIGHUP", 1]] as const)
    process.on(sig, () => { killAll(); process.exit(128 + n); });
}

/** A guard in its own process group: kills the browser group when this runner is gone or the time is up. */
function startGuard(pgid: number): ChildProcess | null {
  const maxS = Math.max(10, Number(process.env.DH_CDP_MAX_S ?? 3600) | 0);
  const script = 'r=$1; g=$2; m=$3; i=0; while kill -0 "$r" 2>/dev/null && [ "$i" -lt "$m" ]; do sleep 1; i=$((i+1)); done; kill -KILL -"$g" 2>/dev/null; exit 0';
  try {
    const g = nodeSpawn("sh", ["-c", script, "dh-cdp-guard", String(process.pid), String(pgid), String(maxS)], { detached: true, stdio: "ignore" });
    g.unref();
    return g;
  } catch { return null; }
}

export async function launch(port = 9333 + Math.floor(Math.random() * 500)): Promise<Page> {
  hookExit();
  const dir = mkdtempSync(join(tmpdir(), "dh-cdp-"));
  const proc = nodeSpawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--hide-scrollbars", "about:blank"], { detached: true, stdio: "ignore" });
  proc.unref();
  const pgid = proc.pid!;
  live.set(pgid, startGuard(pgid));
  const callMs = Number(process.env.DH_CDP_CALL_MS ?? 120000);
  try {
    let wsUrl = "";
    for (let i = 0; i < 100 && !wsUrl; i++) {
      await sleep(100);
      try {
        const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
        wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? "";
      } catch {}
    }
    if (!wsUrl) throw new Error("chrome did not start");
    const ws = new WebSocket(wsUrl);
    await Promise.race([new Promise((r) => (ws.onopen = r)), sleep(10000).then(() => { throw new Error("chrome: no DevTools socket"); })]);
    let id = 0;
    const pending = new Map<number, (m: any) => void>();
    const waiters: { method: string; fn: () => void }[] = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
      if (m.method) for (const w of waiters.splice(0)) if (w.method === m.method) w.fn(); else waiters.push(w);
    };
    const send = (method: string, params: Record<string, unknown> = {}) =>
      new Promise<any>((res, rej) => {
        const i = ++id;
        const t = setTimeout(() => { pending.delete(i); rej(new Error(`${method}: no answer in ${callMs} ms`)); }, callMs);
        pending.set(i, (m) => { clearTimeout(t); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); });
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    await send("Page.enable");
    await send("Runtime.enable");
    let buttonsDown = 0;
    const page: Page = {
      pgid,
      send,
      async eval(expr) {
        const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        return r.result.value;
      },
      async goto(url) {
        const loaded = new Promise<void>((r) => waiters.push({ method: "Page.loadEventFired", fn: r }));
        await send("Page.navigate", { url });
        await Promise.race([loaded, sleep(20000)]);
        await sleep(400);
      },
      async shot(file, clip) {
        const r = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}), captureBeyondViewport: !!clip });
        await Bun.write(file, Buffer.from(r.data, "base64"));
      },
      async viewport(w, h, mobile = false) {
        await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
        await send("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      },
      async dark(on) {
        await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: on ? "dark" : "light" }] });
      },
      async mouse(type, x, y, button = "none", buttons, modifiers = 0) {
        await send("Input.dispatchMouseEvent", { type, x, y, button, buttons: buttons ?? buttonsDown, clickCount: type === "mouseMoved" ? 0 : 1, modifiers });
      },
      async drag(x0, y0, x1, y1, opts = {}) {
        const button = opts.button ?? "left";
        const bit = button === "left" ? 1 : 2;
        const mods = opts.modifiers ?? 0;
        const steps = opts.steps ?? 12;
        await page.mouse("mouseMoved", x0, y0, "none", 0, mods);
        buttonsDown = bit;
        await page.mouse("mousePressed", x0, y0, button, bit, mods);
        for (let i = 1; i <= steps; i++) {
          await page.mouse("mouseMoved", x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, button, bit, mods);
          await sleep(16);
        }
        buttonsDown = 0;
        await page.mouse("mouseReleased", x1, y1, button, 0, mods);
      },
      async wheel(x, y, dx, dy, modifiers = 0) {
        await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: dx, deltaY: dy, modifiers });
      },
      async key(key, code, keyCode, modifiers = 0) {
        const base = { key, code: code ?? key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers };
        await send("Input.dispatchKeyEvent", { type: "keyDown", ...base, ...(key.length === 1 ? { text: key } : {}) });
        await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      },
      async touch(type, points) {
        await send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
      },
      sleep,
      async close() {
        try { ws.close(); } catch {}
        killGroup(pgid);
      },
    };
    return page;
  } catch (e) {
    killGroup(pgid);
    throw e;
  }
}
