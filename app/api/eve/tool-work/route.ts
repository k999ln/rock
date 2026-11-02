import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { eveHistoryKeys, EveHistoryError } from '@/lib/eve-history';
import { eveToolWorkStore } from '@/lib/eve-tool-work';
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
      if (size > 48000) { await reader.cancel(); throw new WorkError('素材と依頼は48 KB以内にしてください。', 413); }
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
    const db = database(), config = env as unknown as { EVE_HISTORY_KEYRING?: string; ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string };
    let keys;
    try { keys = eveHistoryKeys(config.EVE_HISTORY_KEYRING); }
    catch (error) { if (method === 'POST') throw error; }
    const store = eveToolWorkStore(db, owner, keys);
    if (method === 'GET') {
      const query = new URL(request.url).searchParams;
      return json(query.has('id') ? { job: await store.get(query.get('id')!) } : { jobs: await store.list(query.get('thread') ?? undefined) });
    }
    const input = await body(request);
    const stopping = method === 'PATCH' && Boolean(input && typeof input === 'object' && 'action' in input && input.action === 'cancel');
    if (!stopping && !await rockstarServiceScopeAllowed(db, owner, 'zema', config.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED, env, request)) return missingRockstarServiceScope('Eve');
    const isPlanning = input && typeof input === 'object' && 'action' in input && typeof input.action === 'string' && input.action.startsWith('planner-');
    return json(method === 'POST' ? await store.create(input) : isPlanning ? await store.plannerCommand(input) : await store.command(input), method === 'POST' ? 201 : 200);
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
