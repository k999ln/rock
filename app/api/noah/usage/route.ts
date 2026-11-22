import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { NoahAgentError } from '@/lib/noah-agent-upload';
import { noahUsageReport } from '@/lib/noah-usage';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const owner = await requestUser(request), query = new URL(request.url).searchParams;
    const report = await noahUsageReport(database(), owner, { scope: query.get('scope') || undefined, days: query.get('days') || undefined, agent: query.get('agent') || undefined },
      (env as unknown as { NOAH_USAGE_ADMIN_USER_IDS?: string }).NOAH_USAGE_ADMIN_USER_IDS);
    return Response.json(report, { headers });
  } catch (e) {
    if (e instanceof NoahAgentError) return Response.json({ error: e.message }, { status: e.status, headers });
    if (e instanceof Error && e.message === 'UNAUTHORIZED') return Response.json({ error: 'サインインすると利用状況を確認できます。' }, { status: 401, headers });
    return Response.json({ error: '利用記録を読み込めません。再試行してください。' }, { status: 503, headers });
  }
}
