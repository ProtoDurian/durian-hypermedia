import {expect,test} from "bun:test";
import React from "react";
import {renderToString} from "react-dom/server";
import {parse,check,LIMITS} from "../src/index";
import {Budget,BudgetError,pageBudget} from "../src/core/budget";
import {DhDocument} from "../src/react/strict";
import {parseMap,MAP_CAPS} from "../src/parts/map/model";
import {calendarOf} from "../src/parts/calendar/model";
import {mapProvider,routeVia} from "../src/react/map-providers";

const input=(body:string)=>({body,head:body,bodyLine:2,line:1,attrs:{},steps:[]});
test("static globe is flat, contains boundary geometry on the server and calls no host provider",()=>{
 let calls=0;const doc=parse('```map static view=globe\nfill DE 83.2\nfill FR 68.4\n```');
 const html=renderToString(<DhDocument doc={doc} map={{openBasemap:async()=>{calls++;throw Error("unexpected provider");}}}/>);
 expect(calls).toBe(0);expect(html).toContain('data-dh-static="true"');expect(html).toContain('data-based="still"');
 expect(html).toContain('data-code="DE"');expect(html).toContain('data-code="FR"');expect(html).toContain('M');
 expect(html).not.toContain('Loading the globe');expect(html).not.toContain('map-hint');expect(html).not.toContain('map-ctl');
});
test("static calendar keeps every occurrence and long words without a control row",()=>{
 const doc=parse('```calendar static title="Work week" tz=UTC\ncalendar team "Team" [c2]\n2026-11-23 09:00-09:20 A long title remains readable in team every weekday times=5\n2026-11-25 all day Release @ Studio note="All the notes remain"\n```');
 expect(check(doc).filter(p=>p.level==="error")).toEqual([]);
 const html=renderToString(<DhDocument doc={doc}/>);
 expect(html.match(/A long title remains readable/g)?.length).toBe(5);expect(html).toContain('All the notes remain');expect(html).toContain('Studio');expect(html).toContain('UTC');
 expect(html).not.toContain('cal-bar');expect(html).not.toContain('<button');
});
test("static calendar sorts repeated and single events by their displayed date",()=>{
 const doc=parse('```calendar static tz=UTC\n2026-11-23 09:00-09:20 Morning every day times=4\n2026-11-24 10:00-11:00 Tuesday review\n```');
 const html=renderToString(<DhDocument doc={doc}/>);
 expect(html.indexOf('Tuesday review')).toBeGreaterThan(html.indexOf('Tue 24 Nov'));
 expect(html.indexOf('Tuesday review')).toBeLessThan(html.indexOf('Wed 25 Nov'));
});
test("a single named calendar still has its filter in server output",()=>{
 const html=renderToString(<DhDocument doc={parse('```calendar tz=UTC\ncalendar team "Team" [c2]\n2026-11-23 09:00-10:00 Meeting in team\n```')}/>);
 expect(html.includes('cal-chipbtn')).toBe(true);
});
test("host caps reach the registered parsers",()=>{
 const map=parse('```map\nfill DE 1\nfill FR 2\n```',{limits:{mapFills:1}});
 expect(check(map).map(p=>p.message).join()).toContain('cap is 1');
 const cal=parse('```calendar\n2026-11-23 09:00-10:00 One every day times=4\n```',{limits:{calendarOccurrences:3}});
 expect(check(cal).map(p=>p.message).join()).toContain('1 to 3');
});
test("map and calendar share one nonrenewable page budget",()=>{
 const budget=new Budget({steps:300,values:100,chars:400});
 parseMap(input('place a "One" 1, 1'),budget);
 expect(()=>calendarOf(input('2026-11-23 09:00-10:00 Repeated every day times=100'),budget)).toThrow(BudgetError);
 expect(()=>parseMap(input('place a "Again" 1, 1'),budget)).toThrow(BudgetError);
});
test("doubling map lines and calendar occurrences doubles charged work",()=>{
 for(const kind of ['map','calendar']){
   const work=(n:number)=>{const b=new Budget({steps:1e7,values:1e7,chars:1e7});
     if(kind==='map')parseMap(input(Array.from({length:n},(_,i)=>`place p${i} "Place" 1, 1`).join('\n')),b);
     else calendarOf(input(`2026-11-23 09:00-10:00 Repeat every day times=${n}`),b);
     return b.steps;};
   const a=work(20),b=work(40);expect(b).toBeGreaterThan(a);expect(b).toBeLessThanOrEqual(a*2.2);
 }
});
test("provider adapter is inert until the host opens it",()=>{
 const p=mapProvider({provider:'google'});expect(p.provider).toBe('google');expect(p.route).toBeUndefined();expect(typeof p.openBasemap).toBe('function');
});
test("a host router is bounded and invalid geometry remains a dashed straight route",async()=>{
 const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(req){const key=new URL(req.url).pathname.split('/')[1];
   if(key==='large')return new Response('x'.repeat(1_000_001));
   return Response.json({routes:[{geometry:{coordinates:key==='bad'?[[0,0],[181,0]]:[[1,2],[3,4]]}}]});}});
 try{
   const stops=[{lat:2,lng:1},{lat:4,lng:3}];
   const host=(path:string)=>({routing:{provider:'osrm' as const,url:`http://127.0.0.1:${server.port}/${path}`}});
   expect(await routeVia(host('good'),'walk',stops)).toEqual(stops);
   expect(await routeVia(host('bad'),'walk',stops)).toBeNull();expect(await routeVia(host('large'),'walk',stops)).toBeNull();expect(await routeVia(host('good'),'transit',stops)).toBeNull();
 }finally{server.stop(true);}
});
