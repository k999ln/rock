import {
  a2aDelegationStore,
  A2ADelegationStoreError,
} from '@/lib/a2a-delegation-store';
import {
  verifyA2ABrokerAuthorization,
  type A2ABrokerAuthorization,
} from '@/lib/a2a-broker-authorization';
import { createA2AIntentDigests } from '@/lib/a2a-authorization';
import { a2aBrokerDeviceKeyResolver } from '@/lib/a2a-broker-trust';
import { database } from '@/lib/fund-store';
import { requestRockstarUser } from '@/lib/rockstar-device-link';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
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
    const status = error.code.includes('conflict') ? 409 : 400;
    return json({ error: error.message, code: error.code }, status);
  }
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインが必要です。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'このサイトから操作してください。' }, 403);
  if (error instanceof Error && error.message === 'BODY_TOO_LARGE')
    return json({ error: 'Broker証明のサイズ上限を超えています。' }, 413);
  if (error instanceof SyntaxError || (error instanceof Error && error.message === 'INVALID_BODY'))
    return json({ error: '入力形式を確認してください。' }, 400);
  return json({ error: 'Broker証明を検証できませんでした。' }, 503);
}

export async function POST(request: Request, context: Context) {
  try {
    const owner = await requestRockstarUser(request, database());
    const db = database();
    if (!(await rockstarServiceScopeAllowed(
      db,
      owner,
      'agents',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
      env, request,
    ))) return missingRockstarServiceScope('Agent');
    const { id } = await context.params;
    if (!uuid.test(id)) return json({ error: '委任IDが不正です。' }, 400);
    const input = await readBody(request);
    if (
      Object.keys(input).length !== 2 ||
      !('proof' in input) ||
      typeof input.message !== 'string' ||
      !input.message.trim() ||
      input.message.length > 8_000
    )
      return json({ error: '入力形式を確認してください。' }, 400);

    const configuration = (env as unknown as {
      A2A_TRUSTED_BROKER_KEYS?: string;
    });
    const store = a2aDelegationStore(db);
    const delegation = await store.get(owner, id);
    if (!delegation) return json({ error: '委任が見つかりません。' }, 404);
    if (delegation.state !== 'awaiting_approval')
      return json({ error: '承認前の委任だけにBroker証明を登録できます。' }, 409);
    const intent = {
      id: delegation.id,
      ownerUserId: owner,
      deviceRef: (input.proof as { deviceRef?: unknown } | null)?.deviceRef as string,
      parentJobId: delegation.parentJobId,
      idempotencyKey: delegation.idempotencyKey,
      messageId: delegation.messageId,
      targetOrigin: delegation.targetOrigin,
      targetAgentName: delegation.targetAgentName,
      targetAgentVersion: delegation.targetAgentVersion,
      protocolVersion: delegation.protocolVersion,
      inputSha256: delegation.inputSha256,
      authorizationSha256: delegation.authorizationSha256,
      budgetCurrency: delegation.budgetCurrency,
      budgetLimitMinor: delegation.budgetLimitMinor,
      parentBudgetLimitMinor: delegation.parentBudgetLimitMinor,
      continueWhileDeviceOffline: delegation.continueWhileDeviceOffline,
      deadlineAt: delegation.deadlineAt,
      message: input.message,
      priceQuoteDigest: delegation.priceQuoteDigest || undefined,
      packageRuntimeBindingDigest: delegation.packageRuntimeBindingDigest || undefined,
    };
    const digests = await createA2AIntentDigests(intent);
    if (
      digests.inputSha256 !== delegation.inputSha256 ||
      digests.authorizationSha256 !== delegation.authorizationSha256
    )
      return json({ error: '依頼本文または条件が委任draftと一致しません。' }, 409);
    const valid = await verifyA2ABrokerAuthorization(
      input.proof,
      intent,
      a2aBrokerDeviceKeyResolver(db, configuration.A2A_TRUSTED_BROKER_KEYS),
    );
    if (!valid)
      return json({ error: '署名、鍵の信頼、本人、端末または承認条件が一致しません。', code: 'BROKER_PROOF_INVALID' }, 403);

    const proof = input.proof as A2ABrokerAuthorization;
    await store.saveBrokerAuthorization(owner, id, {
      proofJson: JSON.stringify(proof),
      deviceRef: proof.deviceRef,
      authorityId: proof.authorityId,
      keyId: proof.keyId,
      expiresAt: proof.expiresAt,
    });
    return json({ accepted: true, deviceRef: proof.deviceRef, expiresAt: proof.expiresAt });
  } catch (error) {
    return errorResponse(error);
  }
}
