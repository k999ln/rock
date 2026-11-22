import { createNoahLocalRequest, createNoahLocalRecordClients } from './noah-local-api.mjs';
import { createTerminalInstallations, terminalUploadId, terminalSourceLoader } from './noah-terminal-installations.mjs';
import { isNoahInviteAgentId } from '../lib/noah-invite-contract.mjs';
import { inviteSourceLoader } from './noah-invite-loader.mjs';
import { isReleaseAgentId } from '../lib/noah-release-contract.mjs';
import { releaseSourceLoader } from './noah-release-loader.mjs';
import path from 'node:path';
import { readFile, writeFile, mkdir, rename, readdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isLocalRuntimeHost, isLocalRuntimeRequest } from '../lib/sky-private-loopback.mjs';
import { acquireSource, sourcePlan, sha256, InstallError } from './noah-source-fetch.mjs';
import { requirementsFor } from '../lib/noah-agent-requirements.mjs';
import { startManagedAdapter } from './noah-managed-adapters.mjs';
import { createSaveRefactorManager, saveRefactorMiddleware } from './noah-save-refactor.mjs';
import { createUploadProcessingManager, uploadProcessingMiddleware } from './noah-upload-processing.mjs';
import { createExecutionManager, executionMiddleware } from './noah-executions.mjs';
import { createGeneralOperations, generalOperationsMiddleware } from './noah-general-operations.mjs';
import { createInstancePreparation, instancePreparationMiddleware } from './noah-instance-preparation.mjs';
import { modelMiddleware } from './noah-model-middleware.mjs';
import { closeNoahModelManager } from './noah-model-manager.mjs';

const ID = /^(anicca|research-[a-f0-9]{20})$/;
const ACTIVE = new Set(['resolving', 'fetching', 'preparing', 'checking']);
const SCOPE = /^owner-v1:[a-f0-9]{64}$/;
export function catalogLoader(root, { read = readFile, maxShards = 4 } = {}) {
  if (!Number.isInteger(maxShards) || maxShards < 1 || maxShards > 64) throw new RangeError('Invalid catalog cache limit');
  let revision;
  const shards = new Map();
  return async id => {
    if (!ID.test(id)) throw new InstallError('Agentが見つかりません。', 404);
    revision ||= read(path.join(root, 'data/noah-research-sources/receipt.json'), 'utf8').then(text => {
      const value = JSON.parse(text).revision;
      if (!/^[a-f0-9]{16}$/.test(value)) throw new InstallError('catalogの版を確認できません。');
      return value;
    }).catch(error => { revision = undefined; throw error; });
    const version = await revision;
    const bucket = id === 'anicca' ? '00' : (parseInt(id.slice(9, 11), 16) % 64).toString(16).padStart(2, '0');
    let shard = shards.get(bucket);
    if (shard) { shards.delete(bucket); shards.set(bucket, shard); }
    else {
      shard = read(path.join(root, `public/noah-research/${version}/${bucket}.json`), 'utf8').then(JSON.parse);
      shards.set(bucket, shard);
      while (shards.size > maxShards) shards.delete(shards.keys().next().value);
      shard.catch(() => { if (shards.get(bucket) === shard) shards.delete(bucket); });
    }
    const entry = (await shard)[id]; if (!entry) throw new InstallError('Agentが見つかりません。', 404);
    return entry;
  };
}

export function createInstallationManager({ root, directory = path.join(root, 'work/runtime-state/noah-installations'), getEntry = catalogLoader(root), acquire = acquireSource, startAdapter = startManagedAdapter }) {
  const slots = new Map(); let active = 0, closing = false;
  function ownerDir(scope) { if (!SCOPE.test(scope)) throw new InstallError('本人を確認できません。', 401); return path.join(directory, sha256(scope)); }
  async function loadSlot(scope, id) {
    if (!ID.test(id)) throw new InstallError('Agentが見つかりません。', 404);
    const folder = path.join(ownerDir(scope), id);
    const entry = await getEntry(id), plan = sourcePlan(entry);
    let record = { id, name: entry.name, state: 'idle', message: plan.reason || '接続するとNoahが本体を取り寄せ、対応する実行環境を準備します。', history: [], source: null };
    try {
      const saved = JSON.parse(await readFile(path.join(folder, 'state.json'), 'utf8'));
      if (saved.id !== id) throw new InstallError('保存したAgentが一致しません。');
      record = saved;
      if (ACTIVE.has(record.state) || ['connected', 'setup_required'].includes(record.state)) record = { ...record, state: 'disconnected', message: 'ホストの再起動後は再接続が必要です。取得済みの本体は再利用します。', url: undefined };
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    return { entry, plan, record, folder, runtime: null, job: null, controller: null, stopping: null, removing: false, writes: Promise.resolve() };
  }
  async function get(scope, id) {
    const key = `${scope}/${id}`;
    if (!slots.has(key)) slots.set(key, loadSlot(scope, id).catch(e => { slots.delete(key); throw e; }));
    return slots.get(key);
  }
  async function save(slot, state, message, extra = {}) {
    slot.record = { ...slot.record, state, message, ...extra, updatedAt: new Date().toISOString() };
    slot.record.history = [...slot.record.history, { state, at: slot.record.updatedAt }].slice(-20);
    const body = JSON.stringify(slot.record);
    const write = slot.writes.then(async () => {
      await mkdir(slot.folder, { recursive: true, mode: 0o700 });
      const temp = path.join(slot.folder, `.state-${randomUUID()}`);
      await writeFile(temp, body, { mode: 0o600 }); await rename(temp, path.join(slot.folder, 'state.json'));
    });
    slot.writes = write.catch(() => {}); await write;
  }
  const present = slot => ({ ...slot.record, requirements: requirementsFor(slot.entry.id), execution: slot.runtime?.execution, busy: Boolean(slot.job || slot.stopping), target: 'このMac', canAcquire: ['git', 'artifact'].includes(slot.plan.type), automaticRuntime: ['codex', 'anicca', 'isolated'].includes(slot.plan.adapter), sourceUrl: slot.plan.url });
  async function stop(slot) {
    if (!slot.stopping) {
      slot.stopping = (async () => {
        slot.controller?.abort(new InstallError('取り寄せ・接続を中止しました。'));
        await slot.job; if (slot.runtime) await slot.runtime.stop(); slot.runtime = null;
        await save(slot, 'disconnected', 'Noahからの接続を停止しました。取り寄せた本体は保存しています。', { url: undefined });
      })().finally(() => { slot.stopping = null; });
    }
    await slot.stopping;
  }
  const api = {
    async execution(scope, id) {
      const slot = await get(scope, id);
      if (closing || slot.job || slot.stopping || slot.removing || slot.record.state !== 'connected' || !slot.runtime?.execution) throw new InstallError('このAgentに接続してから実行してください。');
      return slot.runtime;
    },
    async status(scope, id) {
      // Browsing thousands of details must not allocate persistent runtime slots.
      const slot = await (slots.get(`${scope}/${id}`) || loadSlot(scope, id));
      if (slot.runtime && !slot.job && !slot.stopping) {
        const runtime = slot.runtime;
        try { const probe = await runtime.probe(); if (slot.runtime === runtime && !slot.job && !slot.stopping && !slot.removing && probe.state !== slot.record.state) await save(slot, probe.state, probe.message, { url: probe.url }); }
        catch { if (slot.runtime === runtime && !slot.job && !slot.stopping && !slot.removing) { await stop(slot); await save(slot, 'disconnected', 'Agentとの接続が切れています。再接続してください。', { url: undefined }); } }
      }
      return present(slot);
    },
    async list(scope) {
      const saved = (await readdir(ownerDir(scope)).catch(e => { if (e.code === 'ENOENT') return []; throw e; })).filter(id => ID.test(id));
      const inMemory = [...slots.keys()].filter(k => k.startsWith(`${scope}/`)).map(k => k.slice(scope.length + 1));
      const rows = await Promise.all([...new Set([...saved, ...inMemory])].map(id => api.status(scope, id)));
      return rows.filter(r => r.state !== 'idle').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    },
    async connect(scope, id, revalidate = async () => {}) {
      if (closing) throw new InstallError('実行hostが停止中です。', 503);
      const slot = await get(scope, id);
      if (slot.stopping || slot.removing) throw new InstallError('停止処理が終わってから再接続してください。');
      if (slot.job) return present(slot);
      if (slot.runtime) return api.status(scope, id);
      if (active >= 2) throw new InstallError('取り寄せを2件処理中です。完了後にもう一度接続してください。', 429);
      const saved = (await readdir(ownerDir(scope)).catch(e => { if (e.code === 'ENOENT') return []; throw e; })).filter(x => ID.test(x));
      if (!saved.includes(id) && saved.length + active >= 20) throw new InstallError('このMacの取り寄せは20件までです。不要な本体を削除してください。', 429);
      // Reserve synchronously after the awaited quota read (same-id calls may
      // have completed it meanwhile). The job remains host-owned after HTTP ends.
      if (slot.job) return present(slot);
      if (closing || slot.stopping || slot.removing) throw new InstallError('実行hostまたは接続を停止中です。');
      if (active >= 2) throw new InstallError('取り寄せを2件処理中です。', 429);
      active++; const controller = new AbortController(); slot.controller = controller;
      slot.record = { ...slot.record, state: 'resolving', message: '配布元と導入方法を確認しています。' };
      slot.job = (async () => {
        await save(slot, 'resolving', '配布元と導入方法を確認しています。', { url: undefined });
        await revalidate(); controller.signal.throwIfAborted();
        if (!['git', 'artifact'].includes(slot.plan.type)) { await save(slot, 'unavailable', slot.plan.reason); return; }
        const receipt = await acquire({ plan: slot.plan, directory: slot.folder, signal: controller.signal, progress: (s, m) => save(slot, s, m) });
        controller.signal.throwIfAborted(); await revalidate();
        await save(slot, 'preparing', '本体を保存しました。実行環境を確認しています。', { source: receipt });
        slot.runtime = await startAdapter({ root, plan: slot.plan, directory: slot.folder, receipt, signal: controller.signal });
        controller.signal.throwIfAborted(); await revalidate();
        if (!slot.runtime) { await save(slot, 'adapter_required', '本体は取り寄せ済みです。このAgentを自動起動する手順の対応が必要です。依存定義を記録しました。'); return; }
        await save(slot, 'checking', 'Agentを起動し、接続を確認しています。', { runtimeInfo: slot.runtime.runtimeInfo });
        const probe = await slot.runtime.probe(); controller.signal.throwIfAborted(); await revalidate();
        await save(slot, probe.state, probe.message, { url: probe.url });
      })().catch(async e => {
        if (slot.runtime) await slot.runtime.stop().catch(() => {}); slot.runtime = null;
        await save(slot, controller.signal.aborted ? 'disconnected' : 'failed', controller.signal.aborted ? '取り寄せ・接続を中止しました。' : e instanceof InstallError ? e.message : '本体の準備に失敗しました。再試行してください。', { url: undefined });
      }).finally(() => { active--; slot.job = null; slot.controller = null; });
      // Persistence failures are surfaced by the next status rather than an
      // unhandled background rejection. No execution proceeds after that failure.
      slot.job.catch(() => { slot.record.state = 'failed'; slot.record.message = '接続状態を保存できません。保存先を確認してください。'; });
      return present(slot);
    },
    async disconnect(scope, id) { const slot = await get(scope, id); await stop(slot); return present(slot); },
    async remove(scope, id) {
      const slot = await get(scope, id); if (slot.removing) throw new InstallError('削除中です。'); slot.removing = true;
      try { await stop(slot);
      await rm(slot.folder, { recursive: true, force: true }); slots.delete(`${scope}/${id}`);
      return { id, state: 'idle', message: 'Noahが取り寄せた本体を削除しました。既存のCodexや本人の業務設定は残っています。', busy: false };
      } finally { slot.removing = false; }
    },
    async close() { closing = true; await Promise.allSettled([...slots.values()].map(async p => { const slot = await p; if (slot.job || slot.runtime) await stop(slot); })); },
  };
  return api;
}

export function installationMiddleware({ manager, port, getOwner }) {
  return async (request, response, next) => {
    const pathname = request.url?.split('?')[0] || '';
    if (pathname !== '/__noah/installations' && !pathname.startsWith('/__noah/installations/')) return next();
    const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(data)); };
    try {
      if (!isLocalRuntimeHost(request, port) || request.headers['sec-fetch-site'] === 'cross-site') throw new InstallError('このMacのNoahから操作してください。', 403);
      const match = /^\/__noah\/installations(?:\/(anicca|research-[a-f0-9]{20}|release-[a-f0-9]{64}|invite-[a-f0-9-]{36}|[a-f0-9-]{36})(?:\/(connect|disconnect|remove))?)?$/.exec(pathname);
      if (!match) throw new InstallError('接続先が見つかりません。', 404);
      const action = match[2] || (match[1] ? 'status' : 'list'), mutation = Boolean(match[2]);
      if (request.method !== (mutation ? 'POST' : 'GET')) throw new InstallError('対応しない操作です。', 405);
      if (mutation && !isLocalRuntimeRequest(request, port)) throw new InstallError('同じNoah画面から操作してください。', 403);
      const owner = await getOwner(request);
      if (!SCOPE.test(owner.ownerScope) || !owner.localHostOwner) throw new InstallError('このMacの所有者として接続してください。', 403);
      if (mutation) {
        if (request.headers['x-rock-owner-scope'] !== owner.ownerScope) throw new InstallError('アカウントが変わりました。画面を開き直してください。', 409);
        if (!request.headers['content-type']?.startsWith('application/json')) throw new InstallError('JSONで操作してください。', 415);
        let body = '', bytes = 0;
        for await (const chunk of request) { bytes += chunk.length; if (bytes > 64) throw new InstallError('入力が大きすぎます。', 413); body += chunk; }
        let value; try { value = JSON.parse(body); } catch { throw new InstallError('JSONを確認してください。', 400); }
        if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length) throw new InstallError('URL・コマンド・秘密値は指定できません。', 400);
      }
      const revalidate = async () => { const current = await getOwner(request); if (current.ownerScope !== owner.ownerScope || !current.localHostOwner) throw new InstallError('本人の接続を確認できなくなりました。', 403); };
      const data = await manager[action](owner.ownerScope, match[1], revalidate);
      send(action === 'connect' && data.busy ? 202 : 200, { [action === 'list' ? 'installations' : 'installation']: data, ownerScope: owner.ownerScope });
    } catch (e) { send(e instanceof InstallError ? e.status : 503, { error: e instanceof InstallError ? e.message : '接続hostを確認できません。再試行してください。' }); }
  };
}

export function createNoahInstallationsPlugin() {
  return { name: 'noah-managed-installations', configureServer(server) {
    const manager = createInstallationManager({ root: server.config.root });
    const terminals = createTerminalInstallations({ root: server.config.root });
    const executions = createExecutionManager({ execution: (scope, id) => terminalUploadId(id) || isReleaseAgentId(id) || isNoahInviteAgentId(id) ? terminals.execution(scope, id) : manager.execution(scope, id) });
    const operations = createGeneralOperations({ executions });
    const instancePreparation = createInstancePreparation();
    const saveRefactor = createSaveRefactorManager({ root: server.config.root, installations: manager, executions });
    const uploadProcessing = createUploadProcessingManager({ root: server.config.root, installations: manager, executions });
    server.middlewares.use((request, response, next) => {
      const address = server.httpServer?.address(), port = typeof address === 'object' ? address?.port : server.config.server.port;
      const getOwner = async incoming => {
        const r = await createNoahLocalRequest(incoming)('/api/noah/catalog/owner', { timeoutMs: 5000 });
        if (!r.ok) throw new InstallError('Noahの本人確認が必要です。', r.status === 401 ? 401 : 503);
        return r.json();
      };
      const workFor = (incoming, scope) => createNoahLocalRecordClients(incoming, scope).work;
      const instanceFor = (incoming, scope) => createNoahLocalRecordClients(incoming, scope).instance;
      const operationFor = (incoming, scope) => createNoahLocalRecordClients(incoming, scope).operation;
      const requestManager = { ...manager, execution: (scope,id) => terminalUploadId(id) || isReleaseAgentId(id) || isNoahInviteAgentId(id) ? terminals.execution(scope,id) : manager.execution(scope,id) };
      const referencesFor = (incoming, scope) => async model => {
        const current = await getOwner(incoming);
        if (!current.localHostOwner || current.ownerScope !== scope) throw new InstallError('本人の接続が変わりました。', 409);
        const r = await createNoahLocalRequest(incoming)(`/api/noah/models/references?model=${encodeURIComponent(model)}`);
        const data = await r.json();
        if (!r.ok || data.ownerScope !== scope || !Array.isArray(data.references)) throw new InstallError(data.error || 'モデルの参照先を確認できません。', r.ok ? 409 : r.status);
        return data.references;
      };
      for (const action of ['status', 'connect', 'disconnect', 'remove']) requestManager[action] = async (scope, id, revalidate) => {
        if (!terminalUploadId(id) && !isReleaseAgentId(id) && !isNoahInviteAgentId(id)) return manager[action](scope, id, revalidate);
        const load = isNoahInviteAgentId(id) ? inviteSourceLoader(request, scope, id, getOwner) : isReleaseAgentId(id) ? releaseSourceLoader(request, scope, id, getOwner) : terminalSourceLoader(request, scope, id, getOwner);
        if (action === 'connect') return terminals.connect(scope, id, load);
        if (action === 'status') { await load(false); return terminals.get(scope, id); }
        return terminals.disconnect(scope, id);
      };
      void modelMiddleware({ root: server.config.root, port, getOwner, referencesFor })(request, response, () => {
        void instancePreparationMiddleware({manager:instancePreparation,installations:requestManager,port,getOwner,instanceFor})(request,response,()=>{ void generalOperationsMiddleware({ manager: operations, port, getOwner, workFor, operationFor })(request, response, () => { void uploadProcessingMiddleware({ manager: uploadProcessing, port, getOwner, workFor })(request, response, () => { void saveRefactorMiddleware({ manager: saveRefactor, port, getOwner, workFor })(request, response, () => { void executionMiddleware({ manager: executions, port, getOwner, workFor })(request, response, () => { void installationMiddleware({ manager: requestManager, port, getOwner })(request, response, next); }); }); }); }); });
      });
    });
    server.httpServer?.once('close', () => { saveRefactor.close(); void instancePreparation.close().finally(() => operations.close()).finally(() => uploadProcessing.close()).finally(() => executions.close()).finally(() => terminals.close()).finally(() => manager.close()).finally(() => closeNoahModelManager(server.config.root)); });
  } };
}
