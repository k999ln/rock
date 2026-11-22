import { exactObject, OperatorError, uuid } from './validation.ts';
import { distributionText } from './distribution-address.ts';
import { whole } from './distribution-stock.ts';

const operatorColumns =
  'id,recipient,item,quantity,pickup,assigned_at,received_at,lot_id,units,plan_id,window_at,notice_state,next_attempt,attempts,result_id,ready_at,usage_yen';
const visible = "notice_state IN ('legacy','ready')";
export async function assignDistribution(
  db: D1Database,
  input: unknown,
  plan?: { id: string; due: number },
) {
  const stocked = !!input && typeof input === 'object' && 'lot_id' in input;
  const row = exactObject(input, [
    'id',
    'recipient',
    'pickup',
    ...(stocked ? ['lot_id', 'units'] : ['item', 'quantity']),
  ]);
  const id = uuid(row.id),
    recipient = distributionText(row.recipient, 128),
    pickup = distributionText(row.pickup, 240);
  const lot = stocked ? uuid(row.lot_id) : null,
    units = stocked ? whole(row.units) : null;
  const item = stocked ? null : distributionText(row.item, 120),
    quantity = stocked ? null : distributionText(row.quantity, 80);
  // D1 serializes this single write. Availability, address snapshot, assignment and
  // the pending notice all become visible together, including after a lost reply.
  const prefix = `INSERT INTO distribution_assignments
    (id,recipient,item,quantity,pickup,assigned_at,lot_id,units,address_snapshot,notice_state,plan_id,window_at)`;
  if (lot) {
    await db
      .prepare(
        prefix +
          ` SELECT ?,s.recipient,l.item,CAST(? AS INTEGER) || l.unit,?,?,l.id,?,s.address,'queued',?,?
      FROM distribution_addresses s CROSS JOIN distribution_lots l
      WHERE s.recipient=? AND l.id=? AND l.units-COALESCE((SELECT SUM(a.units) FROM distribution_assignments a WHERE a.lot_id=l.id),0)>=?
      AND (? IS NULL OR EXISTS(SELECT 1 FROM distribution_plans p WHERE p.id=? AND p.enabled=1 AND p.next_at=?))
      ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        id,
        units,
        pickup,
        Date.now(),
        units,
        plan?.id ?? null,
        plan?.due ?? null,
        recipient,
        lot,
        units,
        plan?.id ?? null,
        plan?.id ?? null,
        plan?.due ?? null,
      )
      .run();
  }
  const saved = await db
    .prepare(
      'SELECT ' + operatorColumns + ' FROM distribution_assignments WHERE id=?',
    )
    .bind(id)
    .first();
  if (!saved) {
    if (!stocked)
      throw new OperatorError(
        '新しい配給には入荷ロットと数量を指定してください。',
        409,
      );
    const registered = await db
      .prepare('SELECT 1 AS yes FROM distribution_addresses WHERE recipient=?')
      .bind(recipient)
      .first();
    throw new OperatorError(
      registered
        ? '入荷済みの在庫が不足しています。'
        : '受取人の配送先登録をお待ちください。',
      409,
    );
  }
  if (
    saved.recipient !== recipient ||
    saved.pickup !== pickup ||
    saved.lot_id !== lot ||
    saved.units !== units ||
    (!stocked && (saved.item !== item || saved.quantity !== quantity))
  )
    throw new OperatorError('同じ操作番号には別の指定があります。', 409);
  return saved;
}
export async function operatorAssignments(db: D1Database) {
  return (
    await db
      .prepare(
        'SELECT ' +
          operatorColumns +
          ' FROM distribution_assignments ORDER BY assigned_at DESC,id LIMIT 100',
      )
      .all()
  ).results;
}
export async function recipientAssignments(db: D1Database, owner: string) {
  return (
    await db
      .prepare(
        `SELECT id,item,quantity,pickup,assigned_at,received_at FROM distribution_assignments WHERE recipient=? AND ${visible} ORDER BY received_at IS NOT NULL,assigned_at DESC,id`,
      )
      .bind(owner)
      .all()
  ).results;
}
export async function recipientHasPending(db: D1Database, owner: string) {
  return !!(await db
    .prepare(
      `SELECT 1 FROM distribution_assignments WHERE recipient=? AND received_at IS NULL AND ${visible} LIMIT 1`,
    )
    .bind(owner)
    .first());
}
export async function receiveAssignment(
  db: D1Database,
  owner: string,
  id: string,
) {
  const row = await db
    .prepare(`UPDATE distribution_assignments SET received_at=COALESCE(received_at,?),
    address_snapshot=CASE WHEN received_at IS NULL THEN COALESCE(address_snapshot,(SELECT address FROM distribution_addresses WHERE recipient=?)) ELSE address_snapshot END
    WHERE id=? AND recipient=? AND ${visible} AND (received_at IS NOT NULL OR EXISTS(SELECT 1 FROM distribution_addresses WHERE recipient=?))
    RETURNING received_at`)
    .bind(Date.now(), owner, uuid(id), owner, owner)
    .first();
  if (!row) {
    const available = await db
      .prepare(
        `SELECT 1 FROM distribution_assignments WHERE id=? AND recipient=? AND ${visible}`,
      )
      .bind(id, owner)
      .first();
    throw new OperatorError(
      available
        ? '定期便を受け取る前に配送先を登録してください。'
        : 'この定期便は見つかりません。',
      available ? 409 : 404,
    );
  }
  return row;
}
