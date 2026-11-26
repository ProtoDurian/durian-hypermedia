// Lane core2: the words of formats 10 and 11 that format 12 does not have, each with its new spelling (DESIGN section 4:
// "a gone word is refused with the new spelling, never silently ignored"). A word that a layout this scene uses owns
// is not gone (a timeline still reads `tag row`, the wrap its `set box: a => b`); the table is read only when no used
// layout owns the word.
const GONE: Record<string, string> = {
  add: `declare the thing in the setup ("role id: title") and write "show id" in the step`,
  remove: `write "hide id"`,
  move: `write "id at place" (a token goes to a thing) or "id in container" (a thing joins a container)`,
  swap: `write the values after the swap: "id = v1 v2 v3" (the engine works out the motion)`,
  push: `write the values after the push: "id = v1 v2 v3"`,
  pop: `write the values after the pop: "id = v1 v2", then "drop" or "hide" for the item that left`,
  send: `write "a -> b: words"`,
  join: `write "merge a b into c"`,
  highlight: `write "light ids" (one step) or "tone ids good|bad|warn|accent" (it lasts)`,
  spotlight: `write "light ids"`,
  tag: `write "ids is words" (it replaces the chip; "ids is -" clears it)`,
  state: `write "ids is words"`,
  hush: `a fact lasts until it is changed: write "hide ids", "ids is -" or "tone ids off"`,
  keep: `a fact lasts until it is changed: write "tone ids x", "ids is words" or "dim ids"`,
  off: `a fact lasts until it is changed: write "hide ids" or "tone ids off"`,
  fill: `write "tone ids good|bad|warn|accent" or "text id: line"`,
  dashed: `a look is a flag of the thing: "role id [dashed]: title"`,
  cross: `a lost send is "a -x b: words"; a crossed-out look is not a word of a step`,
  mark: `write "ids is words" for a chip, or "tone ids x" for a colour`,
  inside: `put the thing in a container: "id in container", then "zoom into container"`,
  peak: `a chart is a thing: write "id = values" (the chart reads its own peak)`,
  limit: `a chart is a thing: write "id = values" (a limit is a line of the chart)`,
  bars: `a chart is a thing: declare it with "[chart bar]" and write "id = values"`,
  units: `a chart is a thing: declare it with "[chart units]" and write "id = values"`,
  counts: `a chart is a thing: write "id = values"`,
  calc: `a chart is a thing: write "id = values"`,
  chips: `a chip is a thing of the card: write "ids is words"`,
  grid: `write "layout: grid" on the region, and put the cells in it`,
  rows: `write "layout: grid" on the region, and put the cells in it`,
  map: `a map is a thing: "role id [map]: key: value, key: value"`,
  list: `a list is a thing: "role id [list]: v1 v2 v3"`,
  cells: `write "layout: grid" on the region, and put the cells in it`,
  card: `a card is a thing: "role id: title | line"; write "text id: line" to change its lines`,
};

/** the new spelling of a word format 12 does not have, or null when the word was never an old word */
export function goneHint(word: string): string | null {
  return Object.prototype.hasOwnProperty.call(GONE, word) ? GONE[word] : null;
}

/** every gone word, for the tests and for the parser's nearest-word hint */
export const GONE_WORDS: readonly string[] = Object.keys(GONE);

/** the refusal text for a word that is gone: names the word and the new spelling */
export function goneMessage(word: string): string | null {
  const h = goneHint(word);
  return h ? `"${word}" is not a word of a step in format 12; ${h}` : null;
}
