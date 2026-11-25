// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// Counted units: each square stands for exactly one item, including the unassigned remainder.
import { type Item, type StageBlock, StageError, registerBlock, wrap, colon, parts, measure } from "./stage-core";
import { docBudget } from "./stage-budget";
type Count = { name: string; n: number; tone: string };
type Units = { total: number; counts: Count[]; title?: string; note?: string; rows?: {role:string;badge:string;total:number;counts:Count[]}[]; text?: {s:string;muted:boolean}[] };
const TONES: Record<string, string> = { kept: "good", added: "acc", removed: "bad" };
const PANEL_GROUPS=new Set(["kept","leaving","gone"]);
function groups(raw:string,total:number,line:number,panel=false):Count[]{
  const seen=new Set<string>(),counts:Count[]=[];let used=0;
  for(const group of parts(raw,",")){
    docBudget().charge("units groups",group.length+1,1);
    const [name,text,extra]=group.split(" "),n=text&&/^\d+$/.test(text)?+text:NaN;
    if(!(panel?PANEL_GROUPS.has(name):Object.hasOwn(TONES,name))||extra||!Number.isSafeInteger(n))throw new StageError(line,panel?"unit panel groups are kept, leaving or gone with a nonnegative whole count":"unit groups are kept, added or removed followed by a nonnegative whole count");
    if(seen.has(name))throw new StageError(line,`unit group "${name}" repeats; combine its counts`);
    seen.add(name);used+=n;if(used>total)throw new StageError(line,"unit group counts exceed the total; correct the counts or total");
    counts.push({name,n,tone:panel?name==="gone"?"muted":"role":TONES[name]});
  }
  if(!counts.length)throw new StageError(line,"units needs counts: units 64: kept 16, added 8, removed 4");
  docBudget().charge("units expansion",total,total*8);
  counts.push({name:"remaining",n:total-used,tone:"muted"});return counts;
}
registerBlock({
  word: "units", kind: "head",panel:true,
  parse(inp,ctx): Units {
    docBudget().charge("units source", inp.arg.length + 1, inp.arg.length);
    if(inp.body.length){
      const old=colon(inp.arg);if(old&&/^\d+$/.test(old[0]))throw new StageError(inp.body[0].n,"counted units is one line; for a panel write units <caption> with indented role total: counts rows");
      const [title,...note]=inp.arg.split(" | ");if(!title.trim())throw new StageError(inp.line,"a units panel needs a caption");
      const rows:NonNullable<Units["rows"]>=[];
      const seen=new Set<string>(),text:NonNullable<Units["text"]>=[];let total=0;
      for(const l of inp.body){
        docBudget().charge("units panel rows",l.t.length+1,l.t.length);
        if(l.ind!==inp.body[0].ind)throw new StageError(l.n,"units panel rows have one indentation level; line the rows up");
        const c=colon(l.t),candidate=c&&/^([\w-]+)(?: \(([\w-]+)\))? (\S+)$/.exec(c[0]);
        const head=candidate&&(ctx.roles.has(candidate[1])||candidate[2]||/^[+-]?\d/.test(candidate[3]))?candidate:null;
        if(!head){if(!rows.length)throw new StageError(l.n,"a units panel starts with role <positive whole total>: kept 8, leaving 4");text.push({s:l.t.startsWith("~ ")?l.t.slice(2):l.t,muted:l.t.startsWith("~ ")});continue;}
        if(text.length)throw new StageError(l.n,"put all counted rows before the panel text");
        const role=head[1],badge=head[2]||role,n=/^\d+$/.test(head[3])?+head[3]:NaN;
        if(!Number.isSafeInteger(n)||n<1)throw new StageError(l.n,"a units panel row is role <positive whole total>: kept 8, leaving 4");
        if(!ctx.roles.has(role))throw new StageError(l.n,`"${role}" is not a role; use one declared by the page`);
        if(!ctx.roles.has(badge))throw new StageError(l.n,`"${badge}" is not a badge role; use one declared by the page`);
        const key=role+":"+badge;if(seen.has(key))throw new StageError(l.n,`unit row "${role}" with badge "${badge}" repeats; combine its counts`);seen.add(key);
        rows.push({role,badge,total:n,counts:groups(c![1],n,l.n,true)});total+=n;
      }
      return {title:title.trim(),note:note.join(" | ").trim(),rows,text,total,counts:[]};
    }
    const c = colon(inp.arg), total = c && /^\d+$/.test(c[0]) ? +c[0] : NaN;
    if (!Number.isSafeInteger(total) || total < 1) throw new StageError(inp.line, "units names a positive whole total: units 64: kept 16, added 8, removed 4");
    // Validate the requested expansion during parsing as well, so doccheck refuses a tiny hostile source.
    return { total, counts:groups(c![1],total,inp.line) };
  },
  layout(u: Units, box) {
    // Charge before allocating or walking the counted grid: a tiny source cannot request unbounded work.
    docBudget().charge("units grid", u.total, u.total * 8);
    if(u.rows){
      const items:Item[]=[];let y=0,lastEnd:{x:number;y:number;role:string}|undefined;
      for(const s of wrap(u.title||"Units",box.w-8,"lane",Infinity)){items.push({k:"text",x:4,y:y+13,s,f:"lane",ink:"ink"});y+=16;}y+=6;
      for(const [row,r] of u.rows.entries()){
        docBudget().charge("units panel row",r.counts.length+1);
        // a wide panel draws the pods as large upright squares across its width (as the originals); a phone keeps small ones
        // a phone keeps its squares readable (9 px, 2 px apart at least, rows 3 px apart) and wraps them onto even rows rather than shrinking them
        const wide=!box.narrow,fit=Math.max(1,Math.floor((box.w-34)/11)),cols=wide?Math.max(1,Math.min(40,r.total,Math.floor((box.w-34)/4))):Math.max(1,Math.ceil(r.total/Math.ceil(r.total/Math.min(40,fit)))),pitch=Math.min(wide?20:13,(box.w-34)/cols),size=Math.max(2,Math.min(wide?17:9,wide?pitch*0.85:pitch-2)),tall=wide?Math.round(size*1.35):size,rowPitch=wide?Math.max(12,tall+5):tall+3;
        items.push({k:"box",x:2,y:y-2,w:20,h:20,r:5,fill:`role:${r.badge}:soft`,stroke:`role:${r.badge}:line`,bar:{kind:"chip",label:r.badge[0],id:`unit-panel:${row}:badge`,role:r.badge}},
          {k:"text",x:12,y:y+12,s:r.badge[0],f:"chip",ink:`role:${r.badge}:ink`,anchor:"middle"});
        let index=0;
        for(const group of r.counts)for(let i=0;i<group.n;i++,index++){
          docBudget().charge("units panel cell",1);const muted=group.tone==="muted";
          items.push({k:"box",x:30+index%cols*pitch,y:y+Math.floor(index/cols)*rowPitch,w:size,h:tall,r:wide?3:1,fill:muted?"surface-2":`role:${r.role}:soft`,stroke:muted?"scn-faint-edge":`role:${r.role}:line`,thick:group.name==="leaving",cls:"scn-shape stg-unit",id:`unit-panel:${row}:${index}`,bar:{kind:"unit",id:`unit-panel:${row}:${index}`,label:group.name,...(muted?{}:{role:r.role})}});
        }
        // the note goes under the last group of the last row when that group is not the first (the pods that leave)
        const lastGroup=r.counts.filter(g=>g.n).at(-1);
        lastEnd=lastGroup&&lastGroup!==r.counts.find(g=>g.n)?{x:30+(r.total-1)%cols*pitch+size,y:y+(Math.ceil(r.total/cols)-1)*rowPitch+tall,role:r.role}:undefined;
        y+=Math.max(18,Math.ceil(r.total/cols)*rowPitch)+8;
      }
      if(u.note&&lastEnd&&measure(u.note,"sub")<=lastEnd.x-4){y=Math.max(y-8,lastEnd.y+4);items.push({k:"text",x:lastEnd.x,y:y+11,s:u.note,f:"sub",ink:`role:${lastEnd.role}:ink`,anchor:"end"});y+=20;}
      else if(u.note)for(const s of wrap(u.note,box.w-8,"sub",Infinity)){items.push({k:"text",x:4,y:y+11,s,f:"sub",ink:"muted"});y+=16;}
      for(const line of u.text||[]){const f=line.muted?"sub":"body";for(const s of wrap(line.s,box.w-8,f,Infinity)){items.push({k:"text",x:4,y:y+13,s,f,ink:line.muted?"muted":"ink"});y+=20;}}
      return {h:y+4,items};
    }
    const items: Item[] = [], cols = Math.max(1, Math.min(32, 2 ** Math.ceil(Math.log2(Math.sqrt(u.total * 2))), Math.floor((box.w - 8) / 18)));
    let y = 0;
    for (const s of wrap(`${u.total} units`, box.w - 8, "lane", 2)) { items.push({ k: "text", x: 4, y: y + 13, s, f: "lane", ink: "ink" }); y += 16; }
    y += 8; let index = 0;
    for (const group of u.counts) {
      docBudget().charge("units legend", group.name.length + 1);
      for (let i = 0; i < group.n; i++, index++) {
        const x = 4 + (index % cols) * 18, yy = y + Math.floor(index / cols) * 18;
        items.push({ k: "box", x, y: yy, w: 14, h: 14, r: 2, fill: group.tone === "muted" ? "surface-2" : `${group.tone}:soft`, stroke: group.tone === "muted" ? "scn-faint-edge" : `${group.tone}:line`, cls: "scn-shape stg-unit", id: `unit:${index}`, bar: { kind: "unit", id: index, label: group.name } });
      }
    }
    y += Math.ceil(u.total / cols) * 18 + 8;
    for (const group of u.counts) {
      if (!group.n && group.name === "remaining") continue;
      const yy = y;
      items.push({ k: "box", x: 4, y: yy + 1, w: 12, h: 12, r: 2, fill: group.tone === "muted" ? "surface-2" : `${group.tone}:soft`, stroke: group.tone === "muted" ? "scn-faint-edge" : `${group.tone}:line` });
      for (const s of wrap(`${group.name} ${group.n}`, box.w - 30, "sub", 2)) { items.push({ k: "text", x: 24, y: y + 11, s, f: "sub", ink: "ink" }); y += 14; }
      y += 4;
    }
    return { h: y + 4, items };
  },
  facts(u: Units, step) {
    docBudget().charge("units facts", u.counts.length + 1);
    if(u.rows)return [`${u.title}:`,...u.rows.map(r=>{docBudget().charge("units panel facts",r.counts.length+r.role.length+1);return `${r.role}${r.badge!==r.role?" ("+r.badge+")":""}: ${r.total} units, ${r.counts.filter(g=>g.n).map(g=>`${g.name} ${g.n}`).join(", ")}.`;}),...(u.note?[u.note]:[]),...(u.text||[]).map(l=>l.s)];
    return step ? [] : [`${u.total} units: ${u.counts.map((g) => `${g.name} ${g.n}`).join(", ")}.`];
  },
} satisfies StageBlock<Units>);
