import { SkySubmissionError } from './sky-submission.ts';

type Database = Pick<D1Database, 'prepare'>;

export type SkyToolEvent = {
  packageKey: string;
  toolName: string;
  installationId: string;
  outcome: 'succeeded' | 'failed' | 'rejected' | 'unknown';
  durationMs: number;
  occurredAt: string;
};

function text(value: unknown, label: string, pattern: RegExp, max = 200) {
  if (typeof value !== 'string' || value.length > max || !pattern.test(value))
    throw new SkySubmissionError(`${label}を確認してください。`);
  return value;
}

export function parseSkyToolEvent(value: unknown): SkyToolEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SkySubmissionError('利用イベントの形式を確認してください。');
  const input = value as Record<string, unknown>;
  const keys = [
    'packageKey',
    'toolName',
    'installationId',
    'outcome',
    'durationMs',
    'occurredAt',
  ];
  if (
    Object.keys(input).some((key) => !keys.includes(key)) ||
    keys.some((key) => !(key in input))
  )
    throw new SkySubmissionError('利用イベントに不足または未対応の項目があります。');
  const durationMs = input.durationMs;
  if (!Number.isInteger(durationMs) || (durationMs as number) < 0 || (durationMs as number) > 86_400_000)
    throw new SkySubmissionError('実行時間を確認してください。');
  const occurredAt = text(
    input.occurredAt,
    '実行時刻',
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,
    30,
  );
  if (Math.abs(Date.now() - Date.parse(occurredAt)) > 7 * 24 * 60 * 60 * 1000)
    throw new SkySubmissionError('実行時刻は現在から7日以内にしてください。');
  return {
    packageKey: text(
      input.packageKey,
      'Package ID',
      /^[a-z0-9]+(?:[.-][a-z0-9]+)+@[0-9]+\.[0-9]+\.[0-9]+$/,
    ),
    toolName: text(input.toolName, 'MCP Tool名', /^[a-zA-Z0-9_.-]+$/, 128),
    installationId: text(
      input.installationId,
      '匿名Installation ID',
      /^[a-zA-Z0-9_-]{8,128}$/,
      128,
    ),
    outcome: text(
      input.outcome,
      '結果',
      /^(succeeded|failed|rejected|unknown)$/,
      20,
    ) as SkyToolEvent['outcome'],
    durationMs: durationMs as number,
    occurredAt,
  };
}

export function skyToolEventStore(db: Database) {
  return {
    async record(userId: string, event: SkyToolEvent) {
      const result = await db
        .prepare(
          `INSERT INTO sky_tool_events
           (id, package_key, owner_user_id, tool_name, installation_id, outcome, duration_ms, occurred_at, created_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM sky_tool_packages
             WHERE package_key = ? AND user_id = ?
           )`,
        )
        .bind(
          crypto.randomUUID(),
          event.packageKey,
          userId,
          event.toolName,
          event.installationId,
          event.outcome,
          event.durationMs,
          event.occurredAt,
          Date.now(),
          event.packageKey,
          userId,
        )
        .run();
      if (Number(result.meta.changes ?? 0) !== 1)
        throw new SkySubmissionError('このToolの利用イベントを記録できません。', 403);
    },

    async summary(userId: string) {
      const rows = await db
        .prepare(
          `SELECT package_key AS packageKey, tool_name AS toolName,
                  count(*) AS runs,
                  count(DISTINCT installation_id) AS installations,
                  sum(CASE WHEN outcome = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
                  sum(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END) AS failed,
                  round(avg(duration_ms)) AS averageDurationMs,
                  max(occurred_at) AS lastUsedAt
           FROM sky_tool_events
           WHERE owner_user_id = ?
           GROUP BY package_key, tool_name
           ORDER BY max(occurred_at) DESC LIMIT 200`,
        )
        .bind(userId)
        .all();
      return rows.results;
    },
  };
}

