// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// The composed stage (format version 11, 0.7.0): the shared parts every stage block uses.
// A block parses its own lines, lays itself out in a box of a given width and returns drawing items in that box's
// coordinates; the stage (tools/stage.ts) stacks the boxes and draws connectors after layout. Items carry numbers and
// token names only: the renderer (site/src/stage.tsx) turns them into SVG with page tokens. Pure: no DOM, no node modules.
// See SPEC.md for the interface a block builder writes to.
import { textW } from "./scene";
import { chipW } from "./chipw";
import { docBudget } from "./stage-budget";

// ---------------------------------------------------------------- source lines
export type Line = { n: number; ind: number; t: string };
export class StageError extends Error { constructor(public line: number, msg: string) { super(msg); } }
export type Problem = { line: number; msg: string };

// ---------------------------------------------------------------- drawing items (what the renderer draws)
/** Paint: a role's colour ("role:<name>" with a part: line, soft, plane, ink), a tone ("good", "bad", "warn", "acc", "muted")
 * with a part, or a stage colour: "surface", "surface-2", "line", "line-2", "ink", "ink-2", "muted", "none". */
export type Paint = string;
export type Font = "title" | "body" | "sub" | "lane" | "chip" | "big" | "mono" | "small-b";
export const FONT: Record<Font, { size: number; weight: number; mono?: boolean }> = {
  title: { size: 13.5, weight: 500 }, body: { size: 12.5, weight: 400 }, sub: { size: 12, weight: 400 }, lane: { size: 12.5, weight: 500 }, // the defaults of the stage.css tokens --stg-fs-<font>, --stg-title-weight
  chip: { size: 11.5, weight: 500 }, big: { size: 21, weight: 600 }, mono: { size: 12, weight: 400, mono: true }, "small-b": { size: 11.5, weight: 600 },
};
export const LINE_H: Record<Font, number> = { title: 18, body: 17, sub: 16, lane: 17, chip: 15, big: 28, mono: 16, "small-b": 15 };
/** When an item shows: from step `from` to step `to` (1-based, inclusive; to 0 = to the end), emphasised in `hot` steps. */
/** When an item shows, and (bar) the measurement hooks it carries: written as data-bar-<key> attributes (kind, id, label, role, edge, from, to, edge-label, column, axis, min, max, value). */
export type When = { from?: number; to?: number; on?: number[]; hot?: number[]; dim?: number[]; bar?: Record<string, string | number | undefined> };
export type Item = When & ({ k: "box"; x: number; y: number; w: number; h: number; fill: Paint; stroke: Paint; r?: number; dash?: boolean; thick?: boolean; cls?: string; id?: string; role?: string }
  | { k: "text"; x: number; y: number; s: string; f: Font; ink: Paint; anchor?: "start" | "middle" | "end"; tip?: string; strike?: boolean; rotate?: 90; breaks?: number[]; pitch?: number; halo?: boolean; size?: number }
  | { k: "path"; pts: [number, number][]; curve?: "h" | "v" | "round" | "line"; ink: Paint; dash?: boolean; arrow?: boolean; w?: number; flow?: boolean; id?: string; dot?: boolean; head?: number; cls?: string }
  | { k: "badge"; x: number; y: number; s: string; role: string }
  | { k: "tri"; x: number; y: number; ink: Paint });

// ---------------------------------------------------------------- measuring and wrapping words
const MONO_W = 0.6;
// stopgap (23 Nov): a phone stage's type sizes, never under 11 px, used only inside a narrow
// layout; the paint reads the same values from stage.css (--stg-phone-<font>, on a plan drawn with class stg-phone),
// each meant to become the review's theme token of that name
export const PHONE_FONT: Partial<Record<Font, number>> = { title: 12.5, body: 11.5, sub: 11, chip: 11 };
let phoneFont = false;
export const setPhoneFont = (on: boolean) => { phoneFont = on; };
/** the drawn width of plain (regular) type: the measure corrected per character, fitted to browser widths at phone sizes
 * (digits draw 2.4 px wider at 11 px; "_" 3.5; "=" 5.5; letters 0.15 narrower) */
export function drawnW(s: string, f: Font): number {
  const F = FONT[f]; if (F.mono || F.weight >= 500) return measure(s, f);
  let x = 0;
  for (const ch of s) x += ch >= "0" && ch <= "9" ? 2.4 : ch === "_" ? 3.5 : ch === "=" ? 5.5 : (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") ? -0.15 : 0;
  return measure(s, f) + (x * fontSize(f)) / 11;
}
/** inside a phone layout: a line that is one unbroken token (an id, a name with digits) breaks again only when its drawn
 * width would cross the box's border (`slack`: the room right of the text, less 2 px); a line of words, or a token that
 * stays inside the border, keeps its place, so nothing grows where it already fits */
export function wrapRoom(s: string, w: number, f: Font, max = 4, slack = 0): string[] {
  const ls = wrap(s, w, f, max);
  // p11 (rc.3 review MUST 4: the layers story's routing table T3 at 1280): off a phone, where a line's drawn width (digits
  // draw wider than the table says) would cross the border, the text breaks again by drawn width; else it keeps its lines
  // a break by drawn width never cuts words the plain break kept: it takes the lines it needs instead (the layers
  // story's 'The server unwraps' at 1280: a 2-line card lost ':443')
  const cut = (x: string[]) => !!x.at(-1)?.endsWith("…");
  if (!phoneFont) { const d = ls.some((l) => Math.max(drawnW(l, f), poppinsW(l, f)) > w + slack) ? wrap(s, w, f, max, true) : ls; return cut(d) && !cut(ls) ? wrap(s, w, f, Infinity, true) : d; }
  return ls.flatMap((l) => {
    if (l.includes(" ") || drawnW(l, f) <= w + slack) return [l];
    const out: string[] = []; let cur = "";
    let cw = 0; // linear: each character's drawn width added once
    for (const ch of l) { const d = drawnW(ch, f); if (cur && cw + d > w + slack) { out.push(cur); cur = ""; cw = 0; } cur += ch; cw += d; }
    return cur ? [...out, cur] : out;
  });
}
/** a font's size in the layout being made: the phone size inside a narrow layout, else the stage's own */
export const fontSize = (f: Font): number => (phoneFont ? PHONE_FONT[f] : undefined) ?? FONT[f].size;
// The stage font's widths, as a browser draws them (rc.4 refit: the old estimate read regular lines up to a fifth short and
// semibold ones up to a tenth long, so a card line could run past its border: the layers story's copper card at 1280).
// Measured in
// Chrome on the self-hosted Poppins, one entry per printable ASCII character (32 to 126), then per character of
// POPPINS_MORE (Latin-1 and the arrows, dashes, quotes and signs stages use; those past Latin-1 are drawn by the page's
// fallback fonts and were measured as drawn):
//  - POPPINS_EM: the font's own advance in thousandths of an em per weight, as a screen without hinting lays it out;
//  - POPPINS_PX: the whole-pixel advance a screen with hinting draws at each stage size ("weight@size", one character
//    per advance: its code less 48), which is not the rounded em width (hinting moves some by a pixel either way).
// poppinsW is the larger of the two sums, so it fits on both; a size with no row takes the em sum and a twentieth; any
// other character (other scripts) keeps the general estimate. Where it is used: a line that would reach its box's border
// by its drawn width breaks again (wrapRoom); measure() keeps the estimate for sizes and layout choices, since a refit
// there changes most layouts (stacking some at 766): 0.7.x.
const POPPINS_MORE = " ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿΣ–—‘’“”•…′″←↑→↓↔−≈≠≤≥∞⌈⌉⊕▲▼✓✗";
const POPPINS_AT = new Map([...POPPINS_MORE].map((ch, i) => [ch, 95 + i]));
const POPPINS_EM: Record<number, number[]> = {
  300: [274, 277, 264, 812, 597, 726, 719, 147, 420, 420, 469, 655, 173, 519, 182, 441, 616, 292, 572, 585, 613, 617, 629, 533, 624, 625, 185, 227, 504, 676, 492, 512, 1002, 652, 597, 771, 706, 503, 493, 782, 679, 229, 499, 568, 421, 842, 686, 788, 564, 789, 587, 572, 520, 661, 659, 955, 585, 564, 525, 367, 603, 367, 606, 674, 260, 675, 675, 613, 675, 622, 325, 675, 633, 229, 234, 480, 229, 1022, 633, 642, 675, 675, 362, 510, 356, 633, 547, 815, 460, 545, 441, 413, 261, 413, 487, 274, 277, 642, 596, 526, 585, 261, 572, 315, 796, 445, 435, 651, 0, 502, 387, 394, 657, 322, 323, 253, 638, 564, 600, 265, 183, 429, 435, 602, 650, 680, 502, 652, 652, 652, 652, 652, 652, 882, 771, 503, 503, 503, 503, 229, 229, 229, 229, 730, 686, 788, 788, 788, 788, 788, 591, 788, 661, 661, 661, 661, 564, 564, 665, 675, 675, 675, 675, 675, 675, 1108, 613, 622, 622, 622, 622, 229, 229, 229, 229, 640, 633, 642, 642, 642, 642, 642, 637, 642, 633, 633, 633, 633, 545, 675, 545, 632, 649, 849, 197, 197, 342, 342, 366, 528, 227, 374, 838, 838, 838, 838, 838, 519, 838, 838, 838, 838, 833, 390, 390, 838, 769, 769, 838, 838],
  500: [260, 321, 323, 872, 650, 794, 761, 172, 492, 492, 504, 714, 225, 585, 241, 514, 641, 350, 577, 594, 647, 639, 642, 560, 638, 635, 245, 304, 612, 774, 590, 538, 1025, 697, 630, 773, 709, 524, 515, 773, 705, 264, 564, 633, 444, 882, 721, 784, 595, 787, 632, 604, 564, 690, 694, 999, 660, 605, 558, 485, 717, 484, 654, 798, 254, 678, 678, 600, 678, 617, 332, 678, 649, 264, 264, 554, 264, 1039, 649, 638, 678, 678, 384, 534, 372, 649, 576, 825, 499, 582, 471, 516, 324, 516, 553, 260, 321, 690, 646, 548, 605, 324, 578, 312, 789, 456, 489, 649, 0, 517, 386, 427, 717, 340, 342, 241, 654, 630, 600, 279, 209, 444, 489, 682, 701, 742, 538, 697, 697, 697, 697, 697, 697, 921, 773, 524, 524, 524, 524, 264, 264, 264, 264, 720, 721, 784, 784, 784, 784, 784, 699, 784, 690, 690, 690, 690, 605, 595, 699, 678, 678, 678, 678, 678, 678, 1085, 600, 617, 617, 617, 617, 264, 264, 264, 264, 636, 649, 638, 638, 638, 638, 638, 679, 638, 649, 649, 649, 649, 582, 678, 582, 632, 708, 924, 242, 242, 422, 422, 462, 638, 227, 374, 838, 838, 838, 838, 838, 585, 838, 838, 838, 838, 833, 390, 390, 838, 769, 769, 838, 838],
  600: [238, 354, 364, 887, 654, 829, 778, 195, 485, 485, 518, 674, 254, 583, 260, 486, 646, 362, 574, 599, 661, 644, 640, 548, 643, 626, 263, 324, 584, 738, 567, 538, 1051, 716, 643, 768, 717, 532, 530, 768, 717, 278, 570, 663, 459, 899, 735, 785, 608, 787, 641, 609, 577, 697, 711, 1024, 686, 636, 576, 497, 756, 496, 680, 790, 271, 678, 678, 602, 678, 617, 345, 678, 661, 278, 278, 584, 278, 1048, 661, 638, 678, 678, 404, 545, 388, 661, 599, 844, 540, 605, 483, 508, 309, 508, 592, 238, 354, 663, 654, 561, 636, 350, 582, 338, 785, 462, 521, 681, 0, 516, 402, 444, 676, 360, 357, 250, 678, 666, 600, 295, 228, 450, 521, 730, 757, 811, 538, 716, 716, 716, 716, 716, 716, 937, 768, 532, 532, 532, 532, 278, 278, 278, 278, 726, 735, 785, 785, 785, 785, 785, 670, 785, 697, 697, 697, 697, 636, 608, 727, 678, 678, 678, 678, 678, 678, 1077, 602, 617, 617, 617, 617, 290, 290, 290, 290, 638, 661, 638, 638, 638, 638, 638, 648, 634, 661, 661, 661, 661, 605, 678, 605, 632, 702, 927, 275, 275, 477, 477, 480, 695, 227, 374, 838, 838, 838, 838, 838, 566, 838, 838, 838, 838, 833, 390, 390, 838, 769, 769, 838, 838],
};
const POPPINS_PX: Record<string, string> = {
  "300@11": "33297781555726258377678688236755<768866883565:886877587;677474774776764773363;7677474769566535533776735384570544734477742457885777776:8665633338888888788888768777777;666663333676666676777767677922445634999996999994498899",
  "300@11.5": "33297881555726258377788688236865<878866983575:886877688;777474784777764783363=86774748695665356337767364:4570744734487732457885777887:8666633338888888788888768777777<766663333686666676888877687:22445634:::::6:::::55:99::",
  "300@12": "332:8881556726258387888688236865<889966983675:897988788;777474784897874883363=889847487:6765356339767384;5570754834487732557895887889:9666633339899999798888779888888<777773333888888888888879788:22445634:::::6:::::55:99::",
  "300@12.5": "332:8892556926268487888788236867=88:966;93675;9;7;88788<777484884998994983363=899957487:6765356339767384;5590754944487832558896887889;;7776333399;;;;;7;8888779999999?899993333989999989888879788;22445735;;;;;6;;;;;55;::;;",
  "300@13.5": "435;8;93556927369488889799337977>98;:77;93686;9;7;88799=878585895999994993363=999957497;6775367439877384<669085595459884256899799:999<;77773343:9;;;;;8;9999779999999@999993343999999999999979799;33555835<<<<<7<<<<<55<;;<<",
  "300@21": "665A=??399:?4;49>6=<>==<=>44;?:;F><@?;:@>5:<9B?@<@<<<>>D<<;8=8=?6>>=>=8>>45:5E>=>>8;8>;A:;:958:66><;<5;6@99>0:99?776><=6499==>;==>>=>B@;;;:5564@?@@@@@<@>>>>;<>>>>>>>G<====5564=>=======>>>>;>:==A44777<58BBBBB;BBBBB88B@@BB",
  "500@11": "335;7:93656827367477877777337867<879866983675:8:7:77788;777686784887875873363;78884657695666366338767373:5580746854477743557896887888:96656333398:::::8:8888778888888=777773333878888888777778678:33555734999996999994498899",
  "500@11.5": "335;7:93666837368477978877337877<879966:83675:8:7:77888;877686884887885873363;78884767796766366338768375:5680766854478742568897887888;966553333:8:::::8:8888778888888=788873333878888888777778788;33555734:::::7:::::55:99::",
  "500@12": "345<7:93666837368477988878337877<88:966:83675:8:7:77888<8786968:4887885883363=888847687:6776477338868485:6680766844488743568997887898;:66563333:8:::::8:8888779888888>788883333888888888888878788;33555934:::::7:::::55:99::",
  "500@12.5": "345<8;93676837368477988888338;77=98:966;93785;9:8:88889<8786968:5998986983373=899957687:6777477339868485;66807768545888436689:799:999;:66674443:9:::::9:8888889999999>888884443989999989888879789;33555935;;;;;7;;;;;55;::;;",
  "500@13.5": "445=9;;3767938379599:89988348;88>98;:77;:4896<:;8;989:9=9887:79<5:99:86:93384>999:68698;7877477449979486<7790877955599853779:;899:9::<;77875544;:;;;;;9;::::88:::::::?988885544999999999999989899<33666935<<<<<8<<<<<55<;;<<",
  "500@21": "567B=A@4;;;?5=4;=7<=>>><=>55=A<<E?=@?;;A?6<>:C@A=A=<<??E>=<:?;>A6??=?=8?>56<6F>>??9;9=<A:<::7;<56>><=7<8A::=0;::?886>>=75::??@;??>?>>CA;;;;6666@@AAAAA?A????==???????G===<=6666>>>>>>>?>====<?<=?D5599:=58BBBBB<BBBBB88B@@BB",
  "600@11": "345;8:93566837358477877777336867<879866:83785:8:7:77888;877586784887885883373<88885768796766467348868475:6670766855488743668897887888:96666443398:::::7:8888779888888=788784434888888888888878778:33555834999996999994498899",
  "600@11.5": "345<8;:3566837368577978888347877<889966:83786:9:8:87888<877696894888875883373<888857687:6776467349878485:6680766855489743669997887888:966664434:9:::::8:8888789888888=777884434888888888888878788;33555934:::::7:::::55:99::",
  "600@12": "345<8;:3666837368578988888347977=98:977;94786;9:8:88899<888696895998986983374<889957687:6776467349878486;66807778555897436699;799:989<:66664444:9:::::8:9999889999999>888884444988888888888879889;33665934:::::7:::::55:99::",
  "600@12.5": "345<9;;3666837368588989888347977>98:977;94786<:;8;98899=988796995998986993374>999967697;7876467349979486;7780777855599843779:;899:989<:77674444::;;;;;8;9999889999999>888884444999999989999979889<33666935;;;;;7;;;;;55;::;;",
  "600@13.5": "346=9<;4667938479589:99999448988?:9;:78;:4897<:;8;999::>9887:79:5:99:86:94484>999:68698;7876478349989486<77:087795559985377::<899:::9<;77774444;:;;;;;9;::::88:::::::?988884444999999999999989899<44666:35<<<<<8<<<<<55<;;<<",
  "600@21": "578C>BA4::;?5<5:=8<<>>=<==56<?<<F?=@?;;A>5<>:B?A=A===>?F>=<;@;>@7>>=>=8>=55<5E=>>>8;9==B;=;;7;<57>>==7=9A:;>0;::?887??=75:;@@A<??>???D@;;;;7767@?AAAAA>A>>>>==?>>>>>>G<====7767>=>>>>>>>=====>==?D66:::=58BBBBB<BBBBB88B@@BB",
};
/** the weight a stage font is drawn at: regular text takes the page's light weight (300) */
const DRAW_WEIGHT: Record<Font, number> = { title: 500, body: 300, sub: 300, lane: 500, chip: 500, big: 600, "small-b": 600, mono: 400 };
/** the estimate (scene.ts / chipw.ts tables): measure() itself, and characters past the Poppins tables */
function estimateW(s: string, f: Font, size: number): number { return FONT[f].weight >= 500 ? chipW(s, size) : textW(s, size) * 0.95; }
export function measure(s: string, f: Font): number {
  const F = FONT[f], size = fontSize(f);
  if (F.mono) return [...s].length * size * MONO_W;
  return estimateW(s, f, size);
}
/** a line's width as a browser draws it in Poppins (POPPINS_* tables; never under the drawn width) */
export function poppinsW(s: string, f: Font): number {
  const F = FONT[f], size = fontSize(f);
  if (F.mono) return [...s].length * size * MONO_W;
  const t = poppinsRow(DRAW_WEIGHT[f], size);
  let x = 0, y = 0, other = 0;
  for (let i = 0; i < s.length; i++) {
    const k = s.charCodeAt(i) - 32;
    const c = k >= 0 && k < 95 ? k : POPPINS_AT.get(s[i]) ?? -1;
    if (c >= 0) { x += t.em[c]; y += t.px ? t.px[c] : 0; continue; }
    // a character past the tables keeps the estimate (a surrogate pair as one character)
    const n = k + 32 >= 0xd800 && k + 32 < 0xdc00 && i + 1 < s.length ? 2 : 1; other += estimateW(s.slice(i, i + n), f, size); i += n - 1;
  }
  return (t.px ? Math.max(x, y) : x * 1.05) + other;
}
// each weight and size's widths in px, made once
const ROWS = new Map<string, { em: Float64Array; px: Uint8Array | null }>();
function poppinsRow(wt: number, size: number) {
  const key = `${wt}@${size}`; let r = ROWS.get(key);
  if (!r) { const em = POPPINS_EM[wt], px = POPPINS_PX[key]; r = { em: Float64Array.from(em, (v) => (v * size) / 1000), px: px ? Uint8Array.from(px, (ch) => ch.charCodeAt(0) - 48) : null }; ROWS.set(key, r); }
  return r;
}
/** Wrap words into lines at most `w` wide; a word longer than a line breaks by characters. Linear in the text. */
/** on a phone a block's text takes more lines instead of a "…" (no fact is cut on a phone). The stage
 * sets it around a narrow layout; blocks whose height follows their line count ask `most(n)` for their line limit. */
let phoneLines = false;
export const setPhoneLines = (on: boolean) => { phoneLines = on; };
export const most = (n: number) => (phoneLines ? n + 8 : n);
// a long run of digits, hex and colons draws wider than the table says (MAC addresses ran to the card edge on a
// phone): a line holding one breaks as if it were 15% wider
const HEXRUN = /[0-9A-Fa-f]{2}[:.-][0-9A-Fa-f]{2}[:.-][0-9A-Fa-f]{2}/;
const fitW = (x: string, f: Font) => measure(x, f) * (phoneLines && HEXRUN.test(x) ? 1.15 : 1); // on a phone, where the cards are narrow
export function wrap(s: string, w: number, f: Font, max = 4, drawn = false): string[] {
  const fitW2 = drawn ? (x: string, f2: Font) => Math.max(fitW(x, f2), drawnW(x, f2), poppinsW(x, f2)) : fitW;
  docBudget().charge("stage words", s.length + 1, s.length);
  const words = s.split(" ").filter((x) => x !== ""), out: string[] = [];
  let cur = "";
  const push = (x: string) => { out.push(x); };
  for (let word of words) {
    const tryW = cur ? cur + " " + word : word;
    if (fitW2(tryW, f) <= w) { cur = tryW; continue; }
    if (cur) { push(cur); cur = ""; }
    while (fitW2(word, f) > w && word.length > 1) {
      let k = 1; while (k < word.length && fitW2(word.slice(0, k + 1), f) <= w) k++;
      // break after a "-", ".", "/", "_" or ":" when one falls in the part that fits (host names, paths)
      let b = k; while (b > 1 && !"-./_:".includes(word[b - 1])) b--;
      if (b > k / 3) k = b;
      push(word.slice(0, k)); word = word.slice(k);
    }
    cur = word;
  }
  if (cur || !out.length) push(cur);
  if (out.length > max) { const keep = out.slice(0, max); let last = keep[max - 1]; while (last && measure(last + "…", f) > w) last = last.slice(0, -1); keep[max - 1] = last + "…"; return keep; }
  return out;
}
/** a text of several lines drawn as ONE run (one text node, no tspans: a chip's "2 Announced", number over
 * name). `breaks` are the indexes in its words where a new line starts, each line centred on x, `pitch` apart. Gives the
 * first character's x and the per-character dx and dy that put every line in place; `width(from, to)` is the advance of
 * s.slice(from, to): measure in the plan, the browser's own (getSubStringLength) once painted. */
export function textLayout(s: string, breaks: number[], cx: number, pitch: number, width: (from: number, to: number) => number): { x: number; dx: number[]; dy: number[]; lines: { x: number; w: number }[] } {
  const starts = [0, ...breaks], end = (j: number) => (j + 1 < starts.length ? starts[j + 1] : s.length);
  const trim = (a: number, e: number) => { while (e > a && s[e - 1] === " ") e--; return e; };
  // drawn with text-anchor middle: SVG 2 centres the whole chunk (the union of its glyphs) on x, so every line is centred
  // on one point c (the first line starts at x) and the browser moves that point onto x
  const ws = starts.map((a, j) => width(a, trim(a, end(j)))), c = cx + ws[0] / 2, xs = ws.map((w) => c - w / 2);
  const dx: number[] = new Array(breaks.length ? breaks[breaks.length - 1] + 1 : 0).fill(0), dy = [...dx];
  for (let j = 1; j < starts.length; j++) { dx[starts[j]] = xs[j] - (xs[j - 1] + width(starts[j - 1], starts[j])); dy[starts[j]] = pitch; }
  return { x: cx, dx, dy, lines: ws.map((w) => ({ x: cx - w / 2, w })) };
}
/** The widest single word: the least width a text can wrap to. */
export const longestWord = (s: string, f: Font) => s.split(" ").reduce((a, x) => Math.max(a, measure(x, f)), 0);

// ---------------------------------------------------------------- splitting author text (hand-written scans, linear)
/** Split on a separator, trimmed, empty parts dropped. */
export const parts = (s: string, sep: string) => s.split(sep).map((x) => x.trim()).filter((x) => x !== "");
/** "role ids: rest" or "word: rest": the text before the first ": " and after it. */
export function colon(s: string): [string, string] | null { const k = s.indexOf(": "); if (k < 0) return s.endsWith(":") ? [s.slice(0, -1), ""] : null; return [s.slice(0, k), s.slice(k + 2)]; }
/** A trailing verdict "[+ kept]" or "[- dropped]": the text before it and the verdict. */
export function verdict(s: string): { text: string; ok?: boolean; v?: string; chip?: boolean } {
  const t = s.trimEnd();
  if (!t.endsWith("]")) return { text: s };
  const k = t.lastIndexOf("[");
  if (k < 0 || (t[k + 1] !== "+" && t[k + 1] !== "-" && t[k + 1] !== "=") || t[k + 2] !== " ") return { text: s };
  if (t[k + 1] === "=") return { text: t.slice(0, k).trimEnd(), v: t.slice(k + 3, -1).trim(), chip: true };
  return { text: t.slice(0, k).trimEnd(), ok: t[k + 1] === "+", v: t.slice(k + 3, -1).trim() };
}

// ---------------------------------------------------------------- what the source may not hold
// No coordinate, pixel, colour value or millisecond. Text is content, so a caption may say
// "300 ms"; what is refused is a pixel size or a colour value anywhere, and a coordinate or a time as an option value.
export function forbidden(t: string): string | null {
  const low = t.toLowerCase();
  for (let i = 0; i < low.length; i++) {
    const c = low[i];
    if (c === "#" && (i === 0 || low[i - 1] === " " || low[i - 1] === "=" || low[i - 1] === ":")) {
      let j = i + 1; while (j < low.length && /[0-9a-f]/.test(low[j])) j++;
      const n = j - i - 1; if ((n === 3 || n === 6 || n === 8) && (j === low.length || !/[0-9a-z_-]/.test(low[j]))) return `a colour value (${t.slice(i, j)}): colours come from the page's roles, never from the scene`;
    }
    if (c >= "0" && c <= "9" && (i === 0 || !/[0-9a-z.]/.test(low[i - 1]))) {
      let j = i; while (j < low.length && /[0-9.]/.test(low[j])) j++;
      const u = low.slice(j, j + 2), after = low[j + 2];
      if (u === "px" && (after === undefined || !/[a-z]/.test(after))) return `a pixel size (${t.slice(i, j + 2)}): the stage sizes everything itself`;
      i = j - 1;
    }
  }
  if (/(^|\s)(x|y|left|top|width|height|pos|dur|delay)=/.test(low)) return "a coordinate, size or time option: the stage places and times everything itself";
  if (/(^|\s)(rgb|rgba|hsl|hsla|oklch)\(/.test(low)) return "a colour value: colours come from the page's roles";
  if (/(^|\s)\d+(\.\d+)?ms\b/.test(low) && /(=|^\s*(pace|wait|after|every)\b)/.test(low)) return "a time in milliseconds: the player sets the pace";
  return null;
}

// ---------------------------------------------------------------- the block interface
export type BlockInput = { word: string; arg: string; body: Line[]; line: number };
/** `keep`: the line began with "keep" (keep at, keep span, keep dot, keep mark): it stays from this step on */
/** `shared`: another block of this scene owns the word too: return false for what is not yours (it goes on to the next) */
export type StepOp = BlockInput & { step: number; keep?: boolean; shared?: boolean };
export type ParseCtx = { roles: Set<string>; problem: (line: number, msg: string) => void; ids: Set<string>; steps: number; caption?: (step: number, text: string, keep?: boolean) => void; lanes?: string[] }; // lanes: the lane titles, for check
/** `beside`: the block is one of a step's panels laid side by side (its box is its share of the row, not the stage) */
export type Box = { /** Matching default column grids may share their first column. */ columnLeft?: number; /** a note frame's least height ('height: N lines' after 'notes:') */ noteMin?: number; w: number; narrow: boolean; steps: number; stepTitles: string[]; beside?: boolean; /** the panels sit right of a lone card (wide): a card filling them is a card, not the stage's panel */ inset?: boolean; noteH?: (w: number) => number; theme?: Record<string, string>; aside?: { w: number; steps?: number[] }; footLeft?: number; lanes?: { title: string; x: number; w: number }[] }; // lanes: laid-out lane columns, x in the block's frame
/** `slot`: a head block may offer a place for the step notes (its left column under its rows, beside a side column);
 * the stage puts the note region there instead of under everything. */
/** `aside`: content for an empty peer-panel slot offered to the immediately following head; the stage owns its placement.
 * Box.aside.steps: when set, the slot is free only in those steps; the head takes it only if its aside shows in no other step. */
/** A head may align following foot words with its first content column. */
/** `slot.under`: on a phone the notes go right under the block's first part (a worksheet's groups), and what the block drew from `y` down (its outcome column) moves under them. */
/** head: an aside's own words above its body (an inset's caption or bracket); the panels beside it start below them */
export type LayoutOut = { h: number; head?: number; items: Item[]; slot?: { x: number; y: number; w: number; grow?: string[]; under?: boolean }; aside?: LayoutOut; footLeft?: number };
export interface StageBlock<N = any> {
  /** the word that starts the block: a head block's line is `word: arg` (or `word arg`), a panel's is `word arg` in a step */
  word: string;
  /** head: declared before the first @step, laid out once for the whole scene; panel: written under a step, shown in that step only */
  kind: "head" | "panel";
  /** A setup block may also be supplied as a one-step panel (counted units). */
  panel?: boolean;
  /** step words a head block owns ("at" for the track, "mark" for the worksheet): each is handed to `op`. Two blocks
 * may own one word (track and time both own "at"; any block may own "show" and "light" for its own ids): the stage
 * offers the line to each owner in source order until one takes it */
  ops?: string[];
  /** the head block's own setup words that follow it at the top level ("carry", "where" for the track) */
  more?: string[];
  parse(input: BlockInput, ctx: ParseCtx): N;
  /** a panel written right under another panel of the same word may join it (cell rows: one panel, rows aligned); true when it did */
  join?(prev: N, next: N): boolean;
  /** a head block may claim the setup lines that follow it (until the next lane or head block): return true when it took the line */
  claim?(node: N, l: Line, body: Line[], ctx: ParseCtx): boolean;
  /** a setup word from `more`, or a step word from `ops` */
  /** return false to say "not mine" (the ids or the value are not this block's): the stage offers the line to the next owner */
  op?(node: N, op: StepOp, ctx: ParseCtx): void | boolean;
  /** called once after the whole setup is read (every head line, claimed line and "more" word): refuse what only the whole setup shows */
  check?(node: N, ctx: ParseCtx): void;
  /** Heads with the same column key share the largest default gutter; explicit layouts may decline. */
  columns?(node: N, box: Box): { key: string; left: number } | undefined;
  layout(node: N, box: Box): LayoutOut;
  /** the facts an LLM reads: step 0 = the setup, then each step from 1 */
  facts(node: N, step: number): string[];
}
const REG = new Map<string, StageBlock>();
export function registerBlock(b: StageBlock) { REG.set(b.word, b); }
export const blockFor = (word: string) => REG.get(word);
export const blockByOp = (word: string) => [...REG.values()].find((b) => b.kind === "head" && b.ops?.includes(word));
export const blockByMore = (word: string) => [...REG.values()].find((b) => b.kind === "head" && b.more?.includes(word));
export const blockWords = () => [...REG.keys()];

// ---------------------------------------------------------------- small drawing helpers blocks share
export const PAD = 14; // the stage's side margin
export function chip(x: number, y: number, s: string, paint: string, w0 = 0, f: Font = "chip", bar: Record<string, string | number> = { kind: "chip", label: s }): { w: number; items: Item[] } {
  const w = Math.max(w0, measure(s, f) + 18), h = 20;
  return { w, items: [{ k: "box", x: x - w / 2, y, w, h, fill: `${paint}:soft`, stroke: `${paint}:line`, r: 10, cls: "stg-chip", bar }, { k: "text", x, y: y + 14, s, f, ink: `${paint}:ink`, anchor: "middle" }] };
}
/** A list of lines, each "! text" in the warning tone: items and the height used. */
export function textLines(x: number, y: number, w: number, lines: string[], f: Font = "sub", ink: Paint = "muted"): LayoutOut {
  const items: Item[] = []; let h = 0;
  for (const l of lines) {
    const warn = l.startsWith("! "), s = warn ? l.slice(2) : l;
    for (const row of wrap(s, w, f)) { items.push({ k: "text", x, y: y + h + LINE_H[f] - 4, s: row, f, ink: warn ? "warn:ink" : ink }); h += LINE_H[f]; }
  }
  return { h, items };
}
/** Move items by dx, dy (a block's box placed on the stage). */
export function shift(items: Item[], dx: number, dy: number, when?: When): Item[] {
  return items.map((it) => {
    const o: any = { ...it, ...(when ? { from: it.from ?? when.from, to: it.to ?? when.to, on: it.on ?? when.on, hot: it.hot ?? when.hot } : {}) };
    if (it.k === "path") o.pts = it.pts.map(([x, y]) => [x + dx, y + dy]);
    else { o.x = (it as any).x + dx; o.y = (it as any).y + dy; }
    return o as Item;
  });
}
/** "a, b..c, p*": ids, ranges (p1..p6) and prefixes (p* = every id of the scene that starts with p and ends in digits). */
export function expandIds(s: string, all: Iterable<string>): string[] {
  const out: string[] = [];
  for (const raw of parts(s, ",")) {
    if (raw.endsWith("*")) { const pre = raw.slice(0, -1); for (const id of all) if (id.startsWith(pre) && /^\d*$/.test(id.slice(pre.length)) && id.length > pre.length) out.push(id); continue; }
    const r = range(raw); if (r) out.push(...r); else out.push(raw);
  }
  return out;
}
/** "p1..p6" -> p1, p2,... p6 (at most 64); null when not a range */
export function range(s: string): string[] | null {
  const k = s.indexOf(".."); if (k < 0) return null;
  const a = s.slice(0, k), b = s.slice(k + 2);
  const ma = /^([a-z_-]*?)(\d+)$/i.exec(a), mb = /^([a-z_-]*?)(\d+)$/i.exec(b);
  if (!ma || !mb || (mb[1] && mb[1] !== ma[1])) return null;
  const from = +ma[2], to = +mb[2]; if (to < from || to - from > 63) return null;
  return Array.from({ length: to - from + 1 }, (_, i) => ma[1] + (from + i));
}
export const ID_RE = /^[A-Za-z][\w.-]*$/;
