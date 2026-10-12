/** Only stores with this exact schema and collision policy belong here. */
type StoreTable = 'work_jobs' | 'coconala_team_cases';
type RevisionPayload = { id: string; revision: number; updatedAt: string };

/** Owner isolation, idempotent create and compare-and-swap use the same SQL on D1 and SQLite. */
export function ownerRevisionJsonStore<T extends RevisionPayload>(
  db: Pick<D1Database, 'prepare'>,
  table: StoreTable,
) {
  // Identifiers cannot be bound. Keep this runtime allowlist as well as the type.
  if (table !== 'work_jobs' && table !== 'coconala_team_cases') {
    throw new Error('Unsupported owner/revision store');
  }
  async function get(user: string, id: string): Promise<T | null> {
    const row = await db.prepare(
      `SELECT payload FROM ${table} WHERE user_id = ? AND id = ?`,
    ).bind(user, id).first<{ payload: string }>();
    return row ? JSON.parse(row.payload) as T : null;
  }
  return {
    get,
    async list(user: string): Promise<T[]> {
      const rows = await db.prepare(
        `SELECT payload FROM ${table} WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 100`,
      ).bind(user).all<{ payload: string }>();
      return rows.results.map((row) => JSON.parse(row.payload) as T);
    },
    async create(user: string, payload: T): Promise<T | null> {
      await db.prepare(
        `INSERT INTO ${table} (id, user_id, payload, revision, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      ).bind(payload.id, user, JSON.stringify(payload), payload.revision, payload.updatedAt).run();
      return get(user, payload.id);
    },
    async update(user: string, payload: T, previousRevision: number): Promise<boolean> {
      const result = await db.prepare(
        `UPDATE ${table} SET payload = ?, revision = ?, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?`,
      ).bind(JSON.stringify(payload), payload.revision, payload.updatedAt,
        payload.id, user, previousRevision).run();
      return result.meta.changes === 1;
    },
  };
}
