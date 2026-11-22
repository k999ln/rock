import type { AgentFeedbackSummary } from '@/lib/noah-feedback';
type Waiting = {id:string; resolve:(value:AgentFeedbackSummary)=>void; reject:(error:Error)=>void};
let queue:Waiting[]=[], timer:ReturnType<typeof setTimeout>|undefined;
export function readNoahCardFeedback(id:string):Promise<AgentFeedbackSummary> {
  return new Promise((resolve,reject)=>{
    queue.push({id,resolve,reject});
    timer??=setTimeout(()=>{
      const waiting=queue;queue=[];timer=undefined;
      const ids=[...new Set(waiting.map(w=>w.id))];
      for(let start=0;start<ids.length;start+=20){
        const part=ids.slice(start,start+20), receivers=waiting.filter(w=>part.includes(w.id));
        void fetch(`/api/noah/feedback?${new URLSearchParams({ids:part.join(',')})}`,{cache:'no-store'}).then(async r=>{
          const body=await r.json() as {summaries?:AgentFeedbackSummary[]};
          if(!r.ok || !body.summaries)throw Error('評価を読めませんでした。');
          for(const receiver of receivers){const value=body.summaries.find(s=>s.agentId===receiver.id);if(value)receiver.resolve(value);else receiver.reject(Error('評価を読めませんでした。'));}
        }).catch(error=>receivers.forEach(w=>w.reject(error)));
      }
    },25);
  });
}
