import { expect, test } from "bun:test";
import { parseMarks, plainOf, runsOfLines } from "../../../src/engine/render/marks";

test("the three marks become runs; the plain text is what is measured", () => {
  expect(parseMarks("You run `task gen`; it is **never** done by *hand*.")).toEqual([
    { text: "You run " }, { text: "task gen", code: true }, { text: "; it is " }, { text: "never", bold: true }, { text: " done by " }, { text: "hand", italic: true }, { text: "." },
  ]);
  expect(plainOf("I ran `task gen` first")).toBe("I ran task gen first");
  expect(parseMarks("2 * 3 and a lone ` tick")).toEqual([{ text: "2 * 3 and a lone ` tick" }]);
});
test("wrapped lines keep their runs", () => {
  const r = runsOfLines("I ran `task gen` first", ["I ran task", "gen first"]);
  expect(r[0]).toEqual([{ text: "I ran " }, { text: "task", code: true }]);
  expect(r[1][0]).toEqual({ text: "gen", code: true });
});
