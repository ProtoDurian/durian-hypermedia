// chart-work: the budget and the caps the chart helpers (chart11, pagecharts, chart-time) pay from. Inside one chart's
// check or evaluation (withChartBudget) every loop charges that one part budget, so a chart cannot restart the spend; a
// call outside (the browser drawing a tick, a test) gets a fresh part budget of its own.
import { type Budget, currentBudget, partBudget } from "./budget";
import { LIMITS, type Limits } from "../safety";

let cur: Budget | null = null;
/** the budget the running chart work pays from */
export const bud = (): Budget => cur ?? partBudget();
/** Run fn with one part budget (the running parse() call's page budget, or a fresh one) for everything it charges. */
export function withChartBudget<T>(fn: () => T): T {
  if (cur) return fn();
  cur = partBudget();
  try { return fn(); } finally { cur = null; }
}
/** the caps of the running parse() or check() call, else LIMITS */
export const lim = (): Limits => currentBudget()?.lim ?? LIMITS;
/** pay for work before doing it: steps, values kept, characters made */
export const charge = (steps: number, values = 0, chars = 0): void => bud().charge(steps, values, chars);
