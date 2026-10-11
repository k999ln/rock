import { experimental_evaluate as evaluate } from 'ai';
import { JEV_MODEL } from './jev-evaluation.ts';

export type JevEvaluate = typeof evaluate;
type JevQuestions = Parameters<JevEvaluate>[0]['questions'];

const JEV_TIMEOUT_MS = 20_000;

/** Transport only. Callers retain their consent, routing and answer contracts. */
export function evaluateJev(
  request: { apiKey: string; state: string; questions: JevQuestions },
  evaluateFn: JevEvaluate = evaluate,
) {
  if (!request.apiKey) throw new Error('TYPE_SAFE_JEV_UNAVAILABLE');
  return boundedEvaluation(request, evaluateFn);
}

async function boundedEvaluation(
  request: { apiKey: string; state: string; questions: JevQuestions },
  evaluateFn: JevEvaluate,
) {
  const abortSignal = AbortSignal.timeout(JEV_TIMEOUT_MS);
  let onAbort: () => void = () => undefined;
  const deadline = new Promise<never>((_, reject) => {
    onAbort = () => reject(abortSignal.reason);
    abortSignal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    // Also bound local waiting if a provider adapter fails to honor cancellation.
    // Aborting is not proof that the remote provider performed no work.
    return await Promise.race([evaluateFn({
      model: JEV_MODEL,
      state: request.state,
      questions: request.questions,
      maxRetries: 0,
      abortSignal,
      headers: { Authorization: `Bearer ${request.apiKey}` },
      providerOptions: { gateway: { zeroDataRetention: true } },
    }), deadline]);
  } finally {
    abortSignal.removeEventListener('abort', onAbort);
  }
}
