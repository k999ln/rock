import { env } from 'cloudflare:workers';
import { cloudBudget, type CloudBudgetEnv } from '@/lib/cloud-operations';
import { readCloudOperations } from '@/lib/cloud-operations-store';
import { database, requestUser } from '@/lib/fund-store';
import { ownerScopeFor } from '@/lib/owner-intent';

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function GET(request: Request) {
  const config = env as unknown as CloudBudgetEnv & { NOAH_REVIEWER_USER_IDS?: string };
  try {
    const reviewer = await requestUser(request);
    const reviewers = (config.NOAH_REVIEWER_USER_IDS ?? '').split(',').map((id) => id.trim());
    if (!reviewers.includes(reviewer)) return json({ error: '見つかりません。' }, 404);
    const report = await readCloudOperations(database(), cloudBudget(config), Date.now());
    return json({ report, ownerScope: await ownerScopeFor(reviewer) });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return json({ error: '見つかりません。' }, 404);
    }
    return json({ error: 'クラウドの運営データを確認できません。' }, 503);
  }
}
