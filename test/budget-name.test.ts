// A part budget can carry the part's name, so a refusal says what ran out ("the jq query"); without a name the wording
// stays exactly as before.
import { describe, expect, test } from "bun:test";
import { Budget, BudgetError, pageBudget, partBudget, withBudget } from "../src/core/budget";

const over = (b: Budget) => { try { b.charge(1e12); } catch (e) { return e as BudgetError; } throw new Error("no refusal"); };

describe("budget: the part's name in its refusal", () => {
  test("no name: the same words as before", () => {
    expect(over(partBudget()).message).toBe("the expressions do too much work (the limit for one part is 100,000 steps)");
    expect(over(pageBudget().part()).message).toBe("the expressions do too much work (the limit for one part is 100,000 steps)");
  });
  test("a named part budget says what ran out, for a reader's action and inside parse()", () => {
    expect(over(partBudget("the jq query")).message).toBe("the jq query does too much work (the limit for one part is 100,000 steps)");
    const page = pageBudget();
    const e = withBudget(page, () => over(partBudget("the sankey layout")));
    expect(e.message).toBe("the sankey layout does too much work (the limit for one part is 100,000 steps)");
    expect(e.page).toBe(false);
  });
  test("the page's own refusal keeps its words whatever the part is called", () => {
    const page = pageBudget();
    const parts = [page.part("a"), page.part("b"), page.part("c"), page.part("d")];
    let msg = "";
    try { for (const p of parts) p.charge(99_000); } catch (e) { msg = (e as BudgetError).message; }
    expect(msg).toBe("the expressions on this page do too much work (the limit for the whole page is 300,000 steps); this part and the ones after it are not evaluated");
  });
});

test("each counter's words for a named part", () => {
  const b = partBudget("the data explorer");
  try { b.charge(0, 1e9); } catch (e) { expect((e as BudgetError).message).toBe("the data explorer makes too many values (the limit for one part is 50,000 values)"); }
  const c = partBudget("the maths");
  try { c.charge(0, 0, 1e9); } catch (e) { expect((e as BudgetError).message).toBe("the maths makes too much text (the limit for one part is 50,000 characters)"); }
  expect.assertions(2);
});
