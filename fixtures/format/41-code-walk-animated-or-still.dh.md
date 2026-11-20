---
title: "Code walk: animated or still"
description: A fixture made from the Format page section of the same name.
---

## Code walk: animated or still

A code walk has two modes. **Still** is for moving between different functions or files: the step's file is shown whole, the step's lines are open and marked, and the rest of the file is folded into a bar like "… 12 lines" that the reader can open. A move to the next step switches the marks and the folds at once, with no morph, because a morph between two different functions only confuses. **Animated** is for the same code changing, such as one function growing step by step: the lines morph into each other.

Nothing needs to be written: a move is animated when the next step is in the same file and its lines touch the lines of the step before; every other move is still. To say it, put `animate=on` or `animate=off` on the fence (every move) or on a `@step` line (the move into that step); `animate=auto` is the default.

Still: three steps across two files and three functions.

```codewalk
@file src/cart.ts
export function addItem(cart: Cart, item: Item): Cart {
  const found = cart.items.find((i) => i.sku === item.sku);
  if (found) {
    found.qty += item.qty;
    return cart;
  }
  return { ...cart, items: [...cart.items, item] };
}

export function removeItem(cart: Cart, sku: string): Cart {
  return { ...cart, items: cart.items.filter((i) => i.sku !== sku) };
}

export function total(cart: Cart): number {
  let sum = 0;
  for (const i of cart.items) sum += price(i) * i.qty;
  return sum;
}
@file src/price.ts
const RATES: Record<string, number> = { food: 0.05, book: 0, other: 0.2 };

export function price(item: Item): number {
  const tax = RATES[item.kind] ?? RATES.other;
  return Math.round(item.cents * (1 + tax));
}
@step src/cart.ts#L1-L8 focus=3-6
Adding an item that is already in the cart only raises its quantity.
@step src/cart.ts#L14-L18 focus=16
The total adds up one price for each item, times its quantity.
@step src/price.ts#L1-L6 focus=4-5
The price of one item is its cents plus the tax for its kind.
```

Animated: one function growing, one line at a time.

```codewalk
@file src/slug.ts
export function slugify(title: string): string {
  const lower = title.toLowerCase();
  const words = lower.split(/[^a-z0-9]+/);
  const clean = words.filter(Boolean);
  return clean.join('-');
}
@step src/slug.ts#L1-L2 focus=2
Start with the lower-case title.
@step #L1-L3 focus=3
Split it at anything that is not a letter or a digit.
@step #L1-L4 focus=4
Splitting can leave empty words at the edges; drop them.
@step #L1-L5 focus=5
Join the words with dashes.
```
