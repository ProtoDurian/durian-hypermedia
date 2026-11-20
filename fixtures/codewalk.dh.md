---
title: Code walk with made-up code
description: A code walk whose code is written in the page (@file), animated within one function and still between files.
---

# Code walk

```codewalk
@file src/cart.ts
export function total(items: { price: number; qty: number }[]) {
  let sum = 0;
  for (const it of items) sum += it.price * it.qty;
  return sum;
}

export function withTax(sum: number, rate = 0.2) {
  return Math.round(sum * (1 + rate) * 100) / 100;
}
@file src/checkout.ts
import { total, withTax } from './cart';

export function checkout(items: { price: number; qty: number }[]) {
  const sum = total(items);
  return { sum, due: withTax(sum) };
}
@step src/cart.ts#L1-L5 focus=3
The total adds price times quantity for every item.
@step src/cart.ts#L1-L5 focus=4
Then it returns the sum. Press :kbd[Right] for the next step.
@step src/checkout.ts#L3-L6 focus=4-5
Checkout calls both: a move to another file is still, not animated.
```
