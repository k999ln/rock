import { createNoahLocalRequest } from './noah-local-api.mjs';
import { readNoahSourceBytes, NOAH_SOURCE_DOWNLOAD_LIMIT } from './noah-source-bytes.mjs';
import { prepareTerminalRuntime } from './noah-terminal-runtime.mjs';
import { InstallError } from './noah-source-fetch.mjs';
import { isNoahInviteAgentId } from '../lib/noah-invite-contract.mjs';
import { runWithInviteGrant } from './noah-invite-loader.mjs';
import { isReleaseAgentId } from '../lib/noah-release-contract.mjs';

export const terminalUploadId = id => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
const pin = a => JSON.stringify([a.id, a.manifestSha256, a.source?.sha256, a.manifest.runtime, a.manifest.version, a.release, a.invite]);

// Connections are host caches. Upload ownership and immutable pins remain in D1;
// every execution and model call rechecks them using the authenticated API.
export function createTerminalInstallations({ root, prepare = prepareTerminalRuntime }) {
  const slots = new Map(); let closing = false;
  const view = (id, slot) => ({ id, name: slot?.agent?.manifest.name || 'コードテンプレート', state: slot?.state || 'idle',
    busy: Boolean(slot?.task), canAcquire: true, automaticRuntime: true, message: slot?.message || '接続すると専用環境を準備します。本人の画面にはアクセスしません。',
    ...(slot?.state === 'connected' ? { execution: slot.runtime.execution } : {}) });
  const api = {
    async get(scope, id) { return view(id, slots.get(`${scope}/${id}`)); },
    async connect(scope, id, load) {
      if (!terminalUploadId(id) && !isReleaseAgentId(id) && !isNoahInviteAgentId(id)) throw new InstallError('登録IDを確認してください。', 400);
      if (closing) throw new InstallError('実行ホストを終了しています。', 503);
      const key = `${scope}/${id}`, old = slots.get(key);
      if (old?.task) return view(id, old);
      if (old?.state === 'connected') { await old.runtime.revalidate(); return view(id, old); }
      if (!old && slots.size >= 8) throw new InstallError('接続中のコードテンプレートを停止してから追加してください。', 429);
      const slot = { state: 'preparing', message: '保存したコードと実行環境を確認中…', controller: new AbortController() };
      slots.set(key, slot);
      slot.task = (async () => {
        try {
          const { agent, bytes } = await load(true);
          if (agent.id !== id || agent.uploadState !== 'ready' || !agent.source || !agent.manifest.runtime) throw new InstallError('実行定義と保存済みコードが必要です。', 422);
          slot.controller.signal.throwIfAborted(); slot.agent = agent;
          const prepared = await prepare({ root, name: agent.source.name, bytes, expectedSha: agent.source.sha256, definition: agent.manifest.runtime, signal: slot.controller.signal,
            ...(agent.release ? { seconds: agent.release.timeoutSeconds } : {}) });
          slot.runtime = Object.assign(prepared, { binding: { recipe: 'terminal', version: agent.manifest.version, model: agent.manifest.runtime.model,
            ...(agent.invite ? { invite: agent.invite } : agent.release ? { release: agent.release } : { source: { uploadId: id, manifestSha256: agent.manifestSha256, sourceSha256: agent.source.sha256, runtime: agent.manifest.runtime } }) },
            async revalidate() { const now = (await load(false)).agent; if (now.uploadState !== 'ready' || pin(now) !== pin(agent)) throw new InstallError('登録した版が削除・変更されました。', 409); } });
          if (agent.invite) {
            const run = prepared.run.bind(prepared);
            prepared.run = (prompt, signal, onCall) => runWithInviteGrant({ run: ({ signal }) => run(prompt, signal, onCall), input: { signal }, expiresAt: agent.invite.expiresAt, revalidate: () => prepared.revalidate() });
          }
          await slot.runtime.revalidate(); slot.controller.signal.throwIfAborted();
          slot.state = 'connected'; slot.message = '画面を使わない専用環境に接続しました。依頼を入力できます。';
        } catch (e) {
          await slot.runtime?.stop(); slot.runtime = null;
          slot.state = slot.controller.signal.aborted ? 'disconnected' : 'failed'; slot.message = e instanceof Error ? e.message : '接続できませんでした。';
        } finally { slot.task = null; }
      })();
      return view(id, slot);
    },
    async execution(scope, id) {
      const s = slots.get(`${scope}/${id}`);
      if (closing || s?.task || s?.state !== 'connected' || !s.runtime) throw new InstallError('このテンプレートに接続してから実行してください。', 409);
      await s.runtime.revalidate(); return s.runtime;
    },
    async disconnect(scope, id) {
      const key = `${scope}/${id}`, s = slots.get(key);
      if (s) { s.state = 'disconnected'; s.controller.abort(); await s.task; await s.runtime?.stop(); slots.delete(key); }
      return { ...view(id), state: 'disconnected', message: '接続を停止しました。保存したコードと実行結果は残っています。' };
    },
    async close() { closing = true; await Promise.all([...slots.keys()].map(key => { const slash = key.indexOf('/'); return api.disconnect(key.slice(0, slash), key.slice(slash + 1)); })); },
  };
  return api;
}

export function terminalSourceLoader(incoming, scope, id, getOwner, fetcher = fetch) {
  const endpoint = `/api/noah/agents/${id}`, request = createNoahLocalRequest(incoming, fetcher);
  return async download => {
    const owner = await getOwner(incoming);
    if (!owner.localHostOwner || owner.ownerScope !== scope) throw new InstallError('本人の接続が変わりました。', 403);
    const response = await request(endpoint);
    if (!response.ok) throw new InstallError('本人の登録コードを取得できません。', response.status);
    const { agent, ownerScope } = await response.json();
    if (ownerScope !== scope || agent?.id !== id || !agent.manifest.runtime || agent.uploadState !== 'ready' || !agent.source) throw new InstallError('実行定義と所有者を確認できません。', 409);
    if (!download) return { agent };
    if (agent.source.bytes > NOAH_SOURCE_DOWNLOAD_LIMIT) throw new InstallError('テンプレートの実行は展開後1MiBまでです。', 413);
    const source = await request(endpoint + '/source');
    if (!source.ok || source.headers.get('x-content-sha256') !== agent.source.sha256 || !source.body) throw new InstallError('保存版のコードを確認できません。', 409);
    const bytes = await readNoahSourceBytes(source, agent.source.bytes);
    return { agent, bytes };
  };
}
