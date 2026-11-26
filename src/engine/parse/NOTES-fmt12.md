# fmt12: what SPEC.md and CHANGELOG.md must say (for the integrator)

Lane fmt12: a migrated block tells the same story as the old one, on the page.

- **SPEC (format 12 words):** a setup line `role name cN: words` names a role of one block (its colour there, and its
  words in the colour key above the stage). It goes before the first thing and wins over a page role of the same name
  inside its block. Without words it only colours.
- **SPEC (steps):** in `@step Title: caption`, `\:` is a colon of the caption, not the end of the title.
- **SPEC (tree layout):** in a binary tree (a node has `[left]` or `[right]`), a child with no side takes the side its
  siblings leave free, left first: write `[right]` only on a right child.
- **SPEC (a chart in an animation):** a chart thing placed by the graph layout is as wide as the stage and as tall as its
  drawing (a dot plot, units, spans), or a chart's usual height (bar, line, pie ...), never a card's size.
- **SPEC (stage bars):** an axis number and a unit that is a word have a space between them ("1500 dollars"); a short
  unit (3 letters or fewer: "k", "%") joins the number, as on every other chart axis.
- **CHANGELOG (Unreleased, Fixed):** `dh migrate` keeps a graph scene's colour key (its families become roles of the block,
  with their words) and every step's whole caption; a binary tree written with `[right]` only puts the other child on the
  left; a chart in a graph scene fits the stage; axis units that are words get a space.
- **SPEC (fence words):** `look=stage|classic` on any animation fence now reaches the engine (the page dropped it, so every
  block drew in its origin's default look: a graph-engine block always classic, a format 12 block always stage).
- **CHANGELOG (Fixed):** `dh migrate` keeps the label of a line an old graph step drew (`a -> b "label"` in a step): it is
  written in the setup with its label, hidden there, and shown by its step; a format 12 scene in layers or in 3D gets the
  layout its old form had (the graph engine's measured sizes for what its layers hold).
- **SPEC (steps, the player):** an author's step title is never dropped: the caption leads with it in bold ("**Title.**
  caption"; no extra full stop after a title that ends in . ! ? : ; or …), and the step control names each step by its
  title (the slider's value text and tooltip; Back and Next name the step they go to). The LLM view keeps "Title: caption".
- **SPEC (colour key):** a key entry shows its role as its boxes look (the soft fill, a 2 px edge) and as its lines look (a
  short stroke in the role's line colour), in the key above an engine stage and in a composed stage's own key. In light,
  the yellow role's lines are a dark amber-grey (the measured palette keeps them apart from green for colour-blind
  readers), so a key of the fill alone read yellow beside lines that are not.
- **CHANGELOG (Fixed):** in a graph scene, a member drawn larger than the old scene's box (a data structure sized by its
  cells) pushes the members after it in its row, or below it in its column, by what it grew, and its group grows to hold
  them: the cards no longer cover each other or spill past their group's frame, and lines end at the drawn boxes.
