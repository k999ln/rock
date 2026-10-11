// Sky Compute Grid — HTTP surface of the persistent grid.
//
// The handlers here are plain functions of (request, dependencies) so the same
// code runs in the Worker routes and in tests against a real D1. Every response
// is no-store, and every refusal carries a stable machine-readable `code`.

import { a2aBrokerDeviceKeyResolver } from './a2a-broker-trust.ts';
import {
  COMPUTE_GRID_LIMITS,
  ComputeGridLiveError,
  computeGridMode,
  parseComputeOrder,
  verifyComputeGridDeviceRequest,
} from './sky-compute-grid-live.ts';
import { skyComputeGridStore } from './sky-compute-grid-store.ts';
import { COMPUTE_SKUS, type ComputeSkuRegistry } from './sky-compute-grid-skus.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;

export type ComputeGridApiDependencies = {
  db: Database;
  configuration: {
    // 'owner_pool' | 'owner_and_public_pool'; anything else keeps the grid off.
    SKY_COMPUTE_GRID_MODE?: unknown;
    // 64 hex characters; seals lot inputs and outputs at rest.
    SKY_COMPUTE_GRID_DATA_KEY?: unknown;
  };
  authenticate: (request: Request) => Promise<string>;
  scopeAllowed: (ownerUserId: string, request: Request) => Promise<boolean>;
  now?: () => number;
  skus?: ComputeSkuRegistry;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const messages: Record<string, string> = {
  compute_grid_disabled: 'Compute Gridはこの環境で有効化されていません。',
  compute_grid_data_key_unavailable: 'Compute Gridの保存用の鍵が設定されていません。',
  public_pool_not_enabled: '他の人の端末を使う公開プールは、まだ有効化されていません。',
  insufficient_credits: '利用可能なクレジットが予算に足りません。',
  order_id_conflict: '同じ注文IDで別の内容が既に登録されています。',
  order_still_open: '進行中の注文は、先に取り消してから削除してください。',
  too_many_open_orders: '進行中の注文が上限に達しています。',
  order_not_found: '注文が見つかりません。',
  owner_private_requires_owner_pool: '本人の非公開データは、自分の端末だけのプールで実行してください。',
  owner_pool_is_not_charged: '自分の端末だけのプールでは料金と予算を0にしてください。',
  sku_not_reviewed: '審査済みの計算種別ではありません。',
  sku_not_dispatchable: 'この計算種別は、まだ実端末へ配れません。',
  request_too_large: '入力が大きすぎます。',
  sign_in_required: 'サインインが必要です。',
  origin_rejected: 'このサイトから操作してください。',
  service_entitlement_required: 'RockstarOS Sky利用権を確認できません。',
  invalid_request: '入力形式を確認してください。',
  compute_grid_unavailable: 'Compute Gridを処理できませんでした。',
};

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function refusal(code: string, status: number) {
  return json({ code, error: messages[code] ?? '入力内容を確認してください。' }, status);
}

function errorResponse(error: unknown) {
  if (error instanceof ComputeGridLiveError) return refusal(error.code, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return refusal('sign_in_required', 401);
  if (error instanceof Error && error.message === 'ORIGIN') return refusal('origin_rejected', 403);
  if (error instanceof Error && error.message === 'BODY_TOO_LARGE') return refusal('request_too_large', 413);
  if (error instanceof SyntaxError ||
      (error instanceof Error && ['CONTENT_TYPE', 'BODY_INVALID', 'COMPUTE_LOT_INPUT_INVALID'].includes(error.message)))
    return refusal('invalid_request', 400);
  return refusal('compute_grid_unavailable', 503);
}

async function readJson(request: Request, maximumBytes: number) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new Error('CONTENT_TYPE');
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error('BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('BODY_INVALID');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new Error('BODY_TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}

export function computeGridApi(dependencies: ComputeGridApiDependencies) {
  const mode = computeGridMode(dependencies.configuration.SKY_COMPUTE_GRID_MODE);
  const skus = dependencies.skus ?? COMPUTE_SKUS;
  const clock = dependencies.now ?? Date.now;
  const store = skyComputeGridStore(dependencies.db, {
    mode,
    dataKey: typeof dependencies.configuration.SKY_COMPUTE_GRID_DATA_KEY === 'string'
      ? dependencies.configuration.SKY_COMPUTE_GRID_DATA_KEY
      : undefined,
    skus,
  });

  /** Authenticate, check the Sky entitlement, then run `action`; map every failure to JSON. */
  async function handle(
    request: Request,
    action: (ownerUserId: string, now: number) => Promise<Response>,
    options: { requireEnabled?: boolean } = {},
  ) {
    try {
      const ownerUserId = await dependencies.authenticate(request);
      if (!(await dependencies.scopeAllowed(ownerUserId, request)))
        return refusal('service_entitlement_required', 403);
      if (options.requireEnabled !== false && mode === 'disabled') return refusal('compute_grid_disabled', 503);
      return await action(ownerUserId, clock());
    } catch (error) {
      return errorResponse(error);
    }
  }

  const orderId = (value: string) => {
    if (!uuid.test(value)) throw new ComputeGridLiveError('order_id_invalid');
    return value;
  };

  return {
    /** GET status — what the signed-in owner's devices, orders and credits look like. */
    status: (request: Request) => handle(request, async (owner, now) => json({
      ...(await store.status(owner, now)),
      limits: {
        maxLotsPerOrder: COMPUTE_GRID_LIMITS.maxLotsPerOrder,
        maxLotsPerLease: COMPUTE_GRID_LIMITS.maxLotsPerLease,
        leaseTtlMs: COMPUTE_GRID_LIMITS.leaseTtlMs,
        outputRetentionMs: COMPUTE_GRID_LIMITS.outputRetentionMs,
      },
      skus: [...skus.values()].map((sku) => ({
        skuId: sku.skuId, title: sku.title, status: sku.status, ...sku.artifacts,
        input: sku.input, output: sku.output, comparison: sku.comparison,
        referenceComputation: sku.reference !== null,
      })),
    }), { requireEnabled: false }),

    listOrders: (request: Request) => handle(request, async (owner, now) =>
      json({ orders: await store.listOrders(owner, now) })),

    createOrder: (request: Request) => handle(request, async (owner, now) => {
      const input = await readJson(request, COMPUTE_GRID_LIMITS.maxOrderRequestBytes);
      const parsed = await parseComputeOrder(input, mode, now, skus);
      const { created, order } = await store.createOrder(owner, parsed, now);
      return json({ order }, created ? 201 : 200);
    }),

    getOrder: (request: Request, id: string) => handle(request, async (owner, now) => {
      const order = await store.getOrder(owner, orderId(id), now);
      return order ? json({ order }) : refusal('order_not_found', 404);
    }),

    cancelOrder: (request: Request, id: string) => handle(request, async (owner, now) => {
      const order = await store.cancelOrder(owner, orderId(id), now);
      return order ? json({ order }) : refusal('order_not_found', 404);
    }),

    results: (request: Request, id: string) => handle(request, async (owner, now) => {
      const results = await store.orderResults(owner, orderId(id), now);
      return results ? json(results) : refusal('order_not_found', 404);
    }),

    /** Delete the stored inputs and outputs of a closed order. */
    purgeOrder: (request: Request, id: string) => handle(request, async (owner, now) => {
      const order = await store.purgeOrder(owner, orderId(id), now);
      return order ? json({ order }) : refusal('order_not_found', 404);
    }),

    /**
     * POST device — the single endpoint an enrolled device talks to. The body is
     * `{ payload, signature, outputs? }`; the action inside the signed payload
     * selects offer, withdraw, claim, release or receipt.
     */
    device: (request: Request) => handle(request, async (owner, now) => {
      const body = await readJson(request, COMPUTE_GRID_LIMITS.maximumDeviceRequestBytes);
      // Enrolled, attested device keys only: no operator-provisioned fallback.
      const verified = await verifyComputeGridDeviceRequest(
        body, owner, a2aBrokerDeviceKeyResolver(dependencies.db, undefined), now, skus);
      const { request: signed } = verified;
      switch (signed.action) {
        case 'offer': return json({ offer: await store.registerOffer(owner, signed, now) });
        case 'withdraw': return json(await store.withdrawOffer(owner, signed, now));
        case 'claim': return json(await store.claim(owner, signed, now));
        case 'release': return json(await store.release(owner, signed, now));
        case 'receipt': return json({ receipt: await store.submitReceipt(owner, verified, now) });
      }
    }),
  };
}

export type ComputeGridApi = ReturnType<typeof computeGridApi>;
