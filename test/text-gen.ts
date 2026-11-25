// Ordinary text of a given size, for the doubling test (test/linear.test.ts) and the benchmark (scripts/bench.ts).
// Typical replies (prose, lists, tables, code, tabs), one construct grown in place, and one of each part grown.
// Every section differs a little, as real text does.

export const piece = {
  prose: (i: number) => `The worker in step ${i} reads the queue, **checks the lease** and writes to \`store-${i}\`. If the write fails it retries with a delay, and after three tries it hands the job to [the review queue](https://example.com/q/${i}). Nothing is lost, because the *offset* moves only after the commit.\n\n`,
  list: (i: number) => `- Start the service with \`task run\` (${i})\n- Wait for the health check\n  - it needs the database\n- Read the log if it fails\n\n`,
  table: (i: number) => `| Service | p50 | p99 | Notes |\n| --- | ---: | ---: | --- |\n| api-${i} | 12 ms | 80 ms | fine |\n| worker-${i} | 40 ms | 310 ms | **slow** |\n| cache-${i} | 1 ms | 4 ms | fine |\n\n`,
  code: (i: number) => "```ts\nexport async function handle" + i + "(job: Job) {\n  const lease = await store.lease(job.id);\n  if (!lease) return null;\n  return store.write(job.id, lease);\n}\n```\n\n",
  tabs: (i: number) => `:::tabs\n#### Node\nInstall with \`npm i sdk-${i}\`.\n#### Python\nInstall with \`pip install sdk-${i}\`.\n:::\n\n`,
  heading: (i: number) => `## Step ${i}: move the jobs\n\n`,
  sameHeading: () => `## Summary\n\n`,
  quote: (i: number) => `> Note ${i}: this holds only for one region.\n> The second region follows later.\n\n`,
  inline: (i: number) => `Use \`a${i}\`, **b${i}**, *c${i}* and [d${i}](https://example.com/${i}) together.\n\n`,
  bareLinks: (i: number) => `See https://example.com/run/${i} and www.example.org/page/${i} for more.\n\n`,
};
export type Piece = keyof typeof piece;

/** Pieces of one kind, repeated up to (not over) the size. */
export function only(name: Piece, bytes: number): string {
  let s = "", i = 0;
  for (;;) { const p = piece[name](i++); if (s && s.length + p.length > bytes) return s; s += p; }
}
/** A typical reply: heading, prose, a list, a table, code, tabs, in turn. */
export function mixed(bytes: number): string {
  const order = ["heading", "prose", "list", "prose", "table", "code", "prose", "tabs"] as const;
  let s = "", i = 0;
  for (;;) {
    for (const k of order) {
      const p = piece[k](i);
      if (s.length + p.length > bytes) { while (s.length + 60 < bytes) s += "And one more short line of ordinary text to finish.\n\n"; return s; }
      s += p;
    }
    i++;
  }
}
const rows = (bytes: number, unit: number, f: (i: number) => string) => Array.from({ length: Math.max(1, Math.ceil(bytes / unit)) }, (_, i) => f(i)).join("");

/** One construct grown in place. */
export const grow: Record<string, (bytes: number) => string> = {
  longTable: (b) => "| a | b | c |\n| --- | --- | --- |\n" + rows(b, 34, (i) => `| row ${i} | value ${i} | fine |\n`),
  longList: (b) => rows(b, 34, (i) => `- item ${i}: check the lease again\n`),
  longPara: (b) => rows(b, 40, (i) => `word ${i} with **bold** and \`code\` here\n`),
  longLine: (b) => "plain words go on and on ".repeat(Math.ceil(b / 25)) + "\n",
  longCode: (b) => "```ts\n" + "const value = compute(1, 2, 3);\n".repeat(Math.ceil(b / 32)) + "```\n",
  manyTabs: (b) => ":::tabs\n" + rows(b, 48, (i) => `#### Tab ${i}\nThe body of tab number ${i} is here.\n`) + ":::\n",
};

const F = "```";
/** One part grown in place, within its own caps (LIMITS): the sizes the doubling test uses stay inside them. */
export const part: Record<string, (bytes: number) => string> = {
  terminal: (b) => `${F}terminal\n` + rows(b, 44, (i) => (i % 3 ? `output line ${i} of the build\n` : `$ make step-${i}\n`)) + `${F}\n`,
  fileTree: (b) => `${F}filetree\nrepo/\n` + rows(b, 36, (i) => `  file-${i}.ts  (new)  # part ${i}\n`) + `${F}\n`,
  fileTreeSteps: (b) => `${F}filetree\n` + rows(b, 64, (i) => `@step Step ${i}\nrepo/\n  a-${i}.ts  (new)\n  b.ts\n`) + `${F}\n`,
  editor: (b) => `${F}editor\n@file src/big.ts (open)\n` + rows(b, 36, (i) => `export const value${i} = ${i} * 2;\n`) + `@step Change the first line\n@@ src/big.ts\n-export const value0 = 0 * 2;\n+export const value0 = 1;\n${F}\n`,
  codewalk: (b) => `${F}codewalk\n@file src/walk.ts\n` + rows(b, 36, (i) => `export const value${i} = ${i} * 2;\n`) + `@step src/walk.ts focus=1\nThe first line.\n@step src/walk.ts focus=2\nThe second line.\n${F}\n`,
  chart: (b) => { const n = Math.max(2, Math.floor(b / 12)); return `${F}chart\nkind: line\ntitle: Runs\nx: { label: run, values: [${Array.from({ length: n }, (_, i) => i).join(", ")}] }\nseries:\n  - name: time\n    data: [${Array.from({ length: n }, (_, i) => (i * 7) % 101).join(", ")}]\n${F}\n`; },
  tierList: (b) => `${F}tierlist title="Tools"\n` + rows(b, 60, (i) => `${"SABCD"[i % 5]}: tool ${i} (fast), other ${i}, third ${i}\n`) + `${F}\n`,
  alignment: (b) => `${F}alignment title="Kinds"\nx: lawful .. neutral .. chaotic\ny: good .. neutral .. evil\n` + rows(b, 48, (i) => `${["lawful", "neutral", "chaotic"][i % 3]} / ${["good", "neutral", "evil"][(i >> 1) % 3]}: Hero ${i} (note)\n`) + `${F}\n`,
  animationSteps: (b) => `${F}animation\nbox api "API"\nqueue q "jobs"\napi -> q\n` + rows(b, 40, (i) => `@step Step ${i} sends a note.\nsay api: note ${i}\n`) + `${F}\n`,
  callouts: (b) => rows(b, 70, (i) => `> **Tip:** call number ${i} keeps the lease for a while.\n\n`),
  keysAndMouse: (b) => rows(b, 60, (i) => `Press :kbd[Ctrl+${i % 10}] then :mouse[click]{target="Save ${i}"}.\n\n`),
  manyParts: (b) => rows(b, 120, (i) => `${F}terminal\n$ run ${i}\nok\n${F}\n\n${F}filetree\nd${i}/\n  f.ts\n${F}\n\n`),
};

/**
 * Short pieces repeated: each makes a rule that reads ahead start again inside text it has already read (an autolink's
 * domain or the rest of its run, a page link's fragment). Each must still take one pass.
 */
export const repeated: Record<string, (bytes: number) => string> = {
  wwwAfterUnderscore: (b) => "_www.".repeat(Math.ceil(b / 5)),
  wwwSegments: (b) => "_www.a".repeat(Math.ceil(b / 6)),
  schemeAfterPunctuation: (b) => "url=https://x_.".repeat(Math.ceil(b / 15)),
  schemeRun: (b) => "=http://a_".repeat(Math.ceil(b / 10)),
  pageLinkFragments: (b) => "x.dh.md#](".repeat(Math.ceil(b / 10)),
  schemeRunTails: (b) => "(http://a_(http://a.b!!".repeat(Math.ceil(b / 23)),
};
