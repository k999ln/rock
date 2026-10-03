import { experimental_evaluate as evaluate } from 'ai';
import { JEV_MODEL } from './jev-evaluation.ts';

export type JevEvaluate = typeof evaluate;
type JevQuestions = Parameters<JevEvaluate>[0]['questions'];

/** Transport only. Callers retain their consent, routing and answer contracts. */
export function evaluateJev(
  request: { apiKey: string; state: string; questions: JevQuestions },
  evaluateFn: JevEvaluate = evaluate,
) {
  if (!request.apiKey) throw new Error('TYPE_SAFE_JEV_UNAVAILABLE');
  return evaluateFn({
    model: JEV_MODEL,
    state: request.state,
    questions: request.questions,
    maxRetries: 0,
    headers: { Authorization: `Bearer ${request.apiKey}` },
    providerOptions: { gateway: { zeroDataRetention: true } },
  });
}
