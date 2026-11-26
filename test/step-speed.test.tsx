// Owner feedback 17: every stepped part has a speed control (0.5×, 1×, 1.5×, 2×, one choice for the whole page), and
// Play on the first step plays that step (it stays a whole pause) instead of skipping to the second. Server rendering,
// the speed helpers and source checks: no browser here.
import { describe, expect } from "bun:test";
import { test } from "./old-engine";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../src/index";
import { SPEEDS, nextSpeed, savedSpeed, speedText } from "../src/ui/speed";
import { UI, LANGS } from "../src/ui/ui";
import { html as renderDoc, fixtures } from "./helpers";

const ROOT = join(import.meta.dir, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("the speed helpers", () => {
  test("the speeds cycle 0.5, 1, 1.5, 2 and back", () => {
    expect([...SPEEDS]).toEqual([0.5, 1, 1.5, 2]);
    expect([nextSpeed(0.5), nextSpeed(1), nextSpeed(1.5), nextSpeed(2)]).toEqual([1, 1.5, 2, 0.5]);
    expect(speedText(1.5)).toBe("1.5×");
  });
  test("with no session storage (the server, a locked-down browser) the speed is 1", () => {
    expect(savedSpeed()).toBe(1);
  });
  test("every language names the control", () => {
    for (const l of LANGS) expect(UI[l.code].speed, l.code).toBeTruthy();
  });
});

describe("every player has the control", () => {
  test("a graph-engine animation's control row has a 1× speed button after Play", () => {
    const f = fixtures("format").find((x) => x.name.includes("48-animation-binary-search-tree-insert"))!;
    const out = renderDoc(parse(f.text, { path: f.name }), "old");
    expect(out).toMatch(/class="btn btn-play"[^]*?class="btn btn-speed"[^>]*aria-label="Speed 1×"[^>]*>1×</);
  });
  test("a composed stage's bar has a 1× speed button after Play", () => {
    const f = fixtures("stage").find((x) => x.name.includes("21-animation-counted-columns"))!;
    const out = renderDoc(parse(f.text, { path: f.name }), "old");
    expect(out).toMatch(/stg-play[^]*?class="stg-btn stg-speed"[^>]*>1×</);
  });
  test("the kit's stepper, the terminal, the animation and the stage all read the page's speed", () => {
    expect(read("src/parts/kit/view.tsx")).toContain("speed={st.speed} onSpeed={st.cycleSpeed} dwell={st.dwell}");
    expect(read("src/parts/kit/view.tsx")).toContain("KIT_DWELL / speed");
    expect(read("src/ui/parts.tsx")).toContain("setTimeout(() => setTyped(typed + 1), delay / speed)");
    expect(read("src/ui/anim.tsx")).toContain("(dur(i) + 1700) / speed");
    expect(read("src/ui/anim.tsx")).toContain("d = dur(to) / speed");
    expect(read("src/ui/stage.tsx")).toContain("STAGE_DWELL / speed");
  });
  test("the speed button hides wherever Play hides (static, print)", () => {
    expect(read("src/parts/kit/kit.css")).toContain("[data-dh-static] .btn-speed");
    expect(read("src/ui/parts.css")).toContain(".term .btn-speed");
  });
});

describe("Play on the first step plays it", () => {
  test("the kit stays on the first step and starts the pause", () => {
    expect(read("src/parts/kit/view.tsx")).toContain("setI((v) => (v >= n - 1 || v === 0 ? 0 : v + 1))");
  });
  test("the composed stage moves on at once from a middle step and stays on step 1", () => {
    expect(read("src/ui/stage.tsx")).toContain("if (k >= n) setK(1); else if (k > 1) setK(k + 1); setPlaying(true);");
  });
  test("while playing, the Play button shows the time left to the next step", () => {
    expect(read("src/ui/parts.tsx")).toContain('className="ctl-tick"');
    expect(read("src/ui/stage.tsx")).toContain('className="stg-tick"');
    expect(read("src/ui/parts.css")).toContain("@media (prefers-reduced-motion: reduce) { .ctl-tick { display: none; } }");
  });
});
