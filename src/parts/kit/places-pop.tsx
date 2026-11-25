// Map/calendar anchors share the package hover card, including its dismissal and sheet behavior.
import React, {useRef} from "react";
import {usePopover, type PopData as CardData} from "./popover";
import {useDh} from "../../react/context";
import {applyUrlPolicy} from "../../safety";
type Data = {id:string;title:string;meta?:string;text?:string;tone?:string;actions?:{label:string;href?:string;onClick?:()=>void}[]};
type Open = {data:Data;at:{x:number;y:number}};
export function usePop(host:React.RefObject<HTMLElement|null>,enabled=true) {
  const base=usePopover(host), records=useRef(new Map<string,Open>()), {urlPolicy}=useDh();
  const card=(d:Data):CardData=>({...d,actions:d.actions?.flatMap(a=>{
    const href=a.href ? applyUrlPolicy(a.href,"link",urlPolicy) : undefined;
    return a.href && !href ? [] : [{label:a.label,href:href||undefined,run:a.onClick}];
  })});
  const show=(o:Open)=>{if(!enabled)return;records.current.set(o.data.id,o);base.showAt(o.data.id,card(o.data),o.at);};
  const anchor=(id:string,get:(el:Element)=>Open)=>{
    const call=(name:"onPointerEnter"|"onPointerLeave"|"onFocus"|"onBlur"|"onClick",e:any)=>{
      if(!enabled)return;const o=get(e.currentTarget);if(!o)return;records.current.set(o.data.id,o);
      if(name==="onClick" && e.detail===0 && base.openId===id)return;
      (base.bind(id,card(o.data),o.at)[name] as (e:any)=>void)(e);
    };
    return {"data-pop-id":id,"aria-expanded":base.openId===id,
      onPointerEnter:(e:React.PointerEvent)=>call("onPointerEnter",e),onPointerLeave:(e:React.PointerEvent)=>call("onPointerLeave",e),
      onFocus:(e:React.FocusEvent)=>call("onFocus",e),onBlur:(e:React.FocusEvent)=>call("onBlur",e),onClick:(e:React.MouseEvent)=>call("onClick",e)};
  };
  return {anchor,show,close:base.hide,node:base.node,open:base.openId?records.current.get(base.openId)??null:null};
}
