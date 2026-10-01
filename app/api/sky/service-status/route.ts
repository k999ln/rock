import { env } from 'cloudflare:workers';
import { skyServiceStatus } from '@/lib/sky-service-status';

export async function GET(request: Request) {
  const bindings = env as unknown as Record<string, unknown> & { DB?: D1Database };
  let databaseAvailable = false;
  try {
    const row = await bindings.DB?.prepare(
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name IN ('jobs', 'work_jobs', 'coconala_team_cases', 'tool_runs', 'book_records', 'sky_tool_packages', 'sky_tool_package_reviews', 'csv_jobs', 'sky_remote_ai_rate_limits')",
    ).first<{ total: number }>();
    databaseAvailable = row?.total === 9;
  } catch { /* Do not expose schema or provider errors publicly. */ }
  return Response.json(skyServiceStatus(bindings, databaseAvailable, new URL(request.url).origin), {
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
