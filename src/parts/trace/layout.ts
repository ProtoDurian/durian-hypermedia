import type { Budget } from "../../core/budget";
import { numberOrder } from "../flame/order";
import type { Span, TraceSpec } from "./part";
interface LogCandidate { service: string; time: number; want: string | undefined; best: number; ord: number }
/** Range assignments avoid visiting every log for every overlapping span. Index walks are bounded by 32 bits. */
export function placeLogs(spans: Span[], logs: LogCandidate[], budget: Budget) {
 interface Group { rows: LogCandidate[]; size: number; best: number[] }
 const services = new Map<string, Map<string, Group>>();
 for (const log of logs) {
  budget.charge(1, 1);
  let groups = services.get(log.service); if (!groups) services.set(log.service, groups = new Map());
  const key = log.want ?? ""; let group = groups.get(key);
  if (!group) groups.set(key, group = { rows: [], size: 1, best: [] });
  group.rows.push(log);
 }
 for (const groups of services.values()) for (const g of groups.values()) {
  budget.charge(1);
  g.rows = numberOrder(g.rows, x => x.time, budget);
  while (g.size < g.rows.length) { budget.charge(1); g.size *= 2; }
  budget.charge(2*g.size,2*g.size); g.best = Array(2*g.size).fill(-1);
 }
 const better = (a: number, b: number) => {
  if (a < 0) return b; if (b < 0) return a;
  const x = spans[a], y = spans[b];
  return x.depth > y.depth || (x.depth === y.depth && (x.start > y.start || (x.start === y.start && a < b))) ? a : b;
 };
 const bound = (g: Group, t: number, upper: boolean) => {
  let lo = 0, hi = g.rows.length;
  while (lo < hi) { budget.charge(1); const mid = (lo+hi)>>>1; if (g.rows[mid].time < t || (upper && g.rows[mid].time === t)) lo = mid+1; else hi = mid; }
  return lo;
 };
 const update = (g: Group | undefined, s: Span) => {
  if (!g) return;
  let lo = bound(g,s.start,false)+g.size, hi = bound(g,s.end,true)+g.size;
  while (lo < hi) {
   budget.charge(1);
   if (lo&1) { g.best[lo] = better(g.best[lo],s.id); lo++; }
   if (hi&1) { hi--; g.best[hi] = better(g.best[hi],s.id); }
   lo>>>=1;hi>>>=1;
  }
 };
 for (const s of spans) {
  budget.charge(1); const groups = services.get(s.service); if (!groups) continue;
  update(groups.get(""),s);update(groups.get(s.key),s);if(s.name!==s.key)update(groups.get(s.name),s);
 }
 for (const groups of services.values()) for (const g of groups.values()) {
  for(let i=1;i<g.size;i++){budget.charge(1);g.best[2*i]=better(g.best[2*i],g.best[i]);g.best[2*i+1]=better(g.best[2*i+1],g.best[i]);}
  for(let i=0;i<g.rows.length;i++){budget.charge(1);g.rows[i].best=g.best[g.size+i];}
 }
}
/** First free lane, with an interval minimum tree rather than a scan of all earlier parallel spans. */
export function flameRows(spec: TraceSpec, budget: Budget): number[] {
 const spans=spec.spans;
 budget.charge(spans.length*3,spans.length*3);
 const row=spans.map(()=>0),height=spans.map(()=>1);
 for(let i=spec.order.length-1;i>=0;i--){
  budget.charge(1);const id=spec.order[i],kids=spec.children[id];if(!kids.length)continue;
  let size=1;while(size<kids.length){budget.charge(1);size*=2;}
  budget.charge(2*size,2*size);
  const minimum=Array(2*size).fill(Infinity),lanes:{h:number;ids:number[]}[]=[];
  for(const k of kids){
   budget.charge(1,1);let lane:number;
   if(minimum[1]>spans[k].start){lane=lanes.length;lanes.push({h:0,ids:[]});}
   else{let p=1;while(p<size){budget.charge(1);p=minimum[2*p]<=spans[k].start?2*p:2*p+1;}lane=p-size;}
   lanes[lane].h=Math.max(lanes[lane].h,height[k]);lanes[lane].ids.push(k);
   let p=size+lane;minimum[p]=spans[k].end;
   while(p>1){budget.charge(1);p>>>=1;minimum[p]=Math.min(minimum[2*p],minimum[2*p+1]);}
  }
  let off=1;for(const lane of lanes){budget.charge(1);for(const k of lane.ids){budget.charge(1);row[k]=off;}off+=lane.h;}height[id]=off;
 }
 const abs=spans.map(()=>0);
 for(const id of spec.order){budget.charge(1);const p=spans[id].parent;abs[id]=p<0?0:abs[p]+row[id];}
 return abs;
}

/** Where a span's length word ("109 ms") is written: the first spot of four where it lies inside the plot and clear of every event
 *  diamond of its row: inside the bar at the left, inside at the right, after the bar, before the bar. `w` is the word's width,
 *  `marks` the x of each diamond (each takes `reach` to either side). When no spot is clear the first one inside the plot is used. */
export function lengthSpot(x0: number, x1: number, w: number, marks: readonly number[], min: number, max: number, reach = 7, gap = 6): { x: number; anchor: "start" | "end" } {
  const spots: { l: number; anchor: "start" | "end" }[] = [];
  if (x1 - x0 >= w + 2 * gap) spots.push({ l: x0 + gap, anchor: "start" }, { l: x1 - gap - w, anchor: "end" });
  spots.push({ l: x1 + gap, anchor: "start" }, { l: x0 - gap - w, anchor: "end" });
  const inside = spots.filter((s) => s.l >= min && s.l + w <= max);
  const clear = (s: { l: number }) => marks.every((m) => m + reach <= s.l || m - reach >= s.l + w);
  const pick = inside.find(clear) ?? inside[0] ?? spots[0];
  return { x: pick.anchor === "start" ? pick.l : pick.l + w, anchor: pick.anchor };
}
