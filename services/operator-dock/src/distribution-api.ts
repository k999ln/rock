import { assignDistribution, operatorAssignments } from './distribution.ts';
import { shippingAddress } from './distribution-address.ts';
import { receiveLot, stockLedger } from './distribution-stock.ts';
import {
  createPlan,
  listPlans,
  setPlan,
  type Eligibility,
} from './distribution-plans.ts';
import { OperatorError, uuid } from './validation.ts';

export function lineEligibility(
  agent:
    | { fetch(path: string, init: RequestInit): Promise<Response> }
    | undefined,
) {
  return async (owner: string) => {
    if (!agent)
      throw new OperatorError('配給Agentの接続を準備しています。', 503);
    const response = await agent.fetch('https://notice.invalid/eligible', {
      method: 'POST',
      body: JSON.stringify({ owner }),
    });
    if (!response.ok)
      throw new OperatorError('回線の資格を照合できません。', 503);
    const data = (await response.json()) as { eligible: boolean };
    return data.eligible === true;
  };
}
export function isDistributionApi(path: string) {
  return (
    path === '/api/distributions' || path.startsWith('/api/distributions/')
  );
}
export async function distributionApi(
  db: D1Database,
  path: string,
  method: string,
  input?: unknown,
  eligible?: Eligibility,
) {
  if (path === '/api/distributions') {
    if (method === 'GET') return operatorAssignments(db);
    if (method === 'POST') {
      const row = input as { id?: string; recipient?: string } | null;
      if (
        !(await db
          .prepare('SELECT 1 FROM distribution_assignments WHERE id=?')
          .bind(uuid(row?.id))
          .first())
      ) {
        if (!eligible)
          throw new OperatorError('回線の利用資格を確認できません。', 503);
        if (
          typeof row?.recipient !== 'string' ||
          !(await eligible(row.recipient))
        )
          throw new OperatorError(
            '有効な回線の受取人を指定してください。',
            409,
          );
      }
      return assignDistribution(db, input);
    }
  } else if (path === '/api/distributions/lots') {
    if (method === 'GET') return stockLedger(db);
    if (method === 'POST') return receiveLot(db, input);
  } else if (path === '/api/distributions/plans') {
    if (method === 'GET') return listPlans(db);
    if (method === 'POST') return createPlan(db, input);
  } else if (/^\/api\/distributions\/plans\/[a-fA-F0-9-]{36}$/.test(path)) {
    if (method === 'POST') return setPlan(db, path.split('/').pop()!, input);
  } else if (/^\/api\/distributions\/[a-fA-F0-9-]{36}\/address$/.test(path)) {
    if (method === 'GET') return shippingAddress(db, path.split('/')[3]);
  } else throw new OperatorError('ページが見つかりません。', 404);
  throw new OperatorError('操作を確認してください。', 405);
}
