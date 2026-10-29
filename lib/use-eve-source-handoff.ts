'use client';
import { useEffect,useRef,useState } from 'react';
import { queueEveSourceIntent, queueEvePostIntent } from './eve-source-client';
import type { SkyHubPlugin } from './sky-hub';
import type { SkySocialPost } from './sky-social';
/** One explicit selection at a time; late/unmounted requests never navigate. */
export function useEveSourceHandoff(navigate:()=>void,onError:(message:string)=>void) {
  const controller=useRef<AbortController|null>(null);
  const [preparing,setPreparing]=useState(false);
  useEffect(()=>()=>{controller.current?.abort();},[]);
  async function run(queue:(signal:AbortSignal)=>ReturnType<typeof queueEveSourceIntent>) {
    if(controller.current) return;
    const request=new AbortController();controller.current=request;setPreparing(true);
    try {
      const permit=await queue(request.signal);
      if(!request.signal.aborted && permit.isCurrent()) navigate();
    } catch(error) {if(!request.signal.aborted) onError(error instanceof Error?error.message:'Eveへ渡せませんでした。');}
    finally {if(controller.current===request){controller.current=null;if(!request.signal.aborted)setPreparing(false);}}
  }
  const prepare=(plugin:SkyHubPlugin,text:string)=>run(signal=>queueEveSourceIntent(sessionStorage,plugin,text,fetch,signal));
  const preparePost=(post:SkySocialPost)=>run(signal=>queueEvePostIntent(sessionStorage,post,fetch,signal));
  return {prepare,preparePost,preparing};
}
