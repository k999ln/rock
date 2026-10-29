import { communityKeysHeader } from '@/lib/community-access';
import { SkySocialError } from '@/lib/sky-social';
import { database, requestUser } from '@/lib/fund-store';
import { OperationError } from '@/lib/operations';
import { skyAgentLibraryStore } from '@/lib/sky-agent-library-store';
import { skyAgentId, SkyAgentLibraryError } from '@/lib/sky-agent-library';
import { ownerScopeFor, rejectChangedOwner } from '@/lib/owner-intent';
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(e: unknown) {
  if (e instanceof SkyAgentLibraryError || e instanceof OperationError || e instanceof SkySocialError) return json({ error: e.message, ...(e instanceof SkyAgentLibraryError && e.code ? {code:e.code}: {}) }, e.status);
  if (e instanceof Error && e.message === 'UNAUTHORIZED') return json({ error: 'サインインすると自分のエージェントを管理できます。' }, 401);
  if (e instanceof Error && e.message === 'ORIGIN') return json({ error: 'このサイトから操作してください。' }, 403);
  return json({ error: 'エージェントを読み書きできません。接続を確認して再試行してください。' }, 503);
}
export async function GET(request: Request) {
  try {
    const owner = await requestUser(request);
    const store = skyAgentLibraryStore(database(), owner);
    const id = new URL(request.url).searchParams.get('id');
    if (id !== null) {
      const agent = await store.get(skyAgentId(id));
      if (!agent) throw new SkyAgentLibraryError('エージェントが見つかりません。', 404);
      return json({ agent, ownerScope: await ownerScopeFor(owner) });
    }
    return json({ agents: await store.list(), ownerScope: await ownerScopeFor(owner) });
  }
  catch (e) { return failure(e); }
}
export async function PUT(request: Request) {
  try {
    // Explicit Origin applies to browser and device sessions alike for this settings UI.
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new Error('ORIGIN');
    const owner = await requestUser(request);
    // Preserve the existing optional owner-intent precondition for old clients.
    const changed = await rejectChangedOwner(request, owner);
    if (changed) return changed;
    const reader = request.body?.getReader();
    if (!reader) throw new SkyAgentLibraryError('保存する設定を確認してください。');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 12_000) { await reader.cancel(); throw new SkyAgentLibraryError('設定が長すぎます。', 413); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let input: Record<string, unknown>;
    try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new SkyAgentLibraryError('保存する設定を確認してください。'); }
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['id','revision','settings','create'].includes(k)) ||
      (input.create !== undefined && typeof input.create !== 'boolean')) throw new SkyAgentLibraryError('保存する設定を確認してください。');
    const settings=input.settings as {origin?:{source?:{schema?:unknown}}}|undefined;
    const keys=input.create===true && settings?.origin?.source?.schema==='rockstaros.eve-post-source/1' ? communityKeysHeader(request) : {};
    return json({ agent: await skyAgentLibraryStore(database(), owner, keys).save(skyAgentId(input.id), input.revision as number, input.settings, input.create === true) });
  } catch (e) { return failure(e); }
}
