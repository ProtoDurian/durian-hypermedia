// bun run bench: parse() on typical replies of 1, 10 and 100 KB (mixed, and prose only), against a time and a memory
// budget per KB. Exit 1 when a budget is passed.
//   time: the median of many warm parses
//   peak: how much the process grows (its largest resident size) during the first parse of the text, after a warm-up
//         on other text, in a fresh process per text (the parser's working memory, not what it keeps)
//   held: the heap the Document keeps, after a full collection
// The budgets are about 4 times (time) and 3 times (memory) what the machine that made 0.6.2 measured while busy, so a
// slower runner passes and text that is no longer linear does not (0.6.0 takes about 10 ms/KB on 100 KB of prose).
import { mixed, only } from "../test/text-gen";

type Kind = "mixed" | "prose";
const text = (kind: Kind, kb: number) => (kind === "mixed" ? mixed(kb * 1024) : only("prose", kb * 1024));
const KINDS: Kind[] = ["mixed", "prose"], SIZES = [1, 10, 100];
// per KB of text, at each size (a small text pays a fixed cost, so its budget per KB is larger)
// measured for 0.6.2 (busy machine; the larger of mixed and prose): time 0.23, 0.18, 0.21 ms/KB; peak 0.36, 0.095,
// 0.033 MB/KB; held 0.013, 0.010, 0.011 MB/KB
const BUDGET: Record<number, { ms: number; peakMb: number; heldMb: number }> = {
  1: { ms: 0.9, peakMb: 1.2, heldMb: 0.05 },
  10: { ms: 0.8, peakMb: 0.3, heldMb: 0.03 },
  100: { ms: 0.8, peakMb: 0.1, heldMb: 0.03 },
};

const MB = 2 ** 20;
// Linux: the process's largest resident size can be reset (clear_refs 5) and read (VmHWM), so the peak of one parse is
// measured from where the process is now; elsewhere the largest size so far (which a warm-up may already have set)
import { readFileSync, writeFileSync } from "node:fs";
const procKb = (key: string) => { const m = new RegExp(`^${key}:\\s+(\\d+) kB`, "m").exec(readFileSync("/proc/self/status", "utf8")); return m ? +m[1] * 1024 : NaN; };
const linux = (() => { try { writeFileSync("/proc/self/clear_refs", "5"); return Number.isFinite(procKb("VmHWM")); } catch { return false; } })();
const peakStart = () => { if (linux) { writeFileSync("/proc/self/clear_refs", "5"); return procKb("VmRSS"); } return process.resourceUsage().maxRSS * 1024; };
const peakNow = () => (linux ? procKb("VmHWM") : process.resourceUsage().maxRSS * 1024);
async function memory(kind: Kind, kb: number): Promise<{ peak: number; held: number }> {
  const { heapStats } = await import("bun:jsc");
  const { parse } = await import("../src/index");
  // warm up on small other text, so the first-time cost of compiling the parser's code is not counted and the
  // process's largest size so far stays small
  for (let i = 0; i < 200; i++) { parse(mixed(1500), { frontMatter: false }); parse(only("prose", 1500), { frontMatter: false }); }
  const s = text(kind, kb);
  Bun.gc(true); Bun.gc(true);
  const m0 = peakStart(), h0 = heapStats().heapSize;
  const d = parse(s, { frontMatter: false });
  const peak = (peakNow() - m0) / MB;
  Bun.gc(true); Bun.gc(true);
  const held = (heapStats().heapSize - h0) / MB;
  if (!d.blocks.length) throw new Error("nothing parsed");
  return { peak, held };
}

if (process.argv[2] === "--memory") {
  // one fresh process per text (called below)
  console.log(JSON.stringify(await memory(process.argv[3] as Kind, +process.argv[4])));
  process.exit(0);
}

const { parse } = await import("../src/index");
for (let i = 0; i < 30; i++) parse(mixed(10_240), { frontMatter: false });
const median = (s: string) => {
  const a: number[] = [];
  const until = performance.now() + 1000;
  while (a.length < 15 || (a.length < 2000 && performance.now() < until)) { const t = performance.now(); parse(s, { frontMatter: false }); a.push(performance.now() - t); }
  a.sort((x, y) => x - y);
  return a[a.length >> 1];
};
const rows: string[] = ["| text | time ms (per KB) | peak MB (per KB) | held MB (per KB) |", "| --- | --- | --- | --- |"];
let over = 0;
for (const kind of KINDS) for (const kb of SIZES) {
  const s = text(kind, kb), k = s.length / 1024, ms = median(s);
  // memory: the middle of 3 fresh processes (a process's resident size moves in steps)
  const runs: { peak: number; held: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const p = Bun.spawnSync([process.execPath, import.meta.path, "--memory", kind, String(kb)], { stdout: "pipe", stderr: "inherit", env: { ...process.env } });
    runs.push(JSON.parse(p.stdout.toString().trim().split("\n").pop()!));
  }
  const mid = (x: number[]) => x.sort((a, b) => a - b)[1];
  const peak = mid(runs.map((r) => r.peak)), held = mid(runs.map((r) => r.held));
  const b = BUDGET[kb], bad: string[] = [];
  if (ms / k > b.ms) bad.push(`time ${(ms / k).toFixed(3)} ms/KB > ${b.ms}`);
  if (peak / k > b.peakMb) bad.push(`peak ${(peak / k).toFixed(3)} MB/KB > ${b.peakMb}`);
  if (held / k > b.heldMb) bad.push(`held ${(held / k).toFixed(4)} MB/KB > ${b.heldMb}`);
  over += bad.length;
  rows.push(`| ${kind} ${kb} KB | ${ms.toFixed(2)} (${(ms / k).toFixed(3)}; budget ${b.ms}) | ${peak.toFixed(1)} (${(peak / k).toFixed(3)}; budget ${b.peakMb}) | ${held.toFixed(2)} (${(held / k).toFixed(4)}; budget ${b.heldMb}) |${bad.length ? " OVER: " + bad.join(", ") : ""}`);
}
console.log(rows.join("\n"));
console.log(over ? `\n${over} budget(s) passed` : "\nevery budget holds");
process.exit(over ? 1 : 0);
