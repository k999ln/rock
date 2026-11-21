import { exactObject, OperatorError, uuid } from './validation.ts';

type Assignment = {
  id: string;
  recipient: string;
  item: string;
  quantity: string;
  pickup: string;
  assigned_at: number;
  received_at: number | null;
};
function required(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new OperatorError('配給の指定内容を確認してください。');
  return value.trim();
}
export async function assignDistribution(db: D1Database, input: unknown) {
  const row = exactObject(input, [
    'id',
    'recipient',
    'item',
    'quantity',
    'pickup',
  ]);
  const id = uuid(row.id),
    recipient = required(row.recipient, 160),
    item = required(row.item, 120);
  const quantity = required(row.quantity, 80),
    pickup = required(row.pickup, 240);
  await db
    .prepare(
      'INSERT INTO distribution_assignments(id,recipient,item,quantity,pickup,assigned_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
    )
    .bind(id, recipient, item, quantity, pickup, Date.now())
    .run();
  const saved = await db
    .prepare('SELECT * FROM distribution_assignments WHERE id=?')
    .bind(id)
    .first<Assignment>();
  if (
    !saved ||
    saved.recipient !== recipient ||
    saved.item !== item ||
    saved.quantity !== quantity ||
    saved.pickup !== pickup
  )
    throw new OperatorError('同じ操作番号には別の指定があります。', 409);
  return saved;
}
export async function operatorAssignments(db: D1Database) {
  return (
    await db
      .prepare(
        'SELECT * FROM distribution_assignments ORDER BY assigned_at DESC, id LIMIT 100',
      )
      .all<Assignment>()
  ).results;
}
export async function recipientAssignments(db: D1Database, owner: string) {
  return (
    await db
      .prepare(
        'SELECT id,item,quantity,pickup,assigned_at,received_at FROM distribution_assignments WHERE recipient=? ORDER BY received_at IS NOT NULL, assigned_at DESC, id',
      )
      .bind(owner)
      .all<Omit<Assignment, 'recipient'>>()
  ).results;
}
export async function recipientHasPending(db: D1Database, owner: string) {
  return !!(await db
    .prepare(
      'SELECT 1 FROM distribution_assignments WHERE recipient=? AND received_at IS NULL LIMIT 1',
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
    .prepare(
      'UPDATE distribution_assignments SET received_at=COALESCE(received_at,?) WHERE id=? AND recipient=? RETURNING received_at',
    )
    .bind(Date.now(), uuid(id), owner)
    .first<{ received_at: number }>();
  if (!row) throw new OperatorError('この配給は見つかりません。', 404);
  return row;
}
