import { withinFreeTrialBudget } from './guide.mjs';

import { cloudPackages, routeId, parseWorkReport } from './cloud-packages.mjs';

const json = (value, status = 200) => Response.json(value, { status });
const validId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const terminal = new Set(['completed', 'stopped', 'attention']);

export default {
  async fetch(request, env) {
    if (
      request.method !== 'POST' ||
      !env.BRIDGE ||
      request.headers.get('Authorization') !== 'Bearer ' + env.BRIDGE
    )
      return json({}, 403);
    const owner = request.headers.get('X-Trial-Owner');
    if (!owner || !/^[a-zA-Z0-9._:-]{1,128}$/.test(owner)) return json({}, 403);
    return env.JOBS.get(env.JOBS.idFromName(owner)).fetch(request);
  },
};

// One trial account can run one job at a time. The alarm and active pointer are
// committed alongside the accepted input. Reopening a page only reads storage.
export class CloudWork {
  constructor(ctx, env) {
    this.storage = ctx.storage;
    this.env = env;
  }
  async permit(owner, agent, route) {
    const response = await this.env.LINE.fetch('https://line.invalid/permit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, agent, route }),
    });
    if (!response.ok) throw Error('line unavailable');
    return response.json();
  }
  async fetch(request) {
    const owner = request.headers.get('X-Trial-Owner');
    const action = new URL(request.url).pathname;
    const input = await request.json();
    const packages = cloudPackages(this.env);
    const agent = input.agent ?? packages[0]?.id;
    const pkg = packages.find((item) => item.id === agent);
    if (action === '/list') {
      if (!pkg)
        return json({ error: '利用できるパッケージがありません。' }, 404);
      const ids = (await this.storage.get('recent')) ?? [];
      const records = ids.length
        ? await this.storage.get(ids.map((id) => 'run:' + id))
        : new Map();
      return json({
        packages: packages.map(({ id, name }) => ({ id, name })),
        agent,
        routes: pkg.routes.map(({ id, label }) => ({ id, label })),
        preference: (await this.storage.get('pref:' + agent)) ?? 'auto',
        jobs: ids
          .map((id) => records.get('run:' + id))
          .filter(Boolean)
          .map((job) => ({
            id: job.id,
            agent: job.agent,
            state: job.state,
            route: job.route,
            routeLabel: job.routeLabel,
            result: job.result,
            note: job.note,
            report: job.report,
          })),
      });
    }
    if (!validId.test(input.id))
      return json({ error: '依頼番号を確認してください。' }, 400);
    const key = 'run:' + input.id;
    if (action === '/stop') {
      return json(
        await this.storage.transaction(async (tx) => {
          const job = await tx.get(key);
          if (!job || terminal.has(job.state))
            return { stopped: job?.state === 'stopped' };
          await tx.put(key, {
            ...job,
            state: 'stopped',
            note: 'Noahの処理と結果照会を停止しました。',
          });
          await tx.delete('active');
          await tx.deleteAlarm();
          return { stopped: true };
        }),
      );
    }
    if (
      action !== '/start' ||
      typeof input.text !== 'string' ||
      !input.text.trim() ||
      input.text.length > 500 ||
      !routeId(input.route) ||
      !pkg
    )
      return json(
        { error: '実行先と500文字以内の文章を指定してください。' },
        400,
      );
    const available = pkg.routes;
    const route =
      input.route === 'auto'
        ? (available.find((r) => r.kind === 'provider') ?? available[0])
        : available.find((r) => r.id === input.route);
    if (!route) return json({ error: '選択した接続先は利用できません。' }, 422);
    const permit = await this.permit(owner, agent, route.id);
    if (
      !permit.active ||
      !permit.enrollment ||
      !permit.device ||
      !withinFreeTrialBudget(permit.quote)
    )
      return json(
        { error: '回線または0円の実行条件を確認してください。' },
        403,
      );
    const result = await this.storage.transaction(async (tx) => {
      const existing = await tx.get(key);
      if (existing)
        return existing.agent === agent &&
          existing.text === input.text &&
          existing.preference === input.route
          ? 200
          : 409;
      if (await tx.get('active')) return 409;
      const recent = (await tx.get('recent')) ?? [];
      await tx.put(key, {
        id: input.id,
        owner,
        agent,
        route: route.id,
        routeLabel: route.label,
        binding: route.binding,
        preference: input.route,
        text: input.text,
        enrollment: permit.enrollment,
        device: permit.device,
        state: 'queued',
        attempts: 0,
      });
      await tx.put('recent', [input.id, ...recent].slice(0, 20));
      await tx.put('active', input.id);
      await tx.put('pref:' + agent, input.route);
      await tx.setAlarm(Date.now() + 250);
      return 202;
    });
    return json(
      result < 300
        ? { id: input.id }
        : { error: '実行先・依頼内容・実行中の仕事を確認してください。' },
      result,
    );
  }
  async alarm() {
    const id = await this.storage.get('active');
    if (!id) return;
    const key = 'run:' + id;
    const job = await this.storage.get(key);
    if (!job || terminal.has(job.state)) return;
    await this.storage.setAlarm(Date.now() + 60_000);
    let next;
    try {
      next = await this.advance(job);
    } catch {
      next = { state: 'waiting', note: '同じ接続先で結果を再確認します。' };
    }
    await this.storage.transaction(async (tx) => {
      const current = await tx.get(key);
      if (
        !current ||
        terminal.has(current.state) ||
        (await tx.get('active')) !== id
      )
        return;
      await tx.put(key, {
        ...current,
        ...next,
        attempts: current.attempts + 1,
      });
      if (terminal.has(next.state)) {
        await tx.delete('active');
        await tx.deleteAlarm();
      } else {
        await tx.setAlarm(
          Date.now() +
            Math.min(60_000, 1000 * 2 ** Math.min(current.attempts, 6)),
        );
      }
    });
  }
  async advance(job) {
    const permit = await this.permit(job.owner, job.agent, job.route);
    if (
      !permit.active ||
      permit.enrollment !== job.enrollment ||
      permit.device !== job.device ||
      !withinFreeTrialBudget(permit.quote)
    )
      return {
        state: 'stopped',
        note: '回線・利用期限・費用条件を確認してください。',
      };
    const registered = cloudPackages(this.env)
      .find((pkg) => pkg.id === job.agent)
      ?.routes.find(
        (route) => route.id === job.route && route.binding === job.binding,
      );
    const binding = registered && this.env[job.binding];
    if (!binding)
      return { state: 'waiting', note: '選択した接続先の復旧を待っています。' };
    // Namespace provider IDs by account. The upstream receives no account or eSIM credentials.
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify([job.owner, job.id])),
    );
    const reference = Array.from(new Uint8Array(digest), (n) =>
      n.toString(16).padStart(2, '0'),
    ).join('');
    const url = 'https://agent.invalid/jobs/' + reference;
    const options = { redirect: 'manual', signal: AbortSignal.timeout(8000) };
    let response = await binding.fetch(url, options);
    if (response.status === 404) {
      if ((await this.storage.get('active')) !== job.id)
        return { state: 'stopped' };
      // Registered adapters must implement create-if-absent for this same work ID.
      response = await binding.fetch(url, {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: job.text }),
      });
    }
    if (
      response.status === 202 ||
      response.status === 429 ||
      response.status >= 500
    )
      return {
        state: 'waiting',
        note: '接続先で処理中です。画面を閉じられます。',
      };
    if (!response.ok)
      return {
        state: 'attention',
        note: '接続先が受付を拒否しました。設定を確認してください。',
      };
    const reader = response.body?.getReader();
    if (!reader)
      return { state: 'waiting', note: '成果の到着を待っています。' };
    const pieces = [];
    let bytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 65536) {
        await reader.cancel();
        return { state: 'attention', note: '成果が受取上限を超えています。' };
      }
      pieces.push(chunk.value);
    }
    const payload = JSON.parse(await new Blob(pieces).text());
    if (
      payload.id !== reference ||
      typeof payload.result !== 'string' ||
      !payload.result.trim() ||
      payload.result.length > 2048
    )
      return {
        state: 'attention',
        note: '接続先から有効な成果を確認できませんでした。',
      };
    const current = await this.permit(job.owner, job.agent, job.route);
    if (
      !current.active ||
      current.enrollment !== job.enrollment ||
      current.device !== job.device ||
      !withinFreeTrialBudget(current.quote)
    )
      return {
        state: 'stopped',
        note: '受取前に回線または費用条件が変わりました。',
      };
    const report = parseWorkReport(payload.report);
    if (payload.report !== undefined && !report)
      return {
        state: 'attention',
        note: '接続先の成果内訳を確認できませんでした。',
      };
    if (payload.final === false || report?.incomplete.length) {
      const state = payload.final === true ? 'attention' : 'waiting';
      return {
        state,
        result: payload.result,
        report,
        note:
          state === 'waiting'
            ? '途中成果を保存し、残りを照会しています。'
            : '接続先が一部未達で終了しました。',
      };
    }
    return {
      state: 'completed',
      result: payload.result,
      note: '成果が届きました。',
      report: report ?? {
        done: ['接続先の成果を受信しました。'],
        incomplete: [],
        unverified: ['接続先から作業項目別の内訳は届いていません。'],
      },
    };
  }
}
