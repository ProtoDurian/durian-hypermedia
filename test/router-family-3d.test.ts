// rc.3 review (Row 3): the 3D router of "a message through a router, in segments" was a grey wireframe when the camera
// zoomed in: the router and its insides (input queue, routing table, port 2) had no family, so 3D drew them in the
// neutral surface and edge. The router is now a family of its own (the scene's third), so the zoomed router is that
// family's fill and border and its insides carry its border: told apart from host A and host B by fill and by border.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileScene } from "../src/core/scene";

const text = readFileSync(join(import.meta.dir, "../fixtures/format/68-3d-a-message-through-a-router-in-segments.dh.md"), "utf8");
const fence = /^```animation 3d\n([\s\S]*?)^```$/m.exec(text)![1];
const [head, ...rest] = fence.split(/^@step /m);
const c = compileScene(head, rest.map((r, k) => { const [title, ...body] = r.split("\n"); return { title, raw: body.join("\n"), line: 100 + 10 * k }; }), 0, { view: "3d" });

describe("the zoomed router is coloured by family", () => {
  test("it compiles", () => expect(c.errors).toEqual([]));
  test("at the zoom, the router and its input queue, routing table and port 2 are one family, not the hosts' ones", () => {
    const zoom = rest.findIndex((r) => /^\s*zoom into r$/m.test(r)), f = c.frames[zoom];
    const cc = (label: string) => f.boxes.find((b: any) => b.label === label)?.cc;
    const router = cc("router");
    expect(router).toBeGreaterThan(0);
    for (const inside of ["input queue", "routing table", "port 2"]) expect(cc(inside)).toBe(router);
    expect(new Set([router, cc("host A"), cc("host B")]).size).toBe(3);
  });
});
