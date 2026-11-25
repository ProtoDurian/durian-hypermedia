// Custom properties for a part's style attribute, written by React (the style prop: on the server an attribute, in the
// browser the CSSOM; never an HTML string, so strict Trusted Types holds). A value the server knows (a whole scene's
// heights, a stage's print height) is then in the page before any script runs: nothing moves on load.
import type React from "react";

/** { "--wh": "120px", ar: 1.5 } -> React's style object; names get "--" when they lack it; empty values are left out */
export const cssVars = (vars: Record<string, string | number | null | undefined>): React.CSSProperties =>
  Object.fromEntries(Object.entries(vars).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k.startsWith("--") ? k : `--${k}`, String(v)])) as React.CSSProperties;
