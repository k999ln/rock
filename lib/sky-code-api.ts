import { requestUser } from './request-auth.ts';
import { codeId, parseCodeDraft } from './sky-code.ts';
import { skyCodeStore, CodeBlockedError } from './sky-code-store.ts';
import { SkySubmissionError } from './sky-submission.ts';
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
async function body(request: Request) {
  if (!request.body) throw new SkySubmissionError('入力がありません。');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024)
        throw new SkySubmissionError('入力が大きすぎます。', 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export async function handleSkyCode(
  request: Request,
  db: Pick<D1Database, 'prepare' | 'batch'>,
) {
  try {
    const store = skyCodeStore(db);
    if (request.method === 'GET') {
      let owner: string | null = null;
      try {
        owner = await requestUser(request);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'UNAUTHORIZED')
          throw error;
      }
      const url = new URL(request.url);
      if (url.searchParams.has('repo')) {
        const rev = url.searchParams.get('revision');
        if (rev !== null && !/^[1-9][0-9]{0,5}$/.test(rev))
          throw new SkySubmissionError('版を確認してください。');
        return json(
          await store.detail(
            codeId(url.searchParams.get('repo')),
            owner,
            rev === null ? undefined : Number(rev),
          ),
        );
      }
      const mine = url.searchParams.get('mine') === '1';
      if (mine && !owner) throw new Error('UNAUTHORIZED');
      return json({
        commits: await store.list(owner, mine),
        providers: store.providers,
      });
    }
    const owner = await requestUser(request);
    if (request.method === 'POST')
      return json(
        {
          commit: await store.publish(
            owner,
            parseCodeDraft(await body(request)),
          ),
        },
        201,
      );
    if (request.method === 'PATCH') {
      const input = await body(request);
      if (
        !input ||
        input.action !== 'hide' ||
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 1
      )
        throw new SkySubmissionError('非公開への変更内容を確認してください。');
      await store.hide(owner, codeId(input.repoId), input.expectedRevision);
      return json({ hidden: true });
    }
    return json({ error: 'この操作には対応していません。' }, 405);
  } catch (error) {
    if (error instanceof CodeBlockedError)
      return json(
        { error: error.message, inspection: error.inspection },
        error.status,
      );
    if (error instanceof SkySubmissionError)
      return json({ error: error.message }, error.status);
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return json({ error: 'サインインするとコードを公開できます。' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN')
      return json({ error: 'このSky画面から操作してください。' }, 403);
    if (error instanceof SyntaxError || error instanceof TypeError)
      return json({ error: '入力形式を確認してください。' }, 400);
    return json(
      {
        error:
          'コードの保存先に接続できません。公開履歴を確認してから再試行してください。',
      },
      503,
    );
  }
}
