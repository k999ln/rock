import { distributionText } from './distribution-address.ts';
import { assignDistribution } from './distribution.ts';
import { whole } from './distribution-stock.ts';
import { exactObject, OperatorError, uuid } from './validation.ts';

const day = 86_400_000;
type Plan = {
  id: string;
  recipient: string;
  template_lot: string;
  units: number;
  pickup: string;
  first_at: number;
  next_at: number;
  interval_days: number;
  window_hours: number;
  enabled: number;
  retry_at: number;
};
type Outcome = 'assigned' | 'shortage' | 'ineligible' | 'missed' | 'waiting';
export type Eligibility = (owner: string) => Promise<boolean>;
export async function createPlan(db: D1Database, input: unknown) {
  const r = exactObject(input, [
    'id',
    'recipient',
    'template_lot',
    'units',
    'pickup',
    'first_at',
    'interval_days',
    'window_hours',
  ]);
  const id = uuid(r.id);
  const row = {
    recipient: distributionText(r.recipient, 128),
    template_lot: uuid(r.template_lot),
    units: whole(r.units),
    pickup: distributionText(r.pickup, 180),
    first_at: r.first_at,
    interval_days: whole(r.interval_days),
    window_hours: whole(r.window_hours),
  };
  if (
    typeof row.first_at !== 'number' ||
    !Number.isSafeInteger(row.first_at) ||
    row.first_at <= 0 ||
    row.first_at > 8_000_000_000_000 ||
    row.interval_days > 366 ||
    row.window_hours > Math.min(168, 24 * row.interval_days)
  )
    throw new OperatorError('開始日時、間隔、受取時間を確認してください。');
  await db
    .prepare(`INSERT INTO distribution_plans(id,recipient,template_lot,units,pickup,first_at,interval_days,window_hours,next_at)
    SELECT ?,?,?,?,?,?,?,?,? FROM distribution_lots WHERE id=? ON CONFLICT(id) DO NOTHING`)
    .bind(id, ...Object.values(row), row.first_at, row.template_lot)
    .run();
  const saved = await db
    .prepare('SELECT * FROM distribution_plans WHERE id=?')
    .bind(id)
    .first();
  if (!saved || Object.entries(row).some(([k, v]) => saved[k] !== v))
    throw new OperatorError(
      '同じ計画番号または元の入荷を確認してください。',
      409,
    );
  return saved;
}
export async function listPlans(db: D1Database) {
  const [plans, windows] = await db.batch([
    db.prepare(
      'SELECT p.*,l.item,l.unit FROM distribution_plans p JOIN distribution_lots l ON l.id=p.template_lot ORDER BY next_at,id LIMIT 100',
    ),
    db.prepare(
      'SELECT * FROM distribution_occurrences ORDER BY attempted_at DESC,plan_id LIMIT 100',
    ),
  ]);
  return { plans: plans.results, windows: windows.results };
}
export async function setPlan(db: D1Database, id: string, input: unknown) {
  const r = exactObject(input, ['enabled']);
  if (typeof r.enabled !== 'boolean')
    throw new OperatorError('定期配給の状態を確認してください。');
  const row = await db
    .prepare(
      'UPDATE distribution_plans SET enabled=?,retry_at=0 WHERE id=? RETURNING id,enabled',
    )
    .bind(Number(r.enabled), uuid(id))
    .first();
  if (!row) throw new OperatorError('計画が見つかりません。', 404);
  return row;
}
async function occurrenceId(plan: Plan) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(
        JSON.stringify(['distribution', plan.id, plan.next_at]),
      ),
    ),
  );
  bytes[6] = (bytes[6] & 15) | 0x80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes.slice(0, 16), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
async function allocateWindow(
  db: D1Database,
  p: Plan,
  id: string,
  now: number,
  eligible: Eligibility,
): Promise<Outcome> {
  if (
    await db
      .prepare('SELECT 1 FROM distribution_assignments WHERE id=?')
      .bind(id)
      .first()
  )
    return 'assigned';
  if (now >= p.next_at + p.window_hours * 3600000) return 'missed';
  if (
    !(await eligible(p.recipient)) ||
    !(await db
      .prepare('SELECT 1 FROM distribution_addresses WHERE recipient=?')
      .bind(p.recipient)
      .first())
  )
    return 'ineligible';
  const lot = await db
    .prepare(`SELECT l.id FROM distribution_lots l JOIN distribution_lots t ON t.id=?
    WHERE l.item=t.item AND l.unit=t.unit AND l.units-COALESCE((SELECT SUM(a.units) FROM distribution_assignments a WHERE a.lot_id=l.id),0)>=?
    ORDER BY l.received_at,l.id LIMIT 1`)
    .bind(p.template_lot, p.units)
    .first<{ id: string }>();
  if (!lot) return 'shortage';
  const window = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(p.next_at);
  try {
    await assignDistribution(
      db,
      {
        id,
        recipient: p.recipient,
        lot_id: lot.id,
        units: p.units,
        pickup:
          p.pickup + ' ／ ' + window + ' JST から' + p.window_hours + '時間',
      },
      { id: p.id, due: p.next_at },
    );
    return 'assigned';
  } catch (error) {
    if (!(error instanceof OperatorError) || error.status !== 409) throw error;
    if (
      await db
        .prepare('SELECT 1 FROM distribution_assignments WHERE id=?')
        .bind(id)
        .first()
    )
      return 'assigned';
    return 'waiting';
  }
}
export async function runPlans(
  db: D1Database,
  eligible: Eligibility,
  now = Date.now(),
) {
  const rows = await db
    .prepare(
      'SELECT * FROM distribution_plans p WHERE next_at<=? AND retry_at<=? AND (enabled=1 OR EXISTS(SELECT 1 FROM distribution_assignments a WHERE a.plan_id=p.id AND a.window_at=p.next_at)) ORDER BY next_at,id LIMIT 25',
    )
    .bind(now, now)
    .all<Plan>();
  for (const p of rows.results) {
    const id = await occurrenceId(p);
    let status: Outcome;
    try {
      status = await allocateWindow(db, p, id, now, eligible);
    } catch {
      status = 'waiting';
    }
    // Resolve from the committed allocation again inside the write transaction:
    // a simultaneous tick may have filled the window while we observed a shortage.
    await db.batch([
      db
        .prepare(`INSERT INTO distribution_occurrences(plan_id,due,status,attempted_at,assignment_id)
        SELECT p.id,p.next_at,CASE WHEN a.id IS NULL THEN ? ELSE 'assigned' END,?,a.id
        FROM distribution_plans p LEFT JOIN distribution_assignments a ON a.plan_id=p.id AND a.window_at=p.next_at
        WHERE p.id=? AND p.next_at=? AND (p.enabled=1 OR a.id IS NOT NULL)
        ON CONFLICT(plan_id,due) DO UPDATE SET status=excluded.status,attempted_at=excluded.attempted_at,assignment_id=excluded.assignment_id
        WHERE distribution_occurrences.status NOT IN ('assigned','missed')`)
        .bind(status, now, p.id, p.next_at),
      db
        .prepare(`UPDATE distribution_plans SET next_at=next_at+interval_days*?,retry_at=0
        WHERE id=? AND next_at=? AND EXISTS(SELECT 1 FROM distribution_occurrences WHERE plan_id=? AND due=? AND status IN ('assigned','missed'))`)
        .bind(day, p.id, p.next_at, p.id, p.next_at),
      db
        .prepare(
          'UPDATE distribution_plans SET retry_at=? WHERE id=? AND enabled=1 AND next_at=?',
        )
        .bind(
          Math.min(now + 60_000, p.next_at + p.window_hours * 3600000),
          p.id,
          p.next_at,
        ),
    ]);
  }
}
