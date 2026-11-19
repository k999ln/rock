import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { eveHistoryKeys, EveHistoryError } from '@/lib/eve-history';
import { eveAgentWorkStore } from '@/lib/eve-agent-work';
import { WorkError } from '@/lib/workflow';
import { rockstarServiceScopeAllowed, missingRockstarServiceScope } from '@/lib/rockstar-service-access';
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new WorkError('JSONで送信してください。', 415);
  const reader = request.body?.getReader(); if (!reader) throw new WorkError('入力がありません。');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const p = await reader.read(); if (p.done) break; size += p.value.length; if (size > 12000) { await reader.cancel(); throw new WorkError('入力は12 KB以内にしてください。', 413); } chunks.push(p.value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}
async function handle(request: Request, method: 'GET' | 'POST' | 'PATCH') {
  try {
    const owner = await requestUser(request);
    if (method !== 'GET' && request.headers.get('origin') !== new URL(request.url).origin) throw new Error('ORIGIN');
    const config = env as unknown as { EVE_HISTORY_KEYRING?: string; A2A_INPUT_ENCRYPTION_KEY?: string; SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS?: string; ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }, db = database();
    let keys;
    try { keys = eveHistoryKeys(config.EVE_HISTORY_KEYRING); }
    catch (error) { if (method === 'POST') throw error; }
    const store = eveAgentWorkStore(db, owner, keys, config.A2A_INPUT_ENCRYPTION_KEY, config.SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS);
    if (method === 'GET') { const q = new URL(request.url).searchParams; return json(q.has('id') ? await store.read(q.get('id'), q.get('terms') === '1') : { jobs: await store.list(q.get('thread') ?? '') }); }
    if (method === 'POST' && !await rockstarServiceScopeAllowed(db, owner, 'zema', config.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED, env, request)) return missingRockstarServiceScope('Eve');
    const input = await body(request);
    const creating = method === 'POST' && input && typeof input === 'object' && 'create' in input && input.create === true;
    return json(method === 'POST' ? creating ? await store.create(input) : await store.bind(input) : await store.command(input), creating ? 201 : 200);
  } catch (e) {
    if (request.body && !request.bodyUsed && !request.body.locked) void request.body.cancel().catch(() => {});
    if (e instanceof WorkError || e instanceof EveHistoryError) return json({ error: e.message }, e.status);
    if (e instanceof Error && e.message === 'UNAUTHORIZED') return json({ error: 'サインインして仕事を確認してください。' }, 401);
    if (e instanceof Error && e.message === 'ORIGIN') return json({ error: 'この画面から操作してください。' }, 403);
    if (e instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
    return json({ error: '同じ仕事を再読込し、保存した状態を確認してください。' }, 503);
  }
}
export const GET = (request: Request) => handle(request, 'GET');
export const POST = (request: Request) => handle(request, 'POST');
export const PATCH = (request: Request) => handle(request, 'PATCH');
