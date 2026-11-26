// The chart part's painter: primitives (types.ts Prim) as SVG with page tokens only, and the tween that glides the primitives of
// one set of numbers to those of the next by key (a bar, a slice, a radar corner, a line with the same commands). Classes
// (xy-*, ch-*, kd-*) add what a role cannot say; their sheet is src/ui/chartprims.css (built by ./gen.ts).
import { rotOf } from "./rot";
import React, { useEffect, useRef, useState } from "react";
import type { Prim, Font } from "../types";
import { FONT, PHONE_FONT, LINE_H, measure } from "../../core/stage-core";
import { measureAt } from "../render/font"; // phone sizes scoped, not a global flag (review 2)
import { tweenFrames } from "../render/svg";

const NAMED: Record<string, string> = { accent: "acc", acc: "acc", muted: "faint", good: "good", bad: "bad", warn: "warn" };
const fam = (r: string | null | undefined): string | null => (r ? (/^c[1-8]$/.test(r) ? r : NAMED[r] ?? null) : null);
const col = (r: string | null | undefined, part = ""): string | null => { const f = fam(r); return f ? `var(--${f}${part})` : null; };
const soft = (r: string | null | undefined): string => col(r, "-soft") ?? "var(--surface-2)";
const inkOf = (r: string | null | undefined): string => col(r, "-ink") ?? col(r) ?? "var(--ink)";
const f1 = (n: number) => Math.round(n * 100) / 100;
export const fontPx = (f: Font, phone: boolean): number => (phone ? PHONE_FONT[f] : undefined) ?? FONT[f].size;

export type Drawn = { p: Prim; o: number; key: string };
function El({ p, o, phone, lit }: { p: Prim; o: number; phone: boolean; lit?: boolean }) {
  const op = o < 0.999 ? o : undefined, cls = [p.cls, lit && "is-lit"].filter(Boolean).join(" ") || undefined;
  switch (p.k) {
    case "rect": {
      const tone = p.tone && p.tone !== "off" ? p.tone : null, r = tone ?? p.role;
      const fill = p.fill === "none" ? "none" : p.fill === "role" ? col(r) ?? "var(--surface-2)" : p.fill === "soft" ? soft(r) : "var(--surface-2)";
      const stroke = !p.edge || p.edge === "none" ? "none" : p.edge === "role" ? col(r) ?? "var(--line)" : "var(--line)";
      return <rect data-key={p.key} className={cls} x={f1(p.rect.x)} y={f1(p.rect.y)} width={f1(Math.max(0, p.rect.w))} height={f1(Math.max(0, p.rect.h))} rx={p.r ?? 0} fill={fill} stroke={stroke} strokeWidth={1.2} opacity={op} strokeOpacity={p.edge === "faint" ? 0.5 : undefined} />;
    }
    case "box": {
      const r = p.tone && p.tone !== "off" ? p.tone : p.role, { x, y, w, h } = p.rect;
      if (p.shape === "diamond") return <path data-key={p.key} className={cls} d={`M${f1(x + w / 2)} ${f1(y)}L${f1(x + w)} ${f1(y + h / 2)}L${f1(x + w / 2)} ${f1(y + h)}L${f1(x)} ${f1(y + h / 2)}Z`} fill={col(r) ?? "var(--ink-2)"} stroke="var(--surface)" opacity={op} />;
      return <rect data-key={p.key} className={cls} x={f1(x)} y={f1(y)} width={f1(Math.max(0, w))} height={f1(Math.max(0, h))} rx={1} fill={col(r) ?? "var(--ink-2)"} stroke="var(--surface)" opacity={op} />;
    }
    case "path": {
      const sw = p.width === "thin" ? 1 : p.width === "hot" ? 3.5 : p.width === "line" ? 2.5 : 2, c = col(p.role);
      const fill = p.fill === "soft" ? soft(p.role) : p.fill === "role" ? c ?? "var(--surface-2)" : "none";
      return <path data-key={p.key} className={cls} d={p.d} fill={fill} fillOpacity={p.fill === "soft" ? 0.5 : undefined} stroke={c ?? "var(--line)"} strokeWidth={sw} strokeDasharray={p.dashed ? "6 4" : undefined} strokeLinejoin="round" opacity={op} />;
    }
    case "dot": {
      const c = col(p.tone && p.tone !== "off" ? p.tone : p.role) ?? "var(--ink-2)";
      return <circle data-key={p.key} className={cls} cx={f1(p.x)} cy={f1(p.y)} r={Math.max(0, f1(p.r))} fill={p.hollow ? "var(--surface)" : c} stroke={p.hollow ? c : "var(--surface)"} strokeWidth={p.hollow ? 1.5 : 1} opacity={op} />;
    }
    case "text": {
      const onSlice = p.key.startsWith("pct:"), fill = onSlice ? "var(--surface)" : p.ink === "muted" ? "var(--muted)" : p.ink === "role" ? inkOf(p.role) : p.ink === "tone" ? inkOf(p.tone) : "var(--ink)", size = fontPx(p.font, phone), pitch = LINE_H[p.font] ?? 16;
      return <text data-key={p.key} className={cls} x={f1(p.x)} y={f1(p.y)} transform={rotOf(p.cls) ? `rotate(${rotOf(p.cls)} ${f1(p.x)} ${f1(p.y)})` : undefined} textAnchor={p.anchor} fill={fill} fontSize={size} fontWeight={FONT[p.font].weight >= 500 ? FONT[p.font].weight : undefined} fontFamily={FONT[p.font].mono ? "var(--font-mono)" : "var(--font-sans)"} opacity={op}>{p.lines.length === 1 ? p.lines[0] : p.lines.map((l, i) => <tspan key={i} x={f1(p.x)} dy={i ? pitch : 0}>{l}</tspan>)}</text>;
    }
    case "chip": {
      const w = Math.ceil(measureAt(p.words, "chip", phone)) + 14, c = col(p.tone && p.tone !== "off" ? p.tone : p.role);
      return <g data-key={p.key} className={cls} opacity={op}><rect x={f1(p.x - w / 2)} y={f1(p.y - 13)} width={w} height={18} rx={9} fill="var(--surface)" stroke={c ?? "var(--line-2)"} strokeWidth={1.2} /><text x={f1(p.x)} y={f1(p.y)} textAnchor="middle" fill="var(--ink)" fontSize={fontPx("chip", phone)} fontWeight={500} fontFamily="var(--font-sans)">{p.words}</text></g>;
    }
  }
}
/** the drawn primitives of one chart (SVG children; the caller owns the <svg>) */
export function Prims({ drawn, phone, lit }: { drawn: Drawn[]; phone: boolean; lit?: Set<string> }) {
  return <>{drawn.map((d) => <El key={d.key} p={d.p} o={d.o} phone={phone} lit={lit?.has(d.key)} />)}</>;
}

/** The primitives to draw now: the ones given, glided from the ones before when the numbers changed (same key = same mark).
 *  `animate` false (reduced motion, static, print, the first draw): always the ones given. A new set while a glide runs starts
 *  from what is on screen. */
export function useGlide(prims: Prim[], animate: boolean, ms = 520): Drawn[] {
  const [prog, setProg] = useState<{ f: Prim[]; t: number }>({ f: prims, t: 1 });
  const from = useRef<Prim[]>(prims), to = useRef<Prim[]>(prims), shown = useRef<Prim[]>(prims), raf = useRef(0);
  if (to.current !== prims) { from.current = shown.current; to.current = prims; }
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (!animate || from.current === prims) { from.current = prims; shown.current = prims; setProg({ f: prims, t: 1 }); return; }
    const t0 = performance.now();
    setProg({ f: prims, t: 0 });
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setProg({ f: prims, t: k });
      if (k < 1) raf.current = requestAnimationFrame(tick); else from.current = prims;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [prims, animate]);
  const t = prog.f === prims ? prog.t : 0, same = !animate || from.current === prims || t >= 1;
  const drawn = same ? prims.map((p) => ({ p, o: 1, key: p.key })) : tweenFrames(from.current, prims, t);
  shown.current = same ? prims : drawn.filter((d) => d.o > 0.5).map((d) => d.p);
  return drawn;
}
