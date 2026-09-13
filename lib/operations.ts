import { defaultFund, distributeFund, validateFund } from './fund.ts';

// No runtime binding here: the same store is exercised against SQLite in tests.
export const JOB_TOOLS = [
  'coconala',
  'mr-free-article',
  'mr-citations',
  'mr-delivery',
] as const;
export type JobTool = (typeof JOB_TOOLS)[number];
export type JobState =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'cancelled';
export type Job = {
  id: string;
  userId: string;
  tool: JobTool;
  transport: 'browser' | 'local-mcp';
  sample: number;
  status: JobState;
  inputBytes: number;
  outputBytes: number | null;
  durationMs: number | null;
  errorCode: string | null;
  deviceId: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  deadline: number;
};
export type Device = {
  id: string;
  name: string;
  status: string;
  lastSeenAt: number;
  createdAt: number;
};
export type BookRecord = {
  id: string;
  kind: 'revenue' | 'expense';
  amount: number;
  source: string;
  occurredOn: string;
  reversesId: string | null;
  createdAt: number;
};
export type SkyConnection = {
  tool: JobTool;
  scope: 'execute';
  consentVersion: string;
  connectedAt: number;
};
const SKY_CONSENT_VERSION = '2026-09-12';
export class OperationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function object(
  value: unknown,
  keys: string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw new OperationError('入力項目を確認してください。');
  return value as Record<string, unknown>;
}
export function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    throw new OperationError('操作IDが不正です。');
  return value;
}
function int(value: unknown, max: number, min = 0): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new OperationError('数値の範囲を確認してください。');
  return value;
}
function toolName(value: unknown): JobTool {
  if (!JOB_TOOLS.includes(value as JobTool))
    throw new OperationError('対応していないツールです。');
  return value as JobTool;
}
const columns =
  'id, user_id AS userId, tool, transport, sample, status, input_bytes AS inputBytes, output_bytes AS outputBytes, duration_ms AS durationMs, error_code AS errorCode, device_id AS deviceId, created_at AS createdAt, started_at AS startedAt, finished_at AS finishedAt, deadline';
const bookColumns =
  'id, kind, amount, source, occurred_on AS occurredOn, reverses_id AS reversesId, created_at AS createdAt';

export function operations(
  db: D1Database,
  user: string,
  clock: () => number = Date.now,
) {
  if (!user) throw new OperationError('サインインしてください。', 401);
  const statement = (sql: string, ...args: (string | number | null)[]) =>
    db.prepare(sql).bind(...args);
  const getJob = (id: string) =>
    statement(
      `SELECT ${columns} FROM jobs WHERE id = ? AND user_id = ?`,
      id,
      user,
    ).first<Job>();
  const event = (id: string) =>
    statement(
      `INSERT OR IGNORE INTO job_events (job_id, user_id, status, created_at)
    SELECT id, user_id, status, COALESCE(finished_at, started_at, created_at) FROM jobs WHERE id = ? AND user_id = ?`,
      id,
      user,
    );
  const history = (id: string) =>
    statement(
      `INSERT OR IGNORE INTO tool_runs (id, user_id, tool, transport, status, sample, duration_ms, created_at)
    SELECT id, user_id, tool, transport, status, sample, duration_ms, strftime('%Y-%m-%dT%H:%M:%fZ', finished_at / 1000.0, 'unixepoch')
    FROM jobs WHERE id = ? AND user_id = ? AND status IN ('completed', 'failed')`,
      id,
      user,
    );

  async function expire() {
    const now = clock();
    await db.batch([
      statement(
        "UPDATE jobs SET status = 'interrupted', error_code = 'TIMEOUT', finished_at = ? WHERE user_id = ? AND status IN ('queued', 'running') AND deadline <= ?",
        now,
        user,
        now,
      ),
      statement(
        `INSERT OR IGNORE INTO job_events (job_id, user_id, status, created_at)
        SELECT id, user_id, status, finished_at FROM jobs WHERE user_id = ? AND status = 'interrupted'`,
        user,
      ),
    ]);
  }

  async function createJob(value: unknown) {
    const v = object(value, [
      'id',
      'tool',
      'transport',
      'sample',
      'inputBytes',
      'deviceId',
    ]);
    const id = uuid(v.id),
      tool = toolName(v.tool),
      bytes = int(v.inputBytes, 16_000_000);
    if (
      !['browser', 'local-mcp'].includes(v.transport as string) ||
      typeof v.sample !== 'boolean'
    )
      throw new OperationError('実行形式が不正です。');
    if (tool === 'mr-delivery' && v.transport !== 'local-mcp')
      throw new OperationError('納品照合はPC接続が必要です。');
    const device = v.transport === 'local-mcp' ? uuid(v.deviceId) : null;
    if (v.transport === 'browser' && v.deviceId != null)
      throw new OperationError('実行経路を確認してください。');
    await expire();
    const existing = await getJob(id);
    if (existing) {
      if (
        existing.tool !== tool ||
        existing.transport !== v.transport ||
        existing.sample !== Number(v.sample) ||
        existing.inputBytes !== bytes ||
        existing.deviceId !== device
      )
        throw new OperationError(
          '同じ操作IDで異なる内容は実行できません。',
          409,
        );
      return existing;
    }
    const now = clock();
    // Both the limit and the insert are evaluated by one serialized SQLite statement.
    const result = await db.batch([
      statement(
        `INSERT OR IGNORE INTO jobs (id, user_id, tool, transport, sample, status, input_bytes, device_id, created_at, deadline)
        SELECT ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM tool_controls WHERE user_id = ? AND tool = ? AND enabled = 0)
        AND (SELECT COUNT(*) FROM jobs WHERE user_id = ? AND created_at >= ?) < 120
        AND (? IS NULL OR EXISTS (SELECT 1 FROM devices WHERE id = ? AND user_id = ? AND status = 'connected' AND last_seen_at > ?))
        RETURNING id`,
        id,
        user,
        tool,
        v.transport as string,
        Number(v.sample),
        bytes,
        device,
        now,
        now + 120_000,
        user,
        tool,
        user,
        now - 3600_000,
        device,
        device,
        user,
        now - 90_000,
      ),
      event(id),
    ]);
    if (!result[0].results.length) {
      const replay = await getJob(id);
      if (
        replay &&
        replay.tool === tool &&
        replay.transport === v.transport &&
        replay.sample === Number(v.sample) &&
        replay.inputBytes === bytes &&
        replay.deviceId === device
      )
        return replay;
      throw new OperationError(
        '実行中の処理、ツールの停止設定、PC接続、時間あたりの上限を確認してください。',
        409,
      );
    }
    return (await getJob(id))!;
  }

  async function changeJob(id: string, value: unknown) {
    uuid(id);
    const v = object(value, [
      'action',
      'status',
      'durationMs',
      'outputBytes',
      'errorCode',
    ]);
    await expire();
    const before = await getJob(id);
    if (!before) throw new OperationError('実行が見つかりません。', 404);
    const now = clock();
    let update: D1PreparedStatement;
    if (v.action === 'start') {
      object(value, ['action']);
      update = statement(
        `UPDATE jobs SET status = 'running', started_at = ?, deadline = ? WHERE id = ? AND user_id = ? AND status = 'queued'
        AND NOT EXISTS (SELECT 1 FROM tool_controls WHERE user_id = ? AND tool = jobs.tool AND enabled = 0)
        AND (device_id IS NULL OR EXISTS (SELECT 1 FROM devices WHERE devices.id = jobs.device_id AND devices.user_id = ? AND devices.status = 'connected' AND devices.last_seen_at > ?))
        RETURNING id`,
        now,
        now + 120_000,
        id,
        user,
        user,
        user,
        now - 90_000,
      );
    } else if (v.action === 'cancel') {
      object(value, ['action']);
      update = statement(
        "UPDATE jobs SET status = 'cancelled', finished_at = ? WHERE id = ? AND user_id = ? AND status = 'queued' RETURNING id",
        now,
        id,
        user,
      );
    } else if (v.action === 'finish') {
      if (!['completed', 'failed'].includes(v.status as string))
        throw new OperationError('完了状態を確認してください。');
      const duration = int(v.durationMs, 120_000),
        bytes = int(v.outputBytes, 20_000_000);
      const code = v.status === 'failed' ? 'TOOL_ERROR' : null;
      if (v.errorCode != null && v.errorCode !== code)
        throw new OperationError('エラー形式が不正です。');
      if (
        before.status === v.status &&
        before.durationMs === duration &&
        before.outputBytes === bytes
      )
        return before;
      update = statement(
        `UPDATE jobs SET status = ?, duration_ms = ?, output_bytes = ?, error_code = ?, finished_at = ?
        WHERE id = ? AND user_id = ? AND status = 'running' RETURNING id`,
        v.status as string,
        duration,
        bytes,
        code,
        now,
        id,
        user,
      );
    } else throw new OperationError('対応していない操作です。');
    const result = await db.batch([update, event(id), history(id)]);
    if (!result[0].results.length) {
      const after = await getJob(id);
      if (
        v.action === 'finish' &&
        after &&
        after.status === v.status &&
        after.durationMs === v.durationMs &&
        after.outputBytes === v.outputBytes
      )
        return after;
      throw new OperationError(
        '実行状態が変わりました。履歴を更新してください。',
        409,
      );
    }
    return (await getJob(id))!;
  }

  async function listJobs() {
    await expire();
    return (
      await statement(
        `SELECT ${columns} FROM jobs WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`,
        user,
      ).all<Job>()
    ).results;
  }

  async function control(value: unknown) {
    const v = object(value, ['tool', 'enabled']),
      tool = toolName(v.tool);
    if (typeof v.enabled !== 'boolean')
      throw new OperationError('停止設定が不正です。');
    await statement(
      `INSERT INTO tool_controls (user_id, tool, enabled, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, tool) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
      user,
      tool,
      Number(v.enabled),
      clock(),
    ).run();
    return { tool, enabled: v.enabled };
  }

  async function listSkyConnections() {
    return (
      await statement(
        `SELECT tool, scope, consent_version AS consentVersion, connected_at AS connectedAt
         FROM sky_connections WHERE user_id = ? ORDER BY connected_at DESC, tool ASC`,
        user,
      ).all<SkyConnection>()
    ).results;
  }

  async function connectSky(value: unknown) {
    const v = object(value, ['tool']),
      tool = toolName(v.tool),
      connectedAt = clock();
    await statement(
      `INSERT INTO sky_connections (user_id, tool, scope, consent_version, connected_at)
       VALUES (?, ?, 'execute', ?, ?)
       ON CONFLICT(user_id, tool) DO UPDATE SET
         scope = excluded.scope,
         consent_version = excluded.consent_version,
         connected_at = excluded.connected_at`,
      user,
      tool,
      SKY_CONSENT_VERSION,
      connectedAt,
    ).run();
    return {
      tool,
      scope: 'execute' as const,
      consentVersion: SKY_CONSENT_VERSION,
      connectedAt,
    };
  }

  async function device(value: unknown) {
    const v = object(value, ['id', 'name', 'action']),
      id = uuid(v.id),
      now = clock();
    if (v.action === 'connect') {
      if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 40)
        throw new OperationError('端末名は40文字以内です。');
      const result = await statement(
        `INSERT INTO devices (id, user_id, name, status, last_seen_at, created_at)
        SELECT ?, ?, ?, 'connected', ?, ? WHERE (SELECT COUNT(*) FROM devices WHERE user_id = ?) < 50
        ON CONFLICT(id) DO UPDATE SET status = 'connected', last_seen_at = excluded.last_seen_at
        WHERE devices.user_id = ? AND devices.status != 'revoked' RETURNING id`,
        id,
        user,
        v.name.trim(),
        now,
        now,
        user,
        user,
      ).all();
      if (!result.results.length)
        throw new OperationError(
          '端末を登録できません。解除済み端末または台数上限を確認してください。',
          409,
        );
    } else if (
      ['heartbeat', 'disconnect', 'revoke'].includes(v.action as string)
    ) {
      object(value, ['id', 'action']);
      const status =
        v.action === 'heartbeat'
          ? 'connected'
          : v.action === 'revoke'
            ? 'revoked'
            : 'disconnected';
      const result = await statement(
        "UPDATE devices SET status = ?, last_seen_at = ? WHERE id = ? AND user_id = ? AND status != 'revoked' RETURNING id",
        status,
        now,
        id,
        user,
      ).all();
      if (!result.results.length)
        throw new OperationError('端末を再接続してください。', 409);
    } else throw new OperationError('端末操作が不正です。');
    return { saved: true };
  }

  async function book(value: unknown) {
    const v = object(value, [
        'id',
        'kind',
        'amount',
        'source',
        'occurredOn',
        'reversesId',
      ]),
      id = uuid(v.id);
    let data: Omit<BookRecord, 'id' | 'createdAt'>;
    if (v.reversesId) {
      object(value, ['id', 'reversesId']);
      const reverse = uuid(v.reversesId);
      const original = await statement(
        `SELECT ${bookColumns} FROM book_records WHERE id = ? AND user_id = ? AND reverses_id IS NULL`,
        reverse,
        user,
      ).first<BookRecord>();
      if (!original)
        throw new OperationError('取り消す記録が見つかりません。', 404);
      data = {
        kind: original.kind,
        amount: -original.amount,
        source: original.source,
        occurredOn: original.occurredOn,
        reversesId: reverse,
      };
    } else {
      const amount = int(v.amount, 100_000_000, 1);
      if (
        !['revenue', 'expense'].includes(v.kind as string) ||
        ![
          'coconala',
          'note',
          'api',
          'electricity',
          'network',
          'other',
        ].includes(v.source as string)
      )
        throw new OperationError('記録の種類を確認してください。');
      if (
        typeof v.occurredOn !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v.occurredOn) ||
        !Number.isFinite(Date.parse(v.occurredOn)) ||
        new Date(v.occurredOn).toISOString().slice(0, 10) !== v.occurredOn ||
        v.occurredOn < '2000-01-01' ||
        v.occurredOn > new Date(clock()).toISOString().slice(0, 10)
      )
        throw new OperationError(
          '記録日は2000年以降の今日までの日付にしてください。',
        );
      data = {
        kind: v.kind as BookRecord['kind'],
        amount,
        source: v.source as string,
        occurredOn: v.occurredOn,
        reversesId: null,
      };
    }
    const existing = await statement(
      `SELECT ${bookColumns} FROM book_records WHERE id = ? AND user_id = ?`,
      id,
      user,
    ).first<BookRecord>();
    if (existing) {
      if (
        Object.entries(data).every(
          ([k, val]) => existing[k as keyof BookRecord] === val,
        )
      )
        return existing;
      throw new OperationError('同じ記録IDで異なる内容は保存できません。', 409);
    }
    const result = await statement(
      `INSERT OR IGNORE INTO book_records (id, user_id, kind, amount, source, occurred_on, reverses_id, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM book_records WHERE user_id = ? AND created_at >= ?) < 100 RETURNING id`,
      id,
      user,
      data.kind,
      data.amount,
      data.source,
      data.occurredOn,
      data.reversesId,
      clock(),
      user,
      clock() - 3600_000,
    ).all();
    if (!result.results.length)
      throw new OperationError('重複した取消または保存回数の上限です。', 409);
    return { id, ...data };
  }

  async function overview() {
    await expire();
    const now = clock();
    const [jobList, deviceList, controls, usage, records, totals] =
      await Promise.all([
        statement(
          `SELECT ${columns} FROM jobs WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`,
          user,
        ).all<Job>(),
        statement(
          'SELECT id, name, status, last_seen_at AS lastSeenAt, created_at AS createdAt FROM devices WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 50',
          user,
        ).all<Device>(),
        statement(
          'SELECT tool, enabled FROM tool_controls WHERE user_id = ?',
          user,
        ).all<{ tool: string; enabled: number }>(),
        statement(
          `SELECT COUNT(*) AS executions, COALESCE(SUM(input_bytes + COALESCE(output_bytes,0)),0) AS processedBytes,
        COALESCE(SUM(duration_ms),0) AS durationMs, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
        FROM jobs WHERE user_id = ? AND started_at IS NOT NULL AND created_at >= ?`,
          user,
          now - 30 * 86400_000,
        ).first<{
          executions: number;
          processedBytes: number;
          durationMs: number;
          completed: number | null;
        }>(),
        statement(
          `SELECT ${bookColumns}, EXISTS(SELECT 1 FROM book_records r WHERE r.reverses_id = book_records.id AND r.user_id = ?) AS reversed FROM book_records WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`,
          user,
          user,
        ).all<BookRecord & { reversed: number }>(),
        statement(
          "SELECT COALESCE(SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END),0) AS revenue, COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END),0) AS expense FROM book_records WHERE user_id = ?",
          user,
        ).first<{ revenue: number; expense: number }>(),
      ]);
    return {
      jobs: jobList.results.map(({ userId: _, ...job }) => job),
      devices: deviceList.results.map((d) => ({
        ...d,
        online: d.status === 'connected' && d.lastSeenAt > now - 90_000,
      })),
      tools: JOB_TOOLS.map((tool) => ({
        tool,
        enabled: controls.results.find((c) => c.tool === tool)?.enabled !== 0,
      })),
      usage: {
        ...usage!,
        networkBytes: null,
        electricityWh: null,
        apiCost: null,
        evidence: 'client-reported' as const,
      },
      book: {
        records: records.results,
        ...totals!,
        verified: false as const,
        currency: 'JPY' as const,
      },
      integrations: {
        sales: 'not-configured',
        payments: 'not-configured',
        payouts: 'not-configured',
        walletIdentity: 'address-only',
      },
      serverTime: now,
    };
  }

  async function wallet() {
    const [records, totals, fundRow] = await Promise.all([
      statement(
        `SELECT ${bookColumns}, EXISTS(SELECT 1 FROM book_records r WHERE r.reverses_id = book_records.id AND r.user_id = ?) AS reversed FROM book_records WHERE user_id = ? ORDER BY occurred_on DESC, created_at DESC, id DESC LIMIT 100`,
        user,
        user,
      ).all<BookRecord & { reversed: number }>(),
      statement(
        "SELECT COALESCE(SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END),0) AS revenue, COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END),0) AS expense FROM book_records WHERE user_id = ?",
        user,
      ).first<{ revenue: number; expense: number }>(),
      statement(
        'SELECT plan, updated_at AS updatedAt FROM fund_plans WHERE user_id = ?',
        user,
      ).first<{ plan: string; updatedAt: string }>(),
    ]);
    const revenue = totals?.revenue ?? 0;
    const expense = totals?.expense ?? 0;
    let fundPlan = defaultFund;
    if (fundRow?.plan) {
      try {
        fundPlan = validateFund(JSON.parse(fundRow.plan) as unknown);
      } catch {
        fundPlan = defaultFund;
      }
    }
    const fundProjection = distributeFund(fundPlan);
    return {
      currency: 'JPY' as const,
      balance: revenue - expense,
      revenue,
      expense,
      records: records.results,
      persistence: 'd1' as const,
      transfers: 'not-connected' as const,
      fund: {
        joined: fundPlan.joined,
        status: 'simulation' as const,
        commonRevenue: fundProjection.revenue,
        distributable: fundProjection.distributable,
        projectedShare: fundProjection.mine,
        updatedAt: fundRow?.updatedAt ?? null,
      },
    };
  }
  return {
    createJob,
    changeJob,
    listJobs,
    getJob: async (id: string) => {
      await expire();
      return getJob(id);
    },
    control,
    listSkyConnections,
    connectSky,
    device,
    book,
    wallet,
    overview,
  };
}
export type OperationsSnapshot = Awaited<
  ReturnType<ReturnType<typeof operations>['overview']>
>;
