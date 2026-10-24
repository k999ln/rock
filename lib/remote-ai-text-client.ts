import type { TextGenerationUsage } from './llm-providers.ts';
import type { EveEstimateSourceRef } from './eve-text-job.ts';
const messages: Record<string, string> = {
  UNAUTHORIZED: 'サインインの有効期限が切れました。再度サインインして続けてください。',
  SERVICE_ENTITLEMENT_REQUIRED: 'この機能の利用権を確認できません。接続状態を確認してください。',
  RATE_LIMITED: '確認回数が上限に達しました。少し待ってから状態を更新してください。',
  REMOTE_AI_RATE_CARD_UNAVAILABLE: '有効な料金表が未設定か期限切れです。クラウドsiには送信していません。',
  REMOTE_AI_TEXT_RATE_COVERAGE_UNAVAILABLE: 'このモデルの料金確認が完了していません。クラウドsiには送信していません。',
  RATE_CARD_CURRENCY_REQUIRED: '料金表の通貨を選んで、もう一度見積もってください。',
  REMOTE_AI_QUOTE_OVER_CAP_OR_INVALID: '見積が指定した上限を超えているか、入力を確認できません。上限と依頼文を確認してください。',
  QUOTE_CONFLICT: '見積の内容か料金版が変わっています。最新状態を確認して見積を作り直してください。',
  APPROVAL_MISMATCH: '承認する見積を確認できません。最新状態を読み込んでください。',
  BUDGET_UNAVAILABLE: '見積の期限か、同じ仕事の残り予算を確認してください。状態を更新してから進めてください。',
  INVALID_STATE: 'この状態では操作できません。最新状態を読み込んでください。',
  REMOTE_LLM_DISABLED: 'クラウドsiは接続準備中です。実行は開始していません。',
  REMOTE_AI_PRICING_GATE_UNAVAILABLE: 'クラウドsiの料金・実行確認が完了していません。実行は開始していません。',
  UPSTREAM_TIMEOUT: 'クラウドsiの応答が時間内に返りませんでした。再送せず、保存済みの状態を確認してください。',
  INVALID_RESPONSE: '応答の内容を確認できませんでした。元の依頼は保持しています。再送せず、保存済みの状態を確認してください。',
  NETWORK: '応答を確認できませんでした。再送せず、保存済みの状態を確認してください。',
};
export class RemoteAiTextClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly currencies: string[];
  constructor(status: number, code: string, currencies: string[] = []) {
    super(status === 401 ? messages.UNAUTHORIZED : messages[code] ?? 'クラウドsiの操作を確認できませんでした。保存済みの状態を更新してください。');
    this.status = status; this.code = code; this.currencies = currencies;
  }
}
/** Exactly one same-origin request. An uncertain response never triggers another execution. */
export async function remoteAiTextRequest<T>(path: string, method = 'GET', body?: unknown,
  timeoutMs = 15_000, fetchImpl: typeof fetch = fetch): Promise<T> {
  if (!/^\/api\/llm\/(?:estimate|text|quotes(?:\/[A-Za-z0-9._:-]{1,128})?)(?:\?parentJobId=[A-Za-z0-9._%:-]+)?$/.test(path) ||
    !['GET', 'POST', 'DELETE'].includes(method)) throw new RemoteAiTextClientError(400, 'INVALID_REQUEST');
  let response: Response;
  try {
    response = await fetchImpl(path, { method, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  } catch { throw new RemoteAiTextClientError(0, 'NETWORK'); }
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400))
    throw new RemoteAiTextClientError(401, 'UNAUTHORIZED');
  let data: unknown;
  try { data = await response.json(); } catch { throw new RemoteAiTextClientError(response.status, 'INVALID_RESPONSE'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new RemoteAiTextClientError(response.status, 'INVALID_RESPONSE');
  if (!response.ok) {
    const error = data as { code?: unknown; currencies?: unknown };
    const code = typeof error.code === 'string' && /^[A-Z_]{1,64}$/.test(error.code) ? error.code : 'REQUEST_FAILED';
    const currencies = Array.isArray(error.currencies) ? error.currencies.filter((value): value is string =>
      typeof value === 'string' && /^[A-Z]{3}$/.test(value)).slice(0,10) : [];
    throw new RemoteAiTextClientError(response.status, code, currencies);
  }
  return data as T;
}

export type RemoteTextExecution = {
  id: string;
  parentJobId: string;
  parentBudgetLimitMinor: number;
  requestId: string;
  approvalDigest: string;
  state: 'quoted' | 'reserved' | 'sending' | 'completed' | 'unreconciled' | 'cancelled' | 'expired';
  quote: {
    requestDigest: string;
    createdAt: number;
    expiresAt: number;
    approvedCapMinor: number;
    ceiling: {
      currency: string;
      maximumChargeMinor: number;
      inputTokenUpperBound: number;
      outputTokenLimit: number;
      modelId: string;
      pricingVersion: string;
      rateCardDigest: string;
    };
  };
  settledMinor: number | null;
  usage: TextGenerationUsage | null;
  price: { status?: 'priced'; chargeMinor: number; currency: string; pricingVersion: string; items: Array<{ category: string; tokens: number; rateMinorMicrosPerMillionTokens: number }> } | { status: 'unreconciled'; reason: string } | null;
  spending?: {
    status: string;
    currency: string;
    currentChargeMinor: number | null;
    currentEstimateMinor: number | null;
    estimateUpdatedAt: number | null;
    estimateBasis: string | null;
    reservedMaximumMinor: number;
    providerMeter: string;
    invoiceVerified: boolean;
  };
  resultText: string | null;
  errorCode: string | null;
  saveResult: boolean;
  createdAt: number;
  updatedAt: number;
};
export type RemoteTextEstimate = {
  estimate: RemoteTextExecution['quote']['ceiling'];
  unitRates: Array<{ category: 'ordinary-input' | 'cached-input' | 'cache-write' | 'output'; rateMinorMicrosPerMillionTokens: number }>;
  rateSource: string;
  cardId: string;
  withinUserCap: boolean;
  currencies?: string[];
};

// Validate the browser-facing projection before it enters render state or authorizes
// the next request. Unknown responses are not empty lists or successful mutations.
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const identifier = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const currency = (value: unknown) => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
function invalid(): never { throw new RemoteAiTextClientError(200, 'INVALID_RESPONSE'); }
function ceiling(value: unknown): value is RemoteTextExecution['quote']['ceiling'] {
  return object(value) && currency(value.currency) && nonempty(value.modelId) && nonempty(value.pricingVersion) &&
    digest(value.rateCardDigest) && integer(value.maximumChargeMinor) && integer(value.inputTokenUpperBound) &&
    integer(value.outputTokenLimit) && value.outputTokenLimit > 0;
}
function readEstimateShape(value: unknown, expected: { currency?: string; model?: string; outputTokenLimit: number }): RemoteTextEstimate {
  if (!object(value) || !ceiling(value.estimate) || !Array.isArray(value.unitRates) ||
    !value.unitRates.every((rate) => object(rate) && ['ordinary-input', 'cached-input', 'cache-write', 'output'].includes(String(rate.category)) && integer(rate.rateMinorMicrosPerMillionTokens)) ||
    typeof value.withinUserCap !== 'boolean' || !nonempty(value.cardId) || typeof value.rateSource !== 'string' ||
    !value.rateSource.startsWith('https://') || (expected.currency !== undefined && value.estimate.currency !== expected.currency) ||
    (expected.model !== undefined && value.estimate.modelId !== expected.model) || value.estimate.outputTokenLimit !== expected.outputTokenLimit)
    invalid();
  return value as RemoteTextEstimate;
}
export function readRemoteTextEstimate(value: unknown, expected: { currency: string; model?: string; outputTokenLimit: number; maximumBudgetMinor: number }): RemoteTextEstimate {
  const estimate = readEstimateShape(value, expected);
  if (!estimate.withinUserCap || estimate.estimate.maximumChargeMinor > expected.maximumBudgetMinor)
    throw new RemoteAiTextClientError(422, 'REMOTE_AI_QUOTE_OVER_CAP_OR_INVALID');
  return estimate;
}
export type EveTextEstimate = RemoteTextEstimate & {
  estimate: RemoteTextEstimate['estimate'] & { expiresAt: number };
  sourceRef: EveEstimateSourceRef; promptDigest: string;
};
export function eveTextEstimateIsCurrent(value: EveTextEstimate | null, now = Date.now()): boolean {
  return value !== null && integer(now) && integer(value.estimate.expiresAt) && value.estimate.expiresAt > now;
}
/** Read-only comparison. This reader never accepts an approval or an execution. */
export function readEveTextEstimate(value: unknown, expected: {
  sourceRef: EveEstimateSourceRef; promptDigest: string; currency?: string; model?: string;
  outputTokenLimit: number; comparisonCapMinor: number | null;
}): EveTextEstimate {
  const estimate = readEstimateShape(value, expected);
  const categories = new Set(estimate.unitRates.map((rate) => rate.category));
  if (!object(value) || !object(value.sourceRef) || value.estimateOnly !== true ||
    ![2, 4].includes(estimate.unitRates.length) || categories.size !== estimate.unitRates.length ||
    !categories.has('ordinary-input') || !categories.has('output') ||
    value.executionAuthorized !== false || value.providerSubmission !== 'not_performed' ||
    value.userCapMinor !== expected.comparisonCapMinor || !digest(value.promptDigest) ||
    value.promptDigest !== expected.promptDigest ||
    Object.keys(value.sourceRef).length !== 5 ||
    value.sourceRef.jobId !== expected.sourceRef.jobId || value.sourceRef.revision !== expected.sourceRef.revision ||
    value.sourceRef.builder !== expected.sourceRef.builder || !digest(value.sourceRef.sourceSha256) ||
    value.sourceRef.sourceSha256 !== expected.sourceRef.sourceSha256 || !Array.isArray(value.sourceRef.materialSha256) ||
    value.sourceRef.materialSha256.length !== 2 || value.sourceRef.materialSha256.some((item, i) =>
      !digest(item) || item !== expected.sourceRef.materialSha256[i]) ||
    estimate.withinUserCap !== (expected.comparisonCapMinor === null || estimate.estimate.maximumChargeMinor <= expected.comparisonCapMinor)) invalid();
  if (!eveTextEstimateIsCurrent(value as EveTextEstimate)) invalid();
  return value as EveTextEstimate;
}
export function readRemoteTextExecution(value: unknown, expected: { parentJobId: string; requestId?: string; requestDigest?: string; previous?: RemoteTextExecution }): RemoteTextExecution {
  if (!object(value) || !identifier(value.id) || value.parentJobId !== expected.parentJobId || !identifier(value.requestId) ||
    !digest(value.approvalDigest) || !integer(value.parentBudgetLimitMinor) ||
    !['quoted', 'reserved', 'sending', 'completed', 'unreconciled', 'cancelled', 'expired'].includes(String(value.state)) ||
    !object(value.quote) || !ceiling(value.quote.ceiling) || !digest(value.quote.requestDigest) ||
    !integer(value.quote.createdAt) || !integer(value.quote.expiresAt) || !integer(value.quote.approvedCapMinor) ||
    !integer(value.createdAt) || !integer(value.updatedAt) ||
    (value.resultText !== null && typeof value.resultText !== 'string') ||
    (value.errorCode !== undefined && value.errorCode !== null && typeof value.errorCode !== 'string') ||
    (value.saveResult !== undefined && typeof value.saveResult !== 'boolean') ||
    (value.settledMinor !== undefined && value.settledMinor !== null && !integer(value.settledMinor))) invalid();
  if (value.usage !== undefined && value.usage !== null && (!object(value.usage) ||
    !['inputTokens', 'outputTokens'].every((key) => integer((value.usage as Record<string, unknown>)[key])) ||
    !['cachedInputTokens', 'cacheWriteInputTokens'].every((key) => (value.usage as Record<string, unknown>)[key] === null || integer((value.usage as Record<string, unknown>)[key])) ||
    (value.usage.totalTokens !== undefined && !integer(value.usage.totalTokens)))) invalid();
  if (value.price !== undefined && value.price !== null) {
    if (!object(value.price)) invalid();
    if (value.price.status === 'unreconciled') { if (!nonempty(value.price.reason)) invalid(); }
    else if ((value.price.status !== undefined && value.price.status !== 'priced') || !integer(value.price.chargeMinor) ||
      !currency(value.price.currency) || !nonempty(value.price.pricingVersion) || !Array.isArray(value.price.items) ||
      !value.price.items.every((item) => object(item) && nonempty(item.category) && integer(item.tokens) && integer(item.rateMinorMicrosPerMillionTokens))) invalid();
  }
  if (value.spending !== undefined && (!object(value.spending) || !currency(value.spending.currency) ||
    !nonempty(value.spending.status) || !nonempty(value.spending.providerMeter) || !integer(value.spending.reservedMaximumMinor) ||
    typeof value.spending.invoiceVerified !== 'boolean' ||
    !['currentChargeMinor', 'currentEstimateMinor', 'estimateUpdatedAt'].every((key) => value.spending && ((value.spending as Record<string, unknown>)[key] === null || integer((value.spending as Record<string, unknown>)[key]))) ||
    (value.spending.estimateBasis !== null && typeof value.spending.estimateBasis !== 'string'))) invalid();
  const record = value as RemoteTextExecution;
  if ((expected.requestId !== undefined && record.requestId !== expected.requestId) ||
    (expected.requestDigest !== undefined && record.quote.requestDigest !== expected.requestDigest)) invalid();
  const previous = expected.previous;
  if (previous && (record.id !== previous.id || record.requestId !== previous.requestId ||
    record.approvalDigest !== previous.approvalDigest || record.parentBudgetLimitMinor !== previous.parentBudgetLimitMinor ||
    record.quote.requestDigest !== previous.quote.requestDigest || record.quote.approvedCapMinor !== previous.quote.approvedCapMinor ||
    record.quote.createdAt !== previous.quote.createdAt || record.quote.expiresAt !== previous.quote.expiresAt ||
    record.saveResult !== previous.saveResult || Object.keys(previous.quote.ceiling).some((key) =>
      record.quote.ceiling[key as keyof typeof record.quote.ceiling] !== previous.quote.ceiling[key as keyof typeof previous.quote.ceiling]))) invalid();
  return record;
}
export function readRemoteTextList(value: unknown, parentJobId: string): { executions: RemoteTextExecution[]; executionAvailable: boolean } {
  if (!object(value) || !Array.isArray(value.executions) || typeof value.executionAvailable !== 'boolean') invalid();
  const executions = value.executions.map((item) => readRemoteTextExecution(item, { parentJobId }));
  if (new Set(executions.map((item) => item.id)).size !== executions.length) invalid();
  return { executions, executionAvailable: value.executionAvailable };
}
