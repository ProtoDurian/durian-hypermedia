// work: the layout work of an animation (play, lay out, route, place), counted, never timed, so the same page gives
// the same result everywhere. One unit is about one small step of a loop (some 30 ns in Bun); the code charges a
// pass's units as it goes, in pieces of at most CHUNK, to the budget of the animation being compiled (core/budget.ts).
//
// parse() makes one animation budget for the whole page (animPageBudget) and every animation compiles under a part of
// it (animPartBudget), so no animation, and no later animation, can restart the spend. Animations get caps of their
// own (maxAnimWork, maxPageAnimWork), not the expressions' caps: laying out one ordinary scene takes far more small
// steps than evaluating one chart. A compile outside parse() (the renderer, a tool) gets a fresh part budget.
// Going over throws a BudgetError (from the budget); the caller turns it into an error block and a problem.
import { Budget, BudgetError } from "./budget";
import { LIMITS, type Limits } from "../safety";

const CHUNK = 1 << 14;
let cur: Budget | null = null;
let owed = 0;
let total = 0;
// what this compile has already paid for (a cache hit of work done earlier in the same compile costs nothing more)
let paid = new Set<string>();

/** Count n units of work. Charged to the running budget once CHUNK units are owed (and when the compile ends). */
export function work(n: number): void {
  if (!(n >= 0)) n = CHUNK; // (a length that is not a number still costs)
  total += n;
  if (!cur) return;
  owed += n;
  if (owed >= CHUNK) { const k = owed; owed = 0; cur.charge(k); }
}
/** Every unit counted in this process so far: a cache keeps what a result cost and charges it again on a hit. */
export const workTotal = (): number => total;
/** True the first time key is seen in the running compile (or parse() call): then a cache hit is charged in full. */
export function firstTime(key: string): boolean { if (paid.has(key)) return false; paid.add(key); return true; }

const NO_MORE = Number.MAX_SAFE_INTEGER;
const limitsOf = (steps: number) => ({ steps, values: NO_MORE, chars: NO_MORE });
/** The animation budget of a whole page: one per parse() call. */
export const animPageBudget = (l: Limits = LIMITS): Budget => new Budget(limitsOf(l.maxPageAnimWork), limitsOf(l.maxAnimWork));

// the page's animation budget while parse() runs (parse() is synchronous: one at a time; nested calls stack)
let ambient: Budget | null = null;
/** Run fn with b as the page's animation budget. */
export function withAnimBudget<T>(b: Budget, fn: () => T): T {
  const before = ambient;
  ambient = b;
  try { return metered(b, fn); } finally { ambient = before; }
}
/** A budget for one animation: from the running parse() call's page budget, or a fresh one (the renderer, a tool) of
 *  OUTSIDE times one animation's cap: a block parse() accepted draws its wide layout within the cap, and its phone and
 *  narrow layouts may take a few times that (the heaviest fixture's phone layout: 3.4 times its wide one). */
export const OUTSIDE = 2;
export const animPartBudget = (): Budget => (ambient ? ambient.part() : new Budget(limitsOf(LIMITS.maxAnimWork * OUTSIDE)));

/** Run fn with its work charged to b (and every budget above b). What is still owed is charged before it returns. */
export function metered<T>(b: Budget, fn: () => T): T {
  const was = cur, wasOwed = owed, wasPaid = paid;
  cur = b; owed = 0; paid = new Set();
  try {
    const out = fn();
    const k = owed; owed = 0; if (k) b.charge(k);
    return out;
  } finally { cur = was; owed = wasOwed; paid = wasPaid; }
}

/** Run fn with its work counted but charged to no budget: only for work a compile already paid for (the LLM view
 *  plays the story of a compiled scene again, at most about what the compile's own play cost). */
export function unmetered<T>(fn: () => T): T {
  const was = cur, wasOwed = owed;
  cur = null; owed = 0;
  try { return fn(); } finally { cur = was; owed = wasOwed; }
}

/** What to tell the author when an animation's budget ran out: this animation, or the page (the ones after it too). */
export function animOverMessage(e: unknown, l: Limits = LIMITS): string | null {
  if (!(e instanceof BudgetError)) return null;
  const fmt = (n: number) => n.toLocaleString("en-US");
  return ambient?.spent
    ? `the animations on this page need too much layout work (the limit for the whole page is ${fmt(l.maxPageAnimWork)} units); this animation and the ones after it are not drawn`
    : `this animation needs too much layout work (the limit for one animation is ${fmt(l.maxAnimWork)} units); show fewer things, lines or steps, or split it into two animations`;
}
