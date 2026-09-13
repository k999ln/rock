import type { AutomationFundPlan } from './automation-fund';

export class AutomationFundError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const columns = 'id, payload, revision';

export function automationFundStore(db: D1Database, user: string) {
  if (!user) throw new AutomationFundError('サインインしてください。', 401);

  async function get(id: string) {
    const row = await db
      .prepare(
        `SELECT ${columns} FROM automation_funds WHERE id = ? AND user_id = ?`,
      )
      .bind(id, user)
      .first<{ id: string; payload: string; revision: number }>();
    if (!row) return null;
    return {
      ...(JSON.parse(row.payload) as AutomationFundPlan),
      revision: row.revision,
    };
  }

  async function list() {
    const [funds, membership] = await Promise.all([
      db
        .prepare(
          `SELECT ${columns} FROM automation_funds
           WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 100`,
        )
        .bind(user)
        .all<{ id: string; payload: string; revision: number }>(),
      db
        .prepare(
          `SELECT fund_id AS fundId, revision, joined_at AS joinedAt,
             updated_at AS updatedAt
           FROM automation_fund_memberships WHERE user_id = ?`,
        )
        .bind(user)
        .first<{
          fundId: string;
          revision: number;
          joinedAt: string;
          updatedAt: string;
        }>(),
    ]);
    return {
      funds: funds.results.map((row) => ({
        ...(JSON.parse(row.payload) as AutomationFundPlan),
        revision: row.revision,
      })),
      membership: membership ?? null,
    };
  }

  async function create(plan: AutomationFundPlan, idempotencyKey: string) {
    const replay = await db
      .prepare(
        `SELECT id FROM automation_funds
         WHERE user_id = ? AND idempotency_key = ?`,
      )
      .bind(user, idempotencyKey)
      .first<{ id: string }>();
    if (replay) {
      const existing = await get(replay.id);
      if (!existing)
        throw new AutomationFundError('保存状態を確認できません。', 409);
      return existing;
    }
    const saved = await db
      .prepare(
        `INSERT OR IGNORE INTO automation_funds(
          id,user_id,name,strategy,target_tool_count,payload,status,revision,
          idempotency_key,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,0,?,?,?) RETURNING id`,
      )
      .bind(
        plan.id,
        user,
        plan.name,
        plan.strategy,
        plan.targetToolCount,
        JSON.stringify(plan),
        plan.status,
        idempotencyKey,
        plan.createdAt,
        plan.updatedAt,
      )
      .all();
    if (!saved.results.length)
      throw new AutomationFundError(
        '同じ操作IDで異なるファンドは作成できません。',
        409,
      );
    return plan;
  }

  async function join(fundId: string) {
    const fund = await get(fundId);
    if (!fund)
      throw new AutomationFundError('ファンドが見つかりません。', 404);
    const timestamp = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO automation_fund_memberships(
          user_id,fund_id,revision,joined_at,updated_at
        ) VALUES(?,?,0,?,?)
        ON CONFLICT(user_id) DO UPDATE SET
          fund_id=excluded.fund_id,
          revision=automation_fund_memberships.revision+1,
          joined_at=excluded.joined_at,
          updated_at=excluded.updated_at`,
      )
      .bind(user, fundId, timestamp, timestamp)
      .run();
    return list();
  }

  return { get, list, create, join };
}
