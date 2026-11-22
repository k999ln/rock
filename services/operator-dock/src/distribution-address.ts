import { exactObject, OperatorError, uuid } from './validation.ts';

export function distributionText(value: unknown, max: number) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /\p{Cc}/u.test(value)
  )
    throw new OperatorError('入力内容と文字数を確認してください。');
  return value.trim();
}

export async function registerAddress(
  db: D1Database,
  owner: string,
  input: unknown,
  account: string | null = null,
) {
  const fields = exactObject(input, [
    'name',
    'postal',
    'prefecture',
    'city',
    'street',
    'building',
  ]);
  const digits = distributionText(fields.postal, 10)
    .normalize('NFKC')
    .replace(/^(\d{3})-(\d{4})$/u, '$1$2');
  if (!/^\d{7}$/.test(digits))
    throw new OperatorError('郵便番号を7桁で入力してください。');
  const address = {
    name: distributionText(fields.name, 80),
    postal: digits.slice(0, 3) + '-' + digits.slice(3),
    prefecture: distributionText(fields.prefecture, 16),
    city: distributionText(fields.city, 80),
    street: distributionText(fields.street, 140),
    building: fields.building ? distributionText(fields.building, 100) : '',
  };
  await db
    .prepare(`INSERT INTO distribution_addresses(recipient,address,updated_at,account_ref) VALUES(?,?,?,?)
    ON CONFLICT(recipient) DO UPDATE SET address=excluded.address,updated_at=excluded.updated_at,account_ref=COALESCE(excluded.account_ref,distribution_addresses.account_ref)
    WHERE address<>excluded.address OR (excluded.account_ref IS NOT NULL AND distribution_addresses.account_ref IS NOT excluded.account_ref)`)
    .bind(owner, JSON.stringify(address), Date.now(), account)
    .run();
}
export async function recipientAddress(db: D1Database, owner: string) {
  const row = await db
    .prepare('SELECT address FROM distribution_addresses WHERE recipient=?')
    .bind(owner)
    .first<{ address: string }>();
  return row ? JSON.parse(row.address) : null;
}
export async function shippingAddress(db: D1Database, assignment: string) {
  const row = await db
    .prepare('SELECT address_snapshot FROM distribution_assignments WHERE id=?')
    .bind(uuid(assignment))
    .first<{ address_snapshot: string | null }>();
  if (!row?.address_snapshot)
    throw new OperatorError('この指定に保存された配送先はありません。', 404);
  return JSON.parse(row.address_snapshot);
}
