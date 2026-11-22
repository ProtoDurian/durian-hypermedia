// The frame side of a folder part (format version 11): turns a part's view into the component DocumentView draws.
// It measures the width the part may use, reads the theme and motion, resolves `static`, and hands them to the view as
// PartStage. It never lays out, scales or clips what the part draws: a part may place every box, line and word itself.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDh } from "../react/context";
import type { PartBlock, PartStage, PartViewProps, StaticProp } from "./types";

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The fence's `static=` value as a StaticProp: "" or "true" = the finished state, "false" = live, else a step. */
export function staticOfAttr(v: string | undefined): StaticProp {
  if (v === undefined) return undefined;
  if (v === "false") return false;
  return v === "true" ? "" : v;
}

function themeOf(el: Element | null): "light" | "dark" {
  for (let e = el; e; e = e.parentElement) { const t = e.getAttribute("data-theme"); if (t === "dark" || t === "light") return t; }
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function motionOf(el: Element | null): "on" | "off" {
  if (el?.closest('[data-dh-motion="off"]')) return "off";
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "off" : "on";
}

/** The stage of the part inside `ref`: its width, theme and motion, kept current. */
export function useStage(ref: React.RefObject<HTMLElement | null>): PartStage {
  const [s, setS] = useState<{ width: number; theme: "light" | "dark"; motion: "on" | "off" }>({ width: 0, theme: "light", motion: "on" });
  const size = useRef<{ width: number; height: number } | null>(null);
  useIso(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const read = () => setS((o) => {
      const n = { width: Math.round(el.clientWidth), theme: themeOf(el), motion: motionOf(el) };
      return n.width === o.width && n.theme === o.theme && n.motion === o.motion ? o : n;
    });
    read();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    ro?.observe(el);
    // the theme and motion switches are attributes on an ancestor (the page's <html>, the document's root)
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(read) : null;
    for (let e: Element | null = el; e; e = e.parentElement) mo?.observe(e, { attributes: true, attributeFilter: ["data-theme", "data-dh-motion"] });
    const qs = ["(prefers-color-scheme: dark)", "(prefers-reduced-motion: reduce)"].map((q) => window.matchMedia?.(q)).filter(Boolean) as MediaQueryList[];
    for (const q of qs) q.addEventListener?.("change", read);
    return () => { ro?.disconnect(); mo?.disconnect(); for (const q of qs) q.removeEventListener?.("change", read); };
  }, [ref]);
  const report = useCallback((z: { width: number; height: number }) => {
    size.current = z;
    const el = ref.current;
    if (el) { el.dataset.dhW = String(Math.round(z.width)); el.dataset.dhH = String(Math.round(z.height)); }
  }, [ref]);
  return { ...s, report };
}

/** The component DocumentView draws for a folder part: the stage box around the part's own view. */
export function partComponent<D>(name: string, View: React.ComponentType<PartViewProps<D>>): React.ComponentType<{ block: PartBlock<D> }> {
  function FolderPart({ block }: { block: PartBlock<D> }) {
    const { ui, static: docStatic } = useDh();
    const ref = useRef<HTMLDivElement>(null);
    const stage = useStage(ref);
    const fence = staticOfAttr(block.attrs.static);
    const st: StaticProp = fence !== undefined ? fence : docStatic;
    return (
      <div ref={ref} className={`dh-part-stage dh-part-${name}`} data-dh-part={name}>
        <View data={block.data} block={block} ui={ui} static={st} stage={stage} />
      </div>
    );
  }
  FolderPart.displayName = `${name}Part`;
  return FolderPart;
}
