import { env } from 'cloudflare:workers';
import { readBoundedStream } from '@/lib/bounded-stream';
import { database } from '@/lib/fund-store';
import { rejectChangedOwner } from '@/lib/owner-intent';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { skyPrivateAgentStore } from '@/lib/sky-private-agent-store';
import { skyPrivateOwner } from '@/lib/sky-private-owner.server';
import { objectInput, workId, WorkError } from '@/lib/workflow';

const json = (value: unknown, status = 200) => Response.json(value,
  { status, headers: { 'Cache-Control': 'no-store' } });

async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new WorkError('入力がありません。');
  const bytes = await readBoundedStream(reader, 20_000, () => new WorkError('入力は20 KB以下にしてください。', 413));
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
function failure(request: Request, error: unknown) {
  if (request.body && !request.bodyUsed && !request.body.locked) void request.body.cancel().catch(() => {});
  if (error instanceof WorkError) return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: '本人のサインインが必要です。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN') return json({ error: '同じサイトから操作してください。' }, 403);
  if (error instanceof SyntaxError) return json({ error: '入力の形式を確認してください。' }, 400);
  return json({ error: 'Agent設定または保存状態を確認してください。' }, 400);
}
async function ownerAndScope(request: Request) {
  const user = await skyPrivateOwner(request), mismatch = await rejectChangedOwner(request, user);
  if (mismatch) return { user, response: mismatch };
  const db = database();
  const allowed = await rockstarServiceScopeAllowed(db, user, 'sky',
    (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
    env, request);
  return { user, response: allowed ? null : missingRockstarServiceScope('Sky'), db };
}

export async function GET(request: Request) {
  try {
    if (new URL(request.url).search) throw new WorkError('一覧の条件を確認してください。');
    const { user, response, db } = await ownerAndScope(request);
    if (response) return response;
    const store = skyPrivateAgentStore(db!);
    const [agents, adds] = await Promise.all([store.listAgents(user), store.listAdds(user)]);
    return json({ agents, adds });
  } catch (error) { return failure(request, error); }
}

export async function POST(request: Request) {
  try {
    const { user, response, db } = await ownerAndScope(request);
    if (response) return response;
    const input = objectInput(await body(request), ['action', 'agentId', 'addId', 'revision', 'spec', 'fit', 'saveSettings']);
    const store = skyPrivateAgentStore(db!);
    if (input.action === 'create') {
      objectInput(input, ['action', 'agentId', 'spec', 'saveSettings']);
      if (input.saveSettings !== true) throw new WorkError('本人用Agent設定の保存に同意してください。');
      const agent = await store.createAgent(user, workId(input.agentId), input.spec);
      if (!agent) throw new WorkError('Agent IDが使用されています。', 409);
      return json({ agent }, 201);
    }
    if (input.action === 'revise') {
      objectInput(input, ['action', 'agentId', 'revision', 'spec', 'saveSettings']);
      if (input.saveSettings !== true || !Number.isSafeInteger(input.revision)) throw new WorkError('設定と更新番号を確認してください。');
      const agent = await store.reviseAgent(user, workId(input.agentId), input.revision as number, input.spec);
      if (!agent) throw new WorkError('Agentの版が変わりました。再読込してください。', 409);
      return json({ agent });
    }
    if (input.action === 'revoke') {
      objectInput(input, ['action', 'agentId', 'revision']);
      if (!Number.isSafeInteger(input.revision) || !await store.revokeAgent(user, workId(input.agentId), input.revision as number))
        throw new WorkError('Agentの版が変わりました。再読込してください。', 409);
      return json({ revoked: true });
    }
    if (input.action === 'add') {
      objectInput(input, ['action', 'agentId', 'addId', 'fit']);
      const add = await store.addAgent(user, workId(input.addId), workId(input.agentId), input.fit);
      if (!add) throw new WorkError('Agentの追加条件またはIDを確認してください。', 409);
      return json({ add }, 201);
    }
    if (input.action === 'remove') {
      objectInput(input, ['action', 'addId']);
      if (!await store.removeAdd(user, workId(input.addId))) throw new WorkError('追加済みAgentが見つかりません。', 409);
      return json({ removed: true });
    }
    throw new WorkError('操作を確認してください。');
  } catch (error) { return failure(request, error); }
}
