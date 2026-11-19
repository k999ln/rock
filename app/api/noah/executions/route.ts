import { database, requestUser } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { workId } from '@/lib/workflow';
import { createNoahWork, updateNoahWork, NoahExecutionError } from '@/lib/noah-execution';
import { validateNoahExecutionSource } from '@/lib/noah-execution-source';
import { noahReleaseDependencies } from '@/lib/noah-release-server';
import { validateOperationRun } from '@/lib/noah-operations';

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
async function owner(request: Request) {
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(request.url).hostname)) throw new NoahExecutionError('見つかりません。', 404);
  const user = await requestUser(request);
  if (user !== 'local-preview:rockstar-owner') throw new NoahExecutionError('このMacの所有者として接続してください。', 403);
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(request.url).origin) throw new NoahExecutionError('同じNoah画面から操作してください。', 403);
  if (request.method !== 'GET' && request.headers.get(OWNER_SCOPE_HEADER) !== await ownerScopeFor(user)) throw new NoahExecutionError('アカウントが変わりました。', 409);
  return user;
}
function fail(e: unknown) {
  return json({ error: e instanceof NoahExecutionError ? e.message : '実行記録の本人・入力・状態を確認してください。' }, e instanceof NoahExecutionError ? e.status : 400);
}
export async function GET(request: Request) {
  try {
    const user = await owner(request), id = new URL(request.url).searchParams.get('id'), store = workStore(database());
    if (!id) {
      const params = new URL(request.url).searchParams, agentId = params.get('agentId');
      if (agentId && !/^[a-zA-Z0-9-]{1,100}$/.test(agentId)) throw new NoahExecutionError('Agentの識別名を確認してください。');
      const jobs = await store.listNoah(user, agentId);
      return json({ jobs: jobs.map(j => params.get('summary') === '1' ? { id: j.id, createdAt: j.createdAt, title: j.title, noahExecution: { agentId: j.noahExecution!.agentId, state: j.noahExecution!.state, prompt: j.noahExecution!.prompt.slice(0, 200), exitCode: j.noahExecution!.result?.exitCode } } : { ...j, noahExecution: { ...j.noahExecution, claimSha256: undefined } }) });
    }
    const job = await store.get(user, workId(id));
    if (!job?.noahExecution) throw new NoahExecutionError('仕事が見つかりません。', 404);
    return json({ job: { ...job, noahExecution: { ...job.noahExecution, claimSha256: undefined } } });
  } catch (e) { return fail(e); }
}
export async function POST(request: Request) {
  try {
    const user = await owner(request), reader = request.body?.getReader();
    if (!reader || !request.headers.get('content-type')?.startsWith('application/json')) throw new NoahExecutionError('JSONで指定してください。');
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 160000) { await reader.cancel(); throw new NoahExecutionError('記録が大きすぎます。', 413); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const input = JSON.parse(new TextDecoder().decode(bytes));
    if (!input || Object.keys(input).some(k => !['id', 'action', 'binding', 'claim', 'state', 'result', 'error', 'calls'].includes(k))) throw new NoahExecutionError('入力を確認してください。');
    const store = workStore(database()), id = workId(input.id);
    if (input.action === 'create') {
      const candidate = await createNoahWork(id, input.binding);
      await validateNoahExecutionSource(noahReleaseDependencies(), user, candidate.noahExecution!);
      const parent = await validateOperationRun(store, user, candidate);
      const saved = parent ? await store.createNoahOperationRun(user, candidate, parent) : await store.create(user, candidate);
      if (!saved?.noahExecution || saved.noahExecution.inputSha256 !== candidate.noahExecution!.inputSha256 || saved.noahExecution.claimSha256 !== candidate.noahExecution!.claimSha256) throw new NoahExecutionError('実行IDが使用されています。', 409);
      return json({ job: { ...saved, noahExecution: { ...saved.noahExecution, claimSha256: undefined } } }, 201);
    }
    const current = await store.get(user, id);
    if (!current) throw new NoahExecutionError('仕事が見つかりません。', 404);
    if (input.action === 'start' && current.noahExecution) await validateNoahExecutionSource(noahReleaseDependencies(), user, current.noahExecution);
    const parent = input.action === 'start' ? await validateOperationRun(store, user, current) : null;
    const next = await updateNoahWork(current, input);
    if (!await (parent ? store.startNoahOperationRun(user, next, current.revision, parent) : store.update(user, next, current.revision))) throw new NoahExecutionError('実行状態が更新されました。', 409);
    return json({ job: { ...next, noahExecution: { ...next.noahExecution, claimSha256: undefined } } });
  } catch (e) { return fail(e); }
}
