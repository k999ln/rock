import type { EveRuntimeExecution, EveRuntimePending } from './eve-runtime-sync.ts';
import { runtimeEveTextExport } from './eve-runtime-export.ts';
type Request = <T>(path:string,init?:RequestInit)=>Promise<T>;
type Page = {ownerUserId:string;threadId:string;pending:EveRuntimePending[];executions:EveRuntimeExecution[];cursor:string|null};
/** A historical draft reader has no execution, claim, registration or stop port. */
export function createRuntimeEveArchiveReader(options:{owner:string;threadId:string;api:Request;current:()=>boolean}) {
 const live=()=>{if(!options.current())throw Error('本人か会話が変わりました。履歴を読み直してください。');};
 const get=async<T>(path:string)=>{live();const value=await options.api<T>(path,{headers:{'x-sky-owner':options.owner}});live();return value;};
 return {
  async page(cursor='') {
   const value=await get<Page>('/api/eve/runtime?savedJobs=1&threadId='+encodeURIComponent(options.threadId)+(cursor?'&cursor='+encodeURIComponent(cursor):''));
   if(value.ownerUserId!==options.owner||value.threadId!==options.threadId||!Array.isArray(value.pending)||value.pending.length>50||!Array.isArray(value.executions)||value.executions.length>50||!(value.cursor===null||(typeof value.cursor==='string'&&value.cursor.length<=2048&&value.cursor!==cursor))||value.pending.some(p=>p.threadId!==options.threadId)||value.executions.some(row=>row.threadId!==options.threadId||!value.pending.some(p=>p.id===row.id&&p.threadId===row.threadId&&p.deviceId===row.deviceId&&p.agentId===row.request.agent.id&&p.agentSha256===row.request.agent.sha256&&p.model.sha256===row.request.model.sha256&&p.model.scheme===row.request.model.scheme)))throw Error('同じ本人と会話の保存成果を確認できません。');
   return {items:value.executions,jobs:value.pending,cursor:value.cursor};
  },
  async draft(expected:EveRuntimeExecution) {
   live();if(expected.threadId!==options.threadId)throw Error('保存成果の会話が異なります。');
   const value=await get<{ownerUserId:string;pending:EveRuntimePending;execution:EveRuntimeExecution|null}>('/api/eve/runtime?requestId='+encodeURIComponent(expected.id));
   const row=value.execution,p=value.pending;
   if(value.ownerUserId!==options.owner||!row||!p||p.id!==expected.id||p.threadId!==options.threadId||p.deviceId!==expected.deviceId||p.input!==expected.input||p.agentId!==expected.request.agent.id||p.agentSha256!==expected.request.agent.sha256||p.model.sha256!==expected.request.model.sha256||p.model.scheme!==expected.request.model.scheme||row.input!==expected.input||row.request.id!==expected.id||row.request.threadId!==options.threadId||row.request.input!==expected.request.input||row.request.agent.name!==expected.request.agent.name||row.request.agent.instructions!==expected.request.agent.instructions||row.request.agent.modelId!==expected.request.agent.modelId||row.request.agent.id!==expected.request.agent.id||row.request.agent.sha256!==expected.request.agent.sha256||row.request.model.id!==expected.request.model.id||row.request.model.sha256!==expected.request.model.sha256||row.request.model.scheme!==expected.request.model.scheme||row.report.model.id!==row.request.model.id||row.report.model.sha256!==row.request.model.sha256||row.report.model.scheme!==row.request.model.scheme)throw Error('保存成果の担当・モデル・本人を確認できません。');
   const file=await runtimeEveTextExport(row,expected);live();return file;
  },
 };
}
