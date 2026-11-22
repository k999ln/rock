import { exactObject, OperatorError, uuid } from './validation.ts';
import { distributionText } from './distribution-address.ts';

export function whole(value: unknown, min = 1) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > 1_000_000_000
  )
    throw new OperatorError('数量・金額を範囲内の整数で指定してください。');
  return value;
}
export async function receiveLot(db: D1Database, input: unknown) {
  const r = exactObject(input, [
    'id',
    'supplier',
    'item',
    'units',
    'unit',
    'cost_yen',
    'freight_yen',
  ]);
  const id = uuid(r.id);
  const values = {
    supplier: distributionText(r.supplier, 120),
    item: distributionText(r.item, 120),
    units: whole(r.units),
    unit: distributionText(r.unit, 24),
    cost_yen: r.cost_yen === null ? null : whole(r.cost_yen, 0),
    freight_yen: r.freight_yen === null ? null : whole(r.freight_yen, 0),
  };
  await db
    .prepare(
      'INSERT INTO distribution_lots(id,supplier,item,units,unit,cost_yen,freight_yen,received_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
    )
    .bind(id, ...Object.values(values), Date.now())
    .run();
  const row = await db
    .prepare('SELECT * FROM distribution_lots WHERE id=?')
    .bind(id)
    .first();
  if (!row || Object.entries(values).some(([key, v]) => row[key] !== v))
    throw new OperatorError('同じ入荷番号には別の記録があります。', 409);
  return row;
}
export async function stockLedger(db: D1Database) {
  return (
    await db
      .prepare(`SELECT l.*, l.units-COALESCE(SUM(a.units),0) AS available,
    COALESCE(SUM(CASE WHEN a.received_at IS NULL THEN a.units END),0) AS awaiting,
    COALESCE(SUM(CASE WHEN a.received_at IS NOT NULL THEN a.units END),0) AS acknowledged,
    l.cost_yen+l.freight_yen AS total_yen
    FROM distribution_lots l LEFT JOIN distribution_assignments a ON a.lot_id=l.id
    GROUP BY l.id ORDER BY l.received_at DESC,l.id LIMIT 100`)
      .all()
  ).results;
}
