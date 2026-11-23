// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
import {boxTone} from "./stage-box-paint";
// Time: a continuous ruler, state rows, markers, a value plot and an optional enlarged inset.
// Existing words stay the same: time, row, at and span. All positions are data, never drawing coordinates.
import { type Item, type When, type StageBlock, type Box, type LayoutOut, type Line, type ParseCtx, StageError, registerBlock, measure, wrap as wrapText, parts, colon, shift, ID_RE, fontSize } from "./stage-core";
import { docBudget } from "./stage-budget";

// Public spellings live here; parsers below use stable internal names.
export const TIME_WORDS = {
  time:"time",row:"row",zoomrow:"zoom row",ticks:"ticks",zoomticks:"zoom ticks",zoomlabels:"zoom labels",ruler:"ruler",labels:"row labels",cells:"cells",
  zoom:"zoom",window:"window",height:"height",dot:"dot",values:"plot",point:"point",at:"at",span:"span",arrow:"arrow",show:"show",hush:"hush",tag:"tag",fill:"fill",off:"off",
  lanes:"axis",band:"band", // the axis under named lanes; a titled region behind rows
} as const;
const TIME_PARSE=new Map<string,keyof typeof TIME_WORDS>(Object.entries(TIME_WORDS).map(([key,value])=>[value,key as keyof typeof TIME_WORDS]));
const TIME_SPELLINGS=[...TIME_PARSE.keys()].sort((a,b)=>b.length-a.length);
const TIME_OPS: (keyof typeof TIME_WORDS)[]=["at","span","dot","arrow","show","hush","tag","fill","off"];
/** a sentence for the LLM view: one full stop at the end, never two (marker words often end with their own) */
/** a tick label's reveal in the LLM view */
const tickNote=(label?:string,r?:{from:number;to:number},tone?:string)=>{const note=[label,tone&&(tone.startsWith("role:")?tone.slice(5):TIME_STYLES[tone as keyof typeof TIME_STYLES]||tone),r&&`from step ${r.from}${r.to?` to ${r.to}`:""}`].filter(Boolean).join(", ");return note?` (${note})`:"";};
const endStop=(s:string)=>/[.!?…:]$/.test(s.trim())?s.trim():`${s.trim()}.`;
const TIME_SETUP=new Set<string>(["lanes","band","row","zoomrow","ticks","zoomticks","zoomlabels","ruler","labels","cells","zoom","window","height","at","dot","values","point"]);
export const TIME_STYLES={plain:"plain",idle:"dashed",good:"good",warn:"warn",bad:"bad",acc:"accent",wide:"wide",focus:"lit",dot:"dot",numbered:"numbered",after:"after",soft:"soft"} as const;
const STYLE_PARSE=new Map<string,keyof typeof TIME_STYLES>(Object.entries(TIME_STYLES).map(([key,value])=>[value,key as keyof typeof TIME_STYLES]));

const MARKER_FLAGS={guide:"[guide]",solid:"[solid]",below:"[below]",caption:"[caption]",beside:"[beside]",tick:"[tick]"} as const;
const ROW_FLAGS={chip:"[chip]"} as const;
type Seg = { name: string; a: number; b: number; on: boolean; from: number; to: number; tone?: string; wide: boolean; focus: boolean; dot?: boolean; numbered?: boolean; after?: boolean; soft?: boolean; role?: string };
type TRow = { role: string; id: string; label: string; segs: Seg[]; inset?: boolean; boxed?: boolean; chip?: boolean };
type Mark = { step: number; kind: "at" | "span" | "dot"; row?: string; a: number; b: number; text: string; tone?: string; persist?: boolean; line?: boolean; bar?: boolean; edge?: boolean; solid?: boolean; below?: boolean; caption?: boolean; beside?: boolean; tick?: boolean; labelTo?: number };
type Arrow = { from: string; to: string; at: number; text: string; step: number; dash: boolean; tone?: string };
type TimeTag = {row:string;a:number;b:number;text:string;step:number};
type DotPaint = {row:string;step:number;keep:boolean;off:boolean;range?:[number,number];tone?:string;at?:number};
type Band = { role: string; id: string; title: string; first: string; last: string; line: number };
type Point = { role: string; id: string; time: number; value: number; label: string };
type Axis = { a: number; b: number; unit: string; from?: number; to?: number; tone?:string };
type Time = Axis & { key: string; name?: string; windowLines?: number; from: number; shown?: boolean; rows: TRow[]; dotPaints: DotPaint[]; tags: TimeTag[]; marks: Mark[]; arrows: Arrow[]; ticks?: number[]; zoomTicks?: number[]; zoomLabels?: Map<number, string>; tickLabels: Map<number, string>; tickWhen?: Map<number, {from:number;to:number}>; zoomWhen?: Map<number, {from:number;to:number}>; tickTone?: Map<number, string>; zoomTone?: Map<number, string>; cells?: number; roomy?: boolean; apart?: boolean; headers?: boolean; rulerNone?: boolean; rulerBelow?: boolean; rulerLine?: number; labelsAbove?: boolean; labelsBeside?: boolean; window?: Axis; zoom?: Axis; lanes?: [string, string]; lanesLine?: number; bands: Band[]; zoomBelow?: boolean; zoomBracket?: boolean; values?: Axis; points: Point[]; hushes: {step:number;at:number;span?:string}[]; ids: Set<string>; last: Map<string, number> };
type TimeScope = { names: Map<string, Time>; rows: Map<string, Time | null>; n: number };
const scopes=new WeakMap<ParseCtx,TimeScope>();
/** A phase strip accompanying numeric time is a set of separators, rather than a standalone journey. */
export const hasTimeAxis=(ctx:ParseCtx)=>!!scopes.get(ctx)?.n;
const charge = (what: string, n = 1, memory = 0) => docBudget().charge(`time ${what}`, n, memory);
const num = (s: string) => (/^-?\d+(\.\d+)?$/.test(s.trim()) ? +s.trim() : NaN);
const span = (s: string): [number, number] | null => { const k = s.indexOf(".."); if (k < 0) return null; const a = num(s.slice(0, k)), b = num(s.slice(k + 2)); return Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(b - a) && b > a ? [a, b] : null; };
const fmt = (v: number) => Number.isInteger(v) ? v.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 0 }) : String(+v.toPrecision(12));
/** Nice tick step: 1, 2 or 5 times a power of ten, about 6 to 12 ticks. */
export function tickStep(len: number, most = 12): number { const raw = len / most, p = Math.pow(10, Math.floor(Math.log10(raw))); for (const m of [1, 2, 5, 10]) if (m * p >= raw && m * p > 0) return m * p; return len; }
function axis(arg: string, line: number, word: string): Axis {
  charge("axis", arg.length + 1, arg.length);
  const [r, ...unit] = arg.split(" | "), s = span(r);
  if (!s) throw new StageError(line, `${word} names an increasing finite number range: ${word}: 0..60 | seconds`);
  return { a: s[0], b: s[1], unit: unit.join(" | ").trim() };
}
/** a tick list split at commas outside double quotes, so a quoted label may hold a comma ("7 \"new pod a, cold\""); one linear scan */
function tickParts(s: string): string[] {
  const out: string[] = []; let start = 0, quoted = false;
  for (let i = 0; i < s.length; i++) { const ch = s[i]; if (ch === '"') quoted = !quoted; else if (ch === "," && !quoted) { out.push(s.slice(start, i)); start = i + 1; } }
  out.push(s.slice(start)); charge("tick list", s.length + 1, out.length);
  return out.map((x) => x.trim()).filter((x) => x !== "");
}
function flat(body: Line[]) { if (body.length) throw new StageError(body[0].n, "time words are one line; remove the indentation"); }
// Check ranges in their first-declaration order; later versions may be written anywhere in the row.
function orderedStates(groups:Iterable<Seg[]>,steps:number,line:number){
  const n=Math.max(1,steps);charge("state step index",n,n*8);
  const tags=Array<number>(n*4).fill(-Infinity),max=Array<number>(n*4).fill(-Infinity);
  const visit=(at:number,lo:number,hi:number,a:number,b:number,value?:number):number=>{
    charge("state step interval");
    if(a<=lo&&hi<=b){if(value!==undefined)max[at]=Math.max(max[at],tags[at]=Math.max(tags[at],value));return max[at];}
    const mid=Math.floor((lo+hi)/2);let result=tags[at];
    if(a<=mid)result=Math.max(result,visit(at*2,lo,mid,a,b,value));
    if(b>mid)result=Math.max(result,visit(at*2+1,mid+1,hi,a,b,value));
    if(value!==undefined)max[at]=Math.max(tags[at],max[at*2],max[at*2+1]);
    return result;
  };
  for(const versions of groups)for(const s of versions){const a=s.from-1,b=(s.to||n)-1;if(s.a<visit(1,0,n-1,a,b))throw new StageError(line,"states shown in the same step must increase without overlap; different ranges may overlap only in disjoint step windows");visit(1,0,n-1,a,b,s.b);}
}
function within(v: number, a: Axis) { return Number.isFinite(v) && v >= a.a && v <= a.b; }
function headerTick(v:number,t:Time,line:number){
  const start=t.a+Math.floor((v-t.a)/t.cells!)*t.cells!,end=Math.min(t.b,start+t.cells!),center=(start+end)/2;
  if(v>=t.b||Math.abs(v-center)>Math.max(1e-9,t.cells!*1e-9))throw new StageError(line,"with cells: interval | headers, ticks name column centres (for 0..4 and cells: 1, use 0.5, 1.5, 2.5, 3.5)");
}
function cellHeaders(t:Time){
  if(t.ticks)return t.ticks;
  const n=Math.ceil((t.b-t.a)/t.cells!);charge("header cells",n,n*8);
  return Array.from({length:n},(_,i)=>{const start=t.a+i*t.cells!;return (start+Math.min(t.b,start+t.cells!))/2;});
}
function spanVisibility(marks:Mark[],steps:number,minFrom:number,maxTo:number):When{
  charge("span visibility sort",marks.length*Math.max(1,Math.ceil(Math.log2(marks.length+1))));
  const ranges=marks.map(m=>[Math.max(minFrom,m.step||1),Math.min(maxTo,m.persist||!m.step?steps:m.step)]).filter(([a,b])=>a<=b).sort((a,b)=>a[0]-b[0]),merged:number[][]=[];
  for(const r of ranges){charge("span visibility");const last=merged.at(-1);if(last&&r[0]<=last[1]+1)last[1]=Math.max(last[1],r[1]);else merged.push([...r]);}
  if(merged.length===1)return {from:merged[0][0],to:merged[0][1]===steps?0:merged[0][1]};
  const n=merged.reduce((n,[a,b])=>n+b-a+1,0);charge("span visibility steps",n,n*8);return {on:merged.flatMap(([a,b])=>Array.from({length:b-a+1},(_,i)=>a+i))};
}
function markPaint(raw: string | undefined, roles: Set<string>, line: number): string {
  if (!raw) return "acc";
  if(raw==="[plain]")return "ink";
  const style=STYLE_PARSE.get(raw.slice(1,-1));
  if (raw.startsWith("[") && raw.endsWith("]") && style&&["acc", "good", "bad", "warn"].includes(style)) return style;
  if (raw.startsWith("(") && raw.endsWith(")") && roles.has(raw.slice(1, -1))) return "role:" + raw.slice(1, -1);
  throw new StageError(line, "marker colour is [accent], [good], [bad], [warn] or (a declared role)");
}
function ticks(a: Axis, width: number, explicit?: number[]) {
  if (explicit) return explicit.filter((v) => { charge("ticks"); return within(v, a); });
  const step = tickStep(a.b - a.a, Math.max(2, Math.floor(width / 64)));
  const out = [a.a];
  for (let i = 0, v = Math.ceil(a.a / step) * step; i < 200 && v < a.b; i++, v = (Math.ceil(a.a / step) + i) * step) {
    charge("ticks");
    if (v > a.a && v - a.a > step * 0.25 && a.b - v > step * 0.25) out.push(v);
  }
  out.push(a.b); return out;
}

// Sweep reveal boundaries rather than every scene step. Geometry stays fixed; only its frame grows.
function revealedFrames(frame:Extract<Item,{k:"box"}>, spans:{from:number;to:number;w:number}[], minW:number, steps:number):Item[]{
  const events=new Map<number,{w:number;delta:number}[]>();
  const add=(at:number,w:number,delta:number)=>{const list=events.get(at)||[];list.push({w,delta});events.set(at,list);};
  add(1,minW,1);
  for(const s of spans){charge("frame events",2,2);add(Math.max(1,s.from),s.w,1);if(s.to&&s.to<steps)add(s.to+1,s.w,-1);}
  const heap:number[]=[],counts=new Map<number,number>();
  const push=(w:number)=>{let i=heap.length;heap.push(w);while(i){charge("frame heap");const p=(i-1)>>1;if(heap[p]>=w)break;heap[i]=heap[p];i=p;heap[i]=w;}};
  const pop=()=>{const last=heap.pop()!;if(!heap.length)return;heap[0]=last;let i=0;while(i*2+1<heap.length){charge("frame heap");let c=i*2+1;if(c+1<heap.length&&heap[c+1]>heap[c])c++;if(heap[i]>=heap[c])break;[heap[i],heap[c]]=[heap[c],heap[i]];i=c;}};
  charge("frame sort",events.size*Math.max(1,Math.ceil(Math.log2(events.size+1))));
  const boundaries=[...events.keys()].sort((a,b)=>a-b),out:Extract<Item,{k:"box"}>[]=[];
  for(const [i,at] of boundaries.entries()){
    for(const e of events.get(at)!){charge("frame sweep");counts.set(e.w,(counts.get(e.w)||0)+e.delta);if(e.delta>0)push(e.w);}
    while(heap.length&&!counts.get(heap[0]))pop();
    const width=heap[0]||minW,to=boundaries[i+1]?boundaries[i+1]-1:0,last=out.at(-1);
    if(last&&last.w===width)last.to=to;
    else out.push({...frame,w:width,from:at,to,id:frame.id+":"+at});
  }
  return out;
}

registerBlock({
  word: TIME_WORDS.time, kind: "head", ops: TIME_OPS.map(key=>TIME_WORDS[key]),
  parse(inp,ctx): Time {
    flat(inp.body);
    const c=colon(inp.arg),name=c&&ID_RE.test(c[0])?c[0]:undefined;
    const fields=(name?c![1]:inp.arg).split(" | ");
    if(fields.slice(1).some(field=>field.startsWith("from ")))throw new StageError(inp.line,'name this time axis and write "show <axis name>" in its first visible step');
    const scope=scopes.get(ctx)||{names:new Map(),rows:new Map(),n:0};scopes.set(ctx,scope);
    if(name&&scope.names.has(name))throw new StageError(inp.line,`time axis "${name}" is declared twice; use distinct names`);
    const node:Time={ ...axis(fields.join(" | "), inp.line, "time"),key:name?"time-axis-"+name:scope.n?"time-"+(scope.n+1):"time",name,from:1, rows: [], dotPaints: [], tags: [], marks: [], arrows: [], points: [], bands: [], hushes: [], tickLabels: new Map(), ids: new Set(), last: new Map() };
    scope.n++;if(name)scope.names.set(name,node);return node;
  },
  claim(t: Time, l, body, ctx) {
    const rawWord = TIME_SPELLINGS.find(w=>l.t===w||l.t.startsWith(w+" ")||l.t.startsWith(w+":"))||"",word=TIME_PARSE.get(rawWord);
    if (!word||!TIME_SETUP.has(word)) return false;
    if((word==="lanes"||word==="band")&&!l.t.startsWith(rawWord+(word==="lanes"?":":" ")))return false; // "axis 0, 1" belongs to bars
    charge("source", l.t.length + 1, l.t.length); flat(body);
    if(word==="lanes"){
      const r=l.t.slice(rawWord.length+1).trim(),k=r.indexOf(".."),first=k<0?"":r.slice(0,k).trim(),last=k<0?"":r.slice(k+2).trim();
      if(t.lanes||!first||!last)throw new StageError(l.n,"write axis: First lane..Last lane once: the axis runs under those lanes");
      t.lanes=[first,last];t.lanesLine=l.n;return true;
    }
    if(word==="band"){
      const rest=l.t.slice(rawWord.length+1),q=rest.indexOf(' "'),end=q<0?-1:rest.indexOf('": ',q+2),head=q<0?[]:rest.slice(0,q).split(" "),title=end<0?"":rest.slice(q+2,end).trim(),range=end<0?"":rest.slice(end+3).trim(),k=range.indexOf("..");
      const first=k<0?"":range.slice(0,k).trim(),last=k<0?"":range.slice(k+2).trim();
      if(head.length!==2||!ID_RE.test(head[1])||!title||!ID_RE.test(first)||!ID_RE.test(last))throw new StageError(l.n,'a band is: band role id "Title": first row..last row');
      if(t.bands.length>=8)throw new StageError(l.n,"a time block holds at most 8 bands");
      if(t.bands.some(b=>b.id===head[1]))throw new StageError(l.n,`band id "${head[1]}" is declared twice; use a unique id`);
      if(!ctx.roles.has(head[0]))ctx.problem(l.n,`"${head[0]}" is not a role of this page; the page declares ${[...ctx.roles].join(", ")||"none"}`);
      t.bands.push({role:head[0],id:head[1],title,first,last,line:l.n});return true;
    }
    // 'height: N lines' under a window: its dashed frame keeps at least N text lines (18 px each) of height, the ruler inside as before; the same spelling and range (1..12) as a card's height
    if(word==="height"){const m=/^height:\s*(\d+) lines?$/.exec(l.t.trim());const n=m?+m[1]:NaN;
      if(!t.window)throw new StageError(l.n,"height: N lines follows window: a..b | words and sets the window frame's height");
      if(!m||n<1||n>12||t.windowLines!==undefined)throw new StageError(l.n,"write height: N lines once, N from 1 to 12: height: 4 lines");
      t.windowLines=n;return true;}
    if(word==="ruler"){const value=l.t.slice(rawWord.length+1).trim();if(!l.t.startsWith(rawWord+":")||!["none","below"].includes(value)||t.rulerNone!==undefined)throw new StageError(l.n,"write ruler: none or ruler: below once; otherwise omit this line");t.rulerNone=value==="none";t.rulerBelow=value==="below";t.rulerLine=l.n;return true;}
    if(word==="labels"){const place=l.t.slice(rawWord.length+1).trim();if(!l.t.startsWith(rawWord+":")||!["above","beside"].includes(place)||t.labelsAbove!==undefined)throw new StageError(l.n,"write row labels: above or row labels: beside once");t.labelsAbove=place==="above";t.labelsBeside=place==="beside";return true;}
    if (word === "cells") {
      const [raw, mode, extra] = l.t.slice(rawWord.length+1).trim().split(" | "), value = l.t.startsWith(rawWord+":") ? num(raw) : NaN;
      if (t.cells !== undefined || !Number.isFinite(value) || value <= 0 || value > t.b - t.a || extra || mode && mode !== "roomy" && mode !== "headers" && mode !== "apart") throw new StageError(l.n, "write cells: <positive interval on the time axis> once after time; optional | roomy, | headers or | apart");
      for (const row of t.rows) for (const s of row.segs) { if(s.after&&!s.wide)throw new StageError(l.n,"[after] labels one bar; add [wide] before declaring cells");const n = s.wide ? 1 : Math.ceil((s.b - s.a) / value); charge("cell expansion", n, n * 8); }
      t.cells = value; t.roomy = mode === "roomy"; t.headers = mode === "headers"; t.apart = mode === "apart";
      if(t.headers&&t.ticks)for(const v of t.ticks)headerTick(v,t,l.n); return true;
    }
    if (word === "ticks" || word === "zoomticks" || word === "zoomlabels") {
      const labelsOnly=word==="zoomlabels",target=word==="ticks"?"ticks":"zoomTicks",domain=word==="ticks"?t:t.zoom;
      if(!domain)throw new StageError(l.n,`${rawWord} goes after zoom: a..b`);
      if (!l.t.startsWith(rawWord+":") || (labelsOnly?t.zoomLabels:t[target])) throw new StageError(l.n, `write ${rawWord}: ${labelsOnly?"0 start, 20 end":"0, 20, 40, 60"} once after its axis`);
      const labels=labelsOnly?new Map<number,string>():t.tickLabels;
      const whenMap=word==="ticks"?(t.tickWhen??=new Map()):(t.zoomWhen??=new Map());
      const vs = tickParts(l.t.slice(rawWord.length+1)).map((raw) => {
        charge("tick label", raw.length + 1);
        // a tick label's words may show from a later step, as a state does ("7 new pod @3"); the place stays reserved
        // trailing flags, in any order: "@N" (its words show from step N) and one tone, as on markers
        let reveal:{from:number;to:number}|undefined,tone:string|undefined;
        for(let guard=0;guard<4;guard++){
          const cut=raw.lastIndexOf(" ");if(cut<0)break;const tail=raw.slice(cut+1);charge("tick flags",tail.length+1);
          const atStep=/^@(\d+)(?:\.\.(\d+))?$/.exec(tail);
          if(atStep){if(reveal)throw new StageError(l.n,"a tick label takes one @N");const from=+atStep[1],to=atStep[2]?+atStep[2]:0;if(from<1||from>ctx.steps||to&&(to<from||to>ctx.steps))throw new StageError(l.n,"a tick label's reveal is @N or @N..M naming declared steps: ticks: 0, 7 new pod @3");reveal={from,to};raw=raw.slice(0,cut).trimEnd();continue;}
          const isTone=["[accent]","[good]","[bad]","[warn]"].includes(tail)||tail.startsWith("(")&&tail.endsWith(")")&&ctx.roles.has(tail.slice(1,-1));
          if(isTone){if(tone)throw new StageError(l.n,"a tick label takes one tone: ticks: 3 \"alarm\" [bad]");tone=markPaint(tail,ctx.roles,l.n);raw=raw.slice(0,cut).trimEnd();continue;}
          break;
        }
        const split = raw.indexOf(" "), v = num(split < 0 ? raw : raw.slice(0, split));
        if(reveal)whenMap.set(v,reveal);
        if(tone)(word==="ticks"?(t.tickTone??=new Map()):(t.zoomTone??=new Map())).set(v,tone);
        if (split > 0) {
          let label = raw.slice(split + 1).trim();
          if (label.startsWith('"') && label.endsWith('"')) label = label.slice(1, -1);
          if (!label) throw new StageError(l.n, "a named tick is a number then its label: ticks: 0 start, 60 end");
          labels.set(v, label);
        }
        else if(labelsOnly)throw new StageError(l.n,"zoom labels names a number then its text: zoom labels: 0 start, 20 end");
        return v;
      });
      if (!vs.length) throw new StageError(l.n, "ticks names at least one number on the time axis");
      for (let i = 0; i < vs.length; i++) { charge("ticks parse"); if (!within(vs[i], domain) || (i && vs[i] <= vs[i - 1])) throw new StageError(l.n, `ticks must increase without repeats within ${domain.a}..${domain.b}`); }
      if(word==="ticks"&&t.headers)for(const v of vs)headerTick(v,t,l.n);
      if(labelsOnly)t.zoomLabels=labels;else t[target] = vs; return true;
    }
    if (word === "zoom" || word === "values" || word === "window") {
      if (!l.t.startsWith(rawWord + ":") || t[word]) throw new StageError(l.n, `write ${rawWord}: a..b | label once after time`);
      let arg=l.t.slice(rawWord.length+1).trim();
      let visibility:{from:number;to:number}|undefined;
      if(word==="zoom"&&/\s@\S+$/.test(arg)){
        const suffix=/\s@(\d+)(?:\.\.(\d+))?$/.exec(arg),from=suffix?+suffix[1]:0,to=suffix?.[2]?+suffix[2]:0;
        if(!suffix||from<1||from>ctx.steps||to&&(to<from||to>ctx.steps))throw new StageError(l.n,"zoom visibility is @N or @N..M within the scene steps");
        visibility={from,to};arg=arg.slice(0,suffix.index).trimEnd();
      }
      if(word==="zoom"&&arg.endsWith(" | below")){t.zoomBelow=true;arg=arg.slice(0,-8);}
      // "| bracket" draws the inset's words as its caption bracket (one item, no marker edge); "| below" may follow it
      if(word==="zoom"&&arg.endsWith(" | bracket")){t.zoomBracket=true;arg=arg.slice(0,-10);if(arg.split(" | ").length<2||!arg.split(" | ").slice(1).join(" | ").trim())throw new StageError(l.n,"a zoom bracket carries the inset's words: zoom: 24..36 | words | bracket");}
      if(word==="zoom"&&!t.zoomBelow&&arg.endsWith(" | below")){t.zoomBelow=true;arg=arg.slice(0,-8);}
      let tone:string|undefined;if(word==="zoom"){const pieces=arg.split(" | "),paint=boxTone(pieces[0],l.n);pieces[0]=paint.text;tone=paint.tone;arg=pieces.join(" | ");}
      const a = axis(arg, l.n, rawWord);
      if (word === "zoom" && (a.b <= t.a || a.a >= t.b || a.b - a.a >= t.b - t.a)) throw new StageError(l.n, "zoom names a smaller stretch overlapping the time axis");
      if (word === "window" && (a.a < t.a || a.b > t.b)) throw new StageError(l.n, "window names a range inside the time axis");
      t[word] = {...a,...visibility,...(tone?{tone}:{})}; return true;
    }
    if(word==="dot"&&l.t.slice(rawWord.length+1).includes(",")&&!colon(l.t.slice(rawWord.length+1))){
      const arg=l.t.slice(rawWord.length+1).trim(),style=/\s+(\[[^\]]+\]|\([^)]+\))$/.exec(arg),raw=style?arg.slice(0,style.index):arg,vs=parts(raw,",").map(num);
      charge("dot list",vs.length,vs.length*8);
      if(vs.length<2||vs.some(v=>!within(v,t))||new Set(vs).size!==vs.length)throw new StageError(l.n,"a dot list has distinct comma-separated numbers within the time axis: dot 5, 10, 15");
      const tone=style?markPaint(style[1],ctx.roles,l.n):"muted";
      for(const v of vs)t.marks.push({step:0,kind:"dot",a:v,b:v,text:"",tone});return true;
    }
    if (word === "at" || word === "dot") {
      const arg = l.t.slice(rawWord.length + 1), c = colon(arg) ?? (word === "dot" ? [arg, ""] : null), tokens = c?.[0].split(" ");
      const style=tokens?.slice(1).filter(s=>s!==MARKER_FLAGS.guide&&s!==MARKER_FLAGS.solid&&(word!=="at"||s!==MARKER_FLAGS.below&&s!==MARKER_FLAGS.caption&&s!==MARKER_FLAGS.beside&&s!==MARKER_FLAGS.tick));
      if(tokens?.includes(MARKER_FLAGS.beside)&&(tokens.includes(MARKER_FLAGS.below)||tokens.includes(MARKER_FLAGS.caption)))throw new StageError(l.n,"[beside] puts the words beside the line at the rows' top; do not combine it with [below] or [caption]");
      if (!c || word === "at" && !c[1] || !tokens || style!.length > 1 || !within(num(tokens[0]), t)) throw new StageError(l.n, `a marker is: at <number on ${t.a}..${t.b}> [accent] [guide]: label`);
      if(tokens.includes(MARKER_FLAGS.caption)&&tokens.includes(MARKER_FLAGS.below))throw new StageError(l.n,"[caption] puts the words in the step caption; do not combine it with [below]");
      if(tokens.includes(MARKER_FLAGS.caption)&&!ctx.steps)throw new StageError(l.n,"[caption] needs scene steps; otherwise use a normal marker label");
      const v = num(tokens[0]), tone = markPaint(style![0], ctx.roles, l.n);
      t.marks.push({ step: 0, kind: word === "dot" ? "dot" : "at", a: v, b: v, text: c[1], tone: word === "dot" && !style![0] ? "muted" : tone, edge:!tokens.includes(MARKER_FLAGS.guide),solid:tokens.includes(MARKER_FLAGS.solid),tick:tokens.includes(MARKER_FLAGS.tick),below:tokens.includes(MARKER_FLAGS.below),caption:tokens.includes(MARKER_FLAGS.caption),beside:tokens.includes(MARKER_FLAGS.beside) });if(tokens.includes(MARKER_FLAGS.caption))ctx.caption?.(0,c[1],true); return true;
    }
    if (word === "point") {
      const c = colon(l.t.slice(rawWord.length+1)), head = c?.[0].split(" ");
      if (!c || !head || head.length !== 4 || head[2] !== "at" || !ID_RE.test(head[1])) throw new StageError(l.n, "a point is: point role id at <time>: <value> | label");
      if (!t.values) throw new StageError(l.n, "declare plot: a..b | unit before a point");
      const [value, ...label] = c[1].split(" | "), v = num(value), time = num(head[3]);
      if (!within(time, t) || !within(v, t.values)) throw new StageError(l.n, "point time and value must be within their declared axes");
      if (t.ids.has(head[1])) throw new StageError(l.n, `point id "${head[1]}" is declared twice; use a unique id`);
      if (t.last.has(head[0]) && time <= t.last.get(head[0])!) throw new StageError(l.n, "points in each role must increase in time; reorder them");
      if (!ctx.roles.has(head[0])) ctx.problem(l.n, `"${head[0]}" is not a role of this page; declare it under roles`);
      t.ids.add(head[1]); t.last.set(head[0], time); t.points.push({ role: head[0], id: head[1], time, value: v, label: label.join(" | ") }); return true;
    }
    const inset=word==="zoomrow", domain=inset?t.zoom:t;
    if(!domain)throw new StageError(l.n,"declare zoom: a..b before a zoom row");
    const rowText=l.t.slice(rawWord.length+1), quote=rowText.indexOf('"'), endQuote=quote<0?-1:rowText.indexOf('"',quote+1), split=endQuote<0?-1:rowText.indexOf(": ",endQuote);
    const c: [string,string]|null = split<0?colon(rowText):[rowText.slice(0,split),rowText.slice(split+2)];
    if (!c) throw new StageError(l.n, `a time row is: row role id "label": state 0..4; +state 4..9`);
    const chip=c[0].endsWith(" "+ROW_FLAGS.chip),rowHead=chip?c[0].slice(0,-ROW_FLAGS.chip.length-1):c[0];
    const q = rowHead.indexOf(' "'), label = q > 0 && rowHead.endsWith('"') ? rowHead.slice(q + 2, -1) : "";
    const head = (q > 0 ? rowHead.slice(0, q) : rowHead).split(" "), [role, id] = head;
    if (head.length !== 2 || !ID_RE.test(id ?? "") || q>0&&!rowHead.endsWith('"')) throw new StageError(l.n, `a time row is: row role id "label" [chip]: states (the label chip is optional)`);
    if(chip&&(q<0||!label.trim()))throw new StageError(l.n,'[chip] on a time row needs a quoted label: row role id "label" [chip]: states');
    if (t.rows.some((r) => r.id === id)) throw new StageError(l.n, `row id "${id}" is declared twice; use a unique id`);
    if (!ctx.roles.has(role)) ctx.problem(l.n, `"${role}" is not a role of this page; the page declares ${[...ctx.roles].join(", ") || "none"}`);
    const ranges = new Map<string, Seg[]>();
    const segs = parts(c[1], ";").map((x) => {
      charge("segments", x.length + 1, 1);
      const tokens = x.split(" ").filter(Boolean); let from = 1, to = 0, tone: string | undefined, wide = false, focus = false, dot = false, numbered = false, after = false, soft = false, role: string | undefined;
      while (tokens.length) {
        const last = tokens.at(-1)!;
        // a state takes its own role, spelled as on a connector: '+a 0..3 (a)'; one per state
        if (last.startsWith("(") && last.endsWith(")") && last.length > 2) {
          if (role !== undefined) throw new StageError(l.n, "a state takes one role: +a 0..3 (a)");
          role = last.slice(1, -1); if (!ctx.roles.has(role)) throw new StageError(l.n, `"${role}" is not a role of this page; a state's (role) names a declared role: +a 0..3 (a)`);
          tokens.pop(); continue;
        }
        if (last.startsWith("@")) {
          const k = last.indexOf(".."), a = num(last.slice(1, k < 0 ? undefined : k)), b = k < 0 ? 0 : num(last.slice(k + 2));
          if (!Number.isInteger(a) || a < 1 || a > ctx.steps || !Number.isInteger(b) || (b !== 0 && (b < a || b > ctx.steps))) throw new StageError(l.n, "state reveal is @N or @N..M naming declared steps");
          from = a; to = b; tokens.pop(); continue;
        }
        if (last.startsWith("[") && last.endsWith("]")) {
          const token = STYLE_PARSE.get(last.slice(1, -1));
          if (token === "wide") wide = true; else if (token === "focus") focus = true; else if (token === "dot") dot = true; else if(token==="numbered")numbered=true;else if(token==="after")after=true;else if(token==="soft")soft=true;
          else if (token&&["plain", "idle", "good", "warn", "bad", "acc"].includes(token)) tone = token;
          else throw new StageError(l.n, "cell styles are "+Object.values(TIME_STYLES).map(v=>`[${v}]`).join(", "));
          tokens.pop(); continue;
        }
        break;
      }
      const rangeText = tokens.pop() ?? "", s = span(rangeText), name = tokens.join(" "), text = name.replace(/^\+/, "");
      if (!s) throw new StageError(l.n, `a state is "name a..b" with numbers on the axis: "${x}"`);
      if (s[0] < domain.a || s[1] > domain.b) throw new StageError(l.n, `"${x}" runs off the axis (${domain.a}..${domain.b})`);
      if (!text) throw new StageError(l.n, "a state needs a name before its range; write _ for an empty cell");
      const key = s.join(".."), versions=ranges.get(key), old = versions?.at(-1);
      if (old) {
        if (from <= old.from || (old.to && old.to >= from)) throw new StageError(l.n, "a replacement of the same state range starts in a later nonoverlapping step");
        if (!old.to) old.to = from - 1;
      }
      if(after&&(t.cells&&!wide||dot||numbered))throw new StageError(l.n,"[after] labels one bar; use [wide] with cells, without [dot] or [numbered]");
      if(soft&&(!tone||!["good","warn","bad","acc"].includes(tone)))throw new StageError(l.n,"[soft] needs a tone: [good], [warn], [bad] or [accent]");
      const seg: Seg = { name: text === "_" ? "" : text, a: s[0], b: s[1], on: name.startsWith("+")||!!role, from, to, tone, wide, focus, dot, numbered, after, soft, ...(role?{role}:{}) };
      if (t.cells) { const n = wide ? 1 : Math.ceil((seg.b - seg.a) / t.cells); charge("cell expansion", n, n * 8); }
      charge("state versions",1,1);if(versions)versions.push(seg);else ranges.set(key,[seg]);return seg;
    });
    orderedStates(ranges.values(),ctx.steps,l.n);
    if (!segs.length) throw new StageError(l.n, "a time row needs at least one state range");
    if (t.rows.length >= 16) throw new StageError(l.n, "a time block holds at most 16 rows");
    const boxed=q>0&&label.startsWith("|");if(boxed&&!label.slice(1).trim())throw new StageError(l.n,"a boxed row label needs words after | inside the quotes");
    t.rows.push({ role, id, label: q>0?(boxed?label.slice(1).trimStart():label):id, segs, inset, boxed, ...(chip?{chip}:{}) });
    const rowOwners=scopes.get(ctx)!.rows;rowOwners.set(id,rowOwners.has(id)?null:t);return true;
  },
  check(t:Time,ctx){
    if(t.headers&&t.rulerBelow)throw new StageError(t.rulerLine!,"ruler: below uses a continuous ruler; headers draw boxes above the columns");
    if(t.lanes&&ctx.lanes){const [a,b]=t.lanes.map(n=>ctx.lanes!.indexOf(n));for(const n of t.lanes)if(!ctx.lanes.includes(n))throw new StageError(t.lanesLine!,`"${n}" is not a lane above (${ctx.lanes.filter(Boolean).join(", ")})`);if(a>b)throw new StageError(t.lanesLine!,`axis names its lanes left to right: axis: ${t.lanes[1]}..${t.lanes[0]}`);}
    let end=-1;const index=new Map<string,number>();
    if(t.bands.length){charge("band check",t.rows.length+1);t.rows.forEach((r,i)=>index.set(r.id,i));}
    const at=(id:string)=>index.get(id)??-1;
    charge("band check sort",t.bands.length*Math.max(1,Math.ceil(Math.log2(t.bands.length+1))));
    for(const band of [...t.bands].sort((x,y)=>at(x.first)-at(y.first))){
      charge("band check");const a=at(band.first),b=at(band.last);
      if(a<0||b<0)throw new StageError(band.line,`"${a<0?band.first:band.last}" is not a row of this time block (${t.rows.map(r=>r.id).join(", ")})`);
      if(a>b)throw new StageError(band.line,`a band names its rows top to bottom: ${band.last}..${band.first}`);
      if(a<=end)throw new StageError(band.line,"bands do not overlap: each row is in one band at most");
      end=b;
    }
  },
  op(t: Time, op, ctx) {
    charge("operation", op.arg.length + 1, op.arg.length); flat(op.body);
    const word=TIME_PARSE.get(op.word);
    if(!word||!TIME_OPS.includes(word))throw new StageError(op.line,"a time operation is "+TIME_OPS.map(key=>TIME_WORDS[key]).join(", "));
    op={...op,word};
    if(word==="hush"&&op.arg.includes(",")){
      const items=parts(op.arg,",");charge("hush items",items.length);let mine=0;
      for(const item of items){const r=(this as StageBlock<Time>).op!(t,{...op,arg:item},ctx);if(r!==false)mine++;else if(mine)throw new StageError(op.line,`"${item}" is not on this time axis; prefix it with its axis name`);}
      return mine?undefined:false;
    }
    const hushSpan=word==="hush"&&op.arg.startsWith("span ");
    if(word==="hush"){if(!op.arg.startsWith("at ")&&!hushSpan||op.keep)throw new StageError(op.line,"write hush at [axis name] <kept marker value> (its label) or hush span [axis name] <row> a..b (its words), several with commas, to hide them from this step");op={...op,arg:op.arg.slice(hushSpan?5:3)};}
    if(word==="show"){
      const target=scopes.get(ctx)?.names.get(op.arg.trim());if(!target)return false;
      target.from=target.shown?Math.min(target.from,op.step):op.step;target.shown=true;return;
    }
    let c = colon(op.arg) ?? [op.arg, ""];
    const scope=scopes.get(ctx),words=c[0].split(" "),named=scope?.names.get(words[0]);
    const rowDot=op.word==="dot"&&!Number.isFinite(num(named?words[1]||"":words[0]));
    const rowOp=op.word==="span"||op.word==="arrow"||op.word==="tag"||op.word==="fill"||op.word==="off"||rowDot;
    const explicit=named&&((op.word==="fill"||op.word==="off")?words.length>1:(!rowOp||op.word==="arrow"?words[1]!=="->":!words[1]?.includes("..")));
    if(explicit){t=named!;c=[words.slice(1).join(" "),c[1]];}
    else if(rowOp){
      const id=op.word==="arrow"?words[2]:words[0],owner=scope?.rows.get(id);
      if(owner===null)throw new StageError(op.line,"this row id belongs to several time axes; prefix the operation with its axis name");
      if(owner)t=owner;
    }
    if(rowDot){
      const [id,raw,...styles]=c[0].split(" "),row=t.rows.find(r=>r.id===id);if(!row)return false;
      const range=raw?span(raw):null,at=raw?num(raw):NaN,domain=row.inset?t.zoom!:t;
      if(c[1]||styles.length!==1||!(range?range[0]>=domain.a&&range[1]<=domain.b:within(at,domain)))throw new StageError(op.line,"dot <row> <interval start or a..b> takes exactly one tone or (declared role), inside its axis");
      const tone=markPaint(styles[0],ctx.roles,op.line);
      if(!row.segs.some(s=>{charge("dot tone selection");return s.dot&&(range?s.a>=range[0]&&s.a<=range[1]:s.a===at);}))throw new StageError(op.line,"dot selects at least one declared dot interval start in that row");
      t.dotPaints.push({row:id,step:op.step,keep:!!op.keep,off:false,tone,...(range?{range}:{at})});return;
    }
    if(op.word==="fill"||op.word==="off"){
      const [id,raw,...extra]=c[0].split(" "),row=t.rows.find(r=>r.id===id);if(!row)return false;
      const range=raw?span(raw):undefined,domain=row.inset?t.zoom!:t;
      if(c[1]||extra.length||op.word==="off"&&(op.keep||raw)||!row.segs.some(s=>s.dot)||raw&&(!range||range[0]<domain.a||range[1]>domain.b))throw new StageError(op.line,"fill <row> [a..b] needs a row with dots and an increasing range inside its axis; keep fill holds it; off <row> clears all fills");
      if(range&&!row.segs.some(s=>{charge("fill range data");const lo=Math.max(domain.a,s.a),hi=Math.min(domain.b,s.b),value=(lo+hi)/2;return s.dot&&hi>lo&&value>=range[0]&&value<=range[1];}))throw new StageError(op.line,"a fill range contains at least one declared dot datum");
      t.dotPaints.push({row:row.id,step:op.step,keep:!!op.keep,off:op.word==="off",...(range?{range}:{})});return;
    }
    if(op.word==="tag"){
      const [id,raw,...extra]=c[0].split(" "),row=t.rows.find(r=>r.id===id);if(!row)return false;
      const range=raw?span(raw):null,domain=row.inset?t.zoom!:t;
      if(extra.length||!range||!c[1]||op.keep||range[0]<domain.a||range[1]>domain.b)throw new StageError(op.line,"a row tag is: tag <row> a..b: words (inside the row's intervals)");
      charge("tag coverage sort",row.segs.length*Math.max(1,Math.ceil(Math.log2(row.segs.length+1))));let end=range[0];
      const covers=[...row.segs,...t.marks.filter(m=>m.kind==="span"&&m.row===id&&m.step===op.step)]; // a span written before it in this step covers it too
      for(const seg of covers.sort((a,b)=>a.a-b.a)){charge("tag coverage");if(seg.a>end)break;end=Math.max(end,seg.b);if(end>=range[1])break;}
      if(end<range[1])throw new StageError(op.line,"a tag range stays inside the row's declared intervals, or a span written before it in this step");
      const same=t.tags.find(tag=>tag.row===id&&tag.a===range[0]&&tag.b===range[1]&&tag.text===c[1]);if(same)same.step=Math.min(same.step,op.step);else t.tags.push({row:id,a:range[0],b:range[1],text:c[1],step:op.step});return;
    }
    if(op.word==="hush"&&hushSpan){
      const [id,raw,...extra]=c[0].split(" "),owner=explicit?t:scope?.rows.get(id),range=raw?span(raw):null;
      if(owner===null)throw new StageError(op.line,"this row id belongs to several time axes; prefix the span with its axis name");
      if(!owner||!owner.rows.some(r=>r.id===id)){if(op.shared&&!explicit)return false;throw new StageError(op.line,`hush span names a row of the time block and a range: hush span ${id||"row"} 4..31`);}
      t=owner;
      if(c[1]||extra.length||!range)throw new StageError(op.line,"hush span is: hush span <row> a..b (the range of a kept span with words)");
      const marks=t.marks.filter(m=>{charge("hush spans");return m.kind==="span"&&m.row===id&&m.a===range[0]&&m.b===range[1]&&!!m.text&&(!m.step||m.persist)&&m.step<=op.step&&m.labelTo===undefined;});
      if(!marks.length)throw new StageError(op.line,`hush span names a kept span with words on row ${id}, written before this step, with its exact range`);
      for(const m of marks)m.labelTo=op.step-1;t.hushes.push({step:op.step,at:NaN,span:`${t.rows.find(r=>r.id===id)?.label||id} ${fmt(range[0])} to ${fmt(range[1])}`});return;
    }
    if(op.word==="hush"){
      const v=num(c[0]);if(c[1]||!within(v,t)) {if(op.shared&&!explicit)return false;throw new StageError(op.line,"hush at names a kept marker on this time axis");}
      const marks=t.marks.filter(m=>m.kind==="at"&&m.a===v&&m.text&&(!m.step||m.persist)&&m.step<=op.step&&m.labelTo===undefined);
      if(!marks.length){if(op.shared&&!explicit)return false;throw new StageError(op.line,"hush at names an existing labelled setup or kept marker");}
      for(const m of marks)m.labelTo=op.step-1;t.hushes.push({step:op.step,at:v});return;
    }
    if (op.word === "arrow") {
      const [from, arrow, to, at, raw,...flags] = c[0].split(" "), v = num(raw || ""),dashFlag=`[${TIME_STYLES.idle}]`,tones=flags.filter(flag=>flag!==dashFlag);
      if (tones.length>1||flags.filter(flag=>flag===dashFlag).length>1||tones.some(flag=>!flag.startsWith("[")||!flag.endsWith("]")||!["plain","acc","good","bad","warn"].includes(STYLE_PARSE.get(flag.slice(1,-1))||"")) || arrow !== "->" || at !== "at" || from === to || !within(v,t) || !t.rows.some(r=>r.id===to) || from!=="above"&&!t.rows.some(r=>r.id===from)) throw new StageError(op.line,"a cell arrow is: arrow <row|above> -> <row> at <time> [dashed] [plain|accent|good|bad|warn]: label; use at most one tone");
      t.arrows.push({from,to,at:v,text:c[1],step:op.step,dash:flags.includes(dashFlag),...(tones.length?{tone:markPaint(tones[0],ctx.roles,op.line)}:{})});return;
    }
    if (op.word === "at" || op.word === "dot") {
      const tokens = c[0].split(" "), v = num(tokens[0]),style=tokens.slice(1).filter(s=>s!==MARKER_FLAGS.guide&&s!==MARKER_FLAGS.solid&&(op.word==="dot"||s!==MARKER_FLAGS.below&&s!==MARKER_FLAGS.caption&&s!==MARKER_FLAGS.beside&&s!==MARKER_FLAGS.tick));
      if(op.shared&&!Number.isFinite(v))return false;
      if(tokens.includes(MARKER_FLAGS.caption)&&!c[1])throw new StageError(op.line,"[caption] needs words after the colon");
      if(tokens.includes(MARKER_FLAGS.beside)&&(tokens.includes(MARKER_FLAGS.below)||tokens.includes(MARKER_FLAGS.caption)))throw new StageError(op.line,"[beside] puts the words beside the line at the rows' top; do not combine it with [below] or [caption]");
      if(tokens.includes(MARKER_FLAGS.caption)&&tokens.includes(MARKER_FLAGS.below))throw new StageError(op.line,"[caption] puts the words in the step caption; do not combine it with [below]");
      if (style.length > 1 || !within(v, t)) { ctx.problem(op.line, `at names a point on the axis, ${t.a} to ${t.b}: at 31: build done`); return; }
      t.marks.push({ step: op.step, kind: op.word === "dot" ? "dot" : "at", a: v, b: v, text: c[1], tone: markPaint(style[0], ctx.roles, op.line), persist: !!op.keep, edge:!tokens.includes(MARKER_FLAGS.guide),solid:tokens.includes(MARKER_FLAGS.solid),tick:tokens.includes(MARKER_FLAGS.tick),below:tokens.includes(MARKER_FLAGS.below),caption:tokens.includes(MARKER_FLAGS.caption),beside:tokens.includes(MARKER_FLAGS.beside) });if(tokens.includes(MARKER_FLAGS.caption))ctx.caption?.(op.step,c[1],!!op.keep); return;
    }
    const tokens = c[0].split(" "), id = tokens[0], r = tokens[1], style = tokens.slice(2).filter(x=>x!=="[line]"&&x!=="[bar]"), colour = style[0], extra = style[1], s = r ? span(r) : null;
    if (id!=="axis"&&!t.rows.some((x) => x.id === id)) { if(op.shared)return false;ctx.problem(op.line, `"${id}" is not a row of the time block (${t.rows.map((x) => x.id).join(", ")}; or axis)`); return; }
    const domain=t.rows.find(r=>r.id===id)?.inset?t.zoom!:t;
    if (extra || !s || s[0] < domain.a || s[1] > domain.b) { ctx.problem(op.line, `span names a row and a range on the axis: span ${id} 4..31: text`); return; }
    if (tokens.includes("[bar]") && (id === "axis" || tokens.includes("[line]"))) { ctx.problem(op.line, "[bar] draws a row's span as a filled bar: use it on a row, without [line]"); return; }
    t.marks.push({ step: op.step, kind: "span", row: id, a: s[0], b: s[1], text: c[1], tone: tokens.includes("[bar]")&&!colour?undefined:markPaint(colour, ctx.roles, op.line), persist: !!op.keep, line: tokens.includes("[line]"), bar: tokens.includes("[bar]") });
  },
  layout(t: Time, box: Box): LayoutOut {
    charge("layout", t.rows.length + t.points.length + t.marks.length + t.arrows.length + 1);
    const wrap=(s:string,w:number,f:Parameters<typeof wrapText>[2],max=4)=>{
      if(!box.narrow)return wrapText(s,w,f,max);
      charge("phone words",s.length+1,s.length);
      const out:string[]=[];let line="";
      for(const word of s.split(/\s+/).filter(Boolean)){
        if(measure(word,f)<=w){const next=line?line+" "+word:word;if(line&&measure(next,f)>w){out.push(line);line=word;}else line=next;continue;}
        if(line){out.push(line);line="";}
        for(const part of word.match(/[^-./_:]+[-./_:]?|[-./_:]/g)||[word]){if(line&&measure(line+part,f)>w){out.push(line);line="";}line+=part;}
      }
      if(line)out.push(line);return out.length?out:[""];
    };
    const widest=(s:string)=>Math.max(0,...(s.match(/[^\s-./_:]+[-./_:]?|[-./_:]/g)||[]).map(s=>measure(s,"sub")));
    const captionWidth=(lines:string[])=>Math.max(0,...lines.map(s=>measure(s,"sub")))*(box.narrow?1.12:1)+(box.narrow?1:0);
    let besideFail:Mark[]=[]; // [beside] labels that found row words in their place go back to the shelf (second run)
    const panel = (a: Axis, w: number, inset: boolean, suffix = "", shelved=new Set<Mark>()): LayoutOut => {
      const items: Item[] = [], under: Item[] = [], markerStrokes:Item[]=[], prefix = t.key+(inset?"-inset":"")+suffix, pad = 8, RM = box.narrow ? 8 : 18;
      const onlyInset=inset&&t.rows.some(r=>r.inset),rows=t.rows.filter(r=>onlyInset?!!r.inset:!r.inset),values=onlyInset?undefined:t.values;
      const narrowRows=(box.narrow||t.labelsAbove)&&!t.labelsBeside&&!onlyInset;
      const panelMarks=t.marks.filter(m=>!onlyInset||m.kind==="span"&&rows.some(r=>r.id===m.row));
      const headerCells=!!t.headers&&!inset&&!t.rulerNone;
      const denseHeaders=headerCells&&!box.narrow&&!!t.cells&&Math.ceil((a.b-a.a)/t.cells)>=24;
      const compactHeaders=denseHeaders&&!t.window&&!t.zoom&&!values&&[...t.tickLabels.values()].every(s=>/^(?:…)?[-+]?\d+(?:\.\d+)?$/.test(s));
      const rulerEdges=!!t.window&&!t.rulerNone&&!headerCells;
      // The label column follows its words up to a cap: card grids allow 240 px on desktop; beside labels allow 40% on phones.
      const wideCardRows=!!t.roomy&&!!t.cells&&!box.narrow&&!narrowRows&&!onlyInset&&rows.some(r=>r.boxed||r.label.includes(" | ")||/^\([A-Za-z0-9]\) /.test(r.label));
      const headingWidth=(r:TRow)=>{const parts=r.label.split(" | "),badge=/^\([A-Za-z0-9]\) /.test(parts[0]);if(badge)parts[0]=parts[0].slice(4);return Math.max(0,...parts.map(s=>measure(s,"sub")*1.1))+(badge?44:16);};
      const labCap=wideCardRows?Math.min(240,w*.28):box.w<480&&!narrowRows?Math.max(110,w*.4):denseHeaders?150:110;
      const labW = onlyInset||narrowRows||!rows.some(r=>r.label)&&!values?(values?36:0):Math.min(labCap, Math.max(36, ...rows.map((r) => wideCardRows?headingWidth(r):measure(r.label, "sub") + 10)));
      const bandW=t.bands.length&&!narrowRows&&!onlyInset?Math.min(120,Math.max(...t.bands.map(b=>{charge("band titles");return measure(b.title,"sub")+14;}))):0; // band titles beside their regions
      const afterW=Math.min(w*.4,Math.max(0,...rows.flatMap(r=>r.segs.filter(s=>s.after&&s.name).map(s=>measure(s.name,"sub")+12))));
      // Roomy phone grids borrow eight pixels of the stage's 14-pixel margin on each side.
      const roomyPhone=box.narrow&&t.roomy&&!inset,cellGap=(cw:number)=>t.apart?Math.min(8,cw*.12):Math.min(t.roomy?(roomyPhone?4:8):1.5,cw*.25);
      // "axis: A..B": 0 under lane A's left edge, the end under lane B's right edge; row labels stay at its left
      const laneA=!inset&&!box.narrow&&w===box.w&&t.lanes?box.lanes?.find(l=>l.title===t.lanes![0]):undefined,laneB=laneA?box.lanes?.find(l=>l.title===t.lanes![1]):undefined;
      const x0 = laneA&&laneB?Math.max(labW+bandW+8,laneA.x):labW + bandW + (roomyPhone?-8:8), x1 = laneA&&laneB?Math.min(w-afterW,Math.max(x0+40,laneB.x+laneB.w)):w + (roomyPhone?8:-RM) - afterW, X = (v: number) => x0 + (v - a.a) / (a.b - a.a) * (x1 - x0);
      /** with "apart" a tick names the cell that starts at it, so its label is centred above that cell */
      const labelX=(v:number,a:Axis)=>t.apart&&t.cells&&v<a.b?X((v+Math.min(a.b,v+t.cells))/2):X(v);
      /** on a phone a cell's word that does not fit level stands on end inside its cell (as numbers do), no footnote, when it is short (24 px; 54 in "apart" cells) */
      // once a row staggers, every plain word in it takes a stagger line sized for the widest, so a long word never runs into a short level one
      const staggerable=(label:string,cw:number,seg:{wide?:boolean;numbered?:boolean;after?:boolean;dot?:boolean})=>box.narrow&&!!t.cells&&!!label&&!seg.wide&&!seg.numbered&&!seg.after&&!seg.dot&&!/^[-+]?\d+(?:\.\d+)?$/.test(label)&&Math.ceil((measure(label,"chip")*1.2+4)/cw)<=3;
      const staggerLines=(label:string,cw:number,seg?:{wide?:boolean;numbered?:boolean;after?:boolean;dot?:boolean;a?:number;b?:number})=>{if(!box.narrow||!t.cells||!label||seg?.wide||seg?.numbered||seg?.after||seg?.dot||/^[-+]?\d+(?:\.\d+)?$/.test(label)||widest(label)<=cellWordRoom(cw)||onEnd(label,cw,seg))return 1;const k=Math.ceil((measure(label,"chip")*1.2+4)/cw);return k<=3?Math.max(2,k):1;};
      const onEnd=(label:string,cw:number,seg?:{wide?:boolean;numbered?:boolean;after?:boolean;dot?:boolean})=>box.narrow&&!!t.cells&&!!label&&!seg?.wide&&!seg?.numbered&&!seg?.after&&!seg?.dot&&widest(label)>cellWordRoom(cw)&&fontSize("chip")*.8+2<=cw-cellGap(cw)&&measure(label,"chip")<=(t.apart?54:24);
      const turnNumber=(s:string,cw:number)=>box.narrow&&box.w<480&&/^[-+]?\d+(?:\.\d+)?$/.test(s)&&measure(s,"chip")+1>cw-cellGap(cw);
      const wordRoom=(cw:number)=>Math.max(8,cw-(box.narrow?cellGap(cw)+2:6));
      const cellWordRoom=(cw:number)=>box.narrow?wordRoom(cw)/1.12:wordRoom(cw);
      const cellFont=(label:string,cw:number)=>t.roomy&&/^[×x]\d+$/.test(label)&&measure(label,"big")<=wordRoom(cw)?"big" as const:"sub" as const;
      const numberBands=(cw:number)=>cw<fontSize("chip")*.74?2:1;
      const numberWord=(v:number)=>fmt(v);
      const axisId = `${prefix}-x`, label = inset ? (a.unit || "Zoom") + ` (${fmt(a.a)}..${fmt(a.b)})` : a.unit;
      const revealRuler=!!t.roomy&&!inset&&!t.rulerNone;
      const rulerSpans=rows.flatMap(r=>r.segs.map(s=>{charge("ruler reveal");return {from:s.from,to:0,w:Math.max(0,X(Math.min(a.b,s.b))-x0)};}));
      const dotPaintRanges=(id:string,value:number,start:number,from:number,to:number)=>{
        const ranges:{a:number;b:number;tone?:string}[]=[];
        for(const change of t.dotPaints){
          charge("dot paint changes");if(change.row!==id)continue;
          if(change.off){for(const range of ranges){charge("dot paint reset");range.b=Math.min(range.b,change.step-1);}continue;}
          const selected=change.tone?change.range?start>=change.range[0]&&start<=change.range[1]:start===change.at:!change.range||value>=change.range[0]&&value<=change.range[1];
          if(selected)ranges.push({a:change.step,b:change.keep?box.steps:change.step,...(change.tone?{tone:change.tone}:{})});
        }
        const boundaries=[...new Set([from,to+1,...ranges.flatMap(r=>[Math.max(from,r.a),Math.min(to+1,r.b+1)])])].filter(v=>v>=from&&v<=to+1);
        charge("dot paint sort",boundaries.length*Math.max(1,Math.ceil(Math.log2(boundaries.length+1))));boundaries.sort((a,b)=>a-b);
        const out:{a:number;b:number;solid:boolean;tone?:string}[]=[];
        for(let i=0;i<boundaries.length-1;i++){
          const a=boundaries[i],b=boundaries[i+1]-1;let solid=false,tone:string|undefined;
          for(const r of ranges){charge("dot paint state");if(a>=r.a&&a<=r.b){if(r.tone)tone=r.tone;else solid=true;}}
          const last=out.at(-1);if(last&&last.b+1===a&&last.solid===solid&&last.tone===tone)last.b=b;else out.push({a,b,solid,...(tone?{tone}:{})});
        }
        return out;
      };
      const captionMask=(x:number,y:number,text:string,fill:string):Item=>{const left=Math.max(0,x-3),right=Math.min(w,x+measure(text,"sub")*1.2+3);return {k:"box",x:left,y:y-fontSize("sub"),w:Math.max(0,right-left),h:fontSize("sub")+3,fill,stroke:"none",r:0,cls:"stg-time-caption-mask",bar:{ignore:1}};};
      const backedWord=(word:Extract<Item,{k:"text"}>,fill:string)=>{
        const width=measure(word.s,word.f)*1.2,size=fontSize(word.f);
        const left=word.rotate===90?word.x-size-1:word.x-(word.anchor==="middle"?width/2:word.anchor==="end"?width:0)-1;
        const right=word.rotate===90?word.x+2:left+width+2;
        const crossed=panelMarks.some(m=>{charge("cell word marker crossings");return m.kind==="at"&&!m.tick&&within(m.a,a)&&(!m.step||m.step<=(word.to||box.steps)&&(m.persist||m.step>=(word.from||1)))&&X(m.a)>=left&&X(m.a)<=right;});
        if(crossed)items.push({k:"box",x:left,y:word.rotate===90?word.y-width/2-1:word.y-size,w:right-left,h:word.rotate===90?width+2:size+3,fill,stroke:"none",r:0,cls:"stg-time-word-mask",bar:{ignore:1},from:word.from,to:word.to});
        items.push(word);
      };
      const rowId=(id:string)=>t.key==="time"?id:`${t.key}:${id}`;
      const arrowLabels=new Map(t.arrows.map(e=>{
        charge("arrow labels");
        // a callout may reach past the revealed cells while it stays inside the stage (the originals do)
        const bounds=[x1];
        const right=Math.min(x1,Math.max(x0,...bounds)),x=X(e.at),rightRoom=right-x-14,preferRight=rightRoom>=Math.max(30,box.narrow?widest(e.text):0),across=box.narrow&&widest(e.text)>Math.max(rightRoom,x-x0-14);
        let lines=wrap(e.text,e.from==="above"||across?Math.max(30,right-x0):preferRight?rightRoom:Math.max(30,x-x0-14),"sub",Infinity),width=Math.max(...lines.map(s=>measure(s,"sub")),0);
        let tx=e.from==="above"?(width<=rightRoom?x+12:width<=x-x0-14?x-width-12:Math.max(x0,Math.min(x+12,right-width))):across?Math.max(x0,Math.min(x+12,right-width)):preferRight?x+12:Math.max(x0,x-width-12);
        if(t.roomy&&e.from!=="above"){
          const edges=rows.filter(r=>r.id===e.from||r.id===e.to).map(r=>Math.min(x1,Math.max(x0,...r.segs.filter(s=>{charge("arrow frame bounds");return s.from<=e.step&&(!s.to||s.to>=e.step);}).map(s=>X(Math.min(a.b,s.b))+4))));
          // Callout words use the reserved stage space; row measurement frames describe the cells themselves.
          if(edges.some(edge=>tx<edge&&tx+width>edge)){
            if(!(tx>=x+12&&width*1.2<=rightRoom&&(!box.narrow||measure(e.text,"sub")*1.2<=rightRoom))){
              const end=Math.min(x-12,...edges.map(edge=>edge-6));lines=wrap(e.text,Math.max(30,end-x0),"sub",Infinity);width=Math.max(...lines.map(s=>measure(s,"sub")),0);tx=Math.max(x0,end-width);
            }
          }
        }
        return [e,{lines,x:tx,right:tx+width+6}] as const;
      }));
      // the gap under each row: an arrow's words sit between its two rows, so each gap reserves the tallest label any step
      // draws in it (an arrow over several rows reserves it in every gap it crosses), the same on every step
      const minArrowRoom=box.narrow?24:36,gapRoom=rows.map(()=>0);
      for(const e of t.arrows){
        charge("arrow gaps");if(e.from==="above")continue;
        const i=rows.findIndex(r=>r.id===e.from),j=rows.findIndex(r=>r.id===e.to);if(i<0||j<0)continue;
        for(let g=Math.min(i,j);g<Math.max(i,j);g++)gapRoom[g]=Math.max(gapRoom[g],minArrowRoom,arrowLabels.get(e)!.lines.length*18+8);
      }
      const evenGap=wideCardRows?Math.max(8,...gapRoom):0;
      let sharedRowH=0;
      if(wideCardRows)for(const r of rows){
        charge("roomy row pitch");const parts=r.label.split(" | "),badge=/^\([A-Za-z0-9]\) /.test(parts[0]);if(badge)parts[0]=parts[0].slice(4);
        const labelH=parts.reduce((h,s)=>h+wrap(s,labW-(badge?44:16),"sub",Infinity).length*18,0);let h=Math.max(56,labelH+8);
        for(const s of r.segs){charge("roomy row pitch words",s.name.length+1);if(s.after)continue;const cw=(x1-x0)*(s.wide?s.b-s.a:t.cells!)/(a.b-a.a),labels=s.numbered?[numberWord(s.a),numberWord(Math.max(s.a,s.b-t.cells!))]:[s.name];for(const label of labels){const f=cellFont(label,cw);h=Math.max(h,wrap(label,wordRoom(cw),f,Infinity).length*(f==="big"?28:18)+6);}}
        if(r.segs.some(s=>s.tone==="bad"))h+=4;sharedRowH=Math.max(sharedRowH,h);
      }
      const aboveRoom=wideCardRows?0:Math.max(20,...t.arrows.filter(e=>e.from==="above").map(e=>arrowLabels.get(e)!.lines.length*18+2));
      let y = 0;
      if(inset&&t.zoomBracket&&a.unit){
        // the inset's caption bracket: its words, then a bracket over the inset's whole range; one stable time-bar, no marker edge
        const lines=wrap(a.unit,Math.max(40,x1-x0),"sub",Infinity),bw=Math.max(...lines.map(s=>measure(s,"sub"))),bx=Math.max(x0,Math.min(x1-bw,(x0+x1-bw)/2));
        lines.forEach((s,i)=>items.push({k:"text",x:bx,y:y+12+i*18,s,f:"sub",ink:"ink-2"}));
        y+=lines.length*18+4;
        items.push({k:"path",pts:[[x0,y+7],[x0,y+1],[x1,y+1],[x1,y+7]],curve:"round",ink:"line-2",w:2,id:`${prefix}:bracket`,bar:{ignore:1}});
        y+=12;
      }
      else if(label)for (const s of wrap(label, t.rulerBelow?x1-x0:w-pad*2, "sub", Infinity)) { items.push({ k: "text", x: t.rulerBelow?x0:pad, y: y + 12, s, f: "sub", ink: "muted" }); y += compactHeaders?14:18; }
      const unitHeight=y,unitEnd=items.length;
      // A desktop card grid's incoming arrow is a short input stub above the tick labels.
      // It shares the unit-caption line when their words fit beside each other; all steps reserve that same band.
      const aboveInputs=new Map<Arrow,number>();
      if(wideCardRows)for(const e of t.arrows){
        charge("above input band");if(e.from!=="above")continue;const slot=arrowLabels.get(e)!,last=items.filter((i):i is Extract<Item,{k:"text"}>=>i.k==="text"&&i.y===unitHeight-6),captionRight=Math.max(0,...last.map(i=>i.x+measure(i.s,i.f)*1.1));
        const baseline=unitHeight&&slot.x>=captionRight+12?unitHeight-6:y+12;aboveInputs.set(e,baseline);y=Math.max(y,baseline+(slot.lines.length-1)*18+6);
      }
      const above = new Map<Mark, { y: number; lines: string[]; right?: boolean; gap?: number; reach?: boolean }>();
      const headings=panelMarks.filter(m=>{charge("marker headings");return m.kind==="at"&&!!m.text&&!m.caption&&!m.below&&!m.beside&&(m.persist||!m.step)&&within(m.a,a);});
      let headingY=y,headingH=0,headingRight=-Infinity;
      for(const m of headings){
        const right=X(m.a)>(x0+x1)/2,paired=headings.length>1,room=paired?Math.max(24,right?X(m.a)-8:w-RM-X(m.a)):w-16;
        const lines=wrap(m.text,room,"sub",Infinity),width=Math.max(...lines.map(s=>measure(s,"sub"))),left=Math.max(8,Math.min(w-RM-width,X(m.a)-(paired?(right?width:0):width/2)));
        if(headingH&&left<headingRight+8){headingY+=headingH+4;headingH=0;headingRight=-Infinity;}
        above.set(m,{y:headingY,lines,right:paired?right:undefined});headingH=Math.max(headingH,lines.length*18);headingRight=left+width;
      }
      if(headingH)y=headingY+headingH+4;
      if(t.rulerBelow&&unitHeight){for(const it of items.slice(0,unitEnd))if(it.k==="text")it.y+=y-unitHeight;for(const heading of above.values())heading.y-=unitHeight;}
      // a [beside] label sent back to the shelf has its own shelf under the block's caption, beside its line
      {let sy=y,sh=0,sr=-Infinity;const placed:{m:Mark;x:number;y:number}[]=[];
        for(const m of panelMarks){
          charge("beside shelf");if(m.kind!=="at"||!m.beside||!m.text||!shelved.has(m)||!within(m.a,a))continue;
          const right=X(m.a)>(x0+x1)/2,room=Math.max(24,right?X(m.a)-14:w-14-X(m.a)),lines=wrap(m.text,room,"sub",Infinity),width=Math.max(...lines.map(s=>measure(s,"sub"))),left=right?X(m.a)-6-width:X(m.a)+6;
          if(sh&&left<sr+8){sy+=sh+4;sh=0;sr=-Infinity;}
          // its line runs up beside its words (the originals); an earlier shelf's line would cross these words, so that one stops at the rows
          for(const o of placed){charge("beside shelf lines");if(o.y<sy&&o.x>=left-4&&o.x<=left+width+4)above.get(o.m)!.reach=false;}
          above.set(m,{y:sy,lines,right,gap:6,reach:true});placed.push({m,x:X(m.a),y:sy});sh=Math.max(sh,lines.length*18);sr=Math.max(left+width,X(m.a));
        }
        if(sh)y=sy+sh+4;}
      const headerValues=headerCells?cellHeaders(t):[];
      const headerLabels=new Map(headerValues.map(v=>[v,t.tickLabels.get(v)||fmt(t.ticks?v:t.a+Math.floor((v-t.a)/t.cells!)*t.cells!)]));
      // on a phone, header labels that fit neither level nor on end in their column stand level on up to 3 staggered rows
      const headerStagger=box.narrow&&headerValues.length>0&&fontSize("chip")*.8+2>(x1-x0)*(t.cells||1)/(a.b-a.a)&&Math.ceil((Math.max(...headerValues.map(v=>measure(headerLabels.get(v)!,"sub")*1.12))+5)/((x1-x0)*(t.cells||1)/(a.b-a.a)))<=3;
      const headerTurn=(v:number)=>!headerStagger&&turnNumber(headerLabels.get(v)!,X(Math.min(t.b,t.a+(Math.floor((v-t.a)/t.cells!)+1)*t.cells!))-X(t.a+Math.floor((v-t.a)/t.cells!)*t.cells!));
      const headerLines=new Map(headerValues.map(v=>{const start=t.a+Math.floor((v-t.a)/t.cells!)*t.cells!,end=Math.min(t.b,start+t.cells!);return [v,headerTurn(v)?[headerLabels.get(v)!]:wrap(headerLabels.get(v)!,Math.max(8,X(end)-X(start)-6),"sub",Infinity)] as const;}));
      const headerCaptions=new Map<number,{left:number;y:number}>();let headerCaptionH=0;
      if(box.narrow&&headerValues.some(v=>!headerTurn(v)&&widest(headerLabels.get(v)!)>(x1-x0)*t.cells!/(a.b-a.a)-6)){
        const shelves:{right:number;h:number;values:number[]}[]=[];
        for(const v of headerValues){
          const lines=headerLines.get(v)!,width=headerTurn(v)?fontSize("chip"):captionWidth(lines),left=Math.max(x0,Math.min(x1-width,X(v)-width/2));
          let shelf=shelves.find(s=>{charge("header caption shelves");return s.right+5<=left;});if(!shelf){shelf={right:-Infinity,h:0,values:[]};shelves.push(shelf);}
          shelf.right=left+width;shelf.h=Math.max(shelf.h,headerTurn(v)?Math.ceil(measure(headerLabels.get(v)!,"chip")):lines.length*18);shelf.values.push(v);headerCaptions.set(v,{left,y:0});
        }
        for(const shelf of shelves){for(const v of shelf.values)headerCaptions.get(v)!.y=headerCaptionH;headerCaptionH+=shelf.h+4;}
      }
      const headerH=headerCells?Math.max(compactHeaders?18:24,headerCaptionH+6,...headerValues.map(v=>headerTurn(v)?(Math.ceil(measure(headerLabels.get(v)!,"chip")))*numberBands((x1-x0)*t.cells!/(a.b-a.a)):compactHeaders&&headerLines.get(v)!.length===1?18:headerLines.get(v)!.length*18+6)):0;
      const tickValues=t.rulerNone?[]:headerCells?headerValues:ticks(a,x1-x0,inset?t.zoomTicks:t.ticks),tickSet=new Set(tickValues);
      const labelValues=inset?[...new Set([...tickValues,...(t.zoomLabels?.keys()||[])])].sort((a,b)=>a-b):tickValues;
      const tickLeading=box.narrow?14:18;
      /** a tick label's own reveal ("7 words @3"): its words only; the tick mark and the label's place stay from step 1 */
      const tickReveal=(v:number,from=1)=>{const r=(inset?t.zoomWhen:t.tickWhen)?.get(v),tone=(inset?t.zoomTone:t.tickTone)?.get(v);return {...(r?{from:Math.max(from,r.from),...(r.to?{to:r.to}:{})}:{}),...(tone?{ink:`${tone}:ink`}:{})};};
      const phoneLabels=new Map<number,{x:number;y:number;lines:string[];rotate:boolean;shelf:number}>();
      let phoneLabelH=0;
      if(box.narrow&&!headerCells){
        const shelves:{right:number;y:number;h:number}[]=[];
        const byX=labelValues; // ticks are written in increasing order (doccheck)
        for(const [i,v] of byX.entries()){
          const word=(inset?t.zoomLabels?.get(v):undefined)||t.tickLabels.get(v)||fmt(v),x=labelX(v,a),near=Math.min(i?x-X(byX[i-1]):Infinity,i+1<byX.length?X(byX[i+1])-x:Infinity),rotate=turnNumber(word,near);
          const lines=rotate?[word]:wrap(word,Math.min(x1-x0,Math.max(64,near-6)),"sub",Infinity),width=rotate?fontSize("chip")*.8:captionWidth(lines),height=rotate?Math.ceil(measure(word,"chip")):lines.length*tickLeading;
          // End labels may use the ruler margins; their ticks stay at the exact axis endpoints.
          let left=rotate?Math.max(0,Math.min(w-width,x-width/2)):Math.max(x0,Math.min(x1-width,x-width/2));
          if(t.window&&!onlyInset){if(v===t.window.a)left=Math.max(left,X(v)+4);if(v===t.window.b)left=Math.min(left,X(v)-width-4);}
          let shelf=shelves.find(s=>{charge("phone label shelves");return s.right+(rotate?1:5)<=left;});
          // a label that misses the first row by a little slides right, at most half its width, when it still clears the next label
          if(!shelf&&shelves.length&&!rotate){const s0=shelves[0],slid=s0.right+5,nv=byX[i+1],nw=nv===undefined?0:captionWidth([(inset?t.zoomLabels?.get(nv):undefined)||t.tickLabels.get(nv)||fmt(nv)]),nextLeft=nv===undefined?x1:labelX(nv,a)-nw/2;if(slid-left<=width/2&&slid+width+5<=nextLeft&&slid+width<=x1){left=slid;shelf=s0;}}
          if(!shelf){shelf={right:-Infinity,y:shelves.reduce((h,s)=>h+s.h+4,0),h:height};shelves.push(shelf);}
          shelf.right=left+width;shelf.h=Math.max(shelf.h,height);
          phoneLabels.set(v,{x:left,y:shelf.y,lines,rotate,shelf:shelves.indexOf(shelf)});
        }
        // Shelf heights are final before positions are assigned: later labels never move earlier ones between steps.
        for(let i=1;i<shelves.length;i++)shelves[i].y=shelves[i-1].y+shelves[i-1].h+4;
        for(const label of phoneLabels.values())label.y=shelves[label.shelf].y;
        phoneLabelH=shelves.reduce((h,s)=>h+s.h,0)+Math.max(0,shelves.length-1)*4;
      }
      const windowExtra=box.narrow?Math.max(0,phoneLabelH-18):0;
      const windowWords=t.window&&!onlyInset&&t.window.unit?wrap(t.window.unit,box.narrow?w-16:Math.max(8,X(Math.min(t.window.b,a.b))-X(Math.max(t.window.a,a.a))-12),"sub",box.narrow?Infinity:1):[];
      const windowTitleExtra=box.narrow&&windowWords.length?Math.max(0,windowWords.length-1)*18+6:0;
      const windowPadA=0; // a window's height: N lines adds its missing room under the ruler (the height below is known only once the rows are laid out)
      const top = windowPadA + y + (headerCells?Math.max(headerH+4,t.window&&!onlyInset?42:0):t.window&&!onlyInset ? 42+windowExtra+windowTitleExtra : t.rulerNone||t.rulerBelow?4:box.narrow?Math.max(22,phoneLabelH+6):28);
      const rulerStart=items.length;
      items.push({ k: "path", pts: [[x0, top], [x1, top]], ink: t.rulerNone||revealRuler||headerCells||t.apart?"none":"line-2", id: axisId, bar: { axis: axisId, min: a.a, max: a.b, ...(!revealRuler&&rulerEdges?{edge:axisId,from:axisId,to:axisId}: {}) } });
      if(revealRuler)for(const frame of revealedFrames({k:"box",x:x0,y:top,w:x1-x0,h:0,fill:"none",stroke:"none",id:axisId+":paint"},rulerSpans,0,box.steps))if(frame.k==="box")items.push({k:"path",pts:[[x0,top],[x0+frame.w,top]],ink:"line-2",from:frame.from,to:frame.to,id:frame.id,bar:rulerEdges?{edge:axisId,from:axisId,to:axisId}:undefined});
      let textRight = -Infinity;
      charge("ruler labels",labelValues.length*Math.max(1,Math.ceil(Math.log2(labelValues.length+1))));
      for (const v of t.rulerNone?[]:labelValues) {
        if(headerCells){
          const start=t.a+Math.floor((v-t.a)/t.cells!)*t.cells!,end=Math.min(t.b,start+t.cells!),left=X(start),width=X(end)-left,lines=headerLines.get(v)!;
          under.push({k:"box",x:left,y:top-headerH,w:width,h:headerH,fill:"surface-2",stroke:"line",r:0,id:`${prefix}:header:${v}`,bar:{kind:"band",label:t.tickLabels.get(v)||fmt(t.ticks?v:start),track:axisId,value:v}});
          const caption=headerCaptions.get(v);
          if(caption&&!headerTurn(v)){
            const tw=captionWidth(lines);items.push({k:"box",x:caption.left-1,y:top-headerH+caption.y+1,w:tw+2,h:lines.length*18,fill:"surface-2",stroke:"none",r:0,bar:{ignore:1},...tickReveal(v)});
            lines.forEach((s,i)=>items.push({k:"text",x:caption.left,y:top-headerH+caption.y+13+i*18,s,f:"sub",ink:"muted",...tickReveal(v)}));
          }else if(headerTurn(v)){const bands=numberBands(width),index=Math.floor((v-t.a)/t.cells!);items.push({k:"text",x:caption?caption.left+fontSize("chip")*.85:left+width/2+fontSize("chip")*.35,y:caption?top-headerH+caption.y+(Math.ceil(measure(headerLabels.get(v)!,"chip")))/2:top-headerH+headerH/bands*(index%bands+.5),s:headerLabels.get(v)!,f:"chip",ink:"muted",anchor:"middle",rotate:90,...tickReveal(v)});}
          else lines.forEach((s,i)=>items.push({k:"text",x:left+width/2,y:top-headerH+(compactHeaders?11:13)+i*18,s,f:"sub",ink:"muted",anchor:"middle",...tickReveal(v)}));continue;
        }
        const x = X(v), lx = labelX(v,a), s = wrap((inset?t.zoomLabels?.get(v):undefined)||t.tickLabels.get(v) || fmt(v), x1 - x0, "sub", 1)[0], tw = measure(s, "sub"), tx = Math.max(x0, Math.min(x1 - 9 - tw * 1.08, lx - tw / 2));
        const tickX=t.window&&!onlyInset?v===t.window.a?Math.max(tx,x+4):v===t.window.b?Math.min(tx,x-tw*1.2-4):tx:tx;
        const starts=revealRuler?rows.flatMap(r=>r.segs.filter(seg=>{charge("tick reveal");return v>=seg.a&&(v<seg.b||v===a.b&&v===seg.b);}).map(seg=>seg.from)):[1],from=starts.length?Math.min(...starts):box.steps+1;
        if(tickSet.has(v))items.push({ k: "path", pts: [[x, top - 5], [x, top + 4]], ink: t.apart?"none":"line-2",from, id: `${prefix}:tick:${v}`, bar: { track: axisId, value: v, ...(rulerEdges&&inset?{edge:`${prefix}:tick:${v}`,from:`${prefix}:tick:${v}`,to:`${prefix}:tick:${v}`}:{}) } });
        const phone=phoneLabels.get(v);
        if(phone){
          if(phone.rotate)items.push({k:"text",x:phone.x+fontSize("chip")*.75,y:top-6-phoneLabelH+phone.y+Math.ceil(measure(phone.lines[0],"chip"))/2,s:phone.lines[0],f:"chip",ink:"muted",anchor:"middle",rotate:90,from,...tickReveal(v,from),...(inset&&t.zoomLabels?.has(v)?{id:`${prefix}:label:${v}`}:{})});
          else phone.lines.forEach((s,i)=>items.push({k:"text",x:phone.x,y:top-6-phoneLabelH+phone.y+11+i*tickLeading,s,f:"sub",ink:"muted",from,...tickReveal(v,from),...(inset&&t.zoomLabels?.has(v)?{id:`${prefix}:label:${v}`}:{})}));
        }else if (tickX > textRight + 5) { items.push({ k: "text", x: tickX, y: top - 10, s, f: "sub", ink: "muted",from,...tickReveal(v,from),...(inset&&t.zoomLabels?.has(v)?{id:`${prefix}:label:${v}`}:{}) }); textRight = tickX + tw; }
      }
      const rulerItems=items.slice(rulerStart);
      let dotLabelH = 0;
      for (const m of panelMarks) if (m.kind==="dot" && within(m.a,a) && m.text) dotLabelH += wrap(m.text, w-16,"sub",Infinity).length*18;
      const spanSlots = new Map<Mark,{y:number;lines:string[]}>();
      const axisGroups=new Map<string,{owner:Mark;marks:Mark[];when?:When}>(),axisGroupOf=new Map<Mark,{owner:Mark;marks:Mark[];when?:When}>();
      let axisSpanH=0;const axisLanes:{y:number;h:number;spans:[number,number][]}[]=[]; // axis spans whose lines and one-line words never meet share a row
      for(const m of panelMarks){
        charge("axis span slots");if(m.kind!=="span"||m.row!=="axis"||m.b<a.a||m.a>a.b)continue;
        charge("axis span key",m.text.length+1);const key=JSON.stringify([m.a,m.b,m.text,m.tone||"acc",!!m.line]),previous=axisGroups.get(key);
        if(previous){previous.marks.push(m);axisGroupOf.set(m,previous);spanSlots.set(m,spanSlots.get(previous.owner)!);continue;}
        const group={owner:m,marks:[m]};axisGroups.set(key,group);axisGroupOf.set(m,group);
        const lines=wrap(m.text||`${fmt(m.a)}..${fmt(m.b)}`,w-16,"sub",Infinity),h=m.line?lines.length*18:lines.length*18+10;
        const tw=Math.max(...lines.map(s=>measure(s,"sub")))*1.2,lo=X(Math.max(a.a,m.a)),hi=X(Math.min(a.b,m.b)),occ:[number,number]=lines.length===1?[lo-10-tw,hi+10+tw]:[-Infinity,Infinity];
        let lane=axisLanes.find(l=>{charge("axis span rows",l.spans.length+1);return h<=l.h&&l.spans.every(([p,q])=>q+8<=occ[0]||occ[1]+8<=p);});
        if(!lane){lane={y:axisSpanH,h,spans:[]};axisLanes.push(lane);axisSpanH+=h;}
        lane.spans.push(occ);spanSlots.set(m,{y:top+14+lane.y,lines});
      }
      for(const group of axisGroups.values())group.when=spanVisibility(group.marks,box.steps,Math.max(t.from,inset?a.from||1:1),inset?a.to||box.steps:box.steps);
      y = top + (t.rulerBelow?6:narrowRows||t.rulerNone||compactHeaders?4:12) + (t.rulerBelow?0:axisSpanH+dotLabelH) + (t.arrows.some(e=>e.from==="above")?aboveRoom:0);
      if (!inset && t.zoom && !t.zoomBracket) items.push({ k: "box", x: X(Math.max(a.a,t.zoom.a)), y: top - 3, /* an inset that carries its own bracket names its range; no range box on the main axis */ w: X(Math.min(a.b,t.zoom.b)) - X(Math.max(a.a,t.zoom.a)), h: 8, fill: "acc:soft", stroke: "acc:line", r: 0, id: "time-zoom-window",bar:{ignore:1},from:t.zoom.from,to:t.zoom.to });
      // a tag on the same row and range as a [bar] span of its step is drawn as the chip at that bar's left end
      const chipOf=new Map<Mark,TimeTag>(),paired=new Set<TimeTag>(),barsByKey=new Map<string,Mark[]>();
      const compactBars=new Map<Mark,{chipY:number;barY:number;textY?:number}>(); // a row's chips on one line, its bars thin under it
      for(const m of panelMarks){charge("bar keys");if(m.kind==="span"&&m.bar&&m.row!=="axis"){const key=m.row+"|"+m.a+"|"+m.b,list=barsByKey.get(key)||[];list.push(m);barsByKey.set(key,list);}}
      for(const tag of t.tags){charge("bar chips");const m=(barsByKey.get(tag.row+"|"+tag.a+"|"+tag.b)||[]).find(m=>!chipOf.has(m)&&(m.step===tag.step||!!m.persist&&m.step<=tag.step));if(m){chipOf.set(m,tag);paired.add(tag);}}
      const barPlan=(m:Mark)=>{
        const tag=chipOf.get(m),chipLines=tag?wrap(tag.text,Math.max(8,(x1-x0-18)/1.2),"chip",Infinity):[],chipW=tag?Math.min(x1-x0,Math.max(...chipLines.map(s=>measure(s,"chip")))*1.2+18):0,chipH=tag?chipLines.length*14+2:0;
        const lo=X(Math.max(a.a,m.a)),hi=X(Math.min(a.b,m.b)),chipX=tag?Math.max(x0,Math.min(x1-chipW,lo-chipW/2)):lo,lineH=Math.max(12,chipH)+3; // about 19 px a bar, as the original
        const tw=m.text?measure(m.text,"sub")*1.1:0,side=!m.text?"none":hi+8+tw<=x1?"right":Math.min(lo,chipX)-8-tw>=x0?"left":"below";
        const lines=side==="below"?wrap(m.text,x1-x0,"sub",Infinity):m.text?[m.text]:[];
        return {tag,chipLines,chipW,chipH,chipX,lo,hi,lineH,side,lines,h:lineH+(side==="below"?lines.length*18:0)};
      };
      const bandStart=new Map(t.bands.map(b=>[b.first,b])),bandStop=new Map(t.bands.map(b=>[b.last,b])),inBand=new Set<string>(),bandPaint=new Map<string,string>(),bandItems:Item[]=[];
      {let open:Band|undefined;for(const r of rows){charge("band rows");open??=bandStart.get(r.id);if(open){inBand.add(r.id);bandPaint.set(r.id,`role:${open.role}:soft`);}if(open&&r.id===open.last)open=undefined;}} // one pass: bands never overlap (check)
      let bandTop=0;
      const rowYs = new Map<string, number>();
      let lastSpans:{start:number;end:number;marks:Mark[]}|undefined; // the last row's span slots, for an apart grid's marker words
      const rowRects = new Map<string,{top:number;bottom:number;headingTop:number;captionBottom:number}>();
      const rowsTop=y,frameLeft=t.rulerBelow&&!t.roomy?x0:roomyPhone?-8:0,frameWidth=t.rulerBelow&&!t.roomy?x1-x0:roomyPhone?w+20:w;
      const laneSpans:{from:number;to:number;w:number}[]=[];let laneMin=8;const rowsStart=items.length;
      for (const r of rows) {
        const opens=bandStart.get(r.id);
        let bandTitleH=0;
        if(opens&&bandW){bandTop=y;y+=4;const lines=wrap(opens.title,bandW-10,"sub",Infinity);lines.forEach((s,i)=>bandItems.push({k:"text",x:6,y:y+12+i*18,s,f:"sub",ink:`role:${opens.role}:ink`}));bandTitleH=lines.length*18+8;}
        else if(opens){bandTop=y;y+=4;for(const s of wrap(opens.title,frameWidth-16,"sub",Infinity)){bandItems.push({k:"text",x:frameLeft+8,y:y+12,s,f:"sub",ink:`role:${opens.role}:ink`});y+=18;}y+=2;}
        charge("row layout"); rowYs.set(r.id, y);
        const rowTop=y;
        if(onlyInset&&!r.chip&&r.label&&r.label!=="_")for(const s of wrap(r.label,w-16,"sub",Infinity)){items.push({k:"text",x:8,y:y+12,s,f:"sub",ink:"ink"});y+=18;}
        const cardParts = r.label.split(" | "), title = cardParts[0], badge = onlyInset?null:/^\(([A-Za-z0-9])\) /.exec(title);
        const card = !onlyInset&&!narrowRows&&(r.boxed || r.chip || cardParts.length>1 || !!badge), labelText = badge ? title.slice(4) : title;
        const headingFill=badge||t.roomy||r.boxed||r.chip||cardParts.length>1?`role:${r.role}:soft`:bandPaint.get(r.id)||"surface";
        const labelId=`${prefix}:row-label:${r.id}`,labelBar=r.chip?{kind:"chip",id:labelId,label:r.label,role:r.role}:{ignore:1};
        const labelWord=(word:Extract<Item,{k:"text"}>,fill:string)=>{if(r.chip)items.push(word);else backedWord(word,fill);};
        let headingW=0;
        if((narrowRows||onlyInset&&r.chip)&&r.label){
          const text=wrap(labelText,w-(badge?44:16),"sub",Infinity),extra=cardParts.slice(1).flatMap(s=>wrap(s,w-(badge?44:16),"sub",Infinity)),h=Math.max(18,(text.length+extra.length)*18);
          headingW=Math.min(w-frameLeft,Math.max(...[...text,...extra].map(s=>measure(s,"sub")))*(r.chip?1.12:1)+(badge?44:r.chip?6:16))+frameLeft;
          if(badge||t.roomy||r.boxed||r.chip||cardParts.length>1)items.push({k:"box",x:frameLeft,y,w:headingW-frameLeft,h,fill:`role:${r.role}:soft`,stroke:`role:${r.role}:line`,r:r.chip?9:5,...(r.chip?{id:labelId,role:r.role}:{}),bar:labelBar});
          if(badge)items.push({k:"badge",x:frameLeft+5,y:y+2,s:badge[1],role:r.role});
          text.forEach((s,i)=>labelWord({k:"text",x:frameLeft+(badge?29:r.chip?3:4),y:y+13+i*18,s,f:"sub",ink:r.chip?`role:${r.role}:ink`:"ink",tip:r.label},headingFill));
          extra.forEach((s,i)=>labelWord({k:"text",x:frameLeft+(badge?29:4),y:y+13+(text.length+i)*18,s,f:"sub",ink:"muted"},headingFill));y+=h+(r.chip?4:0);
        }
        const rowTags=t.tags.filter(tag=>tag.row===r.id&&tag.b>a.a&&tag.a<a.b&&!paired.has(tag)),tagLanes:{h:number;labels:{tag:TimeTag;left:number;width:number;lines:string[]}[]}[]=[];
        for(const tag of rowTags){
          charge("tag layout");const lines=wrap(tag.text,Math.max(8,(x1-x0-18)/1.2),"chip",Infinity),width=Math.min(x1-x0,Math.max(...lines.map(s=>measure(s,"chip")))*1.2+18),left=Math.max(x0,Math.min(x1-width,(X(tag.a)+X(tag.b)-width)/2));
          let lane=tagLanes.find(l=>l.labels.every(other=>{charge("tag collisions");return left+width+6<=other.left||other.left+other.width+6<=left;}));if(!lane){lane={h:0,labels:[]};tagLanes.push(lane);}lane.h=Math.max(lane.h,lines.length*14+6);lane.labels.push({tag,left,width,lines});
        }
        for(const lane of tagLanes){for(const {tag,left,width,lines}of lane.labels){const id=prefix+":tag:"+r.id+":"+t.tags.indexOf(tag),when={from:tag.step,to:0};items.push({k:"box",x:left,y,w:width,h:lane.h,fill:"role:"+r.role+":soft",stroke:"role:"+r.role+":line",r:9,id,bar:{kind:"chip",id,label:tag.text,role:r.role},...when});lines.forEach((s,i)=>items.push({k:"text",x:left+width/2,y:y+14+i*14,s,f:"chip",ink:"role:"+r.role+":ink",anchor:"middle",...when}));}y+=lane.h+4;}
        const labels = onlyInset||narrowRows||!r.label?[]:wrap(labelText, labW - (r.chip?(badge?44:6):wideCardRows?(badge?44:16):card?16:2), "sub", wideCardRows||r.chip?Infinity:2);
        const dotCenters=[...new Set(r.segs.filter(s=>s.dot&&s.b>a.a&&s.a<a.b).map(s=>X((Math.max(a.a,s.a)+Math.min(a.b,s.b))/2)))].sort((a,b)=>a-b);
        charge("dot spacing",dotCenters.length*Math.max(1,Math.ceil(Math.log2(dotCenters.length+1))));let dotRadius=t.rulerBelow?8:3;
        // Leave room for both strokes as well as the visible gap between dense phone samples.
        if(box.narrow)for(let i=1;i<dotCenters.length;i++)dotRadius=Math.min(dotRadius,Math.max(.5,(dotCenters[i]-dotCenters[i-1]-5)/2));
        const thin=!t.cells&&r.segs.some(s=>s.after),dotRow=r.segs.every(s=>s.dot),lineH=18;
        const compact=!!t.cells&&!t.roomy;
        const emptyChipCells=!!r.chip&&narrowRows&&!!t.cells&&!t.roomy&&!t.apart&&r.segs.every(s=>!s.name&&!s.dot&&!s.numbered&&!s.wide&&!s.after);
        let rowH = Math.max(thin?14:dotRow?18:t.roomy ? box.narrow?48:56 : t.apart ? box.narrow?36:44 : emptyChipCells?20:compact||box.narrow?22:onlyInset?24:28, labels.length * (thin?14:18) + (thin?0:4));
        // a dot's words too long for one line beside it wrap there (up to 2 lines, left of the next marker line that shows with them); the row grows; else under the row as before
        const dotSide=new Map<Seg,string[]>();
        if(dotRow)for(const s of r.segs){
          charge("dot words beside");if(!s.name||!(s.b>a.a&&s.a<a.b))continue;
          const start=X((Math.max(a.a,s.a)+Math.min(a.b,s.b))/2)+dotRadius+5;if(start+measure(s.name,"sub")*1.2+3<=x1)continue;
          const sf=s.from,st=s.to||box.steps,fence=Math.min(x1,...panelMarks.filter(m=>{charge("dot word fences");return m.kind==="at"&&within(m.a,a)&&X(m.a)>start&&(m.step||1)<=st&&(m.persist||!m.step?box.steps:m.step)>=sf;}).map(m=>X(m.a)-6));
          const room=fence-start-3;if(room<60)continue;const lines=wrap(s.name,room/1.2,"sub",Infinity);if(lines.length>2)continue;
          dotSide.set(s,lines);rowH=Math.max(rowH,lines.length*14+4);
        }
        const sublines=onlyInset||narrowRows?[]:cardParts.slice(1).flatMap(s=>wrap(s,labW-(wideCardRows&&badge?44:16),"sub",wideCardRows?Infinity:2));
        if(card)rowH=Math.max(rowH,labels.length*18+sublines.length*18+(badge&&!wideCardRows?25:r.chip?0:8));
        const numName=(s:Seg)=>!s.numbered&&!s.after&&/^[-+]?\d+(?:\.\d+)?$/.test(s.name),cellNumber=(s:Seg,v:number)=>s.numbered?numberWord(v):s.name;
        const numSegs=box.narrow&&t.cells?r.segs.filter(s=>(s.numbered||numName(s))&&!s.wide&&s.b>a.a&&s.a<a.b):[];
        let nm:{turn:boolean;bands:number;k:number;h:number;band:Map<number,number>;len:number}|undefined;
        if(numSegs.length){
          const pitch=(x1-x0)*t.cells!/(a.b-a.a),em=fontSize("chip"),turnW=em*.72;let levelW=0,turnLen=0;
          for(const s of numSegs){const lo=Math.max(a.a,s.a),hi=Math.min(a.b,s.b),first=Math.floor((lo-t.a)/t.cells!),count=Math.max(0,Math.ceil((hi-t.a)/t.cells!)-first);charge("number mode",count);
            for(let j=0;j<count;j++){const v=cellNumber(s,Math.max(lo,t.a+(first+j)*t.cells!));levelW=Math.max(levelW,measure(v,"sub"));if(measure(v,"sub")>turnW)turnLen=Math.max(turnLen,measure(v,"chip"));}}
          // every cell keeps its number drawn: level when it fits; on end when the turned digits fit their own cell;
          // else level on 2 to 4 staggered rows (sized with 12% room for the browser's wider digits); else on end on 2 or 3 staggered rows; fewer numbers only when not even that fits
          const levelRows=[1,2,3,4].find(n=>(n===1?levelW:levelW*1.12)+3<=n*pitch),turnRows=turnW<levelW?[1,2,3].find(n=>turnW+3<=n*pitch):undefined;
          const turn=levelRows!==1&&turnRows===1||levelRows===undefined&&turnRows!==undefined,bands=turn?turnRows!:levelRows??2,k=levelRows===undefined&&turnRows===undefined?Math.ceil((levelW+3)/pitch):1; // fewer labels alternate two rows: two ranges may start on neighbouring cells
          const band=turn&&k===1?Math.max(16,Math.ceil(turnLen)+3):!turn&&bands>1&&k===1?Math.ceil(fontSize("sub")*.72)+3:16; /* staggered level digits: their cap height and 3 px a row (digits have no descenders) *//* 3 px between the two rows */const len=Math.ceil(turnLen),stack=turn&&k===1&&bands===2; // two rows of turned numbers: one 3 px gap between them and 1 px above and below
          nm={turn:turn&&k===1,bands,k,h:bands===1&&!(turn&&k===1)?lineH+6:stack?2*len+5:band*bands+4,band:new Map(),len}; // one level row keeps the plain cell's height
          if(k>1){ // the kept cells, by place (every step draws a cell's number on the same row)
            const keep=new Set<number>();
            for(const s of numSegs){const lo=Math.max(a.a,s.a),hi=Math.min(a.b,s.b),first=Math.floor((lo-t.a)/t.cells!),count=Math.max(0,Math.ceil((hi-t.a)/t.cells!)-first);charge("number keep",count);
              for(let j=0;j<count;j++){const g=first+j;if(j===0||!(g%k||j<k||count-j<k))keep.add(g);}}
            charge("number keep sort",keep.size*Math.max(1,Math.ceil(Math.log2(keep.size+1))));[...keep].sort((x,y)=>x-y).forEach((g,i)=>nm!.band.set(g,i%2));
          }
          rowH=Math.max(rowH,nm.h);
        }
        // on a phone, when a cell word fits neither level nor on end, the row's plain words stand level on staggered lines under the row, each centred under its cell, so every cell keeps its own word; a footnote only when a word is wider than three cells
        let stagger=1,staggerNeed=false,onEndH=0;const staggerTaken:{line:number;l:number;r:number;from:number;to:number}[]=[];
        if (t.cells) for (const s of r.segs) {
          if(nm&&(s.numbered||numName(s))&&!s.wide)continue;
          charge("cell words", s.name.length + 1);
          if(!s.after){
            const cw=(x1-x0)*(s.wide?s.b-s.a:t.cells)/(a.b-a.a),labels=s.numbered?[numberWord(s.a),numberWord(Math.max(s.a,s.b-t.cells))]:[s.name];
            if(s.numbered&&!s.wide){
              const lo=Math.max(a.a,s.a),hi=Math.min(a.b,s.b),first=Math.floor((lo-t.a)/t.cells),count=Math.max(0,Math.ceil((hi-t.a)/t.cells)-first);charge("number sizes",count);
              let longest=labels[0];for(let j=0;j<count;j++){const value=numberWord(Math.max(lo,t.a+(first+j)*t.cells));if(measure(value,"chip")>measure(longest,"chip"))longest=value;}labels.push(longest);
            }
            if(onEnd(s.name,cw,s))onEndH=Math.max(onEndH,Math.ceil(measure(s.name,"chip"))+10);
            else if(staggerLines(s.name,cw,s)>1)staggerNeed=true;
            if(staggerable(s.name,cw,s))stagger=Math.max(stagger,Math.ceil((measure(s.name,"chip")*1.2+4)/cw));
            for(const label of labels)if(!(emptyChipCells&&!label)&&(!box.narrow||turnNumber(label,cw)||widest(label)<=cellWordRoom(cw))){const f=cellFont(label,cw);rowH=Math.max(rowH,!s.wide&&turnNumber(label,cw)?(Math.ceil(measure(label,"chip")))*numberBands(cw):wrap(label,f==="big"?wordRoom(cw):cellWordRoom(cw),f,Infinity).length*(f==="big"?28:lineH)+6);}
          }
        }
        if(!staggerNeed)stagger=1;else{
          // as many lines as a first-fit pass over the row's own cells needs (the same rule that places them), at least 2, at most 6
          const sim:{line:number;l:number;r:number;from:number;to:number}[]=[];let need=2;
          for(const s of r.segs){if(s.wide||s.after||s.numbered||s.dot||nm&&numName(s))continue;const lo=Math.max(a.a,s.a),hi=Math.min(a.b,s.b);if(hi<=lo)continue;
            const first=Math.floor((lo-t.a)/t.cells!),count=Math.ceil((hi-t.a)/t.cells!)-first,half=measure(s.name,"chip")*.6,from=s.from||1,to=s.to||box.steps;
            for(let j=0;j<count;j++){charge("stagger sizing");const a0=Math.max(lo,t.a+(first+j)*t.cells!),b0=Math.min(hi,t.a+(first+j+1)*t.cells!),cw=X(b0)-X(a0);if(!staggerable(s.name,cw,s))continue;
              const mid=Math.max(x0+half,Math.min(x1-half,X(a0)+cw/2));let line=0;while(line<6&&sim.some(o=>o.line===line&&!(o.to<from||to<o.from||o.r+10<=mid-half||mid+half+10<=o.l)))line++;
              sim.push({line,l:mid-half,r:mid+half,from,to});need=Math.max(need,Math.min(6,line+1));}}
          stagger=need;}
        if(stagger===1&&onEndH)rowH=Math.max(rowH,onEndH);
        if (r.segs.some((s) => s.tone === "bad")) rowH += t.roomy?(box.narrow?0:4):12;
        if(wideCardRows)rowH=Math.max(rowH,sharedRowH);
        // [bar] spans stack inside their row (from its top) when none of the row's states lies in their time range
        const inRow=new Set<Mark>();
        { const rowBars=panelMarks.filter(m=>{charge("bar rows");return m.kind==="span"&&!!m.bar&&m.row===r.id&&m.b>a.a&&m.a<a.b;});
          if(rowBars.length){
            const lo=Math.min(...rowBars.map(m=>m.a)),hi=Math.max(...rowBars.map(m=>m.b));
            if(!r.segs.some(s=>{charge("bar rows");return s.b>lo&&s.a<hi;})){
              const lanes:{end:number;h:number;marks:Mark[]}[]=[];
              for(const m of rowBars){const plan=barPlan(m),start=m.step||1,end=m.persist||!m.step||plan.tag?Infinity:m.step;let lane=lanes.find(l=>{charge("bar lanes");return l.end<start;});if(!lane){lane={end:0,h:0,marks:[]};lanes.push(lane);}lane.end=end;lane.h=Math.max(lane.h,plan.h);lane.marks.push(m);inRow.add(m);}
              // every bar has a one-line chip and the chips never touch on one line: the chips take one line at the row's top, the bars 5 px tall and 7 px apart under it
              const plans=rowBars.map(m=>({m,p:barPlan(m)})).sort((u,v)=>u.p.chipX-v.p.chipX);charge("bar chip line",plans.length*Math.max(1,Math.ceil(Math.log2(plans.length+1))));
              const shelf=plans.every(({p},k)=>!!p.tag&&p.chipLines.length===1&&(k===0||p.chipX>=plans[k-1].p.chipX+plans[k-1].p.chipW+2));
              if(shelf){
                const shelfH=Math.max(...plans.map(({p})=>p.chipH)),barTop=y+2+shelfH+4,laneOf=new Map<Mark,number>();
                lanes.forEach((lane,k)=>{for(const m of lane.marks)laneOf.set(m,k);});
                const rects=rowBars.map(m=>{const p=barPlan(m);return {m,x:p.lo,w:p.hi-p.lo,y:barTop+laneOf.get(m)!*7};});
                let below=barTop+lanes.length*7+2;
                for(const r of rects){
                  charge("bar captions",rects.length);const p=barPlan(r.m);let textY:number|undefined;
                  if(p.lines.length){const tw=measure(p.lines[0],"sub")*1.1,tx=p.side==="right"?p.hi+8:Math.min(p.lo,p.chipX)-8-tw,hit=p.side==="below"||rects.some(o=>o!==r&&o.x<tx+tw&&o.x+o.w>tx&&o.y<r.y+9&&o.y+5>r.y-7);
                    if(hit){textY=below+12;below+=p.lines.length*18;}}
                  compactBars.set(r.m,{chipY:y+2,barY:r.y,textY});spanSlots.set(r.m,{y:r.y,lines:p.lines});
                }
                rowH=Math.max(rowH,below-y+2);
              } else {
              rowH=Math.max(rowH,lanes.reduce((h,l)=>h+l.h,0)+4);let by=y+2;
              for(const lane of lanes){for(const m of lane.marks)spanSlots.set(m,{y:by,lines:barPlan(m).lines});by+=lane.h;}
              }
            }
          }
        }
        // Bounds describe the visible cells; labels paint separately in the reserved stage.
        const minFrame=!t.roomy?frameWidth:Math.min(frameWidth,narrowRows||onlyInset?Math.max(8,headingW-frameLeft+(roomyPhone?8:0),measure(labelText,"sub")+(badge?44:8)):labW+8);
        const frameSpans=r.segs.filter(s=>s.b>a.a&&s.a<a.b).map(s=>({from:s.from,to:s.to,w:s.after?frameWidth:Math.min(frameWidth,X(Math.min(a.b,s.b))+4-frameLeft)}));
        laneSpans.push(...frameSpans);laneMin=Math.max(laneMin,minFrame);
        under.push(...revealedFrames({k:"box",x:frameLeft,y:rowTop,w:frameWidth,h:y-rowTop+rowH,fill:t.roomy||t.apart||r.chip&&narrowRows||inBand.has(r.id)?"none":inset&&a.tone?`${a.tone}:soft`:"surface",stroke:"none",r:0,cls:"scn-frame stg-time-row",id:`${prefix}:row:${r.id}`,bar:onlyInset?{ignore:1}:{kind:"worksheet-row",id:rowId(r.id),...(r.chip?{}:{label:labelText})}},frameSpans,minFrame,box.steps));
        if(card){const h=r.chip?Math.max(18,(labels.length+sublines.length)*18+(badge?25:0)):rowH,width=r.chip?Math.min(labW-3,Math.max(0,...[...labels,...sublines].map(s=>measure(s,"sub")))*1.12+(badge?44:6)):labW-3;items.push({k:"box",x:bandW,y:r.chip?y:y+(rowH-h)/2,w:width,h,fill:`role:${r.role}:soft`,stroke:`role:${r.role}:line`,r:r.chip?9:7,cls:"scn-shape",role:r.role,id:labelId,bar:labelBar});}
        const labelY=y+(r.chip&&!badge?13:wideCardRows?(rowH-(labels.length+sublines.length)*18)/2+13:badge?37:card?(rowH-(labels.length+sublines.length)*18)/2+13:13);
        if(badge&&!narrowRows)items.push({k:"badge",x:bandW+6,y:wideCardRows?labelY-13:y+5,s:badge[1],role:r.role});
        labels.forEach((s, i) => labelWord({ k: "text", x: wideCardRows&&badge?bandW+34:t.rulerBelow&&!card?x0-8:bandW+(r.chip&&!badge?3:card?6:4), y: labelY + i * 18, s, f: "sub", ink: r.chip?`role:${r.role}:ink`:"ink", tip: r.label,...(t.rulerBelow&&!card?{anchor:"end" as const}:{}) },headingFill));
        sublines.forEach((s,i)=>labelWord({k:"text",x:bandW+(wideCardRows&&badge?34:6),y:labelY+(labels.length+i)*18,s,f:"sub",ink:"muted"},headingFill));
        let legendY = y + rowH + (dotRow||compact||box.narrow?0:5);
        // staggered words stand on lines right under their row, each centred under its own cell, so they never cross a box
        const staggerY=legendY+2;if(stagger>1)legendY+=stagger*14+4;
        const cellLegends:{ref:string;label:string;ink:string;from:number;to:number}[]=[],rangeCaptions:{label:string;from:number;to:number}[]=[],laterNums:{hw?:number;min?:number;mask:Item;word:Item}[]=[];
        for (const s of r.segs) {
          charge("segment layout");
          const lo = Math.max(a.a, s.a), hi = Math.min(a.b, s.b); if (hi <= lo) continue;
          const left = X(lo), width = X(hi) - left;
          const token = inset&&a.tone&&!s.tone?a.tone:s.tone && !["plain", "idle"].includes(s.tone) ? s.tone : !s.tone && s.on ? `role:${s.role||r.role}` : "";
          const paint = { fill: token ? `${token}:soft` : "surface-2", stroke: token&&!s.soft ? `${token}:${inset&&a.tone&&!s.tone?"ink":"line"}` : "line", dash: s.tone === "idle", thick: s.tone==="bad"&&!s.soft, from: s.from, to: s.to, ...(!s.soft&&(s.focus || s.tone === "bad") ? { hot: [Math.max(1, s.from)] } : {}) }; // [soft] limits the tone to the fill; ordinary bad cells retain their cross and first-step emphasis.
          const words = (cx: number, cw: number, override?:string) => {
            const label=override??s.name,f=cellFont(label,cw),leading=f==="big"?28:lineH;
            const putWord=(word:Extract<Item,{k:"text"}>)=>backedWord(word,paint.fill);
            if(s.tone==="bad"&&!s.soft){
              const lines=label?wrap(label,f==="big"?wordRoom(cw):cellWordRoom(cw),f,Infinity):[],width=Math.max(0,...lines.map(line=>measure(line,f)))*1.2;
              const side=(cw-width)/2-8,above=(rowH-lines.length*leading)/2+11-fontSize(f)-6;
              const inset=Math.min(4+cellGap(cw)/2,cw*.2),size=Math.max(Math.min(2,cw/4),Math.min(30,cw-inset*2,rowH-8,side>=30||!label?30:above));
              const stroke=Math.min(3,cw*.1,size*.4),right=cx+cw-inset,left=right-size,upper=y+4,lower=upper+size;
              items.push(...shift([{k:"path",pts:[[left,upper],[right,lower]],curve:"round",ink:"bad:line",w:stroke},{k:"path",pts:[[right,upper],[left,lower]],curve:"round",ink:"bad:line",w:stroke}] as Item[],0,0,{from:s.from,to:s.to}));
            }
            if(!label)return;
            if(t.cells&&!s.wide&&turnNumber(label,cw)){
              const bands=numberBands(cw),index=Math.floor((cx-x0)/(x1-x0)*(a.b-a.a)/t.cells+1e-6);
              putWord({k:"text",x:cx+cw/2+fontSize("chip")*.35,y:y+rowH/bands*(index%bands+.5),s:label,f:"chip",ink:s.soft?"ink":token?`${token}:ink`:"muted",anchor:"middle",rotate:90,from:s.from,to:s.to});return;
            }
            if(!override&&stagger>1&&staggerable(label,cw,s)){const index=Math.floor((cx-x0)/(x1-x0)*(a.b-a.a)/t.cells!+1e-6),half=measure(label,"chip")*.6,mid=Math.max(x0+half,Math.min(x1-half,cx+cw/2)),from=s.from||1,to=s.to||box.steps;
              // the first line where no word shown in the same steps is in its way (cells of several-cell runs repeat the word)
              let line=-1;for(let k=0;k<stagger&&line<0;k++)if(staggerTaken.every(o=>{charge("stagger lines");return o.line!==k||o.to<from||to<o.from||o.r+10<=mid-half||mid+half+10<=o.l;}))line=k;if(line<0)line=index%stagger;
              staggerTaken.push({line,l:mid-half,r:mid+half,from,to});
              {const baseline=staggerY+11+line*14;items.push({...captionMask(mid-measure(label,"chip")*.6,baseline,label,"surface"),from:s.from,to:s.to});}
              items.push({k:"text",x:mid,y:staggerY+11+line*14,s:label,f:"chip",ink:s.soft?"ink":token?`${token}:ink`:"muted",anchor:"middle",from:s.from,to:s.to,tip:label});return;}
            if(!override&&onEnd(label,cw,s)){items.push({k:"text",x:cx+cw/2+fontSize("chip")*.35,y:y+rowH/2,s:label,f:"chip",ink:s.soft?"ink":token?`${token}:ink`:"muted",anchor:"middle",rotate:90,from:s.from,to:s.to,tip:label});return;}
            if(box.narrow&&!/^[-+]?\d+(?:\.\d+)?$/.test(label)&&widest(label)>cellWordRoom(cw)&&!s.after){
              const first=a.a+Math.floor((cx-x0)/(x1-x0)*(a.b-a.a)/t.cells!+1e-6)*t.cells!,last=a.a+(Math.ceil((cx+cw-x0)/(x1-x0)*(a.b-a.a)/t.cells!-1e-6)-1)*t.cells!,ref=first===last?fmt(first):`${fmt(first)}–${fmt(last)}`,ink=s.soft?"ink":token?`${token}:ink`:"muted";
              const room=cw-cellGap(cw),fits=measure(ref,"chip")+2<=room,rotate=!fits&&/^\d+$/.test(ref)&&fontSize("chip")*.8<=room&&measure(ref,"chip")<=rowH-4;
              if(fits||rotate)items.push({k:"text",x:cx+cw/2+(rotate?fontSize("chip")*.35:0),y:y+rowH/2+(rotate?0:4),s:ref,f:"chip",ink,anchor:"middle",...(rotate?{rotate:90 as const}:{}),from:s.from,to:s.to,tip:label});
              cellLegends.push({ref,label,ink,from:s.from,to:s.to});return;
            }
            if(s.after){const lines=wrap(label,w-8-cx-cw-6,"sub",Infinity);lines.forEach((text,i)=>items.push({k:"text",x:cx+cw+6,y:y+11+i*16,s:text,f:"sub",ink:s.soft?"ink":token?`${token}:ink`:"muted",from:s.from,to:s.to,tip:label}));legendY=Math.max(legendY,y+lines.length*16+4);return;}
            const lines = wrap(label, f==="big"?wordRoom(cw):cellWordRoom(cw), f, Infinity);
            for (const [i, text] of lines.entries()) putWord({ k: "text", x: cx + cw / 2, y: y + (rowH - lines.length * leading) / 2 + (f==="big"?leading/2+fontSize(f)*.34:11) + i * leading, s: text, f, ink: s.soft?"ink":token ? `${token}:${f==="big"&&token.startsWith("role:")?"line":"ink"}` : "muted", anchor: "middle", from: s.from, to: s.to, tip: label });
          };
          if (s.dot) {
            const cx=left+width/2,cy=y+rowH/2,radius=dotRadius,dotToken=!s.tone?`role:${s.role||r.role}`:token,ink=s.soft?"ink":dotToken?`${dotToken}:${dotToken.startsWith("role:")?"line":"ink"}`:"muted";
            const dot:Extract<Item,{k:"box"}>={k:"box",x:cx-radius,y:cy-radius,w:radius*2,h:radius*2,...paint,fill:s.tone==="plain"?"muted":dotToken?`${dotToken}:soft`:"surface-2",stroke:s.soft?"line":s.tone==="plain"?"muted":dotToken?`${dotToken}:line`:"line",r:radius,cls:"scn-shape stg-time-dot",id:`${prefix}:dot:${r.id}:${s.a}:${s.from}`,bar:{kind:"chip",label:s.name,track:axisId,value:lo+(hi-lo)/2,...(dotToken.startsWith("role:")?{role:s.role||r.role}:{})}};
            const paints=dotPaintRanges(r.id,(lo+hi)/2,s.a,s.from,s.to||box.steps);
            for(const p of paints){
              charge("dot paint variants",1,1);const stroke=p.tone?`${p.tone}:line`:dot.stroke,fill=p.tone?p.tone==="ink"?"surface-2":`${p.tone}:soft`:dot.fill,solid=s.tone==="plain"||p.solid&&!s.soft;
              const role=p.tone?.startsWith("role:")?p.tone.slice(5):p.tone?undefined:dot.bar?.role;
              items.push({...dot,from:p.a,to:p.b===box.steps?0:p.b,stroke,fill:solid?stroke:fill,bar:{...dot.bar,role}});
            }
            const labelItems:Item[]=[],side=dotSide.get(s);
            if(side)side.forEach((text,i)=>{const x=cx+radius+5,baseline=cy+4+(i-(side.length-1)/2)*14;labelItems.push(captionMask(x,baseline,text,"surface"),{k:"text",x,y:baseline,s:text,f:"sub",ink});});
            else if(s.name&&dotRow&&cx+radius+5+measure(s.name,"sub")*1.2+3<=x1){const x=cx+radius+5,baseline=cy+4;labelItems.push(captionMask(x,baseline,s.name,"surface"),{k:"text",x,y:baseline,s:s.name,f:"sub",ink});}
            else if(s.name)for(const text of wrap(s.name,(x1-x0-6)/1.2,"sub",Infinity)){const baseline=legendY+12;labelItems.push(captionMask(x0,baseline,text,rows.length>1&&!t.roomy&&!t.apart?"surface-2":"surface"),{k:"text",x:x0,y:baseline,s:text,f:"sub",ink});legendY+=box.narrow?14:18;}
            for(const p of paints)for(const label of labelItems){charge("dot word paint variants",1,1);items.push({...label,from:p.a,to:p.b===box.steps?0:p.b,...(label.k==="text"&&p.tone?{ink:`${p.tone}:${p.tone.startsWith("role:")?"line":"ink"}`}:{})});}
          } else if (t.cells && !s.wide) {
            const first = Math.floor((lo - t.a) / t.cells), count = Math.ceil((hi - t.a) / t.cells) - first;
            charge("row cells", count, count * 8);
            for (let j = 0; j < count; j++) {
              const a0 = Math.max(lo, t.a + (first + j) * t.cells), b0 = Math.min(hi, t.a + (first + j + 1) * t.cells), cw = X(b0) - X(a0);
              const gap = turnNumber(s.numbered?numberWord(a0):s.name,cw)?0:cellGap(cw);
              items.push({ k: "box", x: X(a0) + gap / 2, y, w: cw - gap, h: rowH, ...paint, r: t.roomy||t.apart?7:1, cls: "scn-shape stg-time-cell", id: `${prefix}:cell:${r.id}:${s.a}:${first + j}:${s.from}`, role: token.startsWith("role:") ? (s.role||r.role) : undefined, bar: { kind: s.numbered?"band":"chip", label: s.numbered?fmt(a0):s.name, track: axisId, value: a0 + (b0 - a0) / 2 } });
              if(nm&&(s.numbered||numName(s))){
                words(X(a0),cw,"");const g=first+j,label=cellNumber(s,a0),ink=token?`${token}:ink`:"muted";
                if(nm.k>1&&j>0&&(g%nm.k||j<nm.k||count-j<nm.k))continue; // fewer labels: each range's first, then every k-th clear of the next range
                const bi=(nm.k>1?nm.band.get(g)??0:g)%nm.bands,cy=nm.turn&&nm.bands===2?y+(rowH-2*nm.len-3)/2+nm.len/2+bi*(nm.len+3):y+rowH/nm.bands*(bi+.5);
                // a number a marker line crosses gets a page-coloured backing, so the line passes behind it
                if(nm.turn&&measure(label,"sub")>fontSize("chip")*.72)backedWord({k:"text",x:X(a0)+cw/2+fontSize("chip")*.35,y:cy,s:label,f:"chip",ink,anchor:"middle",rotate:90,from:s.from,to:s.to},"surface");
                else if(nm.bands>1){ // staggered numbers come after every cell of the row, on a backing in their cell's colour over the borders,
                  // inside the grid of cells (cell 30's and tick 955's numbers no longer pass its right edge)
                  const tw=measure(label,"sub")*1.2,half=measure(label,"sub")*1.12/2+.5,gridR=Math.min(frameLeft+frameWidth,X(a.b));
                  const cx=Math.max(frameLeft+half,Math.min(gridR-half,X(a0)+cw/2)),capH=Math.ceil(fontSize("sub")*.72);
                  laterNums.push({hw:measure(label,"sub")*1.12/2,min:frameLeft+half,mask:{k:"box",x:cx-tw/2-1,y:cy+4-capH-1.5,w:tw+2,h:capH+3,fill:typeof paint.fill==="string"?paint.fill:"surface",stroke:"none",r:2,cls:"stg-time-word-mask",bar:{ignore:1},from:s.from,to:s.to},word:{k:"text",x:cx,y:cy+4,s:label,f:"sub",ink,anchor:"middle",from:s.from,to:s.to,tip:label}});
                }
                else backedWord({k:"text",x:X(a0)+cw/2,y:nm.bands===1?y+(rowH-lineH)/2+11:cy+4,s:label,f:"sub",ink,anchor:"middle",from:s.from,to:s.to,tip:label},"surface");
                continue;
              }
              words(X(a0), cw,s.numbered?numberWord(a0):undefined);
            }
          } else {
            const chipGap=t.apart?cellGap(width/Math.max(1,(hi-lo)/t.cells!)):0;
            items.push({ k: "box", x: left+chipGap/2, y, w: width-chipGap, h: rowH, ...paint, r: t.apart?7:2, cls: "scn-shape stg-seg", id: `${prefix}:seg:${r.id}:${s.a}:${s.from}`, role: token.startsWith("role:") ? (s.role||r.role) : undefined,bar:{kind:t.apart?"chip":"time-bar",id:`${prefix}:seg:${r.id}:${s.a}:${s.from}`,label:onlyInset?(a.unit||r.label||s.name):s.name,track:axisId,value:lo+(hi-lo)/2} });
            // on a phone a wide cell whose number cannot keep 2 px each side (with 12% room for browser glyphs) captions them under the row instead of clipping them at its edge
            const tight=box.narrow&&!!t.cells&&!s.after&&/^\d+$/.test(s.name)&&Math.max(...wrap(s.name,Math.max(8,width-6),"sub",Infinity).map(l=>measure(l,"sub")))*1.12+4>width;
            if (!tight&&(s.after || t.cells || measure(s.name, "sub") + 8 <= width)) words(left, width);
            else if(s.name&&box.narrow)rangeCaptions.push({label:`${s.name} ${fmt(s.a)}..${fmt(s.b)}`,from:s.from,to:s.to});
            else if(s.name) for (const text of wrap(`${s.name} ${fmt(s.a)}..${fmt(s.b)}`, x1 - x0, "sub", Infinity)) {
              items.push({ k: "text", x: x0, y: legendY + 11, s: text, f: "sub", ink: "muted", from: s.from, to: s.to }); legendY += 18;
            }
          }
        }
        if(laterNums.length){charge("staggered numbers",laterNums.length);
          // a number held inside the grid's right edge pushes its row-mates on the same staggered line left, 3 px apart (each still over its own cell's half)
          const ordered=[...laterNums].sort((p,q)=>(q.word as any).x-(p.word as any).x);
          for(let i=0;i<ordered.length;i++){const r=ordered[i],rw=r.word as any;
            for(let j=i+1;j<ordered.length;j++){const l=ordered[j],lw=l.word as any;charge("staggered push");
              if(Math.abs(lw.y-rw.y)>.5||(lw.to&&rw.from>lw.to)||(rw.to&&lw.from>rw.to))continue;
              const over=lw.x+l.hw!+3-(rw.x-r.hw!);if(over>0){const nx=Math.max(l.min!,lw.x-over),d=nx-lw.x;lw.x=nx;(l.mask as any).x+=d;}
              break;}}items.push(...laterNums.map(n=>n.mask),...laterNums.map(n=>n.word));}
        if(rangeCaptions.length){
          const gap=measure(" · ","sub")+2;let cursor=x0,previous:typeof rangeCaptions[number]|undefined;
          for(const cap of rangeCaptions){
            charge("range caption packing");const lines=wrap(cap.label,x1-x0,"sub",Infinity),width=captionWidth(lines);
            if(lines.length>1){if(cursor>x0){legendY+=14;cursor=x0;}lines.forEach((s,i)=>items.push({k:"text",x:x0,y:legendY+11+i*14,s,f:"sub",ink:"muted",from:cap.from,to:cap.to}));legendY+=lines.length*14;previous=undefined;continue;}
            if(cursor>x0&&cursor+gap+width>x1){legendY+=14;cursor=x0;previous=undefined;}
            if(cursor>x0){const from=Math.max(previous!.from,cap.from),to=Math.min(previous!.to||box.steps,cap.to||box.steps);if(from<=to)items.push({k:"text",x:cursor+2,y:legendY+11,s:"·",f:"sub",ink:"muted",from,to});cursor+=gap;}
            items.push({k:"text",x:cursor,y:legendY+11,s:lines[0],f:"sub",ink:"muted",from:cap.from,to:cap.to});cursor+=width;previous=cap;
          }
          if(cursor>x0)legendY+=14;
        }
        if(cellLegends.length){
          type Caption={left:number;right:number;lines:string[];it:typeof cellLegends[number]};
          type Shelf={labels:Caption[];h:number};
          const shelves:Shelf[]=[],header:Shelf={labels:[],h:0},leading=box.narrow?14:18;
          const canHead=narrowRows&&!!r.label&&!badge&&!r.boxed&&!t.roomy&&cardParts.length===1&&y-rowTop===18;
          const plans=cellLegends.map(it=>{const lines=wrap(`${it.ref}: ${it.label}`,Math.max(8,(x1-x0-2)/1.2),"sub",Infinity);return {it,lines,width:Math.max(...lines.map(s=>measure(s,"sub")))*1.2+1};}),sizes=new Map<string,{width:number;lines:number}>();
          for(const plan of plans){const old=sizes.get(plan.it.ref);sizes.set(plan.it.ref,{width:Math.max(old?.width||0,plan.width),lines:Math.max(old?.lines||0,plan.lines.length)});}
          // Pack whole entries left to right, with a key in the original cell. Mutually exclusive states share slots.
          const place=(shelf:Shelf,start:number,width:number,it:typeof cellLegends[number])=>{
            const occupied=shelf.labels.filter(c=>{charge("cell caption visibility");return c.it.from<=(it.to||box.steps)&&it.from<=(c.it.to||box.steps);});
            charge("cell caption sort",occupied.length*Math.max(1,Math.ceil(Math.log2(occupied.length+1))));occupied.sort((a,b)=>a.left-b.left);let left=start;
            for(const c of occupied){charge("cell caption packing");if(left+width+5<=c.left)break;if(left<c.right+5)left=c.right+5;}
            return left+width<=x1?left:undefined;
          };
          for(const {it,lines} of plans){
            const size=sizes.get(it.ref)!,width=size.width;
            let left=canHead&&size.lines===1?place(header,Math.max(x0,headingW+6),width,it):undefined,shelf=left===undefined?undefined:header;
            if(!shelf)for(const row of shelves){const at=place(row,x0,width,it);if(at!==undefined){shelf=row;left=at;break;}}
            if(!shelf){shelf={labels:[],h:0};shelves.push(shelf);left=x0;}
            shelf.h=Math.max(shelf.h,size.lines*leading);shelf.labels.push({left:left!,right:left!+width,lines,it});
          }
          const caption=(left:number,baseline:number,s:string,it:typeof cellLegends[number])=>{const when={from:it.from,to:it.to};items.push({...captionMask(left,baseline,s,"surface"),...when},{k:"text",x:left,y:baseline,s,f:"sub",ink:it.ink,...when});};
          for(const {left,lines,it}of header.labels)caption(left,rowTop+13,lines[0],it);
          if(shelves.length)legendY+=3;
          for(const shelf of shelves){for(const {left,lines,it} of shelf.labels)lines.forEach((s,i)=>caption(left,legendY+12+i*leading,s,it));legendY+=shelf.h;}
          for(const frame of under)if(frame.k==="box"&&((frame.bar?.kind==="worksheet-row"&&frame.bar?.id===rowId(r.id))||(onlyInset&&frame.id?.startsWith(`${prefix}:row:${r.id}:`))))frame.h=Math.max(frame.h,legendY-rowTop);
        }
        rowYs.set(r.id, y + rowH + 2);
        rowRects.set(r.id,{top:y,bottom:y+rowH,headingTop:rowTop,captionBottom:legendY});
        const barBottom=y+rowH;
        y = legendY;
        const spanLanes:{end:number;h:number;marks:{m:Mark;lines:string[]}[]}[]=[];
        for(const m of panelMarks){
          charge("span slots");if(m.kind!=="span"||m.row!==r.id||m.b<a.a||m.a>a.b||inRow.has(m))continue;
          const plan=m.bar?barPlan(m):undefined,bLo=X(Math.max(a.a,m.a)),bHi=X(Math.min(a.b,m.b)),bMid=(bLo+bHi)/2,lines=plan?plan.lines:wrap(m.text||`${fmt(m.a)}..${fmt(m.b)}`,box.narrow?Math.min(w-16,Math.max(bHi-bLo+16,2*Math.min(bMid-8,w-8-bMid),60)):w-16,"sub",Infinity),start=m.step||1,end=m.persist||!m.step||plan?.tag?Infinity:m.step; // a phone keeps the caption under its own bracket
          let lane=spanLanes.find(l=>{charge("span lane");return l.end<start;});
          if(!lane){lane={end:0,h:0,marks:[]};spanLanes.push(lane);}
          lane.end=end;lane.h=Math.max(lane.h,plan?plan.h:lines.length*18+8);lane.marks.push({m,lines});
        }
        let sy=legendY>barBottom+5?legendY+3:barBottom+6;
        const sy0=sy;for(const lane of spanLanes){for(const {m,lines}of lane.marks)spanSlots.set(m,{y:sy,lines});sy+=lane.h;}
        if(spanLanes.length)y=Math.max(y,sy);
        if(r===rows[rows.length-1]&&spanLanes.length)lastSpans={start:sy0,end:sy,marks:spanLanes.flatMap(l=>l.marks.map(x=>x.m))};
        const closes=bandStop.get(r.id);
        if(closes&&bandStart.has(closes.first)){y+=4;if(bandW)y=Math.max(y,bandTop+t.bands.filter(b=>b===closes).map(b=>wrap(b.title,bandW-10,"sub",Infinity).length*18+8)[0]);bandItems.unshift({k:"box",x:2,y:bandTop,w:Math.max(8,w-4),h:y-bandTop,fill:`role:${closes.role}:soft`,stroke:`role:${closes.role}:line`,r:6,cls:"scn-frame stg-time-band",id:`${prefix}:band:${closes.id}`,bar:{kind:"band",label:closes.title}});}
        y += wideCardRows?(rows.indexOf(r)<rows.length-1?evenGap:8):gapRoom[rows.indexOf(r)] ? gapRoom[rows.indexOf(r)] : compact&&box.narrow?(t.cells&&(x1-x0)*t.cells/(a.b-a.a)<16?1:3):compact||box.narrow?4:8;
      }
      under.unshift(...bandItems);
      if(rows.length>1)under.unshift(...revealedFrames({k:"box",x:frameLeft,y:rowsTop-4,w:frameWidth,h:y-rowsTop+4,fill:t.roomy||t.apart?"none":"surface-2",stroke:t.roomy||t.apart?"none":"line",r:7,cls:"scn-frame stg-time-rows",id:`${prefix}:rows`,bar:{kind:"lane",label:"Time rows"}},laneSpans,laneMin,box.steps));
      const bottom = y;
      // [beside]: the words at the rows' top, beside the line (left of it in the axis's right half), wrapped to that room;
      // they must meet no row word, cell, chip or span on any step they show, else the label goes back to the shelf
      const besideAt=new Map<Mark,{lines:string[];xs:number[];y:number}>(),taken:{x:number;y:number;w:number;h:number;from:number;to:number}[]=[];
      const firstRow=rows.length?rowRects.get(rows[0].id):undefined;
      const besideMarks=panelMarks.filter(m=>m.kind==="at"&&m.beside&&!!m.text&&!shelved.has(m)&&within(m.a,a));
      if(besideMarks.length&&firstRow){
        for(const it of items.slice(rowsStart)){
          charge("beside obstacles");if(it.k!=="text"&&it.k!=="box"||it.on&&!it.on.length)continue;
          const from=it.on?Math.min(...it.on):it.from??1,to=it.on?Math.max(...it.on):it.to||box.steps;
          if(it.k==="box")taken.push({x:it.x,y:it.y,w:it.w,h:it.h,from,to});
          else{const tw=measure(it.s,it.f)*1.1,tx=it.anchor==="middle"?it.x-tw/2:it.anchor==="end"?it.x-tw:it.x;taken.push({x:tx,y:it.y-12,w:tw,h:16,from,to});}
        }
        for(const [m,slot] of spanSlots){charge("beside obstacles");if(m.row==="axis")continue;const from=m.step||1,to=m.persist||!m.step?box.steps:m.step;taken.push({x:X(Math.max(a.a,m.a)),y:slot.y-6,w:X(Math.min(a.b,m.b))-X(Math.max(a.a,m.a)),h:slot.lines.length*18+12,from,to});}
      }
      for(const m of besideMarks){
        charge("beside labels");if(!firstRow)break;
        const lx=X(m.a),right=lx>(x0+x1)/2,room=Math.max(24,right?lx-6-x0:x1-lx-6),lines=wrap(m.text,room,"sub",Infinity),top0=firstRow.headingTop;
        const xs=lines.map(s2=>right?lx-6-measure(s2,"sub"):lx+6),from=m.step||1,to=Math.min(m.persist||!m.step?box.steps:m.step,m.labelTo??Infinity);
        const rects=lines.map((s2,i)=>({x:xs[i],y:top0+i*18,w:measure(s2,"sub"),h:16}));
        const clash=top0+lines.length*18>bottom+2||rects.some(r=>r.x<x0-1||r.x+r.w>x1+1||taken.some(o=>{charge("beside collisions");return o.from<=to&&o.to>=from&&r.x<o.x+o.w+3&&r.x+r.w+3>o.x&&r.y<o.y+o.h&&r.y+r.h>o.y;}));
        if(clash){besideFail.push(m);continue;}
        besideAt.set(m,{lines,xs,y:top0});for(const r of rects)taken.push({...r,from,to});
      }
      const below=new Map<Mark,{y:number;lines:string[];right:boolean;left?:number;end?:number}>();
      const placeBelow=(start:number,gap:boolean,only?:(m:Mark)=>boolean)=>{
        // first-fit shelves by step: a label takes the first shelf where no label shown in the same steps is in its way, so a later step's words sit right under their tick
        type Placed={y:number;lines:string[];right:boolean;left?:number;end?:number};
        const trial=(atLine:boolean)=>{
        const shelves:{h:number;labels:{l:number;r:number;from:number;to:number}[];marks:Mark[]}[]=[],placed=new Map<Mark,Placed>();let slid=0;
        for(const m of panelMarks){
          charge("below marker labels");if(m.kind!=="at"||!m.text||m.caption||!m.below||!within(m.a,a)||only&&!only(m))continue;
          let right=X(m.a)>(x0+x1)/2,room=Math.max(24,right?X(m.a)-8:w-RM-X(m.a));
          // between the rows and the ruler, the words keep to the room before the next marker line, so no line cuts them
          let fenced=false;
          if(gap){const xs=panelMarks.filter(o=>{charge("below fences");return o!==m&&o.kind==="at"&&within(o.a,a);}).map(o=>X(o.a));
            const edge=right?Math.max(x0-6,...xs.filter(x=>x<X(m.a))):Math.min(x1+6,...xs.filter(x=>x>X(m.a)));
            const fenceRoom=right?X(m.a)-6-(edge+4):edge-4-(X(m.a)+6);if(fenceRoom<room){room=Math.max(24,fenceRoom);fenced=true;}}
          // a label that fits the block on one line keeps one line: it slides along (its tick stays under its words)
          // rather than wrapping in the room on one side of its tick
          // in an apart grid the words start on the tile at their tick (its ▲ on the tile), wrapping before the stage's edge
          const apartCell=t.apart&&t.cells?(x1-x0)*t.cells/(a.b-a.a):0;if(apartCell){room=Math.max(48,w-RM-(X(m.a)+Math.min(4,apartCell/4)));fenced=true;}
          const one=measure(m.text,"sub");let slides=!fenced&&one>room&&one<=w-16;if(slides)slid++;
          // the phone try: each label ends at its own line, wrapped (its two halves) back no further than the line of the
          // [below] label before it, so neighbours share a shelf each under its own line; or, when it slid and cannot, starts at its own line
          let lineRoom=0,split:string[]|undefined,atEnd=false;
          if(atLine){
            const from0=m.step||1,to0=m.labelTo!==undefined?m.labelTo:m.persist||!m.step?box.steps:m.step;
            const prev=Math.max(4,...panelMarks.filter(o=>{charge("below line room");if(o===m||o.kind!=="at"||!o.text||o.caption||!o.below||!within(o.a,a)||X(o.a)>=X(m.a))return false;
              const f1=o.step||1,t1=o.labelTo!==undefined?o.labelTo:o.persist||!o.step?box.steps:o.step;return !(t1<from0||to0<f1);}).map(o=>X(o.a)));
            // (sized with 12% room for the browser's wider glyphs; drawn anchored at their end, so they end on the line whatever the font)
            const r0=(X(m.a)-(prev+4))/1.12,halves=m.text.split(" · ");
            if(one<=r0){right=true;slides=false;lineRoom=r0;atEnd=true;}
            else if(r0>=Math.min(one,24*4)&&wrap(m.text,r0,"sub",Infinity).length<=2){right=true;slides=false;lineRoom=r0;atEnd=true;if(halves.length===2&&halves.every(h=>measure(h,"sub")<=r0))split=halves;}
            else if(slides&&X(m.a)+one<=w-RM){right=false;slides=false;lineRoom=w-RM-X(m.a);}
          }
          const lines=split??(slides?[m.text]:wrap(m.text,lineRoom||room,"sub",Infinity)),width=Math.max(...lines.map(s=>measure(s,"sub")));
          // between the rows and a ruler below them: the words start just beside their tick
          const cellW=apartCell; // in an apart grid the words start on the tile that starts at their tick
          const left=Math.max(8,Math.min(w-RM-width,cellW?X(m.a)+Math.min(4,cellW/4):gap?(right?X(m.a)-6-width:X(m.a)+6):X(m.a)-(right?width:0)));
          const from=m.step||1,to=m.labelTo!==undefined?m.labelTo:m.persist||!m.step?box.steps:m.step;
          let shelf=shelves.find(sh=>sh.labels.every(o=>{charge("below shelves");return o.to<from||to<o.from||o.r+8<=left||left+width+8<=o.l;}));
          if(!shelf){shelf={h:0,labels:[],marks:[]};shelves.push(shelf);}
          shelf.labels.push({l:left,r:left+width,from,to});shelf.marks.push(m);shelf.h=Math.max(shelf.h,lines.length*16);
          placed.set(m,{y:0,lines,right,...(gap||cellW?{left}:{}),...(atEnd?{end:X(m.a)}:{})});
        }
        return {shelves,placed,slid,h:shelves.reduce((s2,sh)=>s2+sh.h+4,0)};
        };
        let pick=trial(false);
        // on a phone the at-line try wins when it is shorter, or when some label slid along the block's edge and the words take no more height
        if(!gap&&box.narrow&&!(t.apart&&t.cells)&&(pick.slid||pick.shelves.length>1)){const alt=trial(true);if(alt.h<pick.h||pick.slid&&alt.h<=pick.h)pick=alt;}
        for(const [m,p] of pick.placed)below.set(m,p);
        let shelfY=start;for(const sh of pick.shelves){for(const m of sh.marks)below.get(m)!.y=shelfY;shelfY+=sh.h+4;}
        return pick.shelves.length?shelfY:start;
      };
      const gapBelow=!!t.rulerBelow&&!headerCells,gapEnd=gapBelow?placeBelow(bottom+2,true):bottom;
      let rulerY=top;
      if(t.rulerBelow&&!headerCells){
        rulerY=gapEnd===bottom?bottom+8:gapEnd+6;
        for(const v of tickValues)for(const rect of rowRects.values()){charge("row tick guides");under.push({k:"path",pts:[[X(v),rect.top],[X(v),rect.bottom]],ink:"line",w:1,bar:{ignore:1}});}
        for(const it of rulerItems){if(it.k==="path")it.pts=it.pts.map(([x,y])=>[x,y+rulerY-top]);else if(it.k==="text")it.y+=rulerY-top+(phoneLabelH?phoneLabelH+16:28);}
        for(const [m,slot]of spanSlots)if(m.row==="axis")slot.y+=rulerY-top+phoneLabelH+20;
        y=rulerY+Math.max(26,phoneLabelH+20)+axisSpanH+dotLabelH;
      }
      // A short tick below a top ruler ends before its separate label shelf.
      if(!gapBelow&&panelMarks.some(m=>m.tick&&within(m.a,a)))y=Math.max(y,bottom+10);
      // in an apart grid the [below] marker words come right under the rows, then the last row's span brackets and captions (the original's order)
      if(!gapBelow&&t.apart&&lastSpans&&y<=lastSpans.end+8){
        // the words shown by the spans' first step go above them; words that come later go under the captions, so the span line starts right under the words beside it
        // (all of them above when the later words fit the same rows)
        const first=Math.min(...lastSpans.marks.map(m=>m.step||1)),early=(m:Mark)=>(m.step||1)<=first,earlyEnd=placeBelow(lastSpans.start,false,early),allEnd=placeBelow(lastSpans.start,false),split=allEnd>earlyEnd;
        const end=split?placeBelow(lastSpans.start,false,early):allEnd,moved=end-lastSpans.start;if(moved>0){for(const m of lastSpans.marks){const slot=spanSlots.get(m);if(slot)slot.y+=moved;}}
        y=Math.max(y,lastSpans.end+moved);if(split)y=placeBelow(y,false,m=>!early(m));}
      else if(!gapBelow)y=placeBelow(y,false);
      if(t.window&&!onlyInset){
        const lo=Math.max(t.window.a,a.a),hi=Math.min(t.window.b,a.b);
        if(hi>lo){const left=X(lo),width=X(hi)-left;const natural=bottom-top+44+windowExtra+windowTitleExtra+windowPadA,padB=t.windowLines?Math.max(0,t.windowLines*18-natural):0;if(padB)y=Math.max(y,bottom+padB);under.push({k:"box",x:left,y:top-40-windowExtra-windowTitleExtra-windowPadA,w:width,h:natural+padB,fill:"none",stroke:"line-2",dash:true,r:3,id:`${prefix}:window`,cls:"scn-frame",bar:{kind:"panel",id:`${prefix}:window`,label:t.window.unit}});windowWords.forEach((s,i)=>items.push({k:"text",x:box.narrow?Math.max(8,Math.min(w-8-measure(s,"sub"),left+6)):width>=24?left+6:8,y:top-30-windowExtra-windowTitleExtra-windowPadA+i*18,s,f:"sub",ink:"muted",tip:t.window?.unit}));}
      }
      for(const [index,e] of t.arrows.entries()){
        charge("cell arrows");
        if(!within(e.at,a)||!rowRects.has(e.to)||e.from!=="above"&&!rowRects.has(e.from))continue;
        const to=rowRects.get(e.to)!,from=e.from==="above"?null:rowRects.get(e.from)!;
        const input=aboveInputs.get(e),upward=from&&from.top>to.top,sy=input!==undefined?input-8:from?(upward?from.headingTop-2:from.bottom+2):top+12+dotLabelH,ty=input!==undefined?input+8:upward?to.bottom+2:to.headingTop-2,x=X(e.at),role=t.rows.find(r=>r.id===(e.from==="above"?e.to:e.from))!.role;
        const {lines:text,x:tx}=arrowLabels.get(e)!;
        const ink=e.tone?(e.tone==="ink"?"ink":`${e.tone}:line`):`role:${role}:line`;
        const its:Item[]=[{k:"path",pts:[[x,sy],[x,ty]],curve:"round",ink,arrow:true,...(input!==undefined?{head:8}:{}),dash:e.dash,w:2,id:`${prefix}:arrow:${index}`,bar:{edge:`${prefix}:arrow:${index}`,from:e.from==="above"?"above":rowId(e.from),to:rowId(e.to)}}];
        const textStart=upward?Math.max(ty,to.captionBottom+2):Math.max(sy,from?.captionBottom??sy),textEnd=upward?from!.headingTop-2:to.headingTop-2;
        text.forEach((s,i)=>its.push({k:"text",x:tx,y:input!==undefined?input+i*18:(textStart+textEnd)/2+4-(text.length-1)*9+i*18,s,f:"sub",ink:e.tone&&e.tone!=="ink"?`${e.tone}:ink`:"ink"}));
        items.push(...shift(its,0,0,{from:e.step,to:e.step}));
      }
      if (values) {
        const v = values, valueId = `${prefix}-y`;
        for (const s of wrap(v.unit || "Value", w - 16, "sub", Infinity)) { items.push({ k: "text", x: 8, y: y + 12, s, f: "sub", ink: "muted" }); y += 18; }
        const vt = y + 30, vb = vt + 100, Y = (n: number) => vb - (n - v.a) / (v.b - v.a) * (vb - vt);
        items.push({ k: "path", pts: [[x0, vb], [x0, vt]], ink: "line-2", id: valueId, bar: { axis: valueId, min: v.a, max: v.b, "axis-direction": "y" } });
        for (const n of ticks(v, 200)) { const yy = Y(n), s = fmt(n); items.push({ k: "path", pts: [[x0 - 4, yy], [x1, yy]], ink: "line", dash: true }, { k: "text", x: x0 - 7, y: yy + 4, s: wrap(s, labW - 2, "sub", 1)[0], f: "sub", ink: "muted", anchor: "end" }); }
        const previous = new Map<string, Point>();
        for (const p of t.points) {
          charge("point layout"); const prev = previous.get(p.role); previous.set(p.role, p);
          if (prev && p.time >= a.a && prev.time <= a.b) {
            const lo = Math.max(prev.time, a.a), hi = Math.min(p.time, a.b);
            const valueAt = (n: number) => prev.value + (p.value - prev.value) * (n - prev.time) / (p.time - prev.time);
            items.push({ k: "path", pts: [[X(lo), Y(valueAt(lo))], [X(hi), Y(valueAt(hi))]], curve: "round", ink: `role:${p.role}:line` });
          }
          if (!within(p.time, a)) continue;
          const xx = X(p.time), yy = Y(p.value);
          // A box centred on the datum carries the value hook; its centre is the measured data position.
          items.push({ k: "box", x: xx - 3, y: yy - 3, w: 6, h: 6, r: 3, fill: `role:${p.role}:line`, stroke: "none", cls: "scn-shape", role: p.role, id: `${prefix}:point:${p.id}`, bar: { kind:"chip",track: axisId, value: p.time, "value-axis": valueId, "data-value": p.value } });
          items.push({ k: "path", pts: [[xx - 3, yy], [xx + 3, yy]], ink: `role:${p.role}:line`, id: `${prefix}:value:${p.id}`, bar: { track: valueId, value: p.value } });
        }
        const occupied=t.points.filter(p=>within(p.time,a)).map(p=>({x:X(p.time)-5,y:Y(p.value)-5,w:10,h:10}));
        let plotBottom=vb+12;
        for(const p of t.points){
          charge("point labels");if(!within(p.time,a))continue;
          const xx=X(p.time),yy=Y(p.value),lines=wrap(p.label||p.id,x1-x0-12,"sub",Infinity),width=Math.max(...lines.map(s=>measure(s,"sub"))),height=lines.length*18;
          let chosen:{x:number;y:number;w:number;h:number}|undefined;
          for(const baseline of [yy-8,yy+19,yy-24,yy+35,yy-40,yy+51]){
            for(const rawX of [xx+8,xx-width-8,xx-width/2]){
              charge("point label candidates");const rect={x:Math.max(x0+2,Math.min(x1-width-2,rawX)),y:baseline-14,w:width,h:height};
              if(rect.y<vt-18||rect.y+height>vb+22)continue;
              if(occupied.some(other=>{charge("point label collisions");return rect.x<other.x+other.w+4&&rect.x+rect.w+4>other.x&&rect.y<other.y+other.h+3&&rect.y+rect.h+3>other.y;}))continue;
              chosen=rect;break;
            }
            if(chosen)break;
          }
          if(!chosen){
            chosen={x:Math.max(x0+2,Math.min(x1-width-2,xx-width/2)),y:plotBottom+8,w:width,h:height};
            items.push({k:"path",pts:[[xx,yy],[xx,chosen.y-4],[Math.max(chosen.x,Math.min(chosen.x+width,xx)),chosen.y-4]],ink:`role:${p.role}:line`});
          }
          occupied.push(chosen);plotBottom=Math.max(plotBottom,chosen.y+height);
          lines.forEach((s,i)=>items.push({k:"text",x:chosen!.x,y:chosen!.y+14+i*18,s,f:"sub",ink:`role:${p.role}:ink`}));
        }
        y=plotBottom+8;
      }
      const chipItems:Item[]=[];
      let nextY = y, maxY = y, dotY = t.rulerBelow?rulerY+Math.max(26,phoneLabelH+20)+axisSpanH:top+14+axisSpanH;
      for (const [markIndex, m] of panelMarks.entries()) {
        charge("mark layout");
        if (m.b < a.a || m.a > a.b) continue;
        const group=axisGroupOf.get(m);if(group&&group.owner!==m)continue;
        const when:When = group?.when??(m.step ? { from: m.step, to: m.persist ? 0 : m.step } : {}), lineY = nextY, tone = m.tone || "acc";
        const lo = Math.max(a.a, m.a), hi = Math.min(a.b, m.b);
        const its: Item[] = [];
        const id = `${prefix}:${m.kind}:${m.step}:${m.kind==="span" ? m.row+":" : ""}${m.a}:${markIndex}`;
        // an apart grid draws no ruler and no tick strokes, so a [below] marker with words is its words alone, under its tile: no line
        if (m.kind === "at" && !(t.apart && m.below && m.text && !m.caption)) its.push({ k: "path", pts: [[X(m.a), m.tick?bottom+1:gapBelow&&m.below&&m.text&&!m.caption?bottom:above.get(m)?.reach?Math.min(above.get(m)!.y+2,top-5):Math.max(0,top - (t.window&&!onlyInset?40+windowExtra+windowTitleExtra+windowPadA:t.rulerNone?0:5))], [X(m.a), m.tick?bottom+7:t.rulerBelow?rulerY:bottom+(t.window&&!onlyInset?4:0)]], ink: `${tone}:line`, dash: !m.solid, w: 2, id, bar: { track: axisId, value: m.a, ...(m.edge===false?{kind:"guide"}:{edge:id, from:id, to:id}),...(m.solid?{"line-style":"solid"}:{}) } });
        if(m.kind === "dot") {
          its.push({k:"box",x:X(m.a)-3,y:rulerY-3,w:6,h:6,r:3,fill:`${tone}:line`,stroke:"none",id,cls:"scn-shape stg-ruler-dot",bar:{kind:"chip",track:axisId,value:m.a}});
          if(m.text){for(const text of wrap(m.text,w-16,"sub",Infinity)){const tw=measure(text,"sub"),x=X(m.a)-tw/2+tw>w-8?Math.max(8,X(m.a)-12-tw):Math.max(8,X(m.a)-tw/2); /* a dot's words that would cross the stage's right edge end 12 px left of the dot */its.push({k:"text",x,y:dotY+12,s:text,f:"sub",ink:`${tone}:ink`});dotY+=18;}}
        }
        if(m.kind === "span" && m.bar && m.row !== "axis") {
          const slot=spanSlots.get(m);if(!slot)continue;
          const p=barPlan(m),sy=slot.y,mid=sy+p.lineH/2,token=m.tone||`role:${t.rows.find(r=>r.id===m.row)?.role}`,cb=compactBars.get(m);
          its.push({k:"box",x:p.lo,y:cb?cb.barY:mid-5,w:Math.max(2,p.hi-p.lo),h:cb?5:10,fill:`${token}:line`,stroke:`${token}:line`,r:cb?2:3,cls:"scn-shape stg-span-bar",id,bar:{kind:"time-bar",label:m.text||`${fmt(m.a)}..${fmt(m.b)}`,track:axisId,value:lo+(hi-lo)/2}}); // a scene: a renewal bar stays a time-bar
          const ink=`${token}:ink`;
          if(cb){if(p.lines.length){if(cb.textY!==undefined)p.lines.forEach((s,i)=>its.push({k:"text",x:Math.max(x0,Math.min(x1-measure(s,"sub"),p.lo)),y:cb.textY!+i*18,s,f:"sub",ink}));else its.push({k:"text",x:p.side==="right"?p.hi+8:Math.min(p.lo,p.chipX)-8-measure(p.lines[0],"sub")*1.1,y:cb.barY+7,s:p.lines[0],f:"sub",ink});}}
          else if(p.side==="right"||p.side==="left"){const x=p.side==="right"?p.hi+8:Math.min(p.lo,p.chipX)-8-measure(p.lines[0],"sub")*1.1;its.push({k:"text",x,y:mid+4,s:p.lines[0],f:"sub",ink});} // its own line: nothing to mask
          else if(p.side==="below")p.lines.forEach((s,i)=>its.push({k:"text",x:Math.max(x0,Math.min(x1-measure(s,"sub"),p.lo)),y:sy+p.lineH+12+i*18,s,f:"sub",ink}));
          if(p.tag){
            const tag=p.tag,role=t.rows.find(r=>r.id===tag.row)!.role,cid=prefix+":tag:"+tag.row+":"+t.tags.indexOf(tag),cy=cb?cb.chipY:mid-p.chipH/2,cw={from:tag.step,to:0};
            chipItems.push({k:"box",x:p.chipX,y:cy,w:p.chipW,h:p.chipH,fill:"role:"+role+":soft",stroke:"role:"+role+":line",r:9,id:cid,bar:{kind:"chip",id:cid,label:tag.text,role},...cw});
            p.chipLines.forEach((s,i)=>chipItems.push({k:"text",x:p.chipX+p.chipW/2,y:cy+12+i*14,s,f:"chip",ink:"role:"+role+":ink",anchor:"middle",...cw}));
          }
        }
        else if(m.kind === "span") {
          const slot=spanSlots.get(m);if(!slot)continue;
          const sy=slot.y;
          its.push({k:"path",pts:m.line?[[X(lo),sy],[X(hi),sy]]:[[X(lo),sy-3],[X(lo),sy+3],[X(hi),sy+3],[X(hi),sy-3]],curve:"round",ink:`${tone}:line`,w:2,id,bar:m.row==="axis"||m.line?{...(m.row==="axis"?{kind:"time-bar",label:m.text,id}:{}),...(m.line?{edge:id,from:rowId(m.row!),to:rowId(m.row!)}:{})}:undefined});
          for(const [i,text] of slot.lines.entries()){
            const tw=measure(text,"sub"),beside=m.row==="axis"&&slot.lines.length===1; // a row span's caption sits centred under its own line (the originals; a caption beside the end read as the next cells')
            const right=beside&&X(hi)+10+tw<=x1,left=beside&&X(lo)-10-tw>=x0;
            const x=right?X(hi)+10:left?X(lo)-10-tw:Math.max(8,Math.min(w-RM-tw,(X(lo)+X(hi)-tw)/2));
            const inline=m.row==="axis";
            const baseline=sy+(inline?4:right||left?10:17)+i*18;
            // a caption left of its line ends at the line's gap, anchored there, and its backing grows leftwards, so neither covers the line's start
            if(left&&!right){const end=X(lo)-10,mask=captionMask(end-measure(text,"sub")*1.2,baseline,text,"surface");if(mask.k==="box"){mask.w=Math.max(0,Math.min(mask.x+mask.w,end+3)-mask.x);}its.push(mask);its.push({k:"text",x:end,y:baseline,s:text,f:"sub",ink:`${tone}:ink`,anchor:"end"});continue;}
            its.push(captionMask(x,baseline,text,m.row!=="axis"&&rows.length>1&&!t.roomy&&!t.apart?"surface-2":"surface"));
            its.push({k:"text",x,y:baseline,s:text,f:"sub",ink:`${tone}:ink`});
          }
        }
        const heading=above.get(m);
        if(heading?.reach&&heading.right&&X(m.a)-(heading.gap??0)-Math.max(...heading.lines.map(s=>measure(s,"sub")))>=8)heading.lines.forEach((s,i)=>its.push({k:"text",x:X(m.a)-(heading.gap??0),y:heading.y+12+i*18,s,f:"sub",ink:`${tone}:ink`,anchor:"end"})); // right-aligned to its line, so no font runs into it
        else if(heading)heading.lines.forEach((s,i)=>its.push({k:"text",x:Math.max(8,Math.min(w-RM-measure(s,"sub"),X(m.a)-(heading.right===undefined?measure(s,"sub")/2:heading.right?measure(s,"sub")+(heading.gap??0):-(heading.gap??0)))),y:heading.y+12+i*18,s,f:"sub",ink:`${tone}:ink`}));
        const lowLabel=below.get(m);
        const side=besideAt.get(m);
        if(side)side.lines.forEach((s,i)=>its.push({k:"text",x:side.xs[i],y:side.y+12+i*18,s,f:"sub",ink:`${tone}:ink`}));
        if(lowLabel?.end!==undefined)lowLabel.lines.forEach((s,i)=>its.push({k:"text",x:lowLabel.end!,y:lowLabel.y+12+i*16,s,f:"sub",ink:`${tone}:ink`,anchor:"end"}));
        else if(lowLabel)lowLabel.lines.forEach((s,i)=>its.push({k:"text",x:lowLabel.left??Math.max(8,Math.min(w-RM-measure(s,"sub"),X(m.a)-(lowLabel.right?measure(s,"sub"):0))),y:lowLabel.y+12+i*16,s,f:"sub",ink:`${tone}:ink`}));
        let ly = lineY;
        const pointNamesMarker=values&&t.points.some(p=>{charge("marker point label");return p.time===m.a&&(p.label||p.id).toLowerCase()===m.text.toLowerCase();});
        if(m.kind==="at"&&m.text&&!m.caption&&!heading&&!lowLabel&&!side&&!pointNamesMarker){for (const s of wrap(m.text, w - 16, "sub", Infinity)) { its.push({ k: "text", x: 8, y: ly + 12, s, f: "sub", ink: `${tone}:ink` }); ly += 18; }nextY=ly+4;}
        if((m.kind==="at"||m.kind==="span")&&m.labelTo!==undefined)for(const it of its)if(it.k==="text"||it.k==="box"&&it.cls==="stg-time-caption-mask"){if(m.labelTo===0)it.on=[];else it.to=Math.min(it.to||Infinity,m.labelTo);}
        maxY = Math.max(maxY, nextY); const marked = shift(its, 0, 0, when); (m.kind==="at"?markerStrokes:under).push(...marked.filter((i) => i.k === "path")); items.push(...marked.filter((i) => i.k !== "path"));
      }
      // Marker dashes cross filled cells, while words and their backings remain above the strokes.
      const stateBackground=(it:Item)=>it.k==="box"&&!!it.cls?.split(" ").some(cls=>["stg-time-cell","stg-seg","stg-time-dot"].includes(cls));
      if(markerStrokes.length)charge("marker layers",items.length,items.length);
      const ordered=markerStrokes.length?[...under,...items.filter(stateBackground),...markerStrokes,...items.filter(it=>!stateBackground(it))]:[...under,...items];
      if(inset)ordered.unshift({k:"box",x:0,y:0,w,h:maxY+8,fill:a.tone?`${a.tone}:soft`:"none",stroke:a.tone?`${a.tone}:ink`:"none",r:0,cls:"stg-time-inset",id:`${prefix}:panel`,bar:{kind:"panel",id:`${prefix}:panel`,label:t.zoomBracket&&a.unit?a.unit:label,...(a.tone?{tone:a.tone}:{})}});
      return { h: maxY + 8, ...(inset&&unitHeight?{head:unitHeight}:{}), ...(!inset&&t.roomy&&t.cells?{footLeft:x0+cellGap((x1-x0)*t.cells/(a.b-a.a))/2}:{}), items: [...ordered, ...chipItems].map(it=>({...it,from:Math.max(t.from,it.from??1,inset?a.from??1:1),to:inset&&a.to?Math.min(it.to||Infinity,a.to):it.to})) };
    };
    const firstPanel=panel;
    const fitted=(a:Axis,w:number,inset:boolean,suffix="")=>{besideFail=[];const out=firstPanel(a,w,inset,suffix);if(!besideFail.length)return out;const again=new Set(besideFail);besideFail=[];return firstPanel(a,w,inset,suffix,again);};
    if (!t.zoom) return fitted(t, box.w, false);
    const zoomSteps=t.zoom?Array.from({length:Math.max(0,(t.zoom.to||box.steps)-Math.max(t.from,t.zoom.from||1)+1)},(_,i)=>Math.max(t.from,t.zoom!.from||1)+i):[];charge("aside steps",zoomSteps.length+1);
    if(box.aside&&!t.zoomBelow&&(!box.aside.steps||zoomSteps.every(k=>box.aside!.steps!.includes(k)))){const full=fitted(t,box.w,false);return {...full,aside:fitted(t.zoom,box.aside.w,true)};}
    if (box.narrow||t.zoomBelow) { const full = fitted(t, box.w, false), zoom = fitted(t.zoom, box.w, true),gap=t.rows.some(r=>r.inset)?12:16; return { h: full.h + zoom.h + gap, footLeft:full.footLeft, items: [...full.items, ...shift(zoom.items, 0, full.h + gap)] }; }
    const gap = 24, fullW = (box.w - gap) * 0.58, insetW = box.w - gap - fullW;
    const full = fitted(t, fullW, false), zoom = fitted(t.zoom, insetW, true);
    return { h: Math.max(full.h, zoom.h), footLeft:full.footLeft, items: [...full.items, ...shift(zoom.items, fullW + gap, 0)] };
  },
  facts(t: Time, step) {
    charge("facts", t.rows.length + t.points.length + t.marks.length + t.arrows.length + 1);
    const zoomState=step&&t.zoom?.from&&(step===t.zoom.from||t.zoom.to&&step===t.zoom.to+1)?[step===t.zoom.from?"Inset shown.":"Inset hidden."]:[];
    if (step === 0) return [`Time from ${t.a} to ${t.b}${t.unit ? " " + t.unit : ""}${t.from>1?` (from step ${t.from})`:""}:`, ...t.rows.map((r) => { charge("state facts", r.segs.length); return `  ${r.label||r.id}: ${r.segs.map((s) => `${s.name || (s.numbered ? "numbered cells" : "empty")}${s.numbered && s.name ? " (numbered cells)" : ""} ${s.a} to ${s.b}${s.from > 1 || s.to ? ` (steps ${s.from}${s.to ? " to " + s.to : " onward"})` : ""}${s.tone ? " [" + (TIME_STYLES[s.tone as keyof typeof TIME_STYLES] || s.tone) + "]" : ""}${s.soft ? " [soft]" : ""}`).join(", ")}`; }), ...(t.cells ? [`State cells every ${t.cells}${t.unit ? " " + t.unit : ""}${t.apart ? ", drawn apart" : ""}.`] : []), ...(t.ticks ? [`Ticks: ${t.ticks.map((v) => `${v}${tickNote(t.tickLabels.get(v),t.tickWhen?.get(v),t.tickTone?.get(v))}`).join(", ")}.`] : []), ...(t.window ? [`Window ${t.window.a} to ${t.window.b}: ${t.window.unit}.`] : []), ...(t.zoom ? [`Zoom ${t.zoom.a} to ${t.zoom.b}${t.zoom.unit ? ": " + t.zoom.unit : ""}${t.zoomBracket ? " (a bracket over the inset)" : ""}.`] : []), ...(t.zoomTicks ? [`Zoom ticks: ${t.zoomTicks.map(v=>`${fmt(v)}${t.tickLabels.has(v)?" ("+t.tickLabels.get(v)+")":""}`).join(", ")}.`] : []), ...(t.zoomLabels ? [`Zoom labels: ${[...t.zoomLabels].map(([v,label])=>`${fmt(v)} (${label})`).join(", ")}.`] : []), ...(t.values ? [`Values from ${t.values.a} to ${t.values.b} ${t.values.unit}.`, ...t.points.map((p) => `${p.label || p.id}: ${p.value} at ${p.time}.`)] : []), ...(t.lanes ? [`Axis under the lanes ${t.lanes[0]} to ${t.lanes[1]}.`] : []), ...t.bands.map((b) => `Band "${b.title}": ${t.rows.find((r) => r.id === b.first)?.label || b.first} to ${t.rows.find((r) => r.id === b.last)?.label || b.last}.`), ...t.marks.filter((m) => m.step === 0).map((m) => `${m.kind === "dot" ? "Dot" : "Marker"} ${m.a}: ${endStop(m.text)}`)];
    const dotFacts=t.dotPaints.filter(f=>f.step===step).map(f=>f.tone?`${f.row}: dots starting ${f.range?`${fmt(f.range[0])} to ${fmt(f.range[1])}`:fmt(f.at!)} painted ${f.tone.startsWith("role:")?f.tone.slice(5):TIME_STYLES[f.tone as keyof typeof TIME_STYLES]||f.tone}${f.keep?" from this step onward":" this step only"}.`:`${f.row}: dots${f.range?` from ${fmt(f.range[0])} to ${fmt(f.range[1])}`:""} ${f.off?"restored to their declared paint":f.keep?"filled from this step onward":"filled this step only"}.`);
    const tickFacts=[...(t.tickWhen||[])].filter(([,r])=>r.from===step).map(([v,r])=>`Tick ${fmt(v)} label shown: ${endStop(t.tickLabels.get(v)||fmt(v))}${r.to?` Until step ${r.to}.`:""}`);
    return tickFacts.concat(t.marks.filter((m) => m.step === step).map((m) => (m.kind !== "span" ? `${m.kind === "dot" ? "Dot at" : "At"} ${m.a}${t.unit ? " " + t.unit : ""}: ${endStop(m.text)}${m.persist ? " From this step onward." : ""}` : `${t.rows.find((r) => r.id === m.row)?.label || m.row}, ${m.a} to ${m.b}${m.text ? ": " + m.text : ""}.${m.persist ? " From this step onward." : ""}`)).concat(t.arrows.filter(e=>e.step===step).map(e=>`${e.text}: ${e.from} to ${e.to} at ${e.at}.`)).concat(t.tags.filter(tag=>tag.step===step).map(tag=>`${t.rows.find(r=>r.id===tag.row)?.label||tag.row}, tag ${tag.a} to ${tag.b}: ${tag.text}. From this step onward.`)).concat(t.hushes.filter(h=>h.step===step).map(h=>h.span?`Span caption ${h.span} hidden; its line stays.`:`Marker label at ${h.at} hidden; its line stays.`)).concat(dotFacts).concat(zoomState));
  },
} satisfies StageBlock<Time>);
