import type { EveRuntimePending } from './eve-runtime-sync.ts';
import { createRuntimeEveWorkPort } from './eve-runtime-work-port.ts';
type Request = Parameters<typeof createRuntimeEveWorkPort>[0]['api'];
/** Historical control exposes only same-ID read/stop, never prepare or start. */
export function createRuntimeEveHistoryControl(options:{owner:string;threadId:string;api:Request;current:()=>boolean}) {
 function bound(expected:EveRuntimePending) {
  if(!options.current()||expected.threadId!==options.threadId)throw Error('本人か会話が変わりました。仕事を読み直してください。');
  const reference={id:expected.id,agentId:expected.agentId,agentSha256:expected.agentSha256,modelSha256:expected.model.sha256,input:expected.input};
  const api:Request=async<T>(path:string,init?:RequestInit)=>{
   let allowed=(!init?.method||init.method==='GET')&&path==='/api/eve/runtime?requestId='+encodeURIComponent(reference.id);
   if(init?.method==='PUT'&&path==='/api/eve/runtime'&&typeof init.body==='string'){
    try{const value=JSON.parse(init.body);allowed=value.action==='stop'&&value.request?.id===reference.id&&value.request.confirm==='stop-owner-local-text';}catch{allowed=false;}
   }
   // A missing record that previously existed does not prove no host received it.
   // Keep that job unknown instead of creating a first-delivery start fence.
   if(!allowed)throw Error('元の仕事の保存記録を確認できません。停止は未確認です。送り直さず復旧を確認してください。');
   return options.api<T>(path,init);
  };
  const port=createRuntimeEveWorkPort({owner:options.owner,threadId:options.threadId,deviceId:expected.deviceId,agentId:expected.agentId,agentSha256:expected.agentSha256,modelSha256:expected.model.sha256,modelScheme:expected.model.scheme,api,continuing:options.current});
  return {port,reference};
 }
 return {
  inspect(expected:EveRuntimePending){const {port,reference}=bound(expected);return port.read(reference);},
  requestStop(expected:EveRuntimePending){const {port,reference}=bound(expected);return port.stop(reference);},
 };
}
