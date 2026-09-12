import type { SkySubmission } from './sky-submission';

type Database = Pick<D1Database, 'prepare'>;
export type StoredSkySubmission = SkySubmission & {
  status: 'submitted' | 'under_review' | 'published' | 'rejected';
  createdAt: number;
};

export function skySubmissionStore(db: Database) {
  return {
    async create(
      userId: string,
      submission: SkySubmission,
    ): Promise<StoredSkySubmission | null> {
      const createdAt = Date.now();
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO sky_tool_submissions
        (id, user_id, payload, status, created_at, updated_at)
        VALUES (?, ?, ?, 'submitted', ?, ?)
        RETURNING id`,
        )
        .bind(
          submission.id,
          userId,
          JSON.stringify(submission),
          createdAt,
          createdAt,
        )
        .all();
      return result.results.length
        ? { ...submission, status: 'submitted', createdAt }
        : null;
    },
    async list(userId: string): Promise<StoredSkySubmission[]> {
      const rows = await db
        .prepare(
          `SELECT payload, status, created_at AS createdAt
        FROM sky_tool_submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
        )
        .bind(userId)
        .all<{
          payload: string;
          status: StoredSkySubmission['status'];
          createdAt: number;
        }>();
      return rows.results.map((row) => ({
        ...(JSON.parse(row.payload) as SkySubmission),
        status: row.status,
        createdAt: row.createdAt,
      }));
    },
  };
}
