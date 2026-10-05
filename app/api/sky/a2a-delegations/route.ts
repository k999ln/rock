import { env } from 'cloudflare:workers';
import {
  a2aDelegationStore,
  A2A_MAX_REDELEGATION_DEPTH,
  A2ADelegationStoreError,
} from '@/lib/a2a-delegation-store';
import { buildA2AParentControllerSnapshot } from '@/lib/a2a-parent-controller';
import { createA2AIntentDigests } from '@/lib/a2a-authorization';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { a2aPriceQuoteDigest, verifyA2APriceQuote, type A2APriceQuote } from '@/lib/a2a-price-quote';
import { trustedA2AUsageKeyResolver } from '@/lib/a2a-usage-receipt';
import { database } from '@/lib/fund-store';
import { requestRockstarUser } from '@/lib/rockstar-device-link';
import { a2aAgentDirectory } from '@/lib/a2a-agent-directory';
import { skyPackageSchemaSha256 } from '@/lib/sky-package-runtime';
import { skyToolPackageStore } from '@/lib/sky-tool-package-store';
import {
  packageRuntimeQuoteRequirementsMatch,
  skyPackageRuntimeBindingDigest,
  trustedSkyPackageRuntimeBindingKeyResolver,
  verifySkyPackageRuntimeBinding,
} from '@/lib/sky-package-runtime-binding';
import {
  parseStoredSkyPackageRuntimeBinding,
  SkyPackageRuntimeBindingStore,
} from '@/lib/sky-package-runtime-binding-store';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function body(request: Request) {
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
      error.code.includes('limit')
        ? 429
        : error.code.includes('conflict') ||
      error.code.includes('depth') ||
      error.code.includes('mismatch') ||
      error.code.includes('budget_exceeded') ||
      error.code.includes('reservation_failed')
        ? 409
        : 400;
    return json({ error: error.message, code: error.code }, status);
  }
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインが必要です。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'このサイトから操作してください。' }, 403);
  if (error instanceof Error && error.message === 'BODY_TOO_LARGE')
    return json({ error: '依頼は8 KB以下にしてください。' }, 413);
  if (
    error instanceof SyntaxError ||
    (error instanceof Error &&
      (error.message.startsWith('INVALID_') ||
        error.message === 'INVALID_TARGET'))
  )
    return json({ error: '入力形式を確認してください。' }, 400);
  return json({ error: 'エージェント委任を保存できませんでした。' }, 503);
}

export async function GET(request: Request) {
  try {
    const owner = await requestRockstarUser(request, database());
    const query = new URL(request.url).searchParams;
    const parentJobId = query.get('parentJobId') ?? '';
    if (!uuid.test(parentJobId))
      return json({ error: '親job IDが不正です。' }, 400);
    const store = a2aDelegationStore(database());
    const idempotencyKey = query.get('idempotencyKey');
    if (idempotencyKey !== null) {
      const inputSha256 = query.get('inputSha256') ?? '';
      if (!/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey) ||
        !/^[a-f0-9]{64}$/i.test(inputSha256))
        return json({ error: '照合キーまたは入力hashが不正です。' }, 400);
      return json({
        delegation: await store.getByIdempotency(
          owner,
          parentJobId,
          idempotencyKey,
          inputSha256,
        ),
      });
    }
    const delegations = await store.listForParent(owner, parentJobId);
    const [budget, reservations] = await Promise.all([
      store.getBudget(owner, parentJobId),
      store.listBudgetReservations(owner, parentJobId),
    ]);
    const controller = buildA2AParentControllerSnapshot({
      ownerUserId: owner,
      parentJobId,
      delegations,
      budget,
      reservations,
    });
    const liveUsage = await Promise.all(delegations.map((delegation) => store.getLatestLiveUsageSnapshot(owner, delegation.id)));
    return json({
      delegations: delegations.map((delegation, index) => {
        const snapshot = liveUsage[index];
        let liveUsageSnapshot: unknown = null;
        try { liveUsageSnapshot = snapshot ? JSON.parse(snapshot.snapshotJson) : null; } catch { liveUsageSnapshot = null; }
        return { ...delegation, liveUsageSnapshot: snapshot ? {
          sequence: snapshot.sequence,
          providerId: snapshot.providerId,
          currency: snapshot.currency,
          cumulativeAmountMinor: snapshot.cumulativeAmountMinor,
          pricingVersion: snapshot.pricingVersion,
          issuedAt: snapshot.issuedAt,
          receivedAt: snapshot.receivedAt,
          snapshot: liveUsageSnapshot,
        } : null };
      }),
      controller,
      budget,
      reservations,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requestRockstarUser(request, database());
    const db = database();
    if (!(await rockstarServiceScopeAllowed(
      db,
      owner,
      'agents',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
    ))) return missingRockstarServiceScope('Agent');
    const input = await body(request);
    const allowed = new Set([
      'id',
      'parentJobId',
      'predecessorDelegationId',
      'idempotencyKey',
      'messageId',
      'targetOrigin',
      'targetAgentName',
      'targetAgentVersion',
      'message',
      'budgetCurrency',
      'budgetLimitMinor',
      'parentBudgetLimitMinor',
      'continueWhileDeviceOffline',
      'deadlineAt',
      'priceQuote',
      'packageRuntimeBindingId',
      'packageRuntimeBindingDigest',
    ]);
    if (Object.keys(input).some((key) => !allowed.has(key)))
      throw new Error('INVALID_FIELDS');
    const {
      id,
      parentJobId,
      predecessorDelegationId,
      idempotencyKey,
      messageId,
      targetOrigin,
      targetAgentName,
      targetAgentVersion,
      message,
      budgetCurrency,
      budgetLimitMinor,
      parentBudgetLimitMinor,
      continueWhileDeviceOffline,
      deadlineAt,
      priceQuote,
      packageRuntimeBindingId,
      packageRuntimeBindingDigest,
    } = input;
    if (
      typeof id !== 'string' ||
      !uuid.test(id) ||
      typeof parentJobId !== 'string' ||
      !uuid.test(parentJobId) ||
      typeof messageId !== 'string' ||
      !uuid.test(messageId) ||
      typeof idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey) ||
      typeof message !== 'string' ||
      !message.trim() ||
      message.length > 8_000 ||
      typeof targetOrigin !== 'string' ||
      typeof targetAgentName !== 'string' ||
      typeof targetAgentVersion !== 'string' ||
      typeof budgetCurrency !== 'string' ||
      typeof budgetLimitMinor !== 'number' ||
      typeof parentBudgetLimitMinor !== 'number' ||
      continueWhileDeviceOffline !== true ||
      typeof deadlineAt !== 'number'
    )
      throw new Error('INVALID_FIELDS');
    if (predecessorDelegationId !== undefined && predecessorDelegationId !== null &&
      (typeof predecessorDelegationId !== 'string' || !uuid.test(predecessorDelegationId)))
      throw new Error('INVALID_FIELDS');
    let origin: URL;
    try {
      origin = new URL(targetOrigin);
    } catch {
      throw new Error('INVALID_TARGET');
    }
    if (
      origin.protocol !== 'https:' ||
      origin.origin !== targetOrigin ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    )
      throw new Error('INVALID_TARGET');

    const intent = {
      id,
      parentJobId,
      idempotencyKey,
      messageId,
      targetOrigin,
      targetAgentName,
      targetAgentVersion,
      protocolVersion: '1.0' as const,
      budgetCurrency,
      budgetLimitMinor,
      parentBudgetLimitMinor,
      continueWhileDeviceOffline,
      deadlineAt,
    };
    const quoteRequired = (env as unknown as { A2A_PRICE_QUOTES_REQUIRED?: string }).A2A_PRICE_QUOTES_REQUIRED === 'true';
    const bindingId = typeof packageRuntimeBindingId === 'string' ? packageRuntimeBindingId : '';
    const bindingDigest = typeof packageRuntimeBindingDigest === 'string' ? packageRuntimeBindingDigest : '';
    if ((bindingId === '') !== (bindingDigest === '') ||
      (bindingId && (!/^[A-Za-z0-9._:-]{1,128}$/.test(bindingId) || !/^[a-f0-9]{64}$/.test(bindingDigest))))
      return json({ error: 'Package runtime bindingの参照が不正です。', code: 'PACKAGE_RUNTIME_BINDING_INVALID' }, 400);
    if (!priceQuote && quoteRequired)
      return json({ error: '有料Agent実行にはProvider署名済みの価格見積が必要です。', code: 'PRICE_QUOTE_REQUIRED' }, 403);
    let priceQuoteDigest = '';
    if (message.includes('【RockstarOSで選択したSky Package】') && !bindingId)
      return json({ error: '選択したPackageにはProvider署名済みbinding付き見積が必要です。', code: 'PACKAGE_RUNTIME_BINDING_REQUIRED' }, 403);
    let verifiedPackageBinding: Awaited<ReturnType<typeof verifySkyPackageRuntimeBinding>> = null;
    if (bindingId) {
      if (!priceQuote)
        return json({ error: 'Package実行bindingには署名済み見積が必要です。', code: 'PACKAGE_RUNTIME_QUOTE_REQUIRED' }, 403);
      const dbBinding = await new SkyPackageRuntimeBindingStore(db).get(bindingId);
      const storedBinding = dbBinding ? parseStoredSkyPackageRuntimeBinding(dbBinding) : null;
      const currentAgent = (await a2aAgentDirectory(db).list(owner)).find((candidate) =>
        candidate.origin === targetOrigin && candidate.agentName === targetAgentName && candidate.agentVersion === targetAgentVersion);
      const currentPackage = storedBinding
        ? await skyToolPackageStore(db).verifiedRegistryPackage(storedBinding.packageKey, storedBinding.manifestSha256)
        : null;
      if (!dbBinding || dbBinding.status !== 'active' || dbBinding.digest !== bindingDigest ||
        !storedBinding || !currentAgent || !currentPackage)
        return json({ error: 'Package実行bindingは有効でないか、選択中のAgent/Packageと一致しません。', code: 'PACKAGE_RUNTIME_BINDING_UNAVAILABLE' }, 403);
      const [inputSchemaSha256, outputSchemaSha256] = await Promise.all([
        skyPackageSchemaSha256(currentPackage.manifest.io.inputSchema),
        skyPackageSchemaSha256(currentPackage.manifest.io.outputSchema),
      ]);
      const keyConfiguration = (env as unknown as { SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS?: string }).SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS;
      verifiedPackageBinding = await verifySkyPackageRuntimeBinding(storedBinding, {
        agentOrigin: currentAgent.origin,
        agentName: currentAgent.agentName,
        agentVersion: currentAgent.agentVersion,
        agentCardSha256: currentAgent.cardSha256,
        packageKey: currentPackage.packageKey,
        manifestSha256: currentPackage.manifestSha256,
        runtimeExtensionUri: (env as unknown as { SKY_PACKAGE_RUNTIME_EXTENSION_URI?: string }).SKY_PACKAGE_RUNTIME_EXTENSION_URI ?? '',
        inputSchemaSha256,
        outputSchemaSha256,
      }, trustedSkyPackageRuntimeBindingKeyResolver(keyConfiguration));
      const quote = priceQuote as A2APriceQuote;
      if (!verifiedPackageBinding || await skyPackageRuntimeBindingDigest(verifiedPackageBinding) !== bindingDigest ||
        verifiedPackageBinding.providerId !== quote.providerId ||
        !packageRuntimeQuoteRequirementsMatch(verifiedPackageBinding, quote) ||
        !message.includes(`Package key: ${verifiedPackageBinding.packageKey}`) ||
        !message.includes(`審査済みmanifest SHA-256: ${verifiedPackageBinding.manifestSha256}`))
        return json({ error: 'Provider署名、見積料金、Package版または依頼内容がbindingと一致しません。', code: 'PACKAGE_RUNTIME_BINDING_MISMATCH' }, 403);
    }
    const baseDigests = await createA2AIntentDigests({
      ...intent, ownerUserId: owner, message, packageRuntimeBindingDigest: bindingDigest || undefined,
    });
    if (priceQuote) {
      const quote = priceQuote as A2APriceQuote;
      const usageKeys = (env as unknown as { A2A_TRUSTED_USAGE_KEYS?: string }).A2A_TRUSTED_USAGE_KEYS;
      const validQuote = usageKeys && await verifyA2APriceQuote(quote, {
        agentOrigin: targetOrigin,
        agentName: targetAgentName,
        agentVersion: targetAgentVersion,
        requestSha256: baseDigests.inputSha256,
        currency: budgetCurrency,
        maximumBudgetMinor: budgetLimitMinor,
      }, trustedA2AUsageKeyResolver(usageKeys));
      if (!validQuote || quote.maxAmountMinor !== budgetLimitMinor)
        return json({ error: '価格見積の署名、条件、期限または最大額を確認できません。', code: 'PRICE_QUOTE_INVALID' }, 403);
      priceQuoteDigest = await a2aPriceQuoteDigest(quote);
    }
    const digests = priceQuoteDigest
      ? await createA2AIntentDigests({ ...intent, ownerUserId: owner, message, priceQuoteDigest,
        packageRuntimeBindingDigest: bindingDigest || undefined })
      : baseDigests;
    const store = a2aDelegationStore(db);
    if (predecessorDelegationId) {
      const predecessor = await store.get(owner, predecessorDelegationId as string);
      if (!predecessor || predecessor.parentJobId !== parentJobId ||
        predecessor.state !== 'remote_completed' || predecessor.artifactsCaptured !== 1)
        return json({ error: '前段Agentの完了済み成果をこのZema jobで確認できません。', code: 'A2A_PREDECESSOR_NOT_REVIEWABLE' }, 409);
      if (predecessor.predecessorDelegationId && A2A_MAX_REDELEGATION_DEPTH <= 1)
        return json({ error: `Agent間の再委任は${A2A_MAX_REDELEGATION_DEPTH}段階までです。新しい独立jobを作成してください。`, code: 'A2A_PREDECESSOR_DEPTH_EXCEEDED' }, 409);
    }
    const result = await store.prepare(owner, {
      ...intent,
      predecessorDelegationId: predecessorDelegationId ? predecessorDelegationId as string : null,
      ...digests,
      priceQuoteDigest,
      priceQuote: priceQuote ? priceQuote as A2APriceQuote : null,
      packageRuntimeBindingId: bindingId,
      packageRuntimeBindingDigest: bindingDigest,
    });
    if (!result.delegation)
      return json(
        { error: '親jobが見つからないか、委任期限を過ぎています。' },
        404,
      );
    const pool = await store.getBudget(owner, parentJobId);
    if (pool && (pool.currency !== budgetCurrency ||
      pool.budgetLimitMinor !== parentBudgetLimitMinor))
      return json({ error: 'この親jobには別の共通予算が固定されています。', code: 'PARENT_BUDGET_MISMATCH' }, 409);
    return json(
      {
        delegation: result.delegation,
        created: result.created,
        approval: {
          required: result.delegation.state === 'awaiting_approval',
          digest: result.delegation.authorizationSha256,
          priceEstimate: result.delegation.priceQuote ? {
            estimateMinor: result.delegation.priceQuote.estimateMinor,
            maximumMinor: result.delegation.priceQuote.maxAmountMinor,
            currency: result.delegation.priceQuote.currency,
            expiresAt: result.delegation.priceQuote.expiresAt,
            pricingVersion: result.delegation.priceQuote.pricingVersion,
            quoteDigest: result.delegation.priceQuoteDigest,
          } : null,
          note: 'このAPIは依頼条件を保存するだけで、外部agentへ送信しません。',
        },
      },
      result.created ? 201 : 200,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
