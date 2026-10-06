import { env } from 'cloudflare:workers';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { skyWebCommand, requireSkyDraftImport } from '@/lib/amc-sky-web';
import { database, requestUser } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import {
  createWorkJob,
  applyWorkCommand,
  objectInput,
  workId,
  WorkError,
} from '@/lib/workflow';

const MAX_BODY = 2_000_000;
const MAX_RECORD = 1_900_000;
function checkRecordSize(value: unknown) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_RECORD)
    throw new WorkError('履歴を含む保存上限（1.9 MB）です。Goal JSONを保存し、別記録へ引き継いでください。', 413);
}
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
function reject(request: Request, error: unknown) {
  if (request.body && !request.bodyUsed && !request.body.locked)
    void request.body.cancel().catch(() => {});
  if (error instanceof WorkError)
    return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json(
      { error: 'サインインするとAMCの計画を保存・再開できます。' },
      401,
    );
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'このサイトから操作してください。' }, 403);
  if (error instanceof SyntaxError)
    return json({ error: '入力の形式を確認してください。' }, 400);
  return json(
    {
      error:
        'AMCの保存を確認できません。同じ操作の再試行か、最新状態の再読込を行ってください。',
    },
    503,
  );
}
async function body(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new WorkError('入力がありません。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY) {
      await reader.cancel();
      throw new WorkError('入力は2 MB以下にしてください。', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new WorkError('UTF-8のJSONを送信してください。', 400);
  }
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}
async function digest(value: unknown) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(stable(value))),
  );
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function GET(request: Request) {
  try {
    const user = await requestUser(request);
    const store = workStore(database());
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return json({ jobs: await store.listAmc(user) });
    const job = await store.get(user, workId(id));
    if (!job?.amcGoal || job.templateId !== 'amc')
      throw new WorkError('AMCの計画が見つかりません。', 404);
    return json({ job });
  } catch (error) {
    return reject(request, error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requestUser(request);
    if (!(await rockstarServiceScopeAllowed(database(), user, 'zema',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
    ))) {
      await request.body?.cancel().catch(() => {});
      return missingRockstarServiceScope('Zema');
    }
    const input = objectInput(await body(request), [
      'id',
      'brief',
      'importGoal',
    ]);
    const candidate = createWorkJob({ ...input, templateId: 'amc' });
    requireSkyDraftImport(candidate.amcGoal);
    candidate.amcCreationDigest = await digest(input);
    checkRecordSize(candidate);
    const saved = await workStore(database()).create(user, candidate);
    if (
      !saved ||
      saved.templateId !== 'amc' ||
      saved.amcCreationDigest !== candidate.amcCreationDigest
    )
      throw new WorkError(
        'この保存IDは別の内容で使用されています。最新状態を確認してください。',
        409,
      );
    return json({ job: saved }, 201);
  } catch (error) {
    return reject(request, error);
  }
}
export async function PATCH(request: Request) {
  try {
    const user = await requestUser(request);
    const input = objectInput(await body(request), [
      'jobId',
      'revision',
      'command',
    ]);
    const store = workStore(database());
    const current = await store.get(user, workId(input.jobId));
    if (!current?.amcGoal || current.templateId !== 'amc')
      throw new WorkError('AMCの計画が見つかりません。', 404);
    const next = applyWorkCommand(current, current.amcGoal ? skyWebCommand(current.amcGoal, input.command, user) : input.command, input.revision);
    checkRecordSize(next);
    if (next !== current && !(await store.update(user, next, current.revision)))
      throw new WorkError(
        '別の画面で更新されています。最新状態を確認してください。',
        409,
      );
    return json({ job: next });
  } catch (error) {
    return reject(request, error);
  }
}
