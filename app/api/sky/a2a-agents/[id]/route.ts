import { database } from '@/lib/fund-store';
import { requestRockstarUser } from '@/lib/rockstar-device-link';
import { a2aAgentDirectory } from '@/lib/a2a-agent-directory';

type Context = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, context: Context) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const owner = await requestRockstarUser(request, database());
    const { id } = await context.params;
    if (!uuid.test(id))
      return Response.json({ error: '接続IDが不正です。' }, { status: 400, headers });
    const removed = await a2aAgentDirectory(database()).remove(owner, id);
    return removed
      ? Response.json({ removed: true }, { headers })
      : Response.json({ error: 'Agent接続が見つかりません。' }, { status: 404, headers });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED';
    const origin = error instanceof Error && error.message === 'ORIGIN';
    return Response.json(
      { error: unauthorized ? 'サインインが必要です。' : origin ? 'このサイトから操作してください。' : 'Agent接続を削除できませんでした。' },
      { status: unauthorized ? 401 : origin ? 403 : 503, headers },
    );
  }
}
