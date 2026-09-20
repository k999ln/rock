import { database } from '@/lib/fund-store';

const requiredTables = [
  'jobs',
  'work_jobs',
  'tool_runs',
  'book_records',
  'sky_tool_packages',
  'csv_jobs',
];

export async function GET() {
  try {
    const placeholders = requiredTables.map(() => '?').join(', ');
    const result = await database()
      .prepare(
        `SELECT count(*) AS total FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`,
      )
      .bind(...requiredTables)
      .first<{ total: number }>();
    if (result?.total !== requiredTables.length) throw new Error('SCHEMA');
    return Response.json(
      { status: 'ok' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
