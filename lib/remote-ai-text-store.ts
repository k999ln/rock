import type { TextGenerationResult, TextGenerationUsage } from './llm-providers.ts';
import type { VerifiedRemoteAiRateCard } from './remote-ai-rate-card.ts';
import type { EncryptedRemoteAiTextInput } from './remote-ai-text-input.ts';
import {
  estimateRemoteAiTextLiveSpend,
  priceRemoteAiTextUsage,
  type RemoteAiTextLiveEstimate,
  type RemoteAiTextQuote,
  type RemoteAiTextPriceResult,
} from './remote-ai-text-pricing.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
export const REMOTE_AI_TEXT_MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000;
export type RemoteAiTextState = 'quoted' | 'reserved' | 'sending' | 'completed' | 'unreconciled' | 'cancelled' | 'expired';
export type RemoteAiTextRecord = {
  id: string;
  ownerUserId: string;
  requestId: string;
  parentJobId: string;
  parentBudgetLimitMinor: number;
  approvalDigest: string;
  quote: RemoteAiTextQuote;
  verifiedRate: VerifiedRemoteAiRateCard;
  saveResult: boolean;
  state: RemoteAiTextState;
  settledMinor: number | null;
  usage: TextGenerationUsage | null;
  observation: Record<string, unknown> | null;
  price: RemoteAiTextPriceResult | null;
  providerResponseId: string | null;
  resultText: string | null;
  durationMs: number | null;
  errorCode: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
};
type Row = Omit<RemoteAiTextRecord, 'quote' | 'verifiedRate' | 'saveResult' | 'usage' | 'price' | 'observation'> & {
  quoteJson: string; rateCardJson: string; rateCardDigest: string; saveResult: number;
  usageJson: string | null; priceJson: string | null;
  observationJson: string | null;
};
const columns = `id, owner_user_id AS ownerUserId, request_id AS requestId,
  parent_job_id AS parentJobId, parent_budget_limit_minor AS parentBudgetLimitMinor,
  approval_digest AS approvalDigest, quote_json AS quoteJson, rate_card_json AS rateCardJson,
  rate_card_digest AS rateCardDigest, save_result AS saveResult, state, settled_minor AS settledMinor,
  usage_json AS usageJson, observation_json AS observationJson, price_json AS priceJson, provider_response_id AS providerResponseId,
  result_text AS resultText, duration_ms AS durationMs, error_code AS errorCode,
  revision, created_at AS createdAt, updated_at AS updatedAt`;

export class RemoteAiTextStoreError extends Error {
  readonly code: 'QUOTE_CONFLICT' | 'NOT_FOUND' | 'APPROVAL_MISMATCH' | 'INVALID_STATE' |
    'BUDGET_UNAVAILABLE' | 'STORE_UNAVAILABLE' | 'USAGE_CONFLICT';
  constructor(code: 'QUOTE_CONFLICT' | 'NOT_FOUND' | 'APPROVAL_MISMATCH' | 'INVALID_STATE' |
    'BUDGET_UNAVAILABLE' | 'STORE_UNAVAILABLE' | 'USAGE_CONFLICT') {
    super(code);
    this.code = code;
    this.name = 'RemoteAiTextStoreError';
  }
}
function decode(row: Row): RemoteAiTextRecord {
  try {
    const { quoteJson, rateCardJson, rateCardDigest, saveResult, usageJson, priceJson, observationJson, ...rest } = row;
    return {
      ...rest, quote: JSON.parse(quoteJson),
      verifiedRate: { card: JSON.parse(rateCardJson), digest: rateCardDigest },
      saveResult: saveResult === 1,
      usage: usageJson ? JSON.parse(usageJson) : null,
      price: priceJson ? JSON.parse(priceJson) : null,
      observation: observationJson ? JSON.parse(observationJson) : null,
    };
  } catch { throw new RemoteAiTextStoreError('STORE_UNAVAILABLE'); }
}
async function approvalDigest(quote: RemoteAiTextQuote, parentJobId: string, parentBudgetLimitMinor: number, saveResult: boolean) {
  const value = JSON.stringify({
    domain: 'rockstar-remote-ai-text-approval/1', quoteDigest: quote.quoteDigest,
    parentJobId, parentBudgetLimitMinor, saveResult,
  });
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Shares A2A's parent budget counters, without pretending JSON usage is an A2A signed receipt. */
export class RemoteAiTextStore {
  private readonly db: Database;
  constructor(db: Database) { this.db = db; }

  async get(owner: string, id: string) {
    const row = await this.db.prepare(`SELECT ${columns} FROM remote_ai_text_executions WHERE owner_user_id = ? AND id = ?`)
      .bind(owner, id).first<Row>();
    return row ? decode(row) : null;
  }
  async findRequest(owner: string, requestId: string) {
    const row = await this.db.prepare(`SELECT ${columns} FROM remote_ai_text_executions WHERE owner_user_id = ? AND request_id = ?`)
      .bind(owner, requestId).first<Row>();
    return row ? decode(row) : null;
  }
  async listPrepared(limit = 50, now = Date.now()) {
    const rows = await this.db.prepare(`SELECT e.owner_user_id AS ownerUserId, e.id
      FROM remote_ai_text_executions e JOIN remote_ai_text_inputs i ON i.execution_id = e.id
      WHERE e.state = 'reserved' AND i.expires_at > ?
      ORDER BY e.updated_at, e.id LIMIT ?`).bind(now, Math.max(1, Math.min(100, limit)))
      .all<{ ownerUserId: string; id: string }>();
    return rows.results ?? [];
  }
  async saveInput(owner: string, id: string, approval: string, encrypted: EncryptedRemoteAiTextInput, now = Date.now()) {
    const current = await this.get(owner, id);
    if (!current) throw new RemoteAiTextStoreError('NOT_FOUND');
    if (approval !== current.approvalDigest) throw new RemoteAiTextStoreError('APPROVAL_MISMATCH');
    if (current.state !== 'reserved' || current.quote.expiresAt <= now ||
      encrypted.keyVersion !== 'aes-256-gcm-v1' || !/^[a-f0-9]{64}$/.test(encrypted.inputSha256) ||
      typeof encrypted.ciphertext !== 'string' || encrypted.ciphertext.length > 80_000 ||
      typeof encrypted.nonce !== 'string' || encrypted.nonce.length > 64)
      throw new RemoteAiTextStoreError('INVALID_STATE');
    try {
      const executionDeadlineAt = current.quote.expiresAt + REMOTE_AI_TEXT_MAX_QUEUE_AGE_MS;
      const result = await this.db.prepare(`INSERT INTO remote_ai_text_inputs
        (execution_id, owner_user_id, ciphertext, nonce, input_sha256, key_version, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(execution_id) DO NOTHING`)
        .bind(id, owner, encrypted.ciphertext, encrypted.nonce, encrypted.inputSha256,
          encrypted.keyVersion, executionDeadlineAt, now).run();
      const inserted = (result.meta?.changes ?? 0) === 1;
      const saved = await this.getInput(owner, id);
      if (!saved || saved.inputSha256 !== encrypted.inputSha256 || saved.expiresAt !== executionDeadlineAt)
        throw new RemoteAiTextStoreError('QUOTE_CONFLICT');
      return { record: await this.get(owner, id), inserted };
    } catch (error) {
      if (error instanceof RemoteAiTextStoreError) throw error;
      throw new RemoteAiTextStoreError('STORE_UNAVAILABLE');
    }
  }
  async getInput(owner: string, id: string) {
    return this.db.prepare(`SELECT execution_id AS executionId, owner_user_id AS ownerUserId,
      ciphertext, nonce, input_sha256 AS inputSha256, key_version AS keyVersion,
      expires_at AS expiresAt, created_at AS createdAt FROM remote_ai_text_inputs
      WHERE owner_user_id = ? AND execution_id = ?`).bind(owner, id)
      .first<EncryptedRemoteAiTextInput & { executionId: string; ownerUserId: string; expiresAt: number; createdAt: number }>();
  }
  async claimProviderSend(owner: string, id: string, now = Date.now()) {
    const result = await this.db.prepare(`INSERT INTO remote_ai_text_send_claims (execution_id, owner_user_id, claimed_at)
      SELECT e.id, e.owner_user_id, ? FROM remote_ai_text_executions e
      JOIN remote_ai_text_inputs i ON i.execution_id = e.id
      WHERE e.owner_user_id = ? AND e.id = ? AND e.state = 'sending' AND e.expires_at > ? AND i.expires_at > ?
      ON CONFLICT(execution_id) DO NOTHING`).bind(now, owner, id, now, now).run();
    return (result.meta?.changes ?? 0) === 1;
  }
  async deleteInputAfterTerminal(owner: string, id: string) {
    await this.db.prepare(`DELETE FROM remote_ai_text_inputs WHERE owner_user_id = ? AND execution_id = ?
      AND EXISTS (SELECT 1 FROM remote_ai_text_executions e WHERE e.owner_user_id = ? AND e.id = ?
        AND e.state IN ('completed','unreconciled','cancelled','expired'))`).bind(owner, id, owner, id).run();
  }
  async list(owner: string, parentJobId?: string, now = Date.now()) {
    const parentFilter = parentJobId === undefined ? '' : ' AND parent_job_id = ?';
    const values = parentJobId === undefined ? [owner] : [owner, parentJobId];
    // Only unsubmitted, expired approvals can release a reservation. Sending or
    // uncertain executions remain held, including during history readback.
    await this.db.prepare(`UPDATE remote_ai_text_executions
      SET state = 'expired', revision = revision + 1, updated_at = ?
      WHERE owner_user_id = ?${parentFilter} AND ((state = 'quoted' AND expires_at <= ?) OR
        (state = 'reserved' AND COALESCE((SELECT i.expires_at FROM remote_ai_text_inputs i
          WHERE i.execution_id = remote_ai_text_executions.id), expires_at) <= ?))`)
      .bind(now, ...values, now, now).run();
    const rows = await this.db.prepare(`SELECT ${columns} FROM remote_ai_text_executions
      WHERE owner_user_id = ?${parentFilter} ORDER BY created_at DESC, id DESC LIMIT 50`).bind(...values).all<Row>();
    return (rows.results ?? []).map(decode);
  }
  async create(quote: RemoteAiTextQuote, verified: VerifiedRemoteAiRateCard,
    parentJobId: string, parentBudgetLimitMinor: number, saveResult = false) {
    if (!Number.isSafeInteger(parentBudgetLimitMinor) || parentBudgetLimitMinor < quote.approvedCapMinor ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(parentJobId) || typeof saveResult !== 'boolean' ||
      verified.digest !== quote.ceiling.rateCardDigest)
      throw new RemoteAiTextStoreError('QUOTE_CONFLICT');
    const existing = await this.findRequest(quote.ownerId, quote.requestId);
    const sameRequest = (row: RemoteAiTextRecord) =>
      row.quote.requestDigest === quote.requestDigest && row.quote.approvedCapMinor === quote.approvedCapMinor &&
      row.parentJobId === parentJobId && row.parentBudgetLimitMinor === parentBudgetLimitMinor && row.saveResult === saveResult;
    if (existing) {
      if (!sameRequest(existing)) throw new RemoteAiTextStoreError('QUOTE_CONFLICT');
      return { record: existing, inserted: false };
    }
    const id = crypto.randomUUID();
    const approval = await approvalDigest(quote, parentJobId, parentBudgetLimitMinor, saveResult);
    try {
      await this.db.prepare(`INSERT INTO remote_ai_text_executions
        (id, owner_user_id, request_id, parent_job_id, model_id, card_id, rate_card_digest,
         quote_digest, approval_digest, quote_json, rate_card_json, currency,
         maximum_charge_minor, approved_cap_minor, parent_budget_limit_minor, save_result,
         state, created_at, updated_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'quoted', ?, ?, ?)
        ON CONFLICT(owner_user_id, request_id) DO NOTHING`)
        .bind(id, quote.ownerId, quote.requestId, parentJobId, verified.card.modelId, verified.card.cardId,
          verified.digest, quote.quoteDigest, approval, JSON.stringify(quote), JSON.stringify(verified.card),
          quote.ceiling.currency, quote.ceiling.maximumChargeMinor, quote.approvedCapMinor,
          parentBudgetLimitMinor, saveResult ? 1 : 0, quote.createdAt, quote.createdAt, quote.expiresAt).run();
    } catch { throw new RemoteAiTextStoreError('STORE_UNAVAILABLE'); }
    const row = await this.findRequest(quote.ownerId, quote.requestId);
    if (!row || !sameRequest(row)) throw new RemoteAiTextStoreError('QUOTE_CONFLICT');
    return { record: row, inserted: row.id === id };
  }
  async reserve(owner: string, id: string, approval: string, now = Date.now()) {
    const current = await this.get(owner, id);
    if (!current) throw new RemoteAiTextStoreError('NOT_FOUND');
    if (approval !== current.approvalDigest) throw new RemoteAiTextStoreError('APPROVAL_MISMATCH');
    if (['reserved', 'sending', 'completed', 'unreconciled'].includes(current.state)) return current;
    if (current.state !== 'quoted') throw new RemoteAiTextStoreError('INVALID_STATE');
    try {
      await this.db.batch([
        this.db.prepare(`INSERT INTO agent_delegation_budget_pools
          (owner_user_id, parent_job_id, currency, budget_limit_minor, reserved_minor, settled_minor, revision, created_at, updated_at)
          SELECT owner_user_id, parent_job_id, currency, parent_budget_limit_minor, 0, 0, 0, ?, ?
          FROM remote_ai_text_executions WHERE owner_user_id = ? AND id = ? AND state = 'quoted'
            AND approval_digest = ? AND expires_at > ?
          ON CONFLICT(owner_user_id, parent_job_id) DO NOTHING`).bind(now, now, owner, id, approval, now),
        this.db.prepare(`UPDATE remote_ai_text_executions SET state = 'reserved', revision = revision + 1, updated_at = ?
          WHERE owner_user_id = ? AND id = ? AND state = 'quoted' AND approval_digest = ?`).bind(now, owner, id, approval),
      ]);
    } catch { throw new RemoteAiTextStoreError('BUDGET_UNAVAILABLE'); }
    const row = await this.get(owner, id);
    if (!row || !['reserved', 'sending', 'completed', 'unreconciled'].includes(row.state))
      throw new RemoteAiTextStoreError('BUDGET_UNAVAILABLE');
    return row;
  }
  async claimDispatch(owner: string, id: string, approval: string, now = Date.now()) {
    try {
      const result = await this.db.prepare(`UPDATE remote_ai_text_executions
        SET state = 'sending', revision = revision + 1, updated_at = ?
        WHERE owner_user_id = ? AND id = ? AND approval_digest = ? AND state = 'reserved'
          AND EXISTS (SELECT 1 FROM remote_ai_text_inputs i WHERE i.execution_id = remote_ai_text_executions.id
            AND i.owner_user_id = remote_ai_text_executions.owner_user_id AND i.expires_at > ?)`)
        .bind(now, owner, id, approval, now).run();
      return (result.meta?.changes ?? 0) === 1;
    } catch { throw new RemoteAiTextStoreError('BUDGET_UNAVAILABLE'); }
  }
  async updateLiveEstimate(owner: string, id: string, outputBytes: number, now = Date.now()) {
    const current = await this.get(owner, id);
    if (!current || current.state !== 'sending') return false;
    const previous = current.observation?.liveMeter as RemoteAiTextLiveEstimate | undefined;
    if (previous && outputBytes <= previous.observedOutputBytes) return false;
    const liveMeter = estimateRemoteAiTextLiveSpend(
      current.verifiedRate, current.quote.ceiling, outputBytes, now,
    );
    if (!liveMeter) throw new RemoteAiTextStoreError('USAGE_CONFLICT');
    const observation = { ...current.observation, liveMeter };
    const result = await this.db.prepare(`UPDATE remote_ai_text_executions
      SET observation_json = ?, revision = revision + 1, updated_at = ?
      WHERE owner_user_id = ? AND id = ? AND state = 'sending' AND revision = ?`)
      .bind(JSON.stringify(observation), now, owner, id, current.revision).run();
    return (result.meta?.changes ?? 0) === 1;
  }
  async markUnreconciled(owner: string, id: string, code: string, now = Date.now(), observation: Record<string, unknown> | null = null) {
    const safeCode = /^[A-Z_]{1,64}$/.test(code) ? code : 'UPSTREAM_UNAVAILABLE';
    const current = await this.get(owner, id);
    const liveMeter = current?.observation?.liveMeter;
    const nextObservation = observation
      ? { ...observation, ...(liveMeter ? { liveMeter } : {}) }
      : current?.observation ?? null;
    await this.db.prepare(`UPDATE remote_ai_text_executions
      SET state = 'unreconciled', error_code = ?, observation_json = ?, revision = revision + 1, updated_at = ?
      WHERE owner_user_id = ? AND id = ? AND state = 'sending'`)
      .bind(safeCode, nextObservation ? JSON.stringify(nextObservation) : null, now, owner, id).run();
    return this.get(owner, id);
  }
  async complete(owner: string, id: string, verified: VerifiedRemoteAiRateCard,
    result: TextGenerationResult, now = Date.now()) {
    const current = await this.get(owner, id);
    if (!current) throw new RemoteAiTextStoreError('NOT_FOUND');
    if (current.verifiedRate.digest !== verified.digest ||
      JSON.stringify(current.verifiedRate.card) !== JSON.stringify(verified.card))
      throw new RemoteAiTextStoreError('USAGE_CONFLICT');
    const price = priceRemoteAiTextUsage(verified, current.quote.ceiling, result);
    const observation = {
      model: result.reportedModel ?? null, serviceTier: result.serviceTier ?? null,
      responseStatus: result.responseStatus ?? null, providerResponseId: result.providerResponseId ?? null,
      clientRequestId: result.clientRequestId ?? current.id, providerRequestId: result.providerRequestId ?? null,
      durationMs: result.durationMs ?? null, usage: result.usage ?? null,
      webSearchCalls: result.webSearchCalls ?? null, textOnlyOutput: result.textOnlyOutput ?? false,
    };
    if (price.status !== 'priced') return this.markUnreconciled(owner, id, price.reason, now, observation);
    if (!Number.isSafeInteger(result.durationMs) || (result.durationMs as number) < 0 ||
      typeof result.text !== 'string' || !result.text.trim() || result.text.length > 262_144)
      return this.markUnreconciled(owner, id, 'INVALID_RESULT', now, observation);
    const usageJson = JSON.stringify(result.usage);
    const priceJson = JSON.stringify(price);
    if (current.state === 'completed') {
      if (current.providerResponseId !== price.providerResponseId || JSON.stringify(current.price) !== priceJson ||
        JSON.stringify(current.usage) !== usageJson)
        throw new RemoteAiTextStoreError('USAGE_CONFLICT');
      return current;
    }
    if (!['sending', 'unreconciled'].includes(current.state)) throw new RemoteAiTextStoreError('INVALID_STATE');
    try {
      await this.db.prepare(`UPDATE remote_ai_text_executions SET state = 'completed', settled_minor = ?,
        usage_json = ?, observation_json = ?, price_json = ?, provider_response_id = ?, result_text = ?, duration_ms = ?,
        error_code = NULL, revision = revision + 1, updated_at = ?
        WHERE owner_user_id = ? AND id = ? AND state IN ('sending','unreconciled')`)
        .bind(price.chargeMinor, usageJson, JSON.stringify(observation), priceJson, price.providerResponseId,
          current.saveResult ? result.text : null, result.durationMs as number, now, owner, id).run();
    } catch { throw new RemoteAiTextStoreError('USAGE_CONFLICT'); }
    const row = await this.get(owner, id);
    if (!row || row.state !== 'completed' || row.providerResponseId !== price.providerResponseId ||
      JSON.stringify(row.price) !== priceJson || JSON.stringify(row.usage) !== usageJson)
      throw new RemoteAiTextStoreError('USAGE_CONFLICT');
    return row;
  }
  async cancelBeforeSend(owner: string, id: string, approval: string, now = Date.now()) {
    const current = await this.get(owner, id);
    if (!current) throw new RemoteAiTextStoreError('NOT_FOUND');
    if (approval !== current.approvalDigest) throw new RemoteAiTextStoreError('APPROVAL_MISMATCH');
    if (current.state === 'cancelled') {
      await this.deleteInputAfterTerminal(owner, id);
      return current;
    }
    if (!['quoted', 'reserved'].includes(current.state)) throw new RemoteAiTextStoreError('INVALID_STATE');
    await this.db.prepare(`UPDATE remote_ai_text_executions
      SET state = 'cancelled', revision = revision + 1, updated_at = ?
      WHERE owner_user_id = ? AND id = ? AND state IN ('quoted','reserved')`).bind(now, owner, id).run();
    // D1 can include trigger updates in meta.changes. Read the owned record instead
    // of treating its budget-pool update as a second cancellation.
    const row = await this.get(owner, id);
    if (!row || row.state !== 'cancelled') throw new RemoteAiTextStoreError('INVALID_STATE');
    await this.deleteInputAfterTerminal(owner, id);
    return row;
  }
  async expireBeforeSend(owner: string, id: string, now = Date.now()) {
    await this.db.prepare(`UPDATE remote_ai_text_executions
      SET state = 'expired', revision = revision + 1, updated_at = ?
      WHERE owner_user_id = ? AND id = ? AND ((state = 'quoted' AND expires_at <= ?) OR
        (state = 'reserved' AND COALESCE((SELECT i.expires_at FROM remote_ai_text_inputs i WHERE i.execution_id = remote_ai_text_executions.id), expires_at) <= ?))`)
      .bind(now, owner, id, now, now).run();
    const row = await this.get(owner, id);
    if (row?.state === 'expired') await this.deleteInputAfterTerminal(owner, id);
    return row;
  }
  async expireAllBeforeSend(now = Date.now()) {
    await this.db.prepare(`UPDATE remote_ai_text_executions
      SET state = 'expired', revision = revision + 1, updated_at = ?
      WHERE (state = 'quoted' AND expires_at <= ?) OR (state = 'reserved' AND
        COALESCE((SELECT i.expires_at FROM remote_ai_text_inputs i WHERE i.execution_id = remote_ai_text_executions.id), expires_at) <= ?)`)
      .bind(now, now, now).run();
    await this.db.prepare(`DELETE FROM remote_ai_text_inputs WHERE expires_at <= ?
      AND EXISTS (SELECT 1 FROM remote_ai_text_executions e WHERE e.id = remote_ai_text_inputs.execution_id
        AND e.state IN ('completed','unreconciled','cancelled','expired'))`).bind(now).run();
  }
  async deleteSavedResult(owner: string, id: string, now = Date.now()) {
    await this.db.prepare(`UPDATE remote_ai_text_executions
      SET result_text = NULL, revision = revision + 1, updated_at = ?
      WHERE owner_user_id = ? AND id = ? AND state = 'completed' AND result_text IS NOT NULL`)
      .bind(now, owner, id).run();
    return this.get(owner, id);
  }
}
