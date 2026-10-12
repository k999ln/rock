/**
 * Remote model and agent calls can incur provider charges. Keep this closed
 * until trusted rate cards/quotes, per-user budget authorization, and final
 * usage reconciliation are connected to the same execution path.
 */
export function remoteAiPricingGateAccepted() {
  return false;
}

export function remoteAiTextExecutionAvailable(runtime: {
  SKY_REMOTE_LLM_ENABLED?: string;
  OPENAI_API_KEY?: string;
  REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY?: string;
}) {
  return remoteAiPricingGateAccepted() && runtime.SKY_REMOTE_LLM_ENABLED === 'true' &&
    typeof runtime.OPENAI_API_KEY === 'string' && runtime.OPENAI_API_KEY.length > 0 &&
    typeof runtime.REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY === 'string' &&
    /^[a-f0-9]{64}$/i.test(runtime.REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY);
}

export function remoteAiPricingUnavailable() {
  return Response.json(
    {
      error: 'クラウドAIの料金見積・支出上限・利用明細が接続されるまで外部実行できません。入力はProviderへ送信していません。',
      code: 'REMOTE_AI_PRICING_GATE_UNAVAILABLE',
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
