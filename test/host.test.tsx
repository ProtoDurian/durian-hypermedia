// Host blocks: a host registers its own fence without forking.
import { describe, expect, test, afterEach } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { parse, llmView, check, registerBlock, unregisterBlock, defineBlock } from "../src/index";
import { DhDocument } from "../src/react/index";
import { taskBlock } from "./helpers";

const SRC = "# Tasks\n\n```fy-task\nid: T-1\ntitle: Write it\nstate: doing\n```\n\n```fy-task\nid: T-2\ntitle: Ship it\nstate: maybe\n```\n";
afterEach(() => unregisterBlock("fy-task"));

describe("host blocks", () => {
  test("parse: a host block with the host's data", () => {
    const d = parse(SRC, { blocks: [taskBlock] });
    const hb = d.blocks.filter((b) => b.type === "host") as any[];
    expect(hb).toHaveLength(2);
    expect(hb[0].name).toBe("fy-task");
    expect(hb[0].data).toEqual({ id: "T-1", title: "Write it", state: "doing" });
  });
  test("the LLM view has the host's text", () => {
    const v = llmView(parse(SRC, { blocks: [taskBlock] }));
    expect(v).toContain("Task T-1 (doing): Write it");
    expect(v).not.toContain("```fy-task");
  });
  test("check runs the host's check", () => {
    const p = check(parse(SRC, { blocks: [taskBlock] }));
    expect(p.some((x) => x.message.includes('[fy-task] state is todo, doing, done, not "maybe"'))).toBe(true);
  });
  test("the renderer draws the host's component", () => {
    const out = renderToString(<DhDocument doc={parse(SRC, { blocks: [taskBlock] })} blocks={[taskBlock]} />);
    expect(out).toContain('class="fy-task"');
    expect(out).toContain('data-dh-part="fy-task"');
  });
  test("without the component, the block shows its text", () => {
    const out = renderToString(<DhDocument doc={parse(SRC, { blocks: [taskBlock] })} />);
    expect(out).toContain("dh-fallback");
  });
  test("registerBlock makes it known to every call", () => {
    registerBlock(taskBlock);
    expect(parse(SRC).blocks.filter((b) => b.type === "host")).toHaveLength(2);
    unregisterBlock("fy-task");
    expect(parse(SRC).blocks.filter((b) => b.type === "host")).toHaveLength(0);
  });
  test("an unregistered fence stays a plain code block", () => { expect(parse(SRC).blocks.every((b) => b.type === "markdown")).toBe(true); });
  test("a built-in name is refused", () => {
    const d = parse("```chart\nkind: bar\nx: [1]\nseries: [{name: a, data: [1]}]\n```\n", { blocks: [defineBlock({ name: "chart" })] });
    expect(d.problems.some((p) => p.message.includes("built-in"))).toBe(true);
    expect(d.blocks.some((b) => b.type === "chart")).toBe(true);
  });
  test("a bad name is refused", () => { expect(() => defineBlock({ name: "Bad Name" })).toThrow(); });
  test("the format parser forgets host blocks after the call", () => {
    parse(SRC, { blocks: [taskBlock] });
    expect(parse(SRC).blocks.some((b) => b.type === "host")).toBe(false);
  });
});

import { fileRef, taskRef, hostInlines } from "../example/host-block";
describe("host inline references", () => {
  const T = "See @src/cart/total.ts and &T-12, not someone@example.com or `@src/in/code.ts`.\n";
  test("parse marks them, with the host's data", () => {
    const d = parse(T, { inlines: hostInlines });
    const md = (d.blocks[0] as any).md[0].c;
    const refs = md.filter((x: any) => x.t === "ref");
    expect(refs.map((r: any) => [r.name, r.text])).toEqual([["file", "@src/cart/total.ts"], ["task", "&T-12"]]);
    expect(refs[1].data).toEqual({ id: "T-12" });
  });
  test("the LLM view keeps them as written", () => { expect(llmView(parse(T, { inlines: hostInlines }))).toContain("See @src/cart/total.ts and &T-12"); });
  test("the renderer draws the host's components, or a span without one", () => {
    const d = parse(T, { inlines: hostInlines });
    const a = renderToString(<DhDocument doc={d} inlines={hostInlines} />);
    expect(a).toContain('class="fy-ref fy-ref-file"');
    expect(a).toContain('href="#task-T-12"');
    const b = renderToString(<DhDocument doc={d} />);
    expect(b).toContain('data-dh-ref="file"');
  });
  test("without the definitions they are plain text", () => { expect(JSON.stringify(parse(T).blocks)).not.toContain('"ref"'); });
  void fileRef; void taskRef;
});
