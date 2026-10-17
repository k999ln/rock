import { assertSafeOutbound } from '../toolkits/spider-guard/detector.mjs';
import { applyWorkCommand, createWorkJob, WorkError, type WorkJob } from './workflow.ts';
import { workStore } from './work-store.ts';
import { skyRecurringUsage } from './sky-recurring-plan.ts';
import type { ModelCandidate } from './sky-model-routing.ts';

const ORIGIN = 'https://text.pollinations.ai';
export const CLASSIC_FREE_SOURCE = 'https://raw.githubusercontent.com/pollinations/pollinations/master/APIDOCS.md';
export type FreeCloudRuntime = { SKY_FREE_CLOUD_ENABLED?: string; SKY_FREE_CLOUD_OWNER_ID?: string };
type DB = Pick<D1Database, 'prepare' | 'batch'>;
export function freeCloudEnabled(runtime: FreeCloudRuntime, owner: string) {
  return runtime.SKY_FREE_CLOUD_ENABLED === 'true' && !!owner && runtime.SKY_FREE_CLOUD_OWNER_ID === owner;
}
export async function discoverFreeCloudModels(fetcher: typeof fetch = fetch): Promise<ModelCandidate[]> {
  const response = await fetcher(`${ORIGIN}/models`, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new WorkError(`無料Cloudのモデル一覧 HTTP ${response.status}`, 503);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 20).flatMap(row => row && row.tier === 'anonymous' &&
    typeof row.name === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(row.name) &&
    row.input_modalities?.includes('text') && row.output_modalities?.includes('text')
    ? [{ provider: 'pollinations' as const, model: row.name, cloud: true }] : []);
}

export async function runFreeCloudText(input: {
  db: DB; owner: string; id: string; prompt: string; model: string;
  consent: boolean; runtime: FreeCloudRuntime; fetcher?: typeof fetch; clock?: () => number; autoContinue?: boolean; retryClock?: () => number;
}) {
  if (!freeCloudEnabled(input.runtime, input.owner) || input.consent !== true)
    throw new WorkError('無料Cloudの接続設定と外部送信への同意が必要です。', 403);
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(input.id) || !input.prompt.trim() || input.prompt.length > 12000)
    throw new WorkError('依頼の形式を確認してください。', 400);
  assertSafeOutbound({ prompt: input.prompt });
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({model:input.model,prompt:input.prompt})))), b=>b.toString(16).padStart(2,'0')).join('');
  const store = workStore(input.db);
  const retryNow=input.retryClock ?? Date.now;
  const saved = await store.get(input.owner, input.id);
  if (saved) {
    if (saved.freeCloud?.requestDigest !== digest) throw new WorkError('同じ依頼IDの内容が一致しません。',409);
    // Only a confirmed FREE_LIMIT rejection can resume, never an ambiguous send.
    if (saved.freeCloud.state!=='waiting' || input.autoContinue!==true || !saved.freeCloud.autoContinue ||
        retryNow() < (saved.freeCloud.retryAt ?? Infinity) || retryNow() >= (saved.freeCloud.retryDeadline ?? 0) ||
        (saved.freeCloud.attempts ?? 0)>=5) return saved;
  }
  const plan = await skyRecurringUsage(input.db,input.owner,(input.clock ?? Date.now)());
  if (plan.reason !== 'available') throw new WorkError(`Skyプランで停止しています: ${plan.reason}`,403);
  const fetcher = input.fetcher ?? fetch;
  const candidates = await discoverFreeCloudModels(fetcher);
  if (!candidates.some(m=>m.model===input.model)) throw new WorkError('選択モデルは現在の無料対象ではありません。',409);
  const fresh = createWorkJob({id:input.id,templateId:'free-cloud-text',title:'無料Cloudの文章生成'});
  fresh.freeCloud = { requestDigest:digest, model:input.model, state:'prepared', source:CLASSIC_FREE_SOURCE, autoContinue:input.autoContinue===true,retryDeadline:retryNow()+600000,attempts:0 };
  const created = saved ?? await store.create(input.owner,fresh);
  if (!created || created.freeCloud?.requestDigest!==digest) throw new WorkError('依頼IDが競合しています。',409);
  if (created.freeCloud.state!=='prepared' && !(saved && created.freeCloud.state==='waiting')) return created;
  const claimed: WorkJob = {...created,revision:created.revision+1,updatedAt:new Date().toISOString(),freeCloud:{...created.freeCloud,state:'sending',attempts:(created.freeCloud.attempts??0)+1,retryAt:undefined,error:undefined}};
  // Existing owner/revision CAS is the one-time send claim; a crash leaves an uncertain job, not a retry.
  if (!await store.update(input.owner,claimed,created.revision)) return (await store.get(input.owner,input.id))!;
  try {
    const currentPlan = await skyRecurringUsage(input.db,input.owner,(input.clock ?? Date.now)());
    if (currentPlan.reason!=='available') throw new WorkError(`Skyプランで停止しています: ${currentPlan.reason}`,403);
    const startedAt = Date.now();
    const response = await fetcher(`${ORIGIN}/openai`, {
      method:'POST', redirect:'manual', signal:AbortSignal.timeout(180000),
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:input.model,messages:[{role:'user',content:input.prompt}],max_tokens:1024,stream:false}),
    });
    // A 402 may be an IP cooldown OR an upstream credit refusal. Do not claim
    // that waiting will fix it without the provider's Retry-After evidence.
    if (!response.ok) {
      const rawRetry=response.headers.get('Retry-After');
      const seconds=rawRetry && /^\d{1,6}$/.test(rawRetry) ? Number(rawRetry) : null;
      // Require the documented rejection code, not status alone: upstream 402,
      // timeout, missing usage, redirects and malformed bodies must never retry.
      if (response.status===402 && seconds!==null && seconds>=1 && seconds<=300 && claimed.freeCloud?.autoContinue) {
        const rejection=await response.json().catch(()=>null) as {error?:{code?:unknown}} | null;
        if (rejection?.error?.code==='FREE_LIMIT' && claimed.freeCloud.attempts!<5 &&
            retryNow()+seconds*1000 < claimed.freeCloud.retryDeadline!) {
          const waiting:WorkJob={...claimed,revision:claimed.revision+1,updatedAt:new Date().toISOString(),
            freeCloud:{...claimed.freeCloud,state:'waiting',retryAt:retryNow()+seconds*1000,error:'無料枠の回復を待っています。'}};
          if (!await store.update(input.owner,waiting,claimed.revision)) throw new WorkError('待機状態の保存を確認できません。',409);
          return waiting;
        }
      }
      const limited=response.status===402 || response.status===429;
      throw new WorkError(limited
        ? `無料CloudがHTTP ${response.status}を返しました。${seconds!==null ? `Providerの待機指定: ${seconds}秒。待機後に「新しい依頼」から再試行してください。` : 'Providerから待機時間の指定がありません。無料枠の利用可否を確認してください。'}Sky契約の未払いとは別です。支払いや有料切替・自動再送は行いません。`
        : 'Cloudの実行結果を確認できません。',response.status);
    }
    const body = await response.json() as {id?: unknown; model?: unknown; user_tier?: unknown; choices?: {finish_reason?: unknown;message?: {content?: unknown;tool_calls?: unknown}}[]; usage?:{prompt_tokens?:unknown;completion_tokens?:unknown;total_tokens?:unknown}};
    const choice=body.choices?.[0], usage=body.usage;
    if (body.user_tier!=='anonymous' || choice?.finish_reason!=='stop' ||
      (choice.message?.tool_calls !== undefined && (!Array.isArray(choice.message.tool_calls) || choice.message.tool_calls.length!==0)) || typeof choice.message?.content!=='string' || !choice.message.content.trim() || choice.message.content.length>24000 ||
      typeof body.id!=='string' || !body.id || body.id.length>200 || typeof body.model!=='string' || body.model.length>200 ||
      !usage || !Number.isSafeInteger(usage.prompt_tokens) || !Number.isSafeInteger(usage.completion_tokens) ||
      (usage.prompt_tokens as number)<0 || (usage.completion_tokens as number)<0 || usage.total_tokens!==(usage.prompt_tokens as number)+(usage.completion_tokens as number))
      throw new WorkError('Cloudの完了・使用量を確認できません。再送せず確認してください。',502);
    const completed = applyWorkCommand(claimed,{id:crypto.randomUUID(),action:'record',stepId:'generate',tool:'sky-free-cloud-text',transport:'browser',outcome:'passed',sample:false,durationMs:Math.max(0,Date.now()-startedAt)},claimed.revision);
    completed.freeCloud={...claimed.freeCloud!,state:'completed',text:choice.message.content,providerResponseId:body.id,reportedModel:body.model,
      inputTokens:usage.prompt_tokens as number,outputTokens:usage.completion_tokens as number,chargeMinor:0};
    if (!await store.update(input.owner,completed,claimed.revision)) throw new WorkError('成果の保存を確認できません。再送せず確認してください。',409);
    return completed; // Work remains in review; model output is not Tool success or user approval.
  } catch(error) {
    const uncertain:WorkJob={...claimed,revision:claimed.revision+1,updatedAt:new Date().toISOString(),freeCloud:{...claimed.freeCloud!,state:'unconfirmed',error:error instanceof WorkError ? error.message : 'Cloud実行の結果が不明です。再送しません。'}};
    await store.update(input.owner,uncertain,claimed.revision);
    throw error;
  }
}
