import { database, requestUser } from '@/lib/fund-store';
import { coconalaTeamStore } from '@/lib/coconala-team-store';
import { applyTeamAction, createTeamCase, teamId, TeamCaseError } from '@/lib/coconala-team';

const json = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { 'Cache-Control': 'no-store' },
});

function failure(error: unknown) {
  if (error instanceof TeamCaseError) return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインすると案件を保存できます。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'この画面から操作してください。' }, 403);
  if (error instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
  return json({ error: '案件を保存できませんでした。再試行してください。' }, 503);
}

async function body(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new TeamCaseError('JSONで送信してください。', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new TeamCaseError('入力がありません。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 16_000) {
      await reader.cancel();
      throw new TeamCaseError('入力は16 KB以下にしてください。', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export async function GET(request: Request) {
  try {
    const user = await requestUser(request);
    return json({ cases: await coconalaTeamStore(database()).list(user) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requestUser(request);
    const candidate = createTeamCase(await body(request));
    const saved = await coconalaTeamStore(database()).create(user, candidate);
    if (!saved || JSON.stringify(saved.terms) !== JSON.stringify(candidate.terms))
      throw new TeamCaseError('同じ案件IDで別の内容は登録できません。', 409);
    return json({ caseFile: saved }, 201);
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requestUser(request);
    const value = await body(request);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new TeamCaseError('入力を確認してください。');
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['caseId', 'revision', 'command'].includes(key)))
      throw new TeamCaseError('入力項目を確認してください。');
    const store = coconalaTeamStore(database());
    const current = await store.get(user, teamId(input.caseId));
    if (!current) throw new TeamCaseError('案件が見つかりません。', 404);
    const next = applyTeamAction(current, input.command, input.revision);
    if (!(await store.update(user, next, current.revision)))
      throw new TeamCaseError('別の操作で更新されています。再読込してください。', 409);
    return json({ caseFile: next });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requestUser(request);
    const value = await body(request);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new TeamCaseError('入力を確認してください。');
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['caseId', 'revision'].includes(key)) ||
        !Number.isSafeInteger(input.revision) || Number(input.revision) < 0)
      throw new TeamCaseError('入力項目を確認してください。');
    const id = teamId(input.caseId);
    const store = coconalaTeamStore(database());
    const current = await store.get(user, id);
    if (!current) throw new TeamCaseError('案件が見つかりません。再読込してください。', 404);
    if (current.status !== 'draft')
      throw new TeamCaseError('担当開始後の案件は削除できません。', 409);
    if (current.revision !== input.revision ||
        !(await store.removeDraft(user, id, Number(input.revision))))
      throw new TeamCaseError('別の操作で更新されています。再読込してください。', 409);
    return json({ deletedCaseId: id });
  } catch (error) {
    return failure(error);
  }
}
