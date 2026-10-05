import type { TeamCase } from './coconala-team';
import { ownerRevisionJsonStore } from './owner-revision-json-store.ts';

export function coconalaTeamStore(db: Pick<D1Database, 'prepare'>) {
  async function get(user: string, id: string): Promise<TeamCase | null> {
    const row = await db.prepare(
      'SELECT payload FROM coconala_team_cases WHERE user_id = ? AND id = ?',
    ).bind(user, id).first<{ payload: string }>();
    return row ? JSON.parse(row.payload) as TeamCase : null;
  }
  return {
    get,
    async list(user: string): Promise<TeamCase[]> {
      const rows = await db.prepare(
        'SELECT payload FROM coconala_team_cases WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 100',
      ).bind(user).all<{ payload: string }>();
      return rows.results.map((row) => JSON.parse(row.payload) as TeamCase);
    },
    async create(user: string, caseFile: TeamCase): Promise<TeamCase | null> {
      await db.prepare(
        'INSERT INTO coconala_team_cases (id, user_id, payload, revision, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
      ).bind(caseFile.id, user, JSON.stringify(caseFile), caseFile.revision, caseFile.updatedAt).run();
      return get(user, caseFile.id);
    },
    async update(user: string, caseFile: TeamCase, previousRevision: number): Promise<boolean> {
      const result = await db.prepare(
        'UPDATE coconala_team_cases SET payload = ?, revision = ?, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?',
      ).bind(JSON.stringify(caseFile), caseFile.revision, caseFile.updatedAt,
        caseFile.id, user, previousRevision).run();
      return result.meta.changes === 1;
    },
    async removeDraft(user: string, id: string, revision: number): Promise<boolean> {
      const result = await db.prepare(
        "DELETE FROM coconala_team_cases WHERE id = ? AND user_id = ? AND revision = ? AND json_extract(payload, '$.status') = 'draft'",
      ).bind(id, user, revision).run();
      return result.meta.changes === 1;
    },
  };
}
