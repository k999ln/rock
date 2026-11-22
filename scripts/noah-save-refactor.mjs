import { randomUUID } from 'node:crypto';
import { InstallError } from './noah-source-fetch.mjs';
import { codeSnapshot, validateCode } from './noah-code-validation.mjs';
import { isLocalRuntimeHost, isLocalRuntimeRequest } from '../lib/sky-private-loopback.mjs';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const REFACTOR_AGENT = 'research-ce4e58553bea6313acf7';
export function createSaveRefactorManager({ root, installations, executions, validate = validateCode, clock = Date.now }) {
  const rows = new Map(); let validating = false;
  const get = (owner, id) => { const row = rows.get(`${owner}/${id}`); if (!row) throw new InstallError('VS Codeから対象ファイルを接続してください。', 404); return row; };
  const view = row => ({ ...row.info, enabled: row.enabled, connected: clock() - row.lastSeen < 20000, generation: row.generation, lastWorkId: row.lastWorkId });
  const current = (row, generation) => { if (!row.enabled || row.generation !== generation || clock() - row.lastSeen >= 20000) throw new InstallError('運用が停止、または設定が変更されました。', 409); };
  return {
    list(owner) { return [...rows.entries()].filter(([key]) => key.startsWith(owner + '/')).map(([, row]) => view(row)); },
    register(owner, info) {
      if (!info || Object.keys(info).some(k => !['id', 'label', 'target', 'test'].includes(k)) || !UUID.test(info.id) || typeof info.label !== 'string' || !info.label.trim() || info.label.length > 100) throw new InstallError('接続情報を確認してください。', 400);
      codeSnapshot({ target: info.target, test: info.test, files: [{ name: info.target, content: '' }, { name: info.test, content: '' }] });
      const key = `${owner}/${info.id}`, old = rows.get(key);
      if (!old && rows.size >= 32) throw new InstallError('接続できる保存時運用の上限です。', 429);
      if (old && JSON.stringify(old.info) === JSON.stringify({ ...info, agentId: REFACTOR_AGENT })) return view(old);
      if (old) { old.enabled = false; old.generation = randomUUID(); old.controller.abort(); }
      const row = { info: { ...info, agentId: REFACTOR_AGENT }, enabled: false, generation: randomUUID(), controller: new AbortController(), busy: false, lastSeen: clock() };
      rows.set(key, row); return view(row);
    },
    heartbeat(owner, id) { const row = get(owner, id); row.lastSeen = clock(); return view(row); },
    status(owner, id) { return view(get(owner, id)); },
    async control(owner, id, enabled, work) {
      const row = get(owner, id);
      const before = row.generation;
      if (enabled && clock() - row.lastSeen >= 20000) throw new InstallError('VS Codeの接続を確認してください。', 409);
      if (enabled) await installations.execution(owner, REFACTOR_AGENT);
      if (row.generation !== before) throw new InstallError('運用状態が変わりました。再確認してください。', 409);
      row.controller.abort(); row.controller = new AbortController(); row.generation = randomUUID(); row.enabled = enabled;
      if (!enabled && row.lastWorkId) await executions.stop(owner, row.lastWorkId, work);
      return view(row);
    },
    async execute(owner, id, value, work, revalidate) {
      const row = get(owner, id); current(row, value.generation);
      if (!UUID.test(value.id) || typeof value.prompt !== 'string') throw new InstallError('依頼を確認してください。', 400);
      row.lastWorkId = value.id;
      return executions.start(owner, { id: value.id, agentId: REFACTOR_AGENT, prompt: value.prompt }, work, async () => { current(row, value.generation); await revalidate(); });
    },
    async check(owner, id, value, requestSignal) {
      const row = get(owner, id); current(row, value.generation);
      if (validating || row.busy) throw new InstallError('この対象の検証中です。', 429);
      const snapshot = codeSnapshot(value.snapshot);
      if (snapshot.target !== row.info.target || snapshot.test !== row.info.test || snapshot.files.length !== 2) throw new InstallError('登録したコードとテストだけを指定してください。', 400);
      row.busy = true; validating = true;
      const signal = requestSignal ? AbortSignal.any([row.controller.signal, requestSignal]) : row.controller.signal;
      try { await installations.execution(owner, REFACTOR_AGENT); current(row, value.generation); signal.throwIfAborted(); const result = await validate({ root, snapshot, signal }); current(row, value.generation); signal.throwIfAborted(); return result; }
      finally { row.busy = false; validating = false; }
    },
    close() { for (const row of rows.values()) { row.enabled = false; row.controller.abort(); } rows.clear(); },
  };
}
export function saveRefactorMiddleware({ manager, port, getOwner, workFor }) {
  return async (request, response, next) => {
    const pathname = request.url?.split('?')[0] || '';
    if (!pathname.startsWith('/__noah/save-refactor')) return next();
    const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(data)); };
    try {
      const match = /^\/__noah\/save-refactor(?:\/([a-f0-9-]{36})(?:\/(start|stop|execute|validate|heartbeat))?)?$/.exec(pathname);
      if (!match) throw new InstallError('運用が見つかりません。', 404);
      const mutation = request.method === 'POST';
      if (!isLocalRuntimeHost(request, port) || request.headers['sec-fetch-site'] === 'cross-site' || (mutation && !isLocalRuntimeRequest(request, port))) throw new InstallError('このMacのNoahから操作してください。', 403);
      if (!['GET', 'POST'].includes(request.method) || (!mutation && match[2]) || (mutation && match[1] && !match[2])) throw new InstallError('対応しない操作です。', 405);
      const owner = await getOwner(request);
      if (!owner.localHostOwner || !/^owner-v1:[a-f0-9]{64}$/.test(owner.ownerScope)) throw new InstallError('本人を確認できません。', 403);
      const scope = owner.ownerScope;
      let result;
      if (!mutation) result = match[1] ? { session: manager.status(scope, match[1]) } : { sessions: manager.list(scope) };
      else {
        if (request.headers['x-rock-owner-scope'] !== scope) throw new InstallError('アカウントが変わりました。', 409);
        if (!request.headers['content-type']?.startsWith('application/json')) throw new InstallError('JSONで操作してください。', 415);
        const chunks = []; let bytes = 0; for await (const chunk of request) { bytes += chunk.length; if (bytes > 100000) throw new InstallError('入力が大きすぎます。', 413); chunks.push(Buffer.from(chunk)); }
        let value; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InstallError('JSONを確認してください。', 400); }
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InstallError('JSONオブジェクトを指定してください。', 400);
        const work = workFor(request, scope);
        if (!match[1]) result = { session: manager.register(scope, value) };
        else if (['start', 'stop', 'heartbeat'].includes(match[2])) {
          if (!value || Object.keys(value).length) throw new InstallError('追加設定は不要です。', 400);
          result = { session: match[2] === 'heartbeat' ? manager.heartbeat(scope, match[1]) : await manager.control(scope, match[1], match[2] === 'start', work) };
        } else if (match[2] === 'validate') {
          const controller = new AbortController(), abort = () => controller.abort();
          response.once('close', abort);
          try { result = { validation: await manager.check(scope, match[1], value, controller.signal) }; }
          finally { response.removeListener('close', abort); }
        }
        else result = await manager.execute(scope, match[1], value, work, async () => { const now = await getOwner(request); if (!now.localHostOwner || now.ownerScope !== scope) throw new InstallError('本人が変わりました。', 403); });
      }
      send(200, { ...result, ownerScope: scope });
    } catch (error) { send(error instanceof InstallError ? error.status : 503, { error: error instanceof InstallError ? error.message : '保存時運用を確認できません。' }); }
  };
}
