// The 3D stage inside the one engine's React stage (EngineStage). The page draws 2D first (the server's markup, and a
// browser with no WebGL or with reduced motion); where `3d` or `3d only` is on the fence and the browser has WebGL, the
// stage switches to this host, which loads render/three.ts (and three.js) only then, as the old stage loaded its 3D chunk.
// The host draws the step k it is given: the 3D stage tweens from the step before by itself (render/three.ts mount3d).
import React, { useEffect, useRef, useState } from "react";
import type { Compiled } from "../types";
import { hasWebGL } from "../../ui/gl";

export interface ThreeApi { zoom(f: number): void; fit(): void; pan(dx: number, dy: number): void; back(): void } // eng-sweep: back (the story's camera)

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** what the fence asks for and what this browser can do: `want` 3D at all, `only` no 2D button, `can` it has WebGL (3D only with reduced motion needs only WebGL, a 2D-or-3D scene needs motion too) */
export function threeOf(c: Compiled): { want: boolean; only: boolean } {
  const v = c.model.view;
  return { want: v === "3d" || v === "3d-only", only: v === "3d-only" };
}
export const canThree = (only: boolean): boolean => typeof window !== "undefined" && (only || !reduced()) && hasWebGL();

/** the 3D stage for step `k` of a compiled story; `onFail` when it cannot start (the caller goes back to 2D) */
export function ThreeHost({ c, k, apiRef, onFail, loading, speed = 1 }: { c: Compiled; k: number; apiRef?: React.MutableRefObject<ThreeApi | null>; onFail: () => void; loading?: string; /** the page's step speed (eng-3d3: the 3D move follows it) */ speed?: number }) {
  const host = useRef<HTMLDivElement>(null), h = useRef<{ step(k: number): void; jump(k: number): void; dispose(): void } | null>(null), kRef = useRef(k);
  const [wait, setWait] = useState(true);
  const speedRef = useRef(speed);
  kRef.current = k; speedRef.current = speed;
  useEffect(() => {
    let dead = false, mounted: { dispose(): void } | null = null;
    import("./three").then((m) => {
      if (dead || !host.current) return;
      try {
        const only = c.model.view === "3d-only";
        const x = m.mount3d(host.current, c, host.current.clientWidth || 800, { still: reduced() && only, speed: () => speedRef.current });
        mounted = x; h.current = x;
        if (apiRef) apiRef.current = { zoom: (f) => x.stage.zoom(f), fit: () => x.stage.fit(), pan: (dx, dy) => x.stage.pan(dx, dy), back: () => x.stage.back() };
        x.jump(kRef.current);
      } catch { onFail(); }
      setWait(false);
    }).catch(() => { if (!dead) { onFail(); setWait(false); } });
    return () => { dead = true; mounted?.dispose(); h.current = null; if (apiRef) apiRef.current = null; };
  }, [c]);
  useEffect(() => { h.current?.step(k); }, [k]);
  return (
    <div ref={host} className="scn3 eng-3d" role="img" aria-label={c.model.title || undefined} data-engine-3d="" style={{ position: "relative", width: "100%", height: "min(70vh, 620px)", minHeight: 320, background: "var(--surface-2)", borderRadius: 6 }}>
      {wait && <div className="scn3-loading">{loading ?? ""}</div>}
    </div>
  );
}
