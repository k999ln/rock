export type MercariChannel = 'consumer_assisted' | 'shops_connector';
export type MercariRevenueStatus =
  | 'review'
  | 'approved'
  | 'listed'
  | 'awaiting_provider_verification'
  | 'cancelled';

export type MercariRevenuePlan = {
  id: string;
  channel: MercariChannel;
  status: MercariRevenueStatus;
  revision: number;
  title: string;
  condition: string;
  facts: string;
  priceJPY: number;
  marketplaceFeeJPY: number;
  shippingJPY: number;
  itemCostJPY: number;
  otherCostJPY: number;
  expectedNetJPY: number;
  listingDraft: string;
  listingReference: string | null;
  saleReference: string | null;
  reportedNetJPY: number | null;
  verification: 'not_applicable' | 'provider_required';
  createdAt: string;
  updatedAt: string;
};

export class MercariRevenueError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function exactObject(value: unknown, keys: readonly string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new MercariRevenueError('入力項目を確認してください。');
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new MercariRevenueError(`${label}を${max}文字以内で入力してください。`);
  return value.trim();
}

function yen(value: unknown, label: string, max = 10_000_000) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  )
    throw new MercariRevenueError(`${label}を0円以上の整数で入力してください。`);
  return value;
}

function uuid(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    throw new MercariRevenueError('操作IDが不正です。');
  return value;
}

function requireSafeguards(value: Record<string, unknown>) {
  for (const key of ['ownsStock', 'accurate', 'prohibitedChecked'] as const)
    if (value[key] !== true)
      throw new MercariRevenueError(
        '在庫の保有、説明の正確性、禁止出品物の確認が必要です。',
      );
}

export function createMercariRevenuePlan(
  value: unknown,
  now = new Date().toISOString(),
): MercariRevenuePlan {
  const input = exactObject(value, [
    'id',
    'channel',
    'title',
    'condition',
    'facts',
    'priceJPY',
    'marketplaceFeeJPY',
    'shippingJPY',
    'itemCostJPY',
    'otherCostJPY',
    'ownsStock',
    'accurate',
    'prohibitedChecked',
  ]);
  requireSafeguards(input);
  if (!['consumer_assisted', 'shops_connector'].includes(input.channel as string))
    throw new MercariRevenueError('販売経路を確認してください。');
  const title = text(input.title, '商品名', 80);
  const condition = text(input.condition, '商品の状態', 80);
  const facts = text(input.facts, '商品の事実', 1200);
  const priceJPY = yen(input.priceJPY, '販売価格');
  if (priceJPY < 300)
    throw new MercariRevenueError('販売価格は300円以上にしてください。');
  const marketplaceFeeJPY = yen(input.marketplaceFeeJPY, '販売手数料');
  const shippingJPY = yen(input.shippingJPY, '送料');
  const itemCostJPY = yen(input.itemCostJPY, '仕入原価');
  const otherCostJPY = yen(input.otherCostJPY, 'その他実費');
  const expectedNetJPY =
    priceJPY -
    marketplaceFeeJPY -
    shippingJPY -
    itemCostJPY -
    otherCostJPY;
  const id = uuid(input.id);
  return {
    id,
    channel: input.channel as MercariChannel,
    status: 'review',
    revision: 0,
    title,
    condition,
    facts,
    priceJPY,
    marketplaceFeeJPY,
    shippingJPY,
    itemCostJPY,
    otherCostJPY,
    expectedNetJPY,
    listingDraft: `${title}\n\n【状態】\n${condition}\n\n【商品説明】\n${facts}\n\n写真と説明をご確認のうえ、不明点は購入前にご確認ください。`,
    listingReference: null,
    saleReference: null,
    reportedNetJPY: null,
    verification: 'not_applicable',
    createdAt: now,
    updatedAt: now,
  };
}

export function transitionMercariRevenuePlan(
  plan: MercariRevenuePlan,
  value: unknown,
  now = new Date().toISOString(),
): MercariRevenuePlan {
  const input = exactObject(value, [
    'id',
    'action',
    'expectedRevision',
    'listingReference',
    'saleReference',
    'reportedNetJPY',
  ]);
  if (uuid(input.id) !== plan.id)
    throw new MercariRevenueError('対象が一致しません。', 409);
  if (
    typeof input.expectedRevision !== 'number' ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision !== plan.revision
  )
    throw new MercariRevenueError(
      '別の画面で状態が変わりました。更新してからやり直してください。',
      409,
    );

  let patch: Partial<MercariRevenuePlan>;
  if (input.action === 'approve') {
    exactObject(value, ['id', 'action', 'expectedRevision']);
    if (plan.status !== 'review')
      throw new MercariRevenueError('確認待ちの原稿だけ承認できます。', 409);
    patch = { status: 'approved' };
  } else if (input.action === 'mark_listed') {
    exactObject(value, [
      'id',
      'action',
      'expectedRevision',
      'listingReference',
    ]);
    if (plan.status !== 'approved')
      throw new MercariRevenueError('承認後に出品を記録してください。', 409);
    patch = {
      status: 'listed',
      listingReference: text(input.listingReference, '出品URLまたは商品ID', 500),
    };
  } else if (input.action === 'report_sale') {
    exactObject(value, [
      'id',
      'action',
      'expectedRevision',
      'saleReference',
      'reportedNetJPY',
    ]);
    if (plan.status !== 'listed')
      throw new MercariRevenueError('出品済みの商品だけ売上を記録できます。', 409);
    patch = {
      status: 'awaiting_provider_verification',
      saleReference: text(input.saleReference, '取引参照', 200),
      reportedNetJPY: yen(input.reportedNetJPY, '実費後の受取見込額'),
      verification: 'provider_required',
    };
  } else if (input.action === 'cancel') {
    exactObject(value, ['id', 'action', 'expectedRevision']);
    if (plan.status === 'cancelled') return plan;
    patch = { status: 'cancelled' };
  } else {
    throw new MercariRevenueError('対応していない操作です。');
  }
  return {
    ...plan,
    ...patch,
    revision: plan.revision + 1,
    updatedAt: now,
  };
}

export const mercariConnectorReadiness = {
  consumerAssisted: 'ready' as const,
  shopsApi: 'requires_japan_fixed_ip_connector_and_mercari_contract' as const,
  verifiedSettlement: 'requires_provider_verified_completed_transaction' as const,
  directSiteApiCall: false,
};
