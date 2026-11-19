import { randomBytes } from 'node:crypto';
import { InstallError, sha256 } from './noah-source-fetch.mjs';
import { recipeFor, modelFor, LIMITS } from './noah-execution-recipes.mjs';
import { isLocalRuntimeHost, isLocalRuntimeRequest } from '../lib/sky-private-loopback.mjs';
import { isNoahInviteAgentId } from '../lib/noah-invite-contract.mjs';
import { isReleaseAgentId } from '../lib/noah-release-contract.mjs';
import { canonicalOperationValue } from '../lib/noah-operation-contract.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function executionRequest(input) {
  if (!input || Object.keys(input).some(k => !['id', 'agentId', 'prompt', 'providerConsent'].includes(k)) || !UUID.test(input.id) || (!recipeFor(input.agentId) && !UUID.test(input.agentId) && !isReleaseAgentId(input.agentId) && !isNoahInviteAgentId(input.agentId)) || typeof input.prompt !== 'string' || !input.prompt.trim() || Buffer.byteLength(input.prompt) > LIMITS.inputBytes) throw new InstallError('Agentと依頼文を確認してください。', 400);
  const external = recipeFor(input.agentId)?.provider === 'openai-codex';
  if (input.agentId === 'anicca' && input.prompt.trim().length < 16) throw new InstallError('Aniccaへの依頼は16文字以上で具体的に入力してください。', 400);
  if (external ? input.providerConsent !== 'codex-account/1' : input.providerConsent !== undefined) throw new InstallError('本人のCodexへ依頼・作業結果を送り、契約枠を使うことを確認してください。', 400);
  return { ...input, digest: sha256(JSON.stringify(external ? [input.agentId, input.prompt, input.providerConsent] : [input.agentId, input.prompt])) };
}

export function createExecutionManager(installations) {
  const slots = new Map(); let closing = false;
  const bindingFor = (agentId, runtime) => {
    const recipe = recipeFor(agentId);
    return { agentId, ...(recipe && !recipe.provider ? { recipe: recipe.key, version: recipe.version, model: modelFor(recipe) } : runtime.binding), image: runtime.execution.image, ...(runtime.execution.modelSha256?{modelSha256:runtime.execution.modelSha256}:{}) };
  };
  const api = {
    busy() { return closing || [...slots.values()].some(s => s.active); },
    async binding(scope, agentId) { const runtime = await installations.execution(scope, agentId); await runtime.revalidate?.(); return bindingFor(agentId, runtime); },
    async wait(scope, id, work) { const slot = slots.get(`${scope}/${id}`); await slot?.accepted; await slot?.task; const data = await work('get', { id }); return { ...data, job: api.view(scope, data.job) }; },
    async start(scope, value, work, revalidate, options = {}) {
      const input = executionRequest(value), key = `${scope}/${input.id}`;
      const existing = slots.get(key);
      if (existing) { if (existing.digest !== input.digest) throw new InstallError('同じ実行IDに異なる入力は指定できません。', 409); await existing.accepted; return work('get', { id: input.id }); }
      if (closing || [...slots.values()].some(s => s.active)) throw new InstallError('別のAgentが実行中です。停止または完了後に実行してください。', 429);
      if (slots.size >= 128) for (const [savedKey, saved] of slots) { if (!saved.active) slots.delete(savedKey); if (slots.size < 64) break; }
      const slot = { digest: input.digest, active: true, controller: new AbortController(), task: null, accepted: null }; slots.set(key, slot);
      slot.accepted = (async () => {
        try {
          const previous = await work('get', { id: input.id }).catch(e => { if (e.status === 404) return null; throw e; });
          if (previous) { if (previous.job.noahExecution.inputSha256 !== input.digest) throw new InstallError('実行IDが使用されています。', 409); slot.active = false; return previous; }
          await revalidate(); slot.controller.signal.throwIfAborted();
          const runtime = await installations.execution(scope, input.agentId), claim = randomBytes(32).toString('hex');
          await runtime.revalidate?.();
          const binding = bindingFor(input.agentId, runtime);
          if (options.expectedBinding && canonicalOperationValue(binding) !== canonicalOperationValue(options.expectedBinding)) throw new InstallError('運用開始時のAgent版・実行環境と一致しません。', 409);
          const created = await work('create', { id: input.id, binding: { ...binding, ...(options.operation ? { operation: options.operation } : {}), prompt: input.prompt, inputSha256: input.digest, claimSha256: sha256(claim) } });
          let calls = 0;
          slot.task = (async () => {
            try {
              slot.controller.signal.throwIfAborted(); await revalidate();
              await work('start', { id: input.id, claim });
              // Recheck connection after storage; a disconnect must win over a queued start.
              if (await installations.execution(scope, input.agentId) !== runtime) throw new InstallError('接続が変わりました。');
              slot.controller.signal.throwIfAborted();
              await runtime.revalidate?.();
              const result = await runtime.run(input.prompt, slot.controller.signal, async count => { await revalidate(); await runtime.revalidate?.(); slot.controller.signal.throwIfAborted(); await options.beforeModel?.(count); slot.controller.signal.throwIfAborted(); calls = count; });
              slot.controller.signal.throwIfAborted(); await revalidate();
              await work('finish', { id: input.id, claim, state: 'returned', calls, result: { text: result.text, files: result.files, exitCode: result.exitCode } });
            } catch (e) {
              await work('finish', { id: input.id, claim, state: e?.unconfirmed ? 'unknown' : slot.controller.signal.aborted ? 'cancelled' : 'failed', calls, error: e instanceof InstallError ? e.message : 'Agentの実行を確認できませんでした。' }).catch(() => { slot.unconfirmed = true; });
            } finally { slot.active = false; }
          })();
          return created;
        } catch (e) { slot.active = false; slots.delete(key); throw e; }
      })();
      return slot.accepted;
    },
    async stop(scope, id, work) {
      if (!UUID.test(id)) throw new InstallError('実行IDを確認してください。', 400);
      const slot = slots.get(`${scope}/${id}`);
      if (slot?.active) { slot.controller.abort(); await slot.accepted.catch(() => {}); await slot.task; }
      return work('get', { id });
    },
    view(scope, job) {
      const slot = slots.get(`${scope}/${job.id}`);
      if (['queued', 'running'].includes(job.noahExecution?.state) && !slot?.active) return { ...job, noahExecution: { ...job.noahExecution, state: 'unknown', error: 'ホスト再起動または記録失敗により結果を確認できません。自動再実行はしません。' } };
      return job;
    },
    async close() { closing = true; await Promise.all([...slots.values()].map(async s => { s.controller.abort(); await s.accepted.catch(() => {}); await s.task; })); },
  };
  return api;
}

export function executionMiddleware({ manager, port, getOwner, workFor }) {
  return async (request, response, next) => {
    const pathname = request.url?.split('?')[0] || '';
    if (!pathname.startsWith('/__noah/executions')) return next();
    const send = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(value)); };
    try {
      if (!isLocalRuntimeHost(request, port) || request.headers['sec-fetch-site'] === 'cross-site') throw new InstallError('このMacのNoahから操作してください。', 403);
      const match = /^\/__noah\/executions(?:\/([a-f0-9-]{36})(?:\/(stop))?)?$/.exec(pathname);
      if (!match) throw new InstallError('実行が見つかりません。', 404);
      const mutate = request.method === 'POST';
      if ((!mutate && request.method !== 'GET') || (!mutate && match[2]) || (mutate && match[1] && !match[2])) throw new InstallError('対応しない操作です。', 405);
      if (mutate && !isLocalRuntimeRequest(request, port)) throw new InstallError('同じNoah画面から操作してください。', 403);
      const owner = await getOwner(request);
      if (!owner.localHostOwner || !/^owner-v1:[a-f0-9]{64}$/.test(owner.ownerScope)) throw new InstallError('このMacの所有者として接続してください。', 403);
      const work = workFor(request, owner.ownerScope);
      const revalidate = async () => { const now = await getOwner(request); if (!now.localHostOwner || now.ownerScope !== owner.ownerScope) throw new InstallError('本人の接続を確認できなくなりました。', 403); };
      let data;
      if (mutate) {
        if (request.headers['x-rock-owner-scope'] !== owner.ownerScope) throw new InstallError('アカウントが変わりました。', 409);
        if (!request.headers['content-type']?.startsWith('application/json')) throw new InstallError('JSONで指定してください。', 415);
        const chunks = []; let bytes = 0; for await (const chunk of request) { bytes += chunk.length; if (bytes > 15000) throw new InstallError('入力が大きすぎます。', 413); chunks.push(Buffer.from(chunk)); }
        const body = Buffer.concat(chunks).toString('utf8');
        let value; try { value = JSON.parse(body); } catch { throw new InstallError('JSONを確認してください。', 400); }
        if (match[2] && (!value || Object.keys(value).length)) throw new InstallError('停止に追加の入力は不要です。', 400);
        data = match[2] ? await manager.stop(owner.ownerScope, match[1], work) : await manager.start(owner.ownerScope, value, work, revalidate);
      } else {
        const params = new URL(request.url, 'http://localhost').searchParams;
        data = await work('get', match[1] ? { id: match[1] } : { agentId: params.get('agentId'), summary: params.get('summary') });
      }
      if (data.job) data.job = manager.view(owner.ownerScope, data.job);
      if (data.jobs) data.jobs = data.jobs.map(j => manager.view(owner.ownerScope, j));
      send(mutate && !match[2] ? 202 : 200, { ...data, ownerScope: owner.ownerScope });
    } catch (e) { send(e instanceof InstallError ? e.status : 503, { error: e instanceof InstallError ? e.message : '実行状態を確認できません。' }); }
  };
}
