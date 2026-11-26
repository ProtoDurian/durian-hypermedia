// Test helper (lane L-time): reads a composed-stage fixture and builds, by hand, the Model the parse lane will hand the
// timeline layout: the time words as layout words (verbatim), everything else left out. Until the parse lane lands.
import { readFileSync } from "node:fs";
import type { Fact, Model, Step } from "../../../src/engine/types";
import { SETUP_WORDS, STEP_WORDS } from "../../../src/engine/layouts/time/words";

export type Fence = { file: string; head: string; steps: { title: string; raw: string; line: number }[]; roles: Record<string, number>; base: number };

/** the first ```animation fence of a fixture file, with the page's roles */
export function loadFence(file: string, nth = 0): Fence {
  const text = readFileSync(file, "utf8"), all = text.split("\n");
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "", roles: Record<string, number> = {};
  const flow = /^roles:\s*\{(.*)\}\s*$/m.exec(fm)?.[1];
  if (flow) for (const m of flow.matchAll(/([\w-]+):\s*c(\d)/g)) roles[m[1]] = +m[2];
  let inRoles = false;
  for (const l of fm.split("\n")) {
    if (/^roles:\s*$/.test(l)) { inRoles = true; continue; }
    if (inRoles) { const m = /^\s+([\w-]+):\s*c(\d)\s*$/.exec(l) ?? /^\s+([\w-]+):\s*\{[^}]*colour:\s*c(\d)/.exec(l); if (m) roles[m[1]] = +m[2]; else if (/^\S/.test(l)) inRoles = false; }
  }
  let seen = -1, start = -1, end = -1;
  for (let i = 0; i < all.length; i++) {
    if (start < 0 && /^```animation\b/.test(all[i]) && ++seen === nth) start = i + 1;
    else if (start >= 0 && /^```\s*$/.test(all[i])) { end = i; break; }
  }
  if (start < 0) throw new Error(`no animation fence #${nth} in ${file}`);
  const body = all.slice(start, end), headLines: string[] = [], steps: Fence["steps"] = [];
  body.forEach((raw, i) => {
    const m = /^@step\s+(.*)$/.exec(raw);
    if (m) steps.push({ title: m[1], raw: "", line: start + 1 + i + 1 });
    else if (steps.length) steps.at(-1)!.raw += (steps.at(-1)!.raw ? "\n" : "") + raw;
    else headLines.push(raw);
  });
  return { file, head: headLines.join("\n"), steps, roles, base: start + 1 };
}

const SPELL = [...SETUP_WORDS].sort((a, b) => b.length - a.length);
const startsSpelling = (t: string) => SPELL.find((s) => t === s || t.startsWith(s + " ") || t.startsWith(s + ":"));

/** a Model holding only what the timeline layout reads: its layout words, the step titles, the roles */
export function timeModel(f: Fence): Model {
  const layoutWords: Model["layoutWords"] = { timeline: [] };
  let inTime = false, line = f.base;
  const lines = f.head.split("\n");
  lines.forEach((raw, i) => {
    const t = raw.trim(); line = f.base + i;
    if (!t || t.startsWith("//") || /^\s/.test(raw)) return;
    const sp = startsSpelling(t);
    if (!sp) return;
    if (sp === "time") inTime = true;
    if (!inTime) return;
    const rest = t.slice(sp.length).replace(/^[: ]\s*/, "");
    layoutWords.timeline.push({ word: sp, arg: rest, body: [], src: { line } });
  });
  const steps: Step[] = f.steps.map((s) => {
    const facts: Fact[] = [];
    s.raw.split("\n").forEach((raw, i) => {
      const t = raw.trim(); if (!t || /^\s/.test(raw)) return;
      const m = /^(keep\s+)?([a-z]+)\b[:]?\s*(.*)$/.exec(t);
      if (!m || !STEP_WORDS.includes(m[2])) return;
      facts.push({ k: "layout", word: m[1] ? `keep ${m[2]}` : m[2], arg: m[3], body: [], src: { line: s.line + 1 + i } });
    });
    const [title, ...cap] = s.title.split(": ");
    return { title, caption: cap.join(": ") || title, facts, src: { line: s.line } };
  });
  return {
    format: 12, origin: "stage11", title: null, note: null, look: "stage", view: "2d", layout: "timeline",
    roles: Object.fromEntries(Object.entries(f.roles).map(([k, v]) => [k, { colour: v, label: null }])),
    regions: [], things: {}, order: [], relations: {}, setup: [], steps, scenes: {}, fence: {}, layoutWords, problems: [],
  };
}
