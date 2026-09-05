import { database, requestUser } from './fund-store';
import { operations, OperationError } from './operations';
export const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new OperationError('JSONで送信してください。', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new OperationError('入力がありません。');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 4096) {
        await reader.cancel();
        throw new OperationError('入力サイズの上限を超えています。', 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown;
  } catch (e) {
    if (e instanceof OperationError) throw e;
    throw new OperationError('入力の形式を確認してください。');
  } finally {
    reader.releaseLock();
  }
}
export async function handle(
  request: Request,
  action: (store: ReturnType<typeof operations>) => Promise<unknown>,
) {
  try {
    const user = requestUser(request);
    return json(await action(operations(database(), user)));
  } catch (error) {
    if (error instanceof OperationError)
      return json({ error: error.message }, error.status);
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return json({ error: 'サインインしてください。' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN')
      return json({ error: 'このアプリから操作してください。' }, 403);
    return json(
      { error: '処理を保存できませんでした。時間を置いて再試行してください。' },
      503,
    );
  }
}
