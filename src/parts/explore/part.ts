import { definePart, type PartInput, type PartContext } from "../types";
import { BudgetError } from "../../core/budget";
import { yamlParse, chargeYaml } from "../../host/yaml";
import { runAuthorQuery, type J } from "../log/jq";
import type { QueryCaps } from "../log/query";
import { readCsv, guardData, type DataError } from "./data";
import type { LIMITS } from "./limits";
export interface ExploreCaps { rowsPerNode:number;searchNodes:number;tableRows:number;tableCols:number;stringCut:number }
export interface ExploreData { lang:string;title:string;value:J;query:string;results:J[]|null;queryError:string|null;errors:DataError[];text:string;caps:QueryCaps;display:ExploreCaps }
export const exploreCaps=(l:typeof LIMITS):QueryCaps=>({maxQueryChars:l.exploreQueryChars,readerQueryChars:l.exploreReaderQueryChars,maxDepth:l.exploreQueryDepth,maxResults:l.exploreQueryResults,regexChars:l.exploreRegexChars,regexProgram:l.exploreRegexProgram,regexRepeat:l.exploreRegexRepeat,jsonChars:l.exploreQueryJsonChars,steps:l.exploreReaderSteps,values:l.exploreReaderValues,chars:l.exploreReaderChars});
export function readExplore(input:PartInput,ctx:PartContext):ExploreData {
 const a=input.attrs,lang=a.lang??"json",l=ctx.limits,b=ctx.budget,errors:DataError[]=[],caps=exploreCaps(l);let value:J=null,results:J[]|null=null,queryError:string|null=null;
 if(lang==="toml")throw new Error("TOML explore needs a TOML reader; this build has none");
 if(!["json","yaml","csv"].includes(lang))throw new Error(`unknown data language "${lang}"; use json, yaml or csv`);
 if(input.body.length>l.exploreChars)throw new Error(`the data is ${input.body.length} characters; at most ${l.exploreChars} characters`);
 b.charge(input.body.length);
 for(const k of Object.keys(a)){b.charge(k.length+1);if(!["id","title","query","llm","lang","explore","static"].includes(k))errors.push({line:input.line,msg:`unknown option "${k}" (options: id, title, query, llm)`});}
 try {
  if(lang==="json")value=JSON.parse(input.body);
  else if(lang==="yaml"){const raw=yamlParse(input.body);chargeYaml(raw,b);value=JSON.parse(JSON.stringify(raw??null));}
  else {const r=readCsv(input.body,input.bodyLine,b,l);value=r.rows;errors.push(...r.errors);}
 }catch(e){if(e instanceof BudgetError)throw e;b.charge(0);errors.push({line:input.bodyLine,msg:`the ${lang} data does not parse: ${e instanceof Error?e.message.split("\n")[0]:String(e)}`});}
 if(!errors.length){try{guardData(value,b,l.exploreDepth);}catch(e){if(e instanceof BudgetError)throw e;errors.push({line:input.bodyLine,msg:(e as Error).message});}}
 if(a.query&&!errors.length){try{results=runAuthorQuery(a.query,value,b,caps);}catch(e){if(e instanceof BudgetError)throw e;queryError=(e as Error).message;errors.push({line:input.line,msg:`query=: ${queryError}`});}}
 let end=input.body.length;while(end>0&&input.body[end-1]==="\n")end--;
 let text="```"+lang+" explore"+(a.query?" query="+JSON.stringify(a.query):"")+"\n"+input.body.slice(0,end)+"\n```";
 if(a.query)text+=`\n\n${queryError?`Query \`${a.query}\` could not run: ${queryError}`:`Query \`${a.query}\` gives:\n${(results??[]).map(r=>JSON.stringify(r)).join("\n")}`}`;
 b.charge(text.length,0,text.length);
 return{lang,title:a.title??"",value,query:a.query??"",results,queryError,errors,text,caps,display:{rowsPerNode:l.exploreRowsPerNode,searchNodes:l.exploreSearchNodes,tableRows:l.exploreTableRows,tableCols:l.exploreTableCols,stringCut:l.exploreStringCut}};
}
export default definePart<ExploreData>({name:"explore",form:"fenced",steps:false,llmKind:"own",fences:[{word:"json",flag:"explore"},{word:"yaml",flag:"explore"},{word:"toml",flag:"explore"},{word:"csv",flag:"explore"}],parse:readExplore,llm:d=>d.text,check:d=>d.errors.map(e=>({line:e.line,message:e.msg}))});
