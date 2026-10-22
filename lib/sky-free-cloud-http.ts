import {bindSkyAgentFreeCloud} from './sky-agent-free-cloud.ts';
import {SkyAgentLibraryError} from './sky-agent-library.ts';
import { runFreeCloudText, type FreeCloudRuntime } from './sky-free-cloud.ts';
import {backgroundEnabled} from './sky-free-cloud-background.ts';
import { WorkError } from './workflow.ts';
export async function freeCloudTextHttp(request: Request, db: Pick<D1Database,'prepare'|'batch'>, owner: string, runtime: FreeCloudRuntime, fetcher?: typeof fetch, clock?: () => number) {
  const headers={'Cache-Control':'no-store'};
  try {
    const raw=await request.text();
    if(new TextEncoder().encode(raw).byteLength>50000) throw new WorkError('依頼が長すぎます。',413);
    const value=JSON.parse(raw) as Record<string,unknown>;
    if(!value || typeof value!=='object' || Array.isArray(value)) throw new WorkError('依頼の形式を確認してください。');
    if(typeof value.id!=='string'||typeof value.prompt!=='string'||typeof value.model!=='string') throw new WorkError('依頼の形式を確認してください。');
    if(value.background===true&&!backgroundEnabled(runtime,owner))throw new WorkError("バックグラウンド実行が未接続です。",503);
    const bound=await bindSkyAgentFreeCloud(db,owner,value);
    const job=await runFreeCloudText({db,owner,id:value.id,prompt:bound.prompt,agentBinding:bound.agentBinding,model:value.model,consent:value.consent===true,autoContinue:value.autoContinue===true,enqueue:value.background===true,runtime,fetcher,clock});
    const record=job.freeCloud;
    if(record?.state==='waiting'||record?.state==='queued') return Response.json({id:job.id,state:record.state,retryAt:record.retryAt,retryDeadline:record.retryDeadline,attempts:record.attempts},{status:202,headers});
    if(record?.state!=='completed') return Response.json({error:record?.error || '実行中または結果未確認です。同じ依頼を再送しません。',id:job.id,state:record?.state},{status:409,headers});
    return Response.json({id:job.id,text:record.text,model:record.model,reportedModel:record.reportedModel,providerResponseId:record.providerResponseId,attempts:record.attempts,
      usage:{inputTokens:record.inputTokens,outputTokens:record.outputTokens,chargeMinor:0,currency:'USD',basis:'anonymous-classic-free-tier'}},{headers});
  }catch(error){return Response.json({preSend:error instanceof SkyAgentLibraryError,error:(error instanceof WorkError || error instanceof SkyAgentLibraryError)?error.message:'無料Cloudの結果を確認できません。'},{status:(error instanceof WorkError || error instanceof SkyAgentLibraryError)?error.status:400,headers});}
}
