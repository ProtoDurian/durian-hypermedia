# What SPEC.md must say about `sheet`, `wrap` and `track` (for the integrator to fold in)

1. **Three layouts, one family.** `sheet` is the worksheet, `wrap` the boxes inside boxes with fields (today's `nest:`),
   `track` the phase strip. Their words are unchanged from format 11 (sheet: `sheet:`, `labels:`, `spacing:`, rows and
   groups, `=>` outcome, step words `mark keep-mark dim fill value sum pass tile strip total aside hide light`;
   wrap: `nest:` and `show light fields set unwrap hide title`; track: `track:`, `carry:`, `where:`, `form:`, `place:`, step word
   `at`). They are the layout's own words, so a format 11 file reads as before; a word that is not the block's own goes on to
   the next owner (`at` is the track's and the timeline's).
2. **A scene or a container.** A scene whose first block is one of these is laid out by it; a container thing flagged
   `[sheet]`, `[wrap]` or `[track]` is laid out by it inside another layout (a tree inside a lane works the same way).
   Format 12 writes the parts as things: wrap = the container's children, outside first (`role id: title | size | field; field`);
   track = one child per phase (a run of one role is one group; `carry=`, `where=`, `form=`, `place=` are keys); sheet = child
   containers are groups holding rows (`values`), a child flagged `outcome` is the outcome column, `labels=` / `spacing=` are keys.
3. **Still rule.** Every box keeps one place for the whole story; blocks say in which steps each part shows. Members of the
   scene laid out by other layouts (a time axis, panels) sit under the blocks; members that are never on screen together share
   one place, as tall as the tallest.
4. **Notes are not the layout's.** `note:`, `= formula` and the caption are drawn by the renderer. On a phone the worksheet's
   outcome column sits right under the groups (it no longer drops below the step note).
5. **Checks.** Every refusal of the old blocks (a row that does not read, a cell number out of range, an unknown wrapper or
   phase) is reported once, with its line, by the layout's `step` hook; nothing is dropped silently.
