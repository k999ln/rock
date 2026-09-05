import { database, requestUser, apiError } from '@/lib/fund-store';
import { fundTools } from '@/lib/fund';
export async function POST(request: Request) {
  try {
    const user = requestUser(request),
      raw = await request.text();
    if (raw.length > 2000) throw new Error('limit');
    const r = JSON.parse(raw);
    if (
      typeof r.sample !== 'boolean' ||
      typeof r.id !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(r.id) ||
      !fundTools.includes(r.tool) ||
      !['browser', 'local-mcp'].includes(r.transport) ||
      !['completed', 'failed'].includes(r.status) ||
      !Number.isInteger(r.durationMs) ||
      r.durationMs < 0 ||
      r.durationMs > 300000
    )
      throw new Error('invalid');
    await database()
      .prepare(
        'INSERT INTO tool_runs (id, user_id, tool, transport, status, sample, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
      )
      .bind(
        r.id,
        user,
        r.tool,
        r.transport,
        r.status,
        r.sample ? 1 : 0,
        r.durationMs,
        new Date().toISOString(),
      )
      .run();
    return Response.json(
      { saved: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return apiError(e);
  }
}
