// budget: one deterministic work budget for everything a page computes from its author's text.
// Pure: no node modules, no clock. Work is counted, never timed, so the same page gives the same result everywhere.
//
// Three counters, all charged BEFORE the work or the allocation they pay for:
//   steps   units of work (one expression node, one list element visited, one token read)
//   values  value slots kept in memory: one element of a list (a number, a boolean, a string or a list inside it),
//           counted as the list holds them, so a list shared ten times counts ten times. About 8 to 16 bytes each.
//   chars   characters of text made (UTF-16 code units, about 2 bytes each)
//
// parse() makes one page budget and every part draws from it (budget.part()), so no part, and no later part, can
// restart the spend. A reader's own action (a control moved, a query run) gets a fresh part budget of its own.
// Going over throws a BudgetError; the caller turns it into an error block and a problem for that part.
import { LIMITS, type Limits } from "../safety";

export interface BudgetLimits { steps: number; values: number; chars: number }

export class BudgetError extends Error {
  /** true when the page's budget (not one part's) ran out */
  constructor(message: string, readonly page = false) { super(message); }
}

const WORDS: Record<keyof BudgetLimits, [string, string]> = {
  steps: ["do too much work", "steps"],
  values: ["make too many values", "values"],
  chars: ["make too much text", "characters"],
};
const fmt = (n: number) => n.toLocaleString("en-US");

export class Budget {
  steps = 0;
  values = 0;
  chars = 0;
  /** the limits a page budget was made from (parse options or LIMITS), for checks that are not counters */
  lim: Limits | null = null;
  /** the message of the first overrun; once set, every later charge fails with it */
  spent: string | null = null;
  /** a page budget: it has part limits and no parent */
  get isPage(): boolean { return !this.parent && !!this.partLimits; }
  constructor(
    readonly limits: BudgetLimits,
    /** what part() gives each part; a page budget sets it, a part budget has none */
    readonly partLimits: BudgetLimits | null = null,
    readonly parent: Budget | null = null,
  ) {}

  /** Pay for work before doing it. Throws a BudgetError when this budget or one above it would go over. */
  charge(steps: number, values = 0, chars = 0): void {
    for (let x: Budget | null = this; x; x = x.parent) {
      if (x.spent) throw new BudgetError(x.spent, x.isPage);
      x.steps += steps; x.values += values; x.chars += chars;
      const L = x.limits;
      if (x.steps > L.steps || x.values > L.values || x.chars > L.chars) x.fail();
    }
  }
  private fail(): never {
    const L = this.limits;
    const over: keyof BudgetLimits = this.steps > L.steps ? "steps" : this.values > L.values ? "values" : "chars";
    const [verb, unit] = WORDS[over];
    this.spent = !this.isPage
      ? `the expressions ${verb} (the limit for one part is ${fmt(L[over])} ${unit})`
      : `the expressions on this page ${verb} (the limit for the whole page is ${fmt(L[over])} ${unit}); this part and the ones after it are not evaluated`;
    throw new BudgetError(this.spent, this.isPage);
  }

  /** A budget for one part that also draws from this one. Throws if this one is already spent. */
  part(): Budget {
    if (this.spent) throw new BudgetError(this.spent, this.isPage);
    for (let b = this.parent; b; b = b.parent) if (b.spent) throw new BudgetError(b.spent, b.isPage);
    return new Budget(this.partLimits ?? this.limits, null, this);
  }
}

/** The caps of one part, and of a whole page, from the Limits (parse options or LIMITS). */
export const partLimitsOf = (l: Limits = LIMITS): BudgetLimits => ({ steps: l.maxEvalSteps, values: l.maxEvalValues, chars: l.maxEvalChars });
export const pageLimitsOf = (l: Limits = LIMITS): BudgetLimits => ({ steps: l.maxPageEvalSteps, values: l.maxPageEvalValues, chars: l.maxPageEvalChars });
/** A page budget: one per parse() (or check()) call. */
export const pageBudget = (l: Limits = LIMITS): Budget => { const b = new Budget(pageLimitsOf(l), partLimitsOf(l)); b.lim = l; return b; };

// the page budget of the parse() call running now (parse() is synchronous, so one at a time; nested calls stack)
let ambient: Budget | null = null;
/** Run fn with b as the page budget that partBudget() draws from. */
export function withBudget<T>(b: Budget, fn: () => T): T {
  const before = ambient;
  ambient = b;
  try { return fn(); } finally { ambient = before; }
}
export const currentBudget = (): Budget | null => ambient;
/** A budget for one part: from the running parse() call's page budget, or a fresh one (a reader's action, a direct call). */
export const partBudget = (): Budget => (ambient ? ambient.part() : new Budget(partLimitsOf(LIMITS)));
