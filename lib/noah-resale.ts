import {
  createPrivateZoomWorkJob,
  type WorkJob,
  WorkError,
} from './workflow.ts';

export const resaleRoles = ['street', 'archive', 'objects'] as const;
export type ResaleRole = (typeof resaleRoles)[number];
export type ResaleCurrency = 'USD' | 'JPY';
export type ResaleItem = {
  id: string;
  role: ResaleRole;
  provider: 'ebay' | 'manual';
  externalId: string;
  title: string;
  url: string;
  currency: ResaleCurrency;
  price: number;
  observedAt: string;
  status:
    | 'candidate'
    | 'purchasing'
    | 'purchase_unknown'
    | 'purchased'
    | 'received'
    | 'publishing'
    | 'listing_unknown'
    | 'listed'
    | 'sold';
  condition: string;
  notes: string;
  assessment?: {
    resalePrice: number;
    costs: number;
    evidence: string;
    floorProfit: number;
  };
  checkout?: {
    id: string;
    total: number;
    digest: string;
    expiresAt: number;
    summary: string;
  };
  purchase?: {
    reference: string;
    total: number;
    source: 'provider' | 'owner_reported';
  };
  listing?: {
    title: string;
    description: string;
    price: number;
    categoryId: string;
    conditionCode: 'NEW' | 'USED_EXCELLENT' | 'USED_GOOD' | 'USED_ACCEPTABLE';
    images: string[];
    offerId?: string;
    listingId?: string;
  };
  settlementHistory?: ResaleItem['settlement'][];
  settlement?: {
    reference: string;
    gross: number;
    fees: number;
    shipping: number;
    other: number;
    refunds: number;
    source: 'owner_reported';
  };
};
export type ResaleOperation = {
  id: string;
  itemId: string;
  action: 'purchase' | 'publish';
  state: 'pending' | 'unknown' | 'done';
  reserved: number;
  at: string;
  error?: string;
  resolution?: 'not_dispatched';
};
export type ResaleState = {
  schema: 'noah.resale/1';
  currency: ResaleCurrency;
  budget: number;
  perItemCap: number;
  paused: boolean;
  items: ResaleItem[];
  operations: ResaleOperation[];
  searches?: Record<ResaleRole, string>;
  scan?: {
    at: string;
    results: Array<{ role: ResaleRole; count: number; error?: string }>;
  };
};
export type ResaleWork = WorkJob & { resale: ResaleState };
export function amount(v: unknown, label = '金額'): number {
  if (
    typeof v !== 'number' ||
    !Number.isSafeInteger(v) ||
    v < 0 ||
    v > 100_000_000
  )
    throw new WorkError(
      `${label}は0以上の整数（最小通貨単位）で指定してください。`,
    );
  return v;
}
export function txt(v: unknown, max = 500): string {
  if (
    typeof v !== 'string' ||
    !v.trim() ||
    v.length > max ||
    Array.from(v).some(
      (c) => c.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(c),
    )
  )
    throw new WorkError('入力文字数・内容を確認してください。');
  return v.trim();
}
export function publicLink(v: unknown): string {
  const u = new URL(txt(v));
  if (u.protocol !== 'https:' || u.username || u.password)
    throw new WorkError('公開HTTPSの商品URLを指定してください。');
  return u.href;
}
export function createResaleJob(id: string): ResaleWork {
  return {
    ...createPrivateZoomWorkJob({
      id,
      title: 'セレクト・リセール',
      objective: '3担当で商品探索・仕入れ・在庫・出品・採算を管理',
    }),
    templateId: 'noah-resale',
    steps: [],
    resale: {
      schema: 'noah.resale/1',
      currency: 'USD',
      budget: 0,
      perItemCap: 0,
      paused: false,
      items: [],
      operations: [],
    },
  };
}
export function asResale(job: WorkJob): ResaleWork {
  const j = job as ResaleWork;
  if (j.templateId !== 'noah-resale' || j.resale?.schema !== 'noah.resale/1')
    throw new WorkError('リセールの仕事を確認してください。');
  return j;
}
export function totals(s: ResaleState) {
  const reserved = s.operations
    .filter((o) => o.state !== 'done')
    .reduce((n, o) => n + o.reserved, 0);
  const spent = s.items.reduce((n, i) => n + (i.purchase?.total || 0), 0);
  const inventoryCost = s.items
    .filter((i) => i.purchase && !i.settlement)
    .reduce((n, i) => n + i.purchase!.total, 0);
  const reportedProfit = s.items
    .filter((i) => i.settlement && i.purchase)
    .reduce((n, i) => {
      const t = i.settlement!;
      return (
        n +
        t.gross -
        t.fees -
        t.shipping -
        t.other -
        t.refunds -
        i.purchase!.total
      );
    }, 0);
  return {
    reserved,
    spent,
    remaining: s.budget - spent - reserved,
    inventoryCost,
    reportedProfit,
    settledCount: s.items.filter((i) => i.settlement).length,
    verification: 'owner_reported_not_wallet_balance',
  };
}
export function candidate(
  input: Record<string, unknown>,
  now = new Date().toISOString(),
): ResaleItem {
  if (
    !resaleRoles.includes(input.role as ResaleRole) ||
    !['USD', 'JPY'].includes(String(input.currency))
  )
    throw new WorkError('担当・通貨を確認してください。');
  return {
    id: crypto.randomUUID(),
    role: input.role as ResaleRole,
    provider: 'manual',
    externalId: txt(input.externalId || input.url),
    title: txt(input.title, 80),
    url: publicLink(input.url),
    currency: input.currency as ResaleCurrency,
    price: amount(input.price),
    observedAt: now,
    status: 'candidate',
    condition: '未検品',
    notes: '',
  };
}
export function ingest(s: ResaleState, values: ResaleItem[]) {
  const keys = new Set(s.items.map((i) => `${i.provider}:${i.externalId}`));
  for (const i of values)
    if (i.currency === s.currency) keys.add(`${i.provider}:${i.externalId}`);
  if (keys.size > 100) throw new WorkError('保存は100商品までです。');
  for (const i of values) {
    if (i.currency !== s.currency) continue;
    const old = s.items.find(
      (x) => x.provider === i.provider && x.externalId === i.externalId,
    );
    if (!old && s.items.length >= 100)
      throw new WorkError('保存は100商品までです。');
    if (!old) s.items.push(i);
    else if (old.status === 'candidate') {
      old.price = i.price;
      old.observedAt = i.observedAt;
      old.checkout = undefined;
    }
  }
}
export function item(s: ResaleState, id: unknown) {
  const i = s.items.find((x) => x.id === id);
  if (!i) throw new WorkError('商品が見つかりません。', 404);
  return i;
}
export function localAction(s: ResaleState, v: Record<string, unknown>) {
  if (v.action === 'configure') {
    if (v.confirm !== true) throw new WorkError('予算の確認が必要です。');
    const budget = amount(v.budget),
      cap = amount(v.perItemCap);
    if (cap > budget || budget < totals(s).spent + totals(s).reserved)
      throw new WorkError('予約済み・使用済みの金額と上限を確認してください。');
    if (
      !['USD', 'JPY'].includes(String(v.currency)) ||
      (s.items.length && v.currency !== s.currency)
    )
      throw new WorkError('在庫がある間は通貨を変更できません。');
    s.currency = v.currency as ResaleCurrency;
    s.budget = budget;
    s.perItemCap = cap;
    return;
  }
  if (v.action === 'pause') {
    s.paused = true;
    return;
  }
  if (v.action === 'resume') {
    s.paused = false;
    return;
  }
  if (v.action === 'searches') {
    s.searches = {
      street: txt(v.street, 120),
      archive: txt(v.archive, 120),
      objects: txt(v.objects, 120),
    };
    return;
  }
  if (v.action === 'import') {
    ingest(s, [candidate(v)]);
    return;
  }
  const i = item(s, v.itemId);
  if (s.operations.some((o) => o.itemId === i.id && o.state !== 'done'))
    throw new WorkError(
      '実行中または結果不明です。先に取引を照合してください。',
      409,
    );
  if (v.action === 'remove_candidate') {
    if (
      i.status !== 'candidate' ||
      i.purchase ||
      s.operations.some((o) => o.itemId === i.id)
    )
      throw new WorkError('取引履歴のある商品は削除できません。');
    s.items = s.items.filter((x) => x.id !== i.id);
    return;
  }
  if (v.action === 'assess') {
    i.assessment = {
      resalePrice: amount(v.resalePrice),
      costs: amount(v.costs),
      floorProfit: amount(v.floorProfit),
      evidence: txt(v.evidence, 2000),
    };
    return;
  }
  if (v.action === 'record_purchase') {
    if (i.status !== 'candidate' || v.confirm !== true)
      throw new WorkError('未購入商品と購入記録の確認が必要です。');
    const total = amount(v.total),
      reference = txt(v.reference, 200);
    if (s.items.some((x) => x.purchase?.reference === reference))
      throw new WorkError('同じ購入記録は登録済みです。', 409);
    i.purchase = { total, reference, source: 'owner_reported' };
    i.status = 'purchased';
    return;
  }
  if (v.action === 'receive') {
    if (i.status !== 'purchased' || v.confirm !== true)
      throw new WorkError('購入済み商品の受取・真贋・検品を確認してください。');
    i.condition = txt(v.condition, 200);
    i.notes = txt(v.notes, 1200);
    i.status = 'received';
    return;
  }
  if (v.action === 'draft') {
    if (i.status !== 'received')
      throw new WorkError('受取・検品が完了した在庫だけ出品準備できます。');
    const price = amount(v.price);
    if (price === 0) throw new WorkError('販売価格を指定してください。');
    const images = Array.isArray(v.images) ? v.images.map(publicLink) : [];
    if (images.length > 12) throw new WorkError('実物画像は12件までです。');
    if (
      !['NEW', 'USED_EXCELLENT', 'USED_GOOD', 'USED_ACCEPTABLE'].includes(
        String(v.conditionCode),
      )
    )
      throw new WorkError('確認した商品の状態区分を選択してください。');
    i.listing = {
      conditionCode: v.conditionCode as NonNullable<
        ResaleItem['listing']
      >['conditionCode'],
      title: i.title,
      description: `${i.title}\n\n状態：${i.condition}\n${i.notes}\n\n写真・実寸・付属品をご確認ください。`,
      price,
      categoryId: typeof v.categoryId === 'string' ? v.categoryId : '',
      images,
    };
    return;
  }
  if (v.action === 'record_listing') {
    if (i.status !== 'received' || !i.listing || v.confirm !== true)
      throw new WorkError('出品原稿・保有在庫・掲載結果を確認してください。');
    if (
      s.items.some((x) => x.id !== i.id && x.listing?.listingId === v.reference)
    )
      throw new WorkError('同じ出品記録は登録済みです。', 409);
    i.listing.listingId = txt(v.reference, 200);
    i.status = 'listed';
    return;
  }
  if (v.action === 'settlement') {
    if (i.status !== 'listed' && i.status !== 'sold')
      throw new WorkError('出品済みの商品を選んでください。');
    const reference = txt(v.reference, 200);
    if (
      s.items.some(
        (x) => x.id !== i.id && x.settlement?.reference === reference,
      )
    )
      throw new WorkError('同じ取引の二重計上はできません。', 409);
    if (i.settlement) {
      i.settlementHistory ||= [];
      if (i.settlementHistory.length >= 50)
        throw new WorkError('訂正履歴の上限です。');
      i.settlementHistory.push({ ...i.settlement });
    }
    i.settlement = {
      reference,
      gross: amount(v.gross),
      fees: amount(v.fees),
      shipping: amount(v.shipping),
      other: amount(v.other),
      refunds: amount(v.refunds),
      source: 'owner_reported',
    };
    i.status = 'sold';
    return;
  }
  throw new WorkError('対応していない操作です。');
}
export function reserve(
  s: ResaleState,
  itemId: string,
  action: 'purchase' | 'publish',
  operationId: string,
  now = Date.now(),
) {
  const i = item(s, itemId);
  if (
    s.paused ||
    s.operations.some(
      (o) => o.id === operationId || (o.itemId === i.id && o.state !== 'done'),
    )
  )
    throw new WorkError('停止中・重複・結果不明の操作です。', 409);
  if (s.operations.length >= 100) throw new WorkError('操作記録の上限です。');
  let reserved = 0;
  if (action === 'purchase') {
    const q = i.checkout,
      a = i.assessment;
    if (
      i.status !== 'candidate' ||
      i.provider !== 'ebay' ||
      !q ||
      q.expiresAt <= now ||
      !a
    )
      throw new WorkError('新しい購入見積・採算評価が必要です。');
    if (
      q.total <= 0 ||
      q.total > s.perItemCap ||
      q.total > totals(s).remaining ||
      a.resalePrice - q.total - a.costs < a.floorProfit
    )
      throw new WorkError('購入上限・共有予算・最低利益の条件を満たしません。');
    reserved = q.total;
    i.status = 'purchasing';
  } else {
    if (
      i.status !== 'received' ||
      !i.listing ||
      !i.listing.images.length ||
      !i.listing.categoryId
    )
      throw new WorkError(
        '検品済み在庫・価格・実物写真・販売カテゴリが必要です。',
      );
    i.status = 'publishing';
  }
  s.operations.push({
    id: operationId,
    itemId,
    action,
    state: 'pending',
    reserved,
    at: new Date(now).toISOString(),
  });
}
export function finish(
  s: ResaleState,
  opId: string,
  result: { reference?: string; error?: string; notDispatched?: boolean },
) {
  const o = s.operations.find((x) => x.id === opId);
  if (!o || o.state === 'done')
    throw new WorkError('操作状態を確認してください。', 409);
  const i = item(s, o.itemId);
  if (result.notDispatched) {
    o.state = 'done';
    o.reserved = 0;
    o.resolution = 'not_dispatched';
    o.error = result.error;
    i.status = o.action === 'purchase' ? 'candidate' : 'received';
    if (o.action === 'purchase') i.checkout = undefined;
    return;
  }
  if (result.reference) {
    if (o.action === 'purchase') {
      i.purchase = {
        reference: txt(result.reference, 200),
        total: o.reserved,
        source: 'provider',
      };
      i.status = 'purchased';
    } else {
      i.listing!.listingId = txt(result.reference, 200);
      i.status = 'listed';
    }
    o.state = 'done';
    o.reserved = 0;
  } else {
    o.state = 'unknown';
    o.error = result.error || '結果を照合してください。';
    i.status = o.action === 'purchase' ? 'purchase_unknown' : 'listing_unknown';
  }
}
