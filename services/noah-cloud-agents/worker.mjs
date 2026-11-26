import { eveChat } from './eve-chat.mjs';
import { DurableObject } from 'cloudflare:workers';
import { NOAH_CLOUD_PROFILES as profiles, NOAH_CLOUD_LIMITS as limits, NOAH_EVE_HERMES_PROJECT, NOAH_EVE_ADVICE_PURPOSE, NOAH_FREE_CLOUD_LIMITS, NOAH_CLOUD_RESET_TEXT, noahCloudDailyNeurons, noahCloudSupported, NOAH_CLOUD_MODEL, noahCloudId, noahCloudDigest, noahCloudModelInput, noahCloudResult } from '../../lib/noah-cloud-contract.ts';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
const terminal = state => ['returned', 'failed', 'cancelled', 'unknown'].includes(state);
const rpc = (stub, body) => stub.fetch('https://runtime.internal/', { method: 'POST', body: JSON.stringify(body) });
async function read(request, max = 32768) {
  const reader = request.body?.getReader(); if (!reader) throw Error('empty');
  const chunks = []; let size = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) throw Error('large'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
const jobStub = (env, owner, id) => env.JOBS.getByName(`${owner}:${id}`);
function validTrial(trial) {
  return trial && Number.isSafeInteger(trial.ms) && trial.ms >= 1 && trial.ms <= limits.seconds * 1000
    && Number.isSafeInteger(trial.expiresAt) && trial.expiresAt <= Date.now() + limits.seconds * 1000 + 5000;
}

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/health' && request.method === 'GET') return json({ service: 'noah-cloud-agents', protocol: 1 });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/rpc' || request.headers.has('origin')) return json({ error: 'not_found' }, 404);
    const key = env.NOAH_CLOUD_KEY;
    if (typeof key !== 'string' || key.length < 32 || await noahCloudDigest(request.headers.get('authorization') ?? '') !== await noahCloudDigest(`Bearer ${key}`)) return json({ error: 'unauthorized' }, 401);
    try {
      const body = await read(request);
      if (body?.action === 'chat') return await eveChat(body, env, ctx);
      if (!body || !/^[a-f0-9]{64}$/.test(body.owner) || !/^project-[a-f0-9]{64}$/.test(body.project) || !Object.hasOwn(profiles, body.profile) || !['status', 'connect', 'disconnect', 'start', 'job', 'stop'].includes(body.action)) return json({ error: 'invalid_request' }, 400);
      if (body.trial !== undefined && (body.action !== 'start' || !validTrial(body.trial))) return json({ error: 'invalid_trial' }, 400);
      if (body.purpose !== undefined && (body.action !== 'start' || body.purpose !== NOAH_EVE_ADVICE_PURPOSE || env.NOAH_CLOUD_MODE !== 'free' || body.profile !== 'hermes' || body.project !== NOAH_EVE_HERMES_PROJECT || (body.mode !== undefined && body.mode !== 'run'))) return json({ error: 'invalid_purpose' }, 400);
      if (!noahCloudSupported(env.NOAH_CLOUD_MODE).includes(body.profile)) return json({ error: 'このAgentは無料クラウドの対応準備中です。' }, 403);
      if (['connect', 'start'].includes(body.action) && body.distribution !== profiles[body.profile].sha256) return json({ error: 'Agentの配布版が更新されました。画面を読み直してください。' }, 409);
      return await rpc(env.CONNECTIONS.getByName(`${body.owner}:${body.project}:${body.profile}`), body);
    } catch { return json({ error: 'runtime_unavailable' }, 503); }
  },
};

/** Serial global admission prevents anonymous owners from bypassing the finite operator budget. */
export class NoahCloudBudget extends DurableObject {
  async fetch(request) {
    const input = await request.json();
    return this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
      const free = this.env.NOAH_CLOUD_MODE === 'free';
      const quota = free ? NOAH_FREE_CLOUD_LIMITS : limits;
      let state = await this.ctx.storage.get('budget');
      if (!state || state.day !== day) state = { day, jobs: 0, probes: 0, owners: {}, neurons: 0, ownerNeurons: {}, leases: state?.leases ?? {}, chatIds: state?.chatIds ?? {} };
      state.neurons ??= 0; state.ownerNeurons ??= {}; state.chatIds ??= {};
      for (const [id, at] of Object.entries(state.chatIds)) if (at < now - 86400000) delete state.chatIds[id];
      if (input.action === 'admit-chat' && state.chatIds[input.id]) return json({ error: 'chat_already_admitted' }, 409);
      for (const [id, lease] of Object.entries(state.leases)) if (lease.until <= now) delete state.leases[id];
      if (input.action === 'release') { delete state.leases[input.id]; await this.ctx.storage.put('budget', state); return json({ ok: true }); }
      // 使ったモデルの量（neuron）を足す。受け付けた時の取り置きは、使った分だけ減らす（取り置きと使った分の合計は、1 日の上限を超えない）。
      if (input.action === 'use') {
        if (!Number.isSafeInteger(input.neurons) || input.neurons < 0 || input.neurons > 1000000 || !/^[a-f0-9]{64}$/.test(input.owner ?? '')) return json({ error: 'invalid_usage' }, 400);
        state.neurons += input.neurons;
        state.ownerNeurons[input.owner] = (state.ownerNeurons[input.owner] ?? 0) + input.neurons;
        const lease = state.leases[input.id];
        if (lease?.reserve) lease.reserve = Math.max(0, lease.reserve - input.neurons);
        await this.ctx.storage.put('budget', state); return json({ ok: true });
      }
      if (state.leases[input.id]) return json({ ok: true });
      if (Object.keys(state.leases).length >= limits.concurrent || (input.mode === 'run' ? state.jobs >= quota.dailyJobs || (state.owners[input.owner] ?? 0) >= quota.ownerDailyJobs : state.probes >= 100)) return json({ error: 'クラウドの利用枠が埋まっています。時間をおいて再試行してください。' }, 429);
      // 無料のクラウド: 1 件の上限の分を取り置けるかで受け付ける（全体の 1 日・本人の 1 日）。
      if (free && input.mode === 'run') {
        const leases = Object.values(state.leases);
        const reserved = leases.reduce((sum, lease) => sum + (lease.reserve ?? 0), 0);
        const ownerReserved = leases.filter(lease => lease.owner === input.owner).reduce((sum, lease) => sum + (lease.reserve ?? 0), 0);
        if (state.neurons + reserved + quota.jobNeurons > noahCloudDailyNeurons(this.env.NOAH_CLOUD_DAILY_NEURONS)) return json({ error: `今日の無料のクラウドの枠を使い切りました。${NOAH_CLOUD_RESET_TEXT}に戻ります。` }, 429);
        if ((state.ownerNeurons[input.owner] ?? 0) + ownerReserved + quota.jobNeurons > quota.ownerDailyNeurons) return json({ error: `今日のあなたの無料のクラウドの枠を使い切りました。${NOAH_CLOUD_RESET_TEXT}に戻ります。` }, 429);
      }
      if (input.action === 'admit-chat') state.chatIds[input.id] = now;
      if (input.mode === 'run') { state.jobs++; state.owners[input.owner] = (state.owners[input.owner] ?? 0) + 1; } else state.probes++;
      state.leases[input.id] = { until: now + (limits.seconds + 30) * 1000, owner: input.owner, ...(free && input.mode === 'run' ? { reserve: quota.jobNeurons } : {}) };
      await this.ctx.storage.put('budget', state); return json({ ok: true });
    });
  }
}

export class NoahCloudConnection extends DurableObject {
  async fetch(request) {
    const input = await request.json();
    // Only short storage/RPC admission operations run in this section; execution never does.
    return this.ctx.blockConcurrencyWhile(async () => {
      let state = await this.ctx.storage.get('connection');
      const fetchJob = async id => {
        const response = await rpc(jobStub(this.env, input.owner, id), { action: 'get' });
        return response.ok ? response.json() : null;
      };
      if (state?.state === 'preparing') {
        const probe = await fetchJob(state.probeId);
        if (!probe || terminal(probe.state)) {
          state = { ...state, revision: state.revision + 1, state: probe?.state === 'returned' ? 'connected' : 'failed', ...(probe?.error ? { error: probe.error } : !probe ? { error: '接続確認の期限が切れました。接続し直してください。' } : {}) };
          await this.ctx.storage.put('connection', state);
        }
      }
      if (input.action === 'status') return json({ connection: state ?? null, ...(input.checkTrial === true ? { trialProtocol: 1 } : {}) });
      if (['job', 'stop'].includes(input.action)) {
        if (!state || !state.jobs.includes(input.jobId)) return json({ error: 'not_found' }, 404);
        return rpc(jobStub(this.env, input.owner, input.jobId), { action: input.action === 'job' ? 'get' : 'stop' });
      }
      if (input.action === 'disconnect') {
        if (!state) return json({ connection: null });
        // Close the admission gate before stopping any already-admitted job.
        state = { ...state, state: 'disconnected', revision: state.revision + 1 };
        await this.ctx.storage.put('connection', state);
        for (const id of [state.probeId, state.activeJob].filter(Boolean)) {
          const stopped = await rpc(jobStub(this.env, input.owner, id), { action: 'stop' });
          if (stopped.status === 404) continue;
          if (!stopped.ok || (await stopped.json()).state === 'unknown') return json({ error: '停止を確認できません。再試行してください。', connection: state }, 503);
        }
        return json({ connection: state });
      }
      if (input.action === 'connect') {
        if (!noahCloudId(input.id)) return json({ error: 'invalid_id' }, 400);
        if (state?.id === input.id || ['preparing', 'connected'].includes(state?.state)) return json({ connection: state });
        const probeId = crypto.randomUUID();
        const result = await rpc(jobStub(this.env, input.owner, probeId), { action: 'start', owner: input.owner, id: probeId, mode: 'probe', profile: input.profile, prompt: '' });
        if (!result.ok) return result;
        state = { id: input.id, profile: input.profile, state: 'preparing', revision: (state?.revision ?? 0) + 1, probeId, activeJob: null, jobs: state?.jobs ?? [] };
        await this.ctx.storage.put('connection', state); return json({ connection: state }, 202);
      }
      if (input.action === 'start') {
        if (!noahCloudId(input.jobId) || typeof input.prompt !== 'string' || !input.prompt.trim() || new TextEncoder().encode(input.prompt).length > limits.promptBytes) return json({ error: '依頼は12,000バイト以内で入力してください。' }, 400);
        const start = { action: 'start', owner: input.owner, id: input.jobId, mode: 'run', profile: input.profile, prompt: input.prompt, receipt: input.receipt, purpose: input.purpose, trial: input.trial };
        if (state?.jobs.includes(input.jobId)) {
          // A remembered ID must never recreate an expired or never-admitted job.
          if (!await fetchJob(input.jobId)) return json({ error: 'この依頼IDでは実行を再開できません。新しい依頼として送信してください。' }, 409);
          return rpc(jobStub(this.env, input.owner, input.jobId), start);
        }
        if (state?.state !== 'connected' || input.connectionId !== state.id) return json({ error: 'もう一度接続してください。' }, 409);
        if (state.activeJob) {
          const active = await fetchJob(state.activeJob);
          if (active && !terminal(active.state)) return json({ error: '前の依頼が終わるか、停止するまで待ってください。' }, 409);
        }
        // Persist ownership before dispatch so a lost response can still be polled/stopped.
        state = { ...state, activeJob: input.jobId, jobs: [input.jobId, ...state.jobs].slice(0, 20), revision: state.revision + 1 };
        await this.ctx.storage.put('connection', state);
        return rpc(jobStub(this.env, input.owner, input.jobId), start);
      }
      return json({ error: 'invalid_action' }, 400);
    });
  }
}

export class NoahCloudJob extends DurableObject {
  running = false;
  async fetch(request) {
    const input = await request.json();
    if (input.action === 'start') {
      const response = await this.ctx.blockConcurrencyWhile(async () => {
        const identity = [input.owner, input.id, input.profile, profiles[input.profile].sha256, input.mode, input.prompt];
        if (input.purpose !== undefined) {
          if (input.purpose !== NOAH_EVE_ADVICE_PURPOSE || this.env.NOAH_CLOUD_MODE !== 'free' || input.profile !== 'hermes' || input.mode !== 'run') return json({ error: 'invalid_purpose' }, 400);
          identity.push(input.purpose);
        }
        if (input.trial !== undefined) {
          if (input.mode !== 'run' || !validTrial(input.trial)) return json({ error: 'invalid_trial' }, 400);
          identity.push('first-earning', input.trial.ms, input.trial.expiresAt);
        }
        const fingerprint = await noahCloudDigest(JSON.stringify(identity));
        const previous = await this.ctx.storage.get('job');
        if (previous) return previous.fingerprint === fingerprint ? json(this.view(previous)) : json({ error: '同じ依頼IDの内容は変更できません。' }, 409);
        if (input.receipt !== undefined && (typeof input.receipt !== 'string' || !/^[\w-]{40,2048}$/.test(input.receipt))) return json({ error: 'invalid_receipt' }, 400);
        if (input.trial && Date.now() >= input.trial.expiresAt) return json({ error: 'この実行枠の受付期限を過ぎました。', trialNotStarted: true }, 409);
        const budget = await rpc(this.env.BUDGET.getByName('global'), { action: 'admit', id: `${input.owner}:${input.id}`, owner: input.owner, mode: input.mode });
        if (!budget.ok) {
          if (!input.trial) return budget;
          const error = await budget.json();
          // Record the refusal on the job itself before telling Sites it can
          // release the reservation. A lost response cannot start this ID later.
          await this.ctx.storage.put('job', { id: input.id, owner: input.owner, profile: input.profile, version: profiles[input.profile].version, distribution: profiles[input.profile].sha256, mode: input.mode, purpose: input.purpose, fingerprint, state: 'failed', calls: 0, activeMs: 0, createdAt: Date.now(), completedAt: Date.now(), deadlineAt: input.trial.expiresAt, error: error.error });
          await this.ctx.storage.setAlarm(Date.now() + 86400000);
          return json({ ...error, trialNotStarted: true }, budget.status);
        }
        const at = Date.now();
        const deadlineAt = input.trial ? Math.min(at + input.trial.ms, input.trial.expiresAt) : at + limits.seconds * 1000;
        const job = { id: input.id, owner: input.owner, profile: input.profile, version: profiles[input.profile].version, distribution: profiles[input.profile].sha256, mode: input.mode, ...(input.purpose ? { purpose: input.purpose } : {}), ...(input.trial ? { trial: input.trial } : {}), fingerprint, prompt: input.prompt, receipt: input.receipt, state: 'queued', createdAt: at, deadlineAt, calls: 0 };
        await this.ctx.storage.put('job', job); await this.ctx.storage.setAlarm(job.deadlineAt);
        await this.schedule(job);
        return json(this.view(job), 202);
      });
      return response;
    }
    let job = await this.ctx.storage.get('job');
    if (!job) return json({ error: 'not_found' }, 404);
    if (input.action === 'stop' && !terminal(job.state)) await this.end('cancelled', '本人の操作で停止しました。');
    // A restarted coordinator never blindly replays an admitted command.
    else if (!terminal(job.state) && !this.running) await this.recover(job);
    job = await this.ctx.storage.get('job'); return json(this.view(job));
  }
  view({ owner: _owner, prompt: _prompt, fingerprint: _fingerprint, receipt: _receipt, delivered: _delivered, trial: _trial, startedAt: _startedAt, ...job }) { return job; }
  async schedule() { this.running = true; this.ctx.waitUntil(this.execute().finally(() => { this.running = false; })); }
  async recover() { await this.end('unknown', '実行環境が再起動しました。結果を確認できないため再実行していません。'); }
  async stopRuntime(state) { await this.ctx.container.destroy(state); }
  async end(state, error, result) {
    const changed = await this.ctx.blockConcurrencyWhile(async () => {
      const job = await this.ctx.storage.get('job'); if (!job || terminal(job.state)) return false;
      const stoppedAt = Date.now();
      // Serialize destruction with the only start and all state writes. Bound this short gate.
      let timer;
      try { await Promise.race([this.stopRuntime(state), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('stop_timeout')), 10000); })]); }
      catch { state = 'unknown'; error = '実行環境の停止を確認できませんでした。'; result = undefined; }
      finally { clearTimeout(timer); }
      const activeMs = job.trial && state !== 'unknown'
        ? Math.max(0, Math.min(job.deadlineAt, stoppedAt) - (job.startedAt ?? job.deadlineAt)) : undefined;
      await this.ctx.storage.put('job', { ...job, state, completedAt: Date.now(), ...(activeMs !== undefined ? { activeMs } : {}), ...(error ? { error } : {}), ...(result ? { result } : {}) });
      if (state !== 'unknown') await rpc(this.env.BUDGET.getByName('global'), { action: 'release', id: `${job.owner}:${job.id}` });
      await this.ctx.storage.setAlarm(Date.now() + 60000);
      return true;
    });
    if (changed) await this.deliver();
  }
  async deliver() {
    const job = await this.ctx.storage.get('job'); if (!job || !terminal(job.state)) return;
    if (job.receipt && !job.delivered) {
      try {
        const response = await fetch('https://avoado.si/api/noah/cloud-agents/result', { method: 'POST', headers: { Authorization: `Bearer ${this.env.NOAH_CLOUD_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket: job.receipt, job: this.view(job) }), redirect: 'manual', signal: AbortSignal.timeout(10000) });
        const saved = response.ok && (await read(response, 4096)).saved === true;
        await response.body?.cancel().catch(() => {});
        if (saved) await this.ctx.storage.put('job', { ...job, delivered: true });
      } catch { /* The alarm retries delivery only, never the Agent or model. */ }
    }
    const latest = await this.ctx.storage.get('job');
    await this.ctx.storage.setAlarm(Date.now() + (latest?.receipt && !latest.delivered ? 600000 : 86400000));
  }
  async alarm() {
    const job = await this.ctx.storage.get('job'); if (!job) return;
    if (terminal(job.state)) {
      if (Date.now() - job.completedAt >= (job.receipt && !job.delivered ? 30 : 1) * 86400000) await this.ctx.storage.deleteAll();
      else await this.deliver();
      return;
    }
    if (Date.now() >= job.deadlineAt) await this.end('failed', '実行時間の上限に達しました。');
    else await this.ctx.storage.setAlarm(job.deadlineAt);
  }
  async execute() {
    try {
      const container = this.ctx.container;
      let job = await this.ctx.blockConcurrencyWhile(async () => {
        const current = await this.ctx.storage.get('job'); if (!current || terminal(current.state)) return null;
        const startedAt = Date.now();
        if (current.trial && startedAt >= current.deadlineAt) return null;
        await this.ctx.storage.put('job', { ...current, state: 'running', startedAt });
        container.start({ image: container.images.base, instance: 'standard-1', enableInternet: false });
        return current;
      });
      if (!job) return;
      await container.setInactivityTimeout((limits.seconds + 15) * 1000);
      const port = container.getTcpPort(8080);
      let healthy = false;
      for (let attempt = 0; attempt < 90; attempt++) {
        job = await this.ctx.storage.get('job'); if (!job || terminal(job.state)) return;
        try { const r = await port.fetch('http://guest/health', { signal: AbortSignal.timeout(1000) }); healthy = r.ok; await r.body?.cancel(); } catch { /* Provisioning is asynchronous. */ }
        if (healthy) break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (!healthy) throw Error('クラウド実行環境の起動を確認できませんでした。');
      const response = await port.fetch('http://guest/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: job.profile, mode: job.mode, prompt: job.prompt }), signal: AbortSignal.timeout(Math.max(1, job.deadlineAt - Date.now())) });
      if (!response.ok) throw Error('公式Agentを起動できませんでした。');
      if (job.mode === 'probe') {
        const result = await read(response, 4096);
        if (result.type !== 'probe' || result.profile !== job.profile || result.version !== job.version) throw Error('公式Agentの版を確認できませんでした。');
        await this.end('returned'); return;
      }
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', result, events = 0;
      try {
        for (;;) {
          const part = await reader.read(); if (part.done) break;
          buffer += decoder.decode(part.value, { stream: true });
          if (new TextEncoder().encode(buffer).length > 262144) throw Error('実行器の応答が上限を超えました。');
          let end;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const event = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
            if (++events > limits.modelCalls + 1 || result) throw Error('実行器の応答順を確認できません。');
            job = await this.ctx.storage.get('job'); if (!job || terminal(job.state)) return;
            if (event.type === 'result') { if (event.version !== job.version) throw Error('配布版が変わりました。'); result = await noahCloudResult(event, job.calls); continue; }
            if (event.type !== 'model_request' || !/^[a-f0-9]{32}$/.test(event.id) || job.calls >= limits.modelCalls) throw Error('モデル呼出の上限または順序を確認してください。');
            const modelInput = noahCloudModelInput(event.body);
            const admitted = await this.ctx.blockConcurrencyWhile(async () => {
              const latest = await this.ctx.storage.get('job'); if (!latest || terminal(latest.state)) return false;
              await this.ctx.storage.put('job', { ...latest, calls: latest.calls + 1 }); return true;
            });
            if (!admitted) return;
            const reply = await this.env.AI.run(NOAH_CLOUD_MODEL, modelInput);
            if (!reply?.choices?.[0]?.message || !['stop', 'tool_calls'].includes(reply.choices[0].finish_reason)) throw Error('モデルが正常な最終応答を返しませんでした。');
            job = await this.ctx.storage.get('job'); if (!job || terminal(job.state)) return;
            const forwarded = await port.fetch('http://guest/model-reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: event.id, body: reply }) });
            if (!forwarded.ok) throw Error('モデル応答を実行器へ渡せませんでした。'); await forwarded.body?.cancel();
          }
        }
      } finally { await reader.cancel().catch(() => {}); }
      if (!result || buffer.trim() || result.exitCode !== 0 || !result.calls || (!result.text.trim() && !result.files.length)) throw Error('Agentが正常な結果を返しませんでした。');
      await this.end('returned', null, result);
    } catch (error) { await this.end('failed', error instanceof Error ? error.message.slice(0, 240) : 'クラウド実行に失敗しました。'); }
  }
}
