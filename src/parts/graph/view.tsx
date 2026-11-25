// The graph part's view (format version 11): an explorable network graph. Rendered at build time as a still picture of the
// groups and their counts (also what a reader with no script sees, and what `static` draws); cytoscape loads only when the
// part scrolls near and then draws the whole graph on a canvas, styled from our tokens (style.css).
//
// Three layers on the stage, bottom to top: the groups as soft tinted areas (an SVG under the canvas; layers and force
// only, as a radial ring would wrap a group round the centre), cytoscape's canvas (pills in family colours, the lines),
// and the words: when the canvas is zoomed out too far to draw a node's name at 11 px, a DOM label layer names as many
// nodes as fit without touching, most connected first (as a map names its biggest towns first).
//
// Explore: search (the node is framed and lit), tap or Enter to focus a node or a group with 1 or 2 steps out (the rest
// fade), fold and open groups, pan and zoom (pinch on a phone, Ctrl + scroll or the buttons on a desktop), and a side list
// of the focused node's links in and out (below the graph on a phone). Keyboard: Tab through the nodes in reading order
// (a ring and a label show which), Enter focuses, the arrows step, Escape clears.
//
// Strict Trusted Types: no HTML string anywhere. cytoscape draws on canvas; every word on top is React text or textContent.
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Budget, BudgetError, partLimitsOf } from "../../core/budget";
import type { PartViewProps } from "../types";
import { useStatic } from "../kit/static";
import type { GNode, GraphSpec, Still } from "./shape";
import { nodeWidth as nodeW } from "./shape";
import { ancestors, anchorId, compactOf, hullOf, modelOf, nearHull, parentOf, repOf, startsFolded, viewOf, type Hull, type Pt } from "./model";
import { forceLayout } from "./force";

// the words of the part (English; the renderer's shared words come from `ui`)
export const GRAPH_UI = {
  find: "Find a node", findLabel: "Find a node in the graph", noMatch: "No node matches", tooMuch: "too much work: make it smaller",
  focus: "Focus", step1: "1 step", step2: "2 steps", foldAll: "Fold groups", openAll: "Open groups",
  zoomIn: "Zoom in", zoomOut: "Zoom out", fit: "Show the whole graph", clear: "Clear",
  fold: "Fold", open: "Open", folded: "folded", nodes: "nodes", edges: "edges", groups: "Groups", group: "group",
  out: "Links out", in: "Links in", none: "none", members: "Inside", more: "more",
  mostConnected: "Most connected", inGroup: "in", loading: "Loading the graph…", noScript: "Turn on scripts to explore every node.",
  hintMouse: "Drag to move · Ctrl + scroll to zoom · click a node or a group to focus it", hintTouch: "Drag to move · pinch to zoom · tap a node or a group to focus it",
  overview: "Tap a node, or Tab to one and press Enter, to see what it links to.", nodeList: "Nodes of the graph, in reading order",
  cannot: "This graph cannot be drawn:", stillNote: "The groups, with how many nodes each holds; a line counts the edges between two groups.",
  links: (n: number) => `${n} link${n === 1 ? "" : "s"}`,
};
type GUi = typeof GRAPH_UI;

const NODE_H = 30, FOLD_H = 40, MIN_PX = 11, LOD_PX = 12, LOD_MAX = 80;
// the zoom buttons sit at the box's right edge (8 px in, 46 wide): the graph is framed in the room left of them, so no name hides under one
export const CONTROLS_W = 56;

// ------------------------------------------------------------------ tokens to cytoscape's style sheet
const TONES = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "acc", "good", "warn", "bad", "muted"];
/** read a CSS colour (a token, color-mix(), anything) as rgba() through a 1-pixel canvas: cytoscape reads only rgb, hex and hsl */
function colourReader(el: HTMLElement) {
  const probe = document.createElement("span"); probe.style.display = "none"; el.appendChild(probe);
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true })!;
  const read = (expr: string) => {
    probe.style.color = ""; probe.style.color = expr;
    const c = getComputedStyle(probe).color;
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return `rgba(${d[0]},${d[1]},${d[2]},${+(d[3] / 255).toFixed(3)})`;
  };
  return { read, done: () => probe.remove() };
}
const toneVars = (t: string) => t === "acc" ? ["--acc", "--acc-soft", "--acc-ink"] : t === "muted" ? ["--muted", "--surface-2", "--muted"] : [`--${t}`, `--${t}-soft`, `--${t}-ink`];
export function graphStyle(el: HTMLElement, manyEdges: boolean): { style: any[]; fs: number; font: string } {
  const cs = getComputedStyle(el);
  const num = (v: string, d: number) => { const x = parseFloat(cs.getPropertyValue(v)); return Number.isFinite(x) ? x : d; };
  const { read, done } = colourReader(el);
  const c = (v: string) => read(`var(${v})`);
  const font = cs.getPropertyValue("--font-sans").trim() || "sans-serif";
  const fs = num("--graph-label-fs", 13), ew = num("--graph-edge-w", 1.5), fade = num("--graph-fade", 0.14), ea = num("--graph-edge-alpha", 0.6), dur = num("--graph-dur", 320);
  const ink = c("--ink"), ink2 = c("--ink-2"), surface = c("--surface"), line2 = c("--graph-node-border"), edge = c("--graph-edge"), acc = c("--acc");
  const out = c("--graph-out"), inn = c("--graph-in"), found = c("--graph-found"), ring = c("--graph-ring");
  const st: any[] = [
    { selector: "node", style: { shape: "round-rectangle", "corner-radius": NODE_H / 2, width: "data(w)", height: NODE_H, label: "data(label)", "font-family": font, "font-size": fs, "font-weight": 500, color: ink, "text-valign": "center", "text-halign": "center", "text-wrap": "ellipsis", "text-max-width": "data(tw)", "background-color": surface, "border-width": 1.5, "border-color": line2, "min-zoomed-font-size": MIN_PX, "transition-property": "opacity, border-width", "transition-duration": dur, "overlay-opacity": 0 } },
  ];
  for (const t of TONES) { const [b, s, i] = toneVars(t).map(c); st.push({ selector: `node[tone = "${t}"]`, style: { "background-color": s, "border-color": b, color: i } }, { selector: `edge[tone = "${t}"]`, style: { "line-color": b, "target-arrow-color": b, opacity: Math.min(1, ea + 0.3) } }); }
  st.push(
    { selector: "node.gr-anchor", style: { width: 10, height: 10, shape: "ellipse", "border-width": 2.5, "background-color": surface, label: "", "corner-radius": 5 } },
    { selector: "node.gr-folded", style: { height: FOLD_H, "corner-radius": FOLD_H / 2, "border-width": 4.5, "border-style": "double", "font-weight": 600, "font-size": fs + 1 } },
    { selector: "edge", style: { width: ew, "line-color": edge, "target-arrow-color": edge, "target-arrow-shape": manyEdges ? "none" : "triangle", "arrow-scale": 0.85, opacity: ea, "curve-style": manyEdges ? "haystack" : "bezier", "control-point-step-size": 24, "line-cap": "round", "font-family": font, "font-size": 12, color: ink2, "text-background-color": surface, "text-background-opacity": 0.94, "text-background-padding": 3, "text-background-shape": "round-rectangle", "min-zoomed-font-size": MIN_PX, "transition-property": "opacity", "transition-duration": dur } },
    { selector: "edge[count > 1]", style: { width: `mapData(count, 1, 24, ${ew}, ${ew * 2.2})`, "arrow-scale": "mapData(count, 1, 8, 0.85, 0.3)", opacity: ea * 0.75, "control-point-step-size": 44 } },
    { selector: "edge.gr-dashed", style: { "line-style": "dashed", "line-dash-pattern": [6, 4] } },
    { selector: ".gr-faded", style: { opacity: fade } },
    { selector: "edge.gr-out", style: { "line-color": out, "target-arrow-color": out, opacity: 1, width: ew * 1.9, label: "data(label)", "z-index": 10 } },
    { selector: "edge.gr-in", style: { "line-color": inn, "target-arrow-color": inn, opacity: 1, width: ew * 1.9, label: "data(label)", "z-index": 10 } },
    { selector: "edge.gr-link", style: { opacity: Math.min(1, ea + 0.25) } },
    { selector: "node.gr-sel", style: { "border-width": 3, "border-color": acc, "underlay-color": acc, "underlay-opacity": 0.16, "underlay-padding": 9, "underlay-shape": "round-rectangle", "underlay-corner-radius": 22, "z-index": 20 } },
    { selector: "node.gr-found", style: { "underlay-color": found, "underlay-opacity": 0.5, "underlay-padding": 13, "underlay-shape": "round-rectangle", "underlay-corner-radius": 26 } },
    { selector: "node.gr-kb", style: { "outline-width": 3, "outline-color": ring, "outline-offset": 3, "outline-opacity": 1 } },
  );
  done();
  return { style: st, fs, font };
}

// ------------------------------------------------------------------ the still picture (server, no script, and while loading)
export function StillGraph({ still, title, ui, uid }: { still: Still; title: string; ui: GUi; uid: string }) {
  const byId = new Map(still.items.map((it) => [it.id, it]));
  const H = 30;
  return (
    <svg className="gr-still-svg" viewBox={`0 0 ${still.w} ${still.h}`} width={still.w} height={still.h} style={{ minWidth: `${Math.ceil(still.w * (MIN_PX / 13))}px` }} role="img" aria-label={`${title || "Graph"}: ${still.items.map((it) => `${it.label}${it.group ? ` (${it.count} ${ui.nodes})` : ""}`).join(", ")}`}>
      <defs><marker id={`gr-arrow-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" className="gr-still-head" /></marker></defs>
      {still.edges.map((e, i) => {
        const a = byId.get(e.a)!, b = byId.get(e.b)!;
        const down = b.y > a.y + 4, up = b.y < a.y - 4;
        const y1 = a.y + (down ? H / 2 : up ? -H / 2 : 0), y2 = b.y + (down ? -H / 2 - 2 : up ? H / 2 + 2 : 0);
        const x1 = a.x, x2 = b.x + (!down && !up ? (b.x > a.x ? -b.w / 2 - 2 : b.w / 2 + 2) : 0);
        const my = (y1 + y2) / 2;
        return (
          <g key={i} className="gr-still-edge">
            <path d={down || up ? `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}` : `M${x1} ${y1} L${x2} ${y2}`} markerEnd={`url(#gr-arrow-${uid})`} strokeWidth={Math.min(5, 1.4 + Math.log2(e.count))} />
            {e.count > 1 ? <text x={(x1 + x2) / 2} y={my - 4} className="gr-still-count">{e.count}</text> : null}
          </g>
        );
      })}
      {still.items.map((it) => (
        <g key={it.id} className={`gr-still-item tone-${it.tone ?? "none"}${it.group ? " is-group" : ""}`} transform={`translate(${it.x - it.w / 2} ${it.y - H / 2})`}>
          <rect width={it.w} height={H} rx={H / 2} />
          <text x={it.group ? 14 : it.w / 2} y={H / 2 + 4.5} textAnchor={it.group ? "start" : "middle"}>{it.label}</text>
          {it.group ? <text x={it.w - 12} y={H / 2 + 4.5} textAnchor="end" className="gr-still-n">{it.count}</text> : null}
        </g>
      ))}
    </svg>
  );
}

// ------------------------------------------------------------------ the part
type Pos = { x: number; y: number };
type Item = { id: string; label: string; kind: "node" | "folded" | "open"; tone: string; group: string | null; count?: number };
type Link = { id: string; label: string; edge: string; count: number };
type Info = { id: string; label: string; kind: Item["kind"]; tone: string; group: string | null; note: string; count: number; outs: Link[]; ins: Link[]; members: string[] };
const prefersReduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function GraphView({ data: spec, static: stp, stage }: PartViewProps<GraphSpec>) {
  const t: GUi = GRAPH_UI;
  const sx = useStatic(stp, 0);
  if (spec.errors.length || !spec.nodes.length) return <div className="gr gr-failed"><p className="gr-error">{t.cannot} {spec.errors[0]?.msg.replace(/^graph: /, "") ?? "it has no nodes"}</p></div>;
  if (sx.on) return <StaticGraph spec={spec} t={t} />;
  return <GraphLive spec={spec} t={t} theme={stage.theme} motionOff={stage.motion === "off"} />;
}

/** static: the still picture of the groups with their counts, whole, with no script and nothing to move */
function StaticGraph({ spec, t }: { spec: GraphSpec; t: GUi }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <div className={`gr size-${spec.size} is-static`} data-dh-static="true" data-layout={spec.layout}>
      {spec.title ? <div className="gr-title" data-dh-slot="title">{spec.title}</div> : null}
      <div className="gr-still gr-still-static" data-dh-slot="still">
        {spec.still ? <StillGraph still={spec.still} title={spec.title} ui={t} uid={uid} /> : null}
        <p className="gr-still-note">{t.stillNote} {spec.nodes.length} {t.nodes} · {spec.edges.length} {t.edges}</p>
      </div>
    </div>
  );
}
function GraphLive({ spec, t, theme, motionOff }: { spec: GraphSpec; t: GUi; theme: "light" | "dark"; motionOff: boolean }) {
  const m = useMemo(() => modelOf(spec), [spec]);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const topGroups = useMemo(() => spec.groups.filter((g) => !g.parent).map((g) => g.id), [spec]);
  const hullsOn = spec.layout !== "radial";
  const rootRef = useRef<HTMLDivElement>(null), cyBox = useRef<HTMLDivElement>(null), tagRef = useRef<HTMLDivElement>(null), kbRef = useRef<HTMLDivElement>(null);
  const hullG = useRef<SVGGElement>(null), hullText = useRef<SVGGElement>(null), lodRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<any>(null), posRef = useRef(new Map<string, Pos>()), hullsRef = useRef<Hull[]>([]), lookRef = useRef({ fs: 13, font: "sans-serif" });
  const measureRef = useRef<CanvasRenderingContext2D | null>(null);
  const prioRef = useRef<string[]>([]), lodPool = useRef(new Map<string, HTMLElement>()), widthCache = useRef(new Map<string, number>());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [folded, setFolded] = useState<Set<string>>(() => new Set(spec.foldFirst ? topGroups : []));
  const [sel, setSel] = useState<string | null>(null);
  const [steps, setSteps] = useState<1 | 2>(1);
  const [kb, setKb] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [hulls, setHulls] = useState<Hull[]>([]);
  const [nearGroups, setNearGroups] = useState<Set<string> | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ id: string; label: string; where: string }[]>([]);
  const [hitAt, setHitAt] = useState(0);
  const [searchMsg, setSearchMsg] = useState("");
  const [touch, setTouch] = useState(false);
  const foundTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fitNext = useRef(false), wasCompact = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const moveMs = () => (motionOff || prefersReduced() ? 0 : 420);
  const under = (id: string, g: string) => id === g || ancestors(m, id).includes(g);

  // ---- load cytoscape when the part comes near (and only then)
  useEffect(() => {
    setTouch(typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);
    const root = rootRef.current!;
    let gone = false, io: IntersectionObserver | null = null;
    const start = async () => {
      io?.disconnect();
      try {
        const cytoscape = (await import("cytoscape")).default;
        if (gone || !cyBox.current) return;
        const look = graphStyle(root, spec.edges.length > 1500);
        lookRef.current = { fs: look.fs, font: look.font };
        const cy = cytoscape({ container: cyBox.current, elements: [], style: look.style, minZoom: 0.04, maxZoom: 3, wheelSensitivity: 2, boxSelectionEnabled: false, autounselectify: true, autoungrabify: true, selectionType: "single", textureOnViewport: spec.nodes.length > 600, hideEdgesOnViewport: spec.edges.length > 2500, pixelRatio: "auto" } as any);
        cyRef.current = cy;
        // base positions: ours (layers, radial), or cytoscape's force layout in two stages (forceLayout above)
        for (const n of spec.nodes) posRef.current.set(n.id, { x: n.x, y: n.y });
        if (spec.layout === "force") {
          const placed = await forceLayout(cytoscape, spec, m, posRef.current, cyBox.current.clientHeight / Math.max(1, cyBox.current.clientWidth));
          if (gone) return;
          for (const [id, p] of placed) posRef.current.set(id, p);
        }
        if (gone) return;
        // when the whole graph would be drawn too small to name its nodes or touch them (under START_FOLDED_Z, as on a phone or in a
        // narrow column), start with the groups folded (a pill each, big enough to tap) and let the reader open them
        const W = cyBox.current.clientWidth, H = cyBox.current.clientHeight;
        if (topGroups.length && !spec.foldFirst) {
          let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
          for (const n of spec.nodes) { const p = posRef.current.get(n.id)!; x1 = Math.min(x1, p.x - n.w / 2); x2 = Math.max(x2, p.x + n.w / 2); y1 = Math.min(y1, p.y - NODE_H / 2); y2 = Math.max(y2, p.y + NODE_H / 2); }
          if (startsFolded(W, H, x2 - x1, y2 - y1, CONTROLS_W)) setFolded(new Set(topGroups));
        }
        fitNext.current = true;
        setReady(true);
      } catch (e) { console.warn("graph", e); setFailed(String((e as Error)?.message ?? e)); }
    };
    const near = () => { const r = root.getBoundingClientRect(); return r.bottom > -300 && r.top < innerHeight + 300; };
    if (near()) start();
    else try { io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) start(); }, { rootMargin: "300px 0px 300px 0px" }); io.observe(root); } catch { start(); }
    return () => { gone = true; io?.disconnect(); cyRef.current?.destroy(); cyRef.current = null; if (foundTimer.current) clearTimeout(foundTimer.current); for (const el of lodPool.current.values()) el.remove(); lodPool.current.clear(); };
  }, [spec, m]);

  // ---- the theme: redraw the style sheet (and the label layer) when it changes
  useEffect(() => {
    if (!ready) return;
    const restyle = () => { const cy = cyRef.current; if (!cy || !rootRef.current) return; const look = graphStyle(rootRef.current, spec.edges.length > 1500); lookRef.current = { fs: look.fs, font: look.font }; cy.style(look.style); widthCache.current.clear(); frameLayers(); };
    const mo = new MutationObserver(restyle); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null; mq?.addEventListener?.("change", restyle);
    addEventListener("dh-theme", restyle);
    restyle();
    return () => { mo.disconnect(); mq?.removeEventListener?.("change", restyle); removeEventListener("dh-theme", restyle); };
  }, [ready, spec, theme]);

  // ---- the elements for the fold state, the group areas and the reading order
  useEffect(() => {
    const cy = cyRef.current; if (!ready || !cy) return;
    const compact = compactOf(spec, folded);
    if (!!compact !== wasCompact.current) { wasCompact.current = !!compact; fitNext.current = true; }   // the pills moved: show them all
    cy.batch(() => { cy.elements().remove(); cy.add(viewOf(spec, m, folded, posRef.current, compact) as any); });
    // group areas: every open group with a node on screen; deeper groups get less padding so they sit inside their parent's
    const hs: Hull[] = [];
    if (hullsOn) {
      const depthOf = (g: string) => ancestors(m, g).length;
      const maxDepth = Math.max(0, ...spec.groups.map((g) => depthOf(g.id)));
      for (const g of spec.groups) {
        if (folded.has(g.id) || repOf(m, g.id, folded) !== g.id) continue;
        const shownIds = new Set(m.under.get(g.id)!.map((id) => repOf(m, id, folded)));
        const pts: Pt[] = [];
        for (const id of shownIds) { const n = cy.getElementById(id); if (!n.length || n.hasClass("gr-anchor")) continue; const b = n.boundingBox({ includeLabels: false }); pts.push([b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]); }
        if (!pts.length) continue;
        const depth = depthOf(g.id), pad = 14 + 10 * (maxDepth - depth);
        const h = hullOf(pts);
        const xs = h.map((p) => p[0]), ys = h.map((p) => p[1]);
        hs.push({ id: g.id, label: g.label, tone: g.tone ?? "none", depth, pad, pts: h, d: `M${h.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("L")}Z`, cx: (Math.min(...xs) + Math.max(...xs)) / 2, top: Math.min(...ys) - pad, count: m.under.get(g.id)!.length });
      }
      hs.sort((a, b) => a.depth - b.depth);
    }
    hullsRef.current = hs;
    setHulls(hs);
    // reading order for the keyboard: top to bottom, left to right (layers); centre outwards, clockwise (radial); by group (force)
    const list: Item[] = [
      ...hs.map((h) => ({ id: h.id, label: h.label, kind: "open" as const, tone: h.tone, group: parentOf(m, h.id), count: h.count })),
      ...cy.nodes().not(".gr-anchor").map((n: any) => ({ id: n.id(), label: n.data("full"), kind: n.data("kind"), tone: n.data("tone"), group: parentOf(m, n.id()), count: n.data("count") })),
    ];
    const at = (it: Item) => { if (it.kind === "open") { const h = hs.find((x) => x.id === it.id)!; return { x: h.cx, y: h.top }; } const p = cy.getElementById(it.id).position(); return { x: p.x, y: p.y }; };
    const P = new Map(list.map((it) => [it.id, at(it)]));
    const top = (id: string) => { const a = [id, ...ancestors(m, id)].filter((x) => m.groups.has(x)); return a.length ? m.order.get(a[a.length - 1])! : 1e9; };
    const key = (it: Item): number[] => {
      const p = P.get(it.id)!;
      if (spec.layout === "layers") return spec.dir === "right" ? [Math.round(p.x / 20), it.kind === "open" ? -1 : 0, p.y] : [Math.round(p.y / 20), it.kind === "open" ? -1 : 0, p.x];
      if (spec.layout === "radial") return [Math.round(Math.hypot(p.x, p.y) / 40), (Math.atan2(p.y, p.x) + Math.PI * 2.5) % (Math.PI * 2)];
      return [top(it.id), it.kind === "open" ? -1 : 0, Math.round(p.y / 20), p.x];
    };
    const keys = new Map(list.map((it) => [it.id, key(it)]));
    list.sort((a, b) => { const x = keys.get(a.id)!, y = keys.get(b.id)!; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
    setItems(list);
    if (fitNext.current) { fitNext.current = false; fitAll(false); }
    // the selection follows into a folded group
    const exists = (id: string) => cy.getElementById(id).length > 0 || hs.some((h) => h.id === id);
    setSel((s) => (s && !exists(s) ? repOf(m, s, folded) : s));
    setKb((k) => (k && !exists(k) ? null : k));
    prioritise();
    frameLayers();
  }, [ready, folded, spec, m]);

  // ---- events from the canvas (bound once)
  useEffect(() => {
    const cy = cyRef.current; if (!ready || !cy) return;
    const hullAt = (x: number, y: number) => { let best: Hull | null = null; for (const h of hullsRef.current) if (nearHull(h.pts, x, y, h.pad) && (!best || h.depth >= best.depth)) best = h; return best; };
    const tap = (e: any) => { if (e.target === cy) { const h = hullAt(e.position.x, e.position.y); setSel(h ? h.id : null); return; } if (e.target.isNode?.()) setSel(e.target.data("anchorOf") ?? e.target.id()); };
    const dbl = (e: any) => { if (e.target === cy) { const h = hullAt(e.position.x, e.position.y); if (h) toggle(h.id); return; } const n = e.target; if (n.isNode?.() && n.hasClass("gr-folded")) toggle(n.id()); };
    let raf = 0;
    const moved = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(frameLayers); };
    cy.on("tap", tap); cy.on("dbltap", dbl); cy.on("viewport render", moved);
    // a plain wheel scrolls the page; Ctrl (or a trackpad pinch, which sends Ctrl) + wheel zooms the graph. cytoscape
    // listens on its container (in the capture phase), so the guard sits one element up, on the stage
    const box = cyBox.current!, stage = box.parentElement!;
    const wheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation(); };
    stage.addEventListener("wheel", wheel, { capture: true });
    const ro = new ResizeObserver(() => { cy.resize(); moved(); }); ro.observe(box);
    return () => { cy.off("tap", tap); cy.off("dbltap", dbl); cy.off("viewport render", moved); stage.removeEventListener("wheel", wheel, { capture: true } as any); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [ready]);

  // ---- every frame the view moves: the group areas follow the canvas, and the label layer names what fits
  const frameLayers = () => { placeHulls(); placeLod(); placeTag(); placeKb(); };
  const placeHulls = () => {
    const cy = cyRef.current, g = hullG.current, tx = hullText.current; if (!cy || !g || !tx) return;
    const z = cy.zoom(), p = cy.pan();
    g.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${z.toFixed(4)})`);
    // each group's name above its area, kept inside the stage; outer and bigger groups first, and a name that would
    // touch one already placed is hidden (its group still shows its name in the side list and when focused)
    const W = cy.width(), H = cy.height(), placed: [number, number, number, number][] = [];
    const els = [...tx.querySelectorAll<SVGTextElement>("text[data-id]")].map((el) => ({ el, h: hullsRef.current.find((x) => x.id === el.dataset.id) })).filter((x) => x.h) as { el: SVGTextElement; h: Hull }[];
    els.sort((a, b) => a.h.depth - b.h.depth || b.h.count - a.h.count);
    for (const { el, h } of els) {
      let w = Number(el.dataset.w); if (!w) { w = Math.ceil(el.getComputedTextLength?.() ?? h.label.length * 7.5) || h.label.length * 7.5; el.dataset.w = String(w); }
      const x = Math.min(Math.max(h.cx * z + p.x, w / 2 + 4), W - w / 2 - 4), y = Math.min(Math.max(h.top * z + p.y - 6, 16), H - 4);
      const b: [number, number, number, number] = [x - w / 2 - 3, y - 14, x + w / 2 + 3, y + 4];
      // an area wholly off the stage shows no name (a name pinned to the edge would point at nothing)
      let ax1 = Infinity, ay1 = Infinity, ax2 = -Infinity, ay2 = -Infinity; for (const [px, py] of h.pts) { ax1 = Math.min(ax1, px); ax2 = Math.max(ax2, px); ay1 = Math.min(ay1, py); ay2 = Math.max(ay2, py); }
      const off = (ax2 + h.pad) * z + p.x < 0 || (ax1 - h.pad) * z + p.x > W || (ay2 + h.pad) * z + p.y < 0 || (ay1 - h.pad) * z + p.y > H;
      const hide = off || placed.some((q) => b[0] < q[2] && q[0] < b[2] && b[1] < q[3] && q[1] < b[3]);
      el.setAttribute("x", x.toFixed(1)); el.setAttribute("y", y.toFixed(1));
      el.style.visibility = hide ? "hidden" : "";
      if (!hide) placed.push(b);
    }
  };
  /** the order the label layer names nodes in: the focus and its neighbourhood first, then by how connected (as written) */
  const prioritise = (near?: Set<string>) => {
    const cy = cyRef.current; if (!cy) return;
    const deg = new Map<string, number>(); cy.edges().forEach((e: any) => { const c = e.data("count") ?? 1; deg.set(e.data("source"), (deg.get(e.data("source")) ?? 0) + c); deg.set(e.data("target"), (deg.get(e.data("target")) ?? 0) + c); });
    const ids: string[] = cy.nodes().not(".gr-anchor").map((n: any) => n.id());
    const rank = (id: string) => (near ? (id === selRef.current ? 0 : near.has(id) ? 1 : 3) : cy.getElementById(id).hasClass("gr-folded") ? 1 : 2);
    ids.sort((a, b) => rank(a) - rank(b) || (deg.get(b) ?? 0) - (deg.get(a) ?? 0) || (m.order.get(a) ?? 0) - (m.order.get(b) ?? 0));
    prioRef.current = near ? ids.filter((id) => rank(id) < 3) : ids;
  };
  const selRef = useRef<string | null>(null);
  const placeLod = () => {
    const cy = cyRef.current, layer = lodRef.current; if (!cy || !layer) return;
    const z = cy.zoom(), { fs, font } = lookRef.current;
    const pool = lodPool.current;
    const used = new Set<string>();
    // the canvas draws the names itself once they reach 11 px; the label layer is for the zoomed-out view
    if (fs * z < MIN_PX) {
      const W = cy.width(), H = cy.height();
      const boxes: [number, number, number, number][] = [];
      const ctx = measureRef.current ?? (measureRef.current = document.createElement("canvas").getContext("2d")!);
      ctx.font = `500 ${LOD_PX}px ${font}`;
      // the folded groups' and the hulls' own words take room first
      for (const h of hullsRef.current) { const x = h.cx * z + cy.pan().x, y = h.top * z + cy.pan().y - 6; const w = h.label.length * 7.5 + 8; boxes.push([x - w / 2, y - 14, x + w / 2, y + 4]); }
      // where every shown node's middle is on screen, in a coarse grid: a name may not cover another node's middle
      const CELL = 48, grid = new Map<number, string[]>(), cell = (x: number, y: number) => Math.floor(x / CELL) * 4096 + Math.floor(y / CELL);
      cy.nodes().not(".gr-anchor, .gr-faded").forEach((n: any) => { const rp = n.renderedPosition(); if (rp.x < -CELL || rp.y < -CELL || rp.x > W + CELL || rp.y > H + CELL) return; const k = cell(rp.x, rp.y); const a = grid.get(k); if (a) a.push(n.id()); else grid.set(k, [n.id()]); });
      const coversOther = (id: string, x1: number, y1: number, x2: number, y2: number) => {
        for (let gx = Math.floor(x1 / CELL); gx <= Math.floor(x2 / CELL); gx++) for (let gy = Math.floor(y1 / CELL); gy <= Math.floor(y2 / CELL); gy++)
          for (const o of grid.get(gx * 4096 + gy) ?? []) { if (o === id) continue; const rp = cy.getElementById(o).renderedPosition(); if (rp.x > x1 && rp.x < x2 && rp.y > y1 && rp.y < y2) return true; }
        return false;
      };
      for (const id of prioRef.current) {
        if (used.size >= LOD_MAX) break;
        const n = cy.getElementById(id); if (!n.length || n.hasClass("gr-faded")) continue;
        const folded = n.hasClass("gr-folded");
        const label = folded ? `${n.data("full")}  ${n.data("count")}` : (n.data("full") as string);
        const key = (folded ? "f\u0000" : "n\u0000") + label;
        // the text at its weight, the padding (9 a side) and the border (3 a side folded, 1.5 otherwise), and a little slack
        let w = widthCache.current.get(key); if (w == null) { ctx.font = `${folded ? 600 : 500} ${LOD_PX}px ${font}`; w = Math.ceil(ctx.measureText(label).width) + 18 + (folded ? 6 : 3) + 3; widthCache.current.set(key, w); }
        // the label covers the node's own pill exactly (no second outline peeking out round it)
        const rp = n.renderedPosition(), bw = Math.max(w, Math.ceil(n.renderedOuterWidth()) + 1), bh = Math.max(folded ? 28 : 22, Math.ceil(n.renderedOuterHeight()) + 1);
        // a node whose middle is off the stage gets no name; one near the edge has its name moved in to fit
        if (rp.x < 0 || rp.x > W || rp.y < 0 || rp.y > H || bw > W - 4) continue;
        const cx = Math.min(Math.max(rp.x, bw / 2 + 2), W - bw / 2 - 2), cyy = Math.min(Math.max(rp.y, bh / 2 + 2), H - bh / 2 - 2);
        const x1 = cx - bw / 2, y1 = cyy - bh / 2, x2 = cx + bw / 2, y2 = cyy + bh / 2;
        if (coversOther(id, x1, y1, x2, y2)) continue;
        if (boxes.some((b) => x1 < b[2] + 4 && b[0] - 4 < x2 && y1 < b[3] + 2 && b[1] - 2 < y2)) continue;
        boxes.push([x1, y1, x2, y2]);
        let el = pool.get(id);
        if (!el) { el = document.createElement("span"); layer.appendChild(el); pool.set(id, el); }
        el.className = `gr-lod tone-${n.data("tone")}${folded ? " is-folded" : ""}`;
        if (el.textContent !== label) el.textContent = label;
        el.style.transform = `translate(${Math.round(x1)}px, ${Math.round(y1)}px)`;
        el.style.width = `${bw}px`; el.style.height = `${bh}px`; el.style.borderRadius = `${bh / 2}px`; el.style.lineHeight = `${bh - (n.hasClass("gr-folded") ? 6 : 3)}px`;
        el.hidden = false;
        used.add(id);
      }
    }
    for (const [id, el] of pool) if (!used.has(id)) { if (!cy.getElementById(id).length) { el.remove(); pool.delete(id); } else el.hidden = true; }
  };

  // ---- focus: the selection (a node, a folded group or an open group) and its neighbourhood, the rest faded
  const selfOf = (cy: any, id: string) => { const n = cy.getElementById(id); if (n.length) return n; if (!m.groups.has(id)) return cy.collection(); return cy.nodes().filter((x: any) => under(x.data("anchorOf") ?? x.id(), id)); };
  useEffect(() => {
    const cy = cyRef.current; if (!ready || !cy) return;
    selRef.current = sel;
    cy.batch(() => { cy.elements().removeClass("gr-faded gr-sel gr-out gr-in gr-link"); });
    const self = sel ? selfOf(cy, sel) : cy.collection();
    if (!sel || !self.length) { setInfo(null); setNearGroups(null); prioritise(); frameLayers(); return; }
    let near = self;
    for (let k = 0; k < steps; k++) near = near.union(near.closedNeighborhood());
    cy.batch(() => {
      cy.elements().not(near).addClass("gr-faded");
      if (cy.getElementById(sel).length) self.addClass("gr-sel");
      self.connectedEdges().forEach((e: any) => { const sIn = self.contains(e.source()), tIn = self.contains(e.target()); if (sIn && !tIn) e.addClass("gr-out"); else if (tIn && !sIn) e.addClass("gr-in"); });
      near.edges().not(".gr-out, .gr-in").addClass("gr-link");
    });
    const nearIds = new Set<string>(near.nodes().map((x: any) => x.id()));
    const ng = new Set<string>(); for (const x of near.nodes()) { const id = x.data("anchorOf") ?? x.id(); for (const a of [id, ...ancestors(m, id)]) if (m.groups.has(a)) ng.add(a); }
    if (m.groups.has(sel)) ng.add(sel);
    setNearGroups(ng);
    frame(near.nodes(), m.groups.has(sel) && !cy.getElementById(sel).length ? hullsRef.current.find((h) => h.id === sel)?.pad ?? 0 : 0);
    // the side list: what it links to and what links to it
    const links = (dir: "out" | "in"): Link[] => self.connectedEdges().filter((e: any) => (dir === "out" ? self.contains(e.source()) && !self.contains(e.target()) : self.contains(e.target()) && !self.contains(e.source()))).map((e: any) => { const o = dir === "out" ? e.target() : e.source(); return { id: o.data("anchorOf") ?? o.id(), label: o.data("full"), edge: (e.data("count") > 1 ? e.data("label").replace(/^\d+ links:? ?/, "") : e.data("label")) ?? "", count: e.data("count") }; }).sort((a: Link, b: Link) => (m.order.get(a.id) ?? 0) - (m.order.get(b.id) ?? 0));
    // links of one node to the same other end, merged
    const merge = (ls: Link[]) => { const out = new Map<string, Link>(); for (const l of ls) { const x = out.get(l.id); if (x) { x.count += l.count; if (l.edge && !x.edge.includes(l.edge)) x.edge = x.edge ? `${x.edge}, ${l.edge}` : l.edge; } else out.set(l.id, { ...l }); } return [...out.values()]; };
    const g = m.groups.get(sel), nd = m.nodes.get(sel), el = cy.getElementById(sel);
    setInfo({ id: sel, label: g ? g.label : el.data("full"), kind: el.length ? el.data("kind") : "open", tone: (g ?? nd)?.tone ?? "none", group: parentOf(m, sel), note: (g ?? nd)?.note ?? "", count: g ? m.under.get(sel)!.length : 0, outs: merge(links("out")), ins: merge(links("in")), members: g ? m.under.get(sel)! : [] });
    prioritise(nearIds);
    frameLayers();
  }, [sel, steps, ready, folded]);

  /** move the camera so these nodes fill the stage (room for the label above), at most 1.6 times bigger */
  const frame = (eles: any, extra = 0, maxZ = 1.6) => {
    const cy = cyRef.current; if (!cy || !eles.length) return;
    const b = eles.boundingBox({ includeLabels: false });
    const bb = { x1: b.x1 - extra, y1: b.y1 - extra, w: b.w + 2 * extra, h: b.h + 2 * extra };
    const W = cy.width() - CONTROLS_W, H = cy.height(), pad = 28, top = 64;
    let z = Math.min((W - 2 * pad) / Math.max(bb.w, 1), (H - pad - top) / Math.max(bb.h, 1));
    z = Math.max(cy.minZoom(), Math.min(maxZ, z));
    const pan = { x: W / 2 - z * (bb.x1 + bb.w / 2), y: (H + top - pad) / 2 - z * (bb.y1 + bb.h / 2) };
    cy.stop(); cy.animate({ zoom: z, pan }, { duration: moveMs(), easing: "ease-out-cubic" });
  };
  const fitAll = (animate = true) => {
    const cy = cyRef.current; if (!cy) return;
    const pad = Math.max(0, ...hullsRef.current.map((h) => h.pad));
    const b = cy.elements().boundingBox({ includeLabels: false });
    const W = cy.width() - CONTROLS_W, H = cy.height(), m0 = 20, top = hullsRef.current.length ? 22 : 0;
    const z = Math.max(cy.minZoom(), Math.min(1.4, (W - 2 * m0) / Math.max(1, b.w + 2 * pad), (H - 2 * m0 - top) / Math.max(1, b.h + 2 * pad)));
    const pan = { x: W / 2 - z * (b.x1 + b.w / 2), y: (H + top) / 2 - z * (b.y1 + b.h / 2) };
    cy.stop();
    if (animate && moveMs()) cy.animate({ zoom: z, pan }, { duration: moveMs(), easing: "ease-out-cubic" }); else cy.viewport({ zoom: z, pan });
  };

  // ---- the DOM label over the focused node or group (always readable), and the keyboard's button over it
  const tagFor = kb ?? sel;
  const boxOf = (id: string) => {
    const cy = cyRef.current; if (!cy) return null;
    const self = selfOf(cy, id); if (!self.length) return null;
    const b = self.renderedBoundingBox({ includeLabels: false, includeOverlays: false, includeUnderlays: false });
    const h = cy.getElementById(id).length ? null : hullsRef.current.find((x) => x.id === id);
    const e = h ? h.pad * cy.zoom() : 0;
    return { x1: b.x1 - e, y1: b.y1 - e - (h ? 20 : 0), x2: b.x2 + e, y2: b.y2 + e, open: !!h };
  };
  const placeTag = () => {
    const cy = cyRef.current, tag = tagRef.current; if (!tag || !cy) return;
    const id = tag.dataset.for;
    const bb = id ? boxOf(id) : null;
    if (!bb) { tag.style.visibility = "hidden"; return; }
    const W = cy.width(), H = cy.height();
    tag.style.visibility = bb.x2 < 0 || bb.x1 > W || bb.y2 < 0 || bb.y1 > H ? "hidden" : "visible";
    const tw = tag.offsetWidth, th = tag.offsetHeight;
    const above = bb.y1 - 10 > th;
    const x = Math.max(4, Math.min(W - tw - 4, (bb.x1 + bb.x2) / 2 - tw / 2));
    const y = above ? bb.y1 - th - 10 : bb.open ? Math.max(4, bb.y1 + 4) : Math.min(H - th - 4, bb.y2 + 10);
    tag.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  const placeKb = () => {
    const box = kbRef.current; if (!box) return;
    const b = box.querySelector<HTMLElement>("button:focus"); if (!b) return;
    const bb = boxOf(b.dataset.id!); if (!bb) return;
    Object.assign(b.style, { left: `${Math.round(bb.x1 - 4)}px`, top: `${Math.round(bb.y1 - 4)}px`, width: `${Math.round(bb.x2 - bb.x1 + 8)}px`, height: `${Math.round(bb.y2 - bb.y1 + 8)}px` });
  };
  useEffect(() => { placeTag(); }, [tagFor, info, ready]);
  // new group areas come with new names: place them at once (the next move of the view would be too late)
  useEffect(() => { placeHulls(); placeLod(); }, [hulls]);
  useEffect(() => {
    const cy = cyRef.current; if (!ready || !cy) return;
    cy.nodes(".gr-kb").removeClass("gr-kb");
    if (kb) {
      const n = cy.getElementById(kb); if (n.length) n.addClass("gr-kb");
      const bb = boxOf(kb);
      if (bb && (bb.x1 < 0 || bb.y1 < 0 || bb.x2 > cy.width() || bb.y2 > cy.height())) { cy.stop(); cy.animate({ center: { eles: selfOf(cy, kb) } }, { duration: moveMs() }); }
    }
    placeKb();
  }, [kb, ready]);

  // ---- actions
  const toggle = (gid: string) => setFolded((f) => { const x = new Set(f); if (x.has(gid)) x.delete(gid); else x.add(gid); return x; });
  const anyOpen = topGroups.some((g) => !folded.has(g));
  const foldAll = () => { fitNext.current = true; setFolded(anyOpen ? new Set(topGroups) : new Set()); };
  /** open the groups a node sits in, select it, frame it, and light it for a moment */
  const reveal = (id: string, light = false) => {
    const need = ancestors(m, id).filter((a) => folded.has(a));
    if (need.length) setFolded((f) => { const x = new Set(f); need.forEach((a) => x.delete(a)); return x; });
    setSel(id);
    if (light) {
      const go = () => { const cy = cyRef.current; const n = cy?.getElementById(id); if (!n?.length) return; cy.nodes(".gr-found").removeClass("gr-found"); n.addClass("gr-found"); if (foundTimer.current) clearTimeout(foundTimer.current); foundTimer.current = setTimeout(() => n.removeClass("gr-found"), 2400); };
      requestAnimationFrame(() => requestAnimationFrame(go));
    }
  };
  const zoomBy = (k: number) => { const cy = cyRef.current; if (!cy) return; cy.stop(); cy.animate({ zoom: { level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * k)), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } } }, { duration: motionOff || prefersReduced() ? 0 : 200 }); };

  // ---- search: every node and group by its label or id; a fresh budget per query, so a query can never hang the tab
  const index = useMemo(() => [...spec.groups.map((g) => ({ id: g.id, label: g.label, where: g.parent ? `${t.inGroup} ${m.groups.get(g.parent)!.label}` : t.group })), ...spec.nodes.map((n) => ({ id: n.id, label: n.label, where: n.group ? `${t.inGroup} ${m.groups.get(n.group)!.label}` : "" }))], [spec, m, t]);
  const search = (q: string) => {
    setQuery(q); setHitAt(0); setSearchMsg("");
    const s = q.trim().toLowerCase(); if (!s) { setHits([]); return; }
    const b = new Budget(partLimitsOf(), null, null, "the graph search");
    const out: { r: number; it: (typeof index)[number] }[] = [];
    try {
      for (const it of index) {
        b.charge(1 + ((it.label.length + it.id.length) >> 3));
        const l = it.label.toLowerCase(), i = it.id.toLowerCase();
        const r = l === s || i === s ? 0 : l.startsWith(s) || i.startsWith(s) ? 1 : l.includes(s) || i.includes(s) ? 2 : -1;
        if (r >= 0) out.push({ r, it });
      }
    } catch (e) { if (e instanceof BudgetError) { setHits([]); setSearchMsg(t.tooMuch); return; } throw e; }
    out.sort((a, c) => a.r - c.r || (m.order.get(a.it.id) ?? 0) - (m.order.get(c.it.id) ?? 0));
    setHits(out.slice(0, 8).map((x) => x.it));
    if (!out.length) setSearchMsg(t.noMatch);
  };
  const pick = (id: string) => { setQuery(""); setHits([]); setSearchMsg(""); reveal(id, true); };
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" && hits.length) { e.preventDefault(); setHitAt((k) => (k + 1) % hits.length); }
    else if (e.key === "ArrowUp" && hits.length) { e.preventDefault(); setHitAt((k) => (k - 1 + hits.length) % hits.length); }
    else if (e.key === "Enter" && hits.length) { e.preventDefault(); pick(hits[hitAt].id); }
    else if (e.key === "Escape") { e.preventDefault(); if (query) { setQuery(""); setHits([]); setSearchMsg(""); } else setSel(null); }
  };

  // ---- keyboard on the node list
  const onKbKey = (e: React.KeyboardEvent, k: number) => {
    const go = (j: number) => { const bs = kbRef.current?.querySelectorAll<HTMLButtonElement>("button"); bs?.[Math.max(0, Math.min(items.length - 1, j))]?.focus(); };
    if (e.key === "Escape") { e.preventDefault(); setSel(null); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(items[k]?.id ?? null); }
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); go(k + 1); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); go(k - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(items.length - 1); }
  };
  const onRootKey = (e: React.KeyboardEvent) => { if (e.key === "Escape" && sel && !(e.target as HTMLElement).closest(".gr-kb-list, .gr-find")) setSel(null); };

  const deg = useMemo(() => { const d = new Map<string, [number, number]>(); for (const e of spec.edges) { if (e.from === e.to) continue; const a = d.get(e.from) ?? [0, 0]; a[1]++; d.set(e.from, a); const b = d.get(e.to) ?? [0, 0]; b[0]++; d.set(e.to, b); } return d; }, [spec]);
  const top5 = useMemo(() => [...deg].sort((a, b) => b[1][0] + b[1][1] - (a[1][0] + a[1][1]) || (m.order.get(a[0]) ?? 0) - (m.order.get(b[0]) ?? 0)).slice(0, 5), [deg, m]);
  const labelOf = (id: string) => m.nodes.get(id)?.label ?? m.groups.get(id)?.label ?? id;
  const toneOf = (id: string) => m.nodes.get(id)?.tone ?? m.groups.get(id)?.tone ?? "none";
  const tagItem = tagFor ? items.find((x) => x.id === tagFor) : null;
  const tagDeg = tagFor ? (info && info.id === tagFor ? [info.ins.reduce((s, l) => s + l.count, 0), info.outs.reduce((s, l) => s + l.count, 0)] : deg.get(tagFor) ?? [0, 0]) : [0, 0];
  const hint = touch ? t.hintTouch : t.hintMouse;
  const ariaOf = (it: Item) => { const d = deg.get(it.id); return `${it.label}${it.kind === "folded" ? `, ${t.folded} ${t.group}, ${it.count} ${t.nodes}` : it.kind === "open" ? `, ${t.group}, ${it.count} ${t.nodes}` : ""}${it.group ? `, ${t.inGroup} ${labelOf(it.group)}` : ""}${d ? `, ${d[0]} in, ${d[1]} out` : ""}`; };

  return (
    <div ref={rootRef} className={`gr size-${spec.size}${ready ? " is-ready" : ""}`} data-layout={spec.layout} onKeyDown={onRootKey}>
      {spec.title ? <div className="gr-title" data-dh-slot="title">{spec.title}</div> : null}
      <div className="gr-bar" data-dh-slot="toolbar">
        <div className="gr-find" role="search">
          <svg className="gr-find-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input type="search" className="gr-find-input" placeholder={t.find} aria-label={t.findLabel} value={query} disabled={!ready} onChange={(e) => search(e.target.value)} onKeyDown={onSearchKey} role="combobox" aria-expanded={hits.length > 0} aria-controls={`${uid}-hits`} aria-autocomplete="list" aria-activedescendant={hits.length ? `${uid}-hit-${hitAt}` : undefined} />
          {hits.length ? (
            <ul className="gr-hits" role="listbox" id={`${uid}-hits`} data-dh-slot="search-results">
              {hits.map((h, k) => <li key={h.id} id={`${uid}-hit-${k}`} role="option" aria-selected={k === hitAt}><button type="button" tabIndex={-1} className={k === hitAt ? "is-on" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h.id)}><span className={`gr-dot tone-${toneOf(h.id)}`} /><span className="gr-hit-l">{h.label}</span>{h.label !== h.id ? <code>{h.id}</code> : null}{h.where ? <span className="gr-hit-w">{h.where}</span> : null}</button></li>)}
            </ul>
          ) : searchMsg ? <div className="gr-hits gr-hits-none" role="status">{searchMsg}</div> : null}
        </div>
        <div className="gr-seg" role="group" aria-label={t.focus}>
          <span className="gr-seg-l" aria-hidden="true">{t.focus}</span>
          <button type="button" aria-pressed={steps === 1} onClick={() => setSteps(1)} disabled={!ready}>{t.step1}</button>
          <button type="button" aria-pressed={steps === 2} onClick={() => setSteps(2)} disabled={!ready}>{t.step2}</button>
        </div>
        {topGroups.length ? <button type="button" className="gr-btn" onClick={foldAll} disabled={!ready}>{anyOpen ? t.foldAll : t.openAll}</button> : null}
      </div>
      <div className="gr-body">
        <div className="gr-stage" data-dh-slot="stage">
          <svg className="gr-hulls" aria-hidden="true" data-dh-slot="group-areas">
            <g ref={hullG}>{hulls.map((h) => <g key={h.id} className={`gr-hull tone-${h.tone}${nearGroups && !nearGroups.has(h.id) ? " is-faded" : ""}${sel === h.id ? " is-sel" : ""}${kb === h.id ? " is-kb" : ""}`}><path className="gr-hull-edge" d={h.d} strokeWidth={2 * h.pad + 3} /><path className="gr-hull-fill" d={h.d} strokeWidth={2 * h.pad} /></g>)}</g>
          </svg>
          <div ref={cyBox} className="gr-cy" aria-hidden="true" />
          <svg className="gr-hull-names" aria-hidden="true" data-dh-slot="group-names">
            <g ref={hullText}>{hulls.map((h) => <text key={h.id} data-id={h.id} className={`gr-hull-l tone-${h.tone}${nearGroups && !nearGroups.has(h.id) ? " is-faded" : ""}`} textAnchor="middle">{h.label}</text>)}</g>
          </svg>
          <div ref={lodRef} className="gr-lods" aria-hidden="true" data-dh-slot="node-names" />
          {!ready ? (
            <div className="gr-still" data-dh-slot="still">
              {spec.still ? <StillGraph still={spec.still} title={spec.title} ui={t} uid={uid} /> : null}
              <p className="gr-still-note">{failed ? failed : hydrated ? t.loading : t.noScript}</p>
            </div>
          ) : null}
          <div ref={tagRef} className={`gr-tag tone-${tagItem ? tagItem.tone : "none"}${kb && kb === tagFor ? " is-kb" : ""}`} data-for={tagFor ?? ""} aria-hidden="true" data-dh-slot="node-label" style={{ visibility: "hidden" }}>
            {tagItem ? <><b>{tagItem.label}</b><span className="gr-tag-m">{tagItem.kind !== "node" ? `${tagItem.count} ${t.nodes} · ` : ""}{tagDeg[0]} in · {tagDeg[1]} out</span></> : null}
          </div>
          <div ref={kbRef} className="gr-kb-list" role="list" aria-label={t.nodeList}>
            {items.map((it, k) => <div role="listitem" key={it.id}><button type="button" data-id={it.id} aria-label={ariaOf(it)} aria-pressed={sel === it.id} onFocus={() => setKb(it.id)} onBlur={() => setKb((x) => (x === it.id ? null : x))} onClick={() => setSel(it.id)} onKeyDown={(e) => onKbKey(e, k)} /></div>)}
          </div>
          <div className="gr-zoom" data-dh-slot="zoom">
            <button type="button" onClick={() => zoomBy(1.35)} aria-label={t.zoomIn} title={t.zoomIn} disabled={!ready}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
            <button type="button" onClick={() => zoomBy(1 / 1.35)} aria-label={t.zoomOut} title={t.zoomOut} disabled={!ready}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
            <button type="button" onClick={() => fitAll()} aria-label={t.fit} title={t.fit} disabled={!ready}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
          </div>
        </div>
        <aside className="gr-side" data-dh-slot="side" aria-live="polite">
          {info ? (
            <div className={`gr-info tone-${info.tone}`}>
              <div className="gr-info-head">
                <span className={`gr-dot tone-${info.tone}`} />
                <div className="gr-info-t"><b>{info.label}</b>{info.label !== info.id ? <code>{info.id}</code> : null}</div>
                <button type="button" className="gr-x" onClick={() => setSel(null)} aria-label={t.clear} title={t.clear}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
              </div>
              {info.group ? <div className="gr-info-g">{t.inGroup} <button type="button" className={`gr-chip tone-${toneOf(info.group)}`} onClick={() => setSel(info.group)}>{labelOf(info.group)}</button></div> : null}
              {info.note ? <p className="gr-note">{info.note}</p> : null}
              {info.kind !== "node" ? (
                <div className="gr-info-fold"><span>{info.count} {t.nodes}{info.kind === "folded" ? ` · ${t.folded}` : ""}</span><button type="button" className="gr-btn" onClick={() => toggle(info.id)}>{info.kind === "folded" ? t.open : t.fold}</button></div>
              ) : null}
              <LinkList title={t.out} arrow="→" links={info.outs} t={t} pick={(id) => reveal(id)} toneOf={toneOf} cls="is-out" />
              <LinkList title={t.in} arrow="←" links={info.ins} t={t} pick={(id) => reveal(id)} toneOf={toneOf} cls="is-in" />
              {info.kind === "open" && info.members.length ? (
                <div className="gr-list"><div className="gr-list-h">{t.members} <span>{info.members.length}</span></div><ul>{info.members.slice(0, 24).map((id) => <li key={id}><button type="button" onClick={() => reveal(id)}><span className={`gr-dot tone-${toneOf(id)}`} />{labelOf(id)}</button></li>)}</ul>{info.members.length > 24 ? <p className="gr-more">+ {info.members.length - 24} {t.more}</p> : null}</div>
              ) : null}
            </div>
          ) : (
            <div className="gr-over">
              <p className="gr-sum"><b>{spec.nodes.length}</b> {t.nodes} · <b>{spec.edges.length}</b> {t.edges}{spec.groups.length ? <> · <b>{spec.groups.length}</b> {t.groups.toLowerCase()}</> : null}</p>
              {topGroups.length ? (
                <div className="gr-list"><div className="gr-list-h">{t.groups}</div><ul>{topGroups.map((g) => <li key={g} className="gr-grow"><button type="button" className="gr-grow-l" onClick={() => reveal(g)} disabled={!ready}><span className={`gr-dot tone-${toneOf(g)}`} />{labelOf(g)}<span className="gr-n">{m.under.get(g)!.length}</span></button><button type="button" className="gr-btn gr-btn-s" onClick={() => toggle(g)} disabled={!ready} aria-label={`${folded.has(g) ? t.open : t.fold} ${labelOf(g)}`}>{folded.has(g) ? t.open : t.fold}</button></li>)}</ul></div>
              ) : null}
              {top5.length ? <div className="gr-list"><div className="gr-list-h">{t.mostConnected}</div><ul>{top5.map(([id, d]) => <li key={id}><button type="button" onClick={() => reveal(id, true)} disabled={!ready}><span className={`gr-dot tone-${toneOf(id)}`} />{labelOf(id)}<span className="gr-n">{d[0]} in · {d[1]} out</span></button></li>)}</ul></div> : null}
              <p className="gr-tip">{t.overview}</p>
            </div>
          )}
        </aside>
      </div>
      <p className="gr-hint" aria-hidden="true">{hint}</p>
    </div>
  );
}

function LinkList({ title, arrow, links, t, pick, toneOf, cls }: { title: string; arrow: string; links: Link[]; t: GUi; pick: (id: string) => void; toneOf: (id: string) => string; cls: string }) {
  const n = links.reduce((s, l) => s + l.count, 0);
  return (
    <div className={`gr-list ${cls}`}>
      <div className="gr-list-h">{title} <span>{n}</span></div>
      {links.length ? <ul>{links.map((l) => <li key={l.id}><button type="button" onClick={() => pick(l.id)}><span className="gr-arrow" aria-hidden="true">{arrow}</span><span className={`gr-dot tone-${toneOf(l.id)}`} /><span className="gr-l">{l.label}</span>{l.count > 1 ? <span className="gr-n">{t.links(l.count)}</span> : null}{l.edge ? <span className="gr-e">{l.edge}</span> : null}</button></li>)}</ul> : <p className="gr-none">{t.none}</p>}
    </div>
  );
}
