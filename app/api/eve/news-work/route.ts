import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { eveHistoryKeys, EveHistoryError } from '@/lib/eve-history';
import { runEveNewsRepair } from '@/lib/eve-news-repair';
import { eveNewsWorkStore } from '@/lib/eve-news-work';
import { WorkError } from '@/lib/workflow';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new WorkError('JSONで送信してください。', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new WorkError('入力がありません。');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length;
      if (size > 131072) { await reader.cancel(); throw new WorkError('資料と草稿は128 KiB以内にしてください。', 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}
async function handle(request: Request, method: 'GET' | 'POST' | 'PATCH') {
  try {
    const owner = await requestUser(request);
    if (method !== 'GET' && request.headers.get('origin') !== new URL(request.url).origin) throw new Error('ORIGIN');
    const db = database(), config = env as unknown as { EVE_HISTORY_KEYRING?: string; ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string; EVE_NEWS_LOCAL_REPAIR_ENABLED?: string };
    let keys;
    try { keys = eveHistoryKeys(config.EVE_HISTORY_KEYRING); }
    catch (error) { if (method === 'POST') throw error; }
    const store = eveNewsWorkStore(db, owner, keys);
    if (method === 'GET') {
      const query = new URL(request.url).searchParams;
      if(query.get('learning')==='collection'){const selection=query.get('jobs');if(!selection||selection.length>4000)throw new WorkError('選択した仕事を確認してください。');return json(await store.learningCollection({jobs:JSON.parse(selection),split:query.get('split')}));}
      if(query.has('learning')){if(!query.has('id')||!query.has('revision'))throw new WorkError('仕事と版を指定してください。');if(!['check','preview'].includes(query.get('learning')!))throw new WorkError('準備データの操作を確認してください。');return json(await store.learning({jobId:query.get('id')??'',revision:Number(query.get('revision')),split:query.get('split'),preview:query.get('learning')==='preview'}));}
      return json(query.has('id') ? { job: await store.get(query.get('id')!) } : { jobs: await store.list(query.get('thread') ?? undefined) });
    }
    const input = await body(request);
    const stopping = method === 'PATCH' && Boolean(input && typeof input === 'object' && 'action' in input && (input.action === 'cancel'||input.action === 'learning-withdraw'));
    if (!stopping && !await rockstarServiceScopeAllowed(db, owner, 'zema', config.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED, env, request)) return missingRockstarServiceScope('Eve');
    if(method==='PATCH'&&input&&typeof input==='object'&&'action' in input&&(input.action==='auto-repair'||input.action==='evaluate-claim')){
      if(config.EVE_NEWS_LOCAL_REPAIR_ENABLED!=='true')throw new WorkError('この実行サーバーではローカルモデル修正を有効にしていません。',503);
      if(!keys)throw new WorkError('会話の暗号化保存を確認してください。',503);
      return json(await runEveNewsRepair(db,owner,keys,input,env));
    }
    return json(method === 'POST' ? await store.create(input) : await store.command(input), method === 'POST' ? 201 : 200);
  } catch (error) {
    if (request.body && !request.bodyUsed && !request.body.locked) void request.body.cancel().catch(() => {});
    if (error instanceof WorkError || error instanceof EveHistoryError) return json({ error: error.message }, error.status);
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'サインインするとEveの仕事を保存・実行できます。' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'この画面から操作してください。' }, 403);
    if (error instanceof SyntaxError || error instanceof TypeError) return json({ error: '入力形式を確認してください。' }, 400);
    return json({ error: '保存済みの仕事を再読込して状態を確認してください。' }, 503);
  }
}
export const GET = (request: Request) => handle(request, 'GET');
export const POST = (request: Request) => handle(request, 'POST');
export const PATCH = (request: Request) => handle(request, 'PATCH');
