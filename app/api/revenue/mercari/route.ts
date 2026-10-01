import { database } from '@/lib/fund-store';
import { body, json } from '@/lib/operations-api';
import { OperationError } from '@/lib/operations';
import { requestUser } from '@/lib/request-auth';
import {
  createMercariRevenuePlan,
  mercariConnectorReadiness,
  MercariRevenueError,
  transitionMercariRevenuePlan,
} from '@/lib/mercari-revenue';
import { mercariRevenueStore } from '@/lib/mercari-revenue-store';

async function handle(
  request: Request,
  action: (
    store: ReturnType<typeof mercariRevenueStore>,
  ) => Promise<unknown>,
) {
  try {
    const user = await requestUser(request);
    return json(await action(mercariRevenueStore(database(), user)));
  } catch (error) {
    if (error instanceof MercariRevenueError || error instanceof OperationError)
      return json({ error: error.message }, error.status);
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return json({ error: 'サインインしてください。' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN')
      return json({ error: 'このアプリから操作してください。' }, 403);
    return json({ error: '保存できませんでした。時間を置いて再試行してください。' }, 503);
  }
}

export const GET = (request: Request) =>
  handle(request, async (store) => ({
    plans: await store.list(),
    readiness: mercariConnectorReadiness,
  }));

export const POST = (request: Request) =>
  handle(request, async (store) =>
    store.create(createMercariRevenuePlan(await body(request))),
  );

export const PATCH = (request: Request) =>
  handle(request, async (store) => {
    const value = await body(request);
    const id =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as { id?: unknown }).id
        : null;
    if (typeof id !== 'string')
      throw new MercariRevenueError('対象を確認してください。');
    const before = await store.get(id);
    if (!before) throw new MercariRevenueError('収益プランが見つかりません。', 404);
    return store.update(before, transitionMercariRevenuePlan(before, value));
  });
