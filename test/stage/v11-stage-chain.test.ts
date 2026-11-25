// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import{beforeEach,expect,test}from'bun:test';import{compileStage,layoutStage as layoutOnce,STAGE_WORK,STAGE_MEMORY}from "../../src/core/stage";import{beginDocument,newBudget}from "../../src/core/stage-budget";
// one plan on a stage budget of its own, as the stage view lays it out (site/src/stage.tsx stageWork)
const layoutStage=(m:Parameters<typeof layoutOnce>[0],w:number)=>{beginDocument(newBudget(STAGE_WORK,STAGE_MEMORY));return layoutOnce(m,w);};
const roles={job:1,server:2},head='## Readers\njob a1,a2,a3: Reader\n## Bridge\nserver bd: Bridge\n## Store\nserver pl: Store';const compile=(raw:string)=>compileStage(head,[{title:'Begin',raw,line:20},{title:'Hold',raw:'',line:30}],1,{},roles);
beforeEach(()=>beginDocument());
for(const[chain,plain]of[
 ['a1,a2,a3 --> bd --> pl','a1,a2,a3 --> bd\nbd --> pl'],
 ['keep a1,a2 -> bd (server) x2: saved copy --> pl: saved','keep a1,a2 -> bd (server) x2: saved copy\nkeep bd --> pl: saved'],
 ['a1 <- bd: reply --> pl (bad): dropped','a1 <- bd: reply\nbd --> pl (bad): dropped'],
]as const)test(`a connector chain is exactly its separate hops: ${chain}`,()=>{const a=compile(chain),b=compile(plain);expect(a.errors).toEqual([]);expect(b.errors).toEqual([]);const shape=(c:typeof a)=>c.model.steps[0].edges.map(({line,hop,...e})=>e);expect(shape(a)).toEqual(shape(b));for(const w of[1180,356,326]){const p=layoutStage(a.model,w),q=layoutStage(b.model,w);expect(p.h).toBe(q.h);expect(p.items).toEqual(q.items);}});
for(const raw of['a1 -> missing --> pl','a1 -> bd --> missing','a1 -> bd (missing) --> pl','a1 -> bd x2 --> missing'])test(`each chained hop keeps ordinary refusals: ${raw}`,()=>{const c=compile(raw);expect(c.errors.length).toBeGreaterThan(0);expect(c.errors.every(e=>e.line===21)).toBe(true);});
test('arrows quoted in a connector label and arrows in note prose are not chains',()=>{expect(compile('a1 -> bd: "first -> next -> final"').model.steps[0].edges).toHaveLength(1);const c=compile('note: first -> next -> final');expect(c.errors).toEqual([]);expect(c.model.steps[0].notes).toHaveLength(1);expect(c.model.steps[0].edges).toHaveLength(0);});
test('one source line cannot bypass the 400-connector cap',()=>{const c=compile(Array.from({length:402},(_,i)=>i%2?'bd':'a1').join(' -> '));expect(c.errors.some(e=>e.msg.includes('at most 400 connectors'))).toBe(true);expect(c.model.steps[0].edges.length).toBeLessThanOrEqual(400);});
