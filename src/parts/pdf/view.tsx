// The PDF part's view (format version 11): pages drawn by pdf.js (isEvalSupported: false).
// A page at a time or scrolling, page number and count, zoom (fit width, fit page, in, out), search, the outline, Download.
// The text is selectable (pdf.js's text layer, built with createElement and textContent, no HTML strings).
// The file is fetched by us and checked at load (size, pages) against the caps before pdf.js parses it.
//
// The worker: `new Worker(url)` is a script-URL sink, and a page that allows no policy (strict Trusted Types) cannot make a
// Trusted URL. So the default is pdf.js's own "fake worker" way: the worker module is imported (the host's bundler makes it a
// chunk of its own origin) into the main thread and handed over as `globalThis.pdfjsWorker`, which is not a sink. A host that
// wants a real Worker (the page keeps its scrolling smooth on a big file) serves pdf.worker.min.mjs from its own origin and
// says so: <html data-dh-pdf-worker="worker" data-dh-pdf-worker-src="/assets/pdf.worker.min.mjs">; that is used only when the
// page's own header does not require Trusted Types.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Budget, partLimitsOf } from "../../core/budget";
import type { PartViewProps } from "../types";
import { Icon, STR, clamp, useMediaUrl } from "../downloads/media-ui";
import { mediaBytes } from "../downloads/media-fetch";
import type { PdfSpec } from "./part";

const H = { s: 380, m: 560, l: 760 } as const;
let libP: Promise<any> | null = null;
/** does the page's own header require Trusted Types (a HEAD request to the page itself)? */
async function strictTT(): Promise<boolean> {
  if (!(window as any).trustedTypes) return false;
  try { const r = await fetch(location.href, { method: "HEAD", cache: "force-cache" }); return (r.headers.get("content-security-policy") ?? "").toLowerCase().includes("require-trusted-types-for"); } catch { return false; }
}
function lib(): Promise<any> {
  return (libP ??= (async () => {
    const pdfjs: any = await import("pdfjs-dist/build/pdf.min.mjs");
    const html = document.documentElement.dataset;
    const real = html.dhPdfWorker === "worker" && !!html.dhPdfWorkerSrc && !(await strictTT());
    if (real) pdfjs.GlobalWorkerOptions.workerSrc = new URL(html.dhPdfWorkerSrc!, location.href).href;
    else {
      // the worker module runs on the main thread: no Worker, no script URL, nothing for a Trusted Types policy to refuse
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", location.href).href;   // never fetched: the module below answers
      (globalThis as any).pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.min.mjs");
    }
    return pdfjs;
  })());
}
/** a budget of its own for one search over the text (the page's budget was spent when it was parsed) */
const scratch = () => new Budget(partLimitsOf(), null, null, "the pdf part");

type OutlineItem = { title: string; page: number; depth: number };
type Hit = { page: number; item: number };

function PageView({ doc, num, scale, pdfjs, hits, cur, size, onSize, eager, rootEl }: { doc: any; num: number; scale: number; pdfjs: any; hits: Hit[]; cur: Hit | null; size: { w: number; h: number }; onSize: (n: number, w: number, h: number) => void; eager: boolean; rootEl: HTMLElement | null }) {
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null), tl = useRef<HTMLDivElement>(null), layer = useRef<any>(null);
  const [vis, setVis] = useState(eager), [dims, setDims] = useState(size);
  useEffect(() => { setVis(eager); }, [eager]);
  useEffect(() => {
    if (eager || !box.current) return;
    const io = new IntersectionObserver((es) => setVis(es[es.length - 1].isIntersecting), { root: rootEl, rootMargin: "600px 0px" });
    io.observe(box.current); return () => io.disconnect();
  }, [eager, rootEl]);
  useEffect(() => {
    if (!vis) return; let dead = false, task: any = null;
    (async () => {
      const page = await doc.getPage(num); if (dead) return;
      const vp = page.getViewport({ scale }), dpr = Math.min(2, devicePixelRatio || 1), c = cv.current!;
      onSize(num, vp.width / scale, vp.height / scale); setDims({ w: vp.width, h: vp.height });
      c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr); c.style.width = `${Math.floor(vp.width)}px`; c.style.height = `${Math.floor(vp.height)}px`;
      task = page.render({ canvas: c, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      try { await task.promise; } catch (e: any) { if (e?.name === "RenderingCancelledException") return; throw e; }
      if (dead) return;
      // The text layer is laid out TEXT_UP times larger and scaled back down by the browser, so each word keeps a real font size
      // (small print on a small page is not a word under 11 px) while the box over the picture is exactly the page.
      const t = tl.current!, up = page.getViewport({ scale: scale * TEXT_UP }); t.textContent = ""; t.style.setProperty("--total-scale-factor", String(scale * TEXT_UP));
      t.style.width = `${up.width}px`; t.style.height = `${up.height}px`; t.style.transform = `scale(${1 / TEXT_UP})`;
      const L = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: t, viewport: up });
      layer.current = L; await L.render();
      if (!dead) mark();
    })().catch(() => {});
    return () => { dead = true; try { task?.cancel(); } catch {} };
  }, [vis, doc, num, scale]); // eslint-disable-line
  const mark = useCallback(() => {
    const L = layer.current; if (!L) return;
    const mine = new Set(hits.filter((h) => h.page === num).map((h) => h.item));
    (L.textDivs as HTMLElement[]).forEach((d, i) => { d.classList.toggle("is-hit", mine.has(i)); d.classList.toggle("is-cur", !!cur && cur.page === num && cur.item === i); });
    if (cur && cur.page === num) (L.textDivs[cur.item] as HTMLElement | undefined)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [hits, cur, num]);
  useEffect(mark, [mark]);
  return (
    <div ref={box} className="pv-page" data-dh-slot="page" data-page={num} style={{ width: dims.w || undefined, height: dims.h || undefined }}>
      <canvas ref={cv} />
      <div ref={tl} className="textLayer" />
    </div>
  );
}

const TEXT_UP = 4;
export default function PdfView({ data: spec }: PartViewProps<PdfSpec>) {
  const url = useMediaUrl();
  const src = url(spec.src, "image") ?? "", caps = spec.caps;
  const root = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), pages = useRef<HTMLDivElement>(null), qin = useRef<HTMLInputElement>(null);
  const [pdfjs, setPdfjs] = useState<any>(null), [doc, setDoc] = useState<any>(null), [n, setN] = useState(0), [page, setPage] = useState(spec.page), [err, setErr] = useState(""), [note, setNote] = useState("");
  const [mode, setMode] = useState<"fitw" | "fitp" | number>("fitw"), [box, setBox] = useState({ w: 0, h: 0 }), [dims, setDims] = useState<Record<number, { w: number; h: number }>>({});
  const [outline, setOutline] = useState<OutlineItem[]>([]), [showOutline, setShowOutline] = useState(false), [q, setQ] = useState(""), [hits, setHits] = useState<Hit[]>([]), [hitI, setHitI] = useState(0), [busy, setBusy] = useState(false), [searching, setSearching] = useState(false);
  const [view, setView] = useState(spec.view), [ready, setReady] = useState(false);
  const h = H[spec.height as keyof typeof H] ?? 560;
  const texts = useRef<Record<number, string[]>>({}), sw = useRef<{ x: number; y: number } | null>(null);

  // ---- load: fetch the file ourselves, check the caps, then let pdf.js read it
  useEffect(() => {
    let dead = false, task: any = null; const controller = new AbortController();
    (async () => {
      try {
        if (!src) throw new Error(STR.addressRefused);
        const buf = await mediaBytes(src, caps.bytes, controller.signal);
        if (dead) return;
        const lj = await lib(); if (dead) return;
        task = lj.getDocument({ data: buf, isEvalSupported: false, enableScripting: false, useWorkerFetch: false, verbosity: 0 });
        const d = await task.promise; if (dead) { d.destroy(); return; }
        if (d.numPages > caps.pages) { try { d.destroy(); } catch {} throw new Error(`the document has ${d.numPages} pages; the most is ${caps.pages}`); }
        setPdfjs(lj); setDoc(d); setN(d.numPages); setPage(clamp(spec.page, 1, d.numPages)); setReady(true);
        try {
          const o = await d.getOutline(); const flat: OutlineItem[] = [];
          const walk = async (items: any[], depth: number) => { for (const it of items ?? []) { if (flat.length >= 200 || depth > 3) return; let pg = 0; try { const dest = typeof it.dest === "string" ? await d.getDestination(it.dest) : it.dest; if (dest) pg = (await d.getPageIndex(dest[0])) + 1; } catch {} const tt = String(it.title ?? "").trim(), h = tt.length / 2; // a heading that a page repeats in its anchor reads twice: keep one
          flat.push({ title: (tt.length % 2 === 0 && tt.slice(0, h) === tt.slice(h) ? tt.slice(0, h) : tt).slice(0, 120), page: pg, depth }); await walk(it.items, depth + 1); } };
          await walk(o ?? [], 0); if (!dead) setOutline(flat.filter((x) => x.page));
        } catch {}
      } catch (e: any) { if (!dead) setErr(`${spec.src}: ${e?.message ?? e}`); }
    })();
    return () => { dead = true; controller.abort(); try { task?.destroy(); } catch {} };
  }, [src, caps]); // eslint-disable-line
  useEffect(() => {
    const el = body.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: pages.current?.clientWidth ?? el.clientWidth, h: pages.current?.clientHeight ?? el.clientHeight })); ro.observe(el); if (pages.current) ro.observe(pages.current);
    return () => ro.disconnect();
  }, [ready]);

  const first = dims[page] ?? dims[1] ?? { w: 612, h: 792 };
  const fitW = box.w ? Math.max(0.2, (box.w - 24) / first.w) : 1, fitP = box.h ? Math.min(fitW, Math.max(0.2, (box.h - 24) / first.h)) : 1;
  const scale = mode === "fitw" ? fitW : mode === "fitp" ? fitP : mode;
  const zoom = (f: number) => setMode(clamp(Math.round(scale * f * 100) / 100, 0.25, 4));
  const go = useCallback((p: number) => { const x = clamp(Math.round(p), 1, n || 1); setPage(x); if (view === "scroll") pages.current?.querySelector<HTMLElement>(`[data-page="${x}"]`)?.scrollIntoView({ block: "start" }); else pages.current?.scrollTo({ top: 0, left: 0 }); }, [n, view]);
  const onSize = useCallback((k: number, w: number, hh: number) => setDims((d) => (d[k] && Math.abs(d[k].w - w) < 0.5 && Math.abs(d[k].h - hh) < 0.5 ? d : { ...d, [k]: { w, h: hh } })), []);
  // scrolling mode: the page in view is the current one
  useEffect(() => {
    if (view !== "scroll" || !pages.current || !ready) return; const el = pages.current;
    const f = () => { let best = 1, bd = 1e9; el.querySelectorAll<HTMLElement>(".pv-page").forEach((p) => { const d = Math.abs(p.offsetTop - el.scrollTop - 20); if (d < bd) { bd = d; best = +p.dataset.page!; } }); setPage(best); };
    el.addEventListener("scroll", f, { passive: true }); return () => el.removeEventListener("scroll", f);
  }, [view, ready]);
  useEffect(() => { if (view === "scroll" && ready && spec.page > 1) window.setTimeout(() => go(spec.page), 50); }, [ready, view]); // eslint-disable-line

  // ---- search: the text of every page is read once, and each run is charged a budget of its own
  const find = useCallback(async (query: string) => {
    const qq = query.trim().toLowerCase(); if (!doc || !qq) { setHits([]); setHitI(0); return; }
    setBusy(true); const b = scratch(); const out: Hit[] = [];
    try {
      for (let p = 1; p <= n; p++) {
        if (!texts.current[p]) texts.current[p] = ((await (await doc.getPage(p)).getTextContent()).items as any[]).map((x) => String(x.str ?? ""));
        const items = texts.current[p]; b.charge(items.length, 1);
        items.forEach((s, i) => { if (s.toLowerCase().includes(qq) && out.length < 2000) out.push({ page: p, item: i }); });
      }
      setNote("");
    } catch (e: any) { setNote(`${STR.findInPdf}: too much work; make the search smaller`); out.length = 0; }
    setHits(out); setHitI(0); setBusy(false); if (out[0]) go(out[0].page);
  }, [doc, n, go]);
  const step = (d: number) => { if (!hits.length) return; const k = (hitI + d + hits.length) % hits.length; setHitI(k); go(hits[k].page); };

  const key = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement; if (t.tagName === "INPUT" && t !== qin.current) return; if (t === qin.current) { if (e.key === "Enter") { e.preventDefault(); if (hits.length && qin.current?.value.trim().toLowerCase() === q.trim().toLowerCase() && hits.length) step(e.shiftKey ? -1 : 1); else void find(qin.current!.value); } else if (e.key === "Escape") { setQ(""); setHits([]); pages.current?.focus(); } return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (t.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    const inPages = pages.current?.contains(t);
    if (e.key === "PageDown" || (view === "page" && e.key === "ArrowRight" && inPages)) { e.preventDefault(); go(page + 1); }
    else if (e.key === "PageUp" || (view === "page" && e.key === "ArrowLeft" && inPages)) { e.preventDefault(); go(page - 1); }
    else if (e.key === "Home" && inPages) { e.preventDefault(); go(1); } else if (e.key === "End" && inPages) { e.preventDefault(); go(n); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoom(1.25); } else if (e.key === "-") { e.preventDefault(); zoom(0.8); } else if (e.key === "0") { e.preventDefault(); setMode("fitw"); }
    else if (e.key === "/") { e.preventDefault(); setSearching(true); window.setTimeout(() => qin.current?.focus(), 0); }
    else if (e.key === "Escape" && showOutline) setShowOutline(false);
  };
  // a swipe turns the page (in the page view, when the page is not wider than the box)
  const swipe = {
    onPointerDown: (e: React.PointerEvent) => { if (e.pointerType === "mouse") return; sw.current = { x: e.clientX, y: e.clientY }; },
    onPointerUp: (e: React.PointerEvent) => { const s = sw.current; sw.current = null; if (!s || view !== "page") return; const dx = e.clientX - s.x, dy = e.clientY - s.y; const el = pages.current!; if (el.scrollWidth > el.clientWidth + 2) return; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(page + (dx < 0 ? 1 : -1)); },
    onPointerCancel: () => { sw.current = null; },
  };
  const list = useMemo(() => (view === "scroll" ? Array.from({ length: n }, (_, i) => i + 1) : [page]), [view, n, page]);
  const title = spec.title || spec.src.split("/").pop() || "";
  const cur = hits[hitI] ?? null;
  const wide = box.w > 0 && first.w * scale > box.w - 4;

  return (
    <div ref={root} className="pv dh-media" data-h={spec.height} data-view={view} data-wide={wide ? "1" : "0"} onKeyDown={key}>
      <div className="pv-bar" data-dh-slot="toolbar" role="toolbar" aria-label={`PDF: ${title}`}>
        {outline.length ? <button type="button" className="m-ctl" onClick={() => setShowOutline((o) => !o)} aria-expanded={showOutline} aria-label={STR.outline} title={STR.outline}><Icon n="list" /></button> : null}
        <button type="button" className="m-ctl" onClick={() => go(page - 1)} disabled={!ready || page <= 1} aria-label={STR.prev}><Icon n="left" /></button>
        <span className="pv-pn"><input type="number" min={1} max={n || 1} value={page} disabled={!ready} aria-label={STR.page} onChange={(e) => e.target.value && go(+e.target.value)} /><span>/ {n || "–"}</span></span>
        <button type="button" className="m-ctl" onClick={() => go(page + 1)} disabled={!ready || page >= n} aria-label={STR.next}><Icon n="right" /></button>
        <span className="m-grow" />
        <button type="button" className="m-ctl" onClick={() => zoom(0.8)} disabled={!ready} aria-label={STR.zoomOut} title={STR.zoomOut}><Icon n="minus" /></button>
        <span className="pv-zoom" aria-live="polite">{Math.round(scale * 100)}%</span>
        <button type="button" className="m-ctl" onClick={() => zoom(1.25)} disabled={!ready} aria-label={STR.zoomIn} title={STR.zoomIn}><Icon n="plus" /></button>
        <button type="button" className="m-ctl" onClick={() => setMode("fitw")} disabled={!ready} aria-pressed={mode === "fitw"} aria-label={STR.fitWidth} title={STR.fitWidth}><Icon n="fitw" /></button>
        <button type="button" className="m-ctl" onClick={() => setMode("fitp")} disabled={!ready} aria-pressed={mode === "fitp"} aria-label={STR.fitPage} title={STR.fitPage}><Icon n="fitp" /></button>
        <button type="button" className="m-ctl" onClick={() => { setSearching((s) => !s); window.setTimeout(() => qin.current?.focus(), 0); }} disabled={!ready} aria-expanded={searching} aria-label={STR.findInPdf} title={STR.findInPdf}><Icon n="search" /></button>
        {src ? <a className="m-ctl" href={src} download aria-label={STR.download} title={STR.download}><Icon n="dl" /></a> : null}
      </div>
      {searching ? (
        <div className="pv-find" data-dh-slot="search" role="search">
          <input ref={qin} type="search" value={q} placeholder={STR.findInPdf} aria-label={STR.findInPdf} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="m-ctl has-text" onClick={() => void find(q)} disabled={busy || !q.trim()}>{busy ? STR.loading : STR.search.split(" ")[0]}</button>
          <span className="pv-count" aria-live="polite">{hits.length ? `${hitI + 1} ${STR.of} ${hits.length}` : q.trim() && !busy && texts.current[1] ? STR.noMatch : ""}</span>
          <button type="button" className="m-ctl" onClick={() => step(-1)} disabled={!hits.length} aria-label={STR.prev}><Icon n="left" /></button>
          <button type="button" className="m-ctl" onClick={() => step(1)} disabled={!hits.length} aria-label={STR.next}><Icon n="right" /></button>
        </div>
      ) : null}
      <div className="pv-body" ref={body} style={{ height: h }}>
        {showOutline && outline.length ? (
          <nav className="pv-outline" data-dh-slot="outline" aria-label={STR.outline}>
            {outline.map((o, i) => <button key={i} type="button" style={{ paddingLeft: 10 + o.depth * 14 }} aria-current={o.page === page ? "true" : undefined} onClick={() => { go(o.page); if (matchMedia("(max-width: 640px)").matches) setShowOutline(false); }}><span>{o.title}</span><i>{o.page}</i></button>)}
          </nav>
        ) : null}
        <div className="pv-pages" ref={pages} tabIndex={0} role="document" aria-label={title} {...swipe}>
          {ready && doc ? list.map((k) => <PageView key={`${k}-${scale.toFixed(3)}`} doc={doc} num={k} scale={scale} pdfjs={pdfjs} hits={hits} cur={cur} size={{ w: (dims[k] ?? first).w * scale, h: (dims[k] ?? first).h * scale }} onSize={onSize} eager={view === "page"} rootEl={pages.current} />) : <p className="pv-load">{err ? "" : STR.loading}</p>}
        </div>
      </div>
      {err ? <p className="m-err" role="alert">{err}</p> : note ? <p className="m-note">{note}</p> : null}
    </div>
  );
}
