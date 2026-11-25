---
title: "Class: types and how they relate"
description: A class diagram drawn from members and relations written in words (SPEC 3.2 Class). Shown whole, then static.
---

## Class: types and how they relate

A `class` part draws classes from their members and from relations written in words: `extends`, `implements`, `owns`, `has`, `uses` and `->`.

```class title="Orders"
class Order note="An order is written once, at check out."
  + id: OrderId
  + total(): Money
  - lines: Line[]
class Line
  + quantity: int
interface Payable
  + pay(amount: Money): Receipt
abstract class Shape
enum Status: open, paid, shipped
Order implements Payable
Order owns 1..* Line
Order has 1 Status
Circle extends Shape
Order uses Clock
Order 0..* -> 1 Customer "placed by"
```


The same diagram, static:

```class static=true title="Orders, static"
class Order note="An order is written once, at check out."
  + id: OrderId
  + total(): Money
  - lines: Line[]
class Line
  + quantity: int
interface Payable
  + pay(amount: Money): Receipt
abstract class Shape
enum Status: open, paid, shipped
Order implements Payable
Order owns 1..* Line
Order has 1 Status
Circle extends Shape
Order uses Clock
Order 0..* -> 1 Customer "placed by"
```
