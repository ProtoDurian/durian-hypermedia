// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// WebGL on a page with many 3D stages (format version 10, fix). A browser keeps a few WebGL contexts live at once (16
// in Chrome) and, past that, takes the oldest one away: its stage goes blank, with only its words left floating. Every
// animation used to ask "is there WebGL?" by making a throwaway context, and each 3D stage asked again, so a page of
// 27 animations made about 45 contexts as it came alive; the oldest lost was often the stage the reader had just
// jumped to (it comes alive first). Now the question is asked once per page and its context is given back at once,
// and a 3D stage far off screen gives its context back too, and takes it again when the reader comes near
// (site/src/anim3d.ts).

let known: boolean | null = null;

// is there WebGL here? Asked once per page; the test context is released straight away
export function hasWebGL(): boolean {
  if (known != null) return known;
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    const g = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    known = !!g;
    g?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch { known = false; }
  return known;
}

// how near the screen a 3D stage holds its context: within one screen height above or below
export const NEAR_MARGIN = "100% 0px 100% 0px";
// how long a stage on screen waits for a lost context to come back before it asks for it again (ms)
export const RESTORE_AFTER = 800;
