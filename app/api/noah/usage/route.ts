import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { NoahAgentError } from '@/lib/noah-agent-upload';
import { noahCloudUsageReport, noahUsageReport } from '@/lib/noah-usage';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const owner = await requestUser(request), query = new URL(request.url).searchParams;
    const config = env as unknown as { NOAH_USAGE_ADMIN_USER_IDS?: string; NOAH_CLOUD_TRIGGER_USD?: string };
    const db = database(), now = Date.now(), agent = query.get('agent') || undefined;
    const report = await noahUsageReport(db, owner, { scope: query.get('scope') || undefined, days: query.get('days') || undefined, agent },
      config.NOAH_USAGE_ADMIN_USER_IDS, now);
    if (report.scope === 'operator' && !agent) {
      try {
        report.cloud = await noahCloudUsageReport(db, config.NOAH_CLOUD_TRIGGER_USD, now);
      } catch (error) {
        report.cloudError = error instanceof NoahAgentError ? error.message : 'クラウドの従量記録を読み込めません。';
      }
    }
    return Response.json(report, { headers });
  } catch (e) {
    if (e instanceof NoahAgentError) return Response.json({ error: e.message }, { status: e.status, headers });
    if (e instanceof Error && e.message === 'UNAUTHORIZED') return Response.json({ error: 'サインインすると利用状況を確認できます。' }, { status: 401, headers });
    return Response.json({ error: '利用記録を読み込めません。再試行してください。' }, { status: 503, headers });
  }
}
