// The 7 design examples in format 12, made-up content, read by the test builder into Models.
import type { Model } from "../../../src/engine/types";
import { build } from "./build";

export const A_REBASE = `
plain a [circle]: A
plain b [circle]: B
plain c [circle]: C
plain d [circle]: D
plain e [circle]: E
plain d2 [circle]: D'
ref main [ref]: main
ref feat [ref]: topic
a -> b
b -> c
c -> d
b -> e
e -> d2
main at e
@step Fork: the topic branch starts at D.
feat at d
@step Copy: D is copied onto main as D'.
show d2
@step Move the label: the topic label moves to D'.
feat at d2
dim c,d
`;

export const B_TCP = `
plain c: client
plain r: router
plain s: server
@step SYN: the client sends SYN.
c -> r: SYN seq 100
c is SYN-SENT
s is LISTEN
@step Lost: the router's queue is full.
r -x s: SYN seq 100
say r: queue full, SYN dropped
@step SYN-ACK: the retry gets through.
s is SYN-RECEIVED
@step ACK: both ends are connected.
c,s is ESTABLISHED
tone c,s good
`;

export const C_MERGESORT = `
layout: tree
split s [array]: 5 2 8 1 9 3 7 4
  split h1 [array]: 5 2 8 1
    split q1 [array]: 5 2
    split q2 [array]: 8 1
  split h2 [array]: 9 3 7 4
    split q3 [array]: 9 3
    split q4 [array]: 7 4
@step Split: the list splits in two.
show h1,h2
@step Split again: each half splits in two.
show q1..q4
@step Sort pairs: each pair is put in order.
q1 = 2 5
q2 = 1 8
q3 = 3 9
q4 = 4 7
@step Merge pairs: pairs merge into sorted halves.
h1 = 1 2 5 8 from q1,q2
h2 = 3 4 7 9 from q3,q4
@step Merge halves: the halves merge.
s = 1 2 3 4 5 7 8 9 from h1,h2
tone s good
`;

export const D_BUDGET = `
plain acc: account | 3,200
plain rent: rent
out spent [chart bar values]: spent in March | dollars
  x: rent, food, travel, fun, saved
@step Rent: the rent goes out first.
acc -> rent: 1,300
acc is 1,900
spent = 1300 0 0 0 0
@step Food: then food.
acc is 1,350
spent = 1300 550 0 0 0
`;

export const E_BST = `
layout: tree
plain n8 [circle]: 8
  plain n3 [circle]: 3
    plain n1 [circle]: 1
    plain n6 [circle right]: 6
  plain n10 [circle right]: 10
    plain n14 [circle right]: 14
plain k [token]: 6
@step Start: Insert 6. 6 is less than 8, so go left.
show k
k at n8
light n8
@step Right: 6 is more than 3, so go right.
k at n3
light n3
@step Insert: 3 has no right child: 6 goes there.
show n6
hide k
tone n6 good
@step The order holds: every left child is smaller.
`;

export const F_REGIONS = `
layout: layers
## us-east
user u1 [person]: user in Virginia
db db1 [cylinder]: primary | takes every write
## eu-west
db db2 [cylinder]: copy in Paris
## ap-south
db db3 [cylinder]: copy in Mumbai
db1 --> db2, db3 (copy): copies
db1,db2,db3 is change 40
@step Write: a user writes to the primary.
u1 -> db1: write cart +1
db1 is change 41
@step Copy: the primary sends the change to both copies.
db1 -> db2, db3 (copy): change 41
@step Paris: Paris gets it first.
db2 is change 41
tone db2 good
@step Mumbai: Mumbai is further away, still at 40.
tone db3 warn
`;

export const G_COLUMNS = `
store returns [chart dots]: books returned each month | books
  x: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
@step First half: the first six months.
returns = 24 19 31 22 27 12
@step The year: the second half is busier.
returns = 24 19 31 22 27 12 9 11 28 30 26 35
light returns.Jul..Dec
`;

export const EXAMPLES: Record<string, () => Model> = {
  A: () => build(A_REBASE),
  B: () => build(B_TCP),
  C: () => build(C_MERGESORT),
  D: () => build(D_BUDGET),
  E: () => build(E_BST),
  F: () => build(F_REGIONS, { view: "3d" }),
  G: () => build(G_COLUMNS),
};
