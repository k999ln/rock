import { CLOUD_PRICES_2026_11_21, cloudUsageCostUsd, type CloudUsage, utcMonth } from './cloud-cost.ts';
import { CLOUD_FIRST_RESULT_SLO_MS, CLOUD_PROBE_INTERVAL_MS, readCloudSpend, type CloudBudget } from './cloud-operations.ts';

type Db = Pick<D1Database, 'prepare'>;
const DAY_MS = 86_400_000;

export class CloudTelemetryError extends Error {
  readonly status: 400 | 409;

  constructor(status: CloudTelemetryError['status']) {
    super(status === 400 ? 'CLOUD_TELEMETRY_INVALID' : 'CLOUD_TELEMETRY_CONFLICT');
    this.status = status;
  }
}

function object(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new CloudTelemetryError(400);
  }
  return value as Record<string, unknown>;
}

function nonnegative(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new CloudTelemetryError(400);
  }
  return value;
}

function integer(value: unknown) {
  const count = nonnegative(value);
  if (!Number.isSafeInteger(count)) throw new CloudTelemetryError(400);
  return count;
}

function usageRecord(value: unknown, now: number): CloudUsage {
  const kind = (value as { kind?: unknown } | null)?.kind;
  if (kind === 'container') {
    const row = object(value, ['kind', 'at', 'vcpuSeconds', 'gibSeconds', 'gbSeconds']);
    const at = integer(row.at);
    if (at > now) throw new CloudTelemetryError(400);
    return { kind, at, vcpuSeconds: nonnegative(row.vcpuSeconds), gibSeconds: nonnegative(row.gibSeconds), gbSeconds: nonnegative(row.gbSeconds) };
  }
  if (kind === 'model') {
    const row = object(value, ['kind', 'at', 'model', 'inputTokens', 'outputTokens']);
    const at = integer(row.at);
    if (at > now || typeof row.model !== 'string' || !/^[A-Za-z0-9@._/-]{1,128}$/u.test(row.model)) {
      throw new CloudTelemetryError(400);
    }
    return { kind, at, model: row.model, inputTokens: integer(row.inputTokens), outputTokens: integer(row.outputTokens) };
  }
  throw new CloudTelemetryError(400);
}

export async function ingestCloudUsage(db: Db, input: unknown, now: number) {
  const { id, userId, usage: rawUsage } = object(input, ['id', 'userId', 'usage']);
  if (typeof id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/u.test(id) ||
    (userId !== null && (typeof userId !== 'string' || !userId.trim() || userId.length > 256))) {
    throw new CloudTelemetryError(400);
  }
  const usage = usageRecord(rawUsage, now);
  if (usage.kind === 'model' && userId === null) throw new CloudTelemetryError(400);
  const usageJson = JSON.stringify(usage);
  const costUsd = cloudUsageCostUsd(usage);
  const result = await db.prepare(`INSERT INTO cloud_usage_records
    (id, user_id, observed_at, usage_json, price_version, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
    .bind(id, userId, usage.at, usageJson, CLOUD_PRICES_2026_11_21.version, costUsd).run();
  if (result.meta.changes > 0) return true;
  const stored = await db.prepare('SELECT user_id AS userId, usage_json AS usage FROM cloud_usage_records WHERE id = ?')
    .bind(id).first<{ userId: string | null; usage: string }>();
  if (stored?.userId !== userId || stored.usage !== usageJson) throw new CloudTelemetryError(409);
  return false;
}

export async function ingestCloudProbe(db: Db, input: unknown, now: number) {
  const row = object(input, ['observedAt', 'statusCode', 'latencyMs', 'ok']);
  const observedAt = integer(row.observedAt);
  const statusCode = row.statusCode === null ? null : integer(row.statusCode);
  const latencyMs = integer(row.latencyMs);
  if (observedAt > now || latencyMs >= CLOUD_PROBE_INTERVAL_MS ||
    (statusCode !== null && (statusCode < 100 || statusCode > 599)) ||
    typeof row.ok !== 'boolean' || (row.ok && statusCode !== 200)) {
    throw new CloudTelemetryError(400);
  }
  const slotAt = Math.floor(observedAt / CLOUD_PROBE_INTERVAL_MS) * CLOUD_PROBE_INTERVAL_MS;
  const ok = row.ok ? 1 : 0;
  const result = await db.prepare(`INSERT INTO cloud_admission_probes
    (slot_at, observed_at, status_code, latency_ms, ok)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(slot_at) DO NOTHING`)
    .bind(slotAt, observedAt, statusCode, latencyMs, ok).run();
  if (result.meta.changes > 0) return true;
  const stored = await db.prepare(`SELECT observed_at AS observedAt, status_code AS statusCode, latency_ms AS latencyMs, ok
    FROM cloud_admission_probes WHERE slot_at = ?`)
    .bind(slotAt).first<{ observedAt: number; statusCode: number | null; latencyMs: number; ok: number }>();
  if (stored?.observedAt !== observedAt || stored.statusCode !== statusCode ||
    stored.latencyMs !== latencyMs || stored.ok !== ok) throw new CloudTelemetryError(409);
  return false;
}

export async function readCloudOperations(db: Db, budget: CloudBudget, now: number) {
  const month = utcMonth(now);
  const from = Date.parse(`${month}-01T00:00:00Z`);
  const [spend, availability, timing] = await Promise.all([
    readCloudSpend(db, '', now),
    db.prepare(`SELECT date(slot_at / 1000, 'unixepoch') AS day, COUNT(*) AS observed, SUM(ok) AS successes
      FROM cloud_admission_probes WHERE slot_at >= ? AND observed_at <= ? GROUP BY day`)
      .bind(from, now).all<{ day: string; observed: number; successes: number }>(),
    db.prepare(`WITH observations AS (
      SELECT date(admitted_at / 1000, 'unixepoch') AS day,
        CASE WHEN first_result_at <= ?1 THEN first_result_at - admitted_at END AS durationMs,
        admitted_at <= ?1 - ?2 AS mature
      FROM cloud_execution_timings WHERE admitted_at BETWEEN ?3 AND ?1
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY day ORDER BY durationMs NULLS LAST) AS position,
        COUNT(durationMs) OVER (PARTITION BY day) AS completed
      FROM observations
    )
    SELECT day, COUNT(*) AS admitted, SUM(durationMs IS NOT NULL OR mature) AS eligible,
      SUM(CASE WHEN durationMs <= ?2 THEN 1 ELSE 0 END) AS within30s,
      MAX(CASE WHEN position = (completed * 95 + 99) / 100 THEN durationMs END) AS p95Ms
    FROM ranked GROUP BY day`)
      .bind(now, CLOUD_FIRST_RESULT_SLO_MS, from)
      .all<{ day: string; admitted: number; eligible: number; within30s: number; p95Ms: number | null }>(),
  ]);
  const probesByDay = new Map(availability.results.map((row) => [row.day, row]));
  const timingsByDay = new Map(timing.results.map((row) => [row.day, row]));
  const days = [];
  for (let start = from; start <= now; start += DAY_MS) {
    const day = new Date(start).toISOString().slice(0, 10);
    const probe = probesByDay.get(day);
    const results = timingsByDay.get(day);
    days.push({
      day,
      expected: Math.floor((Math.min(now, start + DAY_MS - 1) - start) / CLOUD_PROBE_INTERVAL_MS) + 1,
      observed: probe?.observed ?? 0,
      successes: probe?.successes ?? 0,
      admitted: results?.admitted ?? 0,
      eligible: results?.eligible ?? 0,
      within30s: results?.within30s ?? 0,
      p95Ms: results?.p95Ms ?? null,
    });
  }
  return { month, totalUsd: spend.totalUsd, unpriced: spend.unpriced, budget, days };
}

export type CloudOperationsReport = Awaited<ReturnType<typeof readCloudOperations>>;
