// ```state: a state machine, drawn by the animation engine, that its steps can walk.
import { build, cell, NAME_RE, q, tailOf, toneOf, type Diagram, type DiagramIn } from "./diagram";
import { around } from "./scan";

const RIGHT = /^(\S+)(?:\s+"([^"]*)")?$/;

interface State { id: string; label: string; note: string; colour: string; choice: boolean; line: number; step: number; group?: string }
interface Group { id: string; label: string; note: string; colour: string; kids: string[]; line: number; step: number }
interface Move { from: string; to: string; events: string[]; line: number; step: number }
const START = "[start]", END = "[end]";

export function stateDiagram(p: DiagramIn): Diagram {
  return build(p, { layout: "graph", dir: "right", entered: "1" }, (out, err, warn, lines) => {
    const states = new Map<string, State>(), groups = new Map<string, Group>(), moves: Move[] = [];
    const notes: { text: string; line: number }[] = [], declared = new Set<string>();
    const walk: { kind: "at" | "fire"; word: string; line: number; step: number }[] = [];
    const named = (id: string, line: number) => {
      if (NAME_RE.test(id)) return true;
      err(line, `"${id}" is not a state's name: one word of letters, digits, - _ . (state ${id.replace(/[^A-Za-z0-9_]+/g, "_") || "s1"} "${id}" gives it a label)`);
      return false;
    };
    // groups first: a transition may name a group written below it
    for (const l of lines) {
      const g = l.text.match(/^group\s+(\S+)/);
      if (!g) continue;
      const [head, tail] = cutColon(l.text.slice(6));
      try {
        const id = head.split(/\s+/)[0], t = tailOf(head.slice(id.length), `group ${id}`);
        if (t.rest || tail == null || !tail.trim()) { err(l.line, `a group is group <id> "label": a, b (the states in it, after a colon)`); continue; }
        if (!named(id, l.line)) continue;
        if (groups.has(id)) { err(l.line, `group ${id} is written twice (first at line ${groups.get(id)!.line})`); continue; }
        groups.set(id, { id, label: t.label ?? id, note: t.note, colour: t.colour, kids: [...new Set(tail.split(",").map((x) => x.trim()).filter(Boolean))], line: l.line, step: l.step });
        if (t.note) notes.push({ text: t.note, line: l.line });
      } catch (e) { err(l.line, (e as Error).message); }
    }
    const see = (id: string, line: number, step: number, choice = false): State | null => {
      if (!named(id, line)) return null;
      let s = states.get(id);
      if (!s) states.set(id, (s = { id, label: choice ? "" : id, note: "", colour: "", choice, line, step }));
      else { if (choice) { s.choice = true; if (s.label === id) s.label = ""; } s.step = Math.min(s.step, step); }
      return s;
    };
    const byEvent = new Map<string, Move>(), bare = new Map<string, Move>(), shared = new Map<string, Move>();
    let started = false;
    for (const l of lines) {
      const word = l.text.split(/\s+/)[0];
      try {
        if (word === "group" && !/^group\s*->/.test(l.text)) continue;
        if ((word === "state" || word === "choice") && !/^\w+\s*->/.test(l.text)) {
          const body = l.text.slice(word.length).trim(), id = body.split(/\s+/)[0], t = tailOf(body.slice(id.length), `${word} ${id}`);
          if (!id || t.rest) { err(l.line, `${word} takes an id, then a "label", note="..." and a [colour] if you want them: ${word} ${id || "paying"} "Paying"`); continue; }
          if (groups.has(id)) { err(l.line, `"${id}" is a group already; give the ${word} another name`); continue; }
          if (declared.has(id)) { err(l.line, `${word} ${id} is written twice`); continue; }
          const s = see(id, l.line, l.step, word === "choice");
          if (!s) continue;
          declared.add(id);
          s.line = l.line; if (t.label != null) s.label = t.label; s.note = t.note; s.colour = t.colour;
          if (t.note) notes.push({ text: t.note, line: l.line });
          continue;
        }
        if (/\[\*\]/.test(l.text)) { err(l.line, "[*] is not used here: write [start] for where the machine starts and [end] for where it ends"); continue; }
        if ((word === "at" || word === "fire") && !l.text.includes("->")) {
          const rest = l.text.slice(word.length).trim().replace(/^"(.*)"$/, "$1");
          if (word === "at" && !rest) { err(l.line, "at needs a state: at cart"); continue; }
          if (word === "fire" && l.step < 0) { err(l.line, `fire is what a step does: put it under a @step line (@step <caption>, then fire ${rest || "<event>"})`); continue; }
          walk.push({ kind: word, word: rest, line: l.line, step: l.step });
          continue;
        }
        const m = around(l.text, "->", RIGHT);
        if (!m) { err(l.line, `cannot read "${l.text}": a line is a -> b "event", state <id> "label", choice <id>, group <id> "label": a, b, or in a step at <state> and fire <event>`); continue; }
        const from = m.left, [, to, event = ""] = m.right;
        if (from === END) { err(l.line, `nothing leaves [end]: draw a transition from the state before it, or name a state (state closed "Closed")`); continue; }
        if (to === START) { err(l.line, `nothing goes back into [start]: point the transition at the first state instead`); continue; }
        if (to.includes("->")) { err(l.line, "one transition to a line: write a chain line by line"); continue; }
        if (from === START && to === END) { err(l.line, "[start] -> [end] has no state in between: name the first state"); continue; }
        if (from !== START && !groups.has(from) && !see(from, l.line, l.step)) continue;
        if (to !== END && !groups.has(to) && !see(to, l.line, l.step)) continue;
        if (from === START && started) { err(l.line, "[start] points at one state: start in one, or put a choice after it (choice first)"); continue; }
        const twice = event ? byEvent.get(`${from} ${event}`) : bare.get(`${from} ${to}`);
        if (twice) { err(l.line, event ? `two transitions "${event}" from ${from} (first at line ${twice.line}): a walk cannot know which to take; give them different events, or lead both through a choice` : `${from} -> ${to} is written twice (first at line ${twice.line}); give the second an event`); continue; }
        // several events on one way share one line
        const way = `${from} ${to} ${l.step}`;
        let move = event ? shared.get(way) : undefined;
        if (move) move.events.push(event);
        else {
          move = { from, to, events: [event], line: l.line, step: l.step };
          moves.push(move);
          if (event) shared.set(way, move);
        }
        if (event) byEvent.set(`${from} ${event}`, move); else bare.set(`${from} ${to}`, move);
        if (from === START) started = true;
      } catch (e) { err(l.line, (e as Error).message); }
    }
    for (const g of groups.values()) g.kids = g.kids.filter((k) => {
      const s = states.get(k);
      if (!s) { err(g.line, `group ${g.id} names "${k}", and there is no such state: use it in a transition, or declare it (state ${k})`); return false; }
      if (s.group) { err(g.line, `${k} is in group ${s.group} already; a state is in one group`); return false; }
      s.group = g.id;
      return true;
    });
    for (const m of moves) {
      const a = states.get(m.from), b = states.get(m.to);
      if ((a?.group && a.group === m.to) || (b?.group && b.group === m.from)) err(m.line, `${m.from} -> ${m.to}: a transition cannot join a group to a state inside it; point it at the state`);
    }

    // ---- what can be reached
    const first = (id: string) => groups.get(id)?.kids[0] ?? id;
    const inGroup = (id: string) => states.get(id)?.group ?? null;
    const startMove = moves.find((m) => m.from === START);
    const order: string[] = [], seen = new Set<string>(), entered = new Set<string>();
    const out1 = new Map<string, number[]>(); // the transitions out of each state and group, as written
    moves.forEach((m, k) => { const of = out1.get(m.from); if (of) of.push(k); else out1.set(m.from, [k]); });
    const visit = (id0: string) => {
      const queue = [id0];
      for (let k = 0; k < queue.length; k++) {
        const id = first(queue[k]);
        if (seen.has(id) || !states.has(id)) continue;
        seen.add(id); order.push(id);
        // a group's own transitions count once, with the first of its states
        const g = inGroup(id), own = out1.get(id) ?? [];
        let ways = own;
        if (g && !entered.has(g)) { entered.add(g); if (g !== id) ways = [...own, ...(out1.get(g) ?? [])].sort((a, b) => a - b); }
        for (const w of ways) if (moves[w].to !== END) queue.push(moves[w].to);
      }
    };
    if (startMove) {
      visit(startMove.to);
      for (const s of states.values()) if (!seen.has(s.id)) warn(s.line, `${s.id} cannot be reached from [start]: add a transition into it, or take it out`);
    }
    for (const s of states.values()) visit(s.id);

    // ---- the scene
    const node = (id: string) => (id === START ? "i.start" : groups.has(id) ? `g.${id}` : `s.${id}`);
    const target = (m: Move) => (m.to === END ? `e.${m.from}` : node(m.to));
    const noted = (note: string) => (note ? ` note=${q(note)}` : "");
    if (startMove) out.decl(`initial i.start "start"`, startMove.line, startMove.step);
    const made = new Set<string>(), later: State[] = [];
    for (const id of order) {
      const s = states.get(id)!, g = s.group ? groups.get(s.group)! : null;
      if (g && !made.has(g.id)) { made.add(g.id); out.decl(`group g.${g.id} ${q(g.label)} layout=graph dir=down${out.use(g.colour)}${noted(g.note)}`, g.line, g.step); }
      const inside = g && g.step <= s.step ? ` in g.${g.id}` : "";
      if (g && !inside) later.push(s);
      out.decl(`${s.choice ? "diamond" : "box"} s.${id}${inside} ${q(s.label)}${out.use(s.colour)}${noted(s.note)}`, s.line, s.step);
    }
    for (const s of later) out.add(`move s.${s.id} to g.${s.group}`, groups.get(s.group!)!.line, groups.get(s.group!)!.step);
    const ended = new Set<string>(), pairs = new Set<string>();
    for (const m of moves) {
      const step = Math.max(m.step, groups.get(m.from)?.step ?? -1, groups.get(m.to)?.step ?? -1), a = node(m.from), b = target(m);
      if (m.to === END && !ended.has(b)) {
        ended.add(b);
        out.decl(`final ${b} "end"`, m.line, step);
      }
      const pair = [a, b].sort().join(" "), also = a === b || pairs.has(pair);
      pairs.add(pair);
      const words = m.events.filter(Boolean).join(" / ");
      out.add(`${a} -> ${b}${also ? " also=yes" : ""}${words ? ` ${q(words)}` : ""}`, m.line, step);
    }

    // ---- the walk
    let cur: string | null = null, curTone = "";
    const trail: string[][] = p.steps.map(() => []), fired = new Set<number>();
    const restore = () => (cur ? `set ${curTone} tone=${toneOf(states.get(cur)?.colour ?? "")}` : "");
    // a walk reads down the page, so what each state can fire only grows
    const open = new Map<string, Move[]>(), fires = new Map<string, Move>();
    const known = [...states.keys()].slice(0, 12).join(", ");
    let grown = 0;
    for (const w of walk) {
      for (; grown < moves.length && moves[grown].step <= w.step; grown++) {
        const m = moves[grown], of = open.get(m.from);
        if (of) of.push(m); else open.set(m.from, [m]);
        for (const e of m.events) if (e) fires.set(`${m.from} ${e}`, m);
      }
      if (w.kind === "at") {
        if (!states.has(w.word) && !groups.has(w.word)) { err(w.line, `at ${w.word}: there is no state "${w.word}" (states: ${known})`); continue; }
        const next = first(w.word);
        if (cur && cur !== next) out.add(restore(), w.line, w.step);
        cur = next; curTone = node(next);
        out.add(`set ${curTone} tone=acc`, w.line, w.step);
        if (w.step >= 0) trail[w.step].push(`at ${next}`);
        continue;
      }
      if (fired.has(w.step)) { err(w.line, "one fire to a step: each transition is its own step, with its own caption"); continue; }
      if (!cur) {
        const s0 = startMove && startMove.step <= w.step ? first(startMove.to) : null;
        if (!s0) { err(w.line, `fire ${w.word} has no current state: write at <state> in an earlier step, or give the machine a [start] -> <state> line`); continue; }
        cur = s0; curTone = node(s0);
      }
      const from: string[] = [cur, inGroup(cur)].filter((x): x is string => !!x);
      const at: string[] = [...new Set(from)], here: Move[][] = at.map((f) => open.get(f) ?? []), n: number = here.reduce((s, xs) => s + xs.length, 0);
      const found: Move | undefined = w.word ? at.map((f) => fires.get(`${f} ${w.word}`)).find(Boolean) : n === 1 ? here.find((xs) => xs.length)![0] : undefined;
      if (!found) {
        const there: string[] = [];
        for (const xs of here) for (const m of xs) { if (there.length > 12) break; for (const e of m.events) { if (e) there.push(e); if (there.length > 12) break; } }
        const listed = there.slice(0, 12).map((e) => `"${e}"`).join(", ") + (there.length > 12 ? ", ..." : "");
        err(w.line, w.word
          ? `fire ${w.word}: ${cur} has no transition with that event; ${there.length ? `the events there are ${listed}` : "no transition with an event leaves it"}`
          : `fire needs the event's name here (${cur} has ${n} transitions out): fire ${there[0] ?? "<event>"}`);
        continue;
      }
      fired.add(w.step);
      out.add(restore(), w.line, w.step);
      out.add(`send both ${node(found.from)} -> ${target(found)}`, w.line, w.step);
      const to: string | null = found.to === END ? null : first(found.to);
      out.add("then", w.line, w.step);
      out.add(to ? `set ${node(to)} tone=acc` : `highlight ${target(found)}`, w.line, w.step);
      trail[w.step].push(`${cur} -> ${to ?? "the end"}${w.word ? ` (${w.word})` : ""}`);
      cur = to; curTone = to ? node(to) : "";
    }

    // ---- the LLM view
    const ends = [...new Set(moves.filter((m) => m.to === END).map((m) => m.from))];
    const say = [
      `State machine${p.attrs.title ? `: ${p.attrs.title}` : ""}.`,
      startMove || ends.length ? `${[startMove && `Starts at ${startMove.to}`, ends.length && `ends after ${ends.join(", ")}`].filter(Boolean).join("; ").replace(/^e/, "E")}.` : "",
    ].filter(Boolean).join(" ");
    const rows = moves.filter((m) => m.from !== START && m.to !== END).flatMap((m) => m.events.map((e) => [m.from, e || "(none)", m.to]));
    for (const m of moves) if (m.to === END && m.events.some(Boolean)) for (const e of m.events) rows.push([m.from, e || "(none)", "the end"]);
    const table = rows.length ? ["| from | on | to |", "| --- | --- | --- |", ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n") : "";
    const about = [
      ...[...states.values()].filter((s) => s.note || (s.label && s.label !== s.id)).map((s) => `- ${s.id}${s.label && s.label !== s.id ? ` (${s.label})` : ""}${s.note ? `: ${s.note}` : ""}`),
      ...[...groups.values()].map((g) => `- ${g.id}${g.label !== g.id ? ` (${g.label})` : ""}, a group of ${g.kids.join(", ")}; a transition to it enters ${g.kids[0] ?? "it"}${g.note ? `: ${g.note}` : ""}`),
    ].join("\n");
    const steps = p.steps.map((s, k) => `${k + 1}. ${s.title}${trail[k].map((t) => `\n   ${t}`).join("")}`).join("\n");
    return {
      llm: [say, table, about, steps].filter(Boolean).join("\n\n"),
      shape: JSON.stringify([[...states.values()].map((s) => [s.id, s.choice, s.step, s.colour, !!s.note]), [...groups.values()].map((g) => [g.id, g.kids, g.step]), moves.map((m) => [m.from, m.to, m.events.length, m.step]), walk.map((w) => [w.kind, w.step, w.kind === "at" ? w.word : ""])]),
      texts: [...[...states.values()].flatMap((s) => [s.label, s.note]), ...[...groups.values()].flatMap((g) => [g.label, g.note]), ...moves.flatMap((m) => m.events)],
      notes,
      things: states.size + groups.size + ended.size + (startMove ? 1 : 0),
      links: moves.length,
    };
  });
}

// the first colon outside quotes
function cutColon(s: string): [string, string | null] {
  let inQ = false;
  for (let i = 0; i < s.length; i++) { if (s[i] === '"') inQ = !inQ; else if (!inQ && s[i] === ":") return [s.slice(0, i).trim(), s.slice(i + 1)]; }
  return [s.trim(), null];
}
