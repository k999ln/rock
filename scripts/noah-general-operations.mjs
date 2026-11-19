import { createHash, randomBytes } from 'node:crypto';
import { InstallError } from './noah-source-fetch.mjs';
import { executionRequest } from './noah-executions.mjs';
import { canonicalOperationValue, operationUuid, parseOperationRequest, parseOperationRuntimeUpdate, operationRuntimeReplay, operationRuntimeEditable } from '../lib/noah-operation-contract.mjs';
import { isLocalRuntimeHost, isLocalRuntimeRequest } from '../lib/sky-private-loopback.mjs';

export function createGeneralOperations({ executions, now = () => Date.now(), auto = true }) {
  const contexts = new Map(); let closing = false, reserved = false;
  const key = (scope, id) => `${scope}/${id}`;
  async function command(context, action, extra = {}) {
    for (let retry = 0; retry < 4; retry++) {
      const { job } = await context.api('get', { id: context.id });
      try { return await context.api(action, { id: context.id, revision: job.revision, ...extra }); }
      catch (e) { if (e.status !== 409 || retry === 3) throw e; }
    }
  }
  async function stopRecord(context) {
    await command(context, 'pause');
    const { job } = await context.api('get', { id: context.id });
    if (job.noahOperation.active) await executions.stop(context.scope, job.noahOperation.active.jobId, context.work).catch(e => { if (e.status !== 404) throw e; });
    return command(context, 'finishPause');
  }
  const api = {
    view(scope, job) {
      const context = contexts.get(key(scope, job.id)), op = job.noahOperation;
      return { ...job, noahOperation: { ...op, hostState: context?.stopping ? 'stopping' : context?.failed ? 'unavailable' : context ? 'attached' : ['enabled','stopping'].includes(op.state) ? 'interrupted' : 'detached', ...(context?.error ? { hostError: context.error } : {}) } };
    },
    async start(scope, input, client) {
      if (closing) throw new InstallError('実行hostは停止中です。', 503);
      const existing = contexts.get(key(scope, input?.id));
      if (existing) {
        if (canonicalOperationValue(existing.input) !== canonicalOperationValue(input)) throw new InstallError('同じ運用IDの内容は変更できません。', 409);
        await existing.accepted; await client.revalidate(); return client.api('get', { id: input.id });
      }
      let config; try { config = parseOperationRequest(input, now()); } catch (e) { throw new InstallError(e.message, 400); }
      executionRequest({ id: config.id, agentId: config.agentId, prompt: config.prompt, ...(config.providerConsent ? { providerConsent: config.providerConsent } : {}) });
      if (contexts.size >= 20) throw new InstallError('このhostの運用は20件までです。', 429);
      const context = { ...client, id: config.id, scope, input, lease: randomBytes(32).toString('hex'), task: null, stopping: false, failed: false, ready: false };
      contexts.set(key(scope, config.id), context);
      context.accepted = (async () => {
        try {
          await client.revalidate();
          // A saved operation after a host restart needs an explicit stop/reconcile
          // and resume. Replaying a start never adopts the previous host's lease.
          const previous = await client.api('get', { id: config.id }).catch(e => { if (e.status === 404) return null; throw e; });
          if (previous) {
            if (canonicalOperationValue(previous.job.noahOperation.config) !== canonicalOperationValue(config)) throw new InstallError('同じ運用IDの内容は変更できません。', 409);
            contexts.delete(key(scope, config.id)); return previous;
          }
          const binding = await executions.binding(scope, config.agentId);
          const result = await client.api('create', { config, binding, lease: context.lease });
          context.ready = true; return result;
        } catch (e) { contexts.delete(key(scope, config.id)); throw e; }
      })();
      return context.accepted;
    },
    async resume(scope, id, client) {
      if (!operationUuid(id) || closing) throw new InstallError('運用IDとhostを確認してください。', 400);
      const old = contexts.get(key(scope, id));
      if (old?.task || old?.stopping) throw new InstallError('停止確認後に再開してください。', 409);
      await client.revalidate();
      const { job } = await client.api('get', { id }), config = job.noahOperation.config;
      const lease = randomBytes(32).toString('hex'), binding = await executions.binding(scope, config.agentId);
      const result = await client.api('resume', { id, revision: job.revision, lease, binding });
      contexts.set(key(scope, id), { ...client, id, scope, input: config, lease, ready: true, task: null, stopping: false, failed: false, accepted: Promise.resolve(result) });
      return result;
    },
    async runtimePreview(scope, id, client) {
      if (!operationUuid(id) || closing) throw new InstallError('運用IDとhostを確認してください。', 400);
      await client.revalidate();
      const { job } = await client.api('get', { id }), op = job.noahOperation;
      if (!operationRuntimeEditable(op) || contexts.get(key(scope, id))?.task || contexts.get(key(scope, id))?.stopping) throw new InstallError('停止と結果を確認してから実行環境を変更してください。', 409);
      const candidate = await executions.binding(scope, op.config.agentId);
      return { job, runtime: { revision: job.revision, current: op.binding, candidate, candidateDigest: createHash('sha256').update(canonicalOperationValue(candidate)).digest('hex'), changed: canonicalOperationValue(op.binding) !== canonicalOperationValue(candidate) } };
    },
    async updateRuntime(scope, id, input, client) {
      try { parseOperationRuntimeUpdate(input); } catch (e) { throw new InstallError(e.message, 400); }
      if (!operationUuid(id) || closing) throw new InstallError('運用IDとhostを確認してください。', 400);
      await client.revalidate();
      const saved = await client.api('get', { id });
      // A lost acknowledgement can be recovered even after disconnect/resume.
      // Replaying it never restores an older binding or restarts a scheduler.
      try { if (operationRuntimeReplay(saved.job.noahOperation, input)) return saved; } catch (e) { throw new InstallError(e.message, 409); }
      if (saved.job.revision !== input.revision) throw new InstallError('運用が更新されました。変更内容を再確認してください。', 409);
      const preview = await api.runtimePreview(scope, id, client);
      if (preview.runtime.revision !== input.revision || preview.runtime.candidateDigest !== input.candidateDigest) throw new InstallError('候補が変わりました。変更内容を再確認してください。', 409);
      const previousContext = contexts.get(key(scope, id));
      const result = await client.api('rebind', { id, ...input, binding: preview.runtime.candidate });
      if (contexts.get(key(scope, id)) === previousContext) contexts.delete(key(scope, id));
      return result;
    },
    async change(scope, id, action, input, client) {
      if (!operationUuid(id) || closing || !['revise','archive','restore'].includes(action)) throw new InstallError('操作を確認してください。', 400);
      const old = contexts.get(key(scope, id));
      if (old?.task || old?.stopping) throw new InstallError('停止確認を待ってください。', 409);
      await client.revalidate();
      // User edits retain the observed revision. Never retry against a newer edit.
      const result = await client.api(action, { id, ...input });
      contexts.delete(key(scope, id)); return result;
    },
    async stop(scope, id, client) {
      if (!operationUuid(id)) throw new InstallError('運用IDを確認してください。', 400);
      const context = contexts.get(key(scope, id)) || { ...client, scope, id, task: null };
      if (context.stoppingTask) return context.stoppingTask;
      context.stopping = true;
      context.stoppingTask = (async () => {
        await context.accepted;
        await command(context, 'pause');
        const { job } = await context.api('get', { id });
        if (job.noahOperation.active) await executions.stop(scope, job.noahOperation.active.jobId, context.work).catch(e => { if (e.status !== 404) throw e; });
        await context.task;
        const result = await command(context, 'finishPause'); contexts.delete(key(scope, id)); return result;
      })().finally(() => { context.stoppingTask = null; });
      return context.stoppingTask;
    },
    async tick() {
      if (closing) return;
      for (const context of contexts.values()) {
        if (!context.ready || context.failed || context.stopping) continue;
        if (now() >= context.input.expiresAt && context.task) { void api.stop(context.scope, context.id, context).catch(() => { context.failed = true; }); continue; }
        if (context.task || (context.nextCheckAt || 0) > now()) continue;
        context.task = (async () => {
          let ownsReservation = false;
          try {
            await context.revalidate();
            const { job } = await context.api('get', { id: context.id }), op = job.noahOperation;
            if (context.stopping) return;
            if (op.state !== 'enabled') { contexts.delete(key(context.scope, context.id)); return; }
            if (op.active) throw new InstallError('前回の実行結果を照合してください。', 409);
            if (op.nextRunAt > now() || executions.busy() || reserved) return;
            reserved = true; ownsReservation = true;
            const claimed = await command(context, 'claim', { lease: context.lease }), active = claimed.job.noahOperation.active;
            if (!active) { context.nextCheckAt = now() + 5000; return; }
            const revalidate = async () => {
              if (context.stopping) throw new InstallError('運用停止を要求しました。');
              await context.revalidate();
              const current = (await context.api('get', { id: context.id })).job.noahOperation;
              if (current.state !== 'enabled' || current.active?.jobId !== active.jobId || now() >= current.config.expiresAt) throw new InstallError('運用の期限または許可が変わりました。');
            };
            await executions.start(context.scope, { id: active.jobId, agentId: op.config.agentId, prompt: active.prompt ?? op.config.prompt, ...(op.config.providerConsent ? { providerConsent: op.config.providerConsent } : {}) }, context.work, revalidate,
              { beforeModel: count => op.binding.provider ? Promise.resolve() : command(context, 'reserveModel', { lease: context.lease, occurrenceId: active.jobId, modelCall: count }), expectedBinding: op.binding, operation: { id: context.id, sequence: active.sequence, configVersion: active.configVersion ?? 1, bindingVersion: active.bindingVersion ?? 1, ...(active.event ? { event: active.event } : {}) } });
            const finished = await executions.wait(context.scope, active.jobId, context.work);
            if (['queued','running','unknown'].includes(finished.job.noahExecution.state)) throw new InstallError('処理の終了を確認できません。');
            await command(context, 'settle', { lease: context.lease });
          } catch (e) {
            context.failed = true; context.error = e instanceof InstallError ? e.message : '運用の保存・接続を確認できません。';
            if (!context.stopping) await stopRecord(context).catch(() => {});
          } finally { if (ownsReservation) reserved = false; }
        })().finally(() => { context.task = null; });
        // Each turn reserves at most one candidate before checking the next one.
        // The execution manager remains the final atomic global concurrency gate.
      }
    },
    async drain() { await Promise.all([...contexts.values()].map(c => c.task)); },
    async close() { closing = true; if (timer) clearInterval(timer); await Promise.allSettled([...contexts.values()].map(c => api.stop(c.scope, c.id, c))); },
  };
  const timer = auto ? setInterval(() => { void api.tick(); }, 1000) : null; timer?.unref();
  return api;
}

export function generalOperationsMiddleware({ manager, port, getOwner, workFor, operationFor }) {
  return async (request, response, next) => {
    const pathname = request.url?.split('?')[0] || '';
    if (!pathname.startsWith('/__noah/operations')) return next();
    const send = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(value)); };
    try {
      if (!isLocalRuntimeHost(request, port) || request.headers['sec-fetch-site'] === 'cross-site') throw new InstallError('このMacのNoahから操作してください。', 403);
      const match = /^\/__noah\/operations(?:\/([a-f0-9-]{36})\/(stop|resume|revise|archive|restore|runtime))?$/.exec(pathname), mutate = request.method === 'POST';
      if (!match) throw new InstallError('運用が見つかりません。', 404);
      if ((!mutate && request.method !== 'GET') || (!mutate && match[1] && match[2] !== 'runtime')) throw new InstallError('対応しない操作です。', 405);
      if (mutate && !isLocalRuntimeRequest(request, port)) throw new InstallError('同じNoah画面から操作してください。', 403);
      const owner = await getOwner(request), scope = owner.ownerScope;
      if (!owner.localHostOwner || !/^owner-v1:[a-f0-9]{64}$/.test(scope)) throw new InstallError('このMacの所有者として接続してください。', 403);
      const client = { api: operationFor(request, scope), work: workFor(request, scope), revalidate: async () => { const current = await getOwner(request); if (!current.localHostOwner || current.ownerScope !== scope) throw new InstallError('本人の接続を確認できません。', 403); } };
      let data;
      if (mutate) {
        if (request.headers['x-rock-owner-scope'] !== scope) throw new InstallError('アカウントが変わりました。', 409);
        if (!request.headers['content-type']?.startsWith('application/json')) throw new InstallError('JSONで指定してください。', 415);
        const chunks = []; let bytes = 0; for await (const chunk of request) { bytes += chunk.length; if (bytes > 16000) throw new InstallError('入力が大きすぎます。', 413); chunks.push(Buffer.from(chunk)); }
        let input; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InstallError('JSONを確認してください。', 400); }
        if (['stop','resume'].includes(match[2]) && (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).length)) throw new InstallError('停止・再開に追加の入力は不要です。', 400);
        if (match[2] === 'runtime') data = await manager.updateRuntime(scope, match[1], input, client);
        else if (['revise','archive','restore'].includes(match[2])) {
          const keys = match[2] === 'revise' ? ['revision','config'] : ['revision'];
          if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !keys.includes(k)) || !Number.isInteger(input.revision) || input.revision < 0) throw new InstallError('変更前の版と条件を確認してください。', 400);
          data = await manager.change(scope, match[1], match[2], input, client);
        } else data = match[2] ? await manager[match[2]](scope, match[1], client) : await manager.start(scope, input, client);
      } else if (match[2] === 'runtime') data = await manager.runtimePreview(scope, match[1], client);
      else { const params = new URL(request.url, 'http://localhost').searchParams; data = await client.api('get', { agentId: params.get('agentId'), archived: params.get('archived') }); }
      if (data.job) data.job = manager.view(scope, data.job);
      if (data.jobs) data.jobs = data.jobs.map(job => manager.view(scope, job));
      send(200, { ...data, ownerScope: scope });
    } catch (e) { send(e instanceof InstallError ? e.status : 503, { error: e instanceof InstallError ? e.message : '運用を確認できません。' }); }
  };
}
