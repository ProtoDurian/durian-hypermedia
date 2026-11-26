---
title: "Editor"
description: A fixture made from the Format page section of the same name.
---

## Editor

A small IDE: the file tree on the left and one file pane. Files come from a repo at the page's pin, or are made up right here with `@file`. Each `@step` is an edit: `+` adds a line, `-` removes one, a space keeps one; `@@ <file>` picks the file.

This one is a made-up project, `pantry` (a command line tool that keeps track of what is on the kitchen shelves): folders up to four levels deep, 14 files from a few lines to over a hundred, and eleven edits across six folders. Pick a file in the tree, or step through the edits.

```editor
@file pantry/package.json
{
  "name": "pantry",
  "version": "0.3.0",
  "description": "Keep track of what is on the shelf",
  "type": "module",
  "bin": {
    "pantry": "./src/cli/main.ts"
  },
  "scripts": {
    "test": "bun test",
    "check": "tsc --noEmit"
  },
  "license": "MIT"
}
@file pantry/README.md
# pantry

A tiny command line tool for the kitchen.
It remembers what is on your shelves.

## Use

    pantry add "rice" 2kg --shelf cupboard
    pantry add "milk" 1l --shelf fridge
    pantry list
    pantry list --shelf fridge

Items live in `~/.pantry.json`. Delete the
file to start over.

## Commands

| command | what it does          |
| ------- | --------------------- |
| add     | put an item on a shelf |
| list    | show the items         |
| help    | show this table        |

## Develop

    bun install
    bun test
@file pantry/src/index.ts
// What other programs can import.

export { Store } from './core/store';
export { isShelf, describe } from './core/item';
export { convert, tidy, parseQty } from './core/units';
export { today, addDays } from './core/dates';
export type { Item, NewItem, Shelf } from './core/item';
export type { Unit } from './core/units';
@file pantry/src/cli/main.ts
#!/usr/bin/env bun
// The command line: read the words, pick a command.

import { homedir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../core/store';
import { add } from './commands/add';
import { list } from './commands/list';

export interface Args {
  command: string;
  words: string[];
  flags: Record<string, string | undefined>;
}

type Command = (args: Args, store: Store) => number;

const COMMANDS: Record<string, Command> = {
  add,
  list,
};

const HELP = `pantry: what is on the shelf

  pantry add NAME AMOUNT [--shelf SHELF]
  pantry list [--shelf SHELF]
  pantry help
`;

export function parseArgs(argv: string[]): Args {
  const words: string[] = [];
  const flags: Args['flags'] = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      flags[a.slice(2)] = argv[++i];
    } else {
      words.push(a);
    }
  }
  const command = words.shift() ?? 'help';
  return { command, words, flags };
}

export function run(argv: string[], path: string) {
  const args = parseArgs(argv);
  if (args.command === 'help') {
    console.log(HELP);
    return 0;
  }
  const command = COMMANDS[args.command];
  if (!command) {
    console.error('unknown command: ' + args.command);
    console.error(HELP);
    return 2;
  }
  const store = new Store(path);
  return command(args, store);
}

if (import.meta.main) {
  const path = join(homedir(), '.pantry.json');
  process.exit(run(process.argv.slice(2), path));
}
@file pantry/src/cli/commands/add.ts
// pantry add "rice" 2kg --shelf cupboard

import { isShelf } from '../../core/item';
import type { Shelf } from '../../core/item';
import { parseQty } from '../../core/units';
import { Store } from '../../core/store';
import { qtyText } from '../../util/format';
import type { Args } from '../main';

const DEFAULT_SHELF: Shelf = 'cupboard';

export function add(args: Args, store: Store): number {
  const [name, amount] = args.words;
  if (!name || !amount) {
    console.error('usage: pantry add NAME AMOUNT');
    return 2;
  }

  const qty = parseQty(amount);
  if (!qty) {
    console.error('not an amount: ' + amount);
    return 2;
  }

  const shelfWord = args.flags.shelf ?? DEFAULT_SHELF;
  if (!isShelf(shelfWord)) {
    console.error('no such shelf: ' + shelfWord);
    return 2;
  }

  const item = store.add({
    name,
    qty: qty.qty,
    unit: qty.unit,
    shelf: shelfWord,
  });
  store.save();

  console.log('added ' + item.name);
  console.log('now ' + qtyText(item));
  return 0;
}
@file pantry/src/cli/commands/list.ts
// pantry list [--shelf fridge]

import { isShelf } from '../../core/item';
import { Store } from '../../core/store';
import { itemRow, plural, table } from '../../util/format';
import type { Args } from '../main';

export function list(args: Args, store: Store): number {
  const want = args.flags.shelf;
  if (want !== undefined && !isShelf(want)) {
    console.error('no such shelf: ' + want);
    return 2;
  }

  const items = store.list(want);
  if (items.length === 0) {
    console.log('nothing there yet');
    return 0;
  }

  const head = ['NAME', 'AMOUNT', 'SHELF'];
  const rows = [head, ...items.map(itemRow)];
  console.log(table(rows));
  console.log('');
  console.log(plural(items.length, 'item'));
  return 0;
}

export function listNames(store: Store): string[] {
  return store.list().map((x) => x.name);
}
@file pantry/src/cli/commands/expire.ts
// pantry expire: not written yet.

import { Store } from '../../core/store';
import type { Args } from '../main';

export function expire(args: Args, store: Store): number {
  console.error('expire is not ready');
  return 1;
}
@file pantry/src/core/item.ts (open)
// An item on the pantry shelf.

import type { Unit } from './units';

export type Shelf = 'fridge' | 'freezer' | 'cupboard';

export interface Item {
  id: string;
  name: string;
  qty: number;
  unit: Unit;
  shelf: Shelf;
  addedOn: string; // YYYY-MM-DD
}

export interface NewItem {
  name: string;
  qty: number;
  unit: Unit;
  shelf: Shelf;
}

const SHELVES: Shelf[] = [
  'fridge',
  'freezer',
  'cupboard',
];

export function isShelf(s: string): s is Shelf {
  return (SHELVES as string[]).includes(s);
}

export function makeId(name: string, n: number) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug + '-' + n;
}

export function describe(item: Item): string {
  const qty = item.qty + ' ' + item.unit;
  return item.name + ' (' + qty + ')';
}

export function sameThing(a: Item, b: Item) {
  return (
    a.name.toLowerCase() === b.name.toLowerCase() &&
    a.unit === b.unit &&
    a.shelf === b.shelf
  );
}
@file pantry/src/core/store.ts
// The shelf: a list of items, kept in one file.

import { existsSync, readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { today } from './dates';
import { makeId, sameThing } from './item';
import type { Item, NewItem, Shelf } from './item';

interface FileShape {
  version: 1;
  counter: number;
  items: Item[];
}

export class Store {
  private counter = 0;
  private items: Item[] = [];

  constructor(private path: string | null) {
    if (path && existsSync(path)) {
      this.load(path);
    }
  }

  private load(path: string) {
    const raw = readFileSync(path, 'utf8');
    const data = JSON.parse(raw) as FileShape;
    if (data.version !== 1) {
      throw new Error('unknown file version');
    }
    this.counter = data.counter;
    this.items = data.items;
  }

  save() {
    if (!this.path) return;
    const data: FileShape = {
      version: 1,
      counter: this.counter,
      items: this.items,
    };
    const text = JSON.stringify(data, null, 2);
    writeFileSync(this.path, text + '\n');
  }

  add(input: NewItem): Item {
    const item: Item = {
      id: makeId(input.name, ++this.counter),
      name: input.name,
      qty: input.qty,
      unit: input.unit,
      shelf: input.shelf,
      addedOn: today(),
    };
    // the same thing twice? add to what is there
    const twin = this.items.find((x) =>
      sameThing(x, item),
    );
    if (twin) {
      twin.qty += item.qty;
      return twin;
    }
    this.items.push(item);
    return item;
  }

  remove(id: string): boolean {
    const at = this.items.findIndex(
      (x) => x.id === id,
    );
    if (at < 0) return false;
    this.items.splice(at, 1);
    return true;
  }

  get(id: string): Item | undefined {
    return this.items.find((x) => x.id === id);
  }

  list(shelf?: Shelf): Item[] {
    const all = [...this.items];
    const kept = shelf
      ? all.filter((x) => x.shelf === shelf)
      : all;
    return kept.sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  count(): number {
    return this.items.length;
  }

  clear() {
    this.items = [];
    this.counter = 0;
  }
}
@file pantry/src/core/units.ts
// Units, and how to turn one into another.

export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'pcs';

type Kind = 'mass' | 'volume' | 'count';

interface UnitInfo {
  kind: Kind;
  // how many base units (g, ml, pcs) in one
  factor: number;
}

const UNITS: Record<Unit, UnitInfo> = {
  g: { kind: 'mass', factor: 1 },
  kg: { kind: 'mass', factor: 1000 },
  ml: { kind: 'volume', factor: 1 },
  l: { kind: 'volume', factor: 1000 },
  pcs: { kind: 'count', factor: 1 },
};

export function isUnit(s: string): s is Unit {
  return s in UNITS;
}

export function kindOf(u: Unit): Kind {
  return UNITS[u].kind;
}

export function canConvert(from: Unit, to: Unit) {
  return kindOf(from) === kindOf(to);
}

export function convert(
  qty: number,
  from: Unit,
  to: Unit,
): number {
  if (!canConvert(from, to)) {
    throw new Error(
      'cannot turn ' + from + ' into ' + to,
    );
  }
  const base = qty * UNITS[from].factor;
  return base / UNITS[to].factor;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// The biggest unit that keeps the number >= 1.
export function tidy(qty: number, unit: Unit) {
  const kind = kindOf(unit);
  const base = qty * UNITS[unit].factor;
  const same = (Object.keys(UNITS) as Unit[])
    .filter((u) => kindOf(u) === kind)
    .sort(
      (a, b) => UNITS[b].factor - UNITS[a].factor,
    );
  for (const u of same) {
    const n = base / UNITS[u].factor;
    if (n >= 1) return { qty: round(n), unit: u };
  }
  const last = same[same.length - 1];
  return { qty: round(base), unit: last };
}

// "2kg" or "250 ml" -> { qty: 2, unit: 'kg' }
export function parseQty(text: string) {
  const m = /^(\d+(?:\.\d+)?)\s*([a-z]+)$/.exec(
    text.trim(),
  );
  if (!m || !isUnit(m[2])) return null;
  return { qty: Number(m[1]), unit: m[2] };
}

export function sum(qtys: number[], unit: Unit) {
  const total = qtys.reduce((a, b) => a + b, 0);
  return tidy(total, unit);
}
@file pantry/src/core/dates.ts
// Days, as YYYY-MM-DD text. No times, no zones.

const DAY = 24 * 60 * 60 * 1000;

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toMs(day: string): number {
  return Date.parse(day + 'T00:00:00Z');
}

export function addDays(day: string, n: number) {
  const ms = toMs(day) + n * DAY;
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string) {
  return Math.round((toMs(b) - toMs(a)) / DAY);
}

export function isDay(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text);
}
@file pantry/src/util/format.ts
// Turning things into text for the terminal.

import { tidy } from '../core/units';
import type { Item } from '../core/item';

export function pad(text: string, width: number) {
  if (text.length >= width) return text;
  return text + ' '.repeat(width - text.length);
}

export function padLeft(text: string, width: number) {
  if (text.length >= width) return text;
  return ' '.repeat(width - text.length) + text;
}

export function qtyText(item: Item): string {
  const t = tidy(item.qty, item.unit);
  return t.qty + ' ' + t.unit;
}

export function widths(rows: string[][]): number[] {
  const out: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      out[i] = Math.max(out[i] ?? 0, cell.length);
    });
  }
  return out;
}

export function table(rows: string[][]): string {
  const w = widths(rows);
  return rows
    .map((row) =>
      row
        .map((cell, i) => pad(cell, w[i]))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

export function plural(n: number, word: string) {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

export function itemRow(item: Item): string[] {
  return [item.name, qtyText(item), item.shelf];
}
@file pantry/test/store.test.ts
import { describe, expect, test } from 'bun:test';
import { Store } from '../src/core/store';

const rice = {
  name: 'Rice',
  qty: 1,
  unit: 'kg' as const,
  shelf: 'cupboard' as const,
};

describe('Store', () => {
  test('starts empty', () => {
    const store = new Store(null);
    expect(store.count()).toBe(0);
    expect(store.list()).toEqual([]);
  });

  test('add keeps the item', () => {
    const store = new Store(null);
    const item = store.add(rice);
    expect(item.id).toBe('rice-1');
    expect(store.get('rice-1')).toBe(item);
    expect(store.count()).toBe(1);
  });

  test('the same thing twice adds up', () => {
    const store = new Store(null);
    store.add(rice);
    const again = store.add({ ...rice, qty: 2 });
    expect(again.qty).toBe(3);
    expect(store.count()).toBe(1);
  });

  test('another shelf is another item', () => {
    const store = new Store(null);
    store.add(rice);
    store.add({ ...rice, shelf: 'freezer' });
    expect(store.count()).toBe(2);
  });

  test('list is sorted by name', () => {
    const store = new Store(null);
    store.add({ ...rice, name: 'Salt' });
    store.add({ ...rice, name: 'Beans' });
    const names = store.list().map((x) => x.name);
    expect(names).toEqual(['Beans', 'Salt']);
  });

  test('list can pick a shelf', () => {
    const store = new Store(null);
    store.add(rice);
    store.add({ ...rice, name: 'Peas', shelf: 'freezer' });
    const got = store.list('freezer');
    expect(got.map((x) => x.name)).toEqual(['Peas']);
  });

  test('remove says whether it found it', () => {
    const store = new Store(null);
    store.add(rice);
    expect(store.remove('nope')).toBe(false);
    expect(store.remove('rice-1')).toBe(true);
    expect(store.count()).toBe(0);
  });
});
@file pantry/test/units.test.ts
import { expect, test } from 'bun:test';
import { convert, parseQty, tidy } from '../src/core/units';

test('kg to g', () => {
  expect(convert(2, 'kg', 'g')).toBe(2000);
});

test('ml to l', () => {
  expect(convert(250, 'ml', 'l')).toBe(0.25);
});

test('mass is not volume', () => {
  expect(() => convert(1, 'kg', 'l')).toThrow();
});

test('tidy picks the biggest fit', () => {
  expect(tidy(1500, 'g')).toEqual({ qty: 1.5, unit: 'kg' });
  expect(tidy(0.5, 'l')).toEqual({ qty: 500, unit: 'ml' });
});

test('parseQty reads amounts', () => {
  expect(parseQty('2kg')).toEqual({ qty: 2, unit: 'kg' });
  const ml = parseQty(' 250 ml ');
  expect(ml).toEqual({ qty: 250, unit: 'ml' });
  expect(parseQty('lots')).toBeNull();
  expect(parseQty('3 apples')).toBeNull();
});
@step Give an item a best-before day
@@ pantry/src/core/item.ts
   unit: Unit;
   shelf: Shelf;
   addedOn: string; // YYYY-MM-DD
+  bestBefore?: string; // if the label says
 }
 
 export interface NewItem {
   qty: number;
   unit: Unit;
   shelf: Shelf;
+  bestBefore?: string;
 }
 
 const SHELVES: Shelf[] = [
   return item.name + ' (' + qty + ')';
 }
 
+export function hasDate(item: Item) {
+  return item.bestBefore !== undefined;
+}
+
 export function sameThing(a: Item, b: Item) {
   return (
     a.name.toLowerCase() === b.name.toLowerCase() &&
@step Read a day that a person typed
@@ pantry/src/core/dates.ts
   return /^\d{4}-\d{2}-\d{2}$/.test(text);
 }
+
+// "2026-12-24", or "+3" for 3 days from now.
+// Anything else gives null.
+export function parseDay(text: string) {
+  const t = text.trim();
+  if (isDay(t)) return t;
+  const m = /^\+(\d{1,3})$/.exec(t);
+  if (!m) return null;
+  return addDays(today(), Number(m[1]));
+}
+
+export function daysLeft(day: string, from = today()) {
+  return daysBetween(from, day);
+}
@step Teach the shelf what goes off soon
@@ pantry/src/core/store.ts
 // The shelf: a list of items, kept in one file.
 
 import { existsSync, readFileSync } from 'node:fs';
 import { writeFileSync } from 'node:fs';
-import { today } from './dates';
+import { addDays, today } from './dates';
 import { makeId, sameThing } from './item';
 import type { Item, NewItem, Shelf } from './item';
 
 interface FileShape {
       qty: input.qty,
       unit: input.unit,
       shelf: input.shelf,
       addedOn: today(),
+      bestBefore: input.bestBefore,
     };
     // the same thing twice? add to what is there
     const twin = this.items.find((x) =>
       sameThing(x, item),
     );
     if (twin) {
       twin.qty += item.qty;
+      twin.bestBefore = earlier(
+        twin.bestBefore,
+        item.bestBefore,
+      );
       return twin;
     }
     this.items.push(item);
     return item;
       a.name.localeCompare(b.name),
     );
   }
 
+  // Items that go off within `days` days, or
+  // already have. The soonest comes first.
+  expiring(days: number, from = today()) {
+    const limit = addDays(from, days);
+    return this.items
+      .filter((x) => x.bestBefore !== undefined)
+      .filter((x) => x.bestBefore! <= limit)
+      .sort((a, b) =>
+        a.bestBefore!.localeCompare(b.bestBefore!),
+      );
+  }
+
   count(): number {
     return this.items.length;
   }
 
     this.items = [];
     this.counter = 0;
   }
 }
+
+function earlier(a?: string, b?: string) {
+  if (a === undefined) return b;
+  if (b === undefined) return a;
+  return a < b ? a : b;
+}
@step Say it in words: 3 days, tomorrow
@@ pantry/src/util/format.ts
   return n + ' ' + word + (n === 1 ? '' : 's');
 }
 
+// "today", "tomorrow", "in 3 days", "2 days ago"
+export function daysLabel(left: number): string {
+  if (left === 0) return 'today';
+  if (left === 1) return 'tomorrow';
+  if (left === -1) return 'yesterday';
+  if (left > 0) return 'in ' + plural(left, 'day');
+  return plural(-left, 'day') + ' ago';
+}
+
 export function itemRow(item: Item): string[] {
   return [item.name, qtyText(item), item.shelf];
 }
@step Let add take --best-before
@@ pantry/src/cli/commands/add.ts
 // pantry add "rice" 2kg --shelf cupboard
 
 import { isShelf } from '../../core/item';
 import type { Shelf } from '../../core/item';
+import { parseDay } from '../../core/dates';
 import { parseQty } from '../../core/units';
 import { Store } from '../../core/store';
 import { qtyText } from '../../util/format';
 import type { Args } from '../main';
     console.error('no such shelf: ' + shelfWord);
     return 2;
   }
 
+  const dayWord = args.flags['best-before'];
+  const bestBefore = dayWord && parseDay(dayWord);
+  if (bestBefore === null) {
+    console.error('not a day: ' + dayWord);
+    return 2;
+  }
+
   const item = store.add({
     name,
     qty: qty.qty,
     unit: qty.unit,
     shelf: shelfWord,
+    bestBefore: bestBefore || undefined,
   });
   store.save();
 
   console.log('added ' + item.name);
   console.log('now ' + qtyText(item));
+  if (item.bestBefore) {
+    console.log('best before ' + item.bestBefore);
+  }
   return 0;
 }
@step Write the expire command
@@ pantry/src/cli/commands/expire.ts
-// pantry expire: not written yet.
+// pantry expire [DAYS]: what goes off soon.
 
+import { daysLeft } from '../../core/dates';
 import { Store } from '../../core/store';
+import {
+  daysLabel,
+  plural,
+  table,
+} from '../../util/format';
 import type { Args } from '../main';
 
+const DEFAULT_DAYS = 7;
+
 export function expire(args: Args, store: Store): number {
-  console.error('expire is not ready');
-  return 1;
+  const word = args.words[0];
+  const days = word ? Number(word) : DEFAULT_DAYS;
+  if (!Number.isInteger(days) || days < 0) {
+    console.error('DAYS must be a whole number');
+    return 2;
+  }
+
+  const items = store.expiring(days);
+  if (items.length === 0) {
+    console.log('nothing in ' + plural(days, 'day'));
+    return 0;
+  }
+
+  const rows = items.map((x) => [
+    x.name,
+    x.bestBefore!,
+    daysLabel(daysLeft(x.bestBefore!)),
+  ]);
+  console.log(table(rows));
+  return 0;
 }
@step Add expire to the command table
@@ pantry/src/cli/main.ts
 import { Store } from '../core/store';
 import { add } from './commands/add';
+import { expire } from './commands/expire';
 import { list } from './commands/list';
 
 const COMMANDS: Record<string, Command> = {
   add,
+  expire,
   list,
 };
 
   pantry add NAME AMOUNT [--shelf SHELF]
+              [--best-before DAY]
+  pantry expire [DAYS]
   pantry list [--shelf SHELF]
   pantry help
@step Show the days left in the list
@@ pantry/src/cli/commands/list.ts
 // pantry list [--shelf fridge]
 
+import { daysLeft } from '../../core/dates';
 import { isShelf } from '../../core/item';
+import type { Item } from '../../core/item';
 import { Store } from '../../core/store';
-import { itemRow, plural, table } from '../../util/format';
+import {
+  daysLabel,
+  itemRow,
+  plural,
+  table,
+} from '../../util/format';
 import type { Args } from '../main';
 
   }
 
-  const head = ['NAME', 'AMOUNT', 'SHELF'];
-  const rows = [head, ...items.map(itemRow)];
+  const head = ['NAME', 'AMOUNT', 'SHELF', 'GOES OFF'];
+  const rows = [
+    head,
+    ...items.map((x) => [...itemRow(x), when(x)]),
+  ];
   console.log(table(rows));
   console.log('');
 }
 
+function when(item: Item): string {
+  if (!item.bestBefore) return '-';
+  return daysLabel(daysLeft(item.bestBefore));
+}
+
 export function listNames(store: Store): string[] {
   return store.list().map((x) => x.name);
@step Test it: soonest first, past ones too
@@ pantry/test/store.test.ts
   shelf: 'cupboard' as const,
 };
 
+function dated(name: string, day?: string) {
+  return { ...rice, name, bestBefore: day };
+}
+
 describe('Store', () => {
   test('starts empty', () => {
     const store = new Store(null);
     expect(got.map((x) => x.name)).toEqual(['Peas']);
   });
 
+  test('the same thing twice keeps the earlier day', () => {
+    const store = new Store(null);
+    store.add(dated('Rice', '2026-12-09'));
+    store.add(dated('Rice', '2026-12-04'));
+    const rice1 = store.get('rice-1');
+    expect(rice1?.bestBefore).toBe('2026-12-04');
+  });
+
+  test('expiring lists what goes off soon', () => {
+    const store = new Store(null);
+    store.add(dated('Rice', '2026-12-01'));
+    store.add(dated('Milk', '2026-12-05'));
+    store.add(dated('Salt'));
+    const got = store.expiring(3, '2026-12-01');
+    expect(got.map((x) => x.name)).toEqual(['Rice']);
+  });
+
+  test('expiring: soonest first, past ones too', () => {
+    const store = new Store(null);
+    store.add(dated('Milk', '2026-12-03'));
+    store.add(dated('Eggs', '2026-12-02'));
+    store.add(dated('Peas', '2026-11-28'));
+    const got = store.expiring(7, '2026-12-01');
+    const names = got.map((x) => x.name);
+    expect(names).toEqual(['Peas', 'Eggs', 'Milk']);
+  });
+
   test('remove says whether it found it', () => {
     const store = new Store(null);
     store.add(rice);
@step Write it down in the README
@@ pantry/README.md
     pantry list
     pantry list --shelf fridge
+    pantry add "eggs" 6pcs --best-before +10
+    pantry expire 3
 
 Items live in `~/.pantry.json`. Delete the
 | add     | put an item on a shelf |
 | list    | show the items         |
+| expire  | what goes off soon     |
 | help    | show this table        |
 
@step Bump the version
@@ pantry/package.json
 {
   "name": "pantry",
-  "version": "0.3.0",
+  "version": "0.4.0",
   "description": "Keep track of what is on the shelf",
   "type": "module",
```

:::llm
An editor over a made-up TypeScript project, pantry: a command line tool that tracks what is on the kitchen shelves. 14 files in src/cli (main.ts, commands/add.ts, list.ts, expire.ts), src/core (item.ts, store.ts, units.ts, dates.ts), src/util/format.ts, test/ (store.test.ts, units.test.ts), index.ts, README.md and package.json. Eleven edits add a best-before day: item.ts gets the field, dates.ts parses a day, store.ts gets expiring(days), format.ts gets daysLabel, add.ts takes --best-before, expire.ts becomes a real command, main.ts registers it, list.ts shows a GOES OFF column, store.test.ts tests it, then the README and the version (0.4.0) are updated.
:::
