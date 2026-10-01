import { database, requestUser, snapshot, apiError } from '@/lib/fund-store';
import { validateFund } from '@/lib/fund';
export async function GET(request: Request) {
  try {
    return Response.json(await snapshot(await requestUser(request)), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function PUT(request: Request) {
  try {
    const user = await requestUser(request);
    const raw = await request.text();
    if (raw.length > 10000) throw new Error('limit');
    const plan = validateFund(JSON.parse(raw));
    await database()
      .prepare(
        'INSERT INTO fund_plans (user_id, plan, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, updated_at = excluded.updated_at',
      )
      .bind(user, JSON.stringify(plan), new Date().toISOString())
      .run();
    return Response.json(await snapshot(user), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return apiError(e);
  }
}
