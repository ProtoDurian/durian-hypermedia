import { Budget } from "../../core/budget";
import type { J } from "../log/jq";
import { LIMITS } from "./limits";
export interface DataError { line: number; msg: string }
/** RFC 4180 fields, including doubled quotes and newlines in a quoted field. */
export function readCsv(text: string, line0: number, budget?: Budget, caps = LIMITS): { rows: J[]; errors: DataError[] } {
 const errors: DataError[] = [], records: string[][] = []; let row: string[] = [], cell = "", quoted = false;
 budget?.charge(text.length, 0, text.length);
 const s = text.replace(/\r\n?/g,"\n");
 for(let i=0;i<s.length;i++) { budget?.charge(1); const c=s[i];
  if(quoted) { if(c==='"') { if(s[i+1]==='"'){cell+='"';i++;}else quoted=false; } else cell+=c; continue; }
  if(c==='"'&&!cell)quoted=true;else if(c===","){budget?.charge(1,1);row.push(cell);cell="";}else if(c==="\n"){budget?.charge(1,2);row.push(cell);records.push(row);row=[];cell="";}else cell+=c;
 }
 if(quoted)errors.push({line:line0,msg:"csv: a quoted field is never closed"});
 if(cell!==""||row.length){row.push(cell);records.push(row);}
 while(records.length&&records.at(-1)!.every(x=>x==="")){budget?.charge(records.at(-1)!.length+1);records.pop();}
 if(records.length<2){errors.push({line:line0,msg:"csv needs a header row and at least one row"});return{rows:[],errors};}
 const head=records[0];
 if(head.length>caps.exploreCsvCols)errors.push({line:line0,msg:`csv has ${head.length} columns; at most ${caps.exploreCsvCols}`});
 if(records.length-1>caps.exploreCsvRows)errors.push({line:line0,msg:`csv has ${records.length-1} rows; at most ${caps.exploreCsvRows}`});
 if(new Set(head).size!==head.length)errors.push({line:line0,msg:"csv has two columns with the same name in its header"});
 const rows:J[]=[];
 for(let i=1;i<Math.min(records.length,caps.exploreCsvRows+1);i++){const r=records[i];budget?.charge(r.length+1,r.length);if(r.length!==head.length){errors.push({line:line0+i,msg:`csv row ${i} has ${r.length} fields; the header has ${head.length}`});continue;}
 const o:{[k:string]:J}=Object.create(null);for(let j=0;j<head.length;j++){budget?.charge(r[j].length+head[j].length);o[head[j]]=/^-?(?:0|[1-9]\d{0,14})(?:\.\d+)?$/.test(r[j])?Number(r[j]):r[j];}rows.push(o);}
 return{rows,errors};
}
/** Bound depth before any recursive rendering or query, and charge all expanded values. */
export function guardData(value:J,budget:Budget,depthCap:number):void {
 const stack:{v:J;depth:number}[]=[{v:value,depth:0}];
 while(stack.length){budget.charge(1,1);const {v,depth}=stack.pop()!;if(depth>depthCap)throw new Error(`the data is nested more than ${depthCap} levels deep; flatten it or cut it`);
  if(typeof v==="string")budget.charge(v.length,0,v.length);
  else if(v&&typeof v==="object"){if(depth>=depthCap)throw new Error(`the data is nested more than ${depthCap} levels deep; flatten it or cut it`);const keys=Object.keys(v);budget.charge(keys.length,keys.length);for(const key of keys){budget.charge(key.length,0,key.length);stack.push({v:(v as any)[key],depth:depth+1});}}
 }
}
