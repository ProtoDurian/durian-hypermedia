// An example host block: ```fy-task, a task reference the host draws itself.
// The same definition gives the parser its parse, LLM text and check, and the renderer its component.
import React from "react";
import { defineBlock } from "../src/index";
import type { HostBlock } from "../src/types";

export type Task = { id: string; title: string; state: string };
const STATES = ["todo", "doing", "done"];

function TaskCard({ data }: { block: HostBlock; data: Task }) {
  return (
    <div className="fy-task" data-state={data.state}>
      <span className="fy-task-id">{data.id}</span>
      <span className="fy-task-title">{data.title}</span>
      <span className="fy-task-state">{data.state}</span>
    </div>
  );
}

export const taskBlock = defineBlock<Task, typeof TaskCard>({
  name: "fy-task",
  parse({ body }) {
    const kv = Object.fromEntries(body.split("\n").map((l) => l.match(/^(\w+):\s*(.*)$/)).filter(Boolean).map((m) => [m![1], m![2].trim()]));
    if (!kv.id || !kv.title) throw new Error("a task needs id: and title: lines");
    return { id: String(kv.id), title: String(kv.title), state: String(kv.state ?? "todo") };
  },
  llm: (t) => `Task ${t.id} (${t.state}): ${t.title}`,
  check: (t) => (STATES.includes(t.state) ? [] : [{ message: `state is ${STATES.join(", ")}, not "${t.state}"` }]),
  Component: TaskCard,
});

// Two inline references in prose: @<path> (a file) and &T-<n> (a task). The LLM reads them as written.
import { defineInline } from "../src/index";
function FileRef({ text }: { text: string; data: string }) { return <code className="fy-ref fy-ref-file" title="a file in the workspace">{text}</code>; }
function TaskRef({ text, data }: { text: string; data: { id: string } }) { return <a className="fy-ref fy-ref-task" href={`#task-${data.id}`}>{text}</a>; }
export const fileRef = defineInline({ name: "file", match: /@[\w.-]+(?:\/[\w.-]+)+/, Component: FileRef });
export const taskRef = defineInline({ name: "task", match: /&T-\d+\b/, parse: (m) => ({ id: m[0].slice(1) }), Component: TaskRef });
export const hostInlines = [fileRef, taskRef];
