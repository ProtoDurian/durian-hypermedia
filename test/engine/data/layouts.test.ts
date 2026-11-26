// The data layouts (array list stack queue map) and the tree layout, on hand-built models (SPEC 6.3, 6.12; DESIGN 2.3).
import { describe, expect, test } from "bun:test";
import type { Fact } from "../../../src/engine/types";
import { cells, lay, model, src, states } from "./helpers";

const vals = (id: string, v: string[]): Fact => ({ k: "values", id, values: v, from: [], src });
const inn = (ids: string[], place: string, extra: Partial<Extract<Fact, { k: "in" }>> = {}): Fact => ({ k: "in", ids, place, src, ...extra });
const show = (...ids: string[]): Fact => ({ k: "show", ids, src });

describe("array", () => {
  const m = model([{ id: "a", title: "ids", layout: "array", values: ["5", "2", "8", "1"] }], [[vals("a", ["2", "5", "8", "1"])], [vals("a", ["2", "5", "8", "1", "9"])]]);
  const st = states(m), p = lay(m, st, "a");
  test("the values are the cells, ids a.0 ..", () => {
    expect(Object.keys(p.at(0)).sort()).toEqual(["a.0", "a.1", "a.2", "a.3"]);
    expect(cells(p, 0, "a").map((c) => c.text)).toEqual(["5", "2", "8", "1"]);
  });
  test("a value that moves keeps its key, so it slides", () => {
    const a = cells(p, 0, "a"), b = cells(p, 1, "a");
    expect(b.map((c) => c.text)).toEqual(["2", "5", "8", "1"]);
    expect(b[0].key).toBe(a[1].key); expect(b[1].key).toBe(a[0].key);
    expect(b[2].key).toBe(a[2].key); expect(b[3].key).toBe(a[3].key);
    expect(b[0].rect.x).toBe(a[0].rect.x);
  });
  test("a new value gets a new key; the size is the largest over the story", () => {
    const a = cells(p, 0, "a"), c = cells(p, 2, "a");
    expect(c.length).toBe(5);
    expect(a.map((x) => x.key)).not.toContain(c[4].key);
    expect(p.w).toBeGreaterThan(5 * 32); expect(Object.keys(p.at(0))).toHaveLength(4); // room for 5 cells though 4 are drawn
  });
  test("cells never overlap and sit inside the box", () => {
    const rs = cells(p, 2, "a").map((c) => c.rect);
    rs.forEach((r, i) => { expect(r.x + r.w).toBeLessThanOrEqual(p.w); expect(r.y + r.h).toBeLessThanOrEqual(p.h); if (i) expect(r.x).toBeGreaterThanOrEqual(rs[i - 1].x + rs[i - 1].w); });
  });
  test("phone: too many cells wrap into rows instead of running off", () => {
    const big = model([{ id: "a", layout: "array", values: Array.from({ length: 12 }, (_, i) => String(i + 10)) }], []);
    const q = lay(big, states(big), "a", 390);
    expect(q.w).toBeLessThanOrEqual(390);
    expect(new Set(cells(q, 0, "a").map((c) => c.rect.y)).size).toBeGreaterThan(1);
  });
});

describe("stack", () => {
  const m = model([{ id: "s", title: "calls", layout: "stack", values: ["x", "y"] }], [[vals("s", ["x", "y", "z"])], [vals("s", ["x"])]]);
  const st = states(m), p = lay(m, st, "s");
  test("the newest is on top and the bottom stays put when it grows", () => {
    const a = cells(p, 0, "s"), b = cells(p, 1, "s");
    expect(a[1].rect.y).toBeLessThan(a[0].rect.y);
    expect(b[2].rect.y).toBeLessThan(b[1].rect.y);
    expect(b[0].rect.y).toBe(a[0].rect.y); expect(b[0].key).toBe(a[0].key);
  });
  test("a pop leaves the rest where they were", () => {
    const c = cells(p, 2, "s"), b = cells(p, 1, "s");
    expect(c).toHaveLength(1); expect(c[0].rect).toEqual(b[0].rect);
  });
});

describe("queue", () => {
  test("values: the front (first) is on the right, new ones join on the left", () => {
    const m = model([{ id: "q", layout: "queue", values: ["j1", "j2", "j3"] }], [[vals("q", ["j2", "j3"])]]);
    const p = lay(m, states(m), "q"), a = cells(p, 0, "q"), b = cells(p, 1, "q");
    expect(a[0].rect.x).toBeGreaterThan(a[1].rect.x); expect(a[1].rect.x).toBeGreaterThan(a[2].rect.x);
    expect(b.map((c) => c.key)).toEqual([a[1].key, a[2].key]);
    expect(b[0].rect.x).toBe(a[0].rect.x); // a pop closes the line up towards the front
  });
  test("things put in (fixture 60): oldest at the front, a pop moves the rest forward", () => {
    const m = model(
      [{ id: "q", title: "jobs", layout: "queue" }, { id: "w1", layout: "lanes", title: "worker 1", container: true }, { id: "j1", shape: "token", title: "job 1", parent: "q" }, { id: "j2", shape: "token", title: "job 2", parent: "q" }, { id: "j3", shape: "token", title: "job 3", parent: "q" }],
      [[inn(["j1"], "w1")]],
    );
    const st = states(m), p = lay(m, st, "q");
    const r0 = p.at(0), r1 = p.at(1);
    expect(r0.j1.x).toBeGreaterThan(r0.j2.x); expect(r0.j2.x).toBeGreaterThan(r0.j3.x);
    expect(r1.j1).toBeUndefined();
    expect(r1.j2.x).toBe(r0.j1.x + r0.j1.w - r1.j2.w); // job 2 is now the front: flush right
  });
  test("a phone turns a long queue into a column, front at the top", () => {
    const m = model([{ id: "q", layout: "queue", values: Array.from({ length: 9 }, (_, i) => `job ${i}`) }], []);
    const p = lay(m, states(m), "q", 390), c = cells(p, 0, "q");
    expect(p.w).toBeLessThanOrEqual(390);
    expect(c[0].rect.y).toBeLessThan(c[1].rect.y);
  });
});

describe("list", () => {
  test("a row from its head, an arrow between items, none for one item", () => {
    const m = model([{ id: "l", layout: "list", title: "list", values: ["a", "b", "c"] }], [[vals("l", ["a"])]]);
    const p = lay(m, states(m), "l");
    expect(p.decor(0).filter((d) => d.k === "path")).toHaveLength(2);
    expect(p.decor(1).filter((d) => d.k === "path")).toHaveLength(0);
    const c = cells(p, 0, "l"); expect(c[1].rect.x - (c[0].rect.x + c[0].rect.w)).toBeGreaterThanOrEqual(32); // a line shows at least 32
  });
});

describe("map", () => {
  test("a table: key and value columns, one row per entry, rows named m.key", () => {
    const m = model([{ id: "c", title: "cart", layout: "map", values: ["ana: 3", "ben: 7"] }], [[vals("c", ["ana: 3", "ben: 7", "cy: 9"])]]);
    const p = lay(m, states(m), "c");
    expect(Object.keys(p.at(0)).sort()).toEqual(["c.ana", "c.ben"]);
    expect(Object.keys(p.at(1)).sort()).toEqual(["c.ana", "c.ben", "c.cy"]);
    const a = p.at(0)["c.ana"], b = p.at(0)["c.ben"]; expect(b.y).toBeGreaterThan(a.y);
    expect(p.decor(0).filter((d) => d.k === "text").map((d) => (d as any).lines[0])).toContain("ana");
  });
  test("buckets: an entry sits in bucket hash(key) mod n, two keys make a chain (SPEC 6.12)", () => {
    const m = model([{ id: "cart", title: "cart", layout: "map", keys: { buckets: "3" }, values: ["ana: 3", "ben: 7", "cy: 9"] }], [[vals("cart", ["ana: 3", "ben: 7", "cy: 9", "dee: 4"])]]);
    const p = lay(m, states(m), "cart"), at = p.at(0);
    expect(at["cart.ana"].y).toBe(at["cart.b1"].y + (at["cart.b1"].h - at["cart.ana"].h) / 2); // 97+110+97 = 304, mod 3 = 1
    expect(at["cart.cy"].y).toBe(at["cart.ana"].y); expect(at["cart.cy"].x).toBeGreaterThan(at["cart.ana"].x);
    expect(p.at(1)["cart.dee"].y).toBe(p.at(1)["cart.b2"].y + (p.at(1)["cart.b2"].h - p.at(1)["cart.dee"].h) / 2); // dee: 100+101+101 = 302, mod 3 = 2
    expect(p.w).toBeGreaterThan(at["cart.cy"].x + at["cart.cy"].w - 1);
  });
  test("a hash table of things (fixture 49): pills put in h.2 chain up, h.2 is addressable", () => {
    const m = model(
      [{ id: "h", title: "hash table", layout: "map", keys: { buckets: "5" } }, { id: "apple", shape: "pill", title: "apple" }, { id: "kiwi", shape: "pill", title: "kiwi" }, { id: "grape", shape: "pill", title: "grape" }],
      [[show("apple"), inn(["apple"], "h.2")], [show("kiwi"), inn(["kiwi"], "h.4")], [show("grape"), inn(["grape"], "h.2")]],
      { setup: [{ k: "hide", ids: ["apple", "kiwi", "grape"], src }] },
    );
    const p = lay(m, states(m), "h");
    const s1 = p.at(1), s3 = p.at(3);
    expect(s1.apple).toBeDefined(); expect(s1.kiwi).toBeUndefined();
    expect(s3.apple.y).toBe(s3.grape.y); expect(s3.grape.x).toBeGreaterThan(s3.apple.x + s3.apple.w); // the chain: apple, then grape
    expect(s3["h.2"]).toEqual(s3["h.b2"]); expect(s3.kiwi.y).toBeGreaterThan(s3.apple.y);
    expect(p.decor(3).filter((d) => d.k === "path").length).toBeGreaterThanOrEqual(3); // tab -> apple -> grape, tab -> kiwi
  });
});

describe("closed things (SPEC 6.12)", () => {
  const m = model([{ id: "ids", title: "sorted ids", layout: "array", flags: ["closed"], values: ["12", "19", "27", "34"] }], [[{ k: "zoom", into: ["ids"], src }]]);
  const p = lay(m, states(m), "ids");
  test("closed: the title counts what it holds, the inside is faint with no words", () => {
    expect(p.decor(0).some((d) => d.k === "text" && d.lines[0] === "sorted ids · 4 items")).toBe(true);
    expect(p.decor(0).filter((d) => d.k === "box").every((d) => (d as any).cls.includes("faint"))).toBe(true);
    expect(cells(p, 0, "ids").every((c) => c.text === "")).toBe(true);
  });
  test("opened: the plain title and the words, in the same box", () => {
    expect(p.decor(1).some((d) => d.k === "text" && d.lines[0] === "sorted ids")).toBe(true);
    expect(cells(p, 1, "ids").map((c) => c.text)).toEqual(["12", "19", "27", "34"]);
    expect(cells(p, 1, "ids")[0].rect).toEqual(cells(p, 0, "ids")[0].rect);
  });
  test("a hidden thing draws nothing and offers no rects", () => {
    const h = model([{ id: "a", layout: "array", values: ["1"] }], [[show("a")]]);
    const q = lay(h, states(h, ["a"]), "a");
    expect(q.decor(0)).toEqual([]); expect(q.at(0)).toEqual({}); expect(q.at(1)["a.0"]).toBeDefined();
  });
});

describe("tree", () => {
  const bst = () => {
    const t = (id: string, parent: string, flags: string[] = []) => ({ id, title: id.slice(1), shape: "circle" as const, parent, flags });
    return model(
      [{ id: "t", layout: "tree", title: "" }, { ...t("n8", "t") }, t("n3", "n8", ["left"]), t("n10", "n8", ["right"]), t("n1", "n3", ["left"]), t("n14", "n10", ["right"]), t("n6", "n3", ["right"])],
      [[show("n6")]], { setup: [{ k: "hide", ids: ["n6"], src }] },
    );
  };
  test("a node is centred over its children and levels line up", () => {
    const m = bst(), p = lay(m, states(m), "t"), r = p.at(1);
    // centred over the two subtrees (scene.ts treeLayout): between the children, and the gap between the subtrees is split by it
    expect(r.n8.x + r.n8.w / 2).toBeGreaterThan(r.n3.x + r.n3.w / 2); expect(r.n8.x + r.n8.w / 2).toBeLessThan(r.n10.x + r.n10.w / 2);
    expect(r.n3.y).toBe(r.n10.y); expect(r.n1.y).toBe(r.n6.y); expect(r.n3.y).toBeGreaterThan(r.n8.y + r.n8.h);
    expect(r.n3.x).toBeLessThan(r.n8.x); expect(r.n10.x).toBeGreaterThan(r.n8.x);
  });
  test("the still rule: room for 6 before it is shown, nothing moves when it appears", () => {
    const m = bst(), p = lay(m, states(m), "t");
    expect(p.at(0).n6).toBeUndefined();
    for (const id of ["n8", "n3", "n10", "n1", "n14"]) expect(p.at(0)[id]).toEqual(p.at(1)[id]);
    expect(p.at(1).n6.x).toBeGreaterThan(p.at(1).n3.x); expect(p.at(1).n6.x + p.at(1).n6.w).toBeLessThanOrEqual(p.at(1).n8.x + p.at(1).n8.w); // 6 is under 3, left of the root
  });
  test("an empty side keeps its room: a lone left child stays left of its parent", () => {
    const m = model([{ id: "t", layout: "tree" }, { id: "r", parent: "t", title: "root", shape: "circle" }, { id: "l", parent: "r", title: "l", shape: "circle", flags: ["left"] }], []);
    const r = lay(m, states(m), "t").at(0);
    expect(r.l.x + r.l.w).toBeLessThanOrEqual(r.r.x + r.r.w / 2 + 1); expect(r.l.x).toBeLessThan(r.r.x);
  });
  test("edges join parent to child, only while both are shown", () => {
    const m = bst(), p = lay(m, states(m), "t");
    const e = (k: number) => p.decor(k).filter((d) => d.k === "path").map((d) => d.key).sort();
    expect(e(0)).toEqual(["tree:n10>n14", "tree:n3>n1", "tree:n8>n10", "tree:n8>n3"]);
    expect(e(1)).toContain("tree:n3>n6");
  });
  test("a tree of arrays (merge sort): nodes are arrays, children sit under them", () => {
    const m = model(
      [{ id: "s", layout: "array", values: ["5", "2", "8", "1"], parent: null }, { id: "h1", layout: "array", values: ["5", "2"], parent: "s" }, { id: "h2", layout: "array", values: ["8", "1"], parent: "s" }],
      [], { layout: "tree" },
    );
    const st = states(m), p = lay(m, st, null);
    const r = p.at(0);
    expect(Object.keys(r).sort()).toEqual(["h1", "h2", "s"]);
    expect(r.h1.y).toBeGreaterThan(r.s.y + r.s.h); expect(r.h1.x + r.h1.w).toBeLessThanOrEqual(r.h2.x);
    // the array nodes own their cells; the indented children are tree children, not cells' members
    const sp = lay(m, st, "s"); expect(Object.keys(sp.at(0)).sort()).toEqual(["s.0", "s.1", "s.2", "s.3"]);
  });
  test("phone: a tree too wide turns into an indented outline, no wider than the page", () => {
    const m = model([{ id: "t", layout: "tree" }, ...Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, parent: "t", title: `node number ${i}`, shape: "pill" as const }))], []);
    const wide = lay(m, states(m), "t", 1280), narrow = lay(m, states(m), "t", 390);
    expect(wide.h).toBeLessThan(120); expect(narrow.w).toBeLessThanOrEqual(390); expect(narrow.h).toBeGreaterThan(wide.h * 3);
    const r = narrow.at(0); expect(r.n1.y).toBeGreaterThan(r.n0.y);
  });
});

describe("merge sort (DESIGN example C): a tree of arrays whose numbers move", () => {
  const arr = (id: string, parent: string | null, values: string[]) => ({ id, layout: "array" as const, parent, values });
  const from = (id: string, values: string[], f: string[]): Fact => ({ k: "values", id, values, from: f, src });
  const m = model(
    [arr("s", null, ["5", "2", "8", "1"]), arr("h1", "s", ["5", "2"]), arr("h2", "s", ["8", "1"])],
    [[show("h1", "h2")], [vals("h1", ["2", "5"]), vals("h2", ["1", "8"])], [{ k: "hide", ids: ["h1", "h2"], src }, from("s", ["1", "2", "5", "8"], ["h1", "h2"])]],
    { layout: "tree" },
  );
  const st = states(m, ["h1", "h2"]), p = lay(m, st, null);
  test("a sorted pair swaps in place: 5 and 2 trade places, keys kept", () => {
    const a = cells(lay(m, st, "h1"), 2, "h1"), b = cells(lay(m, st, "h1"), 1, "h1");
    expect(b.map((c) => c.text)).toEqual(["5", "2"]); expect(a.map((c) => c.text)).toEqual(["2", "5"]);
    expect(a[0].key).toBe(b[1].key); expect(a[1].key).toBe(b[0].key);
  });
  test("merged values fly up from the pieces: the parent's cells take the children's keys", () => {
    const kids = [...cells(lay(m, st, "h1"), 2, "h1"), ...cells(lay(m, st, "h2"), 2, "h2")].map((c) => c.key);
    const up = cells(lay(m, st, "s"), 3, "s");
    expect(up.map((c) => c.text)).toEqual(["1", "2", "5", "8"]);
    expect(up.filter((c) => kids.includes(c.key)).length).toBe(4);
  });
  test("the children are not shown before they are split out, and the root never moves", () => {
    expect(p.at(0).h1).toBeUndefined(); expect(p.at(1).h1).toBeDefined();
    expect(p.at(3).s).toEqual(p.at(0).s); expect(p.at(3).h1).toBeUndefined();
  });
});
