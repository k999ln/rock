'use client';
import { useEffect,useRef,useState } from 'react';
import { queueEveSourceIntent } from './eve-source-client';
import type { SkyHubPlugin } from './sky-hub';
/** One explicit selection at a time; late/unmounted requests never navigate. */
export function useEveSourceHandoff(navigate:()=>void,onError:(message:string)=>void) {
  const controller=useRef<AbortController|null>(null);
  const [preparing,setPreparing]=useState(false);
  useEffect(()=>()=>{controller.current?.abort();},[]);
  async function prepare(plugin:SkyHubPlugin,text:string) {
    if(controller.current) return;
    const request=new AbortController();controller.current=request;setPreparing(true);
    try {
      const permit=await queueEveSourceIntent(sessionStorage,plugin,text,fetch,request.signal);
      if(!request.signal.aborted && permit.isCurrent()) navigate();
    } catch(error) {if(!request.signal.aborted) onError(error instanceof Error?error.message:'Eveへ渡せませんでした。');}
    finally {if(controller.current===request){controller.current=null;if(!request.signal.aborted)setPreparing(false);}}
  }
  return {prepare,preparing};
}
