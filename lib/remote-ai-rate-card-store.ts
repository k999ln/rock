import type {
  RemoteAiRateCard,
  VerifiedRemoteAiRateCard,
} from './remote-ai-rate-card.ts';

type Database = Pick<D1Database, 'prepare'>;

type RateCardRow = {
  providerId: string;
  cardId: string;
  currency: string;
  digest: string;
  cardJson: string;
  status: 'active' | 'revoked';
  createdBy: string;
  revokedBy: string | null;
  expiresAt: number;
  effectiveAt: number;
};

export class RemoteAiRateCardStoreError extends Error {
  readonly code: 'RATE_CARD_ID_CONFLICT' | 'RATE_CARD_REVOKED' | 'RATE_CARD_NOT_FOUND' | 'RATE_CARD_STORE_UNAVAILABLE';
  constructor(code: RemoteAiRateCardStoreError['code']) {
    super(code);
    this.name = 'RemoteAiRateCardStoreError';
    this.code = code;
  }
}

export class RemoteAiRateCardStore {
  private readonly db: Database;
  constructor(db: Database) { this.db = db; }

  async register(
    verified: VerifiedRemoteAiRateCard,
    operatorId: string,
    now = Date.now(),
  ) {
    const { card, digest } = verified;
    const select = () => this.db.prepare(
      `SELECT provider_id AS providerId, card_id AS cardId, currency, digest, status, created_by AS createdBy, revoked_by AS revokedBy
       FROM remote_ai_rate_cards WHERE provider_id = ? AND card_id = ?`,
    ).bind(card.providerId, card.cardId).first<Pick<RateCardRow, 'providerId' | 'cardId' | 'digest' | 'status' | 'createdBy' | 'revokedBy'>>();
    let existing = await select();
    if (existing) {
      if (existing.digest !== digest) throw new RemoteAiRateCardStoreError('RATE_CARD_ID_CONFLICT');
      if (existing.status === 'revoked') throw new RemoteAiRateCardStoreError('RATE_CARD_REVOKED');
      return { inserted: false, status: existing.status };
    }

    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO remote_ai_rate_cards
        (provider_id, card_id, key_id, model_id, currency, pricing_version, effective_at, expires_at,
         digest, card_json, status, created_at, created_by, revoked_at, revoked_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, NULL)`,
    ).bind(
      card.providerId, card.cardId, card.keyId, card.modelId, card.currency,
      card.pricingVersion, card.effectiveAt, card.expiresAt, digest, JSON.stringify(card), now, operatorId,
    ).run();
    existing = await select();
    if (!existing) throw new RemoteAiRateCardStoreError('RATE_CARD_STORE_UNAVAILABLE');
    if (existing.digest !== digest) throw new RemoteAiRateCardStoreError('RATE_CARD_ID_CONFLICT');
    if (existing.status === 'revoked') throw new RemoteAiRateCardStoreError('RATE_CARD_REVOKED');
    return { inserted: (result.meta?.changes ?? 0) > 0, status: existing.status };
  }

  async revoke(providerId: string, cardId: string, operatorId: string, now = Date.now()) {
    const result = await this.db.prepare(
      `UPDATE remote_ai_rate_cards
       SET status = 'revoked', revoked_at = ?, revoked_by = ?
       WHERE provider_id = ? AND card_id = ? AND status = 'active'`,
    ).bind(now, operatorId, providerId, cardId).run();
    if ((result.meta?.changes ?? 0) > 0) return { revoked: true, alreadyRevoked: false };
    const existing = await this.db.prepare(
      'SELECT status FROM remote_ai_rate_cards WHERE provider_id = ? AND card_id = ?',
    ).bind(providerId, cardId).first<{ status: string }>();
    if (!existing) throw new RemoteAiRateCardStoreError('RATE_CARD_NOT_FOUND');
    return { revoked: true, alreadyRevoked: true };
  }

  async listActive(providerId: string, modelId: string, currency?: string, now = Date.now()) {
    const statement = currency
      ? this.db.prepare(
          `SELECT provider_id AS providerId, card_id AS cardId, currency, digest, card_json AS cardJson,
                  status, created_by AS createdBy, revoked_by AS revokedBy,
                  expires_at AS expiresAt, effective_at AS effectiveAt
           FROM remote_ai_rate_cards
           WHERE provider_id = ? AND model_id = ? AND currency = ? AND status = 'active'
             AND effective_at <= ? AND expires_at > ?
           ORDER BY effective_at DESC, expires_at DESC LIMIT 128`,
        ).bind(providerId, modelId, currency, now + 30_000, now)
      : this.db.prepare(
          `SELECT provider_id AS providerId, card_id AS cardId, currency, digest, card_json AS cardJson,
                  status, created_by AS createdBy, revoked_by AS revokedBy,
                  expires_at AS expiresAt, effective_at AS effectiveAt
           FROM remote_ai_rate_cards
           WHERE provider_id = ? AND model_id = ? AND status = 'active'
             AND effective_at <= ? AND expires_at > ?
           ORDER BY effective_at DESC, expires_at DESC LIMIT 128`,
        ).bind(providerId, modelId, now + 30_000, now);
    const result = await statement.all<RateCardRow>();
    return result.results ?? [];
  }

  async activeCardById(providerId: string, cardId: string) {
    return this.db.prepare(
      `SELECT provider_id AS providerId, card_id AS cardId, currency, digest, card_json AS cardJson,
              status, created_by AS createdBy, revoked_by AS revokedBy,
              expires_at AS expiresAt, effective_at AS effectiveAt
       FROM remote_ai_rate_cards WHERE provider_id = ? AND card_id = ?`,
    ).bind(providerId, cardId).first<RateCardRow>();
  }
}

export function parseStoredRemoteAiRateCard(row: RateCardRow): RemoteAiRateCard | null {
  try {
    const card: unknown = JSON.parse(row.cardJson);
    if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
    const value = card as RemoteAiRateCard;
    return value.providerId === row.providerId && value.cardId === row.cardId ? value : null;
  } catch {
    return null;
  }
}
