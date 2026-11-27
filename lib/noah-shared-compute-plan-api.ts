import { verifyStripeSignature } from '../shared/stripe.mjs';
import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor } from './owner-intent.ts';
import {
  beginCheckout,
  contractFor,
  PlanError,
  planView,
  readComputeBillingScope,
  syncContract,
  type BillingEnv,
  type BillingScope,
  type ComputeBillingProvider,
  type ComputeContract,
} from './noah-shared-compute-plan.ts';
import {
  computeStripeProvider,
  readComputeOffer,
  scopePrefix,
} from './noah-shared-compute-stripe.ts';

type Db = Pick<D1Database, 'prepare'>;
type Dependencies = {
  db: Db;
  env: BillingEnv;
  authenticate: (request: Request) => Promise<string>;
  provider?: (
    env: BillingEnv,
    scope: BillingScope,
    origin: string,
  ) => ComputeBillingProvider;
  now?: () => number;
};
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie, Authorization',
      'X-Content-Type-Options': 'nosniff',
    },
  });
function failure(err: unknown) {
  if (err instanceof PlanError || err instanceof NoahAgentError)
    return json({ error: err.message }, err.status);
  if (err instanceof SyntaxError)
    return json({ error: '入力形式を確認してください。' }, 400);
  if (err instanceof Error && err.message === 'UNAUTHORIZED')
    return json({ error: '月額契約にはサインインが必要です。' }, 401);
  if (err instanceof Error && err.message === 'ORIGIN')
    return json({ error: 'Noahの画面から操作してください。' }, 403);
  return json(
    { error: '契約状況を確認できません。時間をおいて再度お試しください。' },
    503,
  );
}

export function createComputePlanApi(deps: Dependencies) {
  return async (request: Request) => {
    try {
      const origin = new URL(request.url).origin,
        now = (deps.now ?? Date.now)();
      if (request.method !== 'GET' && request.method !== 'POST')
        return json({ error: '対応していない操作です。' }, 405);
      if (
        request.method === 'POST' &&
        (request.headers.get('origin') !== origin ||
          request.headers.get('sec-fetch-site') === 'cross-site')
      )
        return json({ error: 'Noahの画面から操作してください。' }, 403);
      const owner = await deps.authenticate(request);
      if (!owner || owner.startsWith('noah-browser:'))
        throw Error('UNAUTHORIZED');
      const ownerScope = await ownerScopeFor(owner);
      const scope = readComputeBillingScope(deps.env);
      const plan = scope ? await readComputeOffer(deps.env, scope) : null;
      const provider =
        scope &&
        (deps.provider ?? computeStripeProvider)(deps.env, scope, origin);
      let row = scope ? await contractFor(deps.db, ownerScope, scope) : null;
      const view = () =>
        json({
          ownerScope,
          configured: !!plan,
          testMode: scope?.mode !== 'live',
          plan: plan && {
            amountMinor: plan.amountMinor,
            currency: plan.currency,
            merchant: plan.merchant,
            monthlyJobs: plan.monthlyJobs,
            termsVersion: plan.termsVersion,
          },
          contract:
            row && !row.closed
              ? {
                  amountMinor: row.amount_minor,
                  currency: row.currency,
                  merchant: row.merchant,
                  monthlyJobs: row.monthly_jobs,
                  termsVersion: row.terms_version,
                }
              : null,
          subscription: planView(row, now),
        });
      if (request.method === 'GET') {
        // Webhooks normally update the ledger. A bounded read-through also repairs missed
        // renewals/cancellations and resolves the return from an open Checkout session.
        if (
          row &&
          !row.closed &&
          provider &&
          row.session_id &&
          row.checked_at + (row.status === 'pending' ? 5000 : 60_000) <= now
        ) {
          row = await syncContract(deps.db, provider, row.attempt, now);
        }
        return view();
      }
      if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope)
        return json(
          { error: 'アカウントが変わりました。画面を読み直してください。' },
          409,
        );
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        return json({ error: 'JSON形式で送信してください。' }, 415);
      const data = JSON.parse(
        new TextDecoder().decode(await boundedNoahBody(request, 2048)),
      );
      if (!data || typeof data !== 'object' || !scope || !provider)
        return json({ error: '現在、月額契約を受け付けていません。' }, 409);
      if (data.action === 'checkout') {
        const pending =
          row?.status === 'pending' && !row.closed ? row : undefined;
        const offered = pending
          ? {
              priceId: pending.price_id,
              termsVersion: pending.terms_version,
              merchant: pending.merchant,
              currency: pending.currency,
              amountMinor: pending.amount_minor,
              monthlyJobs: pending.monthly_jobs,
            }
          : plan;
        if (!plan || !offered || offered.termsVersion !== data.termsVersion)
          return json(
            { error: '現在の月額契約の条件を確認してください。' },
            409,
          );
        return json({
          url: await beginCheckout(
            deps.db,
            provider,
            ownerScope,
            scope,
            offered,
            now,
            pending,
          ),
        });
      }
      if (
        data.action === 'cancel' &&
        row &&
        !row.closed &&
        row.subscription_id
      ) {
        await provider.cancel(row);
        row = await syncContract(deps.db, provider, row.attempt, now);
        return view();
      }
      return json({ error: '契約状況と操作をご確認ください。' }, 409);
    } catch (err) {
      return failure(err);
    }
  };
}

type BillingEvent = {
  livemode?: boolean;
  account?: string;
  type: string;
  data: {
    object: {
      id: string;
      client_reference_id?: string;
      metadata?: { purpose?: string };
      parent?: { subscription_details?: { subscription?: string } };
      charge?: string;
    };
  };
};
export function createComputeWebhook(deps: Omit<Dependencies, 'authenticate'>) {
  return async (request: Request) => {
    try {
      const scope = readComputeBillingScope(deps.env);
      if (!scope) return json({ error: '月額契約の照合は停止中です。' }, 503);
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(
        await boundedNoahBody(request, 256 * 1024),
      );
      const secret = String(deps.env[scopePrefix(scope) + 'WEBHOOK_SECRET']);
      try {
        await verifyStripeSignature(
          raw,
          request.headers.get('stripe-signature'),
          secret,
        );
      } catch {
        return json({ error: '署名を確認できません。' }, 400);
      }
      const event: BillingEvent = JSON.parse(raw);
      if (
        event.livemode !== (scope.mode === 'live') ||
        (event.account && event.account !== scope.accountId)
      )
        return json({ error: '決済環境が一致しません。' }, 400);
      const obj = event.data.object;
      let row: ComputeContract | null = null;
      if (
        [
          'checkout.session.completed',
          'checkout.session.async_payment_succeeded',
          'checkout.session.async_payment_failed',
          'checkout.session.expired',
        ].includes(event.type)
      ) {
        if (
          obj.metadata?.purpose !== 'noah_shared_compute' ||
          !obj.client_reference_id
        )
          return json({ received: true });
        row = await deps.db
          .prepare(
            'SELECT * FROM noah_compute_subscriptions WHERE attempt=? AND mode=? AND stripe_account=?',
          )
          .bind(obj.client_reference_id, scope.mode, scope.accountId)
          .first<ComputeContract>();
        if (row && !row.closed && !row.session_id)
          await deps.db
            .prepare(
              'UPDATE noah_compute_subscriptions SET session_id=?,revision=revision+1 WHERE attempt=? AND session_id IS NULL',
            )
            .bind(obj.id, row.attempt)
            .run();
        if (row?.session_id && row.session_id !== obj.id)
          throw new PlanError('申込が一致しません。', 409);
      } else {
        let id: string | undefined;
        let column = 'subscription_id';
        if (event.type.startsWith('customer.subscription.')) id = obj.id;
        else if (
          [
            'invoice.paid',
            'invoice.payment_failed',
            'invoice.voided',
            'invoice.marked_uncollectible',
          ].includes(event.type)
        )
          id = obj.parent?.subscription_details?.subscription;
        else if (
          [
            'charge.refunded',
            'charge.dispute.created',
            'charge.dispute.closed',
            'radar.early_fraud_warning.created',
            'radar.early_fraud_warning.updated',
          ].includes(event.type)
        ) {
          column = 'charge_id';
          id = event.type === 'charge.refunded' ? obj.id : obj.charge;
        }
        if (typeof id === 'string')
          row = await deps.db
            .prepare(
              'SELECT * FROM noah_compute_subscriptions WHERE ' +
                column +
                '=? AND mode=? AND stripe_account=?',
            )
            .bind(id, scope.mode, scope.accountId)
            .first<ComputeContract>();
      }
      if (row && !row.closed)
        await syncContract(
          deps.db,
          (deps.provider ?? computeStripeProvider)(
            deps.env,
            scope,
            new URL(request.url).origin,
          ),
          row.attempt,
          (deps.now ?? Date.now)(),
        );
      return json({ received: true });
    } catch (err) {
      return failure(err);
    }
  };
}
