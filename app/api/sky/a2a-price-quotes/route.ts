import { env } from 'cloudflare:workers';
import { a2aAgentDirectory } from '@/lib/a2a-agent-directory';
import { A2APriceQuoteAcquisitionError, acquireA2APriceQuote, type A2APriceQuoteAcquisitionInput } from '@/lib/a2a-price-quote-acquisition';
import { A2APriceQuoteConsentStoreError, recordA2APriceQuoteConsent } from '@/lib/a2a-price-quote-consent-store';
import { authorizeRemoteAiRequest, RemoteAiGuardError } from '@/lib/remote-ai-guard';
import { database } from '@/lib/fund-store';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { skyPackageSchemaSha256 } from '@/lib/sky-package-runtime';
import { skyToolPackageStore } from '@/lib/sky-tool-package-store';
import { SkyPackageRuntimeBindingStore } from '@/lib/sky-package-runtime-binding-store';

const json = (value: unknown, status = 200) => Response.json(value, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const runtime = env as unknown as {
    A2A_EGRESS_ALLOWED_ORIGINS?: string;
    A2A_PRICE_QUOTE_EXTENSION_URI?: string;
    A2A_TRUSTED_USAGE_KEYS?: string;
    SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS?: string;
    SKY_PACKAGE_RUNTIME_EXTENSION_URI?: string;
    ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string;
  };
  try {
    const db = database();
    const owner = await authorizeRemoteAiRequest(request, 'sky-a2a-price-quote', db);
    if (!(await rockstarServiceScopeAllowed(
      db, owner, 'agents', runtime.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
    ))) return missingRockstarServiceScope('Agent');

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 10_000)
      return json({ code: 'BODY_TOO_LARGE' }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return json({ code: 'INVALID_INPUT' }, 400);
    const input = parsed as Record<string, unknown>;
    const allowed = new Set([
      'agentId', 'quoteRequestId', 'message', 'currency', 'maximumBudgetMinor',
      'expiresAt', 'consentToSharePromptForQuote',
      'packageKey', 'manifestSha256',
    ]);
    if (Object.keys(input).some((key) => !allowed.has(key)) ||
      typeof input.agentId !== 'string' || !uuid.test(input.agentId) ||
      typeof input.quoteRequestId !== 'string' || !uuid.test(input.quoteRequestId) ||
      typeof input.message !== 'string' || !input.message.trim() ||
      new TextEncoder().encode(input.message).byteLength > 8_000 ||
      typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency) ||
      !Number.isSafeInteger(input.maximumBudgetMinor) || (input.maximumBudgetMinor as number) < 1 ||
      (input.maximumBudgetMinor as number) > 100_000_000 ||
      !Number.isSafeInteger(input.expiresAt) ||
      typeof input.consentToSharePromptForQuote !== 'boolean')
      return json({ code: 'INVALID_INPUT' }, 400);
    const hasPackageKey = typeof input.packageKey === 'string';
    const hasPackageHash = typeof input.manifestSha256 === 'string';
    if (hasPackageKey !== hasPackageHash ||
      (hasPackageKey && (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+@(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(input.packageKey as string) ||
        !/^[a-f0-9]{64}$/.test(input.manifestSha256 as string))))
      return json({ code: 'INVALID_PACKAGE_RUNTIME_TARGET' }, 400);
    if (input.consentToSharePromptForQuote !== true)
      return json({ code: 'QUOTE_CONSENT_REQUIRED' }, 400);

    const agent = (await a2aAgentDirectory(db).list(owner))
      .find((candidate) => candidate.id === input.agentId);
    if (!agent) return json({ code: 'AGENT_NOT_CONNECTED' }, 404);
    if (!runtime.A2A_PRICE_QUOTE_EXTENSION_URI || !runtime.A2A_TRUSTED_USAGE_KEYS)
      return json({ code: 'QUOTE_PROVIDER_NOT_CONFIGURED' }, 503);

    let packageRuntimeTarget: A2APriceQuoteAcquisitionInput['packageRuntimeTarget'];
    if (hasPackageKey && hasPackageHash) {
      const reviewed = await skyToolPackageStore(db).verifiedRegistryPackage(
        input.packageKey as string, input.manifestSha256 as string,
      );
      if (!reviewed) return json({ code: 'PACKAGE_NOT_CURRENTLY_REVIEWED' }, 409);
      packageRuntimeTarget = {
        packageKey: reviewed.packageKey,
        manifestSha256: reviewed.manifestSha256,
        runtimeExtensionUri: runtime.SKY_PACKAGE_RUNTIME_EXTENSION_URI ?? '',
        inputSchemaSha256: await skyPackageSchemaSha256(reviewed.manifest.io.inputSchema),
        outputSchemaSha256: await skyPackageSchemaSha256(reviewed.manifest.io.outputSchema),
      };
      if (!runtime.SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS || !runtime.SKY_PACKAGE_RUNTIME_EXTENSION_URI)
        return json({ code: 'PACKAGE_RUNTIME_BINDING_NOT_CONFIGURED' }, 503);
    }

    let consent;
    try {
      consent = await recordA2APriceQuoteConsent(db, {
        id: crypto.randomUUID(),
        ownerUserId: owner,
        quoteRequestId: input.quoteRequestId,
        agentConnectionId: agent.id,
        agentOrigin: agent.origin,
        agentName: agent.agentName,
        agentVersion: agent.agentVersion,
        agentCardSha256: agent.cardSha256,
        message: input.message,
        currency: input.currency,
        maximumBudgetMinor: input.maximumBudgetMinor as number,
        expiresAt: input.expiresAt as number,
      });
    } catch (error) {
      if (error instanceof A2APriceQuoteConsentStoreError) {
        const conflict = error.code === 'QUOTE_REQUEST_ID_CONFLICT';
        return json({
          code: error.code,
          error: conflict
            ? 'この見積要求IDは別の条件で使用済みです。新しいIDと改めての同意が必要です。'
            : '同意記録を保存できません。依頼文は送信していません。',
        }, conflict ? 409 : 503);
      }
      throw error;
    }
    if (!consent.recorded)
      return json({
        code: 'QUOTE_REQUEST_ALREADY_RECORDED',
        quoteRequestId: input.quoteRequestId,
        error: 'この見積要求IDは既に使用されています。同じ要求をProviderへ再送しません。Provider側の状態を確認してください。',
      }, 409);

    const quote = await acquireA2APriceQuote({
      agent,
      quoteRequestId: input.quoteRequestId,
      message: input.message,
      currency: input.currency,
      maximumBudgetMinor: input.maximumBudgetMinor as number,
      expiresAt: input.expiresAt as number,
      consentToSharePromptForQuote: true,
      extensionUri: runtime.A2A_PRICE_QUOTE_EXTENSION_URI,
      allowedOrigins: runtime.A2A_EGRESS_ALLOWED_ORIGINS,
      trustedUsageKeys: runtime.A2A_TRUSTED_USAGE_KEYS,
      packageRuntimeTarget,
      trustedPackageRuntimeBindingKeys: runtime.SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS,
    });
    let packageRuntimeBindingRecord: { packageRuntimeBindingId: string; packageRuntimeBindingDigest: string } | undefined;
    if (quote.packageRuntimeBinding) {
      const saved = await new SkyPackageRuntimeBindingStore(db).register(quote.packageRuntimeBinding, owner);
      packageRuntimeBindingRecord = {
        packageRuntimeBindingId: quote.packageRuntimeBinding.bindingId,
        packageRuntimeBindingDigest: saved.digest,
      };
    }
    return json({ ...quote, ...packageRuntimeBindingRecord, quoteOnly: true, executionAuthorized: false });
  } catch (error) {
    if (error instanceof RemoteAiGuardError)
      return json({ code: error.code }, error.status);
    if (error instanceof A2APriceQuoteAcquisitionError) {
      const messages: Record<string, string> = {
        QUOTE_RESPONSE_INDETERMINATE: 'Providerの見積応答を確認できません。要求は自動再送していません。Provider側で同じ要求IDを照合できるまで、新しい要求を送らないでください。',
        PROVIDER_QUOTE_UNTRUSTED: 'Providerの見積署名、依頼内容、上限または有効期限を確認できません。',
        NO_TRUSTED_PROVIDER_KEY: 'このAgent originに対するProvider署名鍵が登録されていません。依頼文は送信していません。',
        QUOTE_EXTENSION_UNAVAILABLE: 'このAgentの見積拡張は現在利用できません。',
        AGENT_CARD_CHANGED: 'Agent Cardが更新されています。候補を再取得して条件を確認してください。',
        AGENT_CARD_INVALID: '保存済みAgent Cardを検証できません。候補を再取得してください。',
        QUOTE_CONSENT_REQUIRED: '依頼文をProviderへ送信する個別同意が必要です。',
        PACKAGE_RUNTIME_BINDING_UNTRUSTED: 'ProviderのPackage runtime binding、Package版、Schema、料金版または利用メーターを確認できません。',
      };
      return json({
        code: error.code,
        error: messages[error.code] ?? 'Provider見積を取得できませんでした。',
        ...(error.quoteRequestId ? { quoteRequestId: error.quoteRequestId } : {}),
      }, error.status);
    }
    if (error instanceof SyntaxError) return json({ code: 'INVALID_INPUT' }, 400);
    console.error('A2A quote request failed', error instanceof Error ? error.message : 'unknown');
    return json({ code: 'QUOTE_PROVIDER_UNAVAILABLE' }, 503);
  }
}
