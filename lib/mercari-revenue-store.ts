import {
  MercariRevenueError,
  type MercariRevenuePlan,
} from './mercari-revenue.ts';

const columns = 'payload, revision';

export function mercariRevenueStore(db: D1Database, user: string) {
  if (!user) throw new MercariRevenueError('サインインしてください。', 401);

  async function get(id: string) {
    const row = await db
      .prepare(
        `SELECT ${columns} FROM mercari_revenue_plans WHERE id = ? AND user_id = ?`,
      )
      .bind(id, user)
      .first<{ payload: string; revision: number }>();
    if (!row) return null;
    const plan = JSON.parse(row.payload) as MercariRevenuePlan;
    return { ...plan, revision: row.revision };
  }

  async function list() {
    const rows = await db
      .prepare(
        `SELECT ${columns} FROM mercari_revenue_plans WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 50`,
      )
      .bind(user)
      .all<{ payload: string; revision: number }>();
    return rows.results.map((row) => ({
      ...(JSON.parse(row.payload) as MercariRevenuePlan),
      revision: row.revision,
    }));
  }

  async function create(plan: MercariRevenuePlan) {
    const existing = await get(plan.id);
    if (existing) {
      if (JSON.stringify(existing) === JSON.stringify(plan)) return existing;
      throw new MercariRevenueError(
        '同じ操作IDで異なる内容は保存できません。',
        409,
      );
    }
    const result = await db
      .prepare(
        `INSERT OR IGNORE INTO mercari_revenue_plans (id, user_id, payload, revision, updated_at)
         SELECT ?, ?, ?, 0, ?
         WHERE (SELECT COUNT(*) FROM mercari_revenue_plans WHERE user_id = ?) < 100
         RETURNING id`,
      )
      .bind(plan.id, user, JSON.stringify(plan), plan.updatedAt, user)
      .all();
    if (!result.results.length)
      throw new MercariRevenueError(
        '操作IDの重複または保存件数の上限です。',
        409,
      );
    return plan;
  }

  async function update(before: MercariRevenuePlan, after: MercariRevenuePlan) {
    const result = await db
      .prepare(
        `UPDATE mercari_revenue_plans
         SET payload = ?, revision = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND revision = ?
         RETURNING id`,
      )
      .bind(
        JSON.stringify(after),
        after.revision,
        after.updatedAt,
        after.id,
        user,
        before.revision,
      )
      .all();
    if (!result.results.length)
      throw new MercariRevenueError(
        '別の画面で状態が変わりました。更新してからやり直してください。',
        409,
      );
    return after;
  }

  return { get, list, create, update };
}
