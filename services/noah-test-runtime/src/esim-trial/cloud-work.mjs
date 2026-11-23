import { withinFreeTrialBudget } from './guide.mjs';

import { cloudPackages, routeId, parseWorkReport } from './cloud-packages.mjs';

const json = (value, status = 200) => Response.json(value, { status });
const preferredRoute = (routes) => routes.find((r) => r.kind === 'noah');
const validId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const terminal = new Set(['completed', 'stopped', 'attention']);

const freeTerms = 'noah-free-trial/1';
async function offerId(pkg, routes = pkg.routes) {
  const data = [
    pkg.id,
    pkg.name,
    pkg.version ?? null,
    freeTerms,
    routes.map(({ id, kind, label, binding }) => [id, kind, label, binding]),
  ];
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

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
  packages() {
    return cloudPackages(this.env);
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
    const packages = this.packages();
    let selected;
    if (action === '/list' && input.work !== undefined) {
      if (!validId.test(input.work))
        return json({ error: '仕事番号を確認してください。' }, 400);
      selected = await this.storage.get('run:' + input.work);
      if (!selected || selected.owner !== owner)
        return json({ error: 'この仕事は見つかりません。' }, 404);
    }
    const agent = selected?.agent ?? input.agent ?? packages[0]?.id;
    const pkg = packages.find((item) => item.id === agent);
    if (action === '/list') {
      if (!pkg && !selected)
        return json({ error: '利用できるパッケージがありません。' }, 404);
      const ids = selected
        ? [selected.id]
        : ((await this.storage.get('recent')) ?? []);
      const records = selected
        ? new Map([['run:' + selected.id, selected]])
        : ids.length
          ? await this.storage.get(ids.map((id) => 'run:' + id))
          : new Map();
      const terms = pkg ? await offerId(pkg) : null;
      return json({
        offer: terms,
        version: pkg?.version,
        packages: packages.map(({ id, name }) => ({ id, name })),
        agent,
        work: selected?.id,
        automaticRoute: preferredRoute(pkg?.routes ?? [])?.label,
        routes: (pkg?.routes ?? []).map(({ id, label }) => ({ id, label })),
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
            usage: job.usage,
            version: job.version,
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
          if (job.binding === 'AGENT_DESKTOP') {
            await tx.put(key, {
              ...job,
              state: 'stopping',
              note: '専用画面の停止を確認しています。',
            });
            await tx.setAlarm(Date.now() + 250);
            return { stopped: false };
          }
          await tx.put(key, {
            ...job,
            state: 'stopped',
            note: 'Noahの処理と結果照会を停止しました。接続先での中断は未確認です。',
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
        ? preferredRoute(available)
        : available.find((r) => r.id === input.route);
    if (!route) return json({ error: '選択した接続先は利用できません。' }, 422);
    const offer = await offerId(pkg);
    if (
      (route.binding === 'AGENT_DESKTOP' ||
        input.offer !== undefined ||
        this.env.NOAH_AGENT_ROUTES !== undefined) &&
      input.offer !== offer
    )
      return json(
        {
          error: '接続先の版または料金条件が変わりました。開き直してください。',
        },
        409,
      );
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
    const routeOffer = await offerId(pkg, [route]);
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
        version: pkg.version ?? offer,
        routeOffer,
        usage: {
          currency: permit.quote.currency,
          pricingVersion: freeTerms,
          maximumMinor: permit.quote.customerMinor,
          external: route.kind !== 'noah',
          completedRuns: null,
          amountMinor: null,
        },
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
      next = {
        state: job.state === 'stopping' ? 'stopping' : 'waiting',
        note: '同じ接続先で状態を再確認します。',
      };
    }
    await this.storage.transaction(async (tx) => {
      const current = await tx.get(key);
      if (
        !current ||
        terminal.has(current.state) ||
        (current.state === 'stopping' && job.state !== 'stopping') ||
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
    // Namespace provider IDs by account. The upstream receives no account or eSIM credentials.
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify([job.owner, job.id])),
    );
    const reference = Array.from(new Uint8Array(digest), (n) =>
      n.toString(16).padStart(2, '0'),
    ).join('');
    const url = 'https://agent.invalid/jobs/' + reference;
    const headers =
      job.binding === 'AGENT_DESKTOP'
        ? { 'X-Noah-Desktop-Package': job.version }
        : {};
    const options = {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    };
    if (job.state === 'stopping') {
      const binding = this.env.AGENT_DESKTOP;
      const response = binding && await binding.fetch(url, { ...options, method: 'DELETE' });
      if (response?.status === 204) return { state: 'stopped', note: '専用画面の停止を確認しました。' };
      // The guest can finish before the stop arrives. Recover its original
      // receipt through the same entitlement and result checks as polling.
      if (response?.status === 200) return this.receive(job, reference, response);
      if (response && response.status >= 400 && response.status < 500 && response.status !== 429)
        return { state: 'attention', note: '元の依頼の結果と停止状態を確認してください。' };
      return { state: 'stopping', note: '専用画面の停止を確認しています。' };
    }
    const permit = await this.permit(job.owner, job.agent, job.route);
    if (
      !permit.active ||
      permit.enrollment !== job.enrollment ||
      permit.device !== job.device ||
      !withinFreeTrialBudget(permit.quote)
    )
      return job.binding === 'AGENT_DESKTOP'
        ? {
            state: 'stopping',
            note: '利用権が変更されたため専用画面の停止を確認します。',
          }
        : {
            state: 'stopped',
            note: '回線・利用期限・費用条件を確認してください。',
          };
    const pkg = this.packages().find((item) => item.id === job.agent);
    const registered = pkg?.routes.find(
      (route) => route.id === job.route && route.binding === job.binding,
    );
    if (
      registered &&
      job.routeOffer &&
      (await offerId(pkg, [registered])) !== job.routeOffer
    )
      return {
        state: 'attention',
        note: '登録内容が変わりました。元の依頼と料金条件を確認してください。',
      };
    const binding = registered && this.env[job.binding];
    if (!binding)
      return { state: 'waiting', note: '選択した接続先の復旧を待っています。' };
    let response = await binding.fetch(url, options);
    if (response.status === 404) {
      if (
        (await this.storage.get('active')) !== job.id ||
        (await this.storage.get('run:' + job.id))?.state === 'stopping'
      )
        return { state: 'stopping' };
      // Registered adapters must implement create-if-absent for this same work ID.
      response = await binding.fetch(url, {
        ...options,
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
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
    return this.receive(job, reference, response);
  }
  async receive(job, reference, response) {
    const reader = response.body?.getReader();
    if (!reader)
      return {
        state: 'attention',
        note: '接続先の成功応答に成果がありません。',
      };
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
    let payload;
    try {
      payload = JSON.parse(await new Blob(pieces).text());
    } catch {
      return {
        state: 'attention',
        note: '接続先から読める形式の成果が届きませんでした。',
      };
    }
    if (
      !payload ||
      payload.id !== reference ||
      (payload.final !== undefined && typeof payload.final !== 'boolean') ||
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
        state: job.state === 'stopping' ? 'attention' : job.binding === 'AGENT_DESKTOP' ? 'stopping' : 'stopped',
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
      ...(job.usage
        ? {
            usage: {
              ...job.usage,
              completedRuns: 1,
              // Only the first-party zero-price permit covers the full customer amount.
              // An external adapter's result is not a verified provider invoice.
              amountMinor: job.usage.external
                ? null
                : current.quote.customerMinor,
            },
          }
        : {}),
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
