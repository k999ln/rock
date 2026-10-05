type Database = Pick<D1Database, 'prepare'>;

export const A2A_PRICE_QUOTE_CONSENT_VERSION =
  'a2a-price-quote-prompt-disclosure-v1';

export type A2APriceQuoteConsentInput = {
  id: string;
  ownerUserId: string;
  quoteRequestId: string;
  agentConnectionId: string;
  agentOrigin: string;
  agentName: string;
  agentVersion: string;
  agentCardSha256: string;
  message: string;
  currency: string;
  maximumBudgetMinor: number;
  expiresAt: number;
  consentedAt?: number;
};

type ExistingConsent = {
  agent_connection_id: string;
  agent_origin: string;
  agent_name: string;
  agent_version: string;
  agent_card_sha256: string;
  prompt_sha256: string;
  currency: string;
  maximum_budget_minor: number;
  expires_at: number;
  consent_version: string;
};

export class A2APriceQuoteConsentStoreError extends Error {
  readonly code: 'QUOTE_REQUEST_ID_CONFLICT' | 'CONSENT_STORE_UNAVAILABLE';
  constructor(code: A2APriceQuoteConsentStoreError['code']) {
    super(code);
    this.name = 'A2APriceQuoteConsentStoreError';
    this.code = code;
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Records exact quote-only prompt disclosure consent without persisting the prompt itself. */
export async function recordA2APriceQuoteConsent(
  db: Database,
  input: A2APriceQuoteConsentInput,
) {
  const promptSha256 = await sha256(input.message);
  const values = [
    input.agentConnectionId, input.agentOrigin, input.agentName, input.agentVersion,
    input.agentCardSha256, promptSha256, input.currency, input.maximumBudgetMinor,
    input.expiresAt, A2A_PRICE_QUOTE_CONSENT_VERSION,
  ] as const;
  const consentedAt = input.consentedAt ?? Date.now();
  try {
    const result = await db.prepare(`INSERT INTO a2a_price_quote_consent_events
      (id, owner_user_id, quote_request_id, agent_connection_id, agent_origin,
       agent_name, agent_version, agent_card_sha256, prompt_sha256, currency,
       maximum_budget_minor, expires_at, consent_version, consented_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_user_id, quote_request_id) DO NOTHING`)
      .bind(input.id, input.ownerUserId, input.quoteRequestId, ...values, consentedAt).run();
    if ((result.meta?.changes ?? 0) === 1) return { recorded: true as const };

    const existing = await db.prepare(`SELECT agent_connection_id, agent_origin, agent_name,
      agent_version, agent_card_sha256, prompt_sha256, currency, maximum_budget_minor,
      expires_at, consent_version FROM a2a_price_quote_consent_events
      WHERE owner_user_id = ? AND quote_request_id = ?`)
      .bind(input.ownerUserId, input.quoteRequestId).first<ExistingConsent>();
    if (!existing) throw new A2APriceQuoteConsentStoreError('CONSENT_STORE_UNAVAILABLE');
    const sameTerms = [
      existing.agent_connection_id, existing.agent_origin, existing.agent_name,
      existing.agent_version, existing.agent_card_sha256, existing.prompt_sha256,
      existing.currency, existing.maximum_budget_minor, existing.expires_at,
      existing.consent_version,
    ].every((value, index) => value === values[index]);
    if (!sameTerms) throw new A2APriceQuoteConsentStoreError('QUOTE_REQUEST_ID_CONFLICT');
    return { recorded: false as const };
  } catch (error) {
    if (error instanceof A2APriceQuoteConsentStoreError) throw error;
    throw new A2APriceQuoteConsentStoreError('CONSENT_STORE_UNAVAILABLE');
  }
}
