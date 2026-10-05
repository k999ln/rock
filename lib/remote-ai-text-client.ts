const messages: Record<string, string> = {
  UNAUTHORIZED: 'サインインの有効期限が切れました。再度サインインして続けてください。',
  SERVICE_ENTITLEMENT_REQUIRED: 'この機能の利用権を確認できません。接続状態を確認してください。',
  RATE_LIMITED: '確認回数が上限に達しました。少し待ってから状態を更新してください。',
  REMOTE_AI_RATE_CARD_UNAVAILABLE: '有効な料金表が未設定か期限切れです。クラウドAIには送信していません。',
  REMOTE_AI_TEXT_RATE_COVERAGE_UNAVAILABLE: 'このモデルの料金確認が完了していません。クラウドAIには送信していません。',
  RATE_CARD_CURRENCY_REQUIRED: '料金表の通貨を選んで、もう一度見積もってください。',
  REMOTE_AI_QUOTE_OVER_CAP_OR_INVALID: '見積が指定した上限を超えているか、入力を確認できません。上限と依頼文を確認してください。',
  QUOTE_CONFLICT: '見積の内容か料金版が変わっています。最新状態を確認して見積を作り直してください。',
  APPROVAL_MISMATCH: '承認する見積を確認できません。最新状態を読み込んでください。',
  BUDGET_UNAVAILABLE: '見積の期限か、同じ仕事の残り予算を確認してください。状態を更新してから進めてください。',
  INVALID_STATE: 'この状態では操作できません。最新状態を読み込んでください。',
  REMOTE_LLM_DISABLED: 'クラウドAIは接続準備中です。実行は開始していません。',
  REMOTE_AI_PRICING_GATE_UNAVAILABLE: 'クラウドAIの料金・実行確認が完了していません。実行は開始していません。',
  UPSTREAM_TIMEOUT: 'クラウドAIの応答が時間内に返りませんでした。再送せず、保存済みの状態を確認してください。',
  NETWORK: '応答を確認できませんでした。再送せず、保存済みの状態を確認してください。',
};
export class RemoteAiTextClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly currencies: string[];
  constructor(status: number, code: string, currencies: string[] = []) {
    super(status === 401 ? messages.UNAUTHORIZED : messages[code] ?? 'クラウドAIの操作を確認できませんでした。保存済みの状態を更新してください。');
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
