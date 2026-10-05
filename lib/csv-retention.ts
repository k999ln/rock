export const CSV_RETENTION_CRON = '17 * * * *';

export type CsvRemovalRow = {
  id: string;
  user_id: string;
  status: string;
  revision: number;
  expires_at: number;
  input_key: string;
  result_key: string | null;
  safe_result_key: string | null;
  report_json_key: string | null;
  report_html_key: string | null;
};

// New jobs get a random input object on every creation, even if the client
// reuses an ID after deletion. Bind outputs to that incarnation as well.
export function csvOutputKeys(row: { id: string; input_key: string }) {
  const match = new RegExp(`^csv/${row.id}/input-([0-9a-f-]{36})\\.csv$`, 'i').exec(row.input_key);
  const prefix = `csv/${row.id}/${match ? match[1] + '-' : ''}`;
  return ['result.csv', 'spreadsheet-safe.csv', 'report.json', 'report.html'].map(name => prefix + name);
}

export function csvRemovalKeys(row: CsvRemovalRow): string[] {
  if (!/^[0-9a-f-]{36}$/i.test(row.id)) throw new Error('CSV removal identity invalid');
  if (typeof row.input_key !== 'string' || !row.input_key) throw new Error('CSV removal input key invalid');
  const prefix = `csv/${row.id}/`;
  const recorded = [row.input_key, row.result_key, row.safe_result_key, row.report_json_key, row.report_html_key].filter((key): key is string => key !== null);
  if (recorded.some(key => !key.startsWith(prefix) || key.slice(prefix.length).includes('/')))
    throw new Error('CSV removal key outside job');
  // Include outputs written before a failed DB finalization, not only recorded keys.
  // Also clean legacy fixed output keys. New incarnations never write those.
  return [...new Set([...recorded, ...csvOutputKeys(row), ...['result.csv', 'spreadsheet-safe.csv', 'report.json', 'report.html'].map(name => prefix + name)])];
}

export async function removeCsvJobStorage(
  db: D1Database,
  bucket: R2Bucket,
  row: CsvRemovalRow,
  { now = Date.now(), expiredOnly = false }: { now?: number; expiredOnly?: boolean } = {},
): Promise<'deleted' | 'busy' | 'changed'> {
  if (row.status === 'processing') return 'busy';
  const keys = csvRemovalKeys(row);
  const claimed = await db.prepare("UPDATE csv_jobs SET status = 'cleanup_pending', revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ? AND input_key = ? AND status <> 'processing' AND (? = 0 OR expires_at <= ?)")
    .bind(now, row.id, row.user_id, row.revision, row.input_key, expiredOnly ? 1 : 0, now).run();
  if (claimed.meta.changes !== 1) return 'changed';
  // The persisted state fences new processing, and retains every key on R2 failure.
  await bucket.delete(keys);
  const revision = row.revision + 1;
  const results = await db.batch([
    db.prepare("DELETE FROM csv_job_events WHERE job_id = ? AND user_id = ? AND EXISTS (SELECT 1 FROM csv_jobs WHERE id = ? AND user_id = ? AND revision = ? AND input_key = ? AND status = 'cleanup_pending')").bind(row.id, row.user_id, row.id, row.user_id, revision, row.input_key),
    db.prepare("DELETE FROM csv_jobs WHERE id = ? AND user_id = ? AND revision = ? AND input_key = ? AND status = 'cleanup_pending'").bind(row.id, row.user_id, revision, row.input_key),
  ]);
  return results[1].meta.changes === 1 ? 'deleted' : 'changed';
}

export async function purgeExpiredCsvJobs(
  db: D1Database,
  bucket: R2Bucket,
  { now = Date.now(), limit = 20, user, id }: { now?: number; limit?: number; user?: string; id?: string } = {},
) {
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('CSV cleanup bounds invalid');
  const where = ['expires_at <= ?', "status <> 'processing'"];
  const parameters: (number | string)[] = [now];
  if (user !== undefined) { where.push('user_id = ?'); parameters.push(user); }
  if (id !== undefined) { where.push('id = ?'); parameters.push(id); }
  parameters.push(limit);
  const rows = await db.prepare(`SELECT * FROM csv_jobs WHERE ${where.join(' AND ')} ORDER BY updated_at ASC, id ASC LIMIT ?`).bind(...parameters).all<CsvRemovalRow>();
  const summary = { scanned: rows.results.length, deleted: 0, failed: 0, changed: 0 };
  for (const row of rows.results) {
    try {
      const result = await removeCsvJobStorage(db, bucket, row, { now, expiredOnly: true });
      if (result === 'deleted') summary.deleted++;
      else summary.changed++;
    } catch {
      summary.failed++;
      // Defer persistent failures behind other expired jobs; retain data for retry.
      await db.prepare("UPDATE csv_jobs SET updated_at = ? WHERE id = ? AND user_id = ? AND input_key = ? AND expires_at <= ? AND status <> 'processing'").bind(now, row.id, row.user_id, row.input_key, now).run().catch(() => undefined);
    }
  }
  return summary;
}
