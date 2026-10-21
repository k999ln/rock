import { database, requestUser } from '@/lib/fund-store';
import { communityKeysHeader } from '@/lib/community-access';
import { communityOsStore } from '@/lib/community-os-store';
import { SkySocialError } from '@/lib/sky-social';
import { SkyAgentLibraryError } from '@/lib/sky-agent-library';
import { OperationError } from '@/lib/operations';
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
function failure(e: unknown) {
  if (
    e instanceof SkySocialError ||
    e instanceof SkyAgentLibraryError ||
    e instanceof OperationError
  )
    return json({ error: e.message }, e.status);
  if (e instanceof Error && e.message === 'UNAUTHORIZED')
    return json({ error: 'サインインしてください。' }, 401);
  if (e instanceof Error && e.message === 'ORIGIN')
    return json({ error: 'この画面から操作してください。' }, 403);
  return json(
    { error: 'OS構成を保存できません。入力を残して再試行してください。' },
    503,
  );
}
export async function GET(r: Request) {
  try {
    const store = communityOsStore(
        database(),
        await requestUser(r),
        communityKeysHeader(r),
      ),
      q = new URL(r.url).searchParams,
      id = q.get('community');
    return json(
      id
        ? await store.edition(id, Number(q.get('version') ?? 0))
        : await store.state(),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    if (r.headers.get('origin') !== new URL(r.url).origin)
      throw new Error('ORIGIN');
    const owner = await requestUser(r);
    if (!r.headers.get('content-type')?.startsWith('application/json'))
      throw new SkySocialError('JSONで送信してください。', 415);
    const reader = r.body?.getReader();
    if (!reader) throw new SkySocialError('入力がありません。');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const p = await reader.read();
        if (p.done) break;
        size += p.value.length;
        if (size > 64000) {
          await reader.cancel();
          throw new SkySocialError('構成が大きすぎます。', 413);
        }
        chunks.push(p.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const p of chunks) {
      bytes.set(p, offset);
      offset += p.length;
    }
    let input: unknown;
    try {
      input = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      );
    } catch {
      throw new SkySocialError('JSONの形式を確認してください。');
    }
    return json(
      await communityOsStore(database(), owner, communityKeysHeader(r)).mutate(
        input,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
