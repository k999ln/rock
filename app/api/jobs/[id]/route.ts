import { handle, body } from '@/lib/operations-api';
import { OperationError, uuid } from '@/lib/operations';
type Context = { params: Promise<{ id: string }> };
export const GET = (r: Request, c: Context) =>
  handle(r, async (s) => {
    const job = await s.getJob(uuid((await c.params).id));
    if (!job) throw new OperationError('実行が見つかりません。', 404);
    return job;
  });
export const PATCH = (r: Request, c: Context) =>
  handle(r, async (s) => s.changeJob((await c.params).id, await body(r)));
