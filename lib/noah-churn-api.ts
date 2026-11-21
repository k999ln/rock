import {
  BILLING_CHURN_REPORT_PATH,
  BILLING_CHURN_REPORT_SUBJECT,
  createBillingToken,
} from './billing-token.ts';
import type { ChurnReport } from './churn-cohort.ts';
import { ownerScopeFor } from './owner-intent.ts';

export type NoahChurnResult = { report: ChurnReport | null; ownerScope: string };

type Dependencies = {
  authenticate: (request: Request) => Promise<string>;
  reviewers: readonly string[];
  billingUrl?: string;
  secret?: string;
  fetch?: typeof fetch;
};

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' },
  });
}

export function createNoahChurnApi(deps: Dependencies) {
  return async (request: Request) => {
    try {
      const user = await deps.authenticate(request);
      if (!deps.reviewers.includes(user)) return json({ error: '見つかりません。' }, 404);
      const ownerScope = await ownerScopeFor(user);
      if (!deps.billingUrl || !deps.secret) return json({ report: null, ownerScope });

      const url = new URL(BILLING_CHURN_REPORT_PATH, deps.billingUrl);
      if (url.protocol !== 'https:' &&
          !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
        throw new Error('BILLING_NOT_CONFIGURED');
      }
      const token = await createBillingToken(BILLING_CHURN_REPORT_SUBJECT, deps.secret);
      const result = await (deps.fetch ?? fetch)(url, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        cache: 'no-store',
      });
      if (!result.ok) throw new Error('CHURN_REPORT_UNAVAILABLE');
      return json({ report: await result.json() as ChurnReport, ownerScope } satisfies NoahChurnResult);
    } catch (error) {
      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        return json({ error: '見つかりません。' }, 404);
      }
      return json({ error: '離脱率を確認できません。時間をおいて再試行してください。' }, 503);
    }
  };
}
