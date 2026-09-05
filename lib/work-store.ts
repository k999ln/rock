import type { WorkJob } from './workflow';

// SQL stays here so production D1 and real SQLite tests exercise identical queries.
export function workStore(db: Pick<D1Database, 'prepare'>) {
  async function get(user: string, id: string): Promise<WorkJob | null> {
    const row = await db
      .prepare('SELECT payload FROM work_jobs WHERE user_id = ? AND id = ?')
      .bind(user, id)
      .first<{ payload: string }>();
    return row ? (JSON.parse(row.payload) as WorkJob) : null;
  }
  return {
    get,
    async list(user: string) {
      const rows = await db
        .prepare(
          'SELECT payload FROM work_jobs WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 100',
        )
        .bind(user)
        .all<{ payload: string }>();
      return rows.results.map((row) => JSON.parse(row.payload) as WorkJob);
    },
    async create(user: string, job: WorkJob) {
      await db
        .prepare(
          'INSERT INTO work_jobs (id, user_id, payload, revision, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
        )
        .bind(job.id, user, JSON.stringify(job), job.revision, job.updatedAt)
        .run();
      return get(user, job.id);
    },
    async update(user: string, job: WorkJob, previousRevision: number) {
      const result = await db
        .prepare(
          'UPDATE work_jobs SET payload = ?, revision = ?, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?',
        )
        .bind(
          JSON.stringify(job),
          job.revision,
          job.updatedAt,
          job.id,
          user,
          previousRevision,
        )
        .run();
      return result.meta.changes === 1;
    },
  };
}
