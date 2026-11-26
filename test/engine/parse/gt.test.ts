// Lane parse: the 22 generality scenes lower with no refusal, and migrate gives format 12 that reads back to the same story.
import { describe, expect, test } from "bun:test";
import { gtFences } from "./fixtures";
import { lowerBlock } from "../../../src/engine/parse/migrate";
import { print12 } from "../../../src/engine/parse/print12";
import { parse12 } from "../../../src/engine/parse/parse12";
import { shape } from "./roundtrip";

const all = gtFences();
test("22 scenes", () => expect(all.length).toBe(22));
describe("the generality scenes", () => {
  for (const f of all) test(f.id, () => {
    const m1 = lowerBlock(f.src);
    expect(m1.problems.filter((p) => !p.warn)).toEqual([]);
    const text = print12(m1);
    const roles = { ...f.src.roles }; for (const [k, v] of Object.entries(m1.roles)) if (!(k in roles)) roles[k] = v.colour || 1;
    const m2 = parse12({ body: text, line0: 1, fence: { ...f.src.fence }, roles, format12: true });
    expect(m2.problems.filter((p) => !p.warn).map((p) => `${p.line}: ${p.msg}`)).toEqual([]);
    expect(shape(m2, { beats: false })).toEqual(shape(m1, { beats: false })); // eng-migrate2: then between a relay's hops
  });
});
