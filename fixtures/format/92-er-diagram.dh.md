---
title: "ER: tables and their keys"
description: An entity-relationship diagram with crow's-foot lines from key to key (SPEC 3.2 ER). Shown live, then static.
---

## ER: tables and their keys

An `er` part draws tables with their keys and joins them with crow's-foot lines, each from the key to what it points at. A step may light a table or a column.

```er title="Shop"
entity customer "Customer" [c1]
  id uuid pk
  email text unique
entity order "Order" [c2]
  id uuid pk
  customer_id uuid fk -> customer.id
  placed_at timestamptz
entity line "Order line" [c2]
  order_id uuid fk -> order.id
  product text
  quantity int
customer 1 -- 0..* order "places"
order 1 -- 1..* line "holds"
@step Start from the customer's key.
highlight customer.id
@step Each order keeps it as customer_id.
highlight customer.id order.customer_id
@step Each line of an order keeps the order's key.
highlight order.id line.order_id
```


The same diagram, static:

```er static=true title="Shop, static"
entity customer "Customer" [c1]
  id uuid pk
  email text unique
entity order "Order" [c2]
  id uuid pk
  customer_id uuid fk -> customer.id
  placed_at timestamptz
entity line "Order line" [c2]
  order_id uuid fk -> order.id
  product text
  quantity int
customer 1 -- 0..* order "places"
order 1 -- 1..* line "holds"
@step Start from the customer's key.
highlight customer.id
@step Each order keeps it in `customer_id`.
highlight customer.id order.customer_id
@step Each line of an order keeps the order's key.
highlight order.id line.order_id
```
