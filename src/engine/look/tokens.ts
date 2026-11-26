// Lane look: the two looks as token sets (DESIGN 2.4). `stage` is the default (the composed stage: thin borders, soft
// fills, Poppins metrics; src/ui/stage.css --stg-*); `classic` is today's graph-engine look (src/ui/parts.css --scn-*).
//
// A look is data, not code: every value is a CSS value made only of page tokens (--surface, --ink, --scn-edge ...) or a
// plain length / number. The renderer draws every layout from these `--lk-*` names and never from a look's name;
// `look/look.css` sets them under `.eng[data-look=stage]` and `.eng[data-look=classic]`, light and dark (look.css is
// written from this file: `bun src/engine/look/gen.ts`, and test/engine/look/ fails when the two drift).
import type { Look, Problem } from "../types";

/** the tokens both looks share: edges and words come from the page's measured palette (theme.css), so the contrast
    guarantees (3:1 edges, 4.5:1 words, SPEC 6.10) hold in both looks and both themes */
const SHARED: Record<string, string> = {
  // edges: a box, a container's frame, a layer band, a tone's border, an empty state shape
  "--lk-edge": "var(--scn-edge)",
  "--lk-edge-frame": "var(--scn-frame-edge)",
  "--lk-edge-band": "var(--scn-band-edge)",
  "--lk-edge-faint": "var(--scn-faint-edge)",
  "--lk-edge-good": "var(--scn-good-edge)",
  "--lk-edge-warn": "var(--scn-warn-edge)",
  "--lk-edge-bad": "var(--scn-hot-edge)",
  "--lk-edge-accent": "var(--scn-acc-edge)",
  "--lk-edge-off": "var(--scn-muted-edge)",
  // tints a tone puts inside a shape
  "--lk-tint-good": "var(--good-soft)",
  "--lk-tint-warn": "var(--warn-soft)",
  "--lk-tint-bad": "var(--bad-soft)",
  "--lk-tint-accent": "var(--acc-soft)",
  "--lk-tint-off": "var(--surface-3)",
  // words: a thing's words stay in ink whatever its role or tone (SPEC 6.10); small tags use the role's `-ink`
  "--lk-ink": "var(--ink)",
  "--lk-ink-2": "var(--ink-2)",
  "--lk-ink-muted": "var(--muted)",
  "--lk-ink-accent": "var(--acc-ink)",
  "--lk-ink-bad": "var(--bad-ink)",
  // the page hairline (frames that carry no state, guides, cell grids)
  "--lk-hairline": "var(--line)",
  "--lk-hairline-2": "var(--line-2)",
  // every word on the stage is at least this big (SPEC 6.10, the phone rule)
  "--lk-fs-min": "11px",
  "--lk-font": "var(--font-sans)",
  "--lk-font-mono": "var(--font-mono)",
  "--lk-fade": ".25s",
};

/** what differs between the looks (and what the stage reads) */
const STAGE: Record<string, string> = {
  // the canvas the scene is drawn on
  "--lk-canvas": "var(--surface)",
  "--lk-canvas-image": "none",
  "--lk-canvas-size": "auto",
  "--lk-canvas-radius": "14px",
  "--lk-canvas-edge": "var(--line)",
  // fills: soft tints, a neutral card on the neutral role's fill, a container on its plane
  "--lk-fill-neutral": "var(--c0-fill, var(--surface))",
  "--lk-fill-container": "var(--c0-plane, var(--surface-2))",
  "--lk-fill-band": "var(--surface-2)",
  "--lk-fill-faint": "var(--surface-2)",
  // lines and borders
  "--lk-box-w": "1.3px",
  "--lk-box-thick-w": "2.4px",
  "--lk-box-hot-w": "3.2px",
  "--lk-frame-w": "1.3px",
  "--lk-band-w": "1.3px",
  "--lk-line-w": "1.6px",
  "--lk-line-hot-w": "2.2px",
  "--lk-line-thin-w": "1.2px",
  "--lk-dash": "6 4",
  "--lk-box-dash": "4 4",
  "--lk-halo": "0 1px 5px rgba(15, 23, 42, .28)",
  // corners
  "--lk-radius": "8px",
  "--lk-radius-container": "10px",
  "--lk-radius-chip": "999px",
  // what is dimmed or switched off
  "--lk-dim": ".38",
  "--lk-line-quiet": ".92",
  // the type scale (Poppins metrics; core/stage-core.ts FONT) and the phone sizes (PHONE_FONT)
  "--lk-fs-title": "13.5px",
  "--lk-fs-body": "12.5px",
  "--lk-fs-sub": "12px",
  "--lk-fs-lane": "12.5px",
  "--lk-fs-chip": "11.5px",
  "--lk-fs-big": "21px",
  "--lk-fs-mono": "12px",
  "--lk-fs-small-b": "11.5px",
  "--lk-fs-phone-title": "12.5px",
  "--lk-fs-phone-body": "11.5px",
  "--lk-fs-phone-sub": "11px",
  "--lk-fs-phone-chip": "11px",
  "--lk-fw-title": "500",
  "--lk-fw-lane": "500",
  "--lk-fw-chip": "500",
  "--lk-fw-big": "600",
};

const CLASSIC: Record<string, string> = {
  "--lk-canvas": "var(--surface-2)",
  "--lk-canvas-image": "radial-gradient(circle, color-mix(in srgb, var(--line-2) 45%, transparent) 1px, transparent 1.2px)",
  "--lk-canvas-size": "22px 22px",
  "--lk-canvas-radius": "0px",
  "--lk-canvas-edge": "var(--line)",
  "--lk-fill-neutral": "var(--surface)",
  "--lk-fill-container": "color-mix(in srgb, var(--surface) 82%, var(--surface-2))",
  "--lk-fill-band": "var(--surface-2)",
  "--lk-fill-faint": "var(--surface-3)",
  "--lk-box-w": "1.25px",
  "--lk-box-thick-w": "2.4px",
  "--lk-box-hot-w": "2.4px",
  "--lk-frame-w": "1px",
  "--lk-band-w": "1px",
  "--lk-line-w": "1.6px",
  "--lk-line-hot-w": "2.2px",
  "--lk-line-thin-w": "1.2px",
  "--lk-dash": "6 5",
  "--lk-box-dash": "5 4",
  "--lk-halo": "none",
  "--lk-radius": "8px",
  "--lk-radius-container": "12px",
  "--lk-radius-chip": "999px",
  "--lk-dim": ".42",
  "--lk-line-quiet": "1",
  "--lk-fs-title": "13px",
  "--lk-fs-body": "13px",
  "--lk-fs-sub": "12px",
  "--lk-fs-lane": "12px",
  "--lk-fs-chip": "11px",
  "--lk-fs-big": "21px",
  "--lk-fs-mono": "11px",
  "--lk-fs-small-b": "11px",
  "--lk-fs-phone-title": "12.5px",
  "--lk-fs-phone-body": "12px",
  "--lk-fs-phone-sub": "11px",
  "--lk-fs-phone-chip": "11px",
  "--lk-fw-title": "500",
  "--lk-fw-lane": "600",
  "--lk-fw-chip": "600",
  "--lk-fw-big": "600",
};

/** the dark theme's differences, per look (a token not listed keeps its light value; the page's own tokens change
    by themselves in dark, so only what is a plain number or shadow is listed) */
export const LOOKS_DARK: Record<Look, Record<string, string>> = {
  stage: { "--lk-dim": ".45", "--lk-halo": "0 1px 5px rgba(0, 0, 0, .6)" },
  classic: { "--lk-dim": ".42" },
};

/** token name -> CSS value, per look, light theme. Both looks hold exactly the same names. */
export const LOOKS: Record<Look, Record<string, string>> = {
  stage: { ...SHARED, ...STAGE },
  classic: { ...SHARED, ...CLASSIC },
};

export const LOOK_NAMES: readonly Look[] = ["stage", "classic"];
export const DEFAULT_LOOK: Look = "stage";

// ------------------------------------------------------------------ choosing the look (called by the parse lane)
const asWord = (v: unknown): string | null => (typeof v === "string" ? v.trim().toLowerCase() : typeof v === "number" || typeof v === "boolean" ? String(v) : null);

/** the word a page or a fence asked for, and where (null when neither says anything) */
function asked(frontMatter: unknown, fence: unknown): { word: string; from: "fence" | "front matter" } | null {
  const f = fence && typeof fence === "object" ? asWord((fence as Record<string, unknown>).look) : null;
  if (f !== null && f !== "") return { word: f, from: "fence" };       // the fence's `look=classic` wins over the page
  const p = frontMatter && typeof frontMatter === "object" ? asWord((frontMatter as Record<string, unknown>).look) : null;
  if (p !== null && p !== "") return { word: p, from: "front matter" };
  return null;
}

/** The look of one animation block: the fence's `look=classic` wins, then the page's front matter `look: classic`,
    else the default (`stage`). An unknown word is ignored here (checkLook says so); never throws. */
export function lookOf(frontMatter?: Record<string, unknown> | null, fence?: Record<string, string> | null): Look {
  const a = asked(frontMatter, fence);
  return a && (LOOK_NAMES as readonly string[]).includes(a.word) ? (a.word as Look) : DEFAULT_LOOK;
}

/** the refusal for an unknown look word, with the list; null when the look is fine or not asked for */
export function checkLook(frontMatter: Record<string, unknown> | null | undefined, fence: Record<string, string> | null | undefined, line: number): Problem | null {
  const a = asked(frontMatter, fence);
  if (!a || (LOOK_NAMES as readonly string[]).includes(a.word)) return null;
  return { line, msg: `look: "${a.word}" (${a.from}) is not a look; use ${LOOK_NAMES.join(" or ")}. Drawn as ${DEFAULT_LOOK}.` };
}
