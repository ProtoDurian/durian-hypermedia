// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The author's camera words (format version 9): what a `camera` line may say besides the things it frames.
//
//   camera <id> [<id> ...] [close | far] [turn=front|left|right|back] [tilt=low|mid|high|top]
//   camera all [far] [turn=...] [tilt=...]
//
// - close: fly in until the things fill the stage (drawn up to CLOSE_SCALE times natural size, a tight margin);
// - far: pull back, so the things sit smaller with room around them;
// - turn= and tilt=: the 3D camera's angle around the scene and above it, as named choices; the 2D stage has no
//   angle and ignores them (the LLM view stays the captions);
// - a camera line sets the whole camera: a word it leaves out goes back to its default (`camera all` is the plain
//   story camera again). It lasts until the next camera line; `focus` keeps the angle.
// The engine clamps what would break: the 3D camera never goes below the top plane (a low tilt stops above it) and
// never inside a block (a close camera stops outside the thing).
export const TURNS = ["front", "left", "right", "back"] as const;
export const TILTS = ["low", "mid", "high", "top"] as const;
export type Turn = (typeof TURNS)[number];
export type Tilt = (typeof TILTS)[number];
export interface CamView { close: boolean; far: boolean; turn: Turn | null; tilt: Tilt | null }
export const CAM_DEFAULT: CamView = { close: false, far: false, turn: null, tilt: null };

// the angles, in radians: turn is the camera's place around the scene (0: in front, looking straight in), tilt its
// height above the ground (0: level, pi/2: straight down)
export const TURN_RAD: Record<Turn, number> = { front: -0.12, left: -0.95, right: 0.95, back: Math.PI - 0.12 };
export const TILT_RAD: Record<Tilt, number> = { low: 0.3, mid: 0.62, high: 0.98, top: 1.42 };
// close: the story camera may draw up to this many times natural size (the plain camera stops at 1.5)
export const CLOSE_SCALE = 2.6;
// far: the framed area grows by this much (each side), so the things sit smaller
export const FAR_GROW = 0.45;

const FORM = "camera <id> [close | far] [turn=front|left|right|back] [tilt=low|mid|high|top], or camera all";
// words: the plain words after "camera"; kv: its key=value pairs. Throws a message that names the fix
export function parseCamera(words: string[], kv: Record<string, string>): { ids: string[] | null; view: CamView } {
  const view: CamView = { ...CAM_DEFAULT };
  for (const [k, v] of Object.entries(kv)) {
    if (k === "turn") { if (!(TURNS as readonly string[]).includes(v)) throw new Error(`turn=${v}: turn is ${TURNS.join(", ")}`); view.turn = v as Turn; }
    else if (k === "tilt") { if (!(TILTS as readonly string[]).includes(v)) throw new Error(`tilt=${v}: tilt is ${TILTS.join(", ")}`); view.tilt = v as Tilt; }
    else if (k === "zoom" || k === "dist" || k === "distance") throw new Error(`camera: write close or far as a word (camera db close), not ${k}=`);
    else throw new Error(`camera takes turn= and tilt= only, not ${k}= (${FORM})`);
  }
  const ids: string[] = [];
  for (const w of words) {
    if (w === "close") view.close = true;
    else if (w === "far") view.far = true;
    else if (w === "near" || w === "in" || w === "zoom") throw new Error(`camera: "${w}" is not a camera word; write close to fly in (camera db close) or far to pull back`);
    else ids.push(w);
  }
  if (view.close && view.far) throw new Error("camera: close or far, not both");
  if (ids.includes("all") && ids.length > 1) throw new Error(`camera all frames everything; name things or write all, not both`);
  const all = !ids.length || (ids.length === 1 && ids[0] === "all");
  if (!ids.length && !view.far && !view.turn && !view.tilt && !view.close) throw new Error(`camera needs ids, or all: camera db, camera all (${FORM})`);
  if (all && view.close) throw new Error("close needs a thing to fly into: camera db close (camera all shows everything)");
  return { ids: all ? null : ids, view };
}
// the LLM view and tests: the camera words back as text ("close turn=right")
export function camWords(v: CamView | null | undefined): string {
  if (!v) return "";
  return [v.close && "close", v.far && "far", v.turn && `turn=${v.turn}`, v.tilt && `tilt=${v.tilt}`].filter(Boolean).join(" ");
}
