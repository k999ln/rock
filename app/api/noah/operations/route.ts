import { database, requestUser } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { createNoahOperationService, presentNoahOperation } from '@/lib/noah-operations';
import { NoahExecutionError } from '@/lib/noah-execution';
import { validateNoahExecutionSource } from '@/lib/noah-execution-source';
import { noahReleaseDependencies } from '@/lib/noah-release-server';

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store, private' } });
async function handle(request: Request) {
  try {
    if (!['127.0.0.1','localhost','[::1]'].includes(new URL(request.url).hostname)) throw new NoahExecutionError('見つかりません。', 404);
    const user = await requestUser(request);
    if (user !== 'local-preview:rockstar-owner') throw new NoahExecutionError('このMacの所有者として接続してください。', 403);
    const service = createNoahOperationService(workStore(database()), () => Date.now(), (owner, binding) => validateNoahExecutionSource(noahReleaseDependencies(), owner, binding));
    if (request.method === 'GET') {
      const p = new URL(request.url).searchParams;
      return json(p.has('id') ? { job: presentNoahOperation(await service.get(user, p.get('id')!)) } : { jobs: (await service.list(user, p.get('agentId'), p.get('archived') === '1')).map(presentNoahOperation) });
    }
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new NoahExecutionError('同じNoahから操作してください。', 403);
    if (request.headers.get(OWNER_SCOPE_HEADER) !== await ownerScopeFor(user)) throw new NoahExecutionError('アカウントが変わりました。', 409);
    const reader = request.body?.getReader();
    if (!reader || !request.headers.get('content-type')?.startsWith('application/json')) throw new NoahExecutionError('JSONで指定してください。', 415);
    const chunks = []; let size = 0;
    while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > 24000) { await reader.cancel(); throw new NoahExecutionError('入力が大きすぎます。', 413); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
    const input = JSON.parse(new TextDecoder().decode(bytes));
    if (!input || Array.isArray(input) || Object.keys(input).some(k => !['action','id','revision','config','binding','lease','commandId','candidateDigest','confirmation','occurrenceId','modelCall'].includes(k))) throw new NoahExecutionError('操作を確認してください。');
    const job = input.action === 'create' ? await service.create(user, input.config, input.binding, input.lease) : await service.command(user, input);
    return json({ job });
  } catch (e) { return json({ error: e instanceof NoahExecutionError ? e.message : '運用記録を確認できません。' }, e instanceof NoahExecutionError ? e.status : 503); }
}
export const GET = handle;
export const POST = handle;
