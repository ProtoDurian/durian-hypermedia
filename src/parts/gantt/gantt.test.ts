// The gantt part: parse and the schedule, the LLM view, every refusal, its caps in both sets, the doubling test (budget
// charges counted at n and 2n, never time), the date code, the layout, the drawn markup and the fixtures.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, BudgetError, partLimitsOf } from "../../core/budget";
import { UI } from "../../ui/ui";
import gantt, { ganttLlm, opLine, parseGantt, scheduleGantt, takeColour, taskLine, type GanttInput, type GanttSpec } from "./part";
import { addLength, fmtTime, parseLength, parsePercent, parseTime, partsOf, scanIso, timeTicks, validZone, DAY } from "./time";
import { GANTT, layoutGantt } from "./layout";
import GanttView from "./view";

const fence = (body: string, info = 'title="G"') => `# Page\n\n\`\`\`gantt ${info}\n${body}\n\`\`\`\n`;
const G = `section Build
design "Design" 2026-12-01 .. 2026-12-04 done
api "API" after design 8d 60%
ui "Screens" after design 6d
section Ship
beta "Beta" after api ui 3d [warn]
launch "Launch" milestone after beta`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const NOCAP = { ganttTasks: 1e9, ganttSteps: 1e9, ganttSections: 1e9, ganttDeps: 1e9, ganttSpanDays: 1e9 };
/** the part's input from a body: the format's own split at @step lines, by hand */
function input(text: string, attrs: Record<string, string> = {}): GanttInput {
  const head: string[] = [], steps: { title: string; line: number; raw: string }[] = [];
  text.split("\n").forEach((l, k) => {
    if (l.startsWith("@step")) steps.push({ title: l.slice(5).trim(), line: k + 1, raw: "" });
    else if (steps.length) steps[steps.length - 1].raw += (steps[steps.length - 1].raw ? "\n" : "") + l;
    else head.push(l);
  });
  return { head: head.join("\n"), steps, attrs, bodyLine: 1, line: 0 };
}
const get = (text: string, attrs: Record<string, string> = {}, lim: typeof LIMITS = LIMITS, b?: Budget) => parseGantt(input(text, attrs), lim, b);
const errs = (s: GanttSpec) => s.errors.map((e) => e.msg);
const problems = (src: string, limits?: Partial<typeof LIMITS>) => check(parse(src, { path: "p.dh.md", limits }));
const errorsOf = (src: string, limits?: Partial<typeof LIMITS>) => problems(src, limits).filter((p) => p.level === "error").map((p) => p.message);
const day = (t: number) => fmtTime(t, "yyyy-MM-dd", "UTC");
const tasksOf = (n: number) => Array.from({ length: n }, (_, k) => `t${k} "Task ${k}" 2026-12-01 ${1 + (k % 5)}d`).join("\n");
const chainOf = (n: number) => Array.from({ length: n }, (_, k) => (k ? `t${k} "T${k}" after t${k - 1} 1d` : `t0 "T0" 2026-12-01 1d`)).join("\n");

describe("gantt: parse and the schedule", () => {
  test("a good gantt is a block with its data and no problems", () => {
    const doc = parse(fence(G, 'title="Release 2.0" today=2026-12-09'), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "gantt")!;
    if (!b || b.type !== "gantt") throw new Error("not a gantt");
    expect(b.data.tasks.map((t) => t.id)).toEqual(["design", "api", "ui", "beta", "launch"]);
    expect(b.data.sections).toEqual(["Build", "Ship"]);
    expect(b.llmKind).toBe("own");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);   // plain data: parse on a server, draw in a browser
  });
  test("dates, `after`, milestone, progress, done and colour", () => {
    const g = get(G, { title: "Release 2.0", today: "2026-12-09" });
    expect(g.errors).toEqual([]);
    const by = Object.fromEntries(scheduleGantt(g, 0).map((x) => [x.id, x]));
    expect(day(by.design.start)).toBe("2026-12-01"); expect(day(by.design.end)).toBe("2026-12-05"); // exclusive end
    expect(day(by.api.start)).toBe("2026-12-05"); expect(day(by.api.end)).toBe("2026-12-13");
    expect(day(by.ui.end)).toBe("2026-12-11");
    expect(day(by.beta.start)).toBe("2026-12-13"); // waits for the later of api and ui
    expect(by.launch.milestone).toBe(true); expect(by.launch.start).toBe(by.launch.end);
    expect(by.api.progress).toBe(60); expect(by.design.done).toBe(true); expect(by.beta.colour).toBe("warn");
    expect(g.today).toBe(parseTime("2026-12-09", "UTC")!);
    expect(g.extent.min).toBe(by.design.start); // the axis covers every step (and today)
  });
  test("an order of tasks that waits for a later line, a date and time, a zone", () => {
    const g = get(`b "B" after a 1d\na "A" 2026-12-01T09:30 2h`, { tz: "America/Los_Angeles" });
    expect(g.errors).toEqual([]);
    const by = Object.fromEntries(scheduleGantt(g, 0).map((x) => [x.id, x]));
    expect(fmtTime(by.a.start, "yyyy-MM-dd'T'HH:mm", "America/Los_Angeles")).toBe("2026-12-01T09:30");
    expect(by.a.end - by.a.start).toBe(2 * 3_600_000);
    expect(by.b.start).toBe(by.a.end);
  });
  test("steps: progress, done, and a move that carries what follows", () => {
    const g = get(`${G}\n@step plan\n@step progress\nprogress api 80%\ndone ui\n@step slip\nmove api 2026-12-10`);
    expect(g.errors).toEqual([]);
    const at = (f: number) => Object.fromEntries(scheduleGantt(g, f).map((x) => [x.id, x]));
    expect(at(0).api.progress).toBe(60);
    expect(at(1).api.progress).toBe(80); expect(at(1).ui.done).toBe(true);
    expect(day(at(2).api.start)).toBe("2026-12-10"); expect(day(at(2).api.end)).toBe("2026-12-18");
    expect(at(2).api.moved).toBe(true);
    expect(day(at(2).beta.start)).toBe("2026-12-18"); // the task after it follows
  });
  test("a task under a step appears in it", () => {
    const g = get(`${G}\n@step a\n@step b\nextra "Extra" after launch 2d`);
    expect(g.errors).toEqual([]);
    expect(scheduleGantt(g, 0).some((s) => s.id === "extra")).toBe(false);
    expect(scheduleGantt(g, 1).some((s) => s.id === "extra")).toBe(true);
  });
  test("workdays skip the weekend, and critical marks the longest chain", () => {
    const g = get(`a "A" 2026-12-04 3d\nb "B" after a 2d\nc "C" 2026-12-01 .. 2026-12-02`, { workdays: "on", critical: "on" });
    expect(g.errors).toEqual([]);
    const s = Object.fromEntries(scheduleGantt(g, 0).map((x) => [x.id, x]));
    expect(partsOf(s.a.start).dow).toBe(5); // Friday
    expect(day(s.b.start)).toBe("2026-12-09"); // Fri, Mon, Tue worked: next free day is Wed
    expect(s.a.critical).toBe(true); expect(s.b.critical).toBe(true); expect(s.c.critical).toBe(false);
  });
  test("a step's first command may follow a head that is the same text (the head is the head)", () => {
    // the head and the step hold the same line: the one under the step is a step command, the one in the head is refused
    const g = get(`a "A" 2026-12-01 2d\ndone a\n@step x\ndone a`);
    expect(errs(g).filter((m) => /goes under an @step line/.test(m)).length).toBe(1);
  });
});

describe("gantt: the LLM view", () => {
  test("a table per section, progress and done in the task cell, a milestone as one date, and the page carries it", () => {
    const t = ganttLlm(get(G, { title: "Release 2.0" }));
    expect(t.startsWith("Gantt: Release 2.0.\n\nBuild\n\n| task | start | end | after |\n| --- | --- | --- | --- |")).toBe(true);
    expect(t).toContain("| Design (done) | 2026-12-01 | 2026-12-04 |  |");
    expect(t).toContain("| API (60%) | 2026-12-05 | 2026-12-12 | Design |");
    expect(t).toContain("| Launch (milestone) | 2026-12-16 |  | Beta |");
    expect(t).toContain("Ship\n\n| task");
    expect(parse(fence(G, 'title="Release 2.0"'), { path: "p.dh.md" }).llm).toContain(t);
  });
  test("steps: only the tasks that changed, and the critical chain", () => {
    const g = get(`${G}\n@step plan\n@step progress\nprogress api 80%\n@step slip\nmove api 2026-12-10`, { critical: "on", workdays: "off" });
    const t = ganttLlm(g);
    expect(t).toContain("Step 1: plan");
    expect(t).toContain('Critical chain (the longest run of "after"s): Design, API, Beta.');
    expect(t.split("Step 2: progress")[1].split("Step 3")[0]).toContain("| API (80%) |");
    expect(t.split("Step 3: slip")[1]).toContain("| Beta | 2026-12-18 |");
    expect(t.split("Step 3: slip")[1]).not.toContain("| Design (");
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence(G) + "\n:::llm\nA release plan in two sections.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("A release plan in two sections.");
    expect(doc.llm).not.toContain("| task |");
  });
  test("a part that cannot be read says so by itself", () => {
    expect(parse(fence(chainOf(200) + "\n" + Array.from({ length: 30 }, (_, k) => `@step s${k}`).join("\n")), { path: "p.dh.md", limits: { maxEvalSteps: 20_000 } }).llm).toContain("[gantt not shown: the gantt part does too much work");
  });
});

describe("gantt: every refusal names the line and the fix", () => {
  const cases: [string, string, RegExp, Record<string, string>?][] = [
    ["an unknown id after `after`", `a "A" after nobody 2d`, /there is no task "nobody"/],
    ["a task after itself", `a "A" after a 2d`, /cannot come after itself/],
    ["a loop", `a "A" after b 2d\nb "B" after a 2d`, /a loop of "after"s among a, b/],
    ["an end before the start", `a "A" 2026-12-05 .. 2026-12-01`, /ends \(2026-12-01\) before it starts/],
    ["an unknown length unit", `a "A" 2026-12-05 3y`, /unknown length unit "y"/],
    ["a length of 0", `a "A" 2026-12-05 0d`, /a length is above 0/],
    ["progress over 100%", `a "A" 2026-12-05 3d 120%`, /over 100%/],
    ["a task twice", `a "A" 2026-12-05 3d\na "A2" 2026-12-06 3d`, /written twice/],
    ["an unknown colour", `a "A" 2026-12-05 3d [red]`, /not a colour word/],
    ["a hex colour", `a "A" 2026-12-05 3d [#ff0000]`, /not a colour word.*no hex values/],
    ["an end that is missing", `a "A" 2026-12-05`, /needs an end/],
    ["a start that is missing", `a "A" 3d`, /needs a start/],
    ["a date that is not real", `a "A" 2026-13-05 3d`, /is not a real date/],
    ["a milestone with a length", `a "A" milestone 2026-12-05 3d`, /a milestone is a point/],
    ["a stray word after the end", `a "A" 2026-12-05 3d later`, /is not understood here/],
    ["a command on an unknown task", `a "A" 2026-12-05 3d\n@step x\n@step y\nmove b 2026-12-06`, /there is no task "b"/],
    ["progress over 100% in a step", `a "A" 2026-12-05 3d\n@step x\n@step y\nprogress a 200%`, /over 100%/],
    ["a progress command with no number", `a "A" 2026-12-05 3d\n@step x\n@step y\nprogress a`, /write: progress a 80%/],
    ["a move command with no date", `a "A" 2026-12-05 3d\n@step x\n@step y\nmove a soon`, /write: move a 2026-12-12/],
    ["a command outside a step", `a "A" 2026-12-05 3d\nprogress a 50%`, /goes under an @step line/],
    ["a task that first appears in a later step", `a "A" 2026-12-05 3d\n@step x\n@step y\nb "B" after c 2d\n@step z\nc "C" after a 1d`, /first appears in a later step/],
    ["a bad today", `a "A" 2026-12-05 3d`, /today="soon" is not a date/, { today: "soon" }],
    ["an unknown option", `a "A" 2026-12-05 3d`, /unknown option "size"/, { size: "l" }],
    ["an unknown zone", `a "A" 2026-12-05 3d`, /is not an IANA zone name/, { tz: "Mars/Olympus" }],
    ["workdays that is not on or off", `a "A" 2026-12-05 3d`, /workdays= is on or off/, { workdays: "yes" }],
    ["a line it does not understand", `nothing here`, /line not understood/],
    ["no tasks", `section Empty`, /no tasks/],
    ["a chart over the span", `a "A" 2026-12-01 .. 9999-12-31`, /would span 2\d\d\d\d\d\d days/],
    ["a length over the span", `a "A" 2026-12-01 99999w`, /is longer than the 3700 days/],
  ];
  for (const [what, body, re, attrs] of cases) test(what, () => {
    const g = get(body, attrs);
    expect(errs(g).join("\n")).toMatch(re);
    expect(g.errors.every((e) => e.line >= 0)).toBe(true);
    const info = 'title="G"' + Object.entries(attrs ?? {}).map(([k, v]) => ` ${k}=${v}`).join("");
    const doc = errorsOf(fence(body, info));
    expect(doc.some((m) => re.test(m))).toBe(true);
    expect(doc.every((m) => m.includes("gantt:"))).toBe(true);
  });
  test("a refusal names the line it is on", () => {
    const e = problems(fence(`a "A" 2026-12-05 3d\nb "B" after zz 2d`)).find((p) => /no task "zz"/.test(p.message))!;
    expect(e.line).toBe(5); // the fence is on line 3, the body from line 4
  });
  test("warnings: a long label", () => {
    const w = problems(fence(`a "${"x".repeat(70)}" 2026-12-05 3d`)).filter((p) => p.level === "warn").map((p) => p.message);
    expect(w.some((m) => /is 70 characters; keep it under 60/.test(m))).toBe(true);
  });
  test("what an author echoes is cut short in the message", () => {
    const long = "z".repeat(5000);
    const m = errs(get(`a "A" after ${long} 2d`)).join("\n");
    expect(m).toContain("no task");
    expect(m.length).toBeLessThan(400);
  });
});

describe("gantt: the hand scans read what the old patterns read", () => {
  test("task and step-command lines", () => {
    expect(taskLine('api "API" after design 8d 60%')).toEqual({ id: "api", label: "API", rest: "after design 8d 60%" });
    expect(taskLine('a.b-c_1   "x y"[warn]')).toEqual({ id: "a.b-c_1", label: "x y", rest: "[warn]" });
    expect(taskLine('api"API"')).toBeNull();
    expect(taskLine('api "API')).toBeNull();
    expect(taskLine('a b "x"')).toBeNull();
    expect(opLine("progress api 80%")).toEqual({ kind: "progress", id: "api", rest: "80%" });
    expect(opLine("done ui")).toEqual({ kind: "done", id: "ui", rest: "" });
    expect(opLine("move api 2026-12-12")).toEqual({ kind: "move", id: "api", rest: "2026-12-12" });
    expect(opLine("progress")).toBeNull();
    expect(opLine("doneness ui")).toBeNull();
  });
  test("a colour word at the end of a line", () => {
    expect(takeColour("after a 3d [warn]")).toEqual({ text: "after a 3d", colour: "warn" });
    expect(takeColour("3d [pink]")).toEqual({ text: "3d", bad: "pink" });
    expect(takeColour("3d [ c3 ]")).toEqual({ text: "3d", colour: "c3" });
    expect(takeColour("3d [a] [warn]")).toEqual({ text: "3d [a]", colour: "warn" });
    expect(takeColour("3d [warn] x")).toEqual({ text: "3d [warn] x" });
    expect(takeColour("3d")).toEqual({ text: "3d" });
    expect(takeColour("]")).toEqual({ text: "]" });
  });
  test("dates, lengths and percentages", () => {
    expect(scanIso("2026-12-01")).toMatchObject({ y: 2026, mo: 12, d: 1, time: false, off: null });
    expect(scanIso("2026-12-01T09:30:15Z")).toMatchObject({ h: 9, mi: 30, s: 15, off: 0, time: true });
    expect(scanIso("2026-12-01T09:30+01:00")).toMatchObject({ off: 60 });
    expect(scanIso("2026-12-01T09:30-0530")).toMatchObject({ off: -330 });
    expect(scanIso("2026-12-01 09:30")).toBeNull();            // a token has no space
    expect(scanIso("2026-12-01 09:30", true)).toMatchObject({ h: 9, mi: 30 });
    expect(scanIso("2026-12-01T09:30:15.250Z", true)).toMatchObject({ s: 15, ms: 250 });
    expect(scanIso("2026-12-01T09:30:15.250Z")).toBeNull();
    for (const bad of ["2026-12-1", "26-12-01", "2026/12/01", "2026-12-01T9:30", "2026-12-01T", "2026-12-01x", "soon", ""]) expect(scanIso(bad, true)).toBeNull();
    expect(parseTime("2026-02-30")).toBeNull();
    expect(parseTime("2026-12-01T25:00")).toBeNull();
    expect(parseTime("2026-12-01T00:00Z")).toBe(Date.UTC(2026, 11, 1));
    expect(parseTime(" 2026-12-01 ")).toBe(Date.UTC(2026, 11, 1));
    expect(parseLength("3d")).toEqual({ n: 3, unit: "d", known: true });
    expect(parseLength("2.5w")).toEqual({ n: 2.5, unit: "w", known: true });
    expect(parseLength("3y")).toEqual({ n: 3, unit: "y", known: false });
    for (const bad of ["d", "3", "3.d", "3d2", "60%", "-3d", ""]) expect(parseLength(bad)).toBeNull();
    expect(parsePercent("60%")).toBe(60);
    expect(parsePercent("12.5%")).toBe(12.5);
    for (const bad of ["60", "%", ".5%", "6.%", "a%", ""]) expect(parsePercent(bad)).toBeNull();
  });
  test("a zone, a clock change, ticks", () => {
    expect(validZone("America/Los_Angeles")).toBe(true);
    expect(validZone("Mars/Olympus")).toBe(false);
    const t = parseTime("2026-03-08T09:00", "America/Los_Angeles")!; // the morning after the clock change
    expect(t).toBe(Date.UTC(2026, 2, 8, 16, 0));
    expect(fmtTime(t, "yyyy-MM-dd'T'HH:mm", "America/Los_Angeles")).toBe("2026-03-08T09:00");
    const k = timeTicks(Date.UTC(2026, 11, 1), Date.UTC(2026, 11, 31), "UTC", 8);
    expect(k.unit).toBe("week"); expect(k.t.length).toBeLessThanOrEqual(8);
    expect(timeTicks(0, 3000 * DAY, "UTC", 1e9).t.length).toBeLessThanOrEqual(200 * 4);
  });
  test("workdays: whole weeks at once end where the day by day count ends", () => {
    const brute = (start: number, days: number) => { let t = start, left = days; for (let k = 0; k < 3; k++) { const d = partsOf(t).dow; if (d === 0 || d === 6) t += DAY; } while (left > 0) { const d = partsOf(t).dow; if (d !== 0 && d !== 6) left--; t += DAY; } return t; };
    for (let s = 0; s < 7; s++) for (let n = 1; n <= 31; n++) {
      const start = Date.UTC(2026, 11, 7 + s); // a Monday, then each day of that week
      expect(addLength(start, n, "d", "UTC", true)).toBe(brute(start, n));
    }
    expect(addLength(Date.UTC(2026, 11, 7), 2, "w", "UTC", true)).toBe(brute(Date.UTC(2026, 11, 7), 10));
  });
});

describe("gantt: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS, the strict ones no higher", () => {
    expect([LIMITS.ganttTasks, LIMITS.ganttSteps, LIMITS.ganttSections, LIMITS.ganttDeps, LIMITS.ganttSpanDays]).toEqual([200, 30, 30, 600, 3700]);
    expect([UNTRUSTED_LIMITS.ganttTasks, UNTRUSTED_LIMITS.ganttSteps, UNTRUSTED_LIMITS.ganttSections, UNTRUSTED_LIMITS.ganttDeps, UNTRUSTED_LIMITS.ganttSpanDays]).toEqual([100, 15, 15, 300, 1850]);
    for (const k of Object.keys(UNTRUSTED_LIMITS) as (keyof typeof LIMITS)[]) if (k.startsWith("gantt")) expect(UNTRUSTED_LIMITS[k]).toBeLessThanOrEqual(LIMITS[k]);
  });
  test("tasks: 150 pass the authored set, the strict set refuses them, a host cap too", () => {
    expect(errorsOf(fence(tasksOf(150))).filter((m) => /more than|at most/.test(m))).toEqual([]);
    expect(errorsOf(fence(tasksOf(150)), UNTRUSTED_LIMITS).some((m) => /more than 100 tasks/.test(m))).toBe(true);
    expect(errorsOf(fence(tasksOf(150)), { ganttTasks: 50 }).some((m) => /more than 50 tasks/.test(m))).toBe(true);
    expect(errorsOf(fence(tasksOf(201))).some((m) => /more than 200 tasks/.test(m))).toBe(true);
  });
  test("steps, sections and arrows", () => {
    const steps = tasksOf(2) + "\n" + Array.from({ length: 31 }, (_, k) => `@step s${k}`).join("\n");
    expect(errorsOf(fence(steps)).some((m) => /at most 30 steps/.test(m))).toBe(true);
    expect(errorsOf(fence(steps), UNTRUSTED_LIMITS).some((m) => /at most 15 steps/.test(m))).toBe(true);
    const sections = Array.from({ length: 31 }, (_, k) => `section S${k}\nt${k} "T" 2026-12-01 1d`).join("\n");
    expect(errorsOf(fence(sections)).some((m) => /at most 30 sections/.test(m))).toBe(true);
    const wide = Array.from({ length: 40 }, (_, k) => `t${k} "T${k}" 2026-12-01 1d`).join("\n") + "\n" + Array.from({ length: 20 }, (_, k) => `u${k} "U${k}" after ${Array.from({ length: 40 }, (_, j) => `t${j}`).join(" ")} 1d`).join("\n");
    expect(errorsOf(fence(wide)).some((m) => /more than 600 "after" arrows/.test(m))).toBe(true);
    expect(errorsOf(fence(wide), { ganttDeps: 2000 }).some((m) => /arrows/.test(m))).toBe(false);
  });
  test("the span: a host may raise it, the strict set halves it", () => {
    const body = `a "A" 2026-01-01 .. 2031-12-31`;
    expect(errorsOf(fence(body)).filter((m) => /span/.test(m))).toEqual([]);
    expect(errorsOf(fence(body), UNTRUSTED_LIMITS).some((m) => /would span 2\d\d\d days.*at most 1850/.test(m))).toBe(true);
    expect(errorsOf(fence(`a "A" 2026-01-01 .. 2046-12-31`), { ganttSpanDays: 9000 }).filter((m) => /span/.test(m))).toEqual([]);
  });
  test("over the page's work budget: refused with the part's name, never a hang", () => {
    const body = chainOf(200) + "\n" + Array.from({ length: 30 }, (_, k) => `@step s${k}`).join("\n");
    const doc = parse(fence(body), { path: "p.dh.md", limits: { maxEvalSteps: 20_000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the gantt part does too much work/);
    // the same page within the default budget is read
    expect(errorsOf(fence(body)).filter((m) => !m.startsWith("[LLM text present]"))).toEqual([]);
    // directly: a part's own budget runs out as a BudgetError, which parse never swallows
    expect(() => get(body, {}, LIMITS, new Budget({ steps: 20_000, values: 100_000, chars: 100_000 }, null, null, "the gantt part"))).toThrow(BudgetError);
  });
});

describe("gantt: linear (the doubling test, charges counted)", () => {
  /** parse, the schedule's layout and the LLM view: what a page pays */
  const cost = (body: string, lim: typeof LIMITS | typeof NOCAP = NOCAP) => {
    const b = big();
    const g = get(body, {}, lim as typeof LIMITS, b);
    layoutGantt(g, scheduleGantt(g, 0), 900, null, b);
    ganttLlm(g);
    return b.steps + b.values + b.chars;
  };
  for (const [what, make] of [["independent tasks", tasksOf], ["a chain of `after`s", chainOf]] as const) {
    test(`${what}: twice the lines cost at most about twice`, () => {
      for (const n of [100, 400, 1600]) { const r = cost(make(2 * n)) / cost(make(n)); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
    });
  }
  test("lines that are not tasks: twice the lines cost at most about twice", () => {
    const note = (n: number) => Array.from({ length: n }, (_, k) => `// a note ${k} that is not a task`).join("\n") + "\n" + tasksOf(3);
    for (const n of [500, 2000, 8000]) { const r = cost(note(2 * n)) / cost(note(n)); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("steps: twice the steps cost at most about twice", () => {
    const stepped = (n: number) => tasksOf(20) + "\n" + Array.from({ length: n }, (_, k) => `@step s${k}\nprogress t${k % 20} ${k % 100}%`).join("\n");
    for (const n of [50, 200, 800]) { const r = cost(stepped(2 * n)) / cost(stepped(n)); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("a long line is read once", () => {
    const b1 = big(), b2 = big();
    get(`a "${"x".repeat(20_000)}" 2026-12-01 1d`, {}, NOCAP as typeof LIMITS, b1);
    get(`a "${"x".repeat(40_000)}" 2026-12-01 1d`, {}, NOCAP as typeof LIMITS, b2);
    expect(b2.steps / b1.steps).toBeLessThan(2.2);
    const w1 = big(), w2 = big();
    get(`a "A" ${"after ".repeat(5_000)}`, {}, NOCAP as typeof LIMITS, w1);
    get(`a "A" ${"after ".repeat(10_000)}`, {}, NOCAP as typeof LIMITS, w2);
    expect(w2.steps / w1.steps).toBeLessThan(2.2);
  });
  test("a gantt at every cap stays inside one part's budget", () => {
    const body = chainOf(LIMITS.ganttTasks) + "\n" + Array.from({ length: LIMITS.ganttSteps }, (_, k) => `@step s${k}\nprogress t${k} 50%`).join("\n");
    const b = new Budget(partLimitsOf(LIMITS), null, null, "the gantt part");
    const g = get(body, {}, LIMITS, b);
    expect(g.errors).toEqual([]);
    expect(g.tasks.length).toBe(200);
  });
});

describe("gantt: a named zone is charged", () => {
  // every task at its own minute, so no two asks of a zone are the same instant
  const dated = (n: number) => Array.from({ length: n }, (_, k) => `t${k} "T" ${new Date(Date.UTC(2026, 0, 1) + k * 3_600_000 * 7 + k * 60_000).toISOString().slice(0, 16)} 1d`).join("\n");
  const steps = (body: string, attrs: Record<string, string>) => { const b = big(); const g = get(body, attrs, NOCAP as typeof LIMITS, b); layoutGantt(g, scheduleGantt(g, 0), 900, null, b); ganttLlm(g); return b.steps; };
  test("a zone costs more steps than UTC for the same text", () => {
    expect(steps(dated(100), { tz: "America/Los_Angeles", workdays: "on" })).toBeGreaterThan(2 * steps(dated(100), { tz: "UTC", workdays: "on" }));
  });
  test("twice the lines in a zone cost at most about twice", () => {
    for (const n of [50, 200, 800]) { const r = steps(dated(2 * n), { tz: "Asia/Kolkata", workdays: "on" }) / steps(dated(n), { tz: "Asia/Kolkata", workdays: "on" }); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("one part budget runs out in a zone where it holds in UTC", () => {
    const body = dated(100), attrs = { workdays: "on" };
    const used = (tz: string) => { const b = big(); get(body, { ...attrs, tz }, NOCAP as typeof LIMITS, b); return b.steps; };
    const mid = (used("UTC") + used("America/Los_Angeles")) / 2;
    expect(used("America/Los_Angeles")).toBeGreaterThan(used("UTC") * 1.5);
    const lim = () => new Budget({ steps: mid, values: 1e9, chars: 1e9 }, null, null, "the gantt part");
    expect(() => get(body, { ...attrs, tz: "UTC" }, NOCAP as typeof LIMITS, lim())).not.toThrow();
    expect(() => get(body, { ...attrs, tz: "America/Los_Angeles" }, NOCAP as typeof LIMITS, lim())).toThrow(BudgetError);
  });
  test("a page of gantts in a zone is cut off by the page cap, quickly", () => {
    const one = "```gantt tz=America/Los_Angeles workdays=on\n" + dated(100) + "\n```\n";
    const t = performance.now();
    const doc = parse(Array(64).fill(one).join("\n"), { limits: UNTRUSTED_LIMITS });
    expect(performance.now() - t).toBeLessThan(1500);
    expect(doc.blocks.some((b) => b.type === "error")).toBe(true);
  });
});

describe("gantt: the layout", () => {
  const g = get(G, { today: "2026-12-09" }), s0 = scheduleGantt(g, 0);
  test("one height at every width, so the box is the same before and after the script", () => {
    const wide = layoutGantt(g, s0, 1000, null), phone = layoutGantt(g, s0, 390, null), first = layoutGantt(g, s0, 760, null);
    expect(wide.phone).toBe(false); expect(phone.phone).toBe(true);
    expect(phone.totalH).toBe(wide.totalH); expect(first.totalH).toBe(wide.totalH);
    expect(wide.rows.filter((r) => r.kind === "task").length).toBe(5);
    expect(wide.rows.filter((r) => r.kind === "section").length).toBe(2);
  });
  test("the scale: the whole span fits the width, or the chosen scale keeps its own width; weekends only by day", () => {
    const auto = layoutGantt(g, s0, 1000, null);
    expect(auto.timeW).toBeLessThanOrEqual(1000);
    const day = layoutGantt(g, s0, 1000, "day"), month = layoutGantt(g, s0, 1000, "month");
    expect(day.ppd).toBe(32); expect(month.ppd).toBe(5);
    expect(day.weekends.length).toBeGreaterThan(0); expect(month.weekends).toEqual([]);
    expect(layoutGantt(g, s0, 390, null).timeW).toBeLessThanOrEqual(390);
  });
  test("a very long span draws few ticks and no weekend bands, however the scale is chosen", () => {
    const long = { ...g, extent: { min: Date.UTC(2026, 0, 1), max: Date.UTC(2026, 0, 1) + 3600 * DAY } };
    const l = layoutGantt(long, s0, 1000, "day");
    expect(l.ticks.t.length).toBeLessThanOrEqual(200 * 4);
    expect(l.weekends).toEqual([]);
    expect(l.timeW).toBe(Math.ceil(l.days * 32));
  });
  test("a layout pays from the budget it is given", () => {
    const b = new Budget({ steps: 10, values: 1e9, chars: 1e9 }, null, null, "the gantt part");
    expect(() => layoutGantt(g, s0, 1000, "day", b)).toThrow(BudgetError);
  });
});

describe("gantt: drawn", () => {
  const stage = (width: number) => ({ width, theme: "light" as const, motion: "on" as const, report() {} });
  const draw = (text: string, attrs: Record<string, string> = {}, stp?: string | false, width = 1000) => {
    const data = get(text, attrs);
    const block = { type: "gantt", id: null, line: 1, attrs, llm: null, llmKind: "own" as const, data };
    return renderToStaticMarkup(React.createElement(GanttView, { data, block, ui: UI.en, static: stp, stage: stage(width) }));
  };
  const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
  test("a bar per task, a diamond for a milestone, an arrow per `after`, the today line, the three scale buttons", () => {
    const html = draw(G, { title: "Release 2.0", today: "2026-12-09" });
    expect(count(html, /data-dh-slot="task"/g)).toBe(5);
    expect(count(html, /data-dh-slot="milestone"/g)).toBe(1);
    expect(count(html, /data-dh-slot="bar"/g)).toBe(4);
    expect(count(html, /class="gt-dep"/g)).toBe(5); // design>api, design>ui, api>beta, ui>beta, beta>launch
    expect(html).toContain('data-dh-slot="today"');
    for (const w of ["Day", "Week", "Month"]) expect(html).toContain(`>${w}</button>`);
    expect(html).toContain("var(--c2)"); // the second section's own colour
    expect(html).toContain("var(--warn)");
    expect(html).toContain('data-dh-slot="progress"');
    expect(html).toContain("Release 2.0");
    expect(html).toContain(">Waits for</th>");
  });
  test("a phone puts the names above the bars", () => {
    const wide = draw(G, {}, undefined, 1000), phone = draw(G, {}, undefined, 390);
    expect(wide).toContain('class="gantt-names"'); expect(phone).not.toContain('class="gantt-names"');
    expect(count(phone, /class="gt-name"/g)).toBe(5);
    expect(phone).toContain("is-phone");
  });
  test("steps: the control row and the first step's tasks", () => {
    const html = draw(`${G}\n@step plan\n@step more\nextra "Extra" after launch 2d`);
    expect(count(html, /data-dh-slot="task"/g)).toBe(5);
    expect(html).toContain("plan");
  });
  test("static: one step whole, no scale buttons, no hint, no motion", () => {
    const html = draw(`${G}\n@step plan\n@step more\nextra "Extra" after launch 2d`, {}, "");
    expect(count(html, /data-dh-slot="task"/g)).toBe(6); // the last step
    expect(html).not.toContain("gantt-bar");
    expect(html).not.toContain("gantt-hint");
    expect(html).toContain("data-dh-static");
  });
  test("a gantt that cannot be read says why and draws nothing", () => {
    const html = draw(`a "A" after nobody 2d`);
    expect(html).toContain("This gantt cannot be drawn:");
    expect(html).toContain("no task");
    expect(html).not.toContain("<svg");
  });
  test("before the first measure (width 0) it draws at a sensible width", () => {
    expect(count(draw(G, {}, undefined, 0), /data-dh-slot="task"/g)).toBe(5);
  });
  test("each gantt's arrowhead has an id of its own", () => {
    const ids = (html: string) => [...html.matchAll(/<marker id="(gtarrow[^"]*)"/g)].map((m) => m[1]);
    const one = ids(draw(G))[0];
    expect(one).toMatch(/^gtarrow/);
    expect(one).not.toContain(":");
  });
  test("the grid's height follows the rows (a task row is 52 px, a section row 28)", () => {
    const g = get(G), l = layoutGantt(g, scheduleGantt(g, 0), 1000, null);
    expect(l.totalH).toBe(GANTT.head + 5 * GANTT.row + 2 * GANTT.section + 6);
  });
});

describe("gantt: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every gantt drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "gantt").length).toBeGreaterThan(0);
      for (const b of doc.blocks) if (b.type === "gantt") expect(scheduleGantt(b.data, Math.max(0, b.data.steps.length - 1)).length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a line, in both sets, quickly`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const t0 = performance.now();
        const doc = parse(text, { path: f, limits });
        const errs = check(doc).filter((p) => p.level === "error");
        expect(performance.now() - t0).toBeLessThan(3000);
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((p) => p.line >= 1)).toBe(true);
        // every gantt of the file is refused (none is drawn)
        const blocks = doc.blocks.filter((b) => b.type === "gantt");
        for (const b of blocks) if (b.type === "gantt") expect(b.data.errors.length).toBeGreaterThan(0);
      }
    });
  }
});

test("the definition matches its folder", () => {
  expect(gantt.name).toBe("gantt");
  expect(gantt.steps).toBe(true);
  expect(gantt.llmKind).toBe("own");
  expect(gantt.dependencies ?? []).toEqual([]);
});
