import { CloudWork } from './cloud-work.mjs';
import { withinFreeTrialBudget } from './guide.mjs';

const reference =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const genericNotice = '定期便のお知らせがあります。';

// Only the operator's private service binding can enter this namespace.
// One assignment owns its alarm; a manual text job never occupies its slot.
export class DistributionWork extends CloudWork {
  packages() {
    return [
      {
        id: 'distribution-notice',
        name: '定期便のお知らせ',
        routes: [{ id: 'noah', kind: 'noah', label: 'Noah', binding: 'SELF' }],
      },
    ];
  }
  async fetch(request) {
    const input = await request.json();
    const owner = request.headers.get('X-Trial-Owner');
    if (
      !reference.test(input.id) ||
      !owner ||
      !/^[a-zA-Z0-9._:-]{1,128}$/.test(owner)
    )
      return Response.json({}, { status: 400 });
    const action = new URL(request.url).pathname;
    if (action === '/state') {
      const job = await this.storage.get('run:' + input.id);
      if (!job || job.owner !== owner)
        return Response.json({}, { status: 404 });
      return Response.json({
        id: job.id,
        state: job.state,
        attempts: job.attempts,
        resultId: job.resultId,
        readyAt: job.readyAt,
        usageYen: job.usageYen,
      });
    }
    if (!['/start', '/stop'].includes(action))
      return Response.json({}, { status: 404 });
    return super.fetch(
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({
          id: input.id,
          agent: 'distribution-notice',
          route: 'noah',
          text: input.id,
        }),
      }),
    );
  }
  async advance(job) {
    const permit = await this.permit(job.owner, job.agent, job.route);
    if (
      !permit.active ||
      !permit.enrollment ||
      permit.enrollment !== job.enrollment ||
      !permit.device ||
      permit.device !== job.device ||
      !withinFreeTrialBudget(permit.quote)
    )
      return {
        state: 'stopped',
        note: '回線または0円の実行資格が失効しました。',
      };
    return {
      state: 'completed',
      result: genericNotice,
      resultId: 'notice:' + job.id,
      readyAt: Date.now(),
      usageYen: 0,
      report: {
        done: ['本人用の定期便のお知らせを作成しました。'],
        incomplete: [],
        unverified: ['物品の到着は本人の受取申告で確認します。'],
      },
    };
  }
}

export async function dispatchNotice(request, env) {
  if (!env.LINE || !env.NOTICES) return Response.json({}, { status: 503 });
  if (request.method !== 'POST') return Response.json({}, { status: 405 });
  const { owner, id } = await request.json();
  const path = new URL(request.url).pathname;
  if (
    path === '/eligible' &&
    typeof owner === 'string' &&
    /^[a-zA-Z0-9._:-]{1,128}$/.test(owner)
  ) {
    const line = await env.LINE.fetch('https://line.invalid/permit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner,
        agent: 'distribution-notice',
        route: 'noah',
      }),
    });
    if (!line.ok) return Response.json({}, { status: 503 });
    const permit = await line.json();
    return Response.json({
      eligible:
        permit.active === true &&
        !!permit.enrollment &&
        !!permit.device &&
        withinFreeTrialBudget(permit.quote),
    });
  }
  if (
    !['/start', '/state', '/stop'].includes(path) ||
    !reference.test(id) ||
    typeof owner !== 'string' ||
    !/^[a-zA-Z0-9._:-]{1,128}$/.test(owner)
  )
    return Response.json({}, { status: 400 });
  const job = env.NOTICES.get(
    env.NOTICES.idFromName(JSON.stringify([owner, id])),
  );
  return job.fetch('https://notice.invalid' + path, {
    method: 'POST',
    headers: { 'X-Trial-Owner': owner },
    body: JSON.stringify({ id }),
  });
}
export default { fetch: dispatchNotice };
