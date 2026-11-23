// Real touch, mouse and keyboard checks of the graph part, in a browser (a script, not part of the test suite).
//   bun scripts/part-check.ts graph          (builds dist/part-check/graph/)
//   bun example/serve.ts dist/part-check/graph <port> &
//   bun scripts/graph-touch-check.ts http://127.0.0.1:<port>/index.html [w=390] [dark] [shots=<dir>]
// Every action is real input through the browser's pipeline (Input.dispatchTouchEvent / MouseEvent / KeyEvent). The
// results are read back from what is drawn: cytoscape's own instance (the container's registry) for the real node
// positions on screen, and the DOM. Which nodes must show after a focus is worked out here from the part's props
// (the edges as the author wrote them), not read from the part's own classes.
import { launch, type Page } from "./cdp";
const [url, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => (a.includes("=") ? a.split("=") : [a, "1"])));
const W = +(opt.w ?? 390), phone = W < 600;
const results: { check: string; ok: boolean; got: unknown }[] = [];
const ok = (check: string, cond: boolean, got: unknown) => { results.push({ check, ok: cond, got }); console.log(`${cond ? "ok  " : "FAIL"} ${check} ${JSON.stringify(got)}`); };

const G = (i: number) => `document.querySelectorAll(".gr")[${i}]`;
const CY = (i: number) => `${G(i)}.querySelector(".gr-cy")._cyreg.cy`;
async function rectOf(p: Page, expr: string) { return p.eval<{ x: number; y: number; w: number; h: number }>(`(() => { const r = (${expr}).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`); }
/** a touch, in the visual viewport's own coordinates: its offset is not 0 after a pinch or a scroll in the emulated phone */
async function T(p: Page, type: "touchStart" | "touchMove" | "touchEnd", pts: { x: number; y: number }[]) {
  const vv = await p.eval<{ x: number; y: number }>(`({ x: visualViewport.offsetLeft, y: visualViewport.offsetTop })`);
  await p.touch(type, pts.map((q) => ({ x: q.x - vv.x, y: q.y - vv.y })));
}
async function tap(p: Page, x: number, y: number) {
  if (phone) { await T(p, "touchStart", [{ x, y }]); await p.sleep(60); await T(p, "touchEnd", []); }
  else { await p.mouse("mouseMoved", x, y); await p.mouse("mousePressed", x, y, "left", 1); await p.mouse("mouseReleased", x, y, "left", 0); }
  await p.sleep(250);
}
/** tap the middle of an element, scrolled into the middle of the window first if it is out of it (the side list is below the stage on a phone) */
async function tapEl(p: Page, expr: string) {
  await p.eval(`(() => { const e = ${expr}, r = e.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) { e.scrollIntoView({ block: "center" }); } })()`); await p.sleep(250);
  const r = await rectOf(p, expr); await tap(p, r.x + r.w / 2, r.y + r.h / 2); return r; }
/** the nodes 1 or 2 steps from `id` in the visible view, worked out here from the part's props and the fold state */
async function expected(p: Page, i: number, id: string, steps: number) {
  return p.eval<string[]>(`(() => {
    const props = JSON.parse(document.getElementById("dh-doc").textContent).blocks.filter((b) => b.type === "graph")[${i}].data;
    const cy = ${CY(i)};
    const shown = new Set(cy.nodes().map((n) => n.id()));
    const parent = new Map([...props.nodes.map((n) => [n.id, n.group]), ...props.groups.map((g) => [g.id, g.parent])]);
    const rep = (x) => { let r = x; for (let p = parent.get(x); p; p = parent.get(p)) if (shown.has(p) && cy.getElementById(p).hasClass("gr-folded")) r = p; return r; };
    let near = new Set([${JSON.stringify(id)}]);
    for (let k = 0; k < ${steps}; k++) { const next = new Set(near); for (const e of props.edges) { const a = rep(e.from), b = rep(e.to); if (near.has(a)) next.add(b); if (near.has(b)) next.add(a); } near = next; }
    return [...near].filter((x) => shown.has(x) && !cy.getElementById(x).isParent());
  })()`);
}
/** the real boxes of those nodes on screen (cytoscape's rendered bounding boxes, plus the stage's place on the page) */
async function insideStage(p: Page, i: number, ids: string[]) {
  return p.eval<{ out: string[]; n: number; stage: number[] }>(`(() => {
    const cy = ${CY(i)}, st = ${G(i)}.querySelector(".gr-stage").getBoundingClientRect(), box = ${G(i)}.querySelector(".gr-cy").getBoundingClientRect();
    const out = [];
    for (const id of ${JSON.stringify(ids)}) { const b = cy.getElementById(id).renderedBoundingBox({ includeLabels: false, includeUnderlays: false, includeOverlays: false });
      const x1 = box.x + b.x1, x2 = box.x + b.x2, y1 = box.y + b.y1, y2 = box.y + b.y2;
      if (x1 < st.x - 0.5 || x2 > st.right + 0.5 || y1 < st.y - 0.5 || y2 > st.bottom + 0.5 || x1 < 0 || x2 > innerWidth) out.push(id + " " + [x1, y1, x2, y2].map(Math.round).join(",")); }
    return { out, n: ${JSON.stringify(ids)}.length, stage: [st.x, st.y, st.right, st.bottom].map(Math.round) };
  })()`);
}

const p = await launch();
try {
  await p.viewport(W, phone ? 844 : 900, phone);
  if (opt.dark) { await p.dark(true); }
  await p.goto(url);
  if (opt.dark) await p.eval(`document.documentElement.dataset.theme = "dark"`);
  const i = 1; // the service call graph: 120 nodes in 8 groups, force
  await p.eval(`${G(i)}.scrollIntoView({ block: "start" })`);
  let ready = false;
  for (let k = 0; k < 80 && !ready; k++) { ready = await p.eval<boolean>(`${G(i)}.classList.contains("is-ready")`); if (!ready) await p.sleep(250); }
  ok("cytoscape loaded when the part came near", ready, null);
  // the stage at the top of the screen, toolbar above it
  await p.eval(`window.scrollBy(0, ${G(i)}.querySelector(".gr-bar").getBoundingClientRect().top - 8)`); await p.sleep(500);
  const st = await rectOf(p, `${G(i)}.querySelector(".gr-stage")`);
  ok("no sideways scroll", await p.eval<boolean>(`document.documentElement.scrollWidth <= innerWidth`), await p.eval(`[document.documentElement.scrollWidth, innerWidth]`));
  // the groups start folded when the whole graph would be drawn too small to touch: one pill each, all in the stage
  const pills = await p.eval<number>(`${CY(i)}.nodes(".gr-folded").length`);
  if (pills) {
    ok("the 8 groups start folded, one pill each", pills === 8, pills);
    const inside = await insideStage(p, i, await p.eval<string[]>(`${CY(i)}.nodes(".gr-folded").map((n) => n.id())`));
    const minH = await p.eval<number>(`Math.min(...${CY(i)}.nodes(".gr-folded").map((n) => n.renderedOuterHeight()))`);
    ok("every pill is inside the stage and at least 24 px tall", inside.out.length === 0 && minH >= 24, { out: inside.out, minH: Math.round(minH), zoom: +(await p.eval<number>(`${CY(i)}.zoom()`)).toFixed(2) });
    await tapEl(p, `${G(i)}.querySelector(".gr-bar .gr-btn")`); await p.sleep(900);   // Open groups
  }
  const nodesOnCanvas = await p.eval<number>(`${CY(i)}.nodes(".gr-node").length`);
  ok("all 120 nodes are on the canvas", nodesOnCanvas === 120, nodesOnCanvas);

  // 1. pan: a one-finger drag on the stage moves the graph by the drag
  const pan0 = await p.eval<{ x: number; y: number }>(`${CY(i)}.pan()`);
  const sx = st.x + st.w * 0.5, sy = st.y + st.h * 0.5;
  if (phone) { await T(p, "touchStart", [{ x: sx, y: sy }]); for (let k = 1; k <= 10; k++) { await T(p, "touchMove", [{ x: sx - 6 * k, y: sy + 4 * k }]); await p.sleep(16); } await T(p, "touchEnd", []); }
  else await p.drag(sx, sy, sx - 60, sy + 40);
  await p.sleep(400);
  const pan1 = await p.eval<{ x: number; y: number }>(`${CY(i)}.pan()`);
  // cytoscape starts a pan after its tap threshold (about 8 px of travel), so the graph moves a little less than the finger
  ok("pan: a drag moves the graph with the finger (less its tap threshold)", Math.abs(pan1.x - pan0.x + 60) < 24 && Math.abs(pan1.y - pan0.y - 40) < 24 && pan1.x < pan0.x - 30 && pan1.y > pan0.y + 20, { dx: Math.round(pan1.x - pan0.x), dy: Math.round(pan1.y - pan0.y) });
  // the stage's place on screen, not scrollY: parts above it still load and the browser keeps the view still by scrolling
  const stageTop = async () => Math.round(await p.eval<number>(`${G(i)}.querySelector(".gr-stage").getBoundingClientRect().top`));
  const scrolled = await stageTop();

  // 2. pinch (phone) or Ctrl + wheel (desktop): zoom in
  const z0 = await p.eval<number>(`${CY(i)}.zoom()`);
  if (phone) {
    await T(p, "touchStart", [{ x: sx - 30, y: sy }, { x: sx + 30, y: sy }]);
    for (let k = 1; k <= 10; k++) { await T(p, "touchMove", [{ x: sx - 30 - 6 * k, y: sy }, { x: sx + 30 + 6 * k, y: sy }]); await p.sleep(16); }
    await T(p, "touchEnd", []);
  } else { for (let k = 0; k < 4; k++) await p.wheel(sx, sy, 0, -120, 2); }
  await p.sleep(400);
  const z1 = await p.eval<number>(`${CY(i)}.zoom()`);
  ok(`${phone ? "pinch" : "Ctrl + wheel"}: zooms in`, z1 > z0 * 1.3, { z0: +z0.toFixed(3), z1: +z1.toFixed(3) });
  { const t1 = await stageTop(); ok("the page did not scroll during pan and pinch (the stage stayed where it was on screen)", Math.abs(t1 - scrolled) <= 1, { before: scrolled, after: t1 }); }
  if (!phone) {
    const y0 = await stageTop(), zz = await p.eval<number>(`${CY(i)}.zoom()`);
    await p.wheel(sx, sy, 0, 200); await p.sleep(400);
    const y1 = await stageTop(); ok("a plain wheel scrolls the page, not the graph", y1 < y0 - 50 && Math.abs((await p.eval<number>(`${CY(i)}.zoom()`)) - zz) < 1e-6, { stageMovedUp: y0 - y1 });
    await p.eval(`window.scrollBy(0, ${G(i)}.querySelector(".gr-bar").getBoundingClientRect().top - 8)`); await p.sleep(300);
  }
  // the zoom buttons: Show the whole graph
  await tapEl(p, `${G(i)}.querySelector(".gr-zoom button:nth-child(3)")`); await p.sleep(700);
  const all = await insideStage(p, i, await p.eval<string[]>(`${CY(i)}.nodes(".gr-node").map((n) => n.id())`));
  ok("Show the whole graph: every node inside the stage", all.out.length === 0, all.out.slice(0, 5));
  const zf = await p.eval<number>(`${CY(i)}.zoom()`);
  await tapEl(p, `${G(i)}.querySelector(".gr-zoom button:nth-child(1)")`); await p.sleep(500);
  const zb = await p.eval<number>(`${CY(i)}.zoom()`);
  ok("the zoom-in button zooms in", zb > zf * 1.2, { before: +zf.toFixed(3), after: +zb.toFixed(3) });

  // 3. tap a node: checkout (pick its real place on screen after showing the whole graph)
  await tapEl(p, `${G(i)}.querySelector(".gr-zoom button:nth-child(3)")`); await p.sleep(700);
  const target = "checkout";
  const where = () => p.eval<{ x: number; y: number; h: number }>(`(() => { const b = ${G(i)}.querySelector(".gr-cy").getBoundingClientRect(), n = ${CY(i)}.getElementById(${JSON.stringify(target)}), r = n.renderedPosition(); return { x: b.x + r.x, y: b.y + r.y, h: n.renderedOuterHeight() }; })()`);
  // the whole graph is small on a phone: spread two fingers (or Ctrl + wheel) on the node until it is big enough to hit
  for (let k = 0; k < 5; k++) {
    const w = await where(); if (w.h >= 24) break;
    if (phone) { await T(p, "touchStart", [{ x: w.x - 20, y: w.y }, { x: w.x + 20, y: w.y }]); for (let s = 1; s <= 10; s++) { await T(p, "touchMove", [{ x: w.x - 20 - 7 * s, y: w.y }, { x: w.x + 20 + 7 * s, y: w.y }]); await p.sleep(16); } await T(p, "touchEnd", []); }
    else { for (let s = 0; s < 4; s++) await p.wheel(w.x, w.y, 0, -120, 2); }
    await p.sleep(500);
  }
  const at = await where();
  await tap(p, at.x, at.y); await p.sleep(900);
  const side = await p.eval<string>(`${G(i)}.querySelector(".gr-info-t b")?.textContent ?? ""`);
  ok("tap a node: the side list shows it", side === target, side);
  const want1 = await expected(p, i, target, 1);
  const in1 = await insideStage(p, i, want1);
  ok(`focus 1 step: its ${want1.length} nodes (worked out from the edges) are all inside the visible stage`, in1.out.length === 0 && want1.length > 3, { n: want1.length, out: in1.out });
  const faded = await p.eval<string[]>(`${CY(i)}.nodes(".gr-node").filter((n) => n.hasClass("gr-faded")).map((n) => n.id())`);
  const shownIds = await p.eval<string[]>(`${CY(i)}.nodes(".gr-node").filter((n) => !n.hasClass("gr-faded")).map((n) => n.id())`);
  ok("focus 1 step: exactly those nodes stay lit, the rest fade", shownIds.sort().join() === [...want1].sort().join(), { lit: shownIds.length, want: want1.length, faded: faded.length });
  const outs = await p.eval<number>(`${G(i)}.querySelectorAll(".gr-list.is-out li").length`), ins = await p.eval<number>(`${G(i)}.querySelectorAll(".gr-list.is-in li").length`);
  const wantOut = await p.eval<number>(`(() => { const s = JSON.parse(document.getElementById("dh-doc").textContent).blocks.filter((b) => b.type === "graph")[${i}].data; return new Set(s.edges.filter((e) => e.from === ${JSON.stringify(target)}).map((e) => e.to)).size; })()`);
  const wantIn = await p.eval<number>(`(() => { const s = JSON.parse(document.getElementById("dh-doc").textContent).blocks.filter((b) => b.type === "graph")[${i}].data; return new Set(s.edges.filter((e) => e.to === ${JSON.stringify(target)}).map((e) => e.from)).size; })()`);
  ok("the side list: links out and in match the edges as written", outs === wantOut && ins === wantIn, { outs, ins, wantOut, wantIn });
  const tag = await p.eval<{ text: string; vis: string; fs: number }>(`(() => { const t = ${G(i)}.querySelector(".gr-tag"); return { text: t.querySelector("b")?.textContent ?? "", vis: t.style.visibility, fs: parseFloat(getComputedStyle(t.querySelector("b")).fontSize) }; })()`);
  ok("the DOM label over the focused node", tag.text === target && tag.vis === "visible" && tag.fs >= 12, tag);
  if (opt.shots) { await p.shot(`${opt.shots}/touch-${W}${opt.dark ? "-dark" : ""}-focus1.png`); }

  // 4. the step buttons: 2 steps
  await tapEl(p, `${G(i)}.querySelectorAll(".gr-seg button")[1]`); await p.sleep(900);
  ok("2 steps: the button is pressed", await p.eval<boolean>(`${G(i)}.querySelectorAll(".gr-seg button")[1].getAttribute("aria-pressed") === "true"`), null);
  const want2 = await expected(p, i, target, 2);
  const in2 = await insideStage(p, i, want2);
  const lit2 = await p.eval<number>(`${CY(i)}.nodes(".gr-node").filter((n) => !n.hasClass("gr-faded")).length`);
  ok(`focus 2 steps: its ${want2.length} nodes are lit and all inside the visible stage`, in2.out.length === 0 && lit2 === want2.length && want2.length > want1.length, { n: want2.length, lit: lit2, out: in2.out });
  if (opt.shots) { await p.shot(`${opt.shots}/touch-${W}${opt.dark ? "-dark" : ""}-focus2.png`); }
  await tapEl(p, `${G(i)}.querySelectorAll(".gr-seg button")[0]`); await p.sleep(600);
  ok("1 step again", (await p.eval<number>(`${CY(i)}.nodes(".gr-node").filter((n) => !n.hasClass("gr-faded")).length`)) === want1.length, null);

  // 5. fold a group: clear the focus (the X), then Fold "payments" in the side list; then Open it again
  await tapEl(p, `${G(i)}.querySelector(".gr-x")`); await p.sleep(500);
  // the members of the payments group, from the page's data (the canvas has no parent nodes)
  const payIds = await p.eval<string[]>(`JSON.parse(document.getElementById("dh-doc").textContent).blocks.filter((b) => b.type === "graph")[${i}].data.nodes.filter((n) => n.group === "payments").map((n) => n.id)`);
  const PAY = `new Set(${JSON.stringify(payIds)})`;
  const row = await p.eval<number>(`[...${G(i)}.querySelectorAll(".gr-grow")].findIndex((r) => r.textContent.includes("payments"))`);
  await tapEl(p, `${G(i)}.querySelectorAll(".gr-grow")[${row}].querySelector(".gr-btn")`); await p.sleep(900);
  const f = await p.eval<{ members: number; folded: boolean; count: number; label: string; edgesIn: number }>(`(() => { const cy = ${CY(i)}; const g = cy.getElementById("payments"); return { members: cy.nodes(".gr-node").filter((n) => ${PAY}.has(n.id())).length, folded: g.hasClass("gr-folded"), count: g.data("count"), label: g.data("label"), edgesIn: g.connectedEdges().length }; })()`);
  ok("fold payments: its 15 nodes leave, one folded box with the count stands for them, their lines join on it", f.members === 0 && f.folded && f.count === 15 && f.edgesIn > 0, f);
  if (opt.shots) { await p.shot(`${opt.shots}/touch-${W}${opt.dark ? "-dark" : ""}-folded.png`); }
  await tapEl(p, `${G(i)}.querySelectorAll(".gr-grow")[${row}].querySelector(".gr-btn")`); await p.sleep(900);
  const back = await p.eval<{ n: number; btn: string; folded: boolean }>(`(() => { const cy = ${CY(i)}; return { n: cy.nodes(".gr-node").filter((n) => ${PAY}.has(n.id())).length, btn: ${G(i)}.querySelectorAll(".gr-grow")[${row}].querySelector(".gr-btn").textContent, folded: cy.getElementById("payments").hasClass("gr-folded") }; })()`);
  ok("open payments again: its 15 nodes are back", back.n === 15, back);
  // a tap on the background clears a focus
  await tap(p, at.x, at.y); await p.sleep(500);
  // the whole graph, then a tap in the stage's corner: the fit leaves a margin, so no node or group area is there
  await tapEl(p, `${G(i)}.querySelector(".gr-zoom button:nth-child(3)")`); await p.sleep(700);
  await p.eval(`${G(i)}.querySelector(".gr-cy").scrollIntoView({ block: "center" })`); await p.sleep(300);
  const corner = await p.eval<{ x: number; y: number }>(`(() => { const b = ${G(i)}.querySelector(".gr-cy").getBoundingClientRect(); return { x: b.x + 6, y: b.y + 6 }; })()`);
  await tap(p, corner.x, corner.y); await p.sleep(500);
  const cleared = await p.eval<{ faded: number; info: string; corner: number[] }>(`({ faded: ${CY(i)}.nodes(".gr-faded").length, info: ${G(i)}.querySelector(".gr-info-t b")?.textContent ?? "", corner: [${Math.round(corner.x)}, ${Math.round(corner.y)}] })`);
  ok("a tap on the background clears the focus", cleared.faded === 0 && !cleared.info, cleared);

  // 6. search: type, the list shows, Enter frames and lights the node
  await p.eval(`${G(i)}.querySelector(".gr-find-input").focus()`);
  for (const ch of "ledg") await p.key(ch);
  await p.sleep(300);
  const hits = await p.eval<string[]>(`[...${G(i)}.querySelectorAll(".gr-hits .gr-hit-l")].map((x) => x.textContent)`);
  ok("search: typing lists the matches", hits[0] === "ledger", hits);
  await p.key("Enter", "Enter", 13); await p.sleep(900);
  const lit = await p.eval<{ sel: boolean; found: boolean }>(`(() => { const n = ${CY(i)}.getElementById("ledger"); return { sel: n.hasClass("gr-sel"), found: n.hasClass("gr-found") }; })()`);
  const inL = await insideStage(p, i, await expected(p, i, "ledger", 1));
  ok("search Enter: the node is focused, lit, and its neighbourhood framed in the stage", lit.sel && lit.found && inL.out.length === 0, { ...lit, out: inL.out });

  // 7. keyboard: Tab from the steps to the node list; the focused node gets a ring (its button sits over it); Enter; Escape
  await p.key("Escape", "Escape", 27); await p.sleep(200);
  await p.key("Escape", "Escape", 27); await p.sleep(300);
  await p.eval(`${G(i)}.querySelector(".gr-bar .gr-btn").focus()`);
  await p.key("Tab", "Tab", 9); await p.sleep(400);
  const kb = await p.eval<{ id: string; ring: string; over: boolean; label: string; at: number[]; want: number[] }>(`(() => { const b = document.activeElement; const cy = ${CY(i)}; const n = cy.getElementById(b.dataset.id); const bb = n.renderedBoundingBox({ includeLabels: false }); const r = b.getBoundingClientRect(), c = ${G(i)}.querySelector(".gr-cy").getBoundingClientRect(); const s = getComputedStyle(b); return { id: b.dataset.id ?? "", ring: s.outlineStyle + " " + s.outlineWidth, over: n.length ? Math.abs(r.x - (c.x + bb.x1 - 4)) < 2 && Math.abs(r.width - (bb.w + 8)) < 2 : r.x >= c.x - 8 && r.right <= c.right + 8 && r.y >= c.y - 40 && r.bottom <= c.bottom + 8 && r.width >= 8 && r.height >= 8, at: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], want: [Math.round(c.x + bb.x1 - 4), Math.round(c.y + bb.y1 - 4), Math.round(bb.w + 8), Math.round(bb.h + 8)], label: ${G(i)}.querySelector(".gr-tag b")?.textContent ?? "" }; })()`);
  ok("Tab reaches the first node in reading order; a visible ring sits round it, and its label shows", !!kb.id && /solid/.test(kb.ring) && kb.over && kb.label.length > 0, kb);
  await p.key("ArrowDown", "ArrowDown", 40); await p.sleep(250);
  const kb2 = await p.eval<string>(`document.activeElement.dataset.id ?? ""`);
  ok("ArrowDown steps to the next node", !!kb2 && kb2 !== kb.id, kb2);
  await p.key("Enter", "Enter", 13); await p.sleep(800);
  ok("Enter focuses it", await p.eval<boolean>(`${CY(i)}.getElementById(${JSON.stringify(kb2)}).hasClass("gr-sel")`), null);
  await p.key("Escape", "Escape", 27); await p.sleep(400);
  ok("Escape clears", (await p.eval<number>(`${CY(i)}.nodes(".gr-sel").length`)) === 0, null);

  // 8. touch targets: every control at least 24 px (the part's own are 32 to 40)
  const small = await p.eval<string[]>(`[...${G(i)}.querySelectorAll("button, input")].filter((b) => !b.closest(".gr-kb-list") && b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return [b.textContent.trim().slice(0, 20) || b.getAttribute("aria-label"), Math.round(r.width), Math.round(r.height)]; }).filter((x) => x[1] < 24 || x[2] < 24).map(String)`);
  ok("touch targets: none under 24 px", small.length === 0, small);
  const words = await p.eval<number>(`Math.min(...[...${G(i)}.querySelectorAll("*")].filter((e) => e.offsetParent && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && getComputedStyle(e).visibility !== "hidden").map((e) => parseFloat(getComputedStyle(e).fontSize)))`);
  ok("no word under 11 px in the part's DOM", words >= 11, words);
  const minCanvasFont = await p.eval<number>(`(() => { const cy = ${CY(i)}; return Math.min(...cy.nodes().map((n) => n.pstyle("min-zoomed-font-size").pfValue).filter((x) => x > 0)); })()`);
  ok("the canvas draws no node word under 11 px (min-zoomed-font-size)", minCanvasFont >= 11, minCanvasFont);
} finally {
  await p.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(JSON.stringify({ width: W, dark: !!opt.dark, checks: results.length, failing: bad }));
  process.exitCode = bad ? 1 : 0;
}
