// stage-budget: the composed stage's own layout budget (0.7.0).
// Pure: no node modules, no clock. Work is counted, never timed, so the same page lays out the same everywhere.
//
// The stage charges its layout work here as it goes (cards placed, routes tried, cells packed): `charge(what, work,
// memory)` with a short name for the refusal. One budget per page: each parse() call (its page budget, budget.ts)
// gets a fresh stage budget of its own, so a page cannot spend another page's room, and a stage outside a parse()
// (a direct call, a test) uses the module's own. Going over throws a BudgetError (budget.ts's class, so the caller
// turns it into an error block and a problem for that part, as for every other part).
import { BudgetError as PageBudgetError, currentBudget, type Budget as PageBudget } from "./budget";

/** Limits for the stages of one whole page. Units: work = steps (loop turns, routes tried, items placed); memory = items kept. */
export const DOC_WORK = 2_000_000;
export const DOC_MEMORY = 4_000_000;

export class BudgetError extends PageBudgetError {
  constructor(public what: string, public kind: "work" | "memory") {
    super(`${what} needs more ${kind === "work" ? "work" : "memory"} than a page may use; make the input smaller`, false);
  }
}

export type Budget = {
  /** charge `work` steps and `memory` units for `what` (a short name: "routes", "cell rows"); throws BudgetError when spent */
  charge(what: string, work: number, memory?: number): void;
  /** work and memory left */
  left(): { work: number; memory: number };
};

export function newBudget(work = DOC_WORK, memory = DOC_MEMORY): Budget {
  let w = work, m = memory;
  return {
    charge(what, dw, dm = 0) {
      w -= Math.max(0, dw);
      m -= Math.max(0, dm);
      if (w < 0) throw new BudgetError(what, "work");
      if (m < 0) throw new BudgetError(what, "memory");
    },
    left: () => ({ work: w, memory: m }),
  };
}

// one stage budget per page budget (one per parse() call); the module's own outside a parse()
const perPage = new WeakMap<PageBudget, Budget>();
let own: Budget = newBudget();
let override: Budget | null = null;

/** The stage budget of the page being parsed now. */
export const docBudget = (): Budget => {
  if (override) return override;
  const page = currentBudget();
  if (!page) return own;
  let b = perPage.get(page);
  if (!b) { b = newBudget(); perPage.set(page, b); }
  return b;
};
/** Use `b` as the stage budget from now on (a test's small budget, or a fresh one for a trial layout); returns it.
 *  With no argument outside a parse(), the module's own budget starts again. */
export function beginDocument(b?: Budget): Budget {
  if (b) { override = b; return b; }
  override = null; own = newBudget(); return own;
}
/** Stop using a budget set by beginDocument(b): the page's (or the module's own) applies again. */
export function endDocument(): void { override = null; }
/** Run fn with `b` as the stage budget (a trial layout's own), then go back to the one before, whatever it was. */
export function withStageBudget<T>(b: Budget, fn: () => T): T {
  const before = override;
  override = b;
  try { return fn(); } finally { override = before; }
}
