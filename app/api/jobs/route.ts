import { database, requestUser } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import {
  createWorkJob,
  applyWorkCommand,
  objectInput,
  workId,
  WorkError,
} from '@/lib/workflow';

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
function failure(error: unknown) {
  if (error instanceof WorkError)
    return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインすると仕事を保存できます。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'このサイトから操作してください。' }, 403);
  if (error instanceof SyntaxError)
    return json({ error: '入力の形式を確認してください。' }, 400);
  return json(
    { error: '仕事を保存できませんでした。再試行してください。' },
    503,
  );
}
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new WorkError('入力がありません。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 12000) {
      await reader.cancel();
      throw new WorkError('入力は12 KB以下にしてください。', 413);
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
    const user = requestUser(request);
    return json({ jobs: await workStore(database()).list(user) });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = requestUser(request),
      candidate = createWorkJob(await body(request));
    const saved = await workStore(database()).create(user, candidate);
    if (
      !saved ||
      saved.title !== candidate.title ||
      saved.templateId !== candidate.templateId
    )
      throw new WorkError('仕事IDが使用されています。', 409);
    return json({ job: saved }, 201);
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const user = requestUser(request),
      input = objectInput(await body(request), [
        'jobId',
        'revision',
        'command',
      ]);
    const store = workStore(database()),
      current = await store.get(user, workId(input.jobId));
    if (!current) throw new WorkError('仕事が見つかりません。', 404);
    const next = applyWorkCommand(current, input.command, input.revision);
    if (next !== current && !(await store.update(user, next, current.revision)))
      throw new WorkError(
        '別の操作で更新されています。一覧を再読込してください。',
        409,
      );
    return json({ job: next });
  } catch (error) {
    return failure(error);
  }
}
