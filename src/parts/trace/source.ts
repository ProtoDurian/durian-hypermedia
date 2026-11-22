import { COLOUR_WORDS, isSpace } from "../kit/text";
export { COLOUR_WORDS, familyOf, indentOf } from "../kit/text";
export { checkAttrs, bodyLines, numberText, type Src, type Issue11 } from "../flame/source";
export { numberOrder } from "../flame/order";
export const colourMsg = (bad: string) => `"[${bad}]" is not a colour word; use ${COLOUR_WORDS.map(w=>`[${w}]`).join(" ")} (no hex values)`;
export function isId(s: string) { if(!s)return false;for(const c of s)if(!((c>="a"&&c<="z")||(c>="A"&&c<="Z")||(c>="0"&&c<="9")||c==="_"||c==="."||c==="-"))return false;return true; }
export function pair(t: string): [string,string] | null {
 const eq=t.indexOf("=");if(eq<1)return null;const k=t.slice(0,eq);
 const first=k[0];if(!((first>="A"&&first<="Z")||(first>="a"&&first<="z")||first==="_"))return null;
 if(!isId(k))return null;const v=t.slice(eq+1);if(v.startsWith('"')&&!v.endsWith('"'))return null;
 return [k,v];
}
/** One forward scan. Quotes inside key=value and bracketed colour words keep their spaces. */
export function tokens(text: string, standaloneQuotes = false): string[] | null {
 const out:string[]=[];let i=0;
 while(i<text.length){
  while(i<text.length&&isSpace(text[i]))i++;if(i===text.length)break;
  const start=i;let quoted=false;
  if(text[i]==="["){i++;while(i<text.length&&text[i]!=="]")i++;if(i<text.length)i++;}
  else{
   while(i<text.length&&!isSpace(text[i])){
    if(text[i]==='"'&&((standaloneQuotes&&i===start)||(i>start&&text[i-1]==="="))){
     quoted=true;i++;let closed=false;
     while(i<text.length){if(text[i]==="\\"){i+=2;continue}if(text[i++]==='"'){closed=true;break}}
     if(!closed || (i<text.length&&!isSpace(text[i])))return null;
    }else i++;
   }
  }
  if(quoted&&i<text.length&&!isSpace(text[i]))return null;
  out.push(text.slice(start,i));
 }
 return out;
}
const quoted=(s:string|undefined)=>s!==undefined&&s.length>=2&&s[0]==='"'&&s[s.length-1]==='"';
export function logLine(text:string): string[] | null {
 const ts=tokens(text,true);if(!ts||ts[0]!=="@log"||ts.length<5||ts.length>6||!quoted(ts[4]))return null;
 if(ts[5]!==undefined&&(!ts[5].startsWith("span=")||ts[5].length===5))return null;
 return [text,ts[1],ts[2],ts[3],ts[4].slice(1,-1),ts[5]?.slice(5)] as string[];
}
export function serviceLine(text:string): [string,string,string|undefined,string|undefined] | null {
 const ts=tokens(text,true);if(!ts||ts[0]!=="@service"||!ts[1])return null;
 let i=2,colour:string|undefined,label:string|undefined;
 if(ts[i]?.startsWith("[")&&ts[i].endsWith("]"))colour=ts[i++].slice(1,-1);
 if(quoted(ts[i]))label=ts[i++].slice(1,-1);
 return i===ts.length?[text,ts[1],colour,label]:null;
}
