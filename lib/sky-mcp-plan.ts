import { CAMPUS_IDS } from './campus.ts';

export const MCP_GENERAL_LIMIT = 5;
export const MCP_CAMPUS_LIMIT = 6;
export class McpPlanError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
type Db = Pick<D1Database, 'prepare'>;
export type McpSlot = {
  connectionKey: string;
  name: string;
  createdAt: number;
};
export type McpPlan = {
  tier: 'general' | 'campus';
  freeLimit: number;
  used: number;
  campusId: string | null;
  connections: McpSlot[];
  paidExpansionAvailable: false;
};

// A URL/tag is display context, never an entitlement. Reuse the authenticated
// Campus profile proof. Student affiliation remains self-declared; email domain
// ownership is verified by the identity provider, not formal enrollment.
const eligible = `EXISTS (SELECT 1 FROM sky_campus_profiles p WHERE p.user_id = ?
  AND p.affiliation = 'student' AND p.affiliation_status = 'domain_verified'
  AND p.campus_id IN (${CAMPUS_IDS.map(() => '?').join(',')}))`;

export function mcpPlanStore(db: Db, user: string) {
  async function read(): Promise<McpPlan> {
    const campus = await db
      .prepare(`SELECT campus_id AS id FROM sky_campus_profiles
      WHERE user_id = ? AND affiliation = 'student' AND affiliation_status = 'domain_verified'
      AND campus_id IN (${CAMPUS_IDS.map(() => '?').join(',')}) ORDER BY campus_id LIMIT 1`)
      .bind(user, ...CAMPUS_IDS)
      .first<{ id: string }>();
    const rows = await db
      .prepare(`SELECT connection_key AS connectionKey, name, created_at AS createdAt
      FROM sky_mcp_slots WHERE user_id = ? ORDER BY created_at, connection_key`)
      .bind(user)
      .all<McpSlot>();
    return {
      tier: campus ? 'campus' : 'general',
      freeLimit: campus ? MCP_CAMPUS_LIMIT : MCP_GENERAL_LIMIT,
      used: rows.results.length,
      campusId: campus?.id ?? null,
      connections: rows.results,
      paidExpansionAvailable: false,
    };
  }
  async function reserve(connectionKey: string, name: string) {
    if (
      !/^[a-f0-9]{64}:[a-z0-9][a-z0-9-]{0,63}$/.test(connectionKey) ||
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 100
    )
      throw new McpPlanError('接続先の形式を確認してください。');
    // The count, student proof and insertion are one SQLite write statement.
    // Concurrent tabs/devices cannot both consume the final available slot.
    const result = await db
      .prepare(`INSERT INTO sky_mcp_slots (user_id, connection_key, name, created_at)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM sky_mcp_slots WHERE user_id = ? AND connection_key = ?)
      OR (SELECT COUNT(*) FROM sky_mcp_slots WHERE user_id = ?) <
        CASE WHEN ${eligible} THEN ${MCP_CAMPUS_LIMIT} ELSE ${MCP_GENERAL_LIMIT} END
      ON CONFLICT(user_id, connection_key) DO UPDATE SET name = excluded.name RETURNING connection_key`)
      .bind(
        user,
        connectionKey,
        name.trim(),
        Date.now(),
        user,
        connectionKey,
        user,
        user,
        ...CAMPUS_IDS,
      )
      .all();
    if (!result.results.length)
      throw new McpPlanError(
        '無料MCP接続枠の上限です。追加は有料プランの対象です。料金・提供開始は準備中のため、接続を解除して空きを作ってください。',
        402,
      );
    return read();
  }
  async function release(connectionKey: string) {
    await db
      .prepare(
        'DELETE FROM sky_mcp_slots WHERE user_id = ? AND connection_key = ?',
      )
      .bind(user, connectionKey)
      .run();
    return read();
  }
  return { read, reserve, release };
}
