#### Diff

A ```` ```diff ```` fence holding a unified diff (what `git diff` prints).

````
```diff view=split title="Bind every interface"
diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,5 +10,5 @@ export function start() {
   const port = 8080;
-  const host = "localhost";
+  const host = "0.0.0.0";
   listen(host, port);
```
````

- File headers, line numbers on both sides, the changed words marked inside a changed line (jsdiff, at parse time), unchanged runs of more than 10 lines folded to 3 at each end (a tap opens them), a gap between hunks shown as "... N lines". Unified on a narrow part, split on a wide one (by the part's own width, 760 px); two buttons switch it, and `view=split|unified` fixes it. A diff with several files has one header each (+added, -removed, a rename) that folds.
- **Phone:** a line does not wrap (a wrapped line would lose its sign and its number). The body scrolls sideways inside its own box; the two line numbers and the sign stay in view at the left, and the hunk head and the fold button stay one box wide at the left.
- **Static:** `static` on the fence draws every file open, with no button; a folded run stays a plain "... N lines" row.
- **A body with no `@@` hunk** stays a plain code block (a warning). Hand-written counts in `@@` that are wrong still read.
- **LLM view:** as written. **Keys:** `title=`, `view=`, `static`.
- **Caps:** `diffLines` (4000; 2000 in UNTRUSTED_LIMITS) lines and `diffFiles` (40; 20) files; word marks only run on a changed line of at most `diffWordLine` (1200; 600) characters and `diffWordTokens` (300; 150) words, with a hard `diffEditLength` (60; 40) edit limit, so two long one-line files cost a count, not a hang. Library: `diff` (jsdiff) 9.0.0.
- **doccheck refuses:** an unknown key, `view=` other than split or unified, a line inside a hunk that does not start with `+`, `-` or a space, more lines or files than the caps, and a block over the page's work budget.
