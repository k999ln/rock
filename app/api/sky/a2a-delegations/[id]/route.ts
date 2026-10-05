import {
  a2aDelegationStore,
  A2ADelegationStoreError,
} from '@/lib/a2a-delegation-store';
import { database } from '@/lib/fund-store';
import { requestRockstarUser } from '@/lib/rockstar-device-link';
import {
  a2aDelegationExecutionEnabled,
  createA2AIntentDigests,
} from '@/lib/a2a-authorization';
import { encryptA2AInput } from '@/lib/a2a-input-crypto';
import { verifyA2ABrokerAuthorization } from '@/lib/a2a-broker-authorization';
import { a2aBrokerDeviceKeyResolver } from '@/lib/a2a-broker-trust';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { a2aPriceQuoteDigest, verifyA2APriceQuote } from '@/lib/a2a-price-quote';
import { trustedA2AUsageKeyResolver } from '@/lib/a2a-usage-receipt';
import { env } from 'cloudflare:workers';

type Context = { params: Promise<{ id: string }> };
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID_BODY');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 12_000) {
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
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_BODY');
  return value as Record<string, unknown>;
}

function errorResponse(error: unknown) {
  if (error instanceof A2ADelegationStoreError) {
    const status =
      error.code.includes('conflict') || error.code.includes('mismatch')
        ? 409
        : 400;
    return json({ error: error.message, code: error.code }, status);
  }
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインが必要です。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'このサイトから操作してください。' }, 403);
  if (error instanceof Error && error.message === 'A2A_INPUT_KEY_UNAVAILABLE')
    return json({ error: '委任本文を暗号化する鍵が設定されていません。' }, 503);
  if (error instanceof Error && error.message === 'BODY_TOO_LARGE')
    return json({ error: '入力は8 KB以下にしてください。' }, 413);
  if (
    error instanceof SyntaxError ||
    (error instanceof Error && error.message === 'INVALID_BODY')
  )
    return json({ error: '入力形式を確認してください。' }, 400);
  return json({ error: '委任状態を取得または更新できませんでした。' }, 503);
}

export async function GET(request: Request, context: Context) {
  try {
    const owner = await requestRockstarUser(request, database());
    const { id } = await context.params;
    if (!uuid.test(id)) return json({ error: '委任IDが不正です。' }, 400);
    const store = a2aDelegationStore(database());
    const delegation = await store.get(owner, id);
    if (!delegation) return json({ error: '委任が見つかりません。' }, 404);
    const usage = await store.getUsageReceipt(owner, id);
    const liveUsage = await store.getLatestLiveUsageSnapshot(owner, id);
    const brokerAuthorization = await store.getBrokerAuthorization(owner, id);
    let usageDetails: unknown = null;
    let liveUsageDetails: unknown = null;
    try { usageDetails = usage ? JSON.parse(usage.receiptJson) : null; } catch { usageDetails = null; }
    try { liveUsageDetails = liveUsage ? JSON.parse(liveUsage.snapshotJson) : null; } catch { liveUsageDetails = null; }
    return json({
      delegation,
      events: await store.listEvents(owner, id),
      budgetReservation: await store.getBudgetReservation(owner, id),
      brokerAuthorization: brokerAuthorization ? {
        registered: true,
        deviceRef: brokerAuthorization.deviceRef,
        authorityId: brokerAuthorization.authorityId,
        keyId: brokerAuthorization.keyId,
        expiresAt: brokerAuthorization.expiresAt,
      } : { registered: false },
      usageReceipt: usage ? {
        providerId: usage.providerId,
        providerReference: usage.providerReference,
        currency: usage.currency,
        amountMinor: usage.amountMinor,
        issuedAt: usage.issuedAt,
        receipt: usageDetails,
      } : null,
      liveUsageSnapshot: liveUsage ? {
        providerId: liveUsage.providerId,
        sequence: liveUsage.sequence,
        currency: liveUsage.currency,
        cumulativeAmountMinor: liveUsage.cumulativeAmountMinor,
        pricingVersion: liveUsage.pricingVersion,
        issuedAt: liveUsage.issuedAt,
        receivedAt: liveUsage.receivedAt,
        snapshot: liveUsageDetails,
      } : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const owner = await requestRockstarUser(request, database());
    const { id } = await context.params;
    if (!uuid.test(id)) return json({ error: '委任IDが不正です。' }, 400);
    const input = await readBody(request);
    if (Object.keys(input).some((key) => !['action', 'authorizationSha256', 'message'].includes(key)))
      return json({ error: '入力形式を確認してください。' }, 400);
    const store = a2aDelegationStore(database());
    let delegation;
    if (
      input.action === 'approve' &&
      typeof input.authorizationSha256 === 'string' &&
      typeof input.message === 'string' &&
      input.message.trim().length > 0 &&
      input.message.length <= 8_000
    ) {
      if (!(await rockstarServiceScopeAllowed(
        database(),
        owner,
        'agents',
        (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
      ))) return missingRockstarServiceScope('Agent');
      const executionEnabled = a2aDelegationExecutionEnabled(
        (env as unknown as { A2A_DELEGATION_EXECUTION_ENABLED?: string })
          .A2A_DELEGATION_EXECUTION_ENABLED,
      );
      if (!executionEnabled)
        return json(
          {
            error: 'Agent実行はBroker権限照合・Wallet予算予約の接続後に有効化されます。',
            code: 'DELEGATION_EXECUTION_GATED',
          },
          503,
        );
      const current = await store.get(owner, id);
      if (!current) return json({ error: '委任が見つかりません。' }, 404);
      const digests = await createA2AIntentDigests({
        ownerUserId: owner,
        id: current.id,
        parentJobId: current.parentJobId,
        messageId: current.messageId,
        targetOrigin: current.targetOrigin,
        targetAgentName: current.targetAgentName,
        targetAgentVersion: current.targetAgentVersion,
        protocolVersion: current.protocolVersion,
        budgetCurrency: current.budgetCurrency,
        budgetLimitMinor: current.budgetLimitMinor,
        parentBudgetLimitMinor: current.parentBudgetLimitMinor,
        continueWhileDeviceOffline: current.continueWhileDeviceOffline,
        deadlineAt: current.deadlineAt,
        message: input.message,
        priceQuoteDigest: current.priceQuoteDigest || undefined,
        packageRuntimeBindingDigest: current.packageRuntimeBindingDigest || undefined,
      });
      if (
        digests.inputSha256 !== current.inputSha256 ||
        digests.authorizationSha256 !== current.authorizationSha256 ||
        input.authorizationSha256 !== current.authorizationSha256
      )
        return json({ error: '表示した依頼本文や条件が変わっています。内容を再確認してください。' }, 409);
      if (((env as unknown as { A2A_PRICE_QUOTES_REQUIRED?: string }).A2A_PRICE_QUOTES_REQUIRED === 'true' ||
        a2aDelegationExecutionEnabled((env as unknown as { A2A_DELEGATION_EXECUTION_ENABLED?: string }).A2A_DELEGATION_EXECUTION_ENABLED)) &&
        !current.priceQuoteDigest)
        return json({ error: '有料Agent実行にはProvider署名済みの価格見積が必要です。', code: 'PRICE_QUOTE_REQUIRED' }, 403);
      if (current.priceQuoteDigest) {
        const usageKeys = (env as unknown as { A2A_TRUSTED_USAGE_KEYS?: string }).A2A_TRUSTED_USAGE_KEYS;
        if (!current.priceQuote || !usageKeys ||
          await a2aPriceQuoteDigest(current.priceQuote) !== current.priceQuoteDigest ||
          !(await verifyA2APriceQuote(current.priceQuote, {
            agentOrigin: current.targetOrigin,
            agentName: current.targetAgentName,
            agentVersion: current.targetAgentVersion,
            requestSha256: current.inputSha256,
            currency: current.budgetCurrency,
            maximumBudgetMinor: current.budgetLimitMinor,
          }, trustedA2AUsageKeyResolver(usageKeys))))
          return json({ error: 'Provider見積が変更または期限切れです。最新の見積を確認してください。', code: 'PRICE_QUOTE_INVALID' }, 409);
      }
      const configuration = env as unknown as {
        A2A_INPUT_ENCRYPTION_KEY?: string;
        A2A_TRUSTED_BROKER_KEYS?: string;
      };
      const brokerAuthorization = await store.getBrokerAuthorization(owner, id);
      if (!brokerAuthorization)
        return json({ error: 'RockstarOS Brokerでこの依頼を承認してください。', code: 'BROKER_AUTHORIZATION_REQUIRED' }, 403);
      const nativeApprovalValid = await verifyA2ABrokerAuthorization(
        JSON.parse(brokerAuthorization.proofJson) as unknown,
        {
          id: current.id,
          ownerUserId: owner,
          deviceRef: brokerAuthorization.deviceRef,
          parentJobId: current.parentJobId,
          messageId: current.messageId,
          targetOrigin: current.targetOrigin,
          targetAgentName: current.targetAgentName,
          targetAgentVersion: current.targetAgentVersion,
          protocolVersion: current.protocolVersion,
          budgetCurrency: current.budgetCurrency,
          budgetLimitMinor: current.budgetLimitMinor,
          parentBudgetLimitMinor: current.parentBudgetLimitMinor,
          continueWhileDeviceOffline: current.continueWhileDeviceOffline,
          deadlineAt: current.deadlineAt,
          priceQuoteDigest: current.priceQuoteDigest || undefined,
          packageRuntimeBindingDigest: current.packageRuntimeBindingDigest || undefined,
          message: input.message,
        },
        a2aBrokerDeviceKeyResolver(database(), configuration.A2A_TRUSTED_BROKER_KEYS),
      );
      if (!nativeApprovalValid)
        return json({ error: 'Broker証明が期限切れか、鍵または委任条件が無効です。', code: 'BROKER_AUTHORIZATION_INVALID' }, 403);
      const key = configuration.A2A_INPUT_ENCRYPTION_KEY;
      if (!key) throw new Error('A2A_INPUT_KEY_UNAVAILABLE');
      const encrypted = await encryptA2AInput(
        input.message,
        key,
        owner,
        id,
        digests.inputSha256,
      );
      delegation = await store.approve(owner, id, input.authorizationSha256, encrypted);
    } else if (
      input.action === 'cancel' &&
      input.authorizationSha256 === undefined &&
      input.message === undefined
    ) {
      delegation = await store.requestCancel(owner, id);
    } else {
      return json({ error: '承認または取消の操作を指定してください。' }, 400);
    }
    if (!delegation) return json({ error: '委任が見つかりません。' }, 404);
    return json({ delegation });
  } catch (error) {
    return errorResponse(error);
  }
}
