/**
 * 続けて使う割合（task 103）の入口。GET /api/noah/retention。審査者だけ（それ以外は 404）。
 * 返すのは 2 つの組の数・割合・幅・判定だけ。1 人ずつの行は返さない。5 人未満の組の数は churn-cohort が隠す。
 */
import { NoahAgentError } from './noah-agent-upload.ts';
import { ownerScopeFor } from './owner-intent.ts';
import { noahRetentionReport } from './noah-retention.ts';

export type NoahRetentionApiDependencies = {
  db: Pick<D1Database, 'prepare'>;
  now: () => number;
  authenticate: (request: Request) => Promise<string>;
  reviewers: string[];
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private' } });
const missing = () => json({ error: '見つかりません。' }, 404);

export function createNoahRetentionApi(deps: NoahRetentionApiDependencies) {
  return async (request: Request) => {
    try {
      if (request.method !== 'GET') return json({ error: '対応しない操作です。' }, 405);
      let owner: string;
      try {
        owner = await deps.authenticate(request);
      } catch (error) {
        if (error instanceof Error && error.message === 'UNAUTHORIZED') return missing();
        throw error;
      }
      if (!deps.reviewers.includes(owner)) return missing();
      return json({ ...(await noahRetentionReport(deps.db, deps.now())), ownerScope: await ownerScopeFor(owner) });
    } catch (error) {
      if (error instanceof NoahAgentError) return json({ error: error.message }, error.status);
      return json({ error: '続けて使う割合を集計できません。' }, 500);
    }
  };
}
